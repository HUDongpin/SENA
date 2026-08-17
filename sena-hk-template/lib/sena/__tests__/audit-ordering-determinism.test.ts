import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * The audit log's ordering used to be nondeterministic for entries recorded in
 * the same millisecond, and `governance-audit-route.test.ts` flaked on it: the
 * chain sort ties on `createdAt` and then on `id`, and ids were 24 random hex
 * characters, so two entries appended a fraction of a millisecond apart got a
 * coin-toss relative order in `integrity.sample`. The delivery queue was worse
 * — it sorted on `createdAt` alone, so ties fell through to sort stability and
 * came out in the newest-first order `db.auditLog` is stored in, i.e. exactly
 * backwards.
 *
 * The fix is in the ids: they now carry a monotonic millisecond clock plus a
 * per-millisecond sequence, so the *existing* `createdAt`-then-`id` comparator
 * reproduces insertion order for a tie. That mechanism is the one thing that
 * survives both stores — the file-backed JSON keeps the object it was given,
 * and Postgres keeps `id` as a primary key it already orders on, while any
 * extra field would be dropped by the adapter's fixed column list.
 *
 * These specs pin the property, not the encoding: they assert that reads agree
 * with insertion order and with each other, and — because the audit log is a
 * tamper-evident artifact — that the chain head of an *already stored* log is a
 * function of its content alone, so archived integrity evidence still verifies.
 */

const strongPassword = "sena-secure-123";
const auditIdShape = /^audit_[a-f0-9]{24}$/;

type OpsAudit = typeof import("../enterprise/ops-audit");
type Enterprise = typeof import("../enterprise");
type State = typeof import("../enterprise/state");
type AuditEntry = import("../enterprise/ops-audit").SenaEnterpriseAuditLogEntry;

type AuditHarness = {
  audit: OpsAudit;
  enterprise: Enterprise;
  state: State;
};

async function withAuditStore<T>(
  prefix: string,
  run: (harness: AuditHarness) => Promise<T>,
  env: Record<string, string> = {}
) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  try {
    return await run({
      audit: await import("../enterprise/ops-audit"),
      enterprise: await import("../enterprise"),
      state: await import("../enterprise/state")
    });
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.resetModules();
  }
}

function seedAuditOwner(enterprise: Enterprise, slug: string) {
  return enterprise.registerEnterpriseUser({
    name: `Audit Owner ${slug}`,
    email: `audit-order-${slug}@example.edu`,
    password: strongPassword,
    organization: `Audit Lab ${slug}`,
    plan: "enterprise"
  });
}

/**
 * Only `Date` is faked. The webhook path still wants real `setTimeout`, and the
 * point here is to collapse every `createdAt` onto one millisecond, which is the
 * condition the flake needed and which wall-clock timing only produces by luck.
 */
function freezeClock(at = "2026-08-15T09:30:00.000Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(at));
  return at;
}

/**
 * The chain algorithm, recomputed from its published description rather than
 * from the module under test: sha256 over a fixed seed, then one sha256 link per
 * entry over `${chain}.${entryHash}`, walking entries oldest-first. If the
 * production comparator or hash input ever drifts, the two disagree.
 */
