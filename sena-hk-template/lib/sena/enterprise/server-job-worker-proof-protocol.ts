import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { canonicalSenaJson } from "../canonical-json";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import { productionEvidenceMaxAgeHours } from "./ops-runtime";
import { enterprisePostgresConnectionStringFromEnv } from "./postgres-url-env";
import type { WorkerProofStoredRecord } from "./server-job-worker-proof-store";

export interface WorkerProofTransportConfig {
  mode: "managed" | "webhook" | "qstash";
  dispatchUrl: string;
  workerUrl: string;
  queueSecret: string;
  providerToken?: string;
}

export interface WorkerProofBinding extends Record<string, string> {
  environment: "preview" | "production";
  deploymentSha256: string;
  buildId: string;
  queueMode: WorkerProofTransportConfig["mode"];
  queueEndpointSha256: string;
  workerEndpointSha256: string;
  callbackEndpointSha256: string;
  keyVersion: string;
}

export interface WorkerProofContext {
  readonly binding: Readonly<WorkerProofBinding>;
  readonly bindingSha256: string;
  readonly runtimeSha256: string;
  readonly callbackUrl: string;
}

export interface WorkerProofChallenge extends Record<string, unknown> {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge;
  id: string;
  nonce: string;
  binding: WorkerProofBinding;
  bindingSha256: string;
  issuerRuntimeSha256: string;
  issuedAt: string;
  expiresAt: string;
}

export interface WorkerProofCallback extends Record<string, unknown> {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofCallback;
  challenge: WorkerProofChallenge;
  workerRuntimeSha256: string;
  workerDeploymentSha256: string;
  workerBuildId: string;
}

/** Runtime self-attestation; neither process IDs nor deployment IDs are independent infrastructure attestation. */
export interface WorkerProofReceipt extends Record<string, unknown> {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofReceipt;
  generatedAt: string;
  proofIdSha256: string;
  challengeSha256: string;
  binding: WorkerProofBinding;
  issuerRuntimeSha256: string;
  workerRuntimeSha256: string;
  workerDeploymentSha256: string;
  distinctRuntimeObserved: true;
  separateDeploymentObserved: boolean;
  transport: "managed-http" | "webhook-http" | "qstash-http";
  brokerDurabilityObserved: false;
  syntheticUserDataIncluded: false;
}

type ContextSecrets = { proofSecret: string; credentialConfiguration: string; maxAgeHours: number };
const contextSecrets = new WeakMap<WorkerProofContext, ContextSecrets>();
const HASH = /^[a-f0-9]{64}$/;
const BUILD = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ID = /^worker_proof_[a-f0-9]{24}$/;
const CALLBACK_PATH = "/api/sena/ops/jobs/worker-proof/callback";
const MAX_TTL_MS = 300_000;
const CLOCK_SKEW_MS = 30_000;
const CALLBACK_SKEW_MS = 60_000;
const bindingKeys = ["environment", "deploymentSha256", "buildId", "queueMode", "queueEndpointSha256", "workerEndpointSha256", "callbackEndpointSha256", "keyVersion"];
const challengeKeys = ["schemaVersion", "id", "nonce", "binding", "bindingSha256", "issuerRuntimeSha256", "issuedAt", "expiresAt"];
const callbackKeys = ["schemaVersion", "challenge", "workerRuntimeSha256", "workerDeploymentSha256", "workerBuildId"];
const receiptKeys = ["schemaVersion", "generatedAt", "proofIdSha256", "challengeSha256", "binding", "issuerRuntimeSha256", "workerRuntimeSha256", "workerDeploymentSha256", "distinctRuntimeObserved", "separateDeploymentObserved", "transport", "brokerDurabilityObserved", "syntheticUserDataIncluded"];

function fail(status: number, code: string): never {
  const message = status === 503 ? "Worker proof configuration is unavailable."
    : status === 401 ? "Worker proof authentication failed."
      : status === 410 ? "Worker proof challenge has expired."
        : status === 409 ? "Worker proof state does not match."
          : "Worker proof input is invalid.";
  throw new SenaEnterpriseError(message, status, code);
}

