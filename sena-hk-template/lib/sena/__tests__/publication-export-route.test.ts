import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";
import {
  buildSenaGroupComparisonSuite,
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
} from "../index";
import { assertSenaProjectSnapshotPublicationDerivationWorkBudget } from "../snapshot";
import {
  configurePublicationAuthorizationSigning,
  createClaimReadyPublicationEvidence,
  createClaimReadyPublicationEvidenceAsync
} from "./publication-authorization-fixture";

const publicationExportRouteTestTimeoutMs = 30_000;
const publicationWorkerRouteTestTimeoutMs = 60_000;
const originalExpertSigningSecret = process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
const originalExpertSigningKeyId = process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;

function mutatePersistedProjectSnapshot(
  enterpriseDbDir: string,
  projectId: string,
  mutate: (snapshot: ReturnType<typeof routeSnapshot>) => void
) {
  const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
  const db = JSON.parse(readFileSync(dbPath, "utf8")) as {
    projects: Array<{ id: string; currentVersion: number; snapshot: ReturnType<typeof routeSnapshot> }>;
    projectRevisions: Array<{ projectId: string; version: number; snapshot: ReturnType<typeof routeSnapshot> }>;
    auditLog: Array<{ event: string; projectId?: string }>;
    serverJobs: Array<{ projectId?: string }>;
  };
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error("Persisted route-test project was not found.");
  mutate(project.snapshot);
  const revision = db.projectRevisions.find((candidate) =>
    candidate.projectId === projectId && candidate.version === project.currentVersion
  );
  if (!revision) throw new Error("Persisted route-test project revision was not found.");
  mutate(revision.snapshot);
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return { dbPath };
}

function persistedPublicationSideEffects(dbPath: string, projectId: string) {
  const db = JSON.parse(readFileSync(dbPath, "utf8")) as {
    auditLog: Array<{
      event: string;
      projectId?: string;
      teamId?: string;
      detail?: Record<string, unknown>;
    }>;
    serverJobs: Array<{ projectId?: string }>;
  };
  return {
    auditEvents: db.auditLog.filter((event) => event.projectId === projectId &&
      (event.event === "export.run" || event.event === "export.queue")),
    jobs: db.serverJobs.filter((job) => job.projectId === projectId)
  };
}

type PersistedPublicationValidation = {
  pTwoSided: number;
  validationRunEvidenceSchemaVersion?: string;
  validationRunEvidenceHash?: string;
};

function mutatePersistedValidationRun(
  enterpriseDbDir: string,
  validationRunId: string,
  mutate: (run: PersistedPublicationValidation) => void
) {
  const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
  const db = JSON.parse(readFileSync(dbPath, "utf8")) as {
    validationRuns: Array<{ id: string } & PersistedPublicationValidation>;
  };
  const run = db.validationRuns.find((candidate) => candidate.id === validationRunId);
  if (!run) throw new Error("Persisted validation route fixture was not found.");
  mutate(run);
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return { dbPath };
}

const publicationValidationTamperCases: Array<{
  label: string;
  mutate: (run: PersistedPublicationValidation) => void;
}> = [{
  label: "a divergent cached summary",
  mutate: (run) => {
    run.pTwoSided = run.pTwoSided === 0 ? 0.5 : 0;
  }
}, {
  label: "a schema-only partial seal",
  mutate: (run) => {
    delete run.validationRunEvidenceHash;
  }
}];

