import { describe, expect, it } from "vitest";
import { runEvidenceFlowPostgresCompatibilityProbe } from "../workflow/langgraph-compatibility";

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
});
