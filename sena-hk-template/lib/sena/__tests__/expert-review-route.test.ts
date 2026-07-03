import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";

function expertReviewRouteSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Expert Review Project",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route expert review test",
      interpretation: "Expert review route provenance test.",
      limitations: "Fixture only.",
      nextActions: "Attach expert review route headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route expert review test",
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

describe("SENA expert review route", () => {
  it("returns claim-readiness review headers when creating and updating expert reviews", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-expert-review-route-"));
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
        name: "Expert Reviewer",
        email: "expert-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Expert Review Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Route Expert Review Project",
        snapshot: expertReviewRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/validation/expert-review/route");
      const createCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/validation/expert-review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": createCsrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          target: { kind: "project", id: project.id, label: "Route project claim" },
          reviewerName: "Dr. Route Expert",
          reviewerRole: "Lesson study methodologist",
          expertiseArea: "Teacher collaboration and discourse analysis",
          status: "changes-requested",
          claimScope: "exploratory-only",
          ratings: {
            dataAdequacy: 4,
            methodFit: 3,
            interpretationValidity: 2
          },
          concerns: "Clarify claim boundary before publication."
        })
      }));
      const createBody = await createResponse.json() as {
        schemaVersion?: string;
        expertReview?: {
          id?: string;
          teamId?: string;
          projectId?: string;
          status?: string;
          claimScope?: string;
          target?: { kind?: string; id?: string };
          ratings?: { interpretationValidity?: number };
        };
      };

      expect(createResponse.status).toBe(200);
      expect(createBody.schemaVersion).toBe("sena-expert-review-response/v1");
      expect(createBody.expertReview?.projectId).toBe(project.id);
      expect(createBody.expertReview?.status).toBe("changes-requested");
      expect(createResponse.headers.get("x-sena-observed-route")).toBe("sena-validation-expert-review");
      expect(createResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(createResponse.headers.get("x-sena-expert-review-id")).toBe(createBody.expertReview?.id);
      expect(createResponse.headers.get("x-sena-project-id")).toBe(project.id);
      expect(createResponse.headers.get("x-sena-team-id")).toBe(project.teamId);
      expect(createResponse.headers.get("x-sena-expert-review-status")).toBe("changes-requested");
      expect(createResponse.headers.get("x-sena-expert-review-claim-scope")).toBe("exploratory-only");
      expect(createResponse.headers.get("x-sena-expert-review-target-kind")).toBe("project");
      expect(createResponse.headers.get("x-sena-expert-review-target-id")).toBe(project.id);
      expect(createResponse.headers.get("x-sena-expert-review-interpretation-validity")).toBe("2");

      const updateCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const updateResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/validation/expert-review", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": updateCsrf.token
        },
        body: JSON.stringify({
          reviewId: createBody.expertReview?.id,
          status: "approved",
          claimScope: "claim-ready-with-limits",
          ratings: {
            interpretationValidity: 5
          },
          recommendations: "Use the claim with explicit limitations."
        })
      }));
      const updateBody = await updateResponse.json() as {
        expertReview?: {
          id?: string;
          status?: string;
          claimScope?: string;
          ratings?: { interpretationValidity?: number };
        };
      };

      expect(updateResponse.status).toBe(200);
      expect(updateBody.expertReview?.id).toBe(createBody.expertReview?.id);
      expect(updateBody.expertReview?.status).toBe("approved");
      expect(updateBody.expertReview?.claimScope).toBe("claim-ready-with-limits");
      expect(updateBody.expertReview?.ratings?.interpretationValidity).toBe(5);
      expect(updateResponse.headers.get("x-sena-observed-route")).toBe("sena-validation-expert-review");
      expect(updateResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(updateResponse.headers.get("x-sena-expert-review-id")).toBe(createBody.expertReview?.id);
      expect(updateResponse.headers.get("x-sena-project-id")).toBe(project.id);
      expect(updateResponse.headers.get("x-sena-expert-review-status")).toBe("approved");
      expect(updateResponse.headers.get("x-sena-expert-review-claim-scope")).toBe("claim-ready-with-limits");
      expect(updateResponse.headers.get("x-sena-expert-review-interpretation-validity")).toBe("5");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("persists expert-review create, list, and review through Postgres primary state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-expert-review-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Expert Reviewer",
        email: "postgres-expert-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Expert Review Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Postgres Expert Review Project",
        snapshot: expertReviewRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/validation/expert-review/route");
      const createCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/validation/expert-review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": createCsrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          target: { kind: "project", id: project.id, label: "Postgres route project claim" },
          reviewerName: "Dr. Postgres Expert",
          reviewerRole: "Method reviewer",
          expertiseArea: "Teacher discourse validation",
          status: "changes-requested",
          claimScope: "exploratory-only",
          ratings: {
            dataAdequacy: 4,
            methodFit: 3,
            interpretationValidity: 2
          },
          concerns: "Clarify Postgres primary-state evidence before publication."
        })
      }));
      const createBody = await createResponse.json() as {
        expertReview?: {
          id?: string;
          projectId?: string;
          status?: string;
          claimScope?: string;
        };
      };
      const expertReviewId = createBody.expertReview?.id;

      expect(createResponse.status).toBe(200);
      expect(expertReviewId).toMatch(/^expert_/);
      expect(createBody.expertReview?.projectId).toBe(project.id);
      expect(pg.state?.payload.expertReviews.map((review) => review.id)).toContain(expertReviewId);
      expect(pg.expertReviews.map((review) => review.id)).toContain(expertReviewId);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/validation/expert-review?projectId=${project.id}`));
      const listBody = await listResponse.json() as {
        expertReviews?: Array<{ id?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listBody.expertReviews?.map((review) => review.id)).toContain(expertReviewId);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-validation-expert-review");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");

      const updateCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const updateResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/validation/expert-review", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": updateCsrf.token
        },
        body: JSON.stringify({
          reviewId: expertReviewId,
          status: "approved",
          claimScope: "claim-ready-with-limits",
          ratings: {
            interpretationValidity: 5
          },
          recommendations: "Approved with explicit publication limitations."
        })
      }));
      const updateBody = await updateResponse.json() as {
        expertReview?: { id?: string; status?: string; claimScope?: string };
      };

      expect(updateResponse.status).toBe(200);
      expect(updateBody.expertReview?.id).toBe(expertReviewId);
      expect(updateBody.expertReview?.status).toBe("approved");
      expect(updateBody.expertReview?.claimScope).toBe("claim-ready-with-limits");
      expect(pg.state?.payload.expertReviews.find((review) => review.id === expertReviewId)?.status).toBe("approved");
      expect(pg.expertReviews.find((review) => review.id === expertReviewId)?.status).toBe("approved");

      const fileBackedDb = enterprise.readEnterpriseDb();
      expect(fileBackedDb.projects.map((candidate: { id: string }) => candidate.id)).not.toContain(project.id);
      expect(fileBackedDb.expertReviews.map((review: { id: string }) => review.id)).not.toContain(expertReviewId);
      expect(JSON.stringify({ createBody, listBody, updateBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ createBody, listBody, updateBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 30_000);
});
