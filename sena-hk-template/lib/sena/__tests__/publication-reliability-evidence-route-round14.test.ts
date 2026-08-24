import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
} from "../index";
import {
  deriveSenaReliabilityClaimEligibility,
  isSemanticallyValidSenaReliabilityMachineEvidence
} from "../reliability";
import {
  buildSenaPublicationExport,
  type SenaPublicationEnterpriseProjectEvidence
} from "../publication-export";

const routeTestTimeoutMs = 30_000;

function publicationCandidateSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Current v2 Reliability Publication Project",
    generatedAt: "2026-08-22T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Publication route reviewer",
      interpretation: "Project-bound reliability publication route fixture.",
      limitations: "Synthetic fixture only.",
      nextActions: "Verify current v2 machine evidence before publication."
    },
    codingReliability: {
      status: "documented",
      reviewer: "Publication route reviewer",
      reviewedAt: "2026-08-22T00:00:00.000Z",
      codingScheme: "Lesson-study fixture codebook",
      unitOfCoding: "utterance-code binary cell",
      coderCount: 2,
      agreementMetric: "Mean pairwise Cohen kappa and Krippendorff alpha nominal",
      agreementValue: "Pending machine calculation",
      adjudicationNotes: "No machine dashboard has been attached.",
      limitations: "Synthetic fixture only."
    },
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic route fixture only.",
      retentionPolicy: "Delete generated route fixture state after the test run.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Publication route reviewer"
    }
  });
}

function perfectAuthoritativeAnnotations(snapshot: ReturnType<typeof publicationCandidateSnapshot>) {
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  const itemIds = source.utterances.slice(0, 3).map((utterance) => utterance.id);
  const codeIds = source.codebook.slice(0, 3).map((code) => code.id);
  if (itemIds.length < 3 || codeIds.length < 3) throw new Error("Publication reliability fixture requires three items and codes.");
  return itemIds.flatMap((itemId, index) => ["coder-a", "coder-b"].map((coderId) => ({
    coder_id: coderId,
    item_id: itemId,
    code_id: codeIds[index],
    value: "1"
  })));
}

function unresolvedAuthoritativeAnnotations(snapshot: ReturnType<typeof publicationCandidateSnapshot>) {
  return perfectAuthoritativeAnnotations(snapshot).map((annotation, index) => (
    index === 1 ? { ...annotation, value: "0" } : annotation
  ));
}