function recomputedChain(entries: AuditEntry[]) {
  let chainHash = createHash("sha256").update("sena-enterprise-audit-chain/v1").digest("hex");
  const rows = [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((entry) => {
      const entryHash = createHash("sha256").update(JSON.stringify({
        id: entry.id,
        event: entry.event,
        userId: entry.userId ?? null,
        teamId: entry.teamId ?? null,
        projectId: entry.projectId ?? null,
        createdAt: entry.createdAt,
        detail: Object.fromEntries(Object.entries(entry.detail).sort(([left], [right]) => left.localeCompare(right)))
      })).digest("hex");
      chainHash = createHash("sha256").update(`${chainHash}.${entryHash}`).digest("hex");
      return { id: entry.id, entryHash, chainHash };
    });
  return { rows, headHash: rows.at(-1)?.chainHash };
}

function legacyEntry(input: Partial<AuditEntry> & { id: string; createdAt: string; teamId: string }): AuditEntry {
  return {
    event: "project.read",
    detail: {},
    ...input
  } as AuditEntry;
}

/**
 * A db holding one team with a *fixed* id and nothing else, so a chain head
 * computed over hand-written entries is a constant rather than a value that
 * moves with a generated team id.
 */
function dbWithArchivedLog(state: State, teamId: string, entries: AuditEntry[]) {
  const db = state.readEnterpriseDb();
  db.teams = [{ id: teamId }] as unknown as typeof db.teams;
  db.memberships = [];
  db.auditLog = entries;
  return db;
}

describe("SENA audit log ordering determinism", () => {
  it("keeps same-millisecond entries in insertion order across repeated reads and a JSON round trip", async () => {
    await withAuditStore("sena-audit-order-same-ms-", async ({ audit, enterprise, state }) => {
      // Frozen before registration, so the whole fixture — auth.register
      // included — shares one timestamp and every pair in it is a tie.
      const frozenAt = freezeClock();
      const owner = seedAuditOwner(enterprise, "same-ms");
      const teamId = owner.context.teams[0].id;

      for (let index = 0; index < 24; index += 1) {
        audit.recordEnterpriseAudit({
          event: "project.read",
          userId: owner.context.user.id,
          teamId,
          detail: { seq: index }
        });
      }

      const db = state.readEnterpriseDb();
      const stored = db.auditLog;
      // The tie the flake needed is actually present: 25 entries, one timestamp.
      expect(stored).toHaveLength(25);
      expect(stored.every((entry) => entry.createdAt === frozenAt)).toBe(true);
      // ...and the ids are still ids, not a new public field or a new shape.
      expect(stored.every((entry) => auditIdShape.test(entry.id))).toBe(true);
      expect(new Set(stored.map((entry) => entry.id)).size).toBe(25);

      // `appendAudit` unshifts, so db.auditLog is newest-first: the seq detail
      // has to count down to the registration that opened the log, and that is
      // the insertion order every read must agree with.
      expect(stored.slice(0, 24).map((entry) => entry.detail.seq)).toEqual(
        Array.from({ length: 24 }, (_, index) => 23 - index)
      );
      expect(stored.at(-1)?.event).toBe("auth.register");

      const first = audit.verifyEnterpriseAuditIntegrityFromDb(db);
      const second = audit.verifyEnterpriseAuditIntegrityFromDb(db);
      const roundTripped = audit.verifyEnterpriseAuditIntegrityFromDb(
        JSON.parse(JSON.stringify(db))
      );
      const reread = audit.verifyEnterpriseAuditIntegrityFromDb(state.readEnterpriseDb());

      // `sample` is the last ten chain rows reversed, i.e. newest-first, which
      // for a same-millisecond block is the ten most recently inserted entries
      // in reverse insertion order.
      expect(first.sample.map((row) => row.id)).toEqual(stored.slice(0, 10).map((entry) => entry.id));
      expect(second.sample).toEqual(first.sample);
      expect(roundTripped.sample).toEqual(first.sample);
      expect(reread.sample).toEqual(first.sample);

      expect(first.chain.headHash).toMatch(/^[a-f0-9]{64}$/);
      expect(second.chain.headHash).toBe(first.chain.headHash);
      expect(roundTripped.chain.headHash).toBe(first.chain.headHash);
      expect(reread.chain.headHash).toBe(first.chain.headHash);
      expect(roundTripped.chain.firstEventHash).toBe(first.chain.firstEventHash);
      expect(roundTripped.chain.lastEventHash).toBe(first.chain.lastEventHash);
    });
  });

  it("orders the delivery queue oldest-first even when every entry shares a timestamp", async () => {
    const webhookUrl = "https://audit-order-sink.example.test/sena";
    await withAuditStore("sena-audit-order-delivery-", async ({ audit, enterprise, state }) => {
      const forwardedAuditIds: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body ?? "{}")) as { audit?: { id?: string } };
        forwardedAuditIds.push(String(payload.audit?.id));
        return new Response(null, { status: 204 });
      }));

      freezeClock();
      const owner = seedAuditOwner(enterprise, "delivery");
      const teamId = owner.context.teams[0].id;

      for (let index = 0; index < 8; index += 1) {
        audit.recordEnterpriseAudit({
          event: "project.read",
          userId: owner.context.user.id,
          teamId,
          detail: { seq: index }
        });
      }

      const beforeDelivery = state.readEnterpriseDb().auditLog;
      const oldestFirstIds = [...beforeDelivery].reverse().map((entry) => entry.id);
      expect(new Set(beforeDelivery.map((entry) => entry.createdAt)).size).toBe(1);

      const delivered = await audit.deliverEnterpriseAuditLog(owner.context, { teamId });

      expect(delivered.summary).toEqual({ attempted: 9, delivered: 9, pending: 0, failed: 0, skipped: 0 });
      // Oldest-first, matching the order the chain links them in — not the
      // newest-first order the entries happen to be stored in.
      expect(delivered.auditEvents.map((event) => event.auditId)).toEqual(oldestFirstIds);
      expect(forwardedAuditIds).toEqual(oldestFirstIds);
      expect(delivered.auditEvents[0].event).toBe("auth.register");
      expect(delivered.auditEvents.slice(1).map((event) => event.event))
        .toEqual(Array.from({ length: 8 }, () => "project.read"));
    }, {
      SENA_AUDIT_WEBHOOK_URL: webhookUrl,
      SENA_AUDIT_WEBHOOK_SECRET: "sena-audit-order-secret"
    });
  });

  it("still orders distinct timestamps by time, whatever the ids say", async () => {
    await withAuditStore("sena-audit-order-distinct-", async ({ audit, state }) => {
      const teamId = "team_distinct_audit_log";

      // Ids in the *opposite* order to the timestamps, so a read that leaned on
      // the id would come back reversed. `createdAt` is the primary key of the
      // ordering and stays that way.
      const entries = [
        legacyEntry({ id: "audit_ffffffffffffffffffffffff", createdAt: "2026-08-10T00:00:00.000Z", teamId, detail: { seq: 0 } }),
        legacyEntry({ id: "audit_aaaaaaaaaaaaaaaaaaaaaaaa", createdAt: "2026-08-11T00:00:00.000Z", teamId, detail: { seq: 1 } }),
        legacyEntry({ id: "audit_000000000000000000000000", createdAt: "2026-08-12T00:00:00.000Z", teamId, detail: { seq: 2 } })
      ];
      const db = dbWithArchivedLog(state, teamId, [...entries].reverse());

      const integrity = audit.verifyEnterpriseAuditIntegrityFromDb(db);
      expect(integrity.sample.map((row) => row.createdAt)).toEqual([
        "2026-08-12T00:00:00.000Z",
        "2026-08-11T00:00:00.000Z",
        "2026-08-10T00:00:00.000Z"
      ]);
      expect(integrity.sample.map((row) => row.id)).toEqual([
        "audit_000000000000000000000000",
        "audit_aaaaaaaaaaaaaaaaaaaaaaaa",
        "audit_ffffffffffffffffffffffff"
      ]);
      expect(integrity.chain.headHash).toBe(recomputedChain(entries).headHash);
    });
  });

  it("derives a stored log's chain head from its content alone, so archived evidence still verifies", async () => {
    await withAuditStore("sena-audit-order-archive-", async ({ audit, state }) => {
      const teamId = "team_archived_audit_log";

      // A log written *before* this change: random-hex ids, and a same-
      // millisecond pair whose order the id tie-break therefore decides. The
      // head hash below is not a fresh baseline — it is the value the shipped
      // comparator produced for these bytes, taken from the pre-change
      // `auditChainRows`, and it must keep coming out the same.
      const archived = [
        legacyEntry({ id: "audit_3f1c9a0b7e2d4856af09c31d", createdAt: "2026-08-11T12:00:00.000Z", teamId, detail: { seq: 0 } }),
        legacyEntry({ id: "audit_b2740e6559ca18d3f0e7a412", createdAt: "2026-08-11T12:00:01.500Z", teamId, detail: { seq: 1, note: "tied" } }),
        legacyEntry({ id: "audit_0c5e8137da96b204e5f1c8a7", createdAt: "2026-08-11T12:00:01.500Z", teamId, detail: { note: "tied", seq: 2 } })
      ];
      const db = dbWithArchivedLog(state, teamId, [...archived].reverse());

      const integrity = audit.verifyEnterpriseAuditIntegrityFromDb(db);
      expect(integrity.chain.eventCount).toBe(3);
      expect(integrity.chain.headHash).toBe("fd4b0ed60719dcbc483bf8508021d07ef435bb7e19600a8c6057b4ba7f125199");
      expect(integrity.chain.headHash).toBe(recomputedChain(archived).headHash);

      // The tie is resolved by id, ascending — the rule the archived head was
      // computed under.
      expect(integrity.sample.map((row) => row.id)).toEqual([
        "audit_b2740e6559ca18d3f0e7a412",
        "audit_0c5e8137da96b204e5f1c8a7",
        "audit_3f1c9a0b7e2d4856af09c31d"
      ]);

      // Reading the same entries back in any order — file store newest-first,
      // Postgres `ORDER BY created_at DESC, id DESC`, or anything else — yields
      // the same head, because the chain is a function of content, not of the
      // array it arrived in.
      for (const order of [archived, [...archived].reverse(), [archived[1], archived[0], archived[2]]]) {
        const shuffled = dbWithArchivedLog(state, teamId, [...order]);
        expect(audit.verifyEnterpriseAuditIntegrityFromDb(shuffled).chain.headHash)
          .toBe(integrity.chain.headHash);
      }
    });
  });

  it("mints strictly increasing ids inside a single millisecond", async () => {
    await withAuditStore("sena-audit-order-ids-", async ({ audit, enterprise, state }) => {
      const frozenAt = freezeClock();
      const owner = seedAuditOwner(enterprise, "ids");
      const teamId = owner.context.teams[0].id;

      const db = state.readEnterpriseDb();
      const append = (seq: number) => audit.appendAudit(db, {
        event: "project.read",
        userId: owner.context.user.id,
        teamId,
        detail: { seq }
      });
      for (let index = 0; index < 200; index += 1) {
        append(index);
      }
      // A wall clock that steps backwards — NTP correction, a container clock
      // settling — must not hand out an id that sorts before one already
      // written, or the log would read as reordered.
      vi.setSystemTime(new Date(Date.parse(frozenAt) - 60_000));
      for (let index = 200; index < 205; index += 1) {
        append(index);
      }
      const minted = [...db.auditLog].reverse().map((entry) => entry.id);

      expect(minted).toHaveLength(206);
      expect(new Set(minted).size).toBe(206);
      expect(minted.every((value: string) => auditIdShape.test(value))).toBe(true);
      // Insertion order and lexicographic order are the same order. That is the
      // whole mechanism: the comparator did not change, the ids did.
      expect([...minted].sort((a, b) => a.localeCompare(b))).toEqual(minted);
    });
  });
});
