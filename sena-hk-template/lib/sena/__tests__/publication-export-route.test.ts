import { mkdtempSync, rmSync } from "node:fs";
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

function routeSnapshot(dataGovernanceComplete = true) {
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
      dataSteward: dataGovernanceComplete ? "Route test" : ""
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

  it("blocks queued project publication before every side effect when approved current reliability evidence is missing", async () => {
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

      expect(response.status).toBe(409);
      const body = await response.json() as { code?: string; error?: string };
      expect(body.code).toBe("publication_export_model_card_blocked");
      expect(body.error).toContain("approved, current, machine-eligible reliability run");
      expect(queueRequests).toHaveLength(0);

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.queue",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events).toHaveLength(0);
      const jobs = await enterprise.listEnterpriseServerJobs({
        projectId: project.id
      });
      expect(jobs.summary.total).toBe(0);
      expect(jobs.jobs).toHaveLength(0);
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

  it("blocks sync and queued publication before side effects when persisted human review is internally incomplete", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-human-review-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    const queueRequests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      queueRequests.push(String(input));
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
        name: "Human Review Publication Exporter",
        email: "human-review-publication-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Human Review Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const forgedSnapshot = routeSnapshot();
      forgedSnapshot.report.humanReview.interpretation = "Pending human review.";
      expect(forgedSnapshot.report.humanReview.status).toBe("human-reviewed");
      expect(forgedSnapshot.report.modelCard.renderGate.status).toBe("ready");
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Incomplete Human Review Publication Project",
        snapshot: forgedSnapshot
      });
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Human review publication reliability reviewer")
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "Machine eligibility cannot substitute for complete publication human review."
      });

      const route = await import("../../../app/api/sena/exports/publication/route");
      const request = (queue: boolean) => new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({ projectId: project.id, format: "html", queue })
      });
      const syncResponse = await route.POST(request(false));
      const queuedResponse = await route.POST(request(true));

      for (const response of [syncResponse, queuedResponse]) {
        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual(expect.objectContaining({
          code: "publication_export_model_card_blocked"
        }));
      }
      expect(queueRequests).toHaveLength(0);
      expect(enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.run",
        projectId: project.id,
        limit: 5
      }).events).toHaveLength(0);
      expect(enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.queue",
        projectId: project.id,
        limit: 5
      }).events).toHaveLength(0);
      const jobs = await enterprise.listEnterpriseServerJobs({ projectId: project.id });
      expect(jobs.jobs).toHaveLength(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);

  it("fails closed without queue side effects when production requires the unavailable publication worker", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-required-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS = "1";
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    const queueRequests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      queueRequests.push(String(input));
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
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Required queue publication reliability reviewer")
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

      expect(response.status).toBe(503);
      const body = await response.json() as { code?: string; error?: string };
      expect(body.code).toBe("publication_export_async_worker_unavailable");
      expect(body.error).toContain("evidence-bound publication worker");
      expect(queueRequests).toHaveLength(0);
      const inlineResponse = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId: project.teamId,
          snapshot: routeSnapshot(),
          format: "html",
          queue: true
        })
      }));
      expect(inlineResponse.status).toBe(400);
      await expect(inlineResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_project_required"
      }));
      expect(inlineResponse.headers.get("x-sena-export-source")).toBeNull();
      expect(inlineResponse.headers.get("content-disposition")).toBeNull();
      const blankProjectResponse = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({ projectId: "  \n\t", format: "html", queue: true })
      }));
      expect(blankProjectResponse.status).toBe(400);
      await expect(blankProjectResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_project_required"
      }));
      expect(blankProjectResponse.headers.get("x-sena-export-source")).toBeNull();
      const mixedSourceResponse = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          snapshot: routeSnapshot(),
          format: "html",
          queue: true
        })
      }));
      expect(mixedSourceResponse.status).toBe(400);
      await expect(mixedSourceResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_inline_snapshot_forbidden"
      }));
      expect(queueRequests).toHaveLength(0);
      const incompleteProject = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Incomplete Queued Publication Project",
        snapshot: routeSnapshot(false)
      });
      const incompleteReliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(
          incompleteProject,
          incompleteProject.snapshot,
          "Incomplete queue publication reliability reviewer"
        )
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, incompleteReliabilityRun.id, {
        status: "approved",
        notes: "Approved reliability cannot override an incomplete human-review model-card section."
      });
      const incompleteResponse = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: incompleteProject.id,
          format: "package",
          queue: true
        })
      }));
      expect(incompleteResponse.status).toBe(409);
      await expect(incompleteResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_model_card_blocked"
      }));
      expect(queueRequests).toHaveLength(0);
      const jobs = await enterprise.listEnterpriseServerJobs({});
      expect(jobs.summary.total).toBe(0);
      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.queue",
        limit: 5
      });
      expect(audit.events).toHaveLength(0);
      expect(enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.run",
        limit: 5
      }).events).toHaveLength(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_URL;
      delete process.env.SENA_JOB_QUEUE_SECRET;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
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
