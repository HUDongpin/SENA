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
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import { resolveEnterprisePublicationStateBundleFromState } from "../enterprise/publication-state-binding";
import { assertSenaPublicationModelCardReady } from "../publication-export";
import { loadSena14bb306ReviewPacketFixture } from "./fixtures/sena-14bb306-fixture";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

function sha256(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function legacyProjectDb() {
  const packet = loadSena14bb306ReviewPacketFixture() as SenaReviewPacket;
  const snapshot = structuredClone(packet.contents.projectSnapshot);
  snapshot.report.modelCard.renderGate = {
    status: "ready",
    missingSectionIds: [],
    message: "Stale historical cache incorrectly claimed publication readiness."
  };
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

function modelCardRenderGate(snapshot: unknown) {
  return (snapshot as {
    report: { modelCard: { renderGate: { status: string; missingSectionIds: string[] } } };
  }).report.modelCard.renderGate;
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
      expect(modelCardRenderGate(persistedSnapshot).status).toBe("ready");
      expect(modelCardRenderGate(before.db.projects[0].snapshot)).toEqual(expect.objectContaining({
        status: "blocked",
        missingSectionIds: expect.arrayContaining(["coding-reliability"])
      }));
      expect(() => assertSenaPublicationModelCardReady(before.db.projects[0].snapshot.report))
        .toThrowError(expect.objectContaining({
          status: 409,
          code: "publication_export_model_card_blocked"
        }));

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
      expect(modelCardRenderGate(afterPersisted.projects[0].snapshot).status).toBe("ready");
      expect(modelCardRenderGate(afterView.db.projects[0].snapshot)).toEqual(expect.objectContaining({
        status: "blocked",
        missingSectionIds: expect.arrayContaining(["coding-reliability"])
      }));
      expect(afterPersisted.projects[0].currentVersion).toBe(7);
      expect(afterPersisted.projectRevisions[0].version).toBe(7);
      expect(sha256(afterView.db.projects[0].snapshot)).toBe(derivedProjectHash);
      expect(codingGateVersion(afterView.db.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v2");
    } finally {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it("binds publication persisted and read-projection hashes to the same raw file revision", () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-state-read-projection-publication-"));
    try {
      const dbPath = path.join(dbDir, "enterprise-db.json");
      writeFileSync(dbPath, JSON.stringify(legacyProjectDb()));
      const store = createFileEnterpriseStateStore({ dbDir, createEmptyDb: emptyEnterpriseDb });
      const state = store.readState();
      const context = {
        memberships: [{ teamId: "team_projection", role: "owner", status: "active" }]
      } as SenaEnterpriseSessionContext;
      const bundle = resolveEnterprisePublicationStateBundleFromState(
        context,
        "project_legacy_projection",
        {
          db: state.db,
          persistedDb: state.persistedDb,
          fileRevision: state.revision,
          runtime: { activePrimary: "file" } as never
        }
      );
      const rawProject = (JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb).projects[0];

      expect(bundle.stateBinding.stateRevision).toBe(state.revision);
      expect(bundle.stateBinding.project.persistedSnapshotSha256).toBe(sha256(rawProject.snapshot));
      expect(bundle.stateBinding.project.readProjectionSnapshotSha256).toBe(sha256(state.db.projects[0].snapshot));
      expect(bundle.stateBinding.project.persistedSnapshotSha256)
        .not.toBe(bundle.stateBinding.project.readProjectionSnapshotSha256);
      expect(bundle.claimPackage.sourceSnapshotEvidence).toEqual(expect.objectContaining({
        persistedSnapshotSha256: bundle.stateBinding.project.persistedSnapshotSha256,
        readProjectionSnapshotSha256: bundle.stateBinding.project.readProjectionSnapshotSha256,
        stateRevisionSha256: bundle.stateBinding.stateRevisionSha256
      }));
      expect(bundle.stateBinding.claimPackage.reliabilityRunId).toBeNull();
      expect(bundle.stateBinding.reliabilityRun).toBeNull();
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
      expect(modelCardRenderGate(state.db.projects[0].snapshot)).toEqual(expect.objectContaining({
        status: "blocked",
        missingSectionIds: expect.arrayContaining(["coding-reliability"])
      }));

      await stateRuntime.saveEnterpriseState(state, state.db);
      expect(pg.state?.revision).toBe(7);

      state.db.teams.push({ id: "team_postgres_unrelated" } as never);
      await stateRuntime.saveEnterpriseState(state, state.db);

      expect(pg.state?.revision).toBe(8);
      expect(pg.state?.payload.teams.map((team) => team.id)).toContain("team_postgres_unrelated");
      expect(sha256(pg.state?.payload.projects[0].snapshot)).toBe(projectHash);
      expect(sha256(pg.state?.payload.projectRevisions[0].snapshot)).toBe(revisionHash);
      expect(codingGateVersion(pg.state?.payload.projects[0].snapshot)).toBe("sena-coding-reliability-gate/v1");
      expect(modelCardRenderGate(pg.state?.payload.projects[0].snapshot).status).toBe("ready");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      vi.doUnmock("pg");
      vi.resetModules();
    }
  });
});
