import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A1 (security half): in the default tokenless configuration `/api/sena/ops/jobs`
 * gated only on "is there a live session", so any signed-in user could read and
 * mutate every other team's server jobs. These tests pin the tenant boundary in
 * session mode, and pin that the bearer/automation path keeps its deliberate
 * cross-team reach.
 */

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_MAX_ATTEMPTS",
  "SENA_OPS_TOKEN",
  "SENA_OPS_AUTOMATION_TOKEN"
];

type JobListBody = {
  summary?: { total?: number };
  jobs?: Array<{ id?: string; teamId?: string }>;
  code?: string;
};

function jobPayload(teamId: string) {
  return {
    kind: "analysis" as const,
    teamId,
    projectId: `project_${teamId}`,
    payload: { action: "run-analysis", projectId: `project_${teamId}` },
    payloadSummary: {
      source: "project",
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    } as const
  };
}

describe("SENA server job ops route tenant scope", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.resetModules();
  });

  it("confines session-mode reads and mutations to the caller's own team", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-scope-session-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    // No SENA_OPS_TOKEN: this is the default tokenless (session) configuration.

    let sessionToken = "";
    vi.resetModules();
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const teamA = enterprise.registerEnterpriseUser({
        name: "Scope Owner A",
        email: "server-job-scope-a@example.edu",
        password: "sena-secure-123",
        organization: "Server Job Scope Lab A",
        plan: "lab"
      });
      const teamB = enterprise.registerEnterpriseUser({
        name: "Scope Owner B",
        email: "server-job-scope-b@example.edu",
        password: "sena-secure-123",
        organization: "Server Job Scope Lab B",
        plan: "lab"
      });
      const teamAId = teamA.context.teams[0].id;
      const teamBId = teamB.context.teams[0].id;
      expect(teamAId).not.toBe(teamBId);

      const jobA = await enterprise.enqueueEnterpriseServerJob({
        ...jobPayload(teamAId),
        actorUserId: teamA.context.user.id
      });
      const jobB = await enterprise.enqueueEnterpriseServerJob({
        ...jobPayload(teamBId),
        actorUserId: teamB.context.user.id
      });

      const route = await import("../../../app/api/sena/ops/jobs/route");

      // Team B's owner is signed in for every request below.
      sessionToken = teamB.token;
      const csrfB = enterprise.createEnterpriseCsrfToken(teamB.context);

      // 1. An unscoped list must not hand back the whole estate.
      const unscopedResponse = await route.GET(new Request("https://sena.example.test/api/sena/ops/jobs"));
      const unscopedBody = await unscopedResponse.json() as JobListBody;
      expect(unscopedResponse.status, JSON.stringify(unscopedBody)).toBe(400);
      expect(unscopedBody.code).toBe("server_job_team_required");
      expect(JSON.stringify(unscopedBody)).not.toContain(jobA.id);

      // 2. Naming another tenant's team is a permission failure, not a filter.
      const foreignListResponse = await route.GET(new Request(
        `https://sena.example.test/api/sena/ops/jobs?teamId=${encodeURIComponent(teamAId)}`
      ));
      const foreignListBody = await foreignListResponse.json() as JobListBody;
      expect(foreignListResponse.status, JSON.stringify(foreignListBody)).toBe(403);
      expect(foreignListBody.code).toBe("permission_denied");
      expect(JSON.stringify(foreignListBody)).not.toContain(jobA.id);

      // 3. The caller's own team still works, and sees only its own jobs.
      const ownListResponse = await route.GET(new Request(
        `https://sena.example.test/api/sena/ops/jobs?teamId=${encodeURIComponent(teamBId)}`
      ));
      const ownListBody = await ownListResponse.json() as JobListBody;
      expect(ownListResponse.status, JSON.stringify(ownListBody)).toBe(200);
      expect(ownListBody.jobs?.map((job) => job.id)).toEqual([jobB.id]);
      expect(ownListBody.summary?.total).toBe(1);

      const mutationHeaders = {
        "content-type": "application/json",
        "x-sena-csrf-token": csrfB.token
      };

      // 4a. Claiming another tenant's team is refused outright.
      const foreignTeamMutation = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({ action: "mark-failed", jobId: jobA.id, teamId: teamAId, errorCode: "cross_tenant" })
      }));
      expect(foreignTeamMutation.status).toBe(403);
      expect((await foreignTeamMutation.json() as { code?: string }).code).toBe("permission_denied");

      // 4b. And declaring a team they do own does not buy them a foreign job.
      const foreignJobMutation = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({ action: "mark-failed", jobId: jobA.id, teamId: teamBId, errorCode: "cross_tenant" })
      }));
      const foreignJobBody = await foreignJobMutation.json() as { code?: string };
      expect(foreignJobMutation.status, JSON.stringify(foreignJobBody)).toBe(403);
      expect(foreignJobBody.code).toBe("permission_denied");

      // 4c. Omitting the team does not fall back to an unscoped mutation.
      const unscopedMutation = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({ action: "mark-failed", jobId: jobA.id, errorCode: "cross_tenant" })
      }));
      expect(unscopedMutation.status).toBe(400);
      expect((await unscopedMutation.json() as { code?: string }).code).toBe("server_job_team_required");

      // ...and team A's job is untouched by all three attempts.
      const untouched = await enterprise.getEnterpriseServerJob(jobA.id);
      expect(untouched.status).toBe("queued");
      expect(untouched.lifecycle.attempts).toBe(0);

      // 5. Acting on the caller's own job still works.
      const ownMutationResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          action: "mark-running",
          jobId: jobB.id,
          teamId: teamBId,
          workerRunId: "worker_run_scope"
        })
      }));
      const ownMutationBody = await ownMutationResponse.json() as { job?: { status?: string } };
      expect(ownMutationResponse.status, JSON.stringify(ownMutationBody)).toBe(200);
      expect(ownMutationBody.job?.status).toBe("running");
    } finally {
      vi.doUnmock("next/headers");
      vi.doUnmock("@/lib/sena/enterprise");
      vi.doUnmock("@/lib/sena/api-helpers");
      vi.resetModules();
    }
  });

  it("enforces the tenant boundary at the queue layer, not only in the route", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-scope-queue-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";

    vi.resetModules();
    const enterprise = await import("../enterprise");
    const teamA = enterprise.registerEnterpriseUser({
      name: "Queue Scope Owner A",
      email: "queue-scope-a@example.edu",
      password: "sena-secure-123",
      organization: "Queue Scope Lab A",
      plan: "lab"
    });
    const teamB = enterprise.registerEnterpriseUser({
      name: "Queue Scope Owner B",
      email: "queue-scope-b@example.edu",
      password: "sena-secure-123",
      organization: "Queue Scope Lab B",
      plan: "lab"
    });
    const teamAId = teamA.context.teams[0].id;
    const teamBId = teamB.context.teams[0].id;

    const jobA = await enterprise.enqueueEnterpriseServerJob({
      ...jobPayload(teamAId),
      actorUserId: teamA.context.user.id
    });
    await enterprise.enqueueEnterpriseServerJob({
      ...jobPayload(teamBId),
      actorUserId: teamB.context.user.id
    });

    const scopeB = { teamId: teamBId, memberships: teamB.context.memberships };

    // A caller scope pins the read to its own team even when the filter says
    // otherwise, so a future route cannot forget to pass the filter.
    const scoped = await enterprise.listEnterpriseServerJobs({ callerScope: scopeB });
    expect(scoped.jobs.every((job) => job.teamId === teamBId)).toBe(true);
    expect(scoped.summary.total).toBe(1);

    await expect(enterprise.listEnterpriseServerJobs({
      teamId: teamAId,
      callerScope: scopeB
    })).rejects.toMatchObject({ status: 403 });

    await expect(enterprise.updateEnterpriseServerJobStatus({
      jobId: jobA.id,
      action: "mark-succeeded",
      callerScope: scopeB
    })).rejects.toMatchObject({ status: 403 });

    // A scope whose membership carries no team:manage right is refused too.
    await expect(enterprise.listEnterpriseServerJobs({
      callerScope: {
        teamId: teamBId,
        memberships: teamB.context.memberships.map((membership) => ({ ...membership, role: "viewer" as const }))
      }
    })).rejects.toMatchObject({ status: 403 });
  });

  it("leaves the bearer/automation path cross-team by design", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-scope-bearer-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

    vi.resetModules();
    const enterprise = await import("../enterprise");
    const teamA = enterprise.registerEnterpriseUser({
      name: "Bearer Scope Owner A",
      email: "bearer-scope-a@example.edu",
      password: "sena-secure-123",
      organization: "Bearer Scope Lab A",
      plan: "lab"
    });
    const teamB = enterprise.registerEnterpriseUser({
      name: "Bearer Scope Owner B",
      email: "bearer-scope-b@example.edu",
      password: "sena-secure-123",
      organization: "Bearer Scope Lab B",
      plan: "lab"
    });
    const jobA = await enterprise.enqueueEnterpriseServerJob({
      ...jobPayload(teamA.context.teams[0].id),
      actorUserId: teamA.context.user.id
    });
    const jobB = await enterprise.enqueueEnterpriseServerJob({
      ...jobPayload(teamB.context.teams[0].id),
      actorUserId: teamB.context.user.id
    });

    const route = await import("../../../app/api/sena/ops/jobs/route");
    const authHeaders = { authorization: "Bearer sena-test-ops-token" };

    // The worker callback has no session and no team: it still sees every team.
    const listResponse = await route.GET(new Request("https://sena.example.test/api/sena/ops/jobs", {
      headers: authHeaders
    }));
    const listBody = await listResponse.json() as JobListBody & { access?: { mode?: string } };
    expect(listResponse.status, JSON.stringify(listBody)).toBe(200);
    expect(listBody.access?.mode).toBe("bearer");
    expect(listBody.jobs?.map((job) => job.id).sort()).toEqual([jobA.id, jobB.id].sort());

    // And it can still drive either team's lifecycle.
    for (const jobId of [jobA.id, jobB.id]) {
      const response = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ action: "mark-running", jobId })
      }));
      const body = await response.json() as { job?: { status?: string } };
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.job?.status).toBe("running");
    }
  });
});
