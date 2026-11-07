import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalSenaJson } from "../canonical-json";
import * as protocol from "../enterprise/server-job-worker-proof-protocol";
import type { WorkerProofStoredRecord } from "../enterprise/server-job-worker-proof-store";

const NOW = new Date("2026-10-28T00:00:00.000Z");
const at = (milliseconds: number) => new Date(NOW.getTime() + milliseconds);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const issuerRuntime = "1".repeat(64);
const workerRuntime = "2".repeat(64);
const proofSecret = "dedicated-proof-secret-".repeat(3);
const queueSecret = "dedicated-queue-secret-".repeat(3);
const databaseUrl = "postgres://proof:database-secret@localhost:5432/proof";

function environment(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "test", VERCEL_ENV: "preview", VERCEL_DEPLOYMENT_ID: "dpl_worker_proof_issuer",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), SENA_ENTERPRISE_STATE_STORE: "postgres",
    SENA_ENTERPRISE_POSTGRES_URL: databaseUrl, SENA_JOB_WORKER_PROOF_SECRET: proofSecret,
    SENA_JOB_WORKER_PROOF_KEY_VERSION: "preview-2026-10",
    SENA_JOB_WORKER_PROOF_CALLBACK_URL: "https://preview.example.com/api/sena/ops/jobs/worker-proof/callback", ...overrides
  };
}
function transport(overrides: Partial<protocol.WorkerProofTransportConfig> = {}): protocol.WorkerProofTransportConfig {
  return { mode: "managed", dispatchUrl: "https://preview.example.com/api/sena/ops/jobs/worker", workerUrl: "https://preview.example.com/api/sena/ops/jobs/worker", queueSecret, ...overrides };
}
function context(runtimeSha256 = issuerRuntime, env = environment(), queue = transport()) {
  return protocol.createWorkerProofContext(env, queue, { runtimeSha256 });
}
function fixture() {
  const issuer = context();
  const worker = context(workerRuntime);
  const challenge = protocol.createWorkerProofChallenge(issuer, { now: NOW });
  const stored = protocol.workerProofStoredChallenge(issuer, challenge);
  const callback = protocol.createWorkerProofCallback(worker, challenge, { now: at(1_000) });
  const accepted = protocol.acceptWorkerProofCallback(issuer, callback, stored, { now: at(2_000) });
  const complete: WorkerProofStoredRecord = { ...stored, ...accepted, dispatchAcceptedAt: at(3_000).toISOString(), dispatchHttpStatus: 202, callbackAcceptedAt: at(2_000).toISOString() };
  return { issuer, worker, challenge, stored, callback, accepted, complete };
}
function expectStatus(action: () => unknown, status: number) { expect(action).toThrow(expect.objectContaining({ status })); }

