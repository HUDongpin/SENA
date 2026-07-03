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

function claimRouteSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Claim Package Project",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route test",
      interpretation: "Claim package route provenance test.",
      limitations: "Fixture only.",
      nextActions: "Attach claim package provenance headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Cohen kappa; Krippendorff alpha",
      agreementValue: "pending",
      adjudicationNotes: "Pending route test evidence.",
      limitations: "Fixture only."
    }
  });
}

describe("SENA claim package route", () => {
  it("returns project-scoped provenance headers with the claim evidence package", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-claim-package-route-"));
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

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Claim Package Reviewer",
        email: "claim-package-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Claim Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Route Claim Package Project",
        snapshot: claimRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/validation/claim-package/route");
      const response = await route.GET(new Request(`https://sena.example.test/api/sena/validation/claim-package?projectId=${encodeURIComponent(project.id)}`));

      expect(response.status).toBe(200);
      const body = await response.json() as {
        schemaVersion?: string;
        status?: string;
        project?: { id?: string; currentVersion?: number };
        sourceSnapshotEvidence?: {
          snapshotSha256?: string;
          reportSha256?: string;
          revisionMatchesCurrentVersion?: boolean;
        };
      };
      expect(body.schemaVersion).toBe("sena-enterprise-claim-evidence-package/v1");
      expect(body.project?.id).toBe(project.id);
      expect(body.status).toBe("exploratory-only");
      expect(body.sourceSnapshotEvidence?.revisionMatchesCurrentVersion).toBe(true);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-validation-claim-package");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-claim-package-status")).toBe(body.status);
      expect(response.headers.get("x-sena-project-id")).toBe(project.id);
      expect(response.headers.get("x-sena-project-version")).toBe(String(body.project?.currentVersion));
      expect(response.headers.get("x-sena-source-snapshot-sha256")).toBe(body.sourceSnapshotEvidence?.snapshotSha256);
      expect(response.headers.get("x-sena-report-sha256")).toBe(body.sourceSnapshotEvidence?.reportSha256);
      expect(response.headers.get("x-sena-claim-evidence-adjudication-source")).toBe("file-json");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
