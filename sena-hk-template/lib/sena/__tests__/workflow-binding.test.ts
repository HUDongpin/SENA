import { describe, expect, it } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { assessSenaWorkflowBinding } from "../workflow/binding";
import { engineeringReleaseGraphV1, researchEvidenceGraphV1 } from "../workflow/definitions";
import type { SenaWorkflowRun } from "../workflow/types";

function run(overrides: Partial<SenaWorkflowRun> = {}): SenaWorkflowRun {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "binding-run-1",
    version: 1,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: researchEvidenceGraphV1.definitionHash,
    mode: "shadow",
    teamId: "team-binding",
    projectId: "project-binding",
    projectRevisionId: "revision-binding-1",
    sourceBindingDigest: "a".repeat(64),
    codeSha: "b".repeat(40),
    configDigest: "c".repeat(64),
    status: "running",
    currentNodeId: "fusion-analysis",
    attempt: 1,
    blockers: [],
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
    claimBoundary: "exploratory-only",
    evidenceLayers: {
      source: "passed",
      local: "running",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: "binding-start",
    startPayloadDigest: "d".repeat(64),
    createdByUserId: "user-binding",
    receiptSequence: 3,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:01.000Z",
    ...overrides
  };
}

describe("SENA EvidenceFlow immutable source binding", () => {
  it("continues only when every authoritative binding still matches", () => {
    const original = run();
    expect(assessSenaWorkflowBinding(original, {
      definitionHash: original.definitionHash,
      projectRevisionId: original.projectRevisionId,
      sourceBindingDigest: original.sourceBindingDigest,
      codeSha: original.codeSha,
      configDigest: original.configDigest
    })).toEqual({
      action: "continue",
      driftFields: [],
      invalidatesExistingReceipts: false
    });
  });

  it("requires a fork and invalidates prior receipts for source, revision, code, config, or definition drift", () => {
    const original = run();
    expect(assessSenaWorkflowBinding(original, {
      definitionHash: engineeringReleaseGraphV1.definitionHash,
      projectRevisionId: "revision-binding-2",
      sourceBindingDigest: "e".repeat(64),
      codeSha: "f".repeat(40),
      configDigest: "1".repeat(64)
    })).toEqual({
      action: "fork-required",
      driftFields: ["codeSha", "configDigest", "definitionHash", "projectRevisionId", "sourceBindingDigest"],
      invalidatesExistingReceipts: true
    });
  });

  it("makes candidate-SHA review evidence inapplicable after an engineering candidate changes", () => {
    const original = run({
      kind: "engineering-release",
      definitionHash: engineeringReleaseGraphV1.definitionHash,
      projectId: undefined,
      projectRevisionId: undefined,
      repo: "HUDongpin/SENA",
      baseSha: "2".repeat(40),
      candidateSha: "3".repeat(40),
      claimBoundary: undefined,
      currentNodeId: "exact-sha-review"
    });
    expect(assessSenaWorkflowBinding(original, {
      definitionHash: original.definitionHash,
      repo: original.repo,
      baseSha: original.baseSha,
      candidateSha: "4".repeat(40),
      sourceBindingDigest: original.sourceBindingDigest,
      codeSha: original.codeSha,
      configDigest: original.configDigest
    })).toEqual({
      action: "fork-required",
      driftFields: ["candidateSha"],
      invalidatesExistingReceipts: true
    });
  });
});
