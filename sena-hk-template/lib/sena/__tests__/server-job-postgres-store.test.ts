import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "DATABASE_URL",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_OPS_TOKEN"
];

describe("SENA server job Postgres store", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.doUnmock("pg");
    vi.resetModules();
  });

  it("stores and updates server job status in the indexed Postgres job table when Postgres is primary", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-postgres-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

    const pg = new RouteMemoryPostgres();

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

    const enterprise = await import("../enterprise");
    const serverJobs = await import("../enterprise/server-job-queue");
    const runtime = enterprise.serverJobStoreRuntime();
    expect(runtime).toEqual(expect.objectContaining({
      activeStore: "postgres-table",
      postgresConfigured: true,
      postgresPrimaryActive: true
    }));

    const job = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs",
      actorUserId: "user_postgres_jobs",
      payload: {
        action: "run-analysis",
        projectId: "project_postgres_jobs",
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
    expect(pg.serverJobs.find((row) => row.id === job.id)).toEqual(expect.objectContaining({
      id: job.id,
      status: "queued",
      team_id: "team_postgres_jobs",
      project_id: "project_postgres_jobs"
    }));

    let releaseSourcePersistence!: () => void;
    let sourcePersistenceEntered!: () => void;
    const sourcePersistenceGate = new Promise<void>((resolve) => {
      releaseSourcePersistence = resolve;
    });
    const sourcePersistenceStarted = new Promise<void>((resolve) => {
      sourcePersistenceEntered = resolve;
    });
    const preparingJobPromise = enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_preparing",
      actorUserId: "user_postgres_jobs",
      payload: { action: "run-analysis", projectId: "project_postgres_jobs_preparing", projectVersion: 1 },
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      },
      beforeDispatch: async () => {
        sourcePersistenceEntered();
        await sourcePersistenceGate;
      }
    });
    await sourcePersistenceStarted;
    const preparingRow = pg.serverJobs.find((row) => row.project_id === "project_postgres_jobs_preparing");
    expect(preparingRow).toBeDefined();
    const prematurePostgresClaim = await serverJobs.claimEnterpriseServerJob({
      jobId: String(preparingRow?.id),
      workerRunId: "worker_run_pg_premature"
    });
    releaseSourcePersistence();
    const preparedJob = await preparingJobPromise;
    const readyPostgresClaims = await Promise.all([
      serverJobs.claimEnterpriseServerJob({ jobId: preparedJob.id, workerRunId: "worker_run_pg_ready_left" }),
      serverJobs.claimEnterpriseServerJob({ jobId: preparedJob.id, workerRunId: "worker_run_pg_ready_right" })
    ]);
    expect(prematurePostgresClaim).toEqual(expect.objectContaining({
      claimed: false,
      reason: "server_job_worker_source_not_ready"
    }));
    expect(readyPostgresClaims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(readyPostgresClaims.filter((claim) => !claim.claimed)).toHaveLength(1);

    await expect(enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_source_failure",
      actorUserId: "user_postgres_jobs",
      payload: { action: "run-analysis", projectId: "project_postgres_jobs_source_failure", projectVersion: 1 },
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      },
      beforeDispatch: async () => {
        throw new Error("simulated postgres source persistence failure");
      }
    })).rejects.toMatchObject({ code: "server_job_source_persistence_failed" });
    const sourceFailureRow = pg.serverJobs.find((row) => (
      row.project_id === "project_postgres_jobs_source_failure"
    ));
    expect(sourceFailureRow).toBeDefined();
    await expect(serverJobs.getEnterpriseServerJob(String(sourceFailureRow?.id))).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        delivery: expect.objectContaining({
          sourceReady: false,
          failureStage: "source-persistence"
        }),
        lifecycle: expect.objectContaining({ retryable: false })
      })
    );
    await expect(serverJobs.updateEnterpriseServerJobStatus({
      jobId: String(sourceFailureRow?.id),
      action: "retry",
      reason: "operator-review"
    })).rejects.toMatchObject({
      status: 409,
      code: "server_job_source_repair_required"
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
      jobs?: Array<{ id?: string; status?: string }>;
    };
    expect(listResponse.status, JSON.stringify(listBody)).toBe(200);
    expect(listBody.schemaVersion).toBe("sena-enterprise-server-job-list/v1");
    expect(listBody.summary).toEqual(expect.objectContaining({
      total: 1,
      queued: 1
    }));
    expect(listBody.jobs?.[0]).toEqual(expect.objectContaining({
      id: job.id,
      status: "queued"
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
        workerRunId: "worker_run_pg"
      })
    }));
    const runningBody = await runningResponse.json() as {
      schemaVersion?: string;
      job?: { id?: string; status?: string; lifecycle?: { attempts?: number; workerRunId?: string } };
    };
    expect(runningResponse.status).toBe(200);
    expect(runningResponse.headers.get("x-sena-server-job-status")).toBe("running");
    expect(runningBody.schemaVersion).toBe("sena-enterprise-server-job-status-update/v1");
    expect(runningBody.job).toEqual(expect.objectContaining({
      id: job.id,
      status: "running"
    }));
    expect(runningBody.job?.lifecycle).toEqual(expect.objectContaining({
      attempts: 1,
      workerRunId: "worker_run_pg"
    }));
    expect(pg.serverJobs.find((row) => row.id === job.id)).toEqual(expect.objectContaining({
      status: "running"
    }));
    expect(pg.auditRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "ops.server_job.status",
        teamId: "team_postgres_jobs",
        projectId: "project_postgres_jobs"
      })
    ]));

    const index = await import("../index");
    const custodyOwner = await enterprise.registerEnterpriseUserAsync({
      name: "Postgres custody owner",
      email: "postgres-custody-owner@example.edu",
      password: "sena-secure-123",
      organization: "Postgres custody lab",
      plan: "lab"
    });
    const custodyProject = await enterprise.createEnterpriseProjectAsync(custodyOwner.context, {
      teamId: custodyOwner.context.teams[0].id,
      title: "Postgres corrupt-custody source",
      snapshot: index.buildSenaProjectSnapshot(index.buildSenaModel(index.lessonStudySenaContract), {
        title: "Postgres corrupt-custody source",
        generatedAt: "2026-08-26T00:00:00.000Z",
        sourceDataset: index.lessonStudySenaContract
      })
    });
    const corruptCustodyJob = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: custodyProject.teamId,
      projectId: custodyProject.id,
      actorUserId: custodyOwner.context.user.id,
      payload: {
        action: "run-analysis",
        commandCustody: "encrypted-upload-v1",
        teamId: custodyProject.teamId,
        projectId: custodyProject.id,
        projectVersion: custodyProject.currentVersion,
        sourceTitle: custodyProject.title,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true
      },
      payloadSummary: {
        source: "project",
        projectVersion: custodyProject.currentVersion,
        commandCustody: "encrypted-upload-v1",
        commandEnvelopeUploadId: "upload_aaaaaaaaaaaaaaaaaaaaaaaa",
        commandEnvelopeSha256: "b".repeat(64),
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const corruptCustodyClaim = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "mark-running",
        jobId: corruptCustodyJob.id,
        workerRunId: "worker_run_pg_corrupt_custody"
      })
    }));
    const corruptCustodyClaimBody = await corruptCustodyClaim.json();
    expect(corruptCustodyClaim.status, JSON.stringify(corruptCustodyClaimBody)).toBe(409);
    expect(corruptCustodyClaimBody).toEqual(expect.objectContaining({
      code: "server_job_worker_analysis_command_custody_invalid"
    }));
    await expect(serverJobs.getEnterpriseServerJob(corruptCustodyJob.id)).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        lifecycle: expect.objectContaining({
          attempts: 0,
          retryable: false,
          lastErrorCode: "server_job_worker_analysis_command_custody_invalid"
        })
      })
    );

    await expect(serverJobs.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-failed",
      workerRunId: "worker_run_pg_stale",
      errorCode: "stale-worker"
    })).rejects.toMatchObject({
      status: 409,
      code: "server_job_worker_run_mismatch"
    });

    const terminalResults = await Promise.allSettled([
      serverJobs.updateEnterpriseServerJobStatus({
        jobId: job.id,
        action: "mark-succeeded",
        workerRunId: "worker_run_pg"
      }),
      serverJobs.updateEnterpriseServerJobStatus({
        jobId: job.id,
        action: "mark-failed",
        workerRunId: "worker_run_pg",
        errorCode: "competing-terminal"
      })
    ]);
    expect(terminalResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(terminalResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejectedTerminal = terminalResults.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect([
      "server_job_status_transition_conflict",
      "server_job_status_transition_not_allowed"
    ]).toContain(rejectedTerminal.reason?.code);

    const unclaimedJob = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_unclaimed",
      actorUserId: "user_postgres_jobs",
      payload: { action: "run-analysis", projectId: "project_postgres_jobs_unclaimed", projectVersion: 1 },
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    for (const workerRunId of ["", "   "]) {
      await expect(serverJobs.claimEnterpriseServerJob({
        jobId: unclaimedJob.id,
        workerRunId
      })).rejects.toMatchObject({
        status: 400,
        code: "server_job_worker_run_id_required"
      });
      await expect(serverJobs.getEnterpriseServerJob(unclaimedJob.id)).resolves.toEqual(
        expect.objectContaining({
          status: "queued",
          lifecycle: expect.objectContaining({ attempts: 0 })
        })
      );
    }
    await expect(serverJobs.updateEnterpriseServerJobStatus({
      jobId: unclaimedJob.id,
      action: "mark-succeeded",
      workerRunId: "worker_run_pg_never_claimed"
    })).rejects.toMatchObject({
      status: 409,
      code: "server_job_status_transition_not_allowed"
    });

    const preclaimRejectedJob = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_preclaim_rejected",
      actorUserId: "user_postgres_jobs",
      payload: {
        action: "run-analysis",
        projectId: "project_postgres_jobs_preclaim_rejected",
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
    await expect(serverJobs.rejectEnterpriseServerJobBeforeClaim({
      jobId: preclaimRejectedJob.id,
      errorCode: "server_job_worker_payload_not_reproducible",
      errorHash: "preclaim-error-hash",
      reason: "server-job-worker-payload-not-reproducible"
    })).resolves.toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({
        attempts: 0,
        retryable: false,
        lastTransition: "mark-failed",
        lastErrorCode: "server_job_worker_payload_not_reproducible",
        lastErrorHash: "preclaim-error-hash",
        statusReason: "server-job-worker-payload-not-reproducible"
      })
    }));
    expect((pg.serverJobs.find((row) => row.id === preclaimRejectedJob.id)?.lifecycle as {
      workerRunId?: string;
      deadLetteredAt?: string;
    })).toEqual(expect.not.objectContaining({
      workerRunId: expect.anything(),
      deadLetteredAt: expect.anything()
    }));

    const raceJob = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_race",
      actorUserId: "user_postgres_jobs",
      payload: { action: "run-analysis", projectId: "project_postgres_jobs_race", projectVersion: 1 },
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const [leftClaim, rightClaim] = await Promise.all([
      serverJobs.claimEnterpriseServerJob({ jobId: raceJob.id, workerRunId: "worker_run_pg_left" }),
      serverJobs.claimEnterpriseServerJob({ jobId: raceJob.id, workerRunId: "worker_run_pg_right" })
    ]);
    const claims = [leftClaim, rightClaim];
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);
    expect(pg.queries.some((query) => (
      /UPDATE "public"\."sena_enterprise_server_jobs"/i.test(query) &&
      /WHERE id = \$1 AND status = 'queued'/i.test(query) &&
      /delivery->'sourceReady' = 'true'::jsonb/i.test(query) &&
      /RETURNING \*/i.test(query)
    ))).toBe(true);

    const managedFailureJob = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_managed_failure",
      actorUserId: "user_postgres_jobs",
      payload: {
        action: "run-analysis",
        projectId: "project_postgres_jobs_managed_failure",
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
    const managedFailureRow = pg.serverJobs.find((row) => row.id === managedFailureJob.id)!;
    managedFailureRow.provider = {
      ...(managedFailureRow.provider as Record<string, unknown>),
      mode: "managed"
    };
    await expect(serverJobs.claimEnterpriseServerJob({
      jobId: managedFailureJob.id,
      workerRunId: "worker_run_pg_managed_failure"
    })).resolves.toEqual(expect.objectContaining({ claimed: true }));
    const managedFailure = await serverJobs.updateEnterpriseServerJobStatus({
      jobId: managedFailureJob.id,
      action: "mark-failed",
      workerRunId: "worker_run_pg_managed_failure",
      errorCode: "managed-first-failure"
    });
    expect(managedFailure.job).toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({ attempts: 1, retryable: false })
    }));
    expect(managedFailure.job.lifecycle.deadLetteredAt).toBeUndefined();
    expect((pg.serverJobs.find((row) => row.id === managedFailureJob.id)?.lifecycle as {
      deadLetteredAt?: string;
    }).deadLetteredAt).toBeUndefined();

    const enqueueLegacyProjectJob = (suffix: string) => enterprise.enqueueEnterpriseServerJob({
      kind: "analysis" as const,
      teamId: "team_postgres_jobs",
      projectId: `project_postgres_jobs_legacy_${suffix}`,
      actorUserId: "user_postgres_jobs",
      payload: {
        action: "run-analysis",
        projectId: `project_postgres_jobs_legacy_${suffix}`,
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
    const [
      legacyDelivered,
      legacyPending,
      invalidString,
      legacyInline,
      legacyMissingUpload,
      legacyNormalizedDuplicateUpload
    ] = await Promise.all([
      enqueueLegacyProjectJob("delivered"),
      enqueueLegacyProjectJob("pending"),
      enqueueLegacyProjectJob("string"),
      enqueueLegacyProjectJob("inline"),
      enqueueLegacyProjectJob("missing-upload"),
      enqueueLegacyProjectJob("normalized-duplicate-upload")
    ]);
    const invalidProjectVersions: Array<[string, unknown]> = [
      ["missing-version", undefined],
      ["string-version", "1"],
      ["fraction-version", 1.5],
      ["zero-version", 0],
      ["unsafe-version", Number.MAX_SAFE_INTEGER + 1]
    ];
    const invalidVersionJobs = await Promise.all(
      invalidProjectVersions.map(([suffix]) => enqueueLegacyProjectJob(suffix))
    );
    const enqueueValidationProjectJob = (
      suffix: string,
      projectTeamId?: string
    ) => enterprise.enqueueEnterpriseServerJob({
      kind: "validation" as const,
      teamId: "team_postgres_jobs",
      projectId: `project_postgres_jobs_validation_${suffix}`,
      actorUserId: "user_postgres_jobs",
      payload: {
        action: "run-validation",
        teamId: "team_postgres_jobs",
        projectId: `project_postgres_jobs_validation_${suffix}`
      },
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        projectTeamId,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const [
      validationMatchingTeam,
      validationMissingTeam,
      validationMismatchedTeam,
      validationNumericTeam,
      validationBooleanTeam,
      validationNullTeam,
      validationArrayTeam,
      validationObjectTeam
    ] = await Promise.all([
      enqueueValidationProjectJob("matching-team", "team_postgres_jobs"),
      enqueueValidationProjectJob("missing-team"),
      enqueueValidationProjectJob("mismatched-team", "team_other"),
      enqueueValidationProjectJob("numeric-team", "team_postgres_jobs"),
      enqueueValidationProjectJob("boolean-team", "team_postgres_jobs"),
      enqueueValidationProjectJob("null-team", "team_postgres_jobs"),
      enqueueValidationProjectJob("array-team", "team_postgres_jobs"),
      enqueueValidationProjectJob("object-team", "team_postgres_jobs")
    ]);
    const deliveredRow = pg.serverJobs.find((row) => row.id === legacyDelivered.id)!;
    const pendingRow = pg.serverJobs.find((row) => row.id === legacyPending.id)!;
    const invalidStringRow = pg.serverJobs.find((row) => row.id === invalidString.id)!;
    const legacyInlineRow = pg.serverJobs.find((row) => row.id === legacyInline.id)!;
    const legacyMissingUploadRow = pg.serverJobs.find((row) => row.id === legacyMissingUpload.id)!;
    const legacyNormalizedDuplicateUploadRow = pg.serverJobs.find((row) => (
      row.id === legacyNormalizedDuplicateUpload.id
    ))!;
    (pg.serverJobs.find((row) => row.id === validationNumericTeam.id)!
      .payload_summary as Record<string, unknown>).projectTeamId = 123;
    (pg.serverJobs.find((row) => row.id === validationBooleanTeam.id)!
      .payload_summary as Record<string, unknown>).projectTeamId = true;
    (pg.serverJobs.find((row) => row.id === validationNullTeam.id)!
      .payload_summary as Record<string, unknown>).projectTeamId = null;
    (pg.serverJobs.find((row) => row.id === validationArrayTeam.id)!
      .payload_summary as Record<string, unknown>).projectTeamId = ["team_postgres_jobs"];
    (pg.serverJobs.find((row) => row.id === validationObjectTeam.id)!
      .payload_summary as Record<string, unknown>).projectTeamId = { value: "team_postgres_jobs" };
    for (const [index, [, projectVersion]] of invalidProjectVersions.entries()) {
      const row = pg.serverJobs.find((candidate) => candidate.id === invalidVersionJobs[index].id)!;
      if (projectVersion === undefined) {
        delete (row.payload_summary as { projectVersion?: unknown }).projectVersion;
      } else {
        (row.payload_summary as { projectVersion?: unknown }).projectVersion = projectVersion;
      }
      row.delivery = {
        ...(row.delivery as Record<string, unknown>),
        webhookStatus: "delivered",
        sourceReady: true
      };
    }
    delete (deliveredRow.delivery as { sourceReady?: unknown }).sourceReady;
    pendingRow.delivery = {
      ...(pendingRow.delivery as Record<string, unknown>),
      webhookStatus: "pending"
    };
    delete (pendingRow.delivery as { sourceReady?: unknown }).sourceReady;
    invalidStringRow.delivery = {
      ...(invalidStringRow.delivery as Record<string, unknown>),
      sourceReady: "true"
    };
    legacyInlineRow.kind = "reliability";
    legacyInlineRow.payload_summary = {
      ...(legacyInlineRow.payload_summary as Record<string, unknown>),
      source: "dataset",
      uploadIds: [],
      hasInlineDataset: true
    };
    legacyInlineRow.worker = {
      ...(legacyInlineRow.worker as Record<string, unknown>),
      expectedAction: "run-reliability",
      payloadDelivery: "inline-payload-enabled"
    };
    legacyInlineRow.delivery = {
      ...(legacyInlineRow.delivery as Record<string, unknown>),
      webhookStatus: "delivered",
      sourceReady: true
    };
    legacyMissingUploadRow.kind = "reliability";
    legacyMissingUploadRow.payload_summary = {
      source: "uploads",
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    };
    legacyMissingUploadRow.worker = {
      ...(legacyMissingUploadRow.worker as Record<string, unknown>),
      expectedAction: "run-reliability",
      payloadDelivery: "upload-pointer"
    };
    legacyMissingUploadRow.delivery = {
      ...(legacyMissingUploadRow.delivery as Record<string, unknown>),
      webhookStatus: "delivered",
      sourceReady: true
    };
    legacyNormalizedDuplicateUploadRow.kind = "reliability";
    legacyNormalizedDuplicateUploadRow.payload_summary = {
      source: "uploads",
      uploadIds: ["upload-a", " upload-a "],
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    };
    legacyNormalizedDuplicateUploadRow.worker = {
      ...(legacyNormalizedDuplicateUploadRow.worker as Record<string, unknown>),
      expectedAction: "run-reliability",
      payloadDelivery: "upload-pointer"
    };
    legacyNormalizedDuplicateUploadRow.delivery = {
      ...(legacyNormalizedDuplicateUploadRow.delivery as Record<string, unknown>),
      webhookStatus: "delivered",
      sourceReady: true
    };

    await expect(serverJobs.getEnterpriseServerJob(legacyDelivered.id)).resolves.toEqual(
      expect.objectContaining({ delivery: expect.objectContaining({ sourceReady: true }) })
    );
    expect(Object.hasOwn(deliveredRow.delivery as object, "sourceReady")).toBe(false);
    const claimableLegacyJobs = await serverJobs.listEnterpriseServerJobs({ claimableOnly: true, limit: 100 });
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).toContain(legacyDelivered.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(legacyPending.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(invalidString.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(legacyInline.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(legacyMissingUpload.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(
      legacyNormalizedDuplicateUpload.id
    );
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toEqual(
      expect.arrayContaining(invalidVersionJobs.map((candidate) => candidate.id))
    );
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).toContain(validationMatchingTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationMissingTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationMismatchedTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationNumericTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationBooleanTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationNullTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationArrayTeam.id);
    expect(claimableLegacyJobs.jobs.map((candidate) => candidate.id)).not.toContain(validationObjectTeam.id);
    await expect(serverJobs.claimEnterpriseServerJob({
      jobId: legacyDelivered.id,
      workerRunId: "worker_run_pg_legacy_delivered"
    })).resolves.toEqual(expect.objectContaining({ claimed: true }));
    await expect(serverJobs.claimEnterpriseServerJob({
      jobId: validationMatchingTeam.id,
      workerRunId: "worker_run_pg_validation_matching_team"
    })).resolves.toEqual(expect.objectContaining({ claimed: true }));
    for (const legacyJobId of [
      legacyPending.id,
      invalidString.id,
      legacyInline.id,
      legacyMissingUpload.id,
      legacyNormalizedDuplicateUpload.id,
      validationMissingTeam.id,
      validationMismatchedTeam.id,
      validationNumericTeam.id,
      validationBooleanTeam.id,
      validationNullTeam.id,
      validationArrayTeam.id,
      validationObjectTeam.id,
      ...invalidVersionJobs.map((candidate) => candidate.id)
    ]) {
      await expect(serverJobs.getEnterpriseServerJob(legacyJobId)).resolves.toEqual(
        expect.objectContaining({ delivery: expect.objectContaining({ sourceReady: false }) })
      );
      await expect(serverJobs.claimEnterpriseServerJob({
        jobId: legacyJobId,
        workerRunId: `worker_run_pg_blocked_${legacyJobId}`
      })).resolves.toEqual(expect.objectContaining({
        claimed: false,
        reason: "server_job_worker_source_not_ready"
      }));
    }
    expect(pg.queries.some((query) => (
      /jsonb_typeof\(payload_summary->'uploadIds'\) IS DISTINCT FROM 'array'/i.test(query) &&
      /jsonb_array_length\(payload_summary->'uploadIds'\)/i.test(query) &&
      /count\(DISTINCT btrim\(upload_entry\.value #>> '\{\}'\)\)/i.test(query) &&
      /payload_summary->'hasInlineSnapshot' = 'false'::jsonb/i.test(query) &&
      /payload_summary->'hasInlineDataset' = 'false'::jsonb/i.test(query) &&
      /worker->>'payloadDelivery'/i.test(query) &&
      /WHEN kind = 'analysis'/i.test(query) &&
      /WHEN kind = 'validation'/i.test(query) &&
      /jsonb_typeof\(payload_summary->'projectTeamId'\) IS DISTINCT FROM 'string'/i.test(query) &&
      /payload_summary->>'projectTeamId' = team_id/i.test(query) &&
      /jsonb_typeof\(payload_summary->'projectVersion'\) IS DISTINCT FROM 'number'/i.test(query) &&
      /9007199254740991/i.test(query) &&
      /trunc\(\(payload_summary->>'projectVersion'\)::numeric\)/i.test(query)
    ))).toBe(true);

    expect(pg.queries.some((query) => (
      /UPDATE "public"\."sena_enterprise_server_jobs"/i.test(query) &&
      /SET status = \$\d+/i.test(query) &&
      /WHERE id = \$1 AND status = \$\d+/i.test(query) &&
      /lifecycle->>'workerRunId' = \$\d+/i.test(query) &&
      /RETURNING \*/i.test(query)
    ))).toBe(true);

    expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
    expect(pg.queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_server_jobs"/.test(query))).toBe(true);
    expect(pg.queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_server_jobs_status_updated_idx"/.test(query))).toBe(true);
    expect(pg.queries.some((query) => /INSERT INTO "public"\."sena_enterprise_server_jobs"/.test(query))).toBe(true);
    expect(pg.queries.some((query) => /INSERT INTO "public"\."sena_enterprise_audit_log"/.test(query))).toBe(true);
    expect(JSON.stringify({ runtime, listBody })).not.toContain("super-secret");
    expect(JSON.stringify({ runtime, listBody })).not.toContain("example.db");
  });
});
