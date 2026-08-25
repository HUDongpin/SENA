import { describe, expect, it } from "vitest";
import {
  admitSenaAnalysisMutationRequest,
  admitSenaExpertReviewMutationRequest,
  admitSenaImportMultipartRequest,
  admitSenaValidationMutationRequest,
  assertSenaImportFormDataContract
} from "../enterprise/heavy-request-admission";

function jsonRequest(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://sena.example.test${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe("heavy SENA route request admission", () => {
  it("rejects validation transport and fan-out before project or model entry", async () => {
    await expect(admitSenaValidationMutationRequest(jsonRequest(
      "/api/sena/validation/group-comparison",
      {},
      { "content-length": String(32 * 1024 * 1024 + 1) }
    ), "POST")).rejects.toMatchObject({
      status: 413,
      code: "validation_request_too_large"
    });

    await expect(admitSenaValidationMutationRequest(jsonRequest(
      "/api/sena/validation/group-comparison",
      {
        comparisons: Array.from({ length: 41 }, (_, index) => ({
          groupA: `a-${index}`,
          groupB: `b-${index}`,
          metric: "socialStrength"
        }))
      }
    ), "POST")).rejects.toMatchObject({
      status: 400,
      code: "validation_request_fields_invalid"
    });
  });

  it("rejects expert-review unknown fields and over-budget narrative text", async () => {
    await expect(admitSenaExpertReviewMutationRequest(jsonRequest(
      "/api/sena/validation/expert-review",
      { projectId: "project_1", secretAccessor: "must-not-be-read" }
    ), "POST")).rejects.toMatchObject({
      status: 400,
      code: "expert_review_request_fields_invalid"
    });

    await expect(admitSenaExpertReviewMutationRequest(jsonRequest(
      "/api/sena/validation/expert-review",
      { projectId: "project_1", limitations: "x".repeat(8_193) }
    ), "POST")).rejects.toMatchObject({
      status: 400,
      code: "expert_review_request_fields_invalid"
    });
  });

  it("keeps analysis source payloads for canonical importers but bounds control metadata", async () => {
    const admitted = await admitSenaAnalysisMutationRequest(jsonRequest("/api/sena/analyze", {
      dataset: { people: [], interactions: [], utterances: [], coded_segments: [], codebook: [] },
      title: "Bounded analysis"
    }));
    expect(admitted.body.title).toBe("Bounded analysis");

    await expect(admitSenaAnalysisMutationRequest(jsonRequest("/api/sena/analyze", {
      dataset: { people: [], interactions: [], utterances: [], coded_segments: [], codebook: [] },
      humanReview: { status: "draft", unsupported: true }
    }))).rejects.toMatchObject({
      status: 400,
      code: "analysis_request_fields_invalid"
    });
  });

  it("preflights import multipart limits and rejects duplicate or unknown form fields", async () => {
    const tooMany = new FormData();
    for (let index = 0; index < 101; index += 1) {
      tooMany.append("files", new File(["a"], `${index}.csv`, { type: "text/csv" }));
    }
    await expect(admitSenaImportMultipartRequest(new Request(
      "https://sena.example.test/api/sena/import",
      { method: "POST", body: tooMany }
    ))).rejects.toMatchObject({
      status: 413,
      code: "import_request_multipart_limits_exceeded"
    });

    const duplicate = new FormData();
    duplicate.append("teamId", "team_1");
    duplicate.append("teamId", "team_2");
    expect(() => assertSenaImportFormDataContract(duplicate)).toThrowError(
      expect.objectContaining({ code: "import_request_fields_invalid" })
    );

    const unknown = new FormData();
    unknown.append("unexpected", "value");
    expect(() => assertSenaImportFormDataContract(unknown)).toThrowError(
      expect.objectContaining({ code: "import_request_fields_invalid" })
    );
  });
});
