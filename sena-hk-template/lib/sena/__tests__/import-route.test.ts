import { mkdtempSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

describe("SENA import route", () => {
  it("returns import, cleaning, project, and analysis provenance headers for persisted transcript imports", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-import-route-"));
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
    vi.doMock("@/lib/sena/import-adapters", async () => await import("../import-adapters"));
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Import Reviewer",
        email: "import-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Import Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const form = new FormData();
      form.set("teamId", registered.context.teams[0].id);
      form.set("action", "create-project");
      form.set("title", "Route Transcript Import");
      form.set("includeRuntimeBundle", "true");
      form.append("files", new File([
        [
          "1",
          "00:00:01,000 --> 00:00:03,000",
          "Ada: We should ask a better #Question and gather #Evidence.",
          "",
          "2",
          "00:00:04,000 --> 00:00:06,000",
          "Ben: The board explanation needs {{Explanation}} and later #Reflection."
        ].join("\n")
      ], "route-transcript.srt", { type: "application/x-subrip" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: form
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        cleaningManifest?: {
          schemaVersion?: string;
          summary?: {
            adapterProfiles?: string[];
            warningCount?: number;
          };
          checks?: Array<{ status?: string }>;
        };
        importRun?: {
          id?: string;
          status?: string;
          teamId?: string;
          fileCount?: number;
          warningCount?: number;
          cleaningManifest?: { schemaVersion?: string };
        };
        persistedProject?: { id?: string; currentVersion?: number };
        enterpriseAnalysisRun?: { id?: string };
      };

      expect(response.status).toBe(201);
      expect(body.schemaVersion).toBe("sena-enterprise-import/v1");
      expect(body.importRun?.status).toBe("completed");
      expect(body.importRun?.cleaningManifest?.schemaVersion).toBe("sena-import-cleaning-manifest/v1");
      expect(body.cleaningManifest?.summary?.adapterProfiles).toContain("cleaned-transcript");
      expect(body.persistedProject?.currentVersion).toBe(1);
      expect(body.enterpriseAnalysisRun?.id).toMatch(/^analysis_/);
      expect(response.headers.get("x-sena-import-run-id")).toBe(body.importRun?.id);
      expect(response.headers.get("x-sena-import-status")).toBe("completed");
      expect(response.headers.get("x-sena-team-id")).toBe(registered.context.teams[0].id);
      expect(response.headers.get("x-sena-import-file-count")).toBe("1");
      expect(response.headers.get("x-sena-import-warning-count")).toBe("0");
      expect(response.headers.get("x-sena-import-cleaning-manifest")).toBe("sena-import-cleaning-manifest/v1");
      expect(response.headers.get("x-sena-import-profiles")).toContain("cleaned-transcript");
      expect(response.headers.get("x-sena-import-cleaning-review-checks")).toBe(String(body.cleaningManifest?.checks?.filter((check) => check.status === "review").length));
      expect(response.headers.get("x-sena-project-id")).toBe(body.persistedProject?.id);
      expect(response.headers.get("x-sena-project-version")).toBe(String(body.persistedProject?.currentVersion));
      expect(response.headers.get("x-sena-analysis-run-id")).toBe(body.enterpriseAnalysisRun?.id);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-import");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 30_000);

  it("queues uploaded import files as upload-pointer server jobs without embedding file contents", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-import-queue-route-"));
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
    vi.doMock("@/lib/sena/import-adapters", async () => await import("../import-adapters"));
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Import Queue Reviewer",
        email: "import-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Import Queue Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const form = new FormData();
      form.set("teamId", registered.context.teams[0].id);
      form.set("queue", "true");
      form.set("action", "create-project");
      form.set("title", "Queued Import Project");
      form.append("files", new File([
        "person_id,name\np1,VERY_PRIVATE_IMPORT_ROW\n"
      ], "queued-people.csv", { type: "text/csv" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
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
        teamId?: string;
        payloadSha256?: string;
        payloadSummary?: {
          source?: string;
          fileCount?: number;
          uploadIds?: string[];
          persist?: boolean;
        };
        provider?: { endpointHash?: string };
        worker?: { expectedAction?: string; payloadDelivery?: string };
        delivery?: { webhookStatus?: string; httpStatus?: number };
      };

      expect(response.status).toBe(202);
      expect(body.kind).toBe("import");
      expect(body.status).toBe("queued");
      expect(body.teamId).toBe(registered.context.teams[0].id);
      expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.payloadSummary).toEqual(expect.objectContaining({
        source: "upload",
        fileCount: 1,
        persist: true
      }));
      expect(body.payloadSummary?.uploadIds).toHaveLength(1);
      expect(body.worker).toEqual(expect.objectContaining({
        expectedAction: "run-import",
        payloadDelivery: "upload-pointer"
      }));
      expect(body.delivery).toEqual(expect.objectContaining({
        webhookStatus: "delivered",
        httpStatus: 202
      }));
      expect(response.headers.get("x-sena-server-job-id")).toBe(body.id);
      expect(response.headers.get("x-sena-server-job-kind")).toBe("import");
      expect(response.headers.get("x-sena-job-payload-sha256")).toBe(body.payloadSha256);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-import");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(queueRequests).toHaveLength(1);
      const queueTimestamp = queueRequests[0].headers["x-sena-webhook-timestamp"];
      expect(queueRequests[0].headers["x-sena-webhook-signature"])
        .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${queueTimestamp}.${queueRequests[0].body}`).digest("hex")}`);
      const queuePayload = JSON.parse(queueRequests[0].body) as {
        workerPayload?: { action?: string; uploadIds?: string[]; title?: string };
      };
      expect(queuePayload.workerPayload).toEqual(expect.objectContaining({
        action: "run-import",
        uploadIds: body.payloadSummary?.uploadIds,
        title: "Queued Import Project"
      }));
      expect(queueRequests[0].body).not.toContain("VERY_PRIVATE_IMPORT_ROW");

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "import.queue",
        limit: 5
      });
      expect(audit.events[0].detail).toEqual(expect.objectContaining({
        serverJobId: body.id,
        serverJobKind: "import",
        queueProvider: "managed",
        queueDelivery: "delivered",
        queueHttpStatus: 202,
        payloadSha256: body.payloadSha256,
        uploadCount: 1,
        persistProject: true
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
  }, 30_000);

  it("persists imported projects through Postgres primary state when SENA_ENTERPRISE_STATE_STORE=postgres", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-import-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    const poolOptions: unknown[] = [];
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        constructor(options: unknown) {
          poolOptions.push(options);
        }

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
    vi.doMock("@/lib/sena/import-adapters", async () => await import("../import-adapters"));
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Import Reviewer",
        email: "postgres-import-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Import Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const form = new FormData();
      form.set("teamId", registered.context.teams[0].id);
      form.set("action", "create-project");
      form.set("title", "Postgres Route Transcript Import");
      form.append("files", new File([
        [
          "1",
          "00:00:01,000 --> 00:00:03,000",
          "Ada: We should ask a better #Question and gather #Evidence.",
          "",
          "2",
          "00:00:04,000 --> 00:00:06,000",
          "Ben: The board explanation needs {{Explanation}} and later #Reflection."
        ].join("\n")
      ], "postgres-route-transcript.srt", { type: "application/x-subrip" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: form
      }));
      const body = await response.json() as {
        uploads?: Array<{ id?: string }>;
        importRun?: { id?: string };
        persistedProject?: { id?: string; currentVersion?: number };
        enterpriseAnalysisRun?: { id?: string };
      };

      expect(response.status).toBe(201);
      expect(body.persistedProject?.currentVersion).toBe(1);
      expect(poolOptions[0]).toEqual(expect.objectContaining({
        connectionString: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
      }));
      expect(pg.state?.payload.projects.map((project) => project.id)).toContain(body.persistedProject?.id);
      expect(pg.state?.payload.importRuns.map((run) => run.id)).toContain(body.importRun?.id);
      expect(pg.state?.payload.analysisRuns.map((run) => run.id)).toContain(body.enterpriseAnalysisRun?.id);
      expect(pg.uploads.map((upload) => upload.id)).toContain(body.uploads?.[0]?.id);
      expect(pg.importRuns.map((run) => run.id)).toContain(body.importRun?.id);
      expect(pg.analysisRuns.map((run) => run.id)).toContain(body.enterpriseAnalysisRun?.id);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/import?teamId=${registered.context.teams[0].id}`));
      const listBody = await listResponse.json() as {
        importRuns?: Array<{ id?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listBody.importRuns?.map((run) => run.id)).toContain(body.importRun?.id);

      const fileBackedProjects = enterprise.readEnterpriseDb().projects;
      expect(fileBackedProjects.map((project: { id: string }) => project.id)).not.toContain(body.persistedProject?.id);
      expect(JSON.stringify({ body, listBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ body, listBody, postgresState: pg.state })).not.toContain("example.neon.tech");
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
