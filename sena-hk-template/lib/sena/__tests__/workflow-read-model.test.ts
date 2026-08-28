import { describe, expect, it } from "vitest";
import { senaWorkflowDigest } from "../workflow/canonical";
import {
  projectSenaWorkflowCommandReadModel,
  projectSenaWorkflowRunReadModel
} from "../workflow/read-model";

describe("SENA workflow API read models", () => {
  it("omits plaintext actor and idempotency values from run and command projections", () => {
    const run = {
      id: "workflow_run_redaction",
      startIdempotencyKey: "private-start-idempotency-key",
      createdByUserId: "private-user-id",
      status: "queued"
    } as never;
    const command = {
      id: "workflow_command_redaction",
      idempotencyKey: "private-command-idempotency-key",
      claimedBy: "private-worker-id",
      payload: { sourcePointer: "internal-pointer" },
      status: "claimed"
    } as never;

    const safeRun = projectSenaWorkflowRunReadModel(run);
    const safeCommand = projectSenaWorkflowCommandReadModel(command);

    expect(safeRun).not.toHaveProperty("startIdempotencyKey");
    expect(safeRun).not.toHaveProperty("createdByUserId");
    expect(safeRun).toMatchObject({
      startIdempotencyKeyHash: senaWorkflowDigest("private-start-idempotency-key"),
      createdByUserIdHash: senaWorkflowDigest("private-user-id")
    });
    expect(safeCommand).not.toHaveProperty("idempotencyKey");
    expect(safeCommand).not.toHaveProperty("claimedBy");
    expect(safeCommand).not.toHaveProperty("payload");
    expect(safeCommand).toMatchObject({
      idempotencyKeyHash: senaWorkflowDigest("private-command-idempotency-key"),
      workerIdHash: senaWorkflowDigest("private-worker-id")
    });
  });
});