function routeSnapshot(dataGovernanceComplete = true, codingReliabilityComplete = true) {
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
    codingReliability: codingReliabilityComplete
      ? reliabilityDashboardToReview(buildSenaReliabilityDashboard([
          { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
          { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
          { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
          { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
        ]), "Route test")
      : undefined,
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
  afterEach(() => {
    if (originalExpertSigningSecret === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
    else process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = originalExpertSigningSecret;
    if (originalExpertSigningKeyId === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
    else process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = originalExpertSigningKeyId;
  });

  it("rejects legacy project publication when validation and expert authority are absent", async () => {
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
      const sourceSnapshot = routeSnapshot(true, false);
      expect(sourceSnapshot.report.modelCard.sections.find((section) => section.id === "coding-reliability")?.status)
        .toBe("needs-review");
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Route Publication Project",
        snapshot: sourceSnapshot
      });
      const unrelatedProject = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Unrelated route publication project",
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

      // Persisted enterprise DBs created before these evidence collections
      // were introduced remain readable. Publication's pre-budget raw-state
      // boundary must supply only shallow empty-array defaults; it must not
      // fall back to generic snapshot normalization.
      const legacyDbPath = path.join(enterpriseDbDir, "enterprise-db.json");
      const legacyDb = JSON.parse(readFileSync(legacyDbPath, "utf8")) as {
        adjudications?: unknown[];
        validationRuns?: unknown[];
        expertReviews?: unknown[];
        projects?: Array<{
          id: string;
          snapshot: ReturnType<typeof routeSnapshot>;
        }>;
        projectRevisions?: Array<{
          projectId: string;
          snapshot: ReturnType<typeof routeSnapshot>;
        }>;
      };
      delete legacyDb.adjudications;
      delete legacyDb.validationRuns;
      delete legacyDb.expertReviews;
      // The selected publication is independent of unrelated broken state.
      // Any generic state projection after the request-wide gate would import
      // this snapshot (and its initial revision) and fail the successful
      // request, proving that work escaped the reservation.
      for (const snapshot of [
        legacyDb.projects?.find((candidate) => candidate.id === unrelatedProject.id)?.snapshot,
        legacyDb.projectRevisions?.find((candidate) => candidate.projectId === unrelatedProject.id)?.snapshot
      ]) {
        if (snapshot) delete snapshot.analysis.temporalRuntimeTrace;
      }
      writeFileSync(legacyDbPath, JSON.stringify(legacyDb, null, 2));

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

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "Publication export requires one claim-ready package with approved current reliability, sealed validation, and receipt-authenticated expert evidence.",
        code: "publication_claim_evidence_not_ready"
      });
      expect(response.headers.get("x-sena-export-source")).toBeNull();
      expect(persistedPublicationSideEffects(legacyDbPath, project.id)).toEqual({
        auditEvents: [],
        jobs: []
      });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);

  it("returns a sanitized 413 before publication derivation and audit side effects", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-budget-route-"));
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
        name: "Publication Budget Exporter",
        email: "publication-budget-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Publication Budget Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const baseSnapshot = routeSnapshot(true, false);
      const budgetDataset = structuredClone(baseSnapshot.dataset);
      budgetDataset.people = [
        ...budgetDataset.people,
        ...Array.from({ length: 6 - budgetDataset.people.length }, (_, index) => ({
          id: `publication-budget-person-${index}`,
          label: `Publication budget person ${index}`,
          role: "Synthetic publication load",
          group: "Publication budget fixture"
        }))
      ];
      const budgetSnapshot = buildSenaProjectSnapshot(buildSenaModel(budgetDataset), {
        title: baseSnapshot.title,
        generatedAt: baseSnapshot.generatedAt,
        sourceDataset: budgetDataset,
        humanReview: baseSnapshot.report.humanReview,
        dataGovernance: baseSnapshot.dataGovernance
      });
      // Each existing phase-local reservation is still below the ceiling. The
      // route must reject because the complete request repeats canonical
      // import/report/validation/export derivations under one 50M budget.
      expect(() => assertSenaProjectSnapshotPublicationDerivationWorkBudget(budgetSnapshot))
        .not.toThrow();
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Publication Budget Project",
        snapshot: budgetSnapshot
      });
      const unrelatedProject = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Unrelated publication state project",
        snapshot: baseSnapshot
      });
      expect(unrelatedProject.id).not.toBe(project.id);
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Publication budget reliability reviewer")
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "Approved only to exercise route-level derivation admission."
      });
      const route = await import("../../../app/api/sena/exports/publication/route");
      const clone = vi.spyOn(globalThis, "structuredClone");
      let response: Response;
      try {
        response = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({ projectId: project.id, format: "html" })
        }));
        // The state contains two projects and their initial revisions. Raw auth
        // and publication reads must reach the selected request-wide admission
        // without invoking generic state normalization or snapshot import.
        expect(clone).not.toHaveBeenCalled();
      } finally {
        clone.mockRestore();
      }

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_derivation_too_complex"
      }));
      expect(enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.run",
        projectId: project.id,
        limit: 5
      }).events).toHaveLength(0);
      const jobs = await enterprise.listEnterpriseServerJobs({ projectId: project.id });
      expect(jobs.jobs).toHaveLength(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);

  it("blocks sync and queued publication before side effects when persisted model-card membership is empty or malformed", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-model-card-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    const queueRequests: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      queueRequests.push({ url: String(input), body: String(init?.body ?? "") });
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
        name: "Model Card Publication Exporter",
        email: "model-card-publication-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Model Card Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Empty Model Card Publication Project",
        snapshot: routeSnapshot()
      });
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Model card publication reliability reviewer")
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "Reliability projection cannot repair persisted model-card section membership."
      });
      const { dbPath } = mutatePersistedProjectSnapshot(
        enterpriseDbDir,
        project.id,
        (snapshot) => {
          snapshot.report.modelCard.sections = [];
          expect(snapshot.report.modelCard.renderGate.status).toBe("ready");
        }
      );
      configurePublicationAuthorizationSigning("publication-membership-test-v1");
      createClaimReadyPublicationEvidence(enterprise, registered.context, project, "Publication membership");

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
          code: "validation_run_evidence_invalid"
        }));
      }
      for (const sections of [
        [null],
        [7],
        [{ status: "complete" }]
      ]) {
        mutatePersistedProjectSnapshot(enterpriseDbDir, project.id, (snapshot) => {
          snapshot.report.modelCard.sections = sections as never;
        });
        const malformedResponse = await route.POST(request(false));
        expect(malformedResponse.status).toBe(409);
        await expect(malformedResponse.json()).resolves.toEqual(expect.objectContaining({
          code: "validation_run_evidence_invalid"
        }));
      }
      expect(queueRequests).toHaveLength(0);
      expect(persistedPublicationSideEffects(dbPath, project.id)).toEqual({
        auditEvents: [],
        jobs: []
      });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);

  it.each(publicationValidationTamperCases)(
    "blocks sync and queued publication before side effects when validation evidence has $label",
    async ({ mutate }) => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-validation-seal-route-"));
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
        name: "Validation Seal Publication Exporter",
        email: "validation-seal-publication-exporter@example.edu",
        password: "sena-secure-123",
        organization: "Validation Seal Publication Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Validation Seal Publication Project",
        snapshot: routeSnapshot()
      });
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Validation seal reliability reviewer")
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "Current machine-eligible reliability evidence."
      });
      const validationRun = enterprise.createEnterpriseValidationRun(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        preregistrationNote: "Publication validation full-run seal fixture.",
        methodNote: "Publication validation canonical evidence.",
        result: buildSenaGroupComparisonSuite({
          dataset: lessonStudySenaContract,
          defaultGroupField: "role",
          comparisons: [{
            groupField: "role",
            groupA: "Lead teacher",
            groupB: "Curriculum designer",
            metric: "bridgeScore"
          }],
          iterations: 100,
          bootstrapIterations: 100
        })
      });
      enterprise.reviewEnterpriseValidationRun(registered.context, validationRun.id, {
        status: "approved",
        notes: "Approved before the persisted full-run seal tamper."
      });
      const { dbPath } = mutatePersistedValidationRun(
        enterpriseDbDir,
        validationRun.id,
        mutate
      );

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
        await expect(response.json()).resolves.toEqual({
          error: "Stored validation evidence is not canonically bound to its reviewed result.",
          code: "validation_run_evidence_invalid"
        });
      }
      expect(queueRequests).toHaveLength(0);
      expect(persistedPublicationSideEffects(dbPath, project.id)).toEqual({
        auditEvents: [],
        jobs: []
      });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
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
      expect(body.code).toBe("publication_claim_evidence_not_ready");
      expect(body.error).toContain("approved current reliability, sealed validation, and receipt-authenticated expert evidence");
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
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Incomplete Human Review Publication Project",
        snapshot: routeSnapshot()
      });
      const reliabilityRun = enterprise.createEnterpriseReliabilityRun(
        registered.context,
        projectReliabilityRunInput(project, project.snapshot, "Human review publication reliability reviewer")
      );
      enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "Machine eligibility cannot substitute for complete publication human review."
      });
      const { dbPath } = mutatePersistedProjectSnapshot(
        enterpriseDbDir,
        project.id,
        (snapshot) => {
          snapshot.report.humanReview.interpretation = "Pending human review.";
          expect(snapshot.report.humanReview.status).toBe("human-reviewed");
          expect(snapshot.report.modelCard.renderGate.status).toBe("ready");
        }
      );
      configurePublicationAuthorizationSigning("publication-human-review-test-v1");
      createClaimReadyPublicationEvidence(enterprise, registered.context, project, "Publication human review");

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
          code: "validation_run_evidence_invalid"
        }));
      }
      expect(queueRequests).toHaveLength(0);
      expect(persistedPublicationSideEffects(dbPath, project.id)).toEqual({
        auditEvents: [],
        jobs: []
      });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, publicationExportRouteTestTimeoutMs);

  it("queues only a project-bound publication command when the evidence-bound worker is executable", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-publication-required-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS = "1";
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    const queueRequests: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      queueRequests.push({ url: String(input), body: String(init?.body ?? "") });
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
      configurePublicationAuthorizationSigning("publication-worker-test-v1");
      createClaimReadyPublicationEvidence(enterprise, registered.context, project, "Publication worker");

      const route = await import("../../../app/api/sena/exports/publication/route");
      const invalidFormatResponse = await route.POST(new Request("https://sena.example.test/api/sena/exports/publication", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          format: "zip"
        })
      }));
      expect(invalidFormatResponse.status).toBe(400);
      await expect(invalidFormatResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_format_invalid"
      }));
      expect(invalidFormatResponse.headers.get("x-sena-export-source")).toBeNull();
      expect(queueRequests).toHaveLength(0);

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

      expect(response.status).toBe(202);
      const body = await response.json() as {
        id?: string;
        kind?: string;
        status?: string;
        projectId?: string;
        payloadSummary?: {
          commandCustody?: string;
          commandEnvelopeUploadId?: string;
          commandEnvelopeSha256?: string;
          format?: string;
          projectVersion?: number;
        };
      };
      expect(body).toEqual(expect.objectContaining({
        kind: "publication-export",
        status: "queued",
        projectId: project.id
      }));
      expect(body.payloadSummary).toEqual(expect.objectContaining({
        commandCustody: "encrypted-upload-v1",
        commandEnvelopeUploadId: expect.stringMatching(/^upload_[a-f0-9]{24}$/),
        commandEnvelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        format: "package",
        projectVersion: project.currentVersion
      }));
      expect(queueRequests).toHaveLength(1);
      const delivered = JSON.parse(queueRequests[0].body) as {
        workerPayload?: Record<string, unknown>;
      };
      const worker = await import("../enterprise/server-job-worker-runtime");
      const workerOutcome = await worker.runEnterpriseServerJobFromQueueWebhook({
        jobId: body.id!,
        workerPayload: delivered.workerPayload
      });
      expect(workerOutcome).toEqual(expect.objectContaining({
        status: "succeeded",
        jobStatus: "succeeded",
        result: expect.objectContaining({
          publicationArtifactId: expect.stringMatching(/^upload_[a-f0-9]{24}$/),
          publicationFilename: expect.stringMatching(/\.sena-publication-package\.json$/),
          publicationSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          publicationBytes: expect.any(Number),
          publicationDerivationManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        })
      }));
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
      expect(inlineResponse.status).toBe(413);
      await expect(inlineResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_request_too_large"
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
          snapshot: {},
          format: "html",
          queue: true
        })
      }));
      expect(mixedSourceResponse.status).toBe(400);
      await expect(mixedSourceResponse.json()).resolves.toEqual(expect.objectContaining({
        code: "publication_export_inline_snapshot_forbidden"
      }));
      expect(queueRequests).toHaveLength(1);
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
      createClaimReadyPublicationEvidence(
        enterprise,
        registered.context,
        incompleteProject,
        "Incomplete publication worker"
      );
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
        code: "publication_claim_evidence_not_ready"
      }));
      expect(queueRequests).toHaveLength(1);
      const jobs = await enterprise.listEnterpriseServerJobs({});
      expect(jobs.summary.total).toBe(1);
      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.queue",
        limit: 5
      });
      expect(audit.events).toHaveLength(1);
      expect(enterprise.listEnterpriseAuditLog(registered.context, {
        event: "export.run",
        limit: 5
      }).events).toHaveLength(1);
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
  }, publicationWorkerRouteTestTimeoutMs);

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
      configurePublicationAuthorizationSigning("publication-postgres-test-v1");
      await createClaimReadyPublicationEvidenceAsync(
        registered.context,
        project,
        "Postgres publication"
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
      expect(body.enterpriseProjectEvidence?.claimPackage?.status).toBe("claim-ready-with-limits");
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