function configurationInvalid(): never { return fail(503, "worker_proof_configuration_unavailable"); }
function invalidInput(): never { return fail(400, "worker_proof_input_invalid"); }
function mismatch(): never { return fail(409, "worker_proof_binding_mismatch"); }
function authenticationFailed(): never { return fail(401, "worker_proof_authentication_failed"); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown) { return canonicalSenaJson(value)!; }
function hashObject(value: unknown) { return sha256(canonical(value)); }
function secrets(context: WorkerProofContext) { return contextSecrets.get(context) ?? configurationInvalid(); }
function constantHashEqual(left: unknown, right: unknown): boolean {
  return typeof left === "string" && typeof right === "string" && HASH.test(left) && HASH.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
function mac(context: WorkerProofContext, domain: string, body: string) {
  return createHmac("sha256", secrets(context).proofSecret).update(`sena.worker-proof.${domain}.v1\n${body}`).digest("hex");
}
function nowMilliseconds(now: Date = new Date()) {
  const value = now.getTime();
  if (!Number.isFinite(value)) invalidInput();
  return value;
}
function canonicalTime(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : undefined;
}
function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function validBinding(value: unknown): value is WorkerProofBinding {
  if (!exactObject(value, bindingKeys) || !Object.values(value).every((entry) => typeof entry === "string")) return false;
  return (value.environment === "preview" || value.environment === "production")
    && (value.queueMode === "managed" || value.queueMode === "webhook" || value.queueMode === "qstash")
    && BUILD.test(value.buildId as string) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value.keyVersion as string)
    && ["deploymentSha256", "queueEndpointSha256", "workerEndpointSha256", "callbackEndpointSha256"].every((key) => HASH.test(value[key] as string));
}
function endpoint(value: unknown, testEnvironment: boolean, callback = false): string {
  if (typeof value !== "string" || !value || value !== value.trim() || /[?#]/.test(value)) configurationInvalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return configurationInvalid(); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(testEnvironment && loopback && parsed.protocol === "http:"))
    || parsed.username || parsed.password || (callback && parsed.pathname !== CALLBACK_PATH)) configurationInvalid();
  return parsed.toString();
}

/** One identity per process, shared by duplicate Next bundles. Request payloads never supply this value. */
export function workerProofRuntimeSha256(): string {
  const key = Symbol.for("sena.worker-proof.process-runtime-sha256.v1");
  const shared = globalThis as typeof globalThis & { [key: symbol]: unknown };
  if (shared[key] === undefined) Object.defineProperty(shared, key, { value: sha256(randomBytes(32).toString("hex")), writable: false, configurable: false });
  if (typeof shared[key] !== "string" || !HASH.test(shared[key] as string)) configurationInvalid();
  return shared[key] as string;
}

export function createWorkerProofContext(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  transport: WorkerProofTransportConfig,
  options: { runtimeSha256?: string } = {}
): WorkerProofContext {
  const environment = env.VERCEL_ENV?.trim();
  const testEnvironment = env.NODE_ENV === "test";
  const proofSecret = env.SENA_JOB_WORKER_PROOF_SECRET;
  const keyVersion = env.SENA_JOB_WORKER_PROOF_KEY_VERSION?.trim();
  const database = enterprisePostgresConnectionStringFromEnv(env);
  if ((environment !== "preview" && environment !== "production") || env.SENA_ENTERPRISE_STATE_STORE?.trim() !== "postgres"
    || !database || !proofSecret || proofSecret.trim().length < 32 || !keyVersion || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(keyVersion)
    || !transport || !["managed", "webhook", "qstash"].includes(transport.mode)
    || typeof transport.queueSecret !== "string" || !transport.queueSecret.trim()
    || proofSecret === transport.queueSecret || proofSecret === transport.providerToken
    || (transport.providerToken !== undefined && (typeof transport.providerToken !== "string" || !transport.providerToken.trim()))
    || (transport.mode === "qstash" && !transport.providerToken)) configurationInvalid();
  try {
    const parsed = new URL(database);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password) configurationInvalid();
  } catch { configurationInvalid(); }
  const builds = [env.VERCEL_GIT_COMMIT_SHA, env.SENA_JOB_WORKER_PROOF_BUILD_ID]
    .filter((value): value is string => value !== undefined).map((value) => value.trim().toLowerCase());
  if (!builds.length || builds.some((value) => !BUILD.test(value) || value !== builds[0])) configurationInvalid();
  let deploymentIdentity: string;
  if (env.VERCEL_DEPLOYMENT_ID !== undefined) {
    const id = env.VERCEL_DEPLOYMENT_ID.trim();
    if (!/^dpl_[A-Za-z0-9_-]{1,128}$/.test(id)) configurationInvalid();
    deploymentIdentity = `deployment-id:${id}`;
  } else {
    const hostname = env.VERCEL_URL?.trim().toLowerCase();
    // VERCEL_URL is the immutable generated deployment host, never an alias or branch URL.
    if (!hostname || !/^[a-z0-9][a-z0-9-]*-[a-z0-9]{8,16}-[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(hostname)) configurationInvalid();
    deploymentIdentity = `deployment-url:${hostname}`;
  }
  const callbackUrl = endpoint(env.SENA_JOB_WORKER_PROOF_CALLBACK_URL, testEnvironment, true);
  const binding: WorkerProofBinding = Object.freeze({
    environment, deploymentSha256: sha256(deploymentIdentity), buildId: builds[0], queueMode: transport.mode,
    queueEndpointSha256: sha256(endpoint(transport.dispatchUrl, testEnvironment)),
    workerEndpointSha256: sha256(endpoint(transport.workerUrl, testEnvironment)),
    callbackEndpointSha256: sha256(callbackUrl), keyVersion
  });
  if (options.runtimeSha256 !== undefined && (!testEnvironment || !HASH.test(options.runtimeSha256))) configurationInvalid();
  const context = Object.freeze({ binding, bindingSha256: hashObject(binding), callbackUrl, runtimeSha256: options.runtimeSha256 ?? workerProofRuntimeSha256() });
  contextSecrets.set(context, {
    proofSecret,
    // This material is never exported or reduced to a reusable public credential fingerprint.
    credentialConfiguration: canonical({ proofSecret, queueSecret: transport.queueSecret, providerToken: transport.providerToken ?? null, database }),
    maxAgeHours: Math.min(24, productionEvidenceMaxAgeHours(env))
  });
  return context;
}

function parseChallenge(input: unknown): WorkerProofChallenge {
  if (!exactObject(input, challengeKeys) || input.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge
    || typeof input.id !== "string" || !ID.test(input.id) || typeof input.nonce !== "string" || !HASH.test(input.nonce)
    || !validBinding(input.binding) || typeof input.bindingSha256 !== "string" || !HASH.test(input.bindingSha256)
    || typeof input.issuerRuntimeSha256 !== "string" || !HASH.test(input.issuerRuntimeSha256)) invalidInput();
  const issued = canonicalTime(input.issuedAt);
  const expires = canonicalTime(input.expiresAt);
  if (issued === undefined || expires === undefined || expires <= issued || expires - issued > MAX_TTL_MS) invalidInput();
  if (!constantHashEqual(hashObject(input.binding), input.bindingSha256)) mismatch();
  return input as WorkerProofChallenge;
}

function assertChallengeTime(challenge: WorkerProofChallenge, nowMs: number) {
  if (Date.parse(challenge.issuedAt) > nowMs) mismatch();
  if (Date.parse(challenge.expiresAt) <= nowMs) fail(410, "worker_proof_expired");
}

function commitment(record: Pick<WorkerProofStoredRecord, "id" | "nonceSha256" | "binding" | "bindingSha256" | "issuerRuntimeSha256" | "issuedAt" | "expiresAt">) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge,
    id: record.id, nonceSha256: record.nonceSha256, binding: record.binding, bindingSha256: record.bindingSha256,
    issuerRuntimeSha256: record.issuerRuntimeSha256, issuedAt: record.issuedAt, expiresAt: record.expiresAt
  };
}

