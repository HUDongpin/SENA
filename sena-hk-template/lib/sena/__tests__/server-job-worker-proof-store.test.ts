import { describe, expect, it, vi } from "vitest";
import type { SenaEnterprisePostgresQuery } from "../enterprise-postgres";
import { SenaEnterpriseError } from "../enterprise/errors";
import {
  createWorkerProofPostgresStore,
  type WorkerProofStoredRecord
} from "../enterprise/server-job-worker-proof-store";

const issuedAt = "2026-10-28T00:00:00.000Z";
const expiresAt = "2026-10-28T00:05:00.000Z";

function challenge(): WorkerProofStoredRecord {
  return {
    id: "worker_proof_0123456789abcdef01234567",
    nonceSha256: "a".repeat(64),
    bindingSha256: "b".repeat(64),
    bindingMac: "c".repeat(64),
    binding: { environment: "preview", deploymentId: "isolated-preview" },
    issuerRuntimeSha256: "d".repeat(64),
    issuedAt,
    expiresAt
  };
}

function driverRow(record = challenge()) {
  return {
    id: record.id,
    nonce_sha256: record.nonceSha256,
    binding_sha256: record.bindingSha256,
    binding_mac: record.bindingMac,
    binding: record.binding,
    issuer_runtime_sha256: record.issuerRuntimeSha256,
    issued_at: new Date(record.issuedAt),
    expires_at: new Date(record.expiresAt),
    dispatch_accepted_at: record.dispatchAcceptedAt ? new Date(record.dispatchAcceptedAt) : null,
    dispatch_http_status: record.dispatchHttpStatus ?? null,
    callback_accepted_at: record.callbackAcceptedAt ? new Date(record.callbackAcceptedAt) : null,
    receipt: record.receipt ?? null,
    receipt_mac: record.receiptMac ?? null
  };
}

function queryFixture(rows: Record<string, unknown>[] = []) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const query: SenaEnterprisePostgresQuery = async <T>(sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    return { rows: (/^\s*CREATE\b/i.test(sql) ? [] : rows) as T[] };
  };
  return { calls, query };
}

