import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SenaEnterprisePostgresQuery } from "../enterprise-postgres";
import {
  createWorkerProofPostgresStore,
  type WorkerProofPostgresStore,
  type WorkerProofStoredRecord
} from "../enterprise/server-job-worker-proof-store";

// Opt in with SENA_WORKER_PROOF_POSTGRES_TEST=1 and initdb/pg_ctl on PATH.
// This suite creates and stops its own loopback-only cluster under TMPDIR. It
// never reads an application database URL or uses an existing PostgreSQL service.
const postgresRequested = process.env.SENA_WORKER_PROOF_POSTGRES_TEST === "1";
const run = promisify(execFile);

async function availableLoopbackPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("Temporary PostgreSQL test port was unavailable.");
  return port;
}

(postgresRequested ? describe : describe.skip)("worker proof store isolated PostgreSQL semantics", () => {
  let directory: string | undefined;
  let pool: Pool | undefined;
  let started = false;
  let store: WorkerProofPostgresStore;
  const schemaName = "worker_proof_store_test";
  const table = '"worker_proof_store_test"."sena_enterprise_worker_proofs"';

  async function cleanUp() {
    await pool?.end();
    pool = undefined;
    if (started && directory) {
      await run("pg_ctl", ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"], { timeout: 30_000 });
      started = false;
    }
    if (directory && !started) await rm(directory, { recursive: true, force: true });
  }

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "sena-worker-proof-pg-"));
    try {
      const data = join(directory, "data");
      const port = await availableLoopbackPort();
      await run("initdb", ["-D", data, "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=trust", "--username=worker_proof_test"], { timeout: 30_000 });
      await run("pg_ctl", [
        "-D", data, "-l", join(directory, "server.log"), "-w", "start", "-o",
        `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c max_connections=30`
      ], { timeout: 30_000 });
      started = true;
      pool = new Pool({ host: "127.0.0.1", port, user: "worker_proof_test", database: "postgres", max: 16, connectionTimeoutMillis: 5_000 });
      await pool.query(`CREATE SCHEMA "${schemaName}"`);
      const query: SenaEnterprisePostgresQuery = async <T>(sql: string, values?: unknown[]) => {
        const result = await pool!.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount };
      };
      store = createWorkerProofPostgresStore({ query, schemaName });
      await store.ensureSchema();
    } catch (error) {
      await cleanUp();
      throw error;
    }
  }, 60_000);

  afterAll(cleanUp, 30_000);
  beforeEach(async () => { await pool!.query(`TRUNCATE ${table}`); });

  function challenge(overrides: Partial<WorkerProofStoredRecord> = {}): WorkerProofStoredRecord {
    return {
      id: `worker_proof_${randomBytes(12).toString("hex")}`,
      nonceSha256: "a".repeat(64),
      bindingSha256: "b".repeat(64),
      bindingMac: "c".repeat(64),
      binding: { environment: "local-test", deploymentId: "ephemeral-cluster" },
      issuerRuntimeSha256: "d".repeat(64),
      issuedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ...overrides
    };
  }

  function callback(record: WorkerProofStoredRecord, label = "original") {
    return { ...record, receipt: { label, distinctRuntimeObserved: true }, receiptMac: "e".repeat(64) };
  }

  async function complete(record: WorkerProofStoredRecord) {
    await store.insertChallenge(record);
    await store.recordDispatch({ ...record, httpStatus: 202 });
    return store.consumeCallback(callback(record));
  }

  it("stores the exact challenge and rejects attempts to replace its identity", async () => {
    const record = challenge();
    expect(await store.insertChallenge(record)).toEqual(record);
    await expect(store.insertChallenge({ ...record, nonceSha256: "f".repeat(64) })).rejects.toThrow();
    expect(await store.getChallenge(record.id)).toEqual(record);
  });

  it("rejects missing challenges, wrong nonces, wrong bindings, and wrong binding MACs", async () => {
    const record = challenge();
    expect(await store.consumeCallback(callback(record))).toBeUndefined();
    await store.insertChallenge(record);
    for (const override of [
      { nonceSha256: "f".repeat(64) },
      { bindingSha256: "f".repeat(64) },
      { bindingMac: "f".repeat(64) }
    ]) {
      expect(await store.consumeCallback({ ...callback(record), ...override })).toBeUndefined();
    }
    expect((await store.getChallenge(record.id))?.callbackAcceptedAt).toBeUndefined();
    expect(await store.consumeCallback(callback(record))).toBeDefined();
  });

  it("refuses expired and excessively future-issued challenges using database time", async () => {
    const expired = challenge({ issuedAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() - 1_000).toISOString() });
    const future = challenge({ issuedAt: new Date(Date.now() + 60_000).toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString() });
    for (const record of [expired, future]) {
      await store.insertChallenge(record);
      expect(await store.consumeCallback(callback(record))).toBeUndefined();
      expect(await store.recordDispatch({ ...record, httpStatus: 200 })).toBeUndefined();
    }
  });

  it.each([
    ["callback", "update", "expired"],
    ["callback", "select-for-update", "expired"],
    ["dispatch", "update", "expired"],
    ["dispatch", "select-for-update", "expired"],
    ["callback", "select-for-update", "unexpired"],
    ["dispatch", "select-for-update", "unexpired"]
  ] as const)("checks %s time after %s lock wait for an %s challenge", async (operation, lockKind, validity) => {
    const holder = await pool!.connect();
    const waiter = await pool!.connect();
    let transactionOpen = false;
    let pending: Promise<WorkerProofStoredRecord | undefined> | undefined;
    try {
      const waitingQuery: SenaEnterprisePostgresQuery = async <T>(sql: string, values?: unknown[]) => {
        const result = await waiter.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount };
      };
      const waitingStore = createWorkerProofPostgresStore({ query: waitingQuery, schemaName });
      await waitingStore.ensureSchema();
      const { rows: [{ pid }] } = await waiter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const { rows: [{ expires_at }] } = await pool!.query<{ expires_at: Date }>(
        "SELECT clock_timestamp() + ($1::integer * interval '1 second') AS expires_at", [validity === "expired" ? 1 : 60]
      );
      const record = challenge({ expiresAt: expires_at.toISOString() });
      await store.insertChallenge(record);
      await holder.query("BEGIN");
      transactionOpen = true;
      await holder.query(lockKind === "update"
        ? `UPDATE ${table} SET binding = binding WHERE id = $1`
        : `SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [record.id]);

      pending = operation === "callback"
        ? waitingStore.consumeCallback(callback(record))
        : waitingStore.recordDispatch({ ...record, httpStatus: 202 });
      await expect.poll(async () => {
        const result = await pool!.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid]
        );
        return result.rows[0]?.wait_event_type;
      }, { interval: 10, timeout: 5_000 }).toBe("Lock");
      const { rows: [{ before_expiry }] } = await pool!.query<{ before_expiry: boolean }>(
        "SELECT clock_timestamp() < $1::timestamptz AS before_expiry", [record.expiresAt]
      );
      expect(before_expiry).toBe(true);
      if (validity === "expired") {
        await holder.query(
          "SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM $1::timestamptz - clock_timestamp())) + 0.05)",
          [record.expiresAt]
        );
      } else {
        await holder.query("SELECT pg_sleep(0.1)");
      }
      const { rows: [{ releasing_at }] } = await holder.query<{ releasing_at: Date }>("SELECT clock_timestamp() AS releasing_at");
      await holder.query("COMMIT");
      transactionOpen = false;

      const result = await pending;
      if (validity === "expired") {
        expect(result).toBeUndefined();
        expect(await store.getChallenge(record.id)).toEqual(record);
      } else {
        const acceptedAt = operation === "callback" ? result?.callbackAcceptedAt : result?.dispatchAcceptedAt;
        expect(acceptedAt).toBeDefined();
        expect(new Date(acceptedAt!).getTime()).toBeGreaterThanOrEqual(releasing_at.getTime());
        expect(await store.getChallenge(record.id)).toEqual(result);
      }
    } finally {
      if (transactionOpen) await holder.query("ROLLBACK");
      await pending?.catch(() => undefined);
      holder.release();
      waiter.release();
    }
  });

  it("does not turn dispatch failure or wrong dispatch binding into accepted proof", async () => {
    const record = challenge();
    await store.insertChallenge(record);
    await store.consumeCallback(callback(record));
    expect(await store.recordDispatch({ ...record, httpStatus: 503 })).toBeUndefined();
    expect(await store.recordDispatch({ ...record, bindingSha256: "f".repeat(64), httpStatus: 200 })).toBeUndefined();
    expect(await store.recordDispatch({ ...record, bindingMac: "f".repeat(64), httpStatus: 200 })).toBeUndefined();
    expect(await store.latestReceipt({ bindingSha256: record.bindingSha256, notBefore: record.issuedAt })).toBeUndefined();
    expect((await store.getChallenge(record.id))?.receipt).toEqual(callback(record).receipt);
  });

  it("retains an early callback when the dispatch response arrives and never refreshes accepted times", async () => {
    const record = challenge();
    await store.insertChallenge(record);
    const consumed = await store.consumeCallback(callback(record));
    expect(consumed?.callbackAcceptedAt).toBeDefined();
    expect(await store.latestReceipt({ bindingSha256: record.bindingSha256, notBefore: record.issuedAt })).toBeUndefined();
    const acknowledged = await store.recordDispatch({ ...record, httpStatus: 204 });
    expect(acknowledged?.receipt).toEqual(consumed?.receipt);
    expect(acknowledged?.receiptMac).toEqual(consumed?.receiptMac);
    expect(acknowledged?.callbackAcceptedAt).toBe(consumed?.callbackAcceptedAt);
    expect(acknowledged?.dispatchHttpStatus).toBe(204);
    expect(await store.recordDispatch({ ...record, httpStatus: 299 })).toBeUndefined();
    expect(await store.consumeCallback(callback(record, "replay"))).toBeUndefined();
    expect(await store.getChallenge(record.id)).toEqual(acknowledged);
    expect(await store.latestReceipt({ bindingSha256: record.bindingSha256, notBefore: record.issuedAt })).toEqual(acknowledged);
  });

  it("allows exactly one callback winner across concurrent database connections", async () => {
    const record = challenge();
    await store.insertChallenge(record);
    await store.recordDispatch({ ...record, httpStatus: 200 });
    const attempts = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      store.consumeCallback(callback(record, `attempt-${index}`))
    ));
    const winners = attempts.filter((result) => result !== undefined);
    expect(winners).toHaveLength(1);
    expect(await store.getChallenge(record.id)).toEqual(winners[0]);
    expect(await store.consumeCallback(callback(record, "late-replay"))).toBeUndefined();
    expect(await store.getChallenge(record.id)).toEqual(winners[0]);
  });

  it("requires dispatch and callback, the current binding, and a fresh callback for latest receipts", async () => {
    const old = challenge();
    const finished = await complete(old);
    expect(finished?.dispatchAcceptedAt).toBeDefined();
    expect(finished?.callbackAcceptedAt).toBeDefined();
    const onlyDispatch = challenge();
    await store.insertChallenge(onlyDispatch);
    await store.recordDispatch({ ...onlyDispatch, httpStatus: 200 });
    const onlyCallback = challenge();
    await store.insertChallenge(onlyCallback);
    await store.consumeCallback(callback(onlyCallback));
    const differentBinding = challenge({ bindingSha256: "f".repeat(64) });
    await complete(differentBinding);
    expect(await store.latestReceipt({ bindingSha256: old.bindingSha256, notBefore: old.issuedAt })).toEqual(finished);
    expect(await store.latestReceipt({ bindingSha256: old.bindingSha256, notBefore: new Date(Date.now() + 1_000).toISOString() })).toBeUndefined();
  });

  it("selects the newest callback and breaks identical timestamp ties deterministically", async () => {
    const first = challenge({ id: "worker_proof_000000000000000000000001" });
    const second = challenge({ ...first, id: "worker_proof_000000000000000000000002" });
    await complete(first);
    await complete(second);
    const earlier = new Date(Date.now() - 500).toISOString();
    const later = new Date(Date.now() - 100).toISOString();
    await pool!.query(`UPDATE ${table} SET callback_accepted_at = $2 WHERE id = $1`, [first.id, later]);
    await pool!.query(`UPDATE ${table} SET callback_accepted_at = $2 WHERE id = $1`, [second.id, earlier]);
    expect((await store.latestReceipt({ bindingSha256: first.bindingSha256, notBefore: first.issuedAt }))?.id).toBe(first.id);
    await pool!.query(`UPDATE ${table} SET callback_accepted_at = $1`, [later]);
    expect((await store.latestReceipt({ bindingSha256: first.bindingSha256, notBefore: first.issuedAt }))?.id).toBe(second.id);
  });
});
