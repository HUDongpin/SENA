import { describe, expect, it, vi } from "vitest";
import { senaEnterpriseServerJobKinds } from "../enterprise/server-job-queue";
import { sweepSenaWorkflowServerJobLeases } from "../workflow/server-job-lease-sweeper";

describe("SENA EvidenceFlow server-job lease sweeper", () => {
  it("sweeps every executable transport-independent job kind through the authoritative store", async () => {
    const recover = vi.fn(async () => ({ inspected: 2, requeued: 1, deadLettered: 1 }));

    await expect(sweepSenaWorkflowServerJobLeases({
      observedAt: "2026-08-28T12:00:00.000Z",
      limit: 25,
      recover
    })).resolves.toEqual({ inspected: 2, requeued: 1, deadLettered: 1 });
    expect(recover).toHaveBeenCalledWith({
      kinds: senaEnterpriseServerJobKinds,
      observedAt: "2026-08-28T12:00:00.000Z",
      limit: 25
    });
  });
});
