import { describe, expect, it } from "vitest";
import {
  assertSenaWorkflowCheckpointSafe,
  senaWorkflowCheckpointState
} from "../workflow/checkpoint-policy";

describe("SENA EvidenceFlow checkpoint policy", () => {
  it("accepts references, digests, redacted metadata, and evidence boundaries", () => {
    const state = {
      runId: "run-1",
      sourceBindingDigest: "a".repeat(64),
      objectPointerHash: "b".repeat(64),
      artifactReferences: ["artifact-1"],
      blockers: [{ code: "governance-review-required", retryable: false }],
      claimBoundary: "exploratory-only"
    };
    expect(senaWorkflowCheckpointState(state)).toBe(state);
  });

  it.each([
    { rawRows: [{ participant: "fixture" }] },
    { providerSecret: "test-only-secret-value" },
    { nested: { access_token: "test-only-token-value" } },
    { reviewer: "person@example.com" }
  ])("rejects raw, secret, credential, and direct-identifier state without echoing values", (unsafe) => {
    let message = "";
    try {
      assertSenaWorkflowCheckpointSafe(unsafe);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("SENA workflow checkpoint");
    expect(message).not.toContain("test-only-secret-value");
    expect(message).not.toContain("test-only-token-value");
    expect(message).not.toContain("person@example.com");
  });
});
