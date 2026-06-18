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

const reliabilityRouteTestTimeoutMs = 30_000;

function reliabilityRouteSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Reliability Project",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route reliability test",
      interpretation: "Reliability route provenance test.",
      limitations: "Fixture only.",
      nextActions: "Attach reliability route headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route reliability test",
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

describe("SENA reliability route", () => {
  it("creates a persisted reliability run from JSON annotations with run-level provenance headers", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-route-"));
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
    vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Reliability Reviewer",
        email: "reliability-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Reliability Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Route Reliability Project",
        snapshot: reliabilityRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/reliability/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: project.teamId,
          projectId: project.id,
          reviewer: "Route Reliability Reviewer",
          sourceName: "route-reliability.json",
          annotations: [
            { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
            { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
            { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
            { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" },
            { coder_id: "c1", item_id: "u2", code_id: "Explanation", value: "1" },
            { coder_id: "c2", item_id: "u2", code_id: "Explanation", value: "0" }
          ]
        })
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as {
        schemaVersion?: string;
        requestSchemaVersion?: string;
        dashboard?: {
          schemaVersion?: string;
          disagreementCount?: number;
          meanPairwiseKappa?: number;
          krippendorffAlphaNominal?: number;
        };
        reliabilityRun?: {
          id?: string;
          status?: string;
          projectId?: string;
          adjudicationCoverage?: { coverageRate?: number; unresolvedDisagreements?: number };
        };
      };
      expect(body.schemaVersion).toBe("sena-reliability-response/v1");
      expect(body.requestSchemaVersion).toBe("sena-reliability-json-request/v1");
      expect(body.dashboard?.schemaVersion).toBe("sena-coding-reliability-dashboard/v1");
      expect(body.dashboard?.disagreementCount).toBe(2);
      expect(body.reliabilityRun?.projectId).toBe(project.id);
      expect(body.reliabilityRun?.status).toBe("pending-adjudication");
      expect(response.headers.get("x-sena-reliability-run-id")).toBe(body.reliabilityRun?.id);
      expect(response.headers.get("x-sena-reliability-status")).toBe(body.reliabilityRun?.status);
      expect(response.headers.get("x-sena-project-id")).toBe(project.id);
      expect(response.headers.get("x-sena-reliability-coverage-rate")).toBe(String(body.reliabilityRun?.adjudicationCoverage?.coverageRate));
      expect(response.headers.get("x-sena-unresolved-disagreements")).toBe(String(body.reliabilityRun?.adjudicationCoverage?.unresolvedDisagreements));
      expect(response.headers.get("x-sena-mean-pairwise-kappa")).toBe(String(body.dashboard?.meanPairwiseKappa));
      expect(response.headers.get("x-sena-krippendorff-alpha")).toBe(String(body.dashboard?.krippendorffAlphaNominal));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, reliabilityRouteTestTimeoutMs);
});
