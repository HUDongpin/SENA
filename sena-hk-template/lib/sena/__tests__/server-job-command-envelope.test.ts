import { describe, expect, it } from "vitest";
import {
  buildSenaServerJobCommandEnvelope,
  parseSenaServerJobCommandEnvelope,
  planSenaServerJobCommandCustody,
  SENA_SERVER_JOB_COMMAND_CUSTODY,
  SENA_SERVER_JOB_COMMAND_ENVELOPE_PROFILE
} from "../server-job-command-envelope";

const payloadSha256 = "a".repeat(64);

describe("SENA server-job encrypted command envelope", () => {
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