describe("worker proof trusted configuration", () => {
  it("constructs a redacted immutable deployment binding from explicit trusted configuration", () => {
    const current = context();
    expect(current.binding).toEqual({ environment: "preview", deploymentSha256: expect.stringMatching(/^[a-f0-9]{64}$/), buildId: "a".repeat(40), queueMode: "managed", queueEndpointSha256: digest(transport().dispatchUrl), workerEndpointSha256: digest(transport().workerUrl), callbackEndpointSha256: digest(environment().SENA_JOB_WORKER_PROOF_CALLBACK_URL!), keyVersion: "preview-2026-10" });
    expect(current.bindingSha256).toBe(digest(canonicalSenaJson(current.binding)!));
    expect(JSON.stringify(current)).not.toMatch(/database-secret|dedicated-proof-secret|dedicated-queue-secret/);
    expect(Object.isFrozen(current.binding)).toBe(true);
  });

  it.each<[string, Record<string, string | undefined>]>([
    ["environment missing", { VERCEL_ENV: undefined }], ["development environment", { VERCEL_ENV: "development" }],
    ["deployment missing", { VERCEL_DEPLOYMENT_ID: undefined }], ["deployment alias", { VERCEL_DEPLOYMENT_ID: undefined, VERCEL_URL: "preview.example.com" }],
    ["build missing", { VERCEL_GIT_COMMIT_SHA: undefined }], ["short revision", { VERCEL_GIT_COMMIT_SHA: "abc1234" }],
    ["build disagreement", { SENA_JOB_WORKER_PROOF_BUILD_ID: "b".repeat(40) }],
    ["non-primary Postgres", { SENA_ENTERPRISE_STATE_STORE: "json" }], ["database missing", { SENA_ENTERPRISE_POSTGRES_URL: undefined }],
    ["secret missing", { SENA_JOB_WORKER_PROOF_SECRET: undefined }], ["short secret", { SENA_JOB_WORKER_PROOF_SECRET: "short" }],
    ["key version missing", { SENA_JOB_WORKER_PROOF_KEY_VERSION: undefined }], ["invalid key version", { SENA_JOB_WORKER_PROOF_KEY_VERSION: "key/../../secret" }],
    ["callback missing", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: undefined }],
    ["callback path", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: "https://preview.example.com/other" }],
    ["callback userinfo", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: "https://u:secret@preview.example.com/api/sena/ops/jobs/worker-proof/callback" }],
    ["callback query", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: "https://preview.example.com/api/sena/ops/jobs/worker-proof/callback?key=secret" }],
    ["callback fragment", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: "https://preview.example.com/api/sena/ops/jobs/worker-proof/callback#secret" }],
    ["remote HTTP", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: "http://preview.example.com/api/sena/ops/jobs/worker-proof/callback" }]
  ])("fails closed for %s", (_label, override) => expectStatus(() => context(issuerRuntime, environment(override)), 503));

  it.each(["dispatchUrl", "workerUrl"])("rejects unsafe %s", (key) => {
    for (const url of ["http://external.example.com/worker", "https://u:p@example.com/worker", "https://example.com/worker?", "https://example.com/worker#"]) {
      expectStatus(() => context(issuerRuntime, environment(), transport({ [key]: url })), 503);
    }
  });

  it("requires provider authentication for QStash", () => {
    expectStatus(() => context(issuerRuntime, environment(), transport({ mode: "qstash" })), 503);
    expectStatus(() => context(issuerRuntime, environment(), transport({ queueSecret: "" })), 503);
    expect(context(issuerRuntime, environment(), transport({ mode: "qstash", providerToken: "provider-secret" })).binding.queueMode).toBe("qstash");
  });

  it("requires the callback secret to be dedicated rather than reusing queue or provider credentials", () => {
    expectStatus(() => context(issuerRuntime, environment({ SENA_JOB_WORKER_PROOF_SECRET: queueSecret })), 503);
    expectStatus(() => context(issuerRuntime, environment(), transport({ providerToken: proofSecret })), 503);
  });

  it("supports immutable Vercel URL, full explicit build ID and database fallback", () => {
    const current = context(issuerRuntime, environment({ VERCEL_DEPLOYMENT_ID: undefined, VERCEL_URL: "sena-9abcdef12-team.vercel.app", VERCEL_GIT_COMMIT_SHA: undefined, SENA_JOB_WORKER_PROOF_BUILD_ID: "b".repeat(64), SENA_ENTERPRISE_POSTGRES_URL: undefined, DATABASE_URL: databaseUrl }));
    expect(current.binding.buildId).toBe("b".repeat(64));
  });

  it.each(["", " "])("uses trusted fallback identities when CLI system identifiers are blank (%j)", (blank) => {
    const env = environment({
      VERCEL_GIT_COMMIT_SHA: blank,
      SENA_JOB_WORKER_PROOF_BUILD_ID: "b".repeat(40),
      VERCEL_DEPLOYMENT_ID: blank,
      VERCEL_URL: "sena-9abcdef12-team.vercel.app"
    });
    expect(context(issuerRuntime, env).binding.buildId).toBe("b".repeat(40));
    expectStatus(() => context(issuerRuntime, { ...env, SENA_JOB_WORKER_PROOF_BUILD_ID: blank }), 503);
    expectStatus(() => context(issuerRuntime, { ...env, VERCEL_URL: blank }), 503);
    expectStatus(() => context(issuerRuntime, { ...env, VERCEL_GIT_COMMIT_SHA: "malformed" }), 503);
    expectStatus(() => context(issuerRuntime, { ...env, VERCEL_DEPLOYMENT_ID: "malformed" }), 503);
  });

  it("allows loopback HTTP and injected process identity only in tests", () => {
    const testEnv = environment({ SENA_JOB_WORKER_PROOF_CALLBACK_URL: "http://127.0.0.1:3000/api/sena/ops/jobs/worker-proof/callback" });
    expect(context(issuerRuntime, testEnv, transport({ dispatchUrl: "http://localhost:3001/worker", workerUrl: "http://[::1]:3001/worker" })).binding.environment).toBe("preview");
    expectStatus(() => protocol.createWorkerProofContext({ ...testEnv, NODE_ENV: "production" }, transport()), 503);
    expectStatus(() => context(workerRuntime, environment({ NODE_ENV: "production" })), 503);
  });

  it("shares one random process identity across duplicate module instances", async () => {
    const first = protocol.workerProofRuntimeSha256();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    vi.resetModules();
    const duplicate = await import("../enterprise/server-job-worker-proof-protocol");
    expect(duplicate.workerProofRuntimeSha256()).toBe(first);
    expect(duplicate.createWorkerProofContext(environment(), transport()).runtimeSha256).toBe(first);
  });
});

