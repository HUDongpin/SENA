import { describe, expect, it } from "vitest";
import type { SenaEnterpriseBackupArtifact, SenaEnterpriseBackupRecordCounts, SenaEnterpriseBackupVerification, SenaEnterpriseDb } from "../enterprise";
import {
  createEnterprisePostgresDatabaseSyncAdapter,
  createEnterprisePostgresStateAdapter,
  createEnterprisePostgresStateAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";

function emptyDb(): SenaEnterpriseDb {
  return {
    schemaVersion: "sena-enterprise-db/v1",
    users: [],
    teams: [],
    memberships: [],
    invitations: [],
    sessions: [],
    ssoStates: [],
    authLockouts: [],
    apiRateLimits: [],
    mfaFactors: [],
    mfaSetups: [],
    mfaChallenges: [],
    passwordResetRequests: [],
    uploads: [],
    importRuns: [],
    analysisRuns: [],
    projects: [],
    projectRevisions: [],
    projectComments: [],
    projectPresence: [],
    adjudications: [],
    collaborationEvents: [],
    reliabilityRuns: [],
    validationRuns: [],
    expertReviews: [],
    platformDecisionAcceptances: [],
    releaseGateReviews: [],
    postCutoverObservations: [],
    goLiveAttestations: [],
    notifications: [],
    emailDeliveries: [],
    auditLog: []
  };
}

type MemoryRow = {
  id: string;
  schema_version: string;
  revision: number;
  payload: SenaEnterpriseDb;
};

type MemorySyncRow = {
  backup_id: string;
  payload_sha256: string;
  backup: SenaEnterpriseBackupArtifact;
  verification: SenaEnterpriseBackupVerification;
  record_counts: SenaEnterpriseBackupRecordCounts;
  revision: number;
};

class MemoryPostgres {
  row: MemoryRow | null = null;
  syncRows: MemorySyncRow[] = [];
  queries: string[] = [];

  async query<T = MemoryRow>(sql: string, values: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.queries.push(normalizedSql);
    if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [] as T[], rowCount: 0 };
    }
    if (/INSERT INTO .*sena_enterprise_database_syncs/i.test(normalizedSql)) {
      const nextRevision = (this.syncRows.at(-1)?.revision ?? 0) + 1;
      const row = {
        backup_id: String(values[0]),
        payload_sha256: String(values[1]),
        backup: values[2] as SenaEnterpriseBackupArtifact,
        verification: values[3] as SenaEnterpriseBackupVerification,
        record_counts: values[4] as SenaEnterpriseBackupRecordCounts,
        revision: nextRevision
      };
      this.syncRows.push(row);
      return { rows: [{ revision: nextRevision }] as T[], rowCount: 1 };
    }
    if (/SELECT .* FROM/i.test(normalizedSql)) {
      return {
        rows: (this.row && this.row.id === values[0] ? [this.row] : []) as T[],
        rowCount: this.row ? 1 : 0
      };
    }
    if (/INSERT INTO/i.test(normalizedSql) && /DO NOTHING/i.test(normalizedSql)) {
      if (!this.row) {
        this.row = {
          id: String(values[0]),
          schema_version: String(values[1]),
          revision: 0,
          payload: values[2] as SenaEnterpriseDb
        };
      }
      return { rows: [] as T[], rowCount: this.row ? 1 : 0 };
    }
    if (/INSERT INTO/i.test(normalizedSql) && /DO UPDATE/i.test(normalizedSql)) {
      const nextRevision = this.row ? this.row.revision + 1 : 0;
      this.row = {
        id: String(values[0]),
        schema_version: String(values[1]),
        revision: nextRevision,
        payload: values[2] as SenaEnterpriseDb
      };
      return { rows: [{ revision: nextRevision }] as T[], rowCount: 1 };
    }
    if (/UPDATE/i.test(normalizedSql)) {
      if (!this.row || this.row.id !== values[1] || this.row.revision !== values[2]) {
        return { rows: [] as T[], rowCount: 0 };
      }
      this.row = {
        ...this.row,
        payload: values[0] as SenaEnterpriseDb,
        schema_version: (values[0] as SenaEnterpriseDb).schemaVersion,
        revision: this.row.revision + 1
      };
      return { rows: [{ revision: this.row.revision }] as T[], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in memory Postgres test: ${normalizedSql}`);
  }
}

describe("SENA enterprise Postgres adapter", () => {
  it("initializes the state table, writes a revision, and reads it back", async () => {
    const pg = new MemoryPostgres();
    const adapter = createEnterprisePostgresStateAdapter({
      query: pg.query.bind(pg),
      initialDb: emptyDb
    });

    const firstRead = await adapter.readState();
    expect(firstRead.initialized).toBe(true);
    expect(firstRead.revision).toBe(0);

    const nextDb = {
      ...firstRead.db,
      projects: [{
        id: "project_1",
        teamId: "team_1",
        ownerId: "user_1",
        currentVersion: 1,
        title: "Neon-backed project",
        description: "Persisted through native Postgres.",
        snapshot: { schemaVersion: "sena-project-snapshot/v1" } as never,
        datasetCounts: { people: 1, interactions: 0, utterances: 1, codedSegments: 1, codes: 1 },
        activeWindowLabel: "Full conversation",
        claimUse: "exploratory-only",
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z"
      }]
    };

    const write = await adapter.writeState(nextDb, { expectedRevision: firstRead.revision });
    expect(write.revision).toBe(1);

    const secondRead = await adapter.readState();
    expect(secondRead.initialized).toBe(false);
    expect(secondRead.revision).toBe(1);
    expect(secondRead.db.projects[0]?.title).toBe("Neon-backed project");
    expect(pg.queries.some((sql) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/.test(sql))).toBe(true);
  });

  it("writes sanitized database sync artifacts to a native Postgres table", async () => {
    const pg = new MemoryPostgres();
    const adapter = createEnterprisePostgresDatabaseSyncAdapter({
      query: pg.query.bind(pg)
    });
    const recordCounts: SenaEnterpriseBackupRecordCounts = {
      users: 0,
      teams: 1,
      memberships: 0,
      invitations: 0,
      uploads: 0,
      importRuns: 0,
      analysisRuns: 0,
      projects: 1,
      projectRevisions: 1,
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
    const backup = {
      schemaVersion: "sena-enterprise-backup/v1",
      backupId: "backup_neon_1",
      generatedAt: "2026-06-14T00:00:00.000Z",
      generatedBy: {
        userId: "user_1",
        email: "pi@example.edu",
        name: "PI"
      },
      scope: {
        mode: "selected-team",
        teamIds: ["team_1"],
        uploadBlobsIncluded: false,
        excludedCollections: ["sessions", "passwordHashes"]
      },
      manifest: {
        storageEngine: "file-backed-json",
        storagePathHint: "enterprise-db.json",
        payloadSha256: "a".repeat(64),
        recordCounts,
        retentionPolicy: {
          auditEventsMax: 1000,
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
      generatedAt: "2026-06-14T00:00:01.000Z",
      backupId: backup.backupId,
      backupGeneratedAt: backup.generatedAt,
      payloadSha256: backup.manifest.payloadSha256,
      recordCounts,
      conflicts: {
        teams: [],
        projects: [],
        uploads: []
      },
      checks: []
    } satisfies SenaEnterpriseBackupVerification;

    const write = await adapter.writeSync(backup, verification);

    expect(write).toEqual({
      backupId: backup.backupId,
      payloadSha256: backup.manifest.payloadSha256,
      revision: 1
    });
    expect(pg.syncRows).toHaveLength(1);
    expect(pg.syncRows[0].backup_id).toBe(backup.backupId);
    expect(pg.syncRows[0].record_counts.projects).toBe(1);
    expect(pg.queries.some((sql) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_database_syncs"/.test(sql))).toBe(true);
  });

  it("rejects stale revision writes with the enterprise conflict error code", async () => {
    const pg = new MemoryPostgres();
    pg.row = {
      id: "default",
      schema_version: "sena-enterprise-db/v1",
      revision: 2,
      payload: emptyDb()
    };
    const adapter = createEnterprisePostgresStateAdapter({
      query: pg.query.bind(pg),
      initialDb: emptyDb
    });

    await expect(adapter.writeState(emptyDb(), { expectedRevision: 1 })).rejects.toMatchObject({
      status: 409,
      code: "postgres_state_revision_conflict"
    });
  });

  it("detects configured Neon/Vercel Postgres without exposing the connection string", () => {
    const env = {
      SENA_ENTERPRISE_DB_ADAPTER: "postgres",
      SENA_ENTERPRISE_POSTGRES_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
    };

    const config = resolveEnterprisePostgresConfig(env);

    expect(config.configured).toBe(true);
    expect(config.mode).toBe("postgres");
    expect(config.connectionHash).toHaveLength(64);
    expect(config.evidence).toContain("url=SENA_ENTERPRISE_POSTGRES_URL");
    expect(JSON.stringify(config)).not.toContain("super-secret");
    expect(JSON.stringify(config)).not.toContain("example.neon.tech");
  });

  it("creates a pooled state adapter from Neon/Vercel Postgres environment variables", async () => {
    const pg = new MemoryPostgres();
    const createdPools: unknown[] = [];
    const { adapter } = createEnterprisePostgresStateAdapterFromEnv({
      env: {
        SENA_ENTERPRISE_DB_ADAPTER: "neon",
        DATABASE_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require",
        SENA_ENTERPRISE_POSTGRES_MAX_POOL_SIZE: "7"
      },
      initialDb: emptyDb,
      poolFactory: (options) => {
        createdPools.push(options);
        return { query: pg.query.bind(pg) };
      }
    });

    await adapter.readState();

    expect(createdPools).toHaveLength(1);
    expect(createdPools[0]).toEqual(expect.objectContaining({
      connectionString: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require",
      max: 7,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000
    }));
    expect(pg.queries.some((sql) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/.test(sql))).toBe(true);
  });
});
