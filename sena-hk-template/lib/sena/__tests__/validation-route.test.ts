import { mkdtempSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
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
      expect(body.schemaVersion).toBe("sena-group-comparison-suite/v2");
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
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-validation-group-comparison");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, validationRouteTestTimeoutMs);

  it("defaults malformed validation metrics to typed social strength", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-default-metric-route-"));
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
        name: "Validation Metric Reviewer",
        email: "validation-metric-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Validation Metric Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Validation Default Metric Project",
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
          groupField: "role",
          groupA: "Lead teacher",
          groupB: "Curriculum designer",
          metric: "not-a-validation-metric",
          iterations: 100,
          bootstrapIterations: 100
        })
      }));
      const body = await response.json() as {
        metric?: string;
        validationRun?: { id?: string; status?: string };
      };

      expect(response.status).toBe(200);
      expect(body.metric).toBe("socialStrength");
      expect(body.validationRun?.status).toBe("pending-review");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, validationRouteTestTimeoutMs);

  it("queues project-scoped validation suites for the configured server job queue", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    const queueRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      queueRequests.push({
        url: String(input),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response("", { status: 202 });
    }));
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
        name: "Validation Queue Reviewer",
        email: "validation-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Validation Queue Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Queued Validation Project",
        snapshot: validationRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          suite: true,
          comparisons: [
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "alignment" }
          ],
          iterations: 100,
          bootstrapIterations: 100,
          preregistrationNote: "Queued preregistration note.",
          methodNote: "Queued validation method note."
        })
      }));
      const body = await response.json() as {
        id?: string;
        kind?: string;
        status?: string;
        projectId?: string;
        payloadSha256?: string;
        payloadSummary?: {
          source?: string;
          comparisonCount?: number;
          validationMethod?: string;
          projectVersion?: number;
        };
        worker?: { expectedAction?: string; payloadDelivery?: string };
        delivery?: { webhookStatus?: string; httpStatus?: number };
      };

      expect(response.status).toBe(202);
      expect(body.kind).toBe("validation");
      expect(body.status).toBe("queued");
      expect(body.projectId).toBe(project.id);
      expect(body.payloadSummary).toEqual(expect.objectContaining({
        source: "project",
        comparisonCount: 2,
        validationMethod: "group-comparison",
        projectVersion: project.currentVersion
      }));
      expect(body.worker).toEqual(expect.objectContaining({
        expectedAction: "run-validation",
        payloadDelivery: "project-pointer"
      }));
      expect(body.delivery).toEqual(expect.objectContaining({
        webhookStatus: "delivered",
        httpStatus: 202
      }));
      expect(response.headers.get("x-sena-server-job-kind")).toBe("validation");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-validation-group-comparison");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(queueRequests).toHaveLength(1);
      const queueTimestamp = queueRequests[0].headers["x-sena-webhook-timestamp"];
      expect(queueRequests[0].headers["x-sena-webhook-signature"])
        .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${queueTimestamp}.${queueRequests[0].body}`).digest("hex")}`);
      const queuePayload = JSON.parse(queueRequests[0].body) as {
        workerPayload?: {
          action?: string;
          projectId?: string;
          comparisons?: unknown[];
          inlineSnapshot?: unknown;
          inlineDataset?: unknown;
        };
      };
      expect(queuePayload.workerPayload).toEqual(expect.objectContaining({
        action: "run-validation",
        projectId: project.id
      }));
      expect(queuePayload.workerPayload?.comparisons).toHaveLength(2);
      expect(queuePayload.workerPayload?.inlineSnapshot).toBeUndefined();
      expect(queuePayload.workerPayload?.inlineDataset).toBeUndefined();

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "validation.queue",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events[0].detail).toEqual(expect.objectContaining({
        serverJobId: body.id,
        serverJobKind: "validation",
        queueProvider: "managed",
        queueDelivery: "delivered",
        queueHttpStatus: 202,
        payloadSha256: body.payloadSha256,
        comparisonCount: 2,
        projectVersion: project.currentVersion
      }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_URL;
      delete process.env.SENA_JOB_QUEUE_SECRET;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, validationRouteTestTimeoutMs);

  it("persists validation create, list, and review through Postgres primary state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-postgres-route-"));
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
    vi.doMock("@/lib/sena/inference", async () => await import("../inference"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Validation Reviewer",
        email: "postgres-validation-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Validation Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Postgres Validation Project",
        snapshot: validationRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          groupField: "role",
          groupA: "Lead teacher",
          groupB: "Curriculum designer",
          metric: "bridgeScore",
          iterations: 100,
          bootstrapIterations: 100,
          preregistrationNote: "Postgres primary validation preregistration.",
          methodNote: "Postgres primary validation method note.",
          parityEvidence: {
            walkthroughDatasetLabel: "postgres validation walkthrough",
            walkthroughDatasetHash: "postgres-validation-fixture-sha256",
            expertReviewRequired: true,
            studySpecificInferenceReference: "prereg:postgres-validation-model-v1"
          }
        })
      }));
      const createBody = await createResponse.json() as {
        validationRun?: { id?: string; projectId?: string; status?: string };
      };
      const validationRunId = createBody.validationRun?.id;

      expect(createResponse.status).toBe(200);
      expect(validationRunId).toMatch(/^val_/);
      expect(createBody.validationRun?.projectId).toBe(project.id);
      expect(pg.state?.payload.validationRuns.map((run) => run.id)).toContain(validationRunId);
      expect(pg.validationRuns.map((run) => run.id)).toContain(validationRunId);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/validation/group-comparison?projectId=${project.id}`));
      const listBody = await listResponse.json() as {
        validationRuns?: Array<{ id?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listBody.validationRuns?.map((run) => run.id)).toContain(validationRunId);

      const reviewResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          runId: validationRunId,
          status: "approved",
          notes: "Approved in Postgres primary validation route test."
        })
      }));
      const reviewBody = await reviewResponse.json() as {
        validationRun?: { id?: string; status?: string };
      };
      expect(reviewResponse.status).toBe(200);
      expect(reviewBody.validationRun?.status).toBe("approved");
      expect(pg.state?.payload.validationRuns.find((run) => run.id === validationRunId)?.status).toBe("approved");

      const fileBackedProjects = enterprise.readEnterpriseDb().projects;
      expect(fileBackedProjects.map((candidate: { id: string }) => candidate.id)).not.toContain(project.id);
      expect(JSON.stringify({ createBody, listBody, reviewBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ createBody, listBody, reviewBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, validationRouteTestTimeoutMs);
});