describe("worker proof challenge and worker callback", () => {
  it("stores only random nonce commitments and non-reusable per-challenge configuration MACs", () => {
    const { issuer, challenge, stored } = fixture();
    expect(challenge.id).toMatch(/^worker_proof_[a-f0-9]{24}$/);
    expect(challenge.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.nonceSha256).toBe(digest(challenge.nonce));
    expect(stored.bindingMac).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(challenge.nonce);
    const next = protocol.createWorkerProofChallenge(issuer, { now: NOW });
    expect(next.id).not.toBe(challenge.id);
    expect(next.nonce).not.toBe(challenge.nonce);
    expect(protocol.workerProofStoredChallenge(issuer, next).bindingMac).not.toBe(stored.bindingMac);
    expect(Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt)).toBe(300_000);
    for (const ttlMs of [0, -1, 300_001, 1.5]) expectStatus(() => protocol.createWorkerProofChallenge(issuer, { now: NOW, ttlMs }), 400);
  });

  it("records honest managed-HTTP evidence without exposing nonce, URLs or MACs", () => {
    const { accepted, challenge } = fixture();
    expect(accepted.receipt).toMatchObject({ generatedAt: at(2_000).toISOString(), binding: challenge.binding, issuerRuntimeSha256: issuerRuntime, workerRuntimeSha256: workerRuntime, distinctRuntimeObserved: true, separateDeploymentObserved: false, transport: "managed-http", brokerDurabilityObserved: false, syntheticUserDataIncluded: false });
    expect(JSON.stringify(accepted.receipt)).not.toMatch(/nonce|https?:|dedicated-|database-secret|bindingMac|receiptMac/);
  });

  it("permits an authenticated separate deployment of the same build", () => {
    const { issuer, challenge, stored } = fixture();
    const worker = context(workerRuntime, environment({ VERCEL_DEPLOYMENT_ID: "dpl_worker_proof_external" }));
    const callback = protocol.createWorkerProofCallback(worker, challenge, { now: at(1_000) });
    const { receipt } = protocol.acceptWorkerProofCallback(issuer, callback, stored, { now: at(2_000) });
    expect(receipt.separateDeploymentObserved).toBe(true);
    expect(receipt.workerDeploymentSha256).toBe(worker.binding.deploymentSha256);
  });

  it("rejects execution in the issuer process", () => {
    const { issuer, challenge } = fixture();
    expectStatus(() => protocol.createWorkerProofCallback(issuer, challenge, { now: at(1_000) }), 409);
  });

  it.each<[string, (value: protocol.WorkerProofChallenge) => unknown, number]>([
    ["unknown challenge field", (value) => ({ ...value, override: true }), 400],
    ["unknown binding field", (value) => ({ ...value, binding: { ...value.binding, override: true } }), 400],
    ["malformed nonce", (value) => ({ ...value, nonce: "short" }), 400],
    ["malformed ID", (value) => ({ ...value, id: "wrong-id" }), 400],
    ["noncanonical time", (value) => ({ ...value, issuedAt: "2026-10-28T00:00:00Z" }), 400],
    ["future issue time", (value) => ({ ...value, issuedAt: at(2_000).toISOString() }), 409],
    ["excess lifetime", (value) => ({ ...value, expiresAt: at(300_001).toISOString() }), 400],
    ["wrong binding digest", (value) => ({ ...value, bindingSha256: "f".repeat(64) }), 409]
  ])("rejects %s before callback generation", (_label, mutate, status) => {
    const { worker, challenge } = fixture();
    expectStatus(() => protocol.createWorkerProofCallback(worker, mutate(challenge), { now: at(1_000) }), status);
  });

  it("rejects expired worker execution and callback acceptance", () => {
    const { issuer, worker, challenge, callback, stored } = fixture();
    expectStatus(() => protocol.createWorkerProofCallback(worker, challenge, { now: at(300_000) }), 410);
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, callback, stored, { now: at(300_000) }), 410);
  });

  it("rejects worker build and endpoint mismatches", () => {
    const { challenge } = fixture();
    const wrongBuild = context(workerRuntime, environment({ VERCEL_GIT_COMMIT_SHA: "b".repeat(40) }));
    const wrongQueue = context(workerRuntime, environment(), transport({ dispatchUrl: "https://other.example.com/queue" }));
    for (const worker of [wrongBuild, wrongQueue]) expectStatus(() => protocol.createWorkerProofCallback(worker, challenge, { now: at(1_000) }), 409);
  });
});

