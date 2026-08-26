import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SenaEnterpriseBackupArtifact, SenaEnterpriseBackupRecordCounts, SenaEnterpriseBackupVerification } from "../enterprise";
import {
  createEnterprisePostgresDatabaseSyncAdapterFromEnv,
  createEnterprisePostgresServerJobAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import {
  serverJobQueueStatus,
  type SenaEnterpriseServerJob
} from "../enterprise/server-job-queue";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const liveRequested = process.env.SENA_ENTERPRISE_POSTGRES_LIVE_TEST === "1";

function recordCounts(): SenaEnterpriseBackupRecordCounts {
  return {
    users: 0,
    teams: 0,
    memberships: 0,
    invitations: 0,
    uploads: 0,
    importRuns: 0,
    analysisRuns: 0,
    projects: 0,
    projectRevisions: 0,
    comments: 0,
    adjudications: 0,
    reliabilityRuns: 0,
    validationRuns: 0,
    expertReviews: 0,
    platformDecisionAcceptances: 0,
    releaseGateReviews: 0,
    postCutoverObservations: 0,
    goLiveAttestations: 0,
    notifications: 0,
    auditEvents: 0
  };
}

describe("SENA enterprise live Neon/Postgres adapter", () => {
  (liveRequested ? it : it.skip)("writes a database-sync probe through the configured native Postgres adapter", async () => {
    const config = resolveEnterprisePostgresConfig();
    expect(config.configured).toBe(true);
    expect(JSON.stringify(config)).not.toContain("postgres://");

    const counts = recordCounts();
    const backup = {
      schemaVersion: "sena-enterprise-backup/v1",
      backupId: `backup_live_probe_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      generatedBy: {
        userId: "live-probe",
        email: "live-probe@example.invalid",
        name: "Live Probe"
      },
      scope: {
        mode: "managed-teams",
        teamIds: [],
        uploadBlobsIncluded: false,
        excludedCollections: ["sessions", "passwordHash", "uploadBlobs"]
      },
      manifest: {
        storageEngine: "file-backed-json",
        storagePathHint: "live-probe",
        payloadSha256: "0".repeat(64),
        recordCounts: counts,
        retentionPolicy: {
          auditEventsMax: 0,
          sessionsExcluded: true,
          ssoStatesExcluded: true,
          authLockoutsExcluded: true,
          apiRateLimitsExcluded: true,
          mfaSecretsExcluded: true,
          mfaChallengesExcluded: true,
          emailDeliveriesExcluded: true,
          passwordResetTokensExcluded: true,
          presenceExcluded: true,
          collaborationPubSubExcluded: true,
          passwordHashesExcluded: true,
          uploadBlobsExcluded: true
        }
      },
      payload: {
        users: [],
        teams: [],
        memberships: [],
        invitations: [],
        uploads: [],
        importRuns: [],
        analysisRuns: [],
        projects: [],
        projectRevisions: [],
        projectComments: [],
        adjudications: [],
        reliabilityRuns: [],
        validationRuns: [],
        expertReviews: [],
        platformDecisionAcceptances: [],
        releaseGateReviews: [],
        postCutoverObservations: [],
        goLiveAttestations: [],
        notifications: [],
        auditLog: []
      }
    } satisfies SenaEnterpriseBackupArtifact;
    const verification = {
      schemaVersion: "sena-enterprise-backup-verification/v1",
      status: "pass",
      generatedAt: new Date().toISOString(),
      backupId: backup.backupId,
      backupGeneratedAt: backup.generatedAt,
      payloadSha256: backup.manifest.payloadSha256,
      recordCounts: counts,
      conflicts: {
        teams: [],
        projects: [],
        uploads: []
      },
      checks: []
    } satisfies SenaEnterpriseBackupVerification;

    const { adapter, pool } = createEnterprisePostgresDatabaseSyncAdapterFromEnv({
      tableName: "sena_enterprise_database_sync_live_probes"
    });
    try {
      const write = await adapter.writeSync(backup, verification);
      expect(write).toEqual(expect.objectContaining({
        backupId: backup.backupId,
        payloadSha256: backup.manifest.payloadSha256,
        revision: expect.any(Number)
      }));
      expect(write.revision).toBeGreaterThan(0);
    } finally {
      await pool.end?.();
    }
  });

  (liveRequested ? it : it.skip)(
    "executes server-job quarantine, claimability, exact-heartbeat, and executable reservation predicates in Postgres",
    async () => {
      const tableName = "sena_enterprise_server_jobs_live_tests";
      const suffix = randomBytes(12).toString("hex");
      const uploadId = `upload_${randomBytes(12).toString("hex")}`;
      const payloadSha256 = "a".repeat(64);
      const envelopeSha256 = "b".repeat(64);
      const provider = serverJobQueueStatus();
      const createdIds: string[] = [];
      const makeAnalysisJob = (
        label: string,
        payloadSummary: Record<string, unknown>,
        updatedAt: string
      ) => ({
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJob,
        id: `server_job_live_${label}_${suffix}`,
        kind: "analysis",
        status: "queued",
        queuedAt: updatedAt,
        updatedAt,
        teamId: "team_live_server_jobs",
        projectId: `project_live_${label}`,
        actorUserId: "user_live_server_jobs",
        payloadSha256,
        payloadSummary,
        provider,
        delivery: {
          attempted: true,
          webhookStatus: "local-sink",
          sourceReady: true
        },
        worker: {
          expectedAction: "run-analysis",
          payloadDelivery: "project-pointer",
          execution: "local-receipt-only",
          statusCallback: "/api/sena/ops/jobs"
        },
        lifecycle: {
          attempts: 0,
          maxAttempts: 3,
          retryable: false,
          lastTransition: "enqueue"
        },
        redaction: {
          payloadValuesExcluded: true,
          secretValuesExcluded: true,
          endpointValueExcluded: true
        }
      }) as SenaEnterpriseServerJob;
      const validSummary = {
        source: "project",
        projectVersion: 1,
        commandCustody: "encrypted-upload-v1",
        commandEnvelopeUploadId: uploadId,
        commandEnvelopeSha256: envelopeSha256,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      };
      const valid = makeAnalysisJob(
        "valid",
        validSummary,
        "2026-08-26T00:00:00.000Z"
      );
      const malformedSummaries: Array<[string, Record<string, unknown>]> = [
        ["unmarked", {
          source: "project",
          projectVersion: 1,
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        }],
        ["missing-upload", { ...validSummary, commandEnvelopeUploadId: undefined }],
        ["missing-sha", { ...validSummary, commandEnvelopeSha256: undefined }],
        ["null-upload", { ...validSummary, commandEnvelopeUploadId: null }],
        ["null-sha", { ...validSummary, commandEnvelopeSha256: null }],
        ["wrong-types", {
          ...validSummary,
          commandEnvelopeUploadId: 17,
          commandEnvelopeSha256: [envelopeSha256]
        }],
        ["malformed", {
          ...validSummary,
          commandEnvelopeUploadId: "upload_not_hex",
          commandEnvelopeSha256: "not-a-sha"
        }],
        ["partial-synthetic", {
          source: "project",
          projectVersion: 1,
          commandCustody: "synthetic-heartbeat-v1",
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        }]
      ];
      const malformed = malformedSummaries.map(([label, summary], index) => makeAnalysisJob(
        label,
        summary,
        `2026-08-26T00:01:${String(index).padStart(2, "0")}.000Z`
      ));
      const heartbeatId = `server_job_worker_heartbeat_${randomBytes(12).toString("hex")}`;
      const exactHeartbeat = {
        ...makeAnalysisJob("heartbeat-seed", {}, "2026-08-26T00:02:00.000Z"),
        id: heartbeatId,
        teamId: "ops-heartbeat",
        projectId: "worker-heartbeat",
        actorUserId: "ops-heartbeat",
        payloadSummary: {
          source: "project",
          projectVersion: 1,
          commandCustody: "synthetic-heartbeat-v1",
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        },
        worker: {
          expectedAction: "run-analysis" as const,
          payloadDelivery: "project-pointer" as const,
          execution: "external-worker-required" as const,
          statusCallback: "/api/sena/ops/jobs" as const
        }
      } satisfies SenaEnterpriseServerJob;
      const wrongKindHeartbeat = {
        ...structuredClone(exactHeartbeat),
        id: `server_job_worker_heartbeat_${randomBytes(12).toString("hex")}`,
        kind: "validation" as const,
        updatedAt: "2026-08-26T00:03:00.000Z"
      } satisfies SenaEnterpriseServerJob;
      const allJobs = [valid, ...malformed, exactHeartbeat, wrongKindHeartbeat];
      createdIds.push(...allJobs.map((job) => job.id));

      const { adapter, pool } = createEnterprisePostgresServerJobAdapterFromEnv({ tableName });
      let tableReady = false;
      try {
        await adapter.ensureSchema();
        tableReady = true;
        for (const job of allJobs) await adapter.upsertJob(job);

        const quarantine = await adapter.listJobs({
          status: "queued",
          kind: "analysis",
          analysisCustodyQuarantineOnly: true,
          limit: 100
        });
        expect(new Set(quarantine.jobs.map((job) => job.id))).toEqual(
          new Set(malformed.map((job) => job.id))
        );

        const claimable = await adapter.listJobs({
          status: "queued",
          kind: "analysis",
          claimableOnly: true,
          excludeSyntheticWorkerHeartbeat: true,
          limit: 100
        });
        expect(claimable.jobs.map((job) => job.id)).toEqual([valid.id]);

        const withoutExactHeartbeat = await adapter.listJobs({
          status: "queued",
          excludeSyntheticWorkerHeartbeat: true,
          limit: 100
        });
        expect(withoutExactHeartbeat.jobs.map((job) => job.id)).toContain(wrongKindHeartbeat.id);
        expect(withoutExactHeartbeat.jobs.map((job) => job.id)).not.toContain(exactHeartbeat.id);

        await expect(adapter.findOldestClaimableJob({
          kinds: ["analysis", "import", "reliability"]
        })).resolves.toEqual(expect.objectContaining({ id: valid.id }));

        const runningMalformed = {
          ...malformed[0],
          status: "running" as const,
          lifecycle: {
            ...malformed[0].lifecycle,
            attempts: 1,
            workerRunId: "worker_live_malformed",
            lastTransition: "mark-running" as const
          }
        };
        await expect(adapter.claimQueuedJob(runningMalformed)).resolves.toBeNull();
        const runningValid = {
          ...valid,
          status: "running" as const,
          lifecycle: {
            ...valid.lifecycle,
            attempts: 1,
            workerRunId: "worker_live_valid",
            lastTransition: "mark-running" as const
          }
        };
        await expect(adapter.claimQueuedJob(runningValid)).resolves.toEqual(
          expect.objectContaining({ id: valid.id, status: "running" })
        );
      } finally {
        if (tableReady && createdIds.length > 0) {
          await pool.query(
            `DELETE FROM "public"."${tableName}" WHERE id = ANY($1::text[])`,
            [createdIds]
          );
        }
        await pool.end?.();
      }
    }
  );
});
