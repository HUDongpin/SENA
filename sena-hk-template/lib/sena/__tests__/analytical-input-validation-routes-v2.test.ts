import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lessonStudySenaContract } from "../pilot-assets";

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
    cleanup: () => rmSync(enterpriseDbDir, { recursive: true, force: true })
  };
}

async function expectNumericDomainError(response: Response, forbiddenRawValue: string) {
  expect(response.status).toBe(400);
  const body = await response.json() as { error?: string; code?: string };
  expect(body).toEqual({
    error: "SENA analytical inputs violate the numeric domain.",
    code: "invalid_sena_numeric_domain"
  });
  expect(JSON.stringify(body)).not.toContain(forbiddenRawValue);
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

      await expectNumericDomainError(response, "-9876");
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

      await expectNumericDomainError(response, "-8765");
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

      await expectNumericDomainError(response, "-6543");
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

      await expectNumericDomainError(response, "-7654");
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

      await expectNumericDomainError(response, "-5432");
    } finally {
      context.cleanup();
    }
  }, routeTimeoutMs);
});