function challengeBindingMac(context: WorkerProofContext, record: WorkerProofStoredRecord) {
  return mac(context, "challenge-binding", canonical({ challenge: commitment(record), credentials: secrets(context).credentialConfiguration }));
}

export function createWorkerProofChallenge(context: WorkerProofContext, options: { now?: Date; ttlMs?: number } = {}): WorkerProofChallenge {
  secrets(context);
  const issued = nowMilliseconds(options.now);
  const ttlMs = options.ttlMs ?? MAX_TTL_MS;
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) invalidInput();
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge,
    id: `worker_proof_${randomBytes(12).toString("hex")}`, nonce: randomBytes(32).toString("hex"),
    binding: { ...context.binding }, bindingSha256: context.bindingSha256, issuerRuntimeSha256: context.runtimeSha256,
    issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + ttlMs).toISOString()
  };
}

export function workerProofStoredChallenge(context: WorkerProofContext, input: unknown): WorkerProofStoredRecord {
  const challenge = parseChallenge(input);
  if (!constantHashEqual(challenge.bindingSha256, context.bindingSha256) || challenge.issuerRuntimeSha256 !== context.runtimeSha256) mismatch();
  const record: WorkerProofStoredRecord = {
    id: challenge.id, nonceSha256: sha256(challenge.nonce), binding: { ...challenge.binding }, bindingSha256: challenge.bindingSha256,
    bindingMac: "", issuerRuntimeSha256: challenge.issuerRuntimeSha256, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt
  };
  record.bindingMac = challengeBindingMac(context, record);
  return record;
}

