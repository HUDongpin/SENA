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

const publicationExportRouteTestTimeoutMs = 30_000;

function routeSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Publication Project",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Route test",
      interpretation: "Project-scoped export test.",
      limitations: "Fixture only.",
      nextActions: "Verify projectId export handoff."
    },
    codingReliability: {
      status: "documented",
      reviewer: "Route test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Cohen kappa; Krippendorff alpha",
      agreementValue: "kappa=1; alpha=1",
      adjudicationNotes: "Fixture agreement.",
      limitations: "Fixture only."
    }
  });
}

describe("SENA publication export route", () => {
  it("exports publication packages directly from a persisted projectId", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-route-"));
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

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Publication Exporter",
        email: "publication-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Route Publication Project",
        snapshot: routeSnapshot()
      });

      const route = await import("../../../app/api/sena/exports/publication/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          format: "package"
        })
      }));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/vnd.sena.publication-package+json");
      const body = await response.json() as {
        schemaVersion?: string;
        sourceSnapshotEvidence?: { snapshotSchemaVersion?: string; snapshotTitle?: string };
        enterpriseProjectEvidence?: {
          schemaVersion?: string;
          projectId?: string;
          teamId?: string;
          currentVersion?: number;
          sourceSnapshotSha256?: string;
          reportSha256?: string;
          claimPackage?: {
            schemaVersion?: string;
            status?: string;
            blockers?: number;
            warnings?: number;
            sourceSnapshotSha256?: string;
          };
        };
        manifest?: {
          formats?: string[];
          artifactCount?: number;
          packageSha256?: string;
          reportSha256?: string;
        };
        verificationCertificate?: { status?: string };
      };
      expect(body.schemaVersion).toBe("sena-publication-package/v1");
      expect(body.sourceSnapshotEvidence?.snapshotSchemaVersion).toBe("sena-project-snapshot/v1");
      expect(body.sourceSnapshotEvidence?.snapshotTitle).toBe("Route Publication Project");
      expect(body.enterpriseProjectEvidence).toEqual(expect.objectContaining({
        schemaVersion: "sena-publication-enterprise-project-evidence/v1",
        projectId: project.id,
        teamId: project.teamId,
        currentVersion: project.currentVersion,
        sourceSnapshotSha256: expect.any(String)
      }));
      expect(body.enterpriseProjectEvidence?.sourceSnapshotSha256).toBe((body.sourceSnapshotEvidence as { snapshotSha256?: string })?.snapshotSha256);
      expect(response.headers.get("x-sena-export-source")).toBe("project");
      expect(response.headers.get("x-sena-project-id")).toBe(project.id);
      expect(response.headers.get("x-sena-project-version")).toBe(String(project.currentVersion));
      expect(response.headers.get("x-sena-source-snapshot-sha256")).toBe(body.enterpriseProjectEvidence?.sourceSnapshotSha256);
      expect(response.headers.get("x-sena-report-sha256")).toBe(body.enterpriseProjectEvidence?.reportSha256);
      expect(response.headers.get("x-sena-claim-package-status")).toBe("exploratory-only");
      expect(response.headers.get("x-sena-export-format")).toBe("package");
      expect(response.headers.get("x-sena-export-filename")).toBe("route-publication-project.sena-publication-package.json");
      expect(Number(response.headers.get("x-sena-export-bytes"))).toBeGreaterThan(0);
      expect(response.headers.get("x-sena-export-sha256")).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-publication-package-sha256")).toBe(body.manifest?.packageSha256);
      expect(response.headers.get("x-sena-publication-artifact-count")).toBe(String(body.manifest?.artifactCount));
      expect(response.headers.get("x-sena-publication-formats")).toBe(body.manifest?.formats?.join(","));
      expect(response.headers.get("x-sena-publication-verification-status")).toBe(body.verificationCertificate?.status);
      expect(body.enterpriseProjectEvidence?.claimPackage).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-claim-evidence-package/v1",
        status: "exploratory-only",
        sourceSnapshotSha256: body.enterpriseProjectEvidence?.sourceSnapshotSha256
      }));
      expect(body.manifest?.formats).toContain("pdf");
      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.run",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events[0]).toEqual(expect.objectContaining({
        projectId: project.id,
        teamId: registered.context.teams[0].id
      }));
      expect(audit.events[0].detail).toEqual(expect.objectContaining({
        source: "project",
        format: "package",
        title: "Route Publication Project",
        projectVersion: project.currentVersion,
        sourceSnapshotSha256: body.enterpriseProjectEvidence?.sourceSnapshotSha256
      }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);
});
