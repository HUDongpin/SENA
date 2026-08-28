import {
  Annotation,
  type BaseCheckpointSaver,
  END,
  START,
  StateGraph,
  interrupt
} from "@langchain/langgraph";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowCheckpointState } from "./checkpoint-policy";
import { senaWorkflowDigest } from "./canonical";
import { senaWorkflowDefinition } from "./definitions";
import type {
  SenaClaimBoundary,
  SenaEvidenceLayer,
  SenaWorkflowBlocker,
  SenaWorkflowDefinitionManifest,
  SenaWorkflowKind,
  SenaWorkflowNodeManifest,
  SenaWorkflowRunStatus
} from "./types";

type EvidenceLayerState = Record<SenaEvidenceLayer, "not-run" | "running" | "passed" | "failed" | "blocked">;

function mergeUniqueStrings(left: string[], right: string[]) {
  return [...new Set([...left, ...right])];
}

function mergeStringRecords(left: Record<string, string>, right: Record<string, string>) {
  return { ...left, ...right };
}

function mergeEvidenceLayers(left: EvidenceLayerState, right: EvidenceLayerState) {
  return { ...left, ...right };
}

const SenaWorkflowGraphStateAnnotation = Annotation.Root({
  runId: Annotation<string>,
  kind: Annotation<SenaWorkflowKind>,
  teamId: Annotation<string>,
  definitionHash: Annotation<string>,
  sourceBindingDigest: Annotation<string>,
  codeSha: Annotation<string>,
  configDigest: Annotation<string>,
  workflowStatus: Annotation<SenaWorkflowRunStatus>,
  claimBoundary: Annotation<SenaClaimBoundary | undefined>,
  evidenceLayers: Annotation<EvidenceLayerState>({
    reducer: mergeEvidenceLayers,
    default: () => ({
      source: "not-run",
      local: "not-run",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    })
  }),
  completedNodeIds: Annotation<string[]>({ reducer: mergeUniqueStrings, default: () => [] }),
  nodeReceiptHashes: Annotation<Record<string, string>>({ reducer: mergeStringRecords, default: () => ({}) }),
  nodeOutputDigests: Annotation<Record<string, string>>({ reducer: mergeStringRecords, default: () => ({}) }),
  artifactReferences: Annotation<string[]>({ reducer: mergeUniqueStrings, default: () => [] }),
  jobReferences: Annotation<string[]>({ reducer: mergeUniqueStrings, default: () => [] }),
  approvalReferences: Annotation<string[]>({ reducer: mergeUniqueStrings, default: () => [] }),
  blockers: Annotation<SenaWorkflowBlocker[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  })
});

export type SenaWorkflowGraphState = typeof SenaWorkflowGraphStateAnnotation.State;

export type SenaWorkflowGraphResume = Record<string, unknown>;

export type SenaWorkflowGraphNodeResult =
  | {
      kind: "completed";
      outputDigest: string;
      receiptHash: string;
      artifactReferences: string[];
      jobReferences: string[];
      approvalReferences: string[];
      evidenceLayers?: Partial<EvidenceLayerState>;
      claimBoundary?: SenaClaimBoundary;
    }
  | {
      kind: "waiting-human";
      interruptId: string;
      inputDigest: string;
      candidateOutputDigest: string;
      requiredPermission: string;
    }
  | {
      kind: "waiting-job";
      interruptId: string;
      inputDigest: string;
      jobId: string;
    }
  | {
      kind: "blocked";
      interruptId: string;
      inputDigest: string;
      blocker: SenaWorkflowBlocker;
    };

export type SenaWorkflowGraphNodeExecutor = {
  execute(input: {
    state: SenaWorkflowGraphState;
    node: SenaWorkflowNodeManifest;
    inputDigest: string;
    predecessorReceiptHashes: string[];
    resume?: SenaWorkflowGraphResume;
  }): Promise<SenaWorkflowGraphNodeResult>;
};

export function initialSenaWorkflowGraphState(input: {
  runId: string;
  kind: SenaWorkflowKind;
  teamId: string;
  definitionHash: string;
  sourceBindingDigest: string;
  codeSha: string;
  configDigest: string;
  claimBoundary?: SenaClaimBoundary;
}): SenaWorkflowGraphState {
  const definition = senaWorkflowDefinition(input.kind);
  if (input.definitionHash !== definition.definitionHash) {
    throw new Error("SENA workflow definition hash does not match the fixed graph manifest.");
  }
  return senaWorkflowCheckpointState({
    ...input,
    workflowStatus: "running" as const,
    claimBoundary: input.kind === "research-evidence"
      ? input.claimBoundary ?? "exploratory-only"
      : undefined,
    evidenceLayers: {
      source: "not-run" as const,
      local: "not-run" as const,
      ci: "not-run" as const,
      merged: "not-run" as const,
      deployed: "not-run" as const,
      live: "not-run" as const
    },
    completedNodeIds: [],
    nodeReceiptHashes: {},
    nodeOutputDigests: {},
    artifactReferences: [],
    jobReferences: [],
    approvalReferences: [],
    blockers: []
  });
}

