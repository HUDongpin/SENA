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

const analysisRouteTestTimeoutMs = 30_000;

function analysisRouteSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Analysis Source",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route analysis test",
      interpretation: "Analysis route provenance test.",
      limitations: "Fixture only.",
      nextActions: "Attach analysis route headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route analysis test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
      agreementValue: "pending",
      adjudicationNotes: "Pending route test evidence.",
      limitations: "Fixture only."
    }
  });
}

describe("SENA analyze route", () => {
  it("persists an analysis run with project and artifact provenance headers", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-route-"));
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
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Analysis Reviewer",
        email: "analysis-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Analysis Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);

      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId: registered.context.teams[0].id,
          title: "Route Persisted Analysis",
          description: "Created by the analysis route test.",
          snapshot: analysisRouteSnapshot(),
          persist: true,
          includeRuntimeBundle: true
        })
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as {
        schemaVersion?: string;
        enterpriseAnalysisRun?: {
          id?: string;
          sourceKind?: string;
          persistedProjectId?: string;
          artifactFingerprints?: {
            reportSha256?: string;
            projectSnapshotSha256?: string;
            runtimeBundleSha256?: string;
          };
        };
        persistedProject?: {
          id?: string;
          currentVersion?: number;
        };
      };
      expect(body.schemaVersion).toBe("sena-analysis-run/v1");
      expect(body.enterpriseAnalysisRun?.sourceKind).toBe("snapshot");
      expect(body.enterpriseAnalysisRun?.persistedProjectId).toBe(body.persistedProject?.id);
      expect(body.enterpriseAnalysisRun?.artifactFingerprints?.reportSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.enterpriseAnalysisRun?.artifactFingerprints?.projectSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.enterpriseAnalysisRun?.artifactFingerprints?.runtimeBundleSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-analysis-run-id")).toBe(body.enterpriseAnalysisRun?.id);
      expect(response.headers.get("x-sena-analysis-source-kind")).toBe("snapshot");
      expect(response.headers.get("x-sena-project-id")).toBe(body.persistedProject?.id);
      expect(response.headers.get("x-sena-project-version")).toBe(String(body.persistedProject?.currentVersion));
      expect(response.headers.get("x-sena-report-sha256")).toBe(body.enterpriseAnalysisRun?.artifactFingerprints?.reportSha256);
      expect(response.headers.get("x-sena-project-snapshot-sha256")).toBe(body.enterpriseAnalysisRun?.artifactFingerprints?.projectSnapshotSha256);
      expect(response.headers.get("x-sena-runtime-bundle-sha256")).toBe(body.enterpriseAnalysisRun?.artifactFingerprints?.runtimeBundleSha256);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);
});
