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
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-reliability");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, reliabilityRouteTestTimeoutMs);

  it("queues reliability file uploads as upload-pointer server jobs", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-queue-route-"));
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
    vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Reliability Queue Reviewer",
        email: "reliability-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Reliability Queue Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Queued Reliability Project",
        snapshot: reliabilityRouteSnapshot()
      });
      const form = new FormData();
      form.set("teamId", project.teamId);
      form.set("projectId", project.id);
      form.set("reviewer", "Queued Reliability Reviewer");
      form.set("queue", "true");
      form.append("files", new File([
        [
          "coder_id,item_id,code_id,value",
          "c1,u1,Evidence,1",
          "c2,u1,Evidence,1"
        ].join("\n")
      ], "queued-ratings.csv", { type: "text/csv" }));

      const route = await import("../../../app/api/sena/reliability/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: form
      }));
      const body = await response.json() as {
        id?: string;
        kind?: string;
        status?: string;
        projectId?: string;
        payloadSha256?: string;
        payloadSummary?: {
          source?: string;
          fileCount?: number;
          uploadIds?: string[];
          projectVersion?: number;
        };
        worker?: { expectedAction?: string; payloadDelivery?: string };
        delivery?: { webhookStatus?: string; httpStatus?: number };
      };

      expect(response.status).toBe(202);
      expect(body.kind).toBe("reliability");
      expect(body.status).toBe("queued");
      expect(body.projectId).toBe(project.id);
      expect(body.payloadSummary).toEqual(expect.objectContaining({
        source: "upload",
        fileCount: 1,
        projectVersion: project.currentVersion
      }));
      expect(body.payloadSummary?.uploadIds).toHaveLength(1);
      expect(body.worker).toEqual(expect.objectContaining({
        expectedAction: "run-reliability",
        payloadDelivery: "upload-pointer"
      }));
      expect(body.delivery).toEqual(expect.objectContaining({
        webhookStatus: "delivered",
        httpStatus: 202
      }));
      expect(response.headers.get("x-sena-server-job-kind")).toBe("reliability");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-reliability");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(queueRequests).toHaveLength(1);
      const queueTimestamp = queueRequests[0].headers["x-sena-webhook-timestamp"];
      expect(queueRequests[0].headers["x-sena-webhook-signature"])
        .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${queueTimestamp}.${queueRequests[0].body}`).digest("hex")}`);
      const queuePayload = JSON.parse(queueRequests[0].body) as {
        workerPayload?: { action?: string; projectId?: string; uploadIds?: string[]; reviewer?: string };
      };
      expect(queuePayload.workerPayload).toEqual(expect.objectContaining({
        action: "run-reliability",
        projectId: project.id,
        uploadIds: body.payloadSummary?.uploadIds,
        reviewer: "Queued Reliability Reviewer"
      }));
      expect(queueRequests[0].body).not.toContain("coder_id,item_id");

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "reliability.queue",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events[0].detail).toEqual(expect.objectContaining({
        serverJobId: body.id,
        serverJobKind: "reliability",
        queueProvider: "managed",
        queueDelivery: "delivered",
        queueHttpStatus: 202,
        payloadSha256: body.payloadSha256,
        uploadCount: 1,
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
  }, reliabilityRouteTestTimeoutMs);

  it("persists reliability create, list, adjudication, and review through Postgres primary state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-postgres-route-"));
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
    vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
    vi.doMock("@/lib/sena/import", async () => await import("../import"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Reliability Reviewer",
        email: "postgres-reliability-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Reliability Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Postgres Reliability Project",
        snapshot: reliabilityRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/reliability/route");
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: project.teamId,
          projectId: project.id,
          reviewer: "Postgres Reliability Reviewer",
          sourceName: "postgres-reliability.json",
          annotations: [
            { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
            { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
            { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
            { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
          ]
        })
      }));
      const createBody = await createResponse.json() as {
        reliabilityRun?: {
          id?: string;
          projectId?: string;
          status?: string;
          adjudicationCoverage?: { unresolvedDisagreements?: number };
        };
      };
      const reliabilityRunId = createBody.reliabilityRun?.id;

      expect(createResponse.status).toBe(200);
      expect(reliabilityRunId).toMatch(/^rel_/);
      expect(createBody.reliabilityRun?.projectId).toBe(project.id);
      expect(createBody.reliabilityRun?.status).toBe("pending-adjudication");
      expect(createBody.reliabilityRun?.adjudicationCoverage?.unresolvedDisagreements).toBe(1);
      expect(pg.state?.payload.reliabilityRuns.map((run) => run.id)).toContain(reliabilityRunId);
      expect(pg.reliabilityRuns.map((run) => run.id)).toContain(reliabilityRunId);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/reliability?projectId=${project.id}`));
      const listBody = await listResponse.json() as {
        reliabilityRuns?: Array<{ id?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listBody.reliabilityRuns?.map((run) => run.id)).toContain(reliabilityRunId);

      const adjudicationResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          action: "adjudicate",
          runId: reliabilityRunId,
          decision: "include",
          notes: "Resolved in Postgres primary reliability route test."
        })
      }));
      const adjudicationBody = await adjudicationResponse.json() as {
        adjudication?: {
          summary?: { unresolvedDisagreements?: number };
          adjudications?: Array<{ id?: string; reliabilityRunId?: string }>;
          reliabilityRun?: { id?: string; status?: string };
        };
      };
      const adjudicationId = adjudicationBody.adjudication?.adjudications?.[0]?.id;

      expect(adjudicationResponse.status).toBe(201);
      expect(adjudicationId).toMatch(/^adj_/);
      expect(adjudicationBody.adjudication?.summary?.unresolvedDisagreements).toBe(0);
      expect(pg.state?.payload.adjudications.map((record) => record.id)).toContain(adjudicationId);
      expect(pg.adjudications.map((record) => record.id)).toContain(adjudicationId);
      expect(pg.state?.payload.reliabilityRuns.find((run) => run.id === reliabilityRunId)?.adjudicationCoverage.unresolvedDisagreements).toBe(0);

      const reviewResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          runId: reliabilityRunId,
          status: "approved",
          notes: "Approved in Postgres primary reliability route test."
        })
      }));
      const reviewBody = await reviewResponse.json() as {
        reliabilityRun?: { id?: string; status?: string };
      };

      expect(reviewResponse.status).toBe(200);
      expect(reviewBody.reliabilityRun?.status).toBe("approved");
      expect(pg.state?.payload.reliabilityRuns.find((run) => run.id === reliabilityRunId)?.status).toBe("approved");
      expect(pg.reliabilityRuns.find((run) => run.id === reliabilityRunId)?.status).toBe("approved");

      const fileBackedDb = enterprise.readEnterpriseDb();
      expect(fileBackedDb.projects.map((candidate: { id: string }) => candidate.id)).not.toContain(project.id);
      expect(fileBackedDb.reliabilityRuns.map((run: { id: string }) => run.id)).not.toContain(reliabilityRunId);
      expect(fileBackedDb.adjudications.map((record: { id: string }) => record.id)).not.toContain(adjudicationId);
      expect(JSON.stringify({ createBody, listBody, adjudicationBody, reviewBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ createBody, listBody, adjudicationBody, reviewBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, reliabilityRouteTestTimeoutMs);
});