describe("worker proof exact raw-body callback authentication", () => {
  it("uses a dedicated HMAC domain, exact body bytes and bounded canonical seconds timestamps", () => {
    const { worker, callback } = fixture();
    const raw = JSON.stringify(callback), timestamp = String(at(1_000).getTime() / 1000);
    const signature = protocol.signWorkerProofCallback(worker, raw, timestamp);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(signature).not.toBe(createHmac("sha256", proofSecret).update(`${timestamp}.${raw}`).digest("hex"));
    expect(() => protocol.authenticateWorkerProofCallback(worker, raw, timestamp, `sha256=${signature}`, { now: at(1_000) })).not.toThrow();
    expectStatus(() => protocol.authenticateWorkerProofCallback(worker, `${raw} `, timestamp, `sha256=${signature}`, { now: at(1_000) }), 401);
    for (const invalid of [signature, "sha256=bad", `sha256=${"f".repeat(64)}`]) expectStatus(() => protocol.authenticateWorkerProofCallback(worker, raw, timestamp, invalid, { now: at(1_000) }), 401);
    for (const now of [at(61_001), at(-59_001)]) expectStatus(() => protocol.authenticateWorkerProofCallback(worker, raw, timestamp, `sha256=${signature}`, { now }), 401);
    for (const invalid of [undefined, "", `0${timestamp}`, `${timestamp}.0`, `${timestamp}e0`, `${timestamp} `]) expectStatus(() => protocol.authenticateWorkerProofCallback(worker, raw, invalid, `sha256=${signature}`, { now: NOW }), 401);
  });

  it("authenticates before attempting to parse malformed JSON", () => {
    const { issuer } = fixture();
    expectStatus(() => protocol.authenticateWorkerProofCallback(issuer, "{not JSON", "1", "sha256=bad", { now: NOW }), 401);
  });
});

