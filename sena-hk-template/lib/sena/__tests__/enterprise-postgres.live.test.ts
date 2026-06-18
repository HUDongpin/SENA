import { describe, expect, it } from "vitest";
import type { SenaEnterpriseBackupArtifact, SenaEnterpriseBackupRecordCounts, SenaEnterpriseBackupVerification } from "../enterprise";
import {
  createEnterprisePostgresDatabaseSyncAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";

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
});