function balancedAdjudicableAnnotations(snapshot: ReturnType<typeof publicationCandidateSnapshot>) {
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  const units = source.utterances.flatMap((utterance) => (
    source.codebook.map((code) => ({ itemId: utterance.id, codeId: code.id }))
  )).slice(0, 20);
  if (units.length < 20) throw new Error("Publication adjudication fixture requires twenty item-code units.");
  return units.flatMap((unit, unitIndex) => ["coder-a", "coder-b"].map((coderId, coderIndex) => {
    const canonicalValue = unitIndex % 2 === 0;
    const value = unitIndex === 0 && coderIndex === 1 ? !canonicalValue : canonicalValue;
    return {
      coder_id: coderId,
      item_id: unit.itemId,
      code_id: unit.codeId,
      value: value ? "1" : "0"
    };
  }));
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function persistedReadyPublicationSnapshot() {
  const sourceSnapshot = publicationCandidateSnapshot();
  const dashboard = buildSenaReliabilityDashboard(
    perfectAuthoritativeAnnotations(sourceSnapshot).map((annotation) => ({
      coderId: annotation.coder_id,
      itemId: annotation.item_id,
      codeId: annotation.code_id,
      value: annotation.value === "1"
    }))
  );
  return buildSenaProjectSnapshot(
    buildSenaModel(sourceSnapshot.dataset, sourceSnapshot.reproducibility.buildOptions),
    {
      title: "Persisted Ready Reliability Publication Project",
      generatedAt: sourceSnapshot.generatedAt,
      sourceDataset: sourceSnapshot.source.sourceDataset ?? sourceSnapshot.dataset,
      humanReview: sourceSnapshot.report.humanReview,
      codingReliability: reliabilityDashboardToReview(dashboard, "Persisted ready snapshot reviewer"),
      dataGovernance: sourceSnapshot.dataGovernance ?? sourceSnapshot.report.dataGovernance
    }
  );
}

describe("enterprise publication current-v2 reliability evidence", () => {
  it("publishes a statistically eligible run after real adjudication without rewriting its raw disagreement evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-live-adjudication-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/publication-export", async () => await import("../publication-export"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));
    vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Live Adjudication Publication Reviewer",
        email: "live-adjudication-publication-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Live Adjudication Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const snapshot = publicationCandidateSnapshot();
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Live adjudication publication project",
        snapshot
      });
      const reliabilityRoute = await import("../../../app/api/sena/reliability/route");
      const publicationRoute = await import("../../../app/api/sena/exports/publication/route");
      const reliabilityResponse = await reliabilityRoute.POST(new Request(
        "https://sena.example.test/api/sena/reliability",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({
            schemaVersion: "sena-reliability-json-request/v1",
            teamId: project.teamId,
            projectId: project.id,
            reviewer: "Selected live-adjudication reviewer",
            annotations: balancedAdjudicableAnnotations(snapshot)
          })
        }
      ));
      expect(reliabilityResponse.status).toBe(200);
      const reliabilityBody = await reliabilityResponse.json() as {
        reliabilityRun?: { id?: string };
        dashboard?: {
          disagreementCount?: number;
          meanPairwiseKappa?: number | null;
          krippendorffAlphaNominal?: number | null;
          claimEligibility?: { eligible?: boolean; blockers?: string[] };
        };
      };
      const runId = reliabilityBody.reliabilityRun?.id;
      if (!runId) throw new Error("Expected a reliability run for the live adjudication fixture.");
      expect(reliabilityBody.dashboard).toEqual(expect.objectContaining({
        disagreementCount: 1,
        meanPairwiseKappa: expect.any(Number),
        krippendorffAlphaNominal: expect.any(Number),
        claimEligibility: expect.objectContaining({
          eligible: false,
          blockers: ["unresolved-reliability-disagreements"]
        })
      }));
      expect(reliabilityBody.dashboard?.meanPairwiseKappa).toBeGreaterThanOrEqual(0.8);
      expect(reliabilityBody.dashboard?.krippendorffAlphaNominal).toBeGreaterThanOrEqual(0.8);

      const rawBefore = enterprise.readEnterpriseDb().reliabilityRuns.find((run) => run.id === runId);
      if (!rawBefore) throw new Error("Expected persisted raw reliability evidence before adjudication.");
      const rawHashesBefore = {
        dashboard: sha256Json(rawBefore.dashboard),
        queue: sha256Json(rawBefore.dashboard.adjudicationQueue),
        reviewPatch: sha256Json(rawBefore.reviewPatch)
      };
      expect(rawBefore.reviewPatch.machineEvidence?.unresolvedDisagreementCount).toBe(1);

      const adjudicated = await reliabilityRoute.PATCH(new Request(
        "https://sena.example.test/api/sena/reliability",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({ action: "adjudicate", runId, decision: "include" })
        }
      ));
      expect(adjudicated.status).toBe(201);
      const adjudicatedBody = await adjudicated.json() as {
        adjudication?: {
          reliabilityRun?: {
            adjudicationCoverage?: {
              schemaVersion: "sena-reliability-adjudication-coverage/v1";
              queuedDisagreements: number;
              resolvedDisagreements: number;
              unresolvedDisagreements: number;
              coverageRate: number;
              decisions: { include: number; exclude: number; revise: number };
              updatedAt: string;
            };
          };
        };
      };
      expect(adjudicatedBody).toEqual(expect.objectContaining({
        adjudication: expect.objectContaining({
          reliabilityRun: expect.objectContaining({
            adjudicationCoverage: expect.objectContaining({
              queuedDisagreements: 1,
              resolvedDisagreements: 1,
              unresolvedDisagreements: 0,
              coverageRate: 1
            })
          })
        })
      }));
      const coverage = adjudicatedBody.adjudication?.reliabilityRun?.adjudicationCoverage;
      if (!coverage || !rawBefore.reviewPatch.machineEvidence) {
        throw new Error("Expected raw machine evidence and live adjudication coverage.");
      }
      const projectedMachineEvidence = structuredClone(rawBefore.reviewPatch.machineEvidence) as
        typeof rawBefore.reviewPatch.machineEvidence & { adjudicationCoverage?: typeof coverage };
      projectedMachineEvidence.adjudicationCoverage = coverage;
      projectedMachineEvidence.unresolvedDisagreementCount = coverage.unresolvedDisagreements;
      projectedMachineEvidence.claimEligibilityInputs.unresolvedDisagreementCount = coverage.unresolvedDisagreements;
      projectedMachineEvidence.claimEligibility = deriveSenaReliabilityClaimEligibility(
        projectedMachineEvidence.claimEligibilityInputs
      );
      expect(isSemanticallyValidSenaReliabilityMachineEvidence(projectedMachineEvidence)).toBe(true);
      for (const forgedCoverage of [
        { ...coverage, queuedDisagreements: 2 },
        { ...coverage, resolvedDisagreements: 0 },
        { ...coverage, decisions: { include: 0, exclude: 0, revise: 0 } },
        { ...coverage, coverageRate: 0.5 }
      ]) {
        const forgedEvidence = structuredClone(projectedMachineEvidence);
        forgedEvidence.adjudicationCoverage = forgedCoverage;
        expect(isSemanticallyValidSenaReliabilityMachineEvidence(forgedEvidence)).toBe(false);
      }

      const approval = await reliabilityRoute.PATCH(new Request(
        "https://sena.example.test/api/sena/reliability",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({
            runId,
            status: "approved",
            notes: "Approved after the canonical disagreement received a real adjudication record."
          })
        }
      ));
      expect(approval.status).toBe(200);

      const exported = await publicationRoute.POST(new Request(
        "https://sena.example.test/api/sena/exports/publication",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({ projectId: project.id, format: "package" })
        }
      ));
      expect(exported.status).toBe(200);
      expect(exported.headers.get("x-sena-publication-reliability-run-id")).toBe(runId);
      const exportBody = await exported.json() as {
        claimEvidence?: { codingReliability?: string };
        artifacts?: Array<{ format?: string; bodyBase64?: string }>;
        enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence;
      };
      expect(exportBody.claimEvidence?.codingReliability).toBe("ready");
      expect(exportBody.enterpriseProjectEvidence?.stateBinding?.reliabilityRun).toEqual(expect.objectContaining({
        runId,
        unresolvedDisagreements: 0
      }));
      const htmlArtifact = exportBody.artifacts?.find((artifact) => artifact.format === "html");
      const html = Buffer.from(htmlArtifact?.bodyBase64 ?? "", "base64").toString("utf8");
      expect(html).toContain("Selected live-adjudication reviewer");
      expect(html).toContain("1 queued, 1 resolved, 0 unresolved");

      const rawAfter = enterprise.readEnterpriseDb().reliabilityRuns.find((run) => run.id === runId);
      if (!rawAfter) throw new Error("Expected persisted raw reliability evidence after publication.");
      expect({
        dashboard: sha256Json(rawAfter.dashboard),
        queue: sha256Json(rawAfter.dashboard.adjudicationQueue),
        reviewPatch: sha256Json(rawAfter.reviewPatch)
      }).toEqual(rawHashesBefore);
      expect(rawAfter.reviewPatch.machineEvidence?.unresolvedDisagreementCount).toBe(1);

      const enterpriseEvidence = exportBody.enterpriseProjectEvidence;
      if (!enterpriseEvidence || !projectedMachineEvidence.adjudicationCoverage) {
        throw new Error("Expected enterprise publication evidence and projected adjudication coverage.");
      }
      const mismatchedMachineEvidence = structuredClone(projectedMachineEvidence);
      const originalProjectedCoverage = mismatchedMachineEvidence.adjudicationCoverage;
      if (!originalProjectedCoverage) throw new Error("Expected cloned adjudication coverage.");
      mismatchedMachineEvidence.adjudicationCoverage = {
        ...originalProjectedCoverage,
        decisions: { include: 0, exclude: 1, revise: 0 }
      };
      expect(isSemanticallyValidSenaReliabilityMachineEvidence(mismatchedMachineEvidence)).toBe(true);
      const mismatchedSnapshot = buildSenaProjectSnapshot(
        buildSenaModel(snapshot.dataset, snapshot.reproducibility.buildOptions),
        {
          title: snapshot.title,
          generatedAt: snapshot.generatedAt,
          sourceDataset: snapshot.source.sourceDataset ?? snapshot.dataset,
          activeTemporalWindow: snapshot.source.activeTemporalWindow,
          temporalRuntimeTrace: snapshot.analysis.temporalRuntimeTrace,
          demoVerificationManualReviews: snapshot.workspaceState?.demoVerificationManualReviews,
          humanReview: snapshot.report.humanReview,
          codingReliability: {
            ...rawBefore.reviewPatch,
            adjudicationNotes: "A different but internally valid decision distribution was paired by mistake.",
            machineEvidence: mismatchedMachineEvidence
          },
          dataGovernance: snapshot.dataGovernance ?? snapshot.report.dataGovernance
        }
      );
      expect(mismatchedSnapshot.report.modelCard.renderGate.status).toBe("ready");
      await expect(buildSenaPublicationExport(mismatchedSnapshot, "html", enterpriseEvidence))
        .rejects.toMatchObject({
          status: 409,
          code: "publication_derivation_manifest_binding_invalid"
        });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 45_000);

  it("requires an eligible approved run even for a persisted-ready project and binds the rendered derivation to that run", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-ready-project-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/publication-export", async () => await import("../publication-export"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));
    vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Ready Project Publication Reviewer",
        email: "ready-project-publication-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Ready Project Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const snapshot = persistedReadyPublicationSnapshot();
      expect(snapshot.report.modelCard.renderGate.status).toBe("ready");
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: snapshot.title,
        snapshot
      });
      const publicationRoute = await import("../../../app/api/sena/exports/publication/route");
      const projectRequest = () => new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({ projectId: project.id, format: "package" })
      });

      const missingRun = await publicationRoute.POST(projectRequest());
      expect(missingRun.status).toBe(409);
      await expect(missingRun.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_model_card_blocked"
      }));

      const directSnapshot = await publicationRoute.POST(new Request(
        "https://sena.example.test/api/sena/exports/publication",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({ snapshot, format: "html" })
        }
      ));
      expect(directSnapshot.status).toBe(200);
      expect(directSnapshot.headers.get("x-sena-export-source")).toBe("snapshot");
      expect(directSnapshot.headers.get("x-sena-publication-reliability-run-id")).toBeNull();

      const reliabilityRoute = await import("../../../app/api/sena/reliability/route");
      const reliability = await reliabilityRoute.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: project.teamId,
          projectId: project.id,
          reviewer: "Selected enterprise reliability run reviewer",
          annotations: perfectAuthoritativeAnnotations(snapshot)
        })
      }));
      expect(reliability.status).toBe(200);
      const reliabilityBody = await reliability.json() as {
        reliabilityRun?: { id?: string };
        dashboard?: { claimEligibility?: { eligible?: boolean } };
      };
      expect(reliabilityBody.dashboard?.claimEligibility?.eligible).toBe(true);
      const approval = await reliabilityRoute.PATCH(new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          runId: reliabilityBody.reliabilityRun?.id,
          status: "approved",
          notes: "Approved current project evidence for publication derivation."
        })
      }));
      expect(approval.status).toBe(200);

      const exported = await publicationRoute.POST(projectRequest());
      expect(exported.status).toBe(200);
      const body = await exported.json() as {
        artifacts?: Array<{ format?: string; bodyBase64?: string }>;
        enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence;
        derivationManifest?: {
          derivationKind?: string;
          enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence;
        };
      };
      const evidence = body.enterpriseProjectEvidence;
      if (!evidence?.stateBinding.reliabilityRun || !evidence.publicationDerivation) {
        throw new Error("Expected selected reliability derivation evidence in the publication package.");
      }
      const selectedRunId = reliabilityBody.reliabilityRun?.id;
      expect(evidence.stateBinding.reliabilityRun.runId).toBe(selectedRunId);
      expect(evidence.stateBinding.claimPackage.reliabilityRunId).toBe(selectedRunId);
      expect(evidence.publicationDerivation).toEqual(expect.objectContaining({
        reliabilityRunId: selectedRunId,
        reliabilityRunSha256: evidence.stateBinding.reliabilityRun.sha256
      }));
      expect(body.derivationManifest).toEqual(expect.objectContaining({
        derivationKind: "current-project-reliability-run",
        enterpriseProjectEvidence: expect.objectContaining({
          publicationDerivation: expect.objectContaining({
            reliabilityRunId: selectedRunId,
            reliabilityRunSha256: evidence.stateBinding.reliabilityRun.sha256
          })
        })
      }));
      expect(exported.headers.get("x-sena-publication-reliability-run-id")).toBe(selectedRunId);
      const htmlArtifact = body.artifacts?.find((artifact) => artifact.format === "html");
      const html = Buffer.from(htmlArtifact?.bodyBase64 ?? "", "base64").toString("utf8");
      expect(html).toContain("Selected enterprise reliability run reviewer");
      expect(html).not.toContain("Persisted ready snapshot reviewer");

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.run",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events[0]?.detail).toEqual(expect.objectContaining({
        reliabilityRunId: selectedRunId
      }));

      const selectedRun = enterprise.readEnterpriseDb().reliabilityRuns.find((run) => run.id === selectedRunId);
      if (!selectedRun) throw new Error("Expected the selected enterprise reliability run.");
      const derivedSnapshot = buildSenaProjectSnapshot(
        buildSenaModel(snapshot.dataset, snapshot.reproducibility.buildOptions),
        {
          title: snapshot.title,
          generatedAt: snapshot.generatedAt,
          sourceDataset: snapshot.source.sourceDataset ?? snapshot.dataset,
          activeTemporalWindow: snapshot.source.activeTemporalWindow,
          temporalRuntimeTrace: snapshot.analysis.temporalRuntimeTrace,
          demoVerificationManualReviews: snapshot.workspaceState?.demoVerificationManualReviews,
          humanReview: snapshot.report.humanReview,
          codingReliability: selectedRun.reviewPatch,
          dataGovernance: snapshot.dataGovernance ?? snapshot.report.dataGovernance
        }
      );
      const missingDerivation = structuredClone(evidence) as SenaPublicationEnterpriseProjectEvidence;
      delete missingDerivation.publicationDerivation;
      await expect(buildSenaPublicationExport(derivedSnapshot, "html", missingDerivation))
        .rejects.toMatchObject({
          status: 409,
          code: "publication_derivation_manifest_binding_invalid"
        });

      const mismatchedRunHash = structuredClone(evidence) as SenaPublicationEnterpriseProjectEvidence;
      Object.assign(mismatchedRunHash.publicationDerivation ?? {}, {
        reliabilityRunSha256: "0".repeat(64)
      });
      await expect(buildSenaPublicationExport(derivedSnapshot, "html", mismatchedRunHash))
        .rejects.toMatchObject({
          status: 409,
          code: "publication_derivation_manifest_binding_invalid"
        });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 45_000);

  it("uses only approved, current, fully adjudicated evidence without elevating viewer reliability access", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-reliability-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/publication-export", async () => await import("../publication-export"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));
    vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Current v2 Publication Reviewer",
        email: "current-v2-publication-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Current v2 Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const snapshot = publicationCandidateSnapshot();
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: snapshot.title,
        snapshot
      });
      const publicationRoute = await import("../../../app/api/sena/exports/publication/route");
      const publicationRequest = () => new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({ projectId: project.id, format: "package" })
      });

      const blocked = await publicationRoute.POST(publicationRequest());
      expect(blocked.status).toBe(409);
      await expect(blocked.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_model_card_blocked"
      }));

      const reliabilityRoute = await import("../../../app/api/sena/reliability/route");
      const reliability = await reliabilityRoute.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: project.teamId,
          projectId: project.id,
          reviewer: "Current v2 Publication Reviewer",
          annotations: perfectAuthoritativeAnnotations(snapshot)
        })
      }));
      expect(reliability.status).toBe(200);
      const reliabilityBody = await reliability.json() as {
        reliabilityRun?: { id?: string; projectBinding?: { projectVersion?: number } };
        dashboard?: { schemaVersion?: string; claimEligibility?: { eligible?: boolean } };
      };
      expect(reliabilityBody.dashboard).toEqual(expect.objectContaining({
        schemaVersion: "sena-coding-reliability-dashboard/v2",
        claimEligibility: expect.objectContaining({ eligible: true })
      }));
      expect(reliabilityBody.reliabilityRun?.projectBinding?.projectVersion).toBe(project.currentVersion);

      const pendingReview = await publicationRoute.POST(publicationRequest());
      expect(pendingReview.status).toBe(409);
      await expect(pendingReview.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_model_card_blocked"
      }));

      const approval = await reliabilityRoute.PATCH(new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          runId: reliabilityBody.reliabilityRun?.id,
          status: "approved",
          notes: "Approved for the current project revision after reliability review."
        })
      }));
      expect(approval.status).toBe(200);
      await expect(approval.json()).resolves.toEqual(expect.objectContaining({
        reliabilityRun: expect.objectContaining({ status: "approved" })
      }));

      const exported = await publicationRoute.POST(publicationRequest());
      expect(exported.status).toBe(200);
      const body = await exported.json() as {
        sourceSnapshotEvidence?: { snapshotSha256?: string };
        enterpriseProjectEvidence?: {
          sourceSnapshotSha256?: string;
          stateBinding?: {
            schemaVersion?: string;
            activePrimary?: string;
            stateRevision?: string;
            stateRevisionSha256?: string;
            bindingSha256?: string;
            project?: {
              projectId?: string;
              projectVersion?: number;
              persistedSnapshotSha256?: string;
              readProjectionSnapshotSha256?: string;
            };
            claimPackage?: {
              sha256?: string;
              projectVersion?: number;
              sourceSnapshotSha256?: string;
              reliabilityRunId?: string | null;
            };
            reliabilityRun?: {
              runId?: string;
              status?: string;
              sha256?: string;
              projectVersion?: number;
              unresolvedDisagreements?: number;
            } | null;
          };
          publicationDerivation?: {
            kind?: string;
            reliabilityRunId?: string;
            reliabilityDashboardSchemaVersion?: string;
            projectVersion?: number;
            persistedSourceSnapshotSha256?: string;
          };
          claimPackage?: { sourceSnapshotSha256?: string };
        };
        claimEvidence?: { codingReliability?: string };
        derivationManifest?: {
          schemaVersion?: string;
          sourceKind?: string;
          derivationKind?: string;
          manifestSha256?: string;
          hashBoundaries?: {
            persistedSnapshotSha256?: string;
            readProjectionSnapshotSha256?: string;
            publicationSnapshotSha256?: string;
          };
          enterpriseProjectEvidence?: { stateBinding?: { bindingSha256?: string } };
        };
      };
      expect(body.claimEvidence?.codingReliability).toBe("ready");
      expect(body.enterpriseProjectEvidence?.sourceSnapshotSha256).toBe(body.sourceSnapshotEvidence?.snapshotSha256);
      expect(body.enterpriseProjectEvidence?.publicationDerivation).toEqual(expect.objectContaining({
        kind: "current-project-reliability-run",
        reliabilityRunId: reliabilityBody.reliabilityRun?.id,
        reliabilityDashboardSchemaVersion: "sena-coding-reliability-dashboard/v2",
        projectVersion: project.currentVersion,
        persistedSourceSnapshotSha256: body.enterpriseProjectEvidence?.stateBinding?.project?.persistedSnapshotSha256
      }));
      expect(body.enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256)
        .not.toBe(body.sourceSnapshotEvidence?.snapshotSha256);
      expect(body.enterpriseProjectEvidence?.stateBinding).toEqual(expect.objectContaining({
        schemaVersion: "sena-publication-state-binding/v1",
        activePrimary: "file",
        stateRevision: expect.any(String),
        stateRevisionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        project: expect.objectContaining({
          projectId: project.id,
          projectVersion: project.currentVersion,
          persistedSnapshotSha256: body.enterpriseProjectEvidence?.publicationDerivation?.persistedSourceSnapshotSha256,
          readProjectionSnapshotSha256: body.enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256
        }),
        claimPackage: expect.objectContaining({
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          projectVersion: project.currentVersion,
          sourceSnapshotSha256: body.enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256,
          reliabilityRunId: reliabilityBody.reliabilityRun?.id
        }),
        reliabilityRun: expect.objectContaining({
          runId: reliabilityBody.reliabilityRun?.id,
          status: "approved",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          projectVersion: project.currentVersion,
          unresolvedDisagreements: 0
        })
      }));
      expect(body.derivationManifest).toEqual(expect.objectContaining({
        schemaVersion: "sena-publication-derivation-manifest/v1",
        sourceKind: "enterprise-project",
        derivationKind: "current-project-reliability-run",
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        hashBoundaries: expect.objectContaining({
          persistedSnapshotSha256: body.enterpriseProjectEvidence?.stateBinding?.project?.persistedSnapshotSha256,
          readProjectionSnapshotSha256: body.enterpriseProjectEvidence?.stateBinding?.project?.readProjectionSnapshotSha256,
          publicationSnapshotSha256: body.sourceSnapshotEvidence?.snapshotSha256
        }),
        enterpriseProjectEvidence: expect.objectContaining({
          stateBinding: expect.objectContaining({
            bindingSha256: body.enterpriseProjectEvidence?.stateBinding?.bindingSha256
          })
        })
      }));
      expect(exported.headers.get("x-sena-publication-derivation-manifest-sha256"))
        .toBe(body.derivationManifest?.manifestSha256);
      expect(exported.headers.get("x-sena-persisted-source-snapshot-sha256"))
        .toBe(body.derivationManifest?.hashBoundaries?.persistedSnapshotSha256);
      expect(exported.headers.get("x-sena-read-projection-source-snapshot-sha256"))
        .toBe(body.derivationManifest?.hashBoundaries?.readProjectionSnapshotSha256);
      expect(exported.headers.get("x-sena-source-snapshot-sha256"))
        .toBe(body.derivationManifest?.hashBoundaries?.publicationSnapshotSha256);
      expect(enterprise.getEnterpriseProject(registered.context, project.id).currentVersion).toBe(project.currentVersion);

      const viewerEmail = "current-v2-publication-viewer@example.edu";
      const invitation = enterprise.createEnterpriseInvitation(registered.context, {
        teamId: project.teamId,
        email: viewerEmail,
        role: "viewer"
      });
      const viewer = enterprise.registerEnterpriseUser({
        name: "Current v2 Publication Viewer",
        email: viewerEmail,
        password: "sena-secure-456",
        organization: "Current v2 Publication Viewer Lab",
        plan: "individual"
      });
      const accepted = enterprise.acceptEnterpriseInvitation(viewer.context, {
        inviteCode: invitation.inviteCode
      });
      sessionToken = viewer.token;
      const viewerCsrf = enterprise.createEnterpriseCsrfToken(accepted.context);
      const viewerReliabilityList = await reliabilityRoute.GET(new Request(
        `https://sena.example.test/api/sena/reliability?projectId=${encodeURIComponent(project.id)}`
      ));
      expect(viewerReliabilityList.status).toBe(403);
      const viewerExported = await publicationRoute.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": viewerCsrf.token
        },
        body: JSON.stringify({ projectId: project.id, format: "package" })
      }));
      expect(viewerExported.status).toBe(200);
      expect(viewerExported.headers.get("x-sena-publication-reliability-run-id"))
        .toBe(reliabilityBody.reliabilityRun?.id);

      sessionToken = registered.token;
      const unresolvedResponse = await reliabilityRoute.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: project.teamId,
          projectId: project.id,
          reviewer: "Unresolved publication reviewer",
          annotations: unresolvedAuthoritativeAnnotations(snapshot)
        })
      }));
      expect(unresolvedResponse.status).toBe(200);
      const unresolvedBody = await unresolvedResponse.json() as {
        reliabilityRun?: { id?: string; adjudicationCoverage?: { unresolvedDisagreements?: number } };
      };
      expect(unresolvedBody.reliabilityRun?.adjudicationCoverage?.unresolvedDisagreements).toBe(1);

      const db = enterprise.readEnterpriseDb();
      const approvedRun = db.reliabilityRuns.find((run) => run.id === reliabilityBody.reliabilityRun?.id);
      const unresolvedRun = db.reliabilityRuns.find((run) => run.id === unresolvedBody.reliabilityRun?.id);
      if (!approvedRun || !unresolvedRun) throw new Error("Expected both publication reliability fixtures in enterprise state.");
      approvedRun.status = "rejected";
      unresolvedRun.status = "approved";
      unresolvedRun.reviewPatch = structuredClone(approvedRun.reviewPatch);
      unresolvedRun.createdAt = "2026-08-22T23:59:59.000Z";
      unresolvedRun.adjudicationCoverage.resolvedDisagreements = unresolvedRun.adjudicationCoverage.queuedDisagreements;
      unresolvedRun.adjudicationCoverage.unresolvedDisagreements = 0;
      unresolvedRun.adjudicationCoverage.coverageRate = 1;
      expect(unresolvedRun.adjudicationCoverage).toEqual(expect.objectContaining({
        coverageRate: 1,
        unresolvedDisagreements: 0
      }));
      expect(db.adjudications.filter((record) => record.reliabilityRunId === unresolvedRun.id)).toHaveLength(0);
      enterprise.writeEnterpriseDb(db);

      const unresolvedPublication = await publicationRoute.POST(publicationRequest());
      expect(unresolvedPublication.status).toBe(409);
      await expect(unresolvedPublication.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_model_card_blocked"
      }));

      const completedAdjudication = enterprise.createEnterpriseReliabilityAdjudications(
        registered.context,
        unresolvedRun.id,
        { decision: "include" }
      );
      expect(completedAdjudication.reliabilityRun.adjudicationCoverage.unresolvedDisagreements).toBe(0);

      const fingerprintDb = enterprise.readEnterpriseDb();
      const fingerprintRun = fingerprintDb.reliabilityRuns.find((run) => run.id === unresolvedRun.id);
      if (!fingerprintRun?.projectBinding || !fingerprintRun.dashboard.projectBinding) {
        throw new Error("Expected current project bindings for the fingerprint mismatch fixture.");
      }
      const originalRunBinding = structuredClone(fingerprintRun.projectBinding);
      const originalDashboardBinding = structuredClone(fingerprintRun.dashboard.projectBinding);
      const mismatchedFingerprint = originalRunBinding.snapshotFingerprint === "0x00000000"
        ? "0x00000001"
        : "0x00000000";
      fingerprintRun.projectBinding.snapshotFingerprint = mismatchedFingerprint;
      fingerprintRun.dashboard.projectBinding.snapshotFingerprint = mismatchedFingerprint;
      enterprise.writeEnterpriseDb(fingerprintDb);

      const reliabilityRuns = await import("../enterprise/reliability-runs");
      await expect(reliabilityRuns.findEnterprisePublicationReliabilityRunAsync(registered.context, project))
        .rejects.toMatchObject({
          status: 409,
          code: "reliability_adjudication_binding_invalid"
        });
      const fingerprintPublication = await publicationRoute.POST(publicationRequest());
      expect(fingerprintPublication.status).toBe(409);
      expect(fingerprintPublication.headers.get("x-sena-publication-reliability-run-id")).toBeNull();
      await expect(fingerprintPublication.json()).resolves.toEqual(expect.objectContaining({
        code: "reliability_adjudication_binding_invalid"
      }));

      fingerprintRun.projectBinding = originalRunBinding;
      fingerprintRun.dashboard.projectBinding = originalDashboardBinding;
      enterprise.writeEnterpriseDb(fingerprintDb);

      const updatedProject = enterprise.updateEnterpriseProject(registered.context, project.id, {
        snapshot,
        expectedVersion: project.currentVersion
      });
      expect(updatedProject.currentVersion).toBe(project.currentVersion + 1);

      const stalePublication = await publicationRoute.POST(publicationRequest());
      expect(stalePublication.status).toBe(409);
      expect(stalePublication.headers.get("x-sena-publication-reliability-run-id")).toBeNull();
      await expect(stalePublication.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_model_card_blocked"
      }));

      const currentReliability = await reliabilityRoute.POST(new Request(
        "https://sena.example.test/api/sena/reliability",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({
            schemaVersion: "sena-reliability-json-request/v1",
            teamId: updatedProject.teamId,
            projectId: updatedProject.id,
            reviewer: "Current revision replacement reviewer",
            annotations: perfectAuthoritativeAnnotations(snapshot)
          })
        }
      ));
      expect(currentReliability.status).toBe(200);
      const currentReliabilityBody = await currentReliability.json() as {
        reliabilityRun?: { id?: string; projectBinding?: { projectVersion?: number } };
      };
      expect(currentReliabilityBody.reliabilityRun?.projectBinding?.projectVersion)
        .toBe(updatedProject.currentVersion);
      const currentApproval = await reliabilityRoute.PATCH(new Request(
        "https://sena.example.test/api/sena/reliability",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({
            runId: currentReliabilityBody.reliabilityRun?.id,
            status: "approved",
            notes: "Approved replacement evidence for the current project revision."
          })
        }
      ));
      expect(currentApproval.status).toBe(200);

      const currentPublication = await publicationRoute.POST(publicationRequest());
      expect(currentPublication.status).toBe(200);
      expect(currentPublication.headers.get("x-sena-publication-reliability-run-id"))
        .toBe(currentReliabilityBody.reliabilityRun?.id);
      const currentPublicationBody = await currentPublication.json() as {
        enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence;
      };
      expect(currentPublicationBody.enterpriseProjectEvidence?.stateBinding).toEqual(expect.objectContaining({
        project: expect.objectContaining({ projectVersion: updatedProject.currentVersion }),
        reliabilityRun: expect.objectContaining({
          runId: currentReliabilityBody.reliabilityRun?.id,
          projectVersion: updatedProject.currentVersion
        })
      }));
      expect(enterprise.readEnterpriseDb().reliabilityRuns.map((run) => run.id)).toEqual(expect.arrayContaining([
        unresolvedRun.id,
        currentReliabilityBody.reliabilityRun?.id
      ]));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, routeTestTimeoutMs);
});
