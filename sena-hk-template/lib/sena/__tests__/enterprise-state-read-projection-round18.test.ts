import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createFileEnterpriseStateStore,
  emptyEnterpriseDb,
  type SenaEnterpriseDb
} from "../enterprise/state";
import type { SenaReviewPacket } from "../types";
import { loadSena14bb306ReviewPacketFixture } from "./fixtures/sena-14bb306-fixture";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

function sha256(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function legacyProjectDb() {
  const packet = loadSena14bb306ReviewPacketFixture() as SenaReviewPacket;
  const snapshot = structuredClone(packet.contents.projectSnapshot);
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  const datasetCounts = {
    people: source.people.length,
    interactions: source.interactions.length,
    utterances: source.utterances.length,
    codedSegments: source.coded_segments.length,
    codes: source.codebook.length
  };
  const db = emptyEnterpriseDb();
  db.projects = [{
    id: "project_legacy_projection",
    teamId: "team_projection",
    ownerId: "user_projection",
    currentVersion: 7,
    title: "Legacy projection",
    description: "Read-only compatibility evidence",
    snapshot,
    datasetCounts,
    activeWindowLabel: snapshot.source.activeTemporalWindow?.label ?? "Full conversation",
    claimUse: snapshot.report.claimReadinessGate.claimUse,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z"
  }] as SenaEnterpriseDb["projects"];
  db.projectRevisions = [{
    id: "revision_legacy_projection_7",
    projectId: "project_legacy_projection",
    teamId: "team_projection",
    userId: "user_projection",
    version: 7,
    summary: "Legacy snapshot revision",
    snapshot: structuredClone(snapshot),
    datasetCounts,
    activeWindowLabel: snapshot.source.activeTemporalWindow?.label ?? "Full conversation",
    claimUse: snapshot.report.claimReadinessGate.claimUse,
    createdAt: "2026-08-18T00:00:00.000Z"
  }] as SenaEnterpriseDb["projectRevisions"];
  return db;
}

function codingGateVersion(snapshot: unknown) {
  return (snapshot as {
    report: { codingReliabilityGate: { schemaVersion: string } };
  }).report.codingReliabilityGate.schemaVersion;
}

describe("enterprise legacy state read projections", () => {
  it("keeps raw bytes and the file revision unchanged across a projection-only read/save", () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-state-read-projection-noop-"));
    try {
      const dbPath = path.join(dbDir, "enterprise-db.json");
      writeFileSync(dbPath, JSON.stringify(legacyProjectDb()));
      const store = createFileEnterpriseStateStore({
        dbDir,
        createEmptyDb: emptyEnterpriseDb
      });
      const beforeRaw = readFileSync(dbPath, "utf8");
      const before = store.readState();
      const persistedSnapshot = (JSON.parse(beforeRaw) as SenaEnterpriseDb).projects[0].snapshot;

      expect(codingGateVersion(persistedSnapshot)).toBe("sena-coding-reliability-gate/v1");
      expect(codingGateVersion(before.db.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v2");
      expect(sha256(before.db.projects[0].snapshot)).not.toBe(sha256(persistedSnapshot));

      store.save(before.db);

      expect(readFileSync(dbPath, "utf8")).toBe(beforeRaw);
      expect(store.readState().revision).toBe(before.revision);
    } finally {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it("persists an unrelated mutation without rewriting project or revision snapshot evidence", () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-state-read-projection-write-"));
    try {
      const dbPath = path.join(dbDir, "enterprise-db.json");
      writeFileSync(dbPath, JSON.stringify(legacyProjectDb()));
      const store = createFileEnterpriseStateStore({
        dbDir,
        createEmptyDb: emptyEnterpriseDb
      });
      const beforePersisted = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
      const beforeView = store.readState();
      const persistedProjectHash = sha256(beforePersisted.projects[0].snapshot);
      const persistedRevisionHash = sha256(beforePersisted.projectRevisions[0].snapshot);
      const derivedProjectHash = sha256(beforeView.db.projects[0].snapshot);

      store.mutateAtomically((db) => {
        db.teams.push({ id: "team_unrelated_write" } as never);
      });

      const afterPersisted = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
      const afterView = store.readState();
      expect(afterPersisted.teams.map((team) => team.id)).toContain("team_unrelated_write");
      expect(sha256(afterPersisted.projects[0].snapshot)).toBe(persistedProjectHash);
      expect(sha256(afterPersisted.projectRevisions[0].snapshot)).toBe(persistedRevisionHash);
      expect(codingGateVersion(afterPersisted.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v1");
      expect(afterPersisted.projects[0].currentVersion).toBe(7);
      expect(afterPersisted.projectRevisions[0].version).toBe(7);
      expect(sha256(afterView.db.projects[0].snapshot)).toBe(derivedProjectHash);
      expect(codingGateVersion(afterView.db.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v2");
    } finally {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it("keeps the same read-projection boundary through Postgres primary state", async () => {
    const pg = new RouteMemoryPostgres();
    const persisted = legacyProjectDb();
    const projectHash = sha256(persisted.projects[0].snapshot);
    const revisionHash = sha256(persisted.projectRevisions[0].snapshot);
    pg.state = { revision: 7, payload: persisted };
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena:test@example.test/sena";
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

    try {
      const stateRuntime = await import("../enterprise/state");
      const state = await stateRuntime.readEnterpriseState();
      expect(state.runtime.activePrimary).toBe("postgres");
      expect(codingGateVersion(state.db.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v2");

      await stateRuntime.saveEnterpriseState(state, state.db);
      expect(pg.state?.revision).toBe(7);

      state.db.teams.push({ id: "team_postgres_unrelated" } as never);
      await stateRuntime.saveEnterpriseState(state, state.db);

      expect(pg.state?.revision).toBe(8);
      expect(pg.state?.payload.teams.map((team) => team.id)).toContain("team_postgres_unrelated");
      expect(sha256(pg.state?.payload.projects[0].snapshot)).toBe(projectHash);
      expect(sha256(pg.state?.payload.projectRevisions[0].snapshot)).toBe(revisionHash);
      expect(codingGateVersion(pg.state?.payload.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v1");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      vi.doUnmock("pg");
      vi.resetModules();
    }
  });
});
