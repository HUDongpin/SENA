import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSenaGroupComparisonSuite,
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
} from "../index";

function readySnapshot(codingReliabilityComplete = true) {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Publication authorization fixture",
    generatedAt: "2026-08-26T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Publication authorization reviewer",
      interpretation: "Synthetic exact-evidence authorization fixture.",
      limitations: "Synthetic fixture only.",
      nextActions: "Keep publication authorization fail closed."
    },
    codingReliability: codingReliabilityComplete
      ? reliabilityDashboardToReview(buildSenaReliabilityDashboard([
          { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
          { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
          { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
          { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
        ]), "Publication authorization reviewer")
      : undefined,
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic publication authorization fixture only.",
      retentionPolicy: "Delete generated state after the test.",
      usageConstraints: ["Do not use as participant evidence."],
      dataSteward: "Publication authorization reviewer"
    }
  });
}

function reliabilityInput(project: { id: string; teamId: string; currentVersion: number }) {
  const annotations = [
    { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
  ];
  const dashboard = buildSenaReliabilityDashboard(annotations);
  return {
    teamId: project.teamId,
    projectId: project.id,
    projectVersion: project.currentVersion,
    reviewer: "Publication authorization reviewer",
    fileCount: 1,
    annotationCount: annotations.length,
    annotations,
    skippedCells: [],
    inputFiles: [{ name: "authorization.csv", size: 1, sha256: "a".repeat(64) }],
    dashboard,
    reviewPatch: reliabilityDashboardToReview(dashboard, "Publication authorization reviewer")
  };
}

describe("Round 26 publication claim authorization", () => {
  const originalDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
  const originalSigningSecret = process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
  const originalSigningKeyId = process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
  const cleanupDirs: string[] = [];

  afterEach(() => {
    if (originalDbDir === undefined) delete process.env.SENA_ENTERPRISE_DB_DIR;
    else process.env.SENA_ENTERPRISE_DB_DIR = originalDbDir;
    if (originalSigningSecret === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
    else process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = originalSigningSecret;
    if (originalSigningKeyId === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
    else process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = originalSigningKeyId;
    for (const directory of cleanupDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });

  async function fixture(codingReliabilityComplete = true) {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-authorization-"));
    cleanupDirs.push(enterpriseDbDir);
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET =
      "8c53de6a907f4c21b8a63d34e1429af8812f1f04a06b70c6d619e8a4812cbb79";
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "publication-authorization-v1";
    vi.resetModules();
    const enterprise = await import("../enterprise");
    const publicationState = await import("../enterprise/publication-state-binding");
    const registered = enterprise.registerEnterpriseUser({
      name: "Publication Authorization PI",
      email: `publication-authorization-${cleanupDirs.length}@example.edu`,
      password: "sena-secure-123",
      organization: "Publication Authorization Lab",
      plan: "lab"
    });
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Publication authorization fixture",
      snapshot: readySnapshot(codingReliabilityComplete)
    });
    const reliability = enterprise.createEnterpriseReliabilityRun(
      registered.context,
      reliabilityInput(project)
    );
    enterprise.reviewEnterpriseReliabilityRun(registered.context, reliability.id, {
      status: "approved",
      notes: "Approved current machine-eligible reliability evidence."
    });
    return { enterprise, publicationState, registered, project };
  }

  function authorize(
    enterprise: typeof import("../enterprise"),
    context: Awaited<ReturnType<typeof fixture>>["registered"]["context"],
    project: Awaited<ReturnType<typeof fixture>>["project"]
  ) {
    const validation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Publication authorization preregistration fixture.",
      methodNote: "Holm-corrected current-v2 validation with exact source evidence.",
      parityEvidence: {
        walkthroughDatasetLabel: "publication authorization walkthrough",
        walkthroughDatasetHash: "c".repeat(64),
        studySpecificInferenceReference: "prereg:publication-authorization-v1"
      },
      result: buildSenaGroupComparisonSuite({
        dataset: lessonStudySenaContract,
        defaultGroupField: "role",
        comparisons: [
          { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
          { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" }
        ],
        iterations: 100,
        bootstrapIterations: 100,
        alpha: 0.05
      })
    });
    const approvedValidation = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "approved",
      notes: "Approved exact current-v2 validation evidence."
    });
    const expert = enterprise.createEnterpriseExpertReview(context, {
      projectId: project.id,
      target: { kind: "validation-run", id: approvedValidation.id },
      reviewerName: "Publication Authorization Expert",
      reviewerRole: "Domain expert",
      expertiseArea: "Lesson study",
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      strengths: "Exact evidence chain is traceable.",
      concerns: "Synthetic fixture only.",
      recommendations: "Keep claim scope limited.",
      limitations: "No participant data."
    });
    return { approvedValidation, expert };
  }

  it("rejects publication when the claim package is exploratory despite approved reliability", async () => {
    const { publicationState, registered, project } = await fixture();

    await expect(publicationState.resolveEnterprisePublicationStateBundle(
      registered.context,
      project.id
    )).rejects.toMatchObject({
      status: 409,
      code: "publication_claim_evidence_not_ready"
    });
  });

  it("binds a complete claim-ready validation and expert authorization chain", async () => {
    const { enterprise, publicationState, registered, project } = await fixture();
    const { approvedValidation, expert } = authorize(enterprise, registered.context, project);

    const resolved = await publicationState.resolveEnterprisePublicationStateBundle(
      registered.context,
      project.id
    );

    expect(resolved.claimPackage.status).toBe("claim-ready-with-limits");
    expect(resolved.claimPackage.blockers).toEqual([]);
    expect(resolved.stateBinding).toMatchObject({
      validationRun: {
        runId: approvedValidation.id,
        status: "approved",
        validationRunEvidenceHash: approvedValidation.validationRunEvidenceHash
      },
      expertReview: {
        reviewId: expert.id,
        status: "approved",
        claimScope: "claim-ready-with-limits",
        targetValidationRunId: approvedValidation.id,
        targetValidationRunEvidenceHash: approvedValidation.validationRunEvidenceHash,
        receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    });
  });

  it("uses an export-only reliability projection without persisting the derived snapshot", async () => {
    const { enterprise, publicationState, registered, project } = await fixture(false);
    authorize(enterprise, registered.context, project);
    const before = enterprise.readEnterpriseDb();
    const beforeProject = before.projects.find((candidate) => candidate.id === project.id);
    const beforeRevision = before.projectRevisions.find((candidate) => (
      candidate.projectId === project.id && candidate.version === project.currentVersion
    ));
    expect(beforeProject).toBeDefined();
    expect(beforeRevision).toBeDefined();

    const resolved = await publicationState.resolveEnterprisePublicationStateBundle(
      registered.context,
      project.id
    );
    const after = enterprise.readEnterpriseDb();
    const afterProject = after.projects.find((candidate) => candidate.id === project.id);
    const afterRevision = after.projectRevisions.find((candidate) => (
      candidate.projectId === project.id && candidate.version === project.currentVersion
    ));

    expect(resolved.claimPackage.status).toBe("claim-ready-with-limits");
    expect(resolved.claimPackage.claimReadinessEvidence).toMatchObject({
      kind: "current-project-reliability-run",
      reliabilityRunId: resolved.reliabilityRun?.id,
      snapshotSha256: resolved.stateBinding.claimPackage.claimReadinessSnapshotSha256
    });
    expect(resolved.claimPackage.claimReadinessEvidence.snapshotSha256)
      .toBe(createHash("sha256").update(JSON.stringify(resolved.publicationSnapshot)).digest("hex"));
    expect(resolved.claimPackage.claimReadinessEvidence.snapshotSha256)
      .not.toBe(resolved.claimPackage.sourceSnapshotEvidence.snapshotSha256);
    expect(afterProject?.currentVersion).toBe(beforeProject?.currentVersion);
    expect(afterProject?.snapshot).toEqual(beforeProject?.snapshot);
    expect(afterRevision?.snapshot).toEqual(beforeRevision?.snapshot);
  });
});
