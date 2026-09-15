import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_MAX_ATTEMPTS",
  "SENA_OPS_TOKEN"
];

describe("SENA server job ops route", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.resetModules();
  });

  it("lists worker jobs and records running, dead-letter, and force-retry status updates", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-ops-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_JOB_QUEUE_MAX_ATTEMPTS = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Server Job Owner",
      email: "server-job-owner@example.edu",
      password: "sena-secure-123",
      organization: "Server Job Lab",
      plan: "lab"
    });
    const job = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: registered.context.teams[0].id,
      projectId: "project_status_test",
      actorUserId: registered.context.user.id,
      payload: {
        action: "run-analysis",
        projectId: "project_status_test",
        projectVersion: 1
      },
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const route = await import("../../../app/api/sena/ops/jobs/route");
    const authHeaders = {
      authorization: "Bearer sena-test-ops-token"
    };

    const listResponse = await route.GET(new Request("https://sena.example.test/api/sena/ops/jobs?status=queued", {
      headers: authHeaders
    }));
    const listBody = await listResponse.json() as {
      schemaVersion?: string;
      summary?: { total?: number; queued?: number };
      jobs?: Array<{ id?: string; status?: string; lifecycle?: { maxAttempts?: number } }>;
    };
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("x-sena-server-job-total")).toBe("1");
    expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-ops-jobs");
    expect(listBody.schemaVersion).toBe("sena-enterprise-server-job-list/v1");
    expect(listBody.summary).toEqual(expect.objectContaining({
      total: 1,
      queued: 1
    }));
    expect(listBody.jobs?.[0]).toEqual(expect.objectContaining({
      id: job.id,
      status: "queued"
    }));
    expect(listBody.jobs?.[0].lifecycle).toEqual(expect.objectContaining({
      maxAttempts: 1
    }));

    const runningResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "mark-running",
        jobId: job.id,
        workerRunId: "worker_run_1"
      })
    }));
    const runningBody = await runningResponse.json() as {
      schemaVersion?: string;
      action?: string;
      job?: { status?: string; lifecycle?: { attempts?: number; workerRunId?: string } };
    };
    expect(runningResponse.status).toBe(200);
    expect(runningResponse.headers.get("x-sena-server-job-status")).toBe("running");
    expect(runningBody.schemaVersion).toBe("sena-enterprise-server-job-status-update/v1");
    expect(runningBody.action).toBe("mark-running");
    expect(runningBody.job?.status).toBe("running");
    expect(runningBody.job?.lifecycle).toEqual(expect.objectContaining({
      attempts: 1,
      workerRunId: "worker_run_1"
    }));
    const originalLease = (runningBody.job?.lifecycle as { leaseExpiresAt?: string } | undefined)?.leaseExpiresAt;
    const renewedResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "renew-lease",
        jobId: job.id,
        workerRunId: "worker_run_1"
      })
    }));
    const renewedBody = await renewedResponse.json() as {
      action?: string;
      job?: { status?: string; lifecycle?: { leaseExpiresAt?: string; lastHeartbeatAt?: string } };
    };
    expect(renewedResponse.status).toBe(200);
    expect(renewedBody).toMatchObject({
      action: "renew-lease",
      job: {
        status: "running",
        lifecycle: {
          leaseExpiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          lastHeartbeatAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
        }
      }
    });
    expect(Date.parse(renewedBody.job?.lifecycle?.leaseExpiresAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(originalLease ?? "")
    );

    const errorMessage = "worker failed with sensitive upstream detail";
    const expectedErrorHash = createHash("sha256").update(errorMessage).digest("hex");
    const failedResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "mark-failed",
        jobId: job.id,
        workerRunId: "worker_run_1",
        errorCode: "worker_exit",
        errorMessage
      })
    }));
    const failedBody = await failedResponse.json() as {
      job?: {
        status?: string;
        lifecycle?: {
          attempts?: number;
          retryable?: boolean;
          lastErrorCode?: string;
          lastErrorHash?: string;
          deadLetteredAt?: string;
        };
      };
    };
    expect(failedResponse.status).toBe(202);
    expect(failedResponse.headers.get("x-sena-server-job-status")).toBe("dead-lettered");
    expect(failedResponse.headers.get("x-sena-server-job-retryable")).toBe("false");
    expect(failedBody.job?.status).toBe("dead-lettered");
    expect(failedBody.job?.lifecycle).toEqual(expect.objectContaining({
      attempts: 1,
      retryable: false,
      lastErrorCode: "worker_exit",
      lastErrorHash: expectedErrorHash
    }));
    expect(failedBody.job?.lifecycle?.deadLetteredAt).toBeTruthy();
    expect(JSON.stringify(failedBody)).not.toContain(errorMessage);

    const retryBlockedResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "retry",
        jobId: job.id
      })
    }));
    expect(retryBlockedResponse.status).toBe(409);

    const retryResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "retry",
        jobId: job.id,
        force: true,
        reason: "Operator reviewed dead-letter evidence."
      })
    }));
    const retryBody = await retryResponse.json() as {
      job?: { status?: string; lifecycle?: { retryRequestedAt?: string; statusReason?: string } };
    };
    expect(retryResponse.status).toBe(200);
    expect(retryResponse.headers.get("x-sena-server-job-status")).toBe("queued");
    expect(retryBody.job?.status).toBe("queued");
    expect(retryBody.job?.lifecycle?.retryRequestedAt).toBeTruthy();
    expect(retryBody.job?.lifecycle?.statusReason).toBe("Operator reviewed dead-letter evidence.");

    const audit = enterprise.listEnterpriseAuditLog(registered.context, {
      event: "ops.server_job.status",
      projectId: "project_status_test",
      limit: 10
    });
    expect(audit.events.map((entry) => entry.detail.action)).toEqual(expect.arrayContaining([
      "mark-running",
      "renew-lease",
      "mark-failed",
      "retry"
    ]));
    expect(JSON.stringify(audit)).not.toContain(errorMessage);
  });

  it("applies worker-reported uploadWarnings to the queued upload registry", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-upload-warnings-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Upload Warnings Owner",
      email: "upload-warnings-owner@example.edu",
      password: "sena-secure-123",
      organization: "Upload Warnings Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const [upload] = enterprise.createEnterpriseUploads(registered.context, {
      teamId,
      files: [{
        name: "queued-ratings.csv",
        contentType: "text/csv",
        bytes: Buffer.from("coder_id,item_id,code_id,value\nc1,u1,Evidence,1\nc2,u1,Evidence", "utf8"),
        importProfile: "reliability"
        // No warningCount: nothing has parsed the queued file yet (H10).
      }]
    });
    expect(upload.warningCount).toBeUndefined();

    const job = await enterprise.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId,
      actorUserId: registered.context.user.id,
      payload: { action: "run-reliability", teamId, uploadIds: [upload.id] },
      payloadSummary: {
        source: "upload",
        uploadIds: [upload.id],
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const route = await import("../../../app/api/sena/ops/jobs/route");
    const authHeaders = {
      authorization: "Bearer sena-test-ops-token",
      "content-type": "application/json"
    };

    // Entries naming uploads outside the job are rejected before any state
    // transition, so the job stays queued for the valid report below.
    const unknownResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "mark-succeeded",
        jobId: job.id,
        uploadWarnings: [{ uploadId: "upload_not_in_job", warningCount: 1 }]
      })
    }));
    expect(unknownResponse.status).toBe(400);
    const unknownBody = await unknownResponse.json() as { code?: string };
    expect(unknownBody.code).toBe("server_job_upload_warnings_unknown_upload");
    expect(enterprise.listEnterpriseUploads(registered.context, teamId)
      .find((candidate) => candidate.id === upload.id)?.warningCount).toBeUndefined();

    // A malformed (non-array) report fails loud instead of being silently
    // ignored, and a report cannot carry more entries than queued uploads.
    const nonArrayResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "mark-succeeded",
        jobId: job.id,
        uploadWarnings: { uploadId: upload.id, warningCount: 1 }
      })
    }));
    expect(nonArrayResponse.status).toBe(400);
    expect((await nonArrayResponse.json() as { code?: string }).code).toBe("server_job_upload_warnings_invalid");

    const tooManyResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "mark-succeeded",
        jobId: job.id,
        uploadWarnings: [
          { uploadId: upload.id, warningCount: 1 },
          { uploadId: upload.id, warningCount: 2 }
        ]
      })
    }));
    expect(tooManyResponse.status).toBe(400);
    expect((await tooManyResponse.json() as { code?: string }).code).toBe("server_job_upload_warnings_too_many");

    const runningResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "mark-running",
        jobId: job.id,
        workerRunId: "worker_run_warnings"
      })
    }));
    expect(runningResponse.status).toBe(200);

    const succeededResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "mark-succeeded",
        jobId: job.id,
        workerRunId: "worker_run_warnings",
        uploadWarnings: [{ uploadId: upload.id, warningCount: 2 }]
      })
    }));
    const succeededBody = await succeededResponse.json() as {
      job?: { status?: string };
      uploadWarnings?: Array<{ uploadId?: string; warningCount?: number }>;
    };
    expect(succeededResponse.status).toBe(200);
    expect(succeededBody.job?.status).toBe("succeeded");
    expect(succeededBody.uploadWarnings).toEqual([{ uploadId: upload.id, warningCount: 2 }]);

    // The registry performed the H10 "until a parser reports" transition.
    expect(enterprise.listEnterpriseUploads(registered.context, teamId)
      .find((candidate) => candidate.id === upload.id)?.warningCount).toBe(2);
  });

  it("filters every heavy server job kind from the ops route", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-ops-kinds-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Server Job Kind Owner",
      email: "server-job-kind-owner@example.edu",
      password: "sena-secure-123",
      organization: "Server Job Kind Lab",
      plan: "lab"
    });
    const jobKinds = [
      "analysis",
      "import",
      "publication-export",
      "reliability",
      "validation"
    ] as const;

    for (const kind of jobKinds) {
      const projectId = `project_${kind.replace(/-/g, "_")}`;
      const reliabilityPayload = {
        action: "run-reliability",
        teamId: registered.context.teams[0].id,
        projectId,
        uploadIds: ["upload_ops_route_reliability"]
      };
      await enterprise.enqueueEnterpriseServerJob({
        kind,
        teamId: registered.context.teams[0].id,
        projectId,
        actorUserId: registered.context.user.id,
        payload: kind === "reliability" ? reliabilityPayload : {
          action: `run-${kind}`,
          projectId
        },
        payloadSummary: {
          source: "project",
          uploadIds: kind === "reliability" ? reliabilityPayload.uploadIds : undefined,
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        }
      });
    }

    const route = await import("../../../app/api/sena/ops/jobs/route");
    const authHeaders = {
      authorization: "Bearer sena-test-ops-token"
    };

    for (const kind of jobKinds) {
      const response = await route.GET(new Request(`https://sena.example.test/api/sena/ops/jobs?kind=${encodeURIComponent(kind)}`, {
        headers: authHeaders
      }));
      const body = await response.json() as {
        summary?: { total?: number; queued?: number };
        jobs?: Array<{ kind?: string; status?: string }>;
      };

      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.summary).toEqual(expect.objectContaining({
        total: 1,
        queued: 1
      }));
      expect(body.jobs).toHaveLength(1);
      expect(body.jobs?.[0]).toEqual(expect.objectContaining({
        kind,
        status: "queued"
      }));
    }
  });
});