function interruptPayload(result: Exclude<SenaWorkflowGraphNodeResult, { kind: "completed" }>, node: SenaWorkflowNodeManifest) {
  if (result.kind === "waiting-human") {
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowApprovalRequest,
      kind: result.kind,
      nodeId: node.id,
      interruptId: result.interruptId,
      inputDigest: result.inputDigest,
      candidateOutputDigest: result.candidateOutputDigest,
      requiredPermission: result.requiredPermission
    };
  }
  if (result.kind === "waiting-job") {
    return {
      kind: "sena-workflow-job-wait",
      nodeId: node.id,
      interruptId: result.interruptId,
      inputDigest: result.inputDigest,
      jobId: result.jobId
    };
  }
  return {
    kind: "sena-workflow-blocked",
    nodeId: node.id,
    interruptId: result.interruptId,
    inputDigest: result.inputDigest,
    blocker: result.blocker
  };
}

function predecessorIds(definition: SenaWorkflowDefinitionManifest, nodeId: string) {
  return definition.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
}

function nodeHandler(
  definition: SenaWorkflowDefinitionManifest,
  node: SenaWorkflowNodeManifest,
  executor: SenaWorkflowGraphNodeExecutor
) {
  return async (state: SenaWorkflowGraphState) => {
    const predecessors = predecessorIds(definition, node.id);
    const predecessorReceiptHashes = predecessors.map((id) => state.nodeReceiptHashes[id]).filter(Boolean);
    if (predecessorReceiptHashes.length !== predecessors.length) {
      throw new Error(`SENA workflow node ${node.id} is missing predecessor receipt evidence.`);
    }
    const inputDigest = senaWorkflowDigest({
      runId: state.runId,
      nodeId: node.id,
      definitionHash: state.definitionHash,
      sourceBindingDigest: state.sourceBindingDigest,
      codeSha: state.codeSha,
      configDigest: state.configDigest,
      predecessorReceiptHashes
    });
    let result = await executor.execute({
      state,
      node,
      inputDigest,
      predecessorReceiptHashes
    });
    while (result.kind !== "completed") {
      const resume = interrupt(senaWorkflowCheckpointState(interruptPayload(result, node))) as SenaWorkflowGraphResume;
      senaWorkflowCheckpointState(resume);
      result = await executor.execute({
        state,
        node,
        inputDigest,
        predecessorReceiptHashes,
        resume
      });
    }
    return senaWorkflowCheckpointState({
      ...(node.id === "evidence-closeout" ? { workflowStatus: "succeeded" as const } : {}),
      ...(result.claimBoundary ? { claimBoundary: result.claimBoundary } : {}),
      ...(result.evidenceLayers ? { evidenceLayers: result.evidenceLayers } : {}),
      completedNodeIds: [node.id],
      nodeReceiptHashes: { [node.id]: result.receiptHash },
      nodeOutputDigests: { [node.id]: result.outputDigest },
      artifactReferences: result.artifactReferences,
      jobReferences: result.jobReferences,
      approvalReferences: result.approvalReferences
    });
  };
}

export function compileSenaWorkflowGraph(input: {
  definition: SenaWorkflowDefinitionManifest;
  checkpointer: BaseCheckpointSaver;
  executor: SenaWorkflowGraphNodeExecutor;
}) {
  const fixedDefinition = senaWorkflowDefinition(input.definition.kind);
  if (input.definition.definitionHash !== fixedDefinition.definitionHash) {
    throw new Error("SENA workflow graph compilation rejected a non-canonical definition.");
  }

  type CompiledGraph = {
    invoke(
      value: unknown,
      config: { configurable: { thread_id: string } }
    ): Promise<SenaWorkflowGraphState & { __interrupt__?: Array<{ id: string; value: Record<string, unknown> }> }>;
    getState(config: { configurable: { thread_id: string } }): Promise<{
      values: Partial<SenaWorkflowGraphState>;
      next: string[];
      tasks: Array<{
        interrupts?: Array<{ id: string; value: Record<string, unknown> }>;
      }>;
    }>;
  };
  type DynamicGraphBuilder = {
    addNode(name: string, handler: (state: SenaWorkflowGraphState) => Promise<Record<string, unknown>>): DynamicGraphBuilder;
    addEdge(from: string | string[], to: string): DynamicGraphBuilder;
    compile(options: { checkpointer: BaseCheckpointSaver }): CompiledGraph;
  };
  const graph = new StateGraph(SenaWorkflowGraphStateAnnotation) as unknown as DynamicGraphBuilder;
  for (const node of input.definition.nodes) {
    graph.addNode(node.id, nodeHandler(input.definition, node, input.executor));
  }

  const roots = input.definition.nodes.filter((node) => predecessorIds(input.definition, node.id).length === 0);
  for (const root of roots) graph.addEdge(START, root.id);
  for (const node of input.definition.nodes) {
    const predecessors = predecessorIds(input.definition, node.id);
    if (predecessors.length === 1) graph.addEdge(predecessors[0], node.id);
    if (predecessors.length > 1) graph.addEdge(predecessors, node.id);
    const hasSuccessor = input.definition.edges.some((edge) => edge.from === node.id);
    if (!hasSuccessor) graph.addEdge(node.id, END);
  }
  return graph.compile({ checkpointer: input.checkpointer });
}
