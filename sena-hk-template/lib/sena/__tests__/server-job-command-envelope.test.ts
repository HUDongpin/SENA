import { describe, expect, it } from "vitest";
import {
  bindSenaServerJobIdempotency,
  buildSenaServerJobCommandEnvelope,
  parseSenaServerJobCommandEnvelope,
  planSenaServerJobCommandCustody,
  SENA_SERVER_JOB_COMMAND_CUSTODY,
  SENA_SERVER_JOB_COMMAND_ENVELOPE_PROFILE
} from "../server-job-command-envelope";

const payloadSha256 = "a".repeat(64);

describe("SENA server-job encrypted command envelope", () => {
  it("derives stable scoped job and command-envelope ids from Idempotency-Key", () => {
    const request = new Request("https://sena.example.test/api/sena/validation/group-comparison", {
      method: "POST",
      headers: { "idempotency-key": "validation-attempt-1" }
    });
    const first = bindSenaServerJobIdempotency({
      request,
      kind: "validation",
      teamId: "team_1",
      actorUserId: "user_1",
      projectId: "project_1"
    });
    const repeated = bindSenaServerJobIdempotency({
      request,
      kind: "validation",
      teamId: "team_1",
      actorUserId: "user_1",
      projectId: "project_1"
    });
    expect(repeated).toEqual(first);
    expect(first.jobId).toMatch(/^server_job_[a-f0-9]{24}$/);
    expect(first.commandEnvelopeUploadId).toMatch(/^upload_[a-f0-9]{24}$/);
    expect(bindSenaServerJobIdempotency({
      request: new Request(request.url, { headers: { "idempotency-key": "validation-attempt-2" } }),
      kind: "validation",
      teamId: "team_1",
      actorUserId: "user_1",
      projectId: "project_1"
    }).jobId).not.toBe(first.jobId);
    expect(() => bindSenaServerJobIdempotency({
      request: new Request(request.url),
      kind: "validation",
      teamId: "team_1",
      actorUserId: "user_1",
      projectId: "project_1"
    })).toThrow(expect.objectContaining({ code: "server_job_idempotency_key_required" }));
  });

  it("keeps validation/publication values in an encrypted upload envelope while receipts retain only pointer hashes", () => {
    const payload = {
      action: "run-validation",
      teamId: "team_1",
      projectId: "project_1",
      projectVersion: 3,
      groupA: "private-label-a",
      groupB: "private-label-b"
    };
    const planned = planSenaServerJobCommandCustody({
      kind: "validation",
      teamId: "team_1",
      projectId: "project_1",
      actorUserId: "user_1",
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: 3,
        comparisonCount: 1,
        validationMethod: "group-comparison",
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true as const
      }
    }, "upload_aaaaaaaaaaaaaaaaaaaaaaaa", payloadSha256);

    expect(planned.jobInput.payloadSummary).toMatchObject({
      commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY,
      commandEnvelopeUploadId: "upload_aaaaaaaaaaaaaaaaaaaaaaaa",
      commandEnvelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(planned.jobInput.payloadSummary)).not.toContain("private-label");
    expect(planned.file.importProfile).toBe(SENA_SERVER_JOB_COMMAND_ENVELOPE_PROFILE);
    expect(parseSenaServerJobCommandEnvelope(planned.file.bytes)).toEqual({
      kind: "validation",
      payloadSha256,
      payload
    });
  });

  it("binds the job kind and rejects malformed identifiers or digests", () => {
    expect(() => planSenaServerJobCommandCustody({
      kind: "publication-export",
      teamId: "team_1",
      projectId: "project_1",
      actorUserId: "user_1",
      payload: { action: "run-publication-export" },
      payloadSummary: {
        source: "project",
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true as const
      }
    }, "not-an-upload", payloadSha256)).toThrow(/reservation/i);
    expect(() => buildSenaServerJobCommandEnvelope(
      "validation",
      { action: "run-validation" },
      "bad-digest"
    )).toThrow(/hash/i);

    const valid = buildSenaServerJobCommandEnvelope(
      "publication-export",
      { action: "run-publication-export" },
      payloadSha256
    );
    const parsed = JSON.parse(valid.bytes.toString("utf8"));
    parsed.kind = "analysis";
    expect(() => parseSenaServerJobCommandEnvelope(Buffer.from(JSON.stringify(parsed)))).toThrow(/kind/i);
  });
});
