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

const validationRouteTestTimeoutMs = 30_000;

function validationRouteSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Validation Project",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route validation test",
      interpretation: "Validation route provenance test.",
      limitations: "Fixture only.",
      nextActions: "Attach validation route headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route validation test",
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

describe("SENA validation group-comparison route", () => {
  it("creates a persisted validation suite with run-level provenance headers", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-route-"));
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
    vi.doMock("@/lib/sena/inference", async () => await import("../inference"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Validation Reviewer",
        email: "validation-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Validation Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Route Validation Project",
        snapshot: validationRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          suite: true,
          comparisons: [
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" },
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "alignment" }
          ],
          iterations: 100,
          bootstrapIterations: 100,
          alpha: 0.05,
          preregistrationNote: "Route preregistration note for Holm suite.",
          methodNote: "Route validation uses a Holm-corrected multi-metric suite.",
          parityEvidence: {
            walkthroughDatasetLabel: "route validation walkthrough",
            walkthroughDatasetHash: "route-validation-fixture-sha256",
            expertReviewRequired: true,
            studySpecificInferenceReference: "prereg:route-validation-model-v1"
          }
        })
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as {
        schemaVersion?: string;
        comparisonCount?: number;
        correction?: string;
        validationRun?: {
          id?: string;
          status?: string;
          projectId?: string;
          comparisonCount?: number;
          minHolmAdjustedP?: number;
          preregistrationPlan?: { planHash?: string };
          parityEvidence?: {
            status?: string;
            validationRunHash?: string;
            formalInference?: { status?: string };
          };
        };
      };
      expect(body.schemaVersion).toBe("sena-group-comparison-suite/v1");
      expect(body.comparisonCount).toBe(3);
      expect(body.correction).toBe("holm");
      expect(body.validationRun?.projectId).toBe(project.id);
      expect(body.validationRun?.status).toBe("pending-review");
      expect(body.validationRun?.preregistrationPlan?.planHash).toMatch(/^[a-f0-9]{64}$/);
      expect(body.validationRun?.parityEvidence?.status).toBe("ready-for-review");
      expect(body.validationRun?.parityEvidence?.formalInference?.status).toBe("model-referenced");
      expect(response.headers.get("x-sena-validation-run-id")).toBe(body.validationRun?.id);
      expect(response.headers.get("x-sena-validation-status")).toBe(body.validationRun?.status);
      expect(response.headers.get("x-sena-project-id")).toBe(project.id);
      expect(response.headers.get("x-sena-validation-comparison-count")).toBe(String(body.validationRun?.comparisonCount));
      expect(response.headers.get("x-sena-validation-preregistration-sha256")).toBe(body.validationRun?.preregistrationPlan?.planHash);
      expect(response.headers.get("x-sena-validation-parity-status")).toBe(body.validationRun?.parityEvidence?.status);
      expect(response.headers.get("x-sena-validation-parity-sha256")).toBe(body.validationRun?.parityEvidence?.validationRunHash);
      expect(response.headers.get("x-sena-formal-inference-status")).toBe(body.validationRun?.parityEvidence?.formalInference?.status);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, validationRouteTestTimeoutMs);
});
