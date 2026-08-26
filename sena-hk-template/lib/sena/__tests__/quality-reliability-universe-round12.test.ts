import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSenaReliabilityJsonRequest } from "../reliability-api";
import {
  assertSenaReliabilityUniverseWithinLimits,
  buildSenaReliabilityDashboard,
  preflightSenaReliabilityAnnotations,
  SENA_RELIABILITY_UNIVERSE_LIMITS,
  type SenaCoderAnnotation
} from "../reliability";

const declaredUnitCap = SENA_RELIABILITY_UNIVERSE_LIMITS.binaryUnits;

function oversizedAnnotations(size = 300): SenaCoderAnnotation[] {
  const rows: SenaCoderAnnotation[] = [];
  for (let item = 0; item < size; item += 1) {
    rows.push({ coderId: "coder-a", itemId: `item-${item}`, codeId: "code-0", value: item % 2 === 0 });
  }
  for (let code = 0; code < size; code += 1) {
    rows.push({ coderId: "coder-b", itemId: "item-0", codeId: `code-${code}`, value: code % 2 === 0 });
  }
  return rows;
}

function rawRows(annotations: SenaCoderAnnotation[]) {
  return annotations.map((annotation) => ({
    coder_id: annotation.coderId,
    item_id: annotation.itemId,
    code_id: annotation.codeId,
    value: annotation.value ? "1" : "0"
  }));
}

function expectUniverseError(error: unknown) {
  expect(error).toMatchObject({
    name: "SenaReliabilityUniverseLimitError",
    status: 400,
    code: "reliability_universe_limit_exceeded",
    issues: [{
      path: "annotations",
      rule: `binary-unit-count-at-most-${declaredUnitCap}`,
      actual: 90_000,
      maximum: declaredUnitCap
    }]
  });
  expect(String((error as Error).message)).not.toContain("item-299");
}

afterEach(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_JOB_QUEUE_ADAPTER;
  delete process.env.SENA_JOB_QUEUE_URL;
  delete process.env.SENA_JOB_QUEUE_SECRET;
  delete process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Round12 bounded coding-reliability universe", () => {
  it("rejects a sparse 300 x 300 x 2 universe before unit flatMap/allocation work", () => {
    const flatMap = vi.spyOn(Array.prototype, "flatMap");
    let thrown: unknown;
    try {
      buildSenaReliabilityDashboard(oversizedAnnotations());
    } catch (error) {
      thrown = error;
    }

    expectUniverseError(thrown);
    expect(flatMap).not.toHaveBeenCalled();
  });

  it("uses the same typed preallocation boundary in the direct JSON API", () => {
    let thrown: unknown;
    try {
      prepareSenaReliabilityJsonRequest({ annotations: rawRows(oversizedAnnotations()) });
    } catch (error) {
      thrown = error;
    }
    expectUniverseError(thrown);
  });

  it("rejects exactly binary-unit cap plus one before cartesian allocation", () => {
    const annotations = Array.from({ length: declaredUnitCap + 1 }, (_, code): SenaCoderAnnotation => ({
      coderId: "coder-a",
      itemId: "item-0",
      codeId: `code-${code}`,
      value: code % 2 === 0
    }));
    const flatMap = vi.spyOn(Array.prototype, "flatMap");

    expect(() => buildSenaReliabilityDashboard(annotations)).toThrow(expect.objectContaining({
      issues: [expect.objectContaining({ actual: declaredUnitCap + 1, maximum: declaredUnitCap })]
    }));
    expect(flatMap).not.toHaveBeenCalled();
  });

  it("rejects raw annotation row cap plus one before dashboard derivation work", () => {
    const annotation: SenaCoderAnnotation = {
      coderId: "coder-a",
      itemId: "item-0",
      codeId: "code-0",
      value: true
    };
    const annotations = Array.from(
      { length: SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows + 1 },
      () => annotation
    );

    expect(() => preflightSenaReliabilityAnnotations(annotations)).toThrow(expect.objectContaining({
      name: "SenaReliabilityUniverseLimitError",
      status: 400,
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: `annotation-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows}`,
        actual: SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows + 1,
        maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows
      }]
    }));
  });

  it("rejects assignment-cell cap plus one and safe-integer overflow in the shared preflight", () => {
    expect(() => assertSenaReliabilityUniverseWithinLimits({
      itemCount: 1,
      codeCount: 1,
      coderCount: SENA_RELIABILITY_UNIVERSE_LIMITS.assignmentCells + 1
    })).toThrow(expect.objectContaining({
      issues: [expect.objectContaining({
        rule: `assignment-cell-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.assignmentCells}`,
        actual: SENA_RELIABILITY_UNIVERSE_LIMITS.assignmentCells + 1
      })]
    }));
    expect(() => assertSenaReliabilityUniverseWithinLimits({
      itemCount: Number.MAX_SAFE_INTEGER,
      codeCount: 2,
      coderCount: 1
    })).toThrow(expect.objectContaining({
      issues: expect.arrayContaining([
        expect.objectContaining({ actual: "safe-integer-overflow" }),
        expect.objectContaining({
          rule: `algorithm-work-evaluation-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.algorithmWorkEvaluations}`,
          actual: "safe-integer-overflow"
        })
      ])
    }));
  });

  it("returns a sanitized 400 and performs no queue/upload dispatch side effects", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-round12-reliability-universe-"));
    let sessionToken = "";
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round12-test-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
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
      const uploads = await import("../enterprise/import-analysis");
      const jobs = await import("../enterprise/server-job-queue");
      const registered = enterprise.registerEnterpriseUser({
        name: "Round12 Universe Reviewer",
        email: "round12-universe@example.edu",
        password: "sena-secure-123",
        organization: "Round12 Reliability Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const teamId = registered.context.teams[0].id;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const route = await import("../../../app/api/sena/reliability/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          teamId,
          reviewer: "Round12 Universe Reviewer",
          annotations: rawRows(oversizedAnnotations())
        })
      }));
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body).toEqual({
        error: "SENA coding-reliability input exceeds the supported analysis universe.",
        code: "reliability_universe_limit_exceeded",
        issues: [{
          path: "annotations",
          rule: `binary-unit-count-at-most-${declaredUnitCap}`,
          actual: 90_000,
          maximum: declaredUnitCap
        }]
      });
      expect(JSON.stringify(body)).not.toContain("item-299");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(uploads.listEnterpriseUploads(registered.context, teamId)).toHaveLength(0);
      expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    } finally {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
    }
  }, 30_000);
});
