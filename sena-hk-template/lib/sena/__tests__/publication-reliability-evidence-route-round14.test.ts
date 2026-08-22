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

describe("enterprise publication current-v2 reliability evidence", () => {
  it("returns 409 without machine evidence and 200 after a real current project-bound v2 dashboard", async () => {
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

      const exported = await publicationRoute.POST(publicationRequest());
      expect(exported.status).toBe(200);
      const body = await exported.json() as {
        sourceSnapshotEvidence?: { snapshotSha256?: string };
        enterpriseProjectEvidence?: {
          sourceSnapshotSha256?: string;
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
      expect(enterprise.getEnterpriseProject(registered.context, project.id).currentVersion).toBe(project.currentVersion);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, routeTestTimeoutMs);
});