describe("worker proof issuer acceptance and durable verification", () => {
  it("requires both durable events and preserves callback-before-dispatch acceptance", () => {
    const { issuer, stored, accepted, complete } = fixture();
    expect(protocol.verifyStoredWorkerProof(issuer, undefined, { now: at(4_000) })).toBeUndefined();
    expect(protocol.verifyStoredWorkerProof(issuer, stored, { now: at(4_000) })).toBeUndefined();
    expect(protocol.verifyStoredWorkerProof(issuer, { ...stored, ...accepted, callbackAcceptedAt: at(2_000).toISOString() }, { now: at(4_000) })).toBeUndefined();
    const before = JSON.stringify(complete);
    const verified = protocol.verifyStoredWorkerProof(issuer, complete, { now: at(4_000) });
    expect(verified).toEqual({ receipt: accepted.receipt, receiptSha256: digest(canonicalSenaJson(accepted.receipt)!), verifiedAt: accepted.receipt.generatedAt });
    expect(JSON.stringify(complete)).toBe(before);
    const later = protocol.verifyStoredWorkerProof(issuer, complete, { now: at(64_000) });
    expect(later).toEqual(verified);
  });

  it("allows a different callback-handler process within the same issuer deployment", () => {
    const { stored, callback, complete } = fixture();
    const callbackHandler = context("3".repeat(64));
    expect(protocol.acceptWorkerProofCallback(callbackHandler, callback, stored, { now: at(2_000) }).receipt.issuerRuntimeSha256).toBe(issuerRuntime);
    expect(protocol.verifyStoredWorkerProof(callbackHandler, complete, { now: at(4_000) })).toBeDefined();
  });

  it("rejects nonce forgery, stored tampering, replay and callback overrides", () => {
    const { issuer, stored, callback, complete } = fixture();
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, { ...callback, challenge: { ...callback.challenge, nonce: "f".repeat(64) } }, stored, { now: at(2_000) }), 401);
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, callback, { ...stored, issuerRuntimeSha256: "9".repeat(64) }, { now: at(2_000) }), 409);
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, callback, complete, { now: at(2_000) }), 409);
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, { ...callback, receipt: {} }, stored, { now: at(2_000) }), 400);
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, { ...callback, workerRuntimeSha256: issuerRuntime }, stored, { now: at(2_000) }), 409);
    expectStatus(() => protocol.acceptWorkerProofCallback(issuer, { ...callback, workerBuildId: "b".repeat(40) }, stored, { now: at(2_000) }), 409);
  });

  it.each<[string, Record<string, string | undefined>, Partial<protocol.WorkerProofTransportConfig>]>([
    ["proof key", { SENA_JOB_WORKER_PROOF_SECRET: "rotated-proof-secret-".repeat(3) }, {}],
    ["key version", { SENA_JOB_WORKER_PROOF_KEY_VERSION: "next-key" }, {}],
    ["DB credential", { SENA_ENTERPRISE_POSTGRES_URL: databaseUrl.replace("database-secret", "rotated-db-secret") }, {}],
    ["queue secret", {}, { queueSecret: "rotated-queue-secret-".repeat(3) }],
    ["provider token", {}, { providerToken: "rotated-provider-token" }],
    ["source build", { VERCEL_GIT_COMMIT_SHA: "b".repeat(40) }, {}],
    ["environment", { VERCEL_ENV: "production" }, {}], ["deployment", { VERCEL_DEPLOYMENT_ID: "dpl_next_deployment" }, {}],
    ["dispatch endpoint", {}, { dispatchUrl: "https://new.example.com/worker" }],
    ["worker endpoint", {}, { workerUrl: "https://new.example.com/worker" }],
    ["callback endpoint", { SENA_JOB_WORKER_PROOF_CALLBACK_URL: "https://new.example.com/api/sena/ops/jobs/worker-proof/callback" }, {}]
  ])("invalidates pending and accepted proof after %s changes", (_label, envOverrides, queueOverrides) => {
    const { stored, callback, complete } = fixture();
    const changed = context(issuerRuntime, environment(envOverrides), transport(queueOverrides));
    expectStatus(() => protocol.acceptWorkerProofCallback(changed, callback, stored, { now: at(2_000) }), 409);
    expect(protocol.verifyStoredWorkerProof(changed, complete, { now: at(4_000) })).toBeUndefined();
  });

  it.each<[string, Partial<WorkerProofStoredRecord>]>([
    ["challenge MAC", { bindingMac: "f".repeat(64) }], ["receipt MAC", { receiptMac: "f".repeat(64) }],
    ["nonce hash", { nonceSha256: "f".repeat(64) }], ["binding digest", { bindingSha256: "f".repeat(64) }],
    ["issuer process", { issuerRuntimeSha256: "f".repeat(64) }], ["dispatch status", { dispatchHttpStatus: 500 }],
    ["dispatch absent", { dispatchAcceptedAt: undefined }], ["callback absent", { callbackAcceptedAt: undefined }],
    ["noncanonical time", { callbackAcceptedAt: "2026-10-28T00:00:02Z" }], ["early dispatch", { dispatchAcceptedAt: at(-31_000).toISOString() }],
    ["late dispatch", { dispatchAcceptedAt: at(331_000).toISOString() }], ["late callback", { callbackAcceptedAt: at(331_000).toISOString() }],
    ["future callback", { callbackAcceptedAt: at(70_000).toISOString() }]
  ])("rejects tampered or incoherent persisted %s", (_label, override) => {
    const { issuer, complete } = fixture();
    expect(protocol.verifyStoredWorkerProof(issuer, { ...complete, ...override }, { now: at(4_000) })).toBeUndefined();
  });

  it("rejects receipt tampering, unknown fields and changed acceptance claims", () => {
    const { issuer, complete } = fixture();
    for (const override of [{ generatedAt: at(3_000).toISOString() }, { workerRuntimeSha256: issuerRuntime }, { brokerDurabilityObserved: true }, { unknown: true }]) {
      expect(protocol.verifyStoredWorkerProof(issuer, { ...complete, receipt: { ...complete.receipt, ...override } }, { now: at(4_000) })).toBeUndefined();
    }
  });

  it("bounds freshness by protected receipt time and the stricter configured policy", () => {
    const { issuer, complete } = fixture();
    expect(protocol.verifyStoredWorkerProof(issuer, complete, { now: at(2_000 + 24 * 3_600_000) })).toBeDefined();
    expect(protocol.verifyStoredWorkerProof(issuer, complete, { now: at(2_001 + 24 * 3_600_000) })).toBeUndefined();
    expect(protocol.verifyStoredWorkerProof(issuer, complete, { now: at(2_001 + 3_600_000), productionEvidenceMaxAgeHours: 1 })).toBeUndefined();
    expect(protocol.verifyStoredWorkerProof(issuer, complete, { now: NOW })).toBeUndefined();
    const strict = context(issuerRuntime, environment({ SENA_PRODUCTION_EVIDENCE_MAX_AGE_HOURS: "1" }));
    expect(protocol.verifyStoredWorkerProof(strict, complete, { now: at(2_001 + 3_600_000) })).toBeUndefined();
  });

  it("survives PostgreSQL JSONB key order changes", () => {
    const { issuer, complete } = fixture();
    function reverseKeys(value: unknown): unknown {
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]));
    }
    const reordered = reverseKeys(complete) as WorkerProofStoredRecord;
    expect(protocol.verifyStoredWorkerProof(issuer, reordered, { now: at(4_000) })?.receiptSha256).toBe(protocol.verifyStoredWorkerProof(issuer, complete, { now: at(4_000) })?.receiptSha256);
  });

  it("does not expose credential or endpoint values in errors or verified receipts", () => {
    const { issuer, callback, stored, complete } = fixture();
    const failures = [() => context(issuerRuntime, environment({ SENA_JOB_WORKER_PROOF_SECRET: "sensitive-short-secret" })), () => protocol.acceptWorkerProofCallback(issuer, { ...callback, secret: proofSecret }, stored, { now: at(2_000) })];
    for (const action of failures) {
      expect(action).toThrow();
      try { action(); expect.fail("expected rejection"); } catch (error) {
        expect(`${String(error)} ${JSON.stringify(error)}`).not.toMatch(/sensitive-short-secret|dedicated-proof-secret|dedicated-queue-secret|database-secret|preview\.example\.com/);
      }
    }
    expect(JSON.stringify(protocol.verifyStoredWorkerProof(issuer, complete, { now: at(4_000) }))).not.toMatch(/nonce|bindingMac|receiptMac|https?:|dedicated-|database-secret/);
  });
});
