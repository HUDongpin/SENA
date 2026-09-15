import { describe, expect, it } from "vitest";
import { senaWorkflowDigest } from "../workflow/canonical";
import {
  projectSenaWorkflowActionReadModel,
  projectSenaWorkflowCommandReadModel,
  projectSenaWorkflowRunReadModel
} from "../workflow/read-model";
import type { SenaWorkflowCommand, SenaWorkflowRun } from "../workflow/types";

describe("SENA workflow API read models", () => {
  it("omits plaintext actor and idempotency values from run and command projections", () => {
    const run = {
      id: "workflow_run_redaction",
      startIdempotencyKey: "private-start-idempotency-key",
      createdByUserId: "private-user-id",
      status: "queued"
    } as unknown as SenaWorkflowRun;
    const command = {
      id: "workflow_command_redaction",
      idempotencyKey: "private-command-idempotency-key",
      claimedBy: "private-worker-id",
      payload: { sourcePointer: "internal-pointer" },
      status: "claimed"
    } as unknown as SenaWorkflowCommand;

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

  it("redacts every run-shaped field in a fork action response", () => {
    const sourceRun = {
      id: "workflow_run_source",
      startIdempotencyKey: "source-private-key",
      createdByUserId: "source-private-user",
      status: "superseded"
    } as unknown as SenaWorkflowRun;
    const forkedRun = {
      id: "workflow_run_forked",
      startIdempotencyKey: "fork-private-key",
      createdByUserId: "fork-private-user",
      status: "queued"
    } as unknown as SenaWorkflowRun;
    const command = {
      id: "workflow_command_fork",
      idempotencyKey: "fork-command-private-key",
      payload: { sourceRunId: sourceRun.id },
      status: "pending"
    } as unknown as SenaWorkflowCommand;

    const projected = projectSenaWorkflowActionReadModel({
      action: "fork",
      created: true,
      run: forkedRun,
      forkedRun,
      sourceRun,
      command
    });
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toContain("source-private-key");
    expect(serialized).not.toContain("source-private-user");
    expect(serialized).not.toContain("fork-private-key");
    expect(serialized).not.toContain("fork-private-user");
    expect(serialized).not.toContain("fork-command-private-key");
    expect(projected).toMatchObject({
      run: { id: forkedRun.id, startIdempotencyKeyHash: expect.any(String) },
      forkedRun: { id: forkedRun.id, createdByUserIdHash: expect.any(String) },
      sourceRun: { id: sourceRun.id, startIdempotencyKeyHash: expect.any(String) },
      command: { id: command.id, payloadExcluded: true }
    });
  });
});