/** Call only after the existing queue receiver authenticates the signed dispatch envelope. */
export function createWorkerProofCallback(context: WorkerProofContext, input: unknown, options: { now?: Date } = {}): WorkerProofCallback {
  secrets(context);
  const challenge = parseChallenge(input);
  assertChallengeTime(challenge, nowMilliseconds(options.now));
  // A worker may run in another deployment of this exact build. All other public configuration must match.
  const expectedWorkerBinding = { ...context.binding, deploymentSha256: challenge.binding.deploymentSha256 };
  if (canonical(expectedWorkerBinding) !== canonical(challenge.binding) || context.runtimeSha256 === challenge.issuerRuntimeSha256) mismatch();
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofCallback,
    challenge, workerRuntimeSha256: context.runtimeSha256,
    workerDeploymentSha256: context.binding.deploymentSha256, workerBuildId: context.binding.buildId
  };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,12}$/.test(value) && Number.isSafeInteger(Number(value));
}

export function signWorkerProofCallback(context: WorkerProofContext, rawBody: string, timestamp: string): string {
  if (typeof rawBody !== "string" || !validTimestamp(timestamp)) invalidInput();
  return mac(context, "callback", `${timestamp}.${rawBody}`);
}

/** Authenticate exact raw UTF-8 body bytes before JSON.parse. Route owns body-size/content-type/redirect checks. */
export function authenticateWorkerProofCallback(
  context: WorkerProofContext, rawBody: string, timestamp: string | undefined | null, signature: string | undefined | null,
  options: { now?: Date } = {}
): void {
  secrets(context);
  if (!validTimestamp(timestamp) || typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(signature)
    || typeof rawBody !== "string" || Math.abs(nowMilliseconds(options.now) - Number(timestamp) * 1000) > CALLBACK_SKEW_MS) authenticationFailed();
  if (!constantHashEqual(signature.slice(7), signWorkerProofCallback(context, rawBody, timestamp))) authenticationFailed();
}

function storedChallengeValid(context: WorkerProofContext, record: WorkerProofStoredRecord): boolean {
  const issued = canonicalTime(record.issuedAt);
  const expires = canonicalTime(record.expiresAt);
  return typeof record.id === "string" && ID.test(record.id) && HASH.test(record.nonceSha256)
    && HASH.test(record.issuerRuntimeSha256) && validBinding(record.binding)
    && issued !== undefined && expires !== undefined && expires > issued && expires - issued <= MAX_TTL_MS
    && constantHashEqual(record.bindingSha256, context.bindingSha256)
    && constantHashEqual(record.bindingSha256, hashObject(record.binding))
    && constantHashEqual(record.bindingMac, challengeBindingMac(context, record));
}

function receiptMac(context: WorkerProofContext, record: WorkerProofStoredRecord, receipt: WorkerProofReceipt) {
  return mac(context, "receipt", canonical({ challenge: commitment(record), receipt }));
}

/** Raw callback authentication is a mandatory route precondition; the store atomically consumes the returned receipt. */
export function acceptWorkerProofCallback(
  context: WorkerProofContext, input: unknown, stored: WorkerProofStoredRecord, options: { now?: Date } = {}
): { receipt: WorkerProofReceipt; receiptMac: string } {
  secrets(context);
  if (!exactObject(input, callbackKeys) || input.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofCallback
    || typeof input.workerRuntimeSha256 !== "string" || !HASH.test(input.workerRuntimeSha256)
    || typeof input.workerDeploymentSha256 !== "string" || !HASH.test(input.workerDeploymentSha256)
    || typeof input.workerBuildId !== "string" || !BUILD.test(input.workerBuildId)) invalidInput();
  const challenge = parseChallenge(input.challenge);
  const nowMs = nowMilliseconds(options.now);
  assertChallengeTime(challenge, nowMs);
  if (!stored || !storedChallengeValid(context, stored)) mismatch();
  if (stored.callbackAcceptedAt !== undefined || stored.receipt !== undefined || stored.receiptMac !== undefined) fail(409, "worker_proof_already_consumed");
  if (challenge.id !== stored.id || canonical(challenge.binding) !== canonical(stored.binding)
    || challenge.bindingSha256 !== stored.bindingSha256 || challenge.issuerRuntimeSha256 !== stored.issuerRuntimeSha256
    || challenge.issuedAt !== stored.issuedAt || challenge.expiresAt !== stored.expiresAt
    || input.workerBuildId !== context.binding.buildId || input.workerRuntimeSha256 === stored.issuerRuntimeSha256) mismatch();
  if (!constantHashEqual(sha256(challenge.nonce), stored.nonceSha256)) authenticationFailed();
  const receipt: WorkerProofReceipt = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofReceipt,
    generatedAt: new Date(nowMs).toISOString(), proofIdSha256: sha256(stored.id), challengeSha256: hashObject(commitment(stored)),
    binding: { ...challenge.binding }, issuerRuntimeSha256: stored.issuerRuntimeSha256, workerRuntimeSha256: input.workerRuntimeSha256,
    workerDeploymentSha256: input.workerDeploymentSha256, distinctRuntimeObserved: true,
    separateDeploymentObserved: input.workerDeploymentSha256 !== stored.binding.deploymentSha256,
    transport: `${context.binding.queueMode}-http`, brokerDurabilityObserved: false, syntheticUserDataIncluded: false
  };
  return { receipt, receiptMac: receiptMac(context, stored, receipt) };
}