describe("worker proof PostgreSQL store adapter", () => {
  it("persists only the declared immutable challenge fields and returns driver timestamps as ISO", async () => {
    const record = challenge();
    const fixture = queryFixture([driverRow(record)]);
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    const returned = await store.insertChallenge({ ...record, nonce: "must-not-be-persisted" } as WorkerProofStoredRecord);

    expect(returned).toEqual(record);
    const writes = fixture.calls.filter(({ sql }) => /^\s*INSERT\b/i.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual([
      record.id, record.nonceSha256, record.bindingSha256, record.bindingMac,
      JSON.stringify(record.binding), record.issuerRuntimeSha256, issuedAt, expiresAt
    ]);
    expect(JSON.stringify(fixture.calls)).not.toContain("must-not-be-persisted");
  });

  it("returns a stored receipt without changing its signed content or acceptance times", async () => {
    const record = {
      ...challenge(),
      dispatchAcceptedAt: "2026-10-28T00:00:02.000Z",
      dispatchHttpStatus: 204,
      callbackAcceptedAt: "2026-10-28T00:00:01.000Z",
      receipt: { proof: "opaque", observed: { distinctRuntime: true }, labels: ["worker"] },
      receiptMac: "e".repeat(64)
    };
    const fixture = queryFixture([driverRow(record)]);
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    expect(await store.getChallenge(record.id)).toEqual(record);
    expect(await store.latestReceipt({ bindingSha256: record.bindingSha256, notBefore: issuedAt })).toEqual(record);
  });

  it("returns undefined for missing reads and conditional update misses", async () => {
    const fixture = queryFixture();
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    const record = challenge();
    expect(await store.getChallenge(record.id)).toBeUndefined();
    expect(await store.latestReceipt({ bindingSha256: record.bindingSha256, notBefore: issuedAt })).toBeUndefined();
    expect(await store.recordDispatch({ ...record, httpStatus: 202 })).toBeUndefined();
    expect(await store.consumeCallback({ ...record, receipt: { test: true }, receiptMac: "e".repeat(64) })).toBeUndefined();
  });

  it.each([199, 300, 401, 500])("does not access storage to acknowledge HTTP %s", async (httpStatus) => {
    const fixture = queryFixture();
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    expect(await store.recordDispatch({ ...challenge(), httpStatus })).toBeUndefined();
    expect(fixture.calls).toHaveLength(0);
  });

  it("consumes a callback in one database operation", async () => {
    const fixture = queryFixture();
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    await store.ensureSchema();
    fixture.calls.length = 0;
    await store.consumeCallback({ ...challenge(), receipt: { opaque: true }, receiptMac: "e".repeat(64) });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0].values).toEqual([
      challenge().id, challenge().nonceSha256, challenge().bindingSha256, challenge().bindingMac,
      JSON.stringify({ opaque: true }), "e".repeat(64)
    ]);
  });

  it.each([
    { nonceSha256: "raw-nonce" },
    { bindingSha256: "B".repeat(64) },
    { bindingMac: "not-a-mac" },
    { issuerRuntimeSha256: "short" },
    { id: "bad id" },
    { issuedAt: "2026-10-28" },
    { expiresAt: "2026-10-28T00:00:00.000Z" },
    { expiresAt: "2026-02-30T00:00:00.000Z" },
    { binding: { deploymentId: 42 } },
    { receipt: { forged: true } },
    { callbackAcceptedAt: issuedAt },
    { dispatchAcceptedAt: issuedAt },
    { dispatchHttpStatus: 200 },
    { receiptMac: "e".repeat(64) }
  ])("rejects malformed or pre-accepted challenges before storage: %j", async (override) => {
    const fixture = queryFixture();
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    await expect(store.insertChallenge({ ...challenge(), ...override } as WorkerProofStoredRecord)).rejects.toBeInstanceOf(SenaEnterpriseError);
    expect(fixture.calls).toHaveLength(0);
  });

  it.each(["public; DROP TABLE anything", "public.other", "", "x".repeat(64)])("rejects invalid schema identifiers: %s", (schemaName) => {
    expect(() => createWorkerProofPostgresStore({ query: queryFixture().query, schemaName })).toThrow(SenaEnterpriseError);
  });

  it("quotes a valid custom schema and only initializes the additive table/index once", async () => {
    const fixture = queryFixture();
    const store = createWorkerProofPostgresStore({ query: fixture.query, schemaName: "ProofPreview_1" });
    await Promise.all([store.ensureSchema(), store.ensureSchema()]);
    await store.ensureSchema();
    expect(fixture.calls).toHaveLength(2);
    expect(fixture.calls.every(({ sql }) => /^\s*CREATE (TABLE|INDEX) IF NOT EXISTS\b/.test(sql))).toBe(true);
    expect(fixture.calls.every(({ sql }) => sql.includes('"ProofPreview_1"."sena_enterprise_worker_proofs"'))).toBe(true);
  });

  it("propagates unavailable storage without a fallback and permits a later schema retry", async () => {
    const unavailable = new Error("test storage unavailable");
    const fail = vi.fn().mockRejectedValueOnce(unavailable).mockResolvedValue({ rows: [] });
    const store = createWorkerProofPostgresStore({ query: fail });
    await expect(store.ensureSchema()).rejects.toBe(unavailable);
    await expect(store.ensureSchema()).resolves.toBeUndefined();
    expect(fail).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed conditional operation inputs before storage", async () => {
    const fixture = queryFixture();
    const store = createWorkerProofPostgresStore({ query: fixture.query });
    const record = challenge();
    await expect(store.getChallenge("bad id")).rejects.toBeInstanceOf(SenaEnterpriseError);
    await expect(store.latestReceipt({ bindingSha256: "bad", notBefore: issuedAt })).rejects.toBeInstanceOf(SenaEnterpriseError);
    await expect(store.latestReceipt({ bindingSha256: record.bindingSha256, notBefore: "yesterday" })).rejects.toBeInstanceOf(SenaEnterpriseError);
    await expect(store.recordDispatch({ ...record, httpStatus: 200.5 })).rejects.toBeInstanceOf(SenaEnterpriseError);
    await expect(store.consumeCallback({ ...record, receipt: [], receiptMac: "e".repeat(64) } as never)).rejects.toBeInstanceOf(SenaEnterpriseError);
    await expect(store.consumeCallback({ ...record, receipt: {}, receiptMac: "raw-secret" })).rejects.toBeInstanceOf(SenaEnterpriseError);
    expect(fixture.calls).toHaveLength(0);
  });
});
