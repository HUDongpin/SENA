import { Command, MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { senaWorkflowDigest } from "../workflow/canonical";
import {
  compileSenaWorkflowGraph,
  initialSenaWorkflowGraphState,
  type SenaWorkflowGraphNodeExecutor
} from "../workflow/graph-runtime";
import { engineeringReleaseGraphV1, researchEvidenceGraphV1 } from "../workflow/definitions";

describe("SENA EvidenceFlow explicit LangGraph runtime", () => {
  it("fans six scientific audits out concurrently, joins all receipt hashes, and replays an interrupt node safely", async () => {
    const executions = new Map<string, number>();
    let concurrentAudits = 0;
    let maxConcurrentAudits = 0;
    let joinPredecessors: string[] = [];
    let governanceCompletedEffects = 0;
    const executor: SenaWorkflowGraphNodeExecutor = {
      async execute(input) {
        executions.set(input.node.id, (executions.get(input.node.id) ?? 0) + 1);
        if (input.node.id === "data-governance-preflight" && !input.resume) {
          return {
            kind: "waiting-human",
            interruptId: "interrupt-governance-1",
            inputDigest: input.inputDigest,
            candidateOutputDigest: "a".repeat(64),
            requiredPermission: "analysis:run"
          };
        }
        if (input.node.id.startsWith("audit-") && input.node.id !== "audit-data-governance") {
          concurrentAudits += 1;
          maxConcurrentAudits = Math.max(maxConcurrentAudits, concurrentAudits);
          await new Promise((resolve) => setTimeout(resolve, 15));
          concurrentAudits -= 1;
        }
        if (input.node.id === "audit-data-governance") {
          concurrentAudits += 1;
          maxConcurrentAudits = Math.max(maxConcurrentAudits, concurrentAudits);
          await new Promise((resolve) => setTimeout(resolve, 15));
          concurrentAudits -= 1;
        }
        if (input.node.id === "scientific-audit-join") {
          joinPredecessors = [...input.predecessorReceiptHashes];
        }
        if (input.node.id === "data-governance-preflight" && input.resume) {
          governanceCompletedEffects += 1;
        }
        return {
          kind: "completed",
          outputDigest: senaWorkflowDigest({ nodeId: input.node.id, inputDigest: input.inputDigest }),
          receiptHash: senaWorkflowDigest({ receipt: input.node.id, inputDigest: input.inputDigest }),
          artifactReferences: [],
          jobReferences: [],
          approvalReferences: input.resume ? ["approval-governance-1"] : []
        };
      }
    };
    const graph = compileSenaWorkflowGraph({
      definition: researchEvidenceGraphV1,
      checkpointer: new MemorySaver(),
      executor
    });
    const initial = initialSenaWorkflowGraphState({
      runId: "research-graph-run-1",
      kind: "research-evidence",
      teamId: "team-graph",
      sourceBindingDigest: "b".repeat(64),
      codeSha: "c".repeat(40),
      configDigest: "d".repeat(64),
      definitionHash: researchEvidenceGraphV1.definitionHash,
      claimBoundary: "exploratory-only"
    });
    const config = { configurable: { thread_id: initial.runId } };

    const interrupted = await graph.invoke(initial, config);
    expect(interrupted.workflowStatus).toBe("running");
    const completed = await graph.invoke(new Command({
      resume: {
        interruptId: "interrupt-governance-1",
        decision: "approve",
        decisionDigest: "e".repeat(64)
      }
    }), config);

    expect(completed.workflowStatus).toBe("succeeded");
    expect(completed.completedNodeIds).toContain("evidence-closeout");
    expect(executions.get("data-governance-preflight")).toBe(3);
    expect(governanceCompletedEffects).toBe(1);
    expect(maxConcurrentAudits).toBeGreaterThan(1);
    expect(joinPredecessors).toHaveLength(6);
    expect(new Set(joinPredecessors).size).toBe(6);
  });

  it("waits for a job terminal receipt without upgrading shadow release evidence layers", async () => {
    let fullGateExecutions = 0;
    let fullGateCompletedEffects = 0;
    const executor: SenaWorkflowGraphNodeExecutor = {
      async execute(input) {
        if (input.node.id === "full-local-gate") {
          fullGateExecutions += 1;
          if (!input.resume) {
            return {
              kind: "waiting-job",
              interruptId: "interrupt-job-1",
              inputDigest: input.inputDigest,
              jobId: "server_job_shadow_1"
            };
          }
          fullGateCompletedEffects += 1;
        }
        return {
          kind: "completed",
          outputDigest: senaWorkflowDigest({ nodeId: input.node.id, resume: input.resume ?? null }),
          receiptHash: senaWorkflowDigest({ receipt: input.node.id, resume: input.resume ?? null }),
          artifactReferences: [],
          jobReferences: input.node.id === "full-local-gate" ? ["server_job_shadow_1"] : [],
          approvalReferences: []
        };
      }
    };
    const graph = compileSenaWorkflowGraph({
      definition: engineeringReleaseGraphV1,
      checkpointer: new MemorySaver(),
      executor
    });
    const initial = initialSenaWorkflowGraphState({
      runId: "engineering-graph-run-1",
      kind: "engineering-release",
      teamId: "team-graph",
      sourceBindingDigest: "1".repeat(64),
      codeSha: "2".repeat(40),
      configDigest: "3".repeat(64),
      definitionHash: engineeringReleaseGraphV1.definitionHash
    });
    const config = { configurable: { thread_id: initial.runId } };
    await graph.invoke(initial, config);
    const completed = await graph.invoke(new Command({
      resume: {
        interruptId: "interrupt-job-1",
        jobId: "server_job_shadow_1",
        status: "succeeded",
        outputDigest: "4".repeat(64)
      }
    }), config);

    expect(completed.workflowStatus).toBe("succeeded");
    expect(fullGateExecutions).toBe(3);
    expect(fullGateCompletedEffects).toBe(1);
    expect(completed.jobReferences).toContain("server_job_shadow_1");
    expect(completed.evidenceLayers).toMatchObject({
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    });
  });
});
