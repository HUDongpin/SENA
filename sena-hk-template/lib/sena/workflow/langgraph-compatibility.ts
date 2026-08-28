import {
  Annotation,
  BaseCheckpointSaver,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "./canonical";
import { senaWorkflowCheckpointState } from "./checkpoint-policy";

const CompatibilityState = Annotation.Root({
  runId: Annotation<string>,
  sourceBindingDigest: Annotation<string>,
  objectPointerHash: Annotation<string>,
  inputDigest: Annotation<string>,
  approved: Annotation<boolean | undefined>,
  completed: Annotation<boolean>
});

export function createEvidenceFlowPostgresSaver(connectionString: string) {
  return PostgresSaver.fromConnString(connectionString, { schema: "sena_langgraph" });
}

type CompatibilityTracker = {
  approvalNodeExecutions: number;
  receiptKeys: Set<string>;
};

function compileCompatibilityGraph(checkpointer: BaseCheckpointSaver, tracker: CompatibilityTracker) {
  return new StateGraph(CompatibilityState)
    .addNode("bind", (state) => ({
      inputDigest: senaWorkflowDigest({
        runId: state.runId,
        sourceBindingDigest: state.sourceBindingDigest,
        objectPointerHash: state.objectPointerHash
      }),
      completed: false
    }))
    .addNode("approval", (state) => {
      tracker.approvalNodeExecutions += 1;
      const receiptKey = `${state.runId}:approval:${state.inputDigest}`;
      tracker.receiptKeys.add(receiptKey);
      const decision = interrupt({
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowApprovalRequest,
        runId: state.runId,
        nodeId: "approval",
        inputDigest: state.inputDigest
      }) as { approved: boolean; decisionDigest: string };
      return { approved: decision.approved };
    })
    .addNode("complete", () => ({ completed: true }))
    .addEdge(START, "bind")
    .addEdge("bind", "approval")
    .addEdge("approval", "complete")
    .addEdge("complete", END)
    .compile({ checkpointer });
}

async function collectCheckpointCount(
  graph: ReturnType<typeof compileCompatibilityGraph>,
  config: { configurable: { thread_id: string } }
) {
  let count = 0;
  for await (const _checkpoint of graph.getStateHistory(config)) count += 1;
  return count;
}

function compatibilityInput(runId: string) {
  return senaWorkflowCheckpointState({
    runId,
    sourceBindingDigest: "a".repeat(64),
    objectPointerHash: "b".repeat(64),
    inputDigest: "",
    approved: undefined,
    completed: false
  });
}

export async function runEvidenceFlowLangGraphCompatibilityProbe() {
  const checkpointer = new MemorySaver();
  const tracker: CompatibilityTracker = { approvalNodeExecutions: 0, receiptKeys: new Set() };
  const graph = compileCompatibilityGraph(checkpointer, tracker);

  const runId = "compatibility-run";
  const config = { configurable: { thread_id: runId } };
  const interrupted = await graph.invoke(compatibilityInput(runId), config);
  const resumed = await graph.invoke(new Command({
    resume: { approved: true, decisionDigest: "c".repeat(64) }
  }), config);
  const checkpointCount = await collectCheckpointCount(graph, config);

  return {
    interrupted,
    resumed,
    approvalNodeExecutions: tracker.approvalNodeExecutions,
    uniqueReceiptCount: tracker.receiptKeys.size,
    checkpointCount,
    threadId: runId
  };
}

export async function runEvidenceFlowPostgresCompatibilityProbe(connectionString: string) {
  const tracker: CompatibilityTracker = { approvalNodeExecutions: 0, receiptKeys: new Set() };
  const runIds = ["postgres-compatibility-a", "postgres-compatibility-b"];
  const configs = runIds.map((threadId) => ({ configurable: { thread_id: threadId } }));

  const firstSaver = createEvidenceFlowPostgresSaver(connectionString);
  await firstSaver.setup();
  const firstGraph = compileCompatibilityGraph(firstSaver, tracker);
  const interrupted = await Promise.all(
    runIds.map((runId, index) => firstGraph.invoke(compatibilityInput(runId), configs[index]))
  );
  await firstSaver.end();

  const resumedSaver = createEvidenceFlowPostgresSaver(connectionString);
  await resumedSaver.setup();
  const resumedGraph = compileCompatibilityGraph(resumedSaver, tracker);
  const resumed = await Promise.all(
    configs.map((config) => resumedGraph.invoke(new Command({
      resume: { approved: true, decisionDigest: "c".repeat(64) }
    }), config))
  );
  const checkpointCounts = await Promise.all(
    configs.map((config) => collectCheckpointCount(resumedGraph, config))
  );
  const snapshots = await Promise.all(configs.map((config) => resumedGraph.getState(config)));
  await Promise.all(runIds.map((runId) => resumedSaver.deleteThread(runId)));
  await resumedSaver.end();

  return {
    interrupted,
    resumed,
    checkpointCounts,
    snapshotValues: snapshots.map((snapshot) => snapshot.values),
    approvalNodeExecutions: tracker.approvalNodeExecutions,
    uniqueReceiptCount: tracker.receiptKeys.size,
    threadIds: runIds
  };
}
