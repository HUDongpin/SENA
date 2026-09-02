import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import {
  createEvidenceFlowPostgresSaver,
  runEvidenceFlowPostgresCompatibilityProbe
} from "../workflow/langgraph-compatibility";
import {
  senaWorkflowCheckpointBinding,
  senaWorkflowCheckpointExists
} from "../workflow/postgres-runtime";

const postgresUrl = process.env.SENA_WORKFLOW_TEST_POSTGRES_URL;
const describeWithPostgres = postgresUrl ? describe : describe.skip;

describeWithPostgres("SENA EvidenceFlow PostgresSaver integration", () => {
  it("restores two interrupted threads after the worker checkpointer is reopened", async () => {
    const result = await runEvidenceFlowPostgresCompatibilityProbe(postgresUrl!);

    expect(result.interrupted).toHaveLength(2);
    expect(result.interrupted.every((state) => Object.hasOwn(state, "__interrupt__"))).toBe(true);
    expect(result.resumed).toEqual([
      expect.objectContaining({ approved: true, completed: true }),
      expect.objectContaining({ approved: true, completed: true })
    ]);
    expect(result.approvalNodeExecutions).toBe(4);
    expect(result.uniqueReceiptCount).toBe(2);
    expect(result.checkpointCounts.every((count) => count >= 3)).toBe(true);
    expect(result.snapshotValues.every((state) => state.completed === true)).toBe(true);

    const serializedSnapshots = JSON.stringify(result.snapshotValues);
    expect(serializedSnapshots).not.toContain("rawRows");
    expect(serializedSnapshots).not.toContain("providerSecret");
    expect(serializedSnapshots).not.toContain("person@example.com");
  });

  it("validates an exact fork checkpoint against the persisted source thread", async () => {
    const checkpointState = Annotation.Root({
      marker: Annotation<string>,
      runId: Annotation<string>,
      definitionHash: Annotation<string>,
      sourceBindingDigest: Annotation<string>,
      codeSha: Annotation<string>,
      configDigest: Annotation<string>
    });
    const threadId = `workflow-checkpoint-existence-${process.pid}-${Date.now()}`;
    const saver = createEvidenceFlowPostgresSaver(postgresUrl!);
    await saver.setup();
    try {
      const graph = new StateGraph(checkpointState)
        .addNode("finish", () => ({ marker: "checkpoint-safe" }))
        .addEdge(START, "finish")
        .addEdge("finish", END)
        .compile({ checkpointer: saver });
      const config = { configurable: { thread_id: threadId } };
      await graph.invoke({
        marker: "initial",
        runId: threadId,
        definitionHash: "a".repeat(64),
        sourceBindingDigest: "b".repeat(64),
        codeSha: "c".repeat(40),
        configDigest: "d".repeat(64)
      }, config);
      const snapshot = await graph.getState(config);
      const checkpointId = snapshot.config.configurable?.checkpoint_id;
      expect(typeof checkpointId).toBe("string");

      await saver.end();
      expect(await senaWorkflowCheckpointExists({
        runId: threadId,
        checkpointId: checkpointId as string,
        env: { SENA_ENTERPRISE_POSTGRES_URL: postgresUrl }
      })).toBe(true);
      expect(await senaWorkflowCheckpointExists({
        runId: `${threadId}-other-run`,
        checkpointId: checkpointId as string,
        env: { SENA_ENTERPRISE_POSTGRES_URL: postgresUrl }
      })).toBe(false);
      await expect(senaWorkflowCheckpointBinding({
        runId: threadId,
        checkpointId: checkpointId as string,
        env: { SENA_ENTERPRISE_POSTGRES_URL: postgresUrl }
      })).resolves.toEqual(expect.objectContaining({
        checkpointId,
        runId: threadId,
        definitionHash: "a".repeat(64),
        sourceBindingDigest: "b".repeat(64),
        codeSha: "c".repeat(40),
        configDigest: "d".repeat(64),
        stateDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));

      const cleanupSaver = createEvidenceFlowPostgresSaver(postgresUrl!);
      await cleanupSaver.setup();
      await cleanupSaver.deleteThread(threadId);
      await cleanupSaver.end();
    } finally {
      await saver.end().catch(() => undefined);
    }
  });
});