/**
 * Verifies authenticated immutable challenge/receipt data; never persists or refreshes acceptance times.
 * SQL-assigned dispatch/callback metadata remains trusted adapter state, constrained here for coherence.
 * An in-window edit of those adapter-owned columns is not independently cryptographically attested.
 */
export function verifyStoredWorkerProof(
  context: WorkerProofContext, record: WorkerProofStoredRecord | undefined,
  options: { now?: Date; productionEvidenceMaxAgeHours?: number } = {}
): { receipt: WorkerProofReceipt; receiptSha256: string; verifiedAt: string } | undefined {
  try {
    const privateContext = secrets(context);
    if (!record || !storedChallengeValid(context, record) || !exactObject(record.receipt, receiptKeys)) return undefined;
    const receipt = record.receipt;
    if (receipt.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofReceipt || !validBinding(receipt.binding)
      || canonical(receipt.binding) !== canonical(record.binding)
      || receipt.proofIdSha256 !== sha256(record.id) || receipt.challengeSha256 !== hashObject(commitment(record))
      || receipt.issuerRuntimeSha256 !== record.issuerRuntimeSha256 || typeof receipt.workerRuntimeSha256 !== "string" || !HASH.test(receipt.workerRuntimeSha256)
      || receipt.workerRuntimeSha256 === record.issuerRuntimeSha256 || typeof receipt.workerDeploymentSha256 !== "string" || !HASH.test(receipt.workerDeploymentSha256)
      || receipt.distinctRuntimeObserved !== true || receipt.separateDeploymentObserved !== (receipt.workerDeploymentSha256 !== record.binding.deploymentSha256)
      || receipt.transport !== `${context.binding.queueMode}-http` || receipt.brokerDurabilityObserved !== false || receipt.syntheticUserDataIncluded !== false
      || !constantHashEqual(record.receiptMac, receiptMac(context, record, receipt as WorkerProofReceipt))) return undefined;
    const nowMs = nowMilliseconds(options.now);
    const generated = canonicalTime(receipt.generatedAt);
    const dispatch = canonicalTime(record.dispatchAcceptedAt);
    const callback = canonicalTime(record.callbackAcceptedAt);
    const issued = Date.parse(record.issuedAt);
    const expires = Date.parse(record.expiresAt);
    const maxAge = Math.min(24, privateContext.maxAgeHours, options.productionEvidenceMaxAgeHours ?? 24);
    if (generated === undefined || dispatch === undefined || callback === undefined
      || !Number.isInteger(record.dispatchHttpStatus) || record.dispatchHttpStatus! < 200 || record.dispatchHttpStatus! > 299
      || !Number.isFinite(maxAge) || maxAge <= 0 || generated < issued || generated >= expires || generated > nowMs
      || nowMs - generated > maxAge * 3_600_000 || Math.abs(callback - generated) > CLOCK_SKEW_MS
      || [dispatch, callback].some((time) => time < issued - CLOCK_SKEW_MS || time > expires + CLOCK_SKEW_MS || time > nowMs + CLOCK_SKEW_MS)) return undefined;
    // A snapshot prevents caller mutation from rewriting the verified object after this check.
    const safeReceipt = JSON.parse(canonical(receipt)) as WorkerProofReceipt;
    return { receipt: safeReceipt, receiptSha256: hashObject(safeReceipt), verifiedAt: safeReceipt.generatedAt };
  } catch {
    return undefined;
  }
}
