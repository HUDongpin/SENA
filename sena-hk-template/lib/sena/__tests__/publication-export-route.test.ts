import { mkdtempSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
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
    codingReliability: reliabilityDashboardToReview(buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
    ]), "Route test"),
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic route export fixture only.",
      retentionPolicy: "Delete generated route fixture state after the test run.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Route test"
    }
  });
}

function projectReliabilityRunInput(
  project: { id: string; teamId: string; currentVersion: number },
  snapshot: ReturnType<typeof routeSnapshot>,
  reviewer: string
) {
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  const itemIds = source.utterances.slice(0, 3).map((utterance) => utterance.id);
  const codeIds = source.codebook.slice(0, 3).map((code) => code.id);
  if (itemIds.length < 3 || codeIds.length < 3) {
    throw new Error("Publication route reliability fixture requires three items and codes.");
  }
  const annotations = itemIds.flatMap((itemId, index) => ["route-coder-a", "route-coder-b"].map((coderId) => ({
    coderId,
    itemId,
    codeId: codeIds[index],
    value: true
  })));
  const dashboard = buildSenaReliabilityDashboard(annotations);
  expect(dashboard.claimEligibility.eligible).toBe(true);
  return {
    teamId: project.teamId,
    projectId: project.id,
    projectVersion: project.currentVersion,
    reviewer,
    fileCount: 1,
    annotationCount: annotations.length,
    annotations,
    inputFiles: [{
      name: "synthetic-publication-reliability.csv",
      size: 1,
      sha256: "f".repeat(64)
    }],
    dashboard,
    reviewPatch: reliabilityDashboardToReview(dashboard, reviewer)
  };
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
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Route publication reliability reviewer")
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "Approved machine-eligible evidence for the current project revision."
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
        sourceSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(body.enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256)
        .not.toBe(body.enterpriseProjectEvidence?.sourceSnapshotSha256);
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

  it("queues project-scoped publication exports for the configured server job queue", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-queue-route-"));
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
    vi.doMock("@/lib/sena/publication-export", async () => await import("../publication-export"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Publication Queue Exporter",
        email: "publication-queue-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Publication Queue Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Queued Publication Project",
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
          format: "package",
          queue: true
        })
      }));

      expect(response.status).toBe(202);
      const body = await response.json() as {
        schemaVersion?: string;
        id?: string;
        kind?: string;
        status?: string;
        teamId?: string;
        projectId?: string;
        payloadSha256?: string;
        payloadSummary?: {
          source?: string;
          projectVersion?: number;
          format?: string;
          payloadValuesExcluded?: boolean;
        };
        provider?: {
          schemaVersion?: string;
          mode?: string;
          configured?: boolean;
          productionReady?: boolean;
          endpointHash?: string;
          secretConfigured?: boolean;
        };
        worker?: {
          expectedAction?: string;
          payloadDelivery?: string;
          execution?: string;
          statusCallback?: string;
        };
        lifecycle?: {
          attempts?: number;
          maxAttempts?: number;
          retryable?: boolean;
        };
        delivery?: {
          webhookStatus?: string;
          httpStatus?: number;
          endpointHash?: string;
        };
      };
      expect(body.schemaVersion).toBe("sena-enterprise-server-job/v1");
      expect(body.kind).toBe("publication-export");
      expect(body.status).toBe("queued");
      expect(body.teamId).toBe(project.teamId);
      expect(body.projectId).toBe(project.id);
      expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.payloadSummary).toEqual(expect.objectContaining({
        source: "project",
        projectVersion: project.currentVersion,
        format: "package",
        payloadValuesExcluded: true
      }));
      expect(body.provider).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-server-job-queue/v1",
        mode: "managed",
        configured: true,
        productionReady: true,
        secretConfigured: true,
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(body.worker).toEqual(expect.objectContaining({
        expectedAction: "run-publication-export",
        payloadDelivery: "project-pointer",
        execution: "external-worker-required",
        statusCallback: "/api/sena/ops/jobs"
      }));
      expect(body.lifecycle).toEqual(expect.objectContaining({
        attempts: 0,
        maxAttempts: 3,
        retryable: false
      }));
      expect(body.delivery).toEqual(expect.objectContaining({
        webhookStatus: "delivered",
        httpStatus: 202,
        endpointHash: body.provider?.endpointHash
      }));
      expect(response.headers.get("x-sena-server-job-id")).toBe(body.id);
      expect(response.headers.get("x-sena-server-job-kind")).toBe("publication-export");
      expect(response.headers.get("x-sena-server-job-status")).toBe("queued");
      expect(response.headers.get("x-sena-job-queue-provider")).toBe("managed");
      expect(response.headers.get("x-sena-job-payload-sha256")).toBe(body.payloadSha256);
      expect(response.headers.get("x-sena-job-queue-delivery")).toBe("delivered");
      expect(response.headers.get("x-sena-job-queue-http-status")).toBe("202");
      expect(queueRequests).toHaveLength(1);
      expect(queueRequests[0].url).toBe("https://jobs.example.test/sena");
      expect(queueRequests[0].headers["x-sena-webhook-event"]).toBe("server_job.queue");
      expect(queueRequests[0].headers["x-sena-server-job-id"]).toBe(body.id);
      expect(queueRequests[0].headers["x-sena-server-job-kind"]).toBe("publication-export");
      expect(queueRequests[0].headers["x-sena-job-payload-sha256"]).toBe(body.payloadSha256);
      const queueTimestamp = queueRequests[0].headers["x-sena-webhook-timestamp"];
      expect(queueRequests[0].headers["x-sena-webhook-signature"])
        .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${queueTimestamp}.${queueRequests[0].body}`).digest("hex")}`);
      const queuePayload = JSON.parse(queueRequests[0].body) as {
        schemaVersion?: string;
        job?: { id?: string; delivery?: unknown; payloadSha256?: string };
        workerPayload?: {
          action?: string;
          projectId?: string;
          format?: string;
          inlineSnapshot?: unknown;
        };
        delivery?: { payloadSha256?: string; secretConfigured?: boolean };
        redaction?: { responsePayloadValuesExcluded?: boolean; auditPayloadValuesExcluded?: boolean };
      };
      expect(queuePayload.schemaVersion).toBe("sena-enterprise-server-job-queue-webhook/v1");
      expect(queuePayload.job).toEqual(expect.objectContaining({
        id: body.id,
        payloadSha256: body.payloadSha256
      }));
      expect(queuePayload.job?.delivery).toBeUndefined();
      expect(queuePayload.workerPayload).toEqual(expect.objectContaining({
        action: "run-publication-export",
        projectId: project.id,
        format: "package"
      }));
      expect(queuePayload.workerPayload?.inlineSnapshot).toBeUndefined();
      expect(queuePayload.delivery).toEqual(expect.objectContaining({
        payloadSha256: body.payloadSha256,
        secretConfigured: true
      }));
      expect(queuePayload.redaction).toEqual(expect.objectContaining({
        responsePayloadValuesExcluded: true,
        auditPayloadValuesExcluded: true
      }));

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.queue",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events[0]).toEqual(expect.objectContaining({
        projectId: project.id,
        teamId: project.teamId
      }));
      expect(audit.events[0].detail).toEqual(expect.objectContaining({
        serverJobId: body.id,
        serverJobKind: "publication-export",
        queueProvider: "managed",
        queueDelivery: "delivered",
        queueHttpStatus: 202,
        queueProductionReady: true,
        payloadSha256: body.payloadSha256,
        source: "project",
        format: "package",
        inlinePayloadAllowed: false,
        projectVersion: project.currentVersion
      }));
      const jobs = await enterprise.listEnterpriseServerJobs({
        projectId: project.id
      });
      expect(jobs.summary).toEqual(expect.objectContaining({
        total: 1,
        queued: 1
      }));
      expect(jobs.jobs[0]).toEqual(expect.objectContaining({
        id: body.id,
        status: "queued",
        payloadSha256: body.payloadSha256
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
  }, publicationExportRouteTestTimeoutMs);

  it("requires the async queue for publication exports when the production performance path is enabled", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-required-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS = "1";
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
        name: "Required Queue Publication Exporter",
        email: "publication-required-queue-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Required Queue Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Required Queue Publication Project",
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

      expect(response.status).toBe(503);
      const body = await response.json() as { code?: string; error?: string };
      expect(body.code).toBe("server_job_queue_not_configured");
      expect(body.error).toContain("server job queue is not configured");
      const jobs = await enterprise.listEnterpriseServerJobs({ projectId: project.id });
      expect(jobs.summary.total).toBe(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);

  it("exports project publications from Postgres primary state when SENA_ENTERPRISE_STATE_STORE=postgres", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-postgres-route-"));
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
    vi.doMock("@/lib/sena/publication-export", async () => await import("../publication-export"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Publication Exporter",
        email: "postgres-publication-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Postgres Publication Project",
        snapshot: routeSnapshot()
      });
      const reliabilityRuns = await import("../enterprise/reliability-runs");
      const reliabilityRun = await reliabilityRuns.createEnterpriseReliabilityRunWithPostgresMirrorAsync(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Postgres publication reliability reviewer")
      );
      await reliabilityRuns.reviewEnterpriseReliabilityRunWithPostgresMirrorAsync(
        registered.context,
        reliabilityRun.id,
        {
          status: "approved",
          notes: "Approved Postgres machine-eligible evidence for the current project revision."
        }
      );

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
      const body = await response.json() as {
        enterpriseProjectEvidence?: {
          projectId?: string;
          currentVersion?: number;
          claimPackage?: { status?: string };
          stateBinding?: {
            activePrimary?: string;
            stateRevisionKind?: string;
            stateRevision?: string;
            stateRevisionSha256?: string;
            bindingSha256?: string;
          };
        };
      };

      expect(response.status).toBe(200);
      expect(body.enterpriseProjectEvidence).toEqual(expect.objectContaining({
        projectId: project.id,
        currentVersion: 1
      }));
      expect(body.enterpriseProjectEvidence?.claimPackage?.status).toBe("exploratory-only");
      expect(body.enterpriseProjectEvidence?.stateBinding).toEqual(expect.objectContaining({
        activePrimary: "postgres",
        stateRevisionKind: "postgres-row-revision",
        stateRevision: expect.any(String),
        stateRevisionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        bindingSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(response.headers.get("x-sena-project-id")).toBe(project.id);
      expect(response.headers.get("x-sena-project-version")).toBe("1");
      expect(response.headers.get("x-sena-publication-state-revision-sha256"))
        .toBe(body.enterpriseProjectEvidence?.stateBinding?.stateRevisionSha256);
      expect(response.headers.get("x-sena-publication-state-binding-sha256"))
        .toBe(body.enterpriseProjectEvidence?.stateBinding?.bindingSha256);
      expect(pg.state?.payload.projects.map((candidate) => candidate.id)).toContain(project.id);
      expect(pg.auditRows.map((entry) => entry.event)).toContain("export.run");

      const fileBackedProjects = enterprise.readEnterpriseDb().projects;
      expect(fileBackedProjects.map((candidate: { id: string }) => candidate.id)).not.toContain(project.id);
      expect(JSON.stringify({ body, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ body, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);
});
