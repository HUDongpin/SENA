import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaProjectSnapshot } from "../snapshot";

const routeTimeoutMs = 30_000;

afterEach(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_JOB_QUEUE_ADAPTER;
  delete process.env.SENA_JOB_QUEUE_URL;
  delete process.env.SENA_JOB_QUEUE_SECRET;
  delete process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD;
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function authenticatedRouteContext(prefix: string) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  let sessionToken = "";
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

  const enterprise = await import("../enterprise");
  const registered = enterprise.registerEnterpriseUser({
    name: "Analytical Validation Reviewer",
    email: `${prefix}@example.edu`,
    password: "sena-secure-123",
    organization: "Analytical Validation Lab",
    plan: "lab"
  });
  sessionToken = registered.token;
  const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
  return {
    registered,
    csrf: csrf.token,
    enterprise,
    cleanup: () => rmSync(enterpriseDbDir, { recursive: true, force: true })
  };
}

async function expectNumericDomainError(
  response: Response,
  forbiddenRawValue: string,
  expectedIssue: { path: string; rule: string }
) {
  expect(response.status).toBe(400);
  const body = await response.json() as { error?: string; code?: string; issues?: Array<{ path: string; rule: string }> };
  expect(body).toEqual({
    error: "SENA analytical inputs violate the numeric domain.",
    code: "invalid_sena_numeric_domain",
    issues: expect.arrayContaining([expectedIssue])
  });
  expect(JSON.stringify(body)).not.toContain(forbiddenRawValue);
}

function snapshotWithNegativeAlpha() {
  const dataset = structuredClone(lessonStudySenaContract);
  const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
    title: "Negative effective source fixture",
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset
  });
  snapshot.reproducibility.buildOptions.alpha = -4321;
  return snapshot;
}

