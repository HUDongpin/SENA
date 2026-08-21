import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SENA_RELIABILITY_UNIVERSE_LIMITS } from "../reliability";

type QueueMode = "local" | "managed";

function itemUniverseCsv(size = 300) {
  return [
    "coder_id,item_id,code_id,value",
    ...Array.from({ length: size }, (_, index) => `coder-a,item-${index},code-0,${index % 2}`)
  ].join("\n");
}

function codeUniverseCsv(size = 300) {
  return [
    "coder_id,item_id,code_id,value",
    ...Array.from({ length: size }, (_, index) => `coder-b,item-0,code-${index},${index % 2}`)
  ].join("\n");
}

function resetQueueEnvironment() {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_JOB_QUEUE_ADAPTER;
  delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
  delete process.env.SENA_JOB_QUEUE_URL;
  delete process.env.SENA_JOB_QUEUE_SECRET;
}

async function runExistingPointerUniverseCase(mode: QueueMode) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round13-pointer-${mode}-`));
  let sessionToken = "";
  resetQueueEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = mode;
  if (mode === "local") {
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  } else {
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round13-pointer-test-secret";
  }
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
    const importAnalysis = await import("../enterprise/import-analysis");
    const jobs = await import("../enterprise/server-job-queue");
    const registered = enterprise.registerEnterpriseUser({
      name: `Round13 ${mode} pointer reviewer`,
      email: `round13-pointer-${mode}@example.edu`,
      password: "sena-secure-123",
      organization: "Round13 Reliability Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const sourceUploads = await importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(registered.context, {
      teamId,
      files: [
        {
          name: "round13-items.csv",
          contentType: "text/csv",
          bytes: Buffer.from(itemUniverseCsv(), "utf8"),
          importProfile: "reliability"
        },
        {
          name: "round13-codes.csv",
          contentType: "text/csv",
          bytes: Buffer.from(codeUniverseCsv(), "utf8"),
          importProfile: "reliability"
        }
      ]
    });
    const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;

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
        reviewer: "Round13 Pointer Reviewer",
        uploadIds: sourceUploads.map((upload) => upload.id)
      })
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "SENA coding-reliability input exceeds the supported analysis universe.",
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: `binary-unit-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.binaryUnits}`,
        actual: 90_000,
        maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.binaryUnits
      }]
    });
    expect(importAnalysis.listEnterpriseUploads(registered.context, teamId)).toEqual(uploadsBefore);
    expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    resetQueueEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

async function runRejectedPointerIntegrityCase(kind: "foreign-team" | "tampered") {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round13-pointer-${kind}-`));
  let sessionToken = "";
  resetQueueEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "local";
  process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
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
    const importAnalysis = await import("../enterprise/import-analysis");
    const jobs = await import("../enterprise/server-job-queue");
    const requester = enterprise.registerEnterpriseUser({
      name: "Round13 Pointer Requester",
      email: `round13-pointer-requester-${kind}@example.edu`,
      password: "sena-secure-123",
      organization: "Round13 Requester Lab",
      plan: "lab"
    });
    const uploadOwner = kind === "foreign-team"
      ? enterprise.registerEnterpriseUser({
        name: "Round13 Foreign Pointer Owner",
        email: "round13-pointer-foreign-owner@example.edu",
        password: "sena-secure-123",
        organization: "Round13 Foreign Lab",
        plan: "lab"
      })
      : requester;
    sessionToken = requester.token;
    const teamId = requester.context.teams[0].id;
    const ownerTeamId = uploadOwner.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(requester.context);
    const [sourceUpload] = await importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(uploadOwner.context, {
      teamId: ownerTeamId,
      files: [{
        name: "round13-pointer-integrity.csv",
        contentType: "text/csv",
        bytes: Buffer.from(itemUniverseCsv(2), "utf8"),
        importProfile: "reliability"
      }]
    });
    if (kind === "tampered") {
      writeFileSync(path.join(enterpriseDbDir, sourceUpload.storagePath), Buffer.from("{}", "utf8"));
    }
    const uploadsBefore = importAnalysis.listEnterpriseUploads(requester.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(requester.context, { teamId, limit: 500 }).events;
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
        reviewer: "Round13 Pointer Reviewer",
        uploadIds: [sourceUpload.id]
      })
    }));
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(kind === "foreign-team" ? 404 : 500);
    expect(body.code).toBe(kind === "foreign-team" ? "upload_not_found" : "upload_blob_envelope_invalid");
    expect(importAnalysis.listEnterpriseUploads(requester.context, teamId)).toEqual(uploadsBefore);
    expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    expect(enterprise.listEnterpriseAuditLog(requester.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
  } finally {
    resetQueueEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

describe("Round13 existing reliability upload-pointer preflight", () => {
  afterEach(() => {
    resetQueueEnvironment();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each(["local", "managed"] as const)(
    "merges existing %s pointers and rejects their combined 90k-unit universe before side effects",
    async (mode) => runExistingPointerUniverseCase(mode),
    30_000
  );

  it.each(["foreign-team", "tampered"] as const)(
    "rejects a %s pointer before reviewer, job, or audit mutations",
    async (kind) => runRejectedPointerIntegrityCase(kind),
    30_000
  );
});
