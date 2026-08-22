import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";

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

describe("enterprise publication current-v2 reliability evidence", () => {
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
      };
      expect(body.claimEvidence?.codingReliability).toBe("ready");
      expect(body.enterpriseProjectEvidence?.sourceSnapshotSha256).toBe(body.sourceSnapshotEvidence?.snapshotSha256);
      expect(body.enterpriseProjectEvidence?.publicationDerivation).toEqual(expect.objectContaining({
        kind: "current-project-reliability-run",
        reliabilityRunId: reliabilityBody.reliabilityRun?.id,
        reliabilityDashboardSchemaVersion: "sena-coding-reliability-dashboard/v2",
        projectVersion: project.currentVersion,
        persistedSourceSnapshotSha256: body.enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256
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
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          projectVersion: project.currentVersion,
          unresolvedDisagreements: 0
        })
      }));
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
        code: "reliability_adjudication_binding_invalid"
      }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, routeTestTimeoutMs);
});