describe("SENA analytical input HTTP errors", () => {
  it("returns a redacted 400 for invalid analysis build options", async () => {
    vi.resetModules();
    const context = await authenticatedRouteContext("sena-invalid-analysis-");
    try {
      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-sena-csrf-token": context.csrf },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          dataset: lessonStudySenaContract,
          buildOptions: { alpha: -9876 }
        })
      }));

      await expectNumericDomainError(response, "-9876", {
        path: "buildOptions.alpha",
        rule: "finite-nonnegative"
      });
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("rejects invalid queued analysis options before dispatch", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-analysis-queue-");
    try {
      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": context.csrf,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          dataset: lessonStudySenaContract,
          queue: true,
          buildOptions: { beta: -8765 }
        })
      }));

      await expectNumericDomainError(response, "-8765", {
        path: "buildOptions.beta",
        rule: "finite-nonnegative"
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("rejects an invalid queued analysis dataset before dispatch", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-analysis-data-queue-");
    try {
      const dataset = structuredClone(lessonStudySenaContract);
      dataset.interactions[0].weight = -6543;
      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": context.csrf,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          dataset,
          queue: true
        })
      }));

      await expectNumericDomainError(response, "-6543", {
        path: "dataset.interactions[0].weight",
        rule: "finite-nonnegative"
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("returns a redacted 400 for invalid group-comparison build options", async () => {
    vi.resetModules();
    const context = await authenticatedRouteContext("sena-invalid-validation-");
    try {
      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: { "content-type": "application/json", "x-sena-csrf-token": context.csrf },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          dataset: lessonStudySenaContract,
          groupField: "group",
          groupA: "Experimental",
          groupB: "Control",
          iterations: 100,
          buildOptions: { gamma: -7654 }
        })
      }));

      await expectNumericDomainError(response, "-7654", {
        path: "buildOptions.gamma",
        rule: "finite-nonnegative"
      });
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("returns a redacted 400 when an import-build source has a negative interaction", async () => {
    vi.resetModules();
    const context = await authenticatedRouteContext("sena-invalid-import-");
    try {
      const form = new FormData();
      form.set("teamId", context.registered.context.teams[0].id);
      form.append("files", new File([
        "source,target,weight,channel,stage,evidence\np1,p2,-5432,reply,Teach,private-row-marker\n"
      ], "negative-interactions.csv", { type: "text/csv" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
        method: "POST",
        headers: { "x-sena-csrf-token": context.csrf },
        body: form
      }));

      await expectNumericDomainError(response, "-5432", {
        path: "dataset.interactions[0].weight",
        rule: "finite-nonnegative"
      });
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("validates an effective analysis snapshot before managed-queue dispatch", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-effective-analysis-");
    try {
      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": context.csrf,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          snapshot: snapshotWithNegativeAlpha(),
          queue: true
        })
      }));

      await expectNumericDomainError(response, "-4321", {
        path: "buildOptions.alpha",
        rule: "finite-nonnegative"
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("validates an effective group-comparison snapshot before managed-queue dispatch", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-effective-validation-");
    try {
      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": context.csrf,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          snapshot: snapshotWithNegativeAlpha(),
          queue: true,
          groupField: "group",
          groupA: "Experimental",
          groupB: "Control",
          iterations: 100,
          bootstrapIterations: 100
        })
      }));

      await expectNumericDomainError(response, "-4321", {
        path: "buildOptions.alpha",
        rule: "finite-nonnegative"
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("rejects every supplied malformed group-comparison control before queued dispatch", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-validation-controls-");
    try {
      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const base = {
        teamId: context.registered.context.teams[0].id,
        dataset: lessonStudySenaContract,
        queue: true,
        groupField: "group",
        groupA: "Experimental",
        groupB: "Control",
        metric: "socialStrength",
        iterations: 100,
        bootstrapIterations: 100
      };
      const cases = [
        [{ metric: "typo" }, { path: "metric", rule: "supported-value" }],
        [{ metrics: ["typo"] }, { path: "metrics[0]", rule: "supported-value" }],
        [{ groupField: "cohort" }, { path: "groupField", rule: "supported-value" }],
        [{ groupA: 3 }, { path: "groupA", rule: "nonempty-string" }],
        [{ groupB: "Experimental" }, { path: "groupB", rule: "distinct-values" }],
        [{ comparisons: "not-an-array", suite: true }, { path: "comparisons", rule: "array" }],
        [{ iterations: "100" }, { path: "iterations", rule: "integer-range" }],
        [{ bootstrapIterations: 100.5 }, { path: "bootstrapIterations", rule: "integer-range" }],
        [{ seed: -1 }, { path: "seed", rule: "integer-range" }],
        [{ seed: 0x100000000 }, { path: "seed", rule: "integer-range" }],
        [{ alpha: 0, suite: true }, { path: "alpha", rule: "finite-range" }],
        [{ suite: "true" }, { path: "suite", rule: "boolean" }]
      ] as const;

      const responses = await Promise.all(cases.map(async ([override, issue]) => {
        const response = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": context.csrf,
            prefer: "respond-async"
          },
          body: JSON.stringify({ ...base, ...override })
        }));
        return { response, issue };
      }));

      for (const { response, issue } of responses) {
        await expectNumericDomainError(response, "not-present-in-response", issue);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("rejects seed 2^32 on the synchronous group-comparison path", async () => {
    vi.resetModules();
    const context = await authenticatedRouteContext("sena-invalid-validation-seed-sync-");
    try {
      const route = await import("../../../app/api/sena/validation/group-comparison/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: { "content-type": "application/json", "x-sena-csrf-token": context.csrf },
        body: JSON.stringify({
          teamId: context.registered.context.teams[0].id,
          dataset: lessonStudySenaContract,
          groupField: "group",
          groupA: "Experimental",
          groupB: "Control",
          iterations: 100,
          bootstrapIterations: 100,
          seed: 0x100000000
        })
      }));

      await expectNumericDomainError(response, "4294967296", {
        path: "seed",
        rule: "integer-range"
      });
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("preflights queued import adapters before upload, job, fetch, or audit side effects", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-import-queue-preflight-");
    try {
      const form = new FormData();
      form.set("teamId", context.registered.context.teams[0].id);
      form.set("queue", "true");
      form.append("files", new File([
        [
          "source,target,weight,channel,stage,turn_index,evidence",
          "p1,p2,-76543,reply,Teach,1,private-negative-marker",
          "p2,p1,NaN,reply,Teach,2,private-nan-marker",
          "p1,p2,Infinity,reply,Teach,3,private-infinity-marker"
        ].join("\n")
      ], "invalid-interactions.csv", { type: "text/csv" }));
      form.append("files", new File([
        [
          "segment_id,utterance_id,person_id,target_person_ids,unit_id,stanza_id,stage,turn_index,text,codes,confidence",
          "s1,u1,p1,,u1,st1,Teach,1,private confidence marker,question,1.5"
        ].join("\n")
      ], "invalid-coded_segments.csv", { type: "text/csv" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
        method: "POST",
        headers: { "x-sena-csrf-token": context.csrf, prefer: "respond-async" },
        body: form
      }));

      expect(response.status).toBe(400);
      const body = await response.json() as {
        error?: string;
        code?: string;
        issues?: Array<{ path: string; rule: string }>;
      };
      expect(body).toEqual({
        error: "SENA analytical inputs violate the numeric domain.",
        code: "invalid_sena_numeric_domain",
        issues: expect.arrayContaining([
          { path: "dataset.interactions[0].weight", rule: "finite-nonnegative" },
          { path: "dataset.interactions[1].weight", rule: "finite-nonnegative" },
          { path: "dataset.interactions[2].weight", rule: "finite-nonnegative" },
          { path: "dataset.coded_segments[0].confidence", rule: "finite-probability" }
        ])
      });
      expect(JSON.stringify(body)).not.toMatch(/76543|private|Infinity|NaN/);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(context.enterprise.listEnterpriseUploads(context.registered.context, context.registered.context.teams[0].id)).toEqual([]);
      expect(context.enterprise.listEnterpriseImportRuns(context.registered.context, context.registered.context.teams[0].id)).toEqual([]);
      expect(context.enterprise.listEnterpriseAuditLog(context.registered.context, { event: "import.queue", limit: 5 }).events).toEqual([]);
      const queue = await import("../enterprise/server-job-queue");
      expect((await queue.listEnterpriseServerJobs({ teamId: context.registered.context.teams[0].id })).jobs).toEqual([]);
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);

  it("validates a stale persisted project snapshot before either queued analysis path dispatches", async () => {
    vi.resetModules();
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const context = await authenticatedRouteContext("sena-invalid-project-source-");
    try {
      const project = context.enterprise.createEnterpriseProject(context.registered.context, {
        teamId: context.registered.context.teams[0].id,
        title: "Stale analytical source",
        snapshot: snapshotWithNegativeAlpha()
      });
      const analyzeRoute = await import("../../../app/api/sena/analyze/route");
      const validationRoute = await import("../../../app/api/sena/validation/group-comparison/route");
      const analyzeResponse = await analyzeRoute.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": context.csrf,
          prefer: "respond-async"
        },
        body: JSON.stringify({ projectId: project.id, queue: true })
      }));
      const validationResponse = await validationRoute.POST(new Request("https://sena.example.test/api/sena/validation/group-comparison", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": context.csrf,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          groupField: "group",
          groupA: "Experimental",
          groupB: "Control",
          iterations: 100,
          bootstrapIterations: 100
        })
      }));

      for (const response of [analyzeResponse, validationResponse]) {
        await expectNumericDomainError(response, "-4321", {
          path: "buildOptions.alpha",
          rule: "finite-nonnegative"
        });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);
});
