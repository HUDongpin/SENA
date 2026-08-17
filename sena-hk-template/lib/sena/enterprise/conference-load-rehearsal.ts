import { createHash } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaProductionPostureFrom } from "./auth-config";
import {
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";

export type SenaEnterpriseConferenceLoadRehearsalCheckId =
  "target-users" |
  "target-duration" |
  "production-origin" |
  "minimum-requests" |
  "error-rate" |
  "p95-latency";

export type SenaEnterpriseConferenceLoadRehearsalCheck = {
  id: SenaEnterpriseConferenceLoadRehearsalCheckId;
  label: string;
  status: "pass" | "fail";
  actual: number;
  threshold: number;
  comparator: ">=" | "<=";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseConferenceLoadRehearsalRoute = {
  routeId: string;
  total: number;
  ramp: number;
  sustain: number;
  success: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  statusClasses: Record<string, number>;
};

export type SenaEnterpriseConferenceLoadRehearsal = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal;
  generatedAt: string;
  status: "pass" | "fail";
  target: {
    conferenceTarget: "50-users-30-minutes";
    productionTargetUsers: 50;
    productionTargetDurationSeconds: 1800;
    productionTargetSatisfied: boolean;
    productionOriginSatisfied: boolean;
    configuredUsers: number;
    configuredConcurrency: number;
    configuredRampSeconds: number;
    configuredDurationSeconds: number;
    configuredSustainDurationSeconds: number;
    configuredThinkTimeMs: number;
    requestTimeoutMs: number;
    requireProductionTarget: boolean;
    loadProfile: "instant" | "linear-ramp";
  };
  slo: {
    p95Ms: number;
    errorRatePercent: number;
    minimumRequests: number;
  };
  origin: {
    configured: boolean;
    originHash?: string;
    originValueExcluded: true;
    pathValuesExcluded: true;
  };
  summary: {
    durationMs: number;
    totalRequests: number;
    success: number;
    errors: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    errorRatePercent: number;
    throughputPerSecond: number;
    rampRequests: number;
    sustainRequests: number;
    sustainP95Ms: number;
    sustainErrorRatePercent: number;
  };
  routes: SenaEnterpriseConferenceLoadRehearsalRoute[];
  checks: SenaEnterpriseConferenceLoadRehearsalCheck[];
  evidence: string[];
  nextActions: string[];
  redaction: {
    originValueExcluded: true;
    pathValuesExcluded: true;
    queryValuesExcluded: true;
    responseBodiesExcluded: true;
    secretValuesExcluded: true;
  };
};

type RequestSample = {
  routeId: string;
  phase: "ramp" | "sustain";
  durationMs: number;
  ok: boolean;
  statusClass: string;
};

type LoadConfig = {
  origin: string;
  paths: string[];
  configuredUsers: number;
  configuredConcurrency: number;
  configuredRampSeconds: number;
  configuredDurationSeconds: number;
  configuredThinkTimeMs: number;
  requestTimeoutMs: number;
  maxRequests: number;
  requireProductionTarget: boolean;
  minUsers: number;
  minDurationSeconds: number;
  minRequests: number;
  maxP95Ms: number;
  maxErrorRatePercent: number;
};

const productionTargetUsers = 50 as const;
const productionTargetDurationSeconds = 1800 as const;

function positiveIntegerEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
  fallback: number,
  max: number
) {
  const parsed = Number(envValueFrom(env, key));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function nonNegativeIntegerEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
  fallback: number,
  max: number
) {
  const parsed = Number(envValueFrom(env, key));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function decimalEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
  fallback: number,
  max: number
) {
  const parsed = Number(envValueFrom(env, key));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, parsed);
}

function booleanEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = envValueFrom(env, key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envValueFrom(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

function routeIdFromPath(pathValue: string) {
  try {
    const parsed = new URL(pathValue, "https://sena.invalid");
    return parsed.pathname.replace(/[^a-zA-Z0-9_./:-]/g, "_").slice(0, 120) || "/";
  } catch {
    return "/invalid-path";
  }
}

function resolveOrigin(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return envValueFrom(env, "SENA_LOAD_TARGET_URL") ||
    envValueFrom(env, "SENA_APP_URL") ||
    envValueFrom(env, "NEXT_PUBLIC_SENA_APP_URL") ||
    "http://127.0.0.1:3000";
}

function resolvePaths(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const configured = envValueFrom(env, "SENA_LOAD_PATHS");
  const paths = configured
    ? configured.split(",").map((entry) => entry.trim()).filter(Boolean)
    : ["/workspace/sena", "/api/sena/docs?format=openapi"];
  return paths.length ? paths : ["/workspace/sena"];
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function productionOriginSatisfied(origin: string) {
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return false;
    if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return false;
    if (hostname.startsWith("127.") || hostname === "0.0.0.0") return false;
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function resolveConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): LoadConfig {
  const requireProductionTarget = booleanEnv(env, "SENA_LOAD_REQUIRE_PRODUCTION_TARGET") ||
    booleanEnv(env, "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH") ||
    booleanEnv(env, "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED") ||
    booleanEnv(env, "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED");
  const configuredUsers = positiveIntegerEnv(env, "SENA_LOAD_TARGET_USERS", productionTargetUsers, 1000);
  const configuredConcurrency = positiveIntegerEnv(env, "SENA_LOAD_CONCURRENCY", Math.min(configuredUsers, 50), 1000);
  const configuredDurationSeconds = positiveIntegerEnv(env, "SENA_LOAD_DURATION_SECONDS", 30, 24 * 60 * 60);
  const configuredRampSeconds = Math.min(
    nonNegativeIntegerEnv(env, "SENA_LOAD_RAMP_SECONDS", 0, 60 * 60),
    configuredDurationSeconds
  );
  return {
    origin: normalizeOrigin(resolveOrigin(env)),
    paths: resolvePaths(env),
    configuredUsers,
    configuredConcurrency,
    configuredRampSeconds,
    configuredDurationSeconds,
    configuredThinkTimeMs: nonNegativeIntegerEnv(env, "SENA_LOAD_THINK_TIME_MS", 1000, 60_000),
    requestTimeoutMs: positiveIntegerEnv(env, "SENA_LOAD_REQUEST_TIMEOUT_MS", 5000, 120_000),
    maxRequests: positiveIntegerEnv(env, "SENA_LOAD_MAX_REQUESTS", 200_000, 2_000_000),
    requireProductionTarget,
    minUsers: positiveIntegerEnv(
      env,
      "SENA_LOAD_MIN_USERS",
      requireProductionTarget ? productionTargetUsers : 1,
      1000
    ),
    minDurationSeconds: positiveIntegerEnv(
      env,
      "SENA_LOAD_MIN_DURATION_SECONDS",
      requireProductionTarget ? productionTargetDurationSeconds : 1,
      24 * 60 * 60
    ),
    minRequests: positiveIntegerEnv(env, "SENA_LOAD_MIN_REQUESTS", 1, 2_000_000),
    maxP95Ms: positiveIntegerEnv(env, "SENA_LOAD_MAX_P95_MS", 2000, 120_000),
    maxErrorRatePercent: decimalEnv(env, "SENA_LOAD_MAX_ERROR_RATE_PERCENT", 1, 100)
  };
}

function statusClass(status: number) {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "unknown";
}

function stringProperty(value: unknown, key: "code" | "name"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function causeOf(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>).cause;
}

function errorCodeOf(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  return stringProperty(value, "code") ?? errorCodeOf(causeOf(value), depth + 1);
}

function networkErrorClass(error: unknown) {
  const name = stringProperty(error, "name")?.toLowerCase();
  const code = errorCodeOf(error)?.toUpperCase();
  if (name?.includes("abort") || code === "ABORT_ERR" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "network-timeout";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "network-dns-error";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE") return "network-connection-error";
  if (code?.includes("CERT") || code?.includes("TLS") || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return "network-tls-error";
  }
  return "network-error";
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedDuration(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

async function requestOnce(input: {
  config: LoadConfig;
  pathValue: string;
  phase: RequestSample["phase"];
  fetchImpl: typeof fetch;
}): Promise<RequestSample> {
  const routeId = routeIdFromPath(input.pathValue);
  const url = new URL(input.pathValue, input.config.origin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.requestTimeoutMs);
  const startedAt = Date.now();
  try {
    const response = await input.fetchImpl(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "user-agent": "sena-conference-load-rehearsal/1.0"
      }
    });
    await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    return {
      routeId,
      phase: input.phase,
      durationMs: boundedDuration(Date.now() - startedAt),
      ok: response.ok,
      statusClass: statusClass(response.status)
    };
  } catch (error) {
    return {
      routeId,
      phase: input.phase,
      durationMs: boundedDuration(Date.now() - startedAt),
      ok: false,
      statusClass: networkErrorClass(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function check(input: {
  id: SenaEnterpriseConferenceLoadRehearsalCheckId;
  label: string;
  actual: number;
  threshold: number;
  comparator: ">=" | "<=";
  evidence: string[];
  nextAction: string;
}): SenaEnterpriseConferenceLoadRehearsalCheck {
  const status = input.comparator === ">="
    ? input.actual >= input.threshold
    : input.actual <= input.threshold;
  return {
    id: input.id,
    label: input.label,
    status: status ? "pass" : "fail",
    actual: input.actual,
    threshold: input.threshold,
    comparator: input.comparator,
    evidence: input.evidence,
    nextAction: status ? "Keep this load rehearsal check attached to the release evidence." : input.nextAction
  };
}

function summarizeRoutes(samples: RequestSample[]): SenaEnterpriseConferenceLoadRehearsalRoute[] {
  const byRoute = new Map<string, RequestSample[]>();
  for (const sample of samples) {
    byRoute.set(sample.routeId, [...(byRoute.get(sample.routeId) ?? []), sample]);
  }
  return [...byRoute.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([routeId, routeSamples]) => {
      const durations = routeSamples.map((sample) => sample.durationMs);
      const statusClasses = routeSamples.reduce<Record<string, number>>((acc, sample) => {
        acc[sample.statusClass] = (acc[sample.statusClass] ?? 0) + 1;
        return acc;
      }, {});
      return {
        routeId,
        total: routeSamples.length,
        ramp: routeSamples.filter((sample) => sample.phase === "ramp").length,
        sustain: routeSamples.filter((sample) => sample.phase === "sustain").length,
        success: routeSamples.filter((sample) => sample.ok).length,
        errors: routeSamples.filter((sample) => !sample.ok).length,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        maxMs: durations.length ? Math.max(...durations) : 0,
        statusClasses
      };
    });
}

export async function runEnterpriseConferenceLoadRehearsal(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
} = {}): Promise<SenaEnterpriseConferenceLoadRehearsal> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const config = resolveConfig(env);
  const samples: RequestSample[] = [];
  const startedAt = Date.now();
  const sustainStartedAt = startedAt + config.configuredRampSeconds * 1000;
  const deadline = sustainStartedAt + config.configuredDurationSeconds * 1000;
  let nextPathIndex = 0;
  let issuedRequests = 0;

  async function worker(workerIndex: number) {
    const rampDelayMs = config.configuredConcurrency <= 1 || config.configuredRampSeconds === 0
      ? 0
      : Math.round((config.configuredRampSeconds * 1000 * workerIndex) / Math.max(1, config.configuredConcurrency - 1));
    await sleep(rampDelayMs);
    while (Date.now() < deadline) {
      if (issuedRequests >= config.maxRequests) break;
      issuedRequests += 1;
      const pathValue = config.paths[nextPathIndex % config.paths.length];
      nextPathIndex += 1;
      const phase = Date.now() < sustainStartedAt ? "ramp" : "sustain";
      samples.push(await requestOnce({ config, pathValue, phase, fetchImpl }));
      await sleep(config.configuredThinkTimeMs);
    }
  }

  await Promise.all(Array.from({ length: config.configuredConcurrency }, (_, index) => worker(index)));

  const durationMs = Math.max(1, Date.now() - startedAt);
  const durations = samples.map((sample) => sample.durationMs);
  const sustainSamples = samples.filter((sample) => sample.phase === "sustain");
  const sustainDurations = sustainSamples.map((sample) => sample.durationMs);
  const errors = samples.filter((sample) => !sample.ok).length;
  const sustainErrors = sustainSamples.filter((sample) => !sample.ok).length;
  const p95Ms = percentile(durations, 95);
  const errorRatePercent = samples.length ? Number(((errors / samples.length) * 100).toFixed(2)) : 100;
  const sustainErrorRatePercent = sustainSamples.length
    ? Number(((sustainErrors / sustainSamples.length) * 100).toFixed(2))
    : 0;
  const productionOriginReady = productionOriginSatisfied(config.origin);
  const productionTargetSatisfied = config.configuredUsers >= productionTargetUsers &&
    config.configuredDurationSeconds >= productionTargetDurationSeconds &&
    productionOriginReady;
  const checks = [
    check({
      id: "target-users",
      label: "Configured load users",
      actual: config.configuredUsers,
      threshold: config.minUsers,
      comparator: ">=",
      evidence: [
        `configuredUsers=${config.configuredUsers}`,
        `minimumUsers=${config.minUsers}`,
        `productionTargetUsers=${productionTargetUsers}`
      ],
      nextAction: "Set SENA_LOAD_TARGET_USERS to at least 50 for conference-scale evidence."
    }),
    check({
      id: "target-duration",
      label: "Configured load duration",
      actual: config.configuredDurationSeconds,
      threshold: config.minDurationSeconds,
      comparator: ">=",
      evidence: [
        `configuredDurationSeconds=${config.configuredDurationSeconds}`,
        `minimumDurationSeconds=${config.minDurationSeconds}`,
        `productionTargetDurationSeconds=${productionTargetDurationSeconds}`
      ],
      nextAction: "Run a 30-minute rehearsal with SENA_LOAD_DURATION_SECONDS=1800 before conference-scale handoff."
    }),
    check({
      id: "production-origin",
      label: "Production HTTPS target origin",
      actual: productionOriginReady ? 1 : 0,
      threshold: config.requireProductionTarget ? 1 : 0,
      comparator: ">=",
      evidence: [
        `requireProductionTarget=${config.requireProductionTarget}`,
        `productionOriginSatisfied=${productionOriginReady}`,
        "originValue=excluded"
      ],
      nextAction: "Set SENA_LOAD_TARGET_URL to the deployed HTTPS production URL before binding conference-scale evidence."
    }),
    check({
      id: "minimum-requests",
      label: "Minimum completed requests",
      actual: samples.length,
      threshold: config.minRequests,
      comparator: ">=",
      evidence: [
        `totalRequests=${samples.length}`,
        `minimumRequests=${config.minRequests}`,
        `maxRequests=${config.maxRequests}`
      ],
      nextAction: "Verify the target URL is reachable and increase SENA_LOAD_DURATION_SECONDS or SENA_LOAD_MAX_REQUESTS."
    }),
    check({
      id: "error-rate",
      label: "Request error rate",
      actual: errorRatePercent,
      threshold: config.maxErrorRatePercent,
      comparator: "<=",
      evidence: [
        `errorRatePercent=${errorRatePercent}`,
        `maxErrorRatePercent=${config.maxErrorRatePercent}`,
        `errors=${errors}`
      ],
      nextAction: "Investigate failing routes, server saturation, queue configuration, or CDN/origin health before handoff."
    }),
    check({
      id: "p95-latency",
      label: "Request p95 latency",
      actual: p95Ms,
      threshold: config.maxP95Ms,
      comparator: "<=",
      evidence: [
        `p95Ms=${p95Ms}`,
        `maxP95Ms=${config.maxP95Ms}`,
        `samples=${samples.length}`
      ],
      nextAction: "Tune CDN/origin capacity, reduce route work, or route heavier requests through the server job queue."
    })
  ];
  const failed = checks.filter((entry) => entry.status === "fail").length;
  const originHost = new URL(config.origin).host;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal,
    generatedAt: now(),
    status: failed === 0 ? "pass" : "fail",
    target: {
      conferenceTarget: "50-users-30-minutes",
      productionTargetUsers,
      productionTargetDurationSeconds,
      productionTargetSatisfied,
      productionOriginSatisfied: productionOriginReady,
      configuredUsers: config.configuredUsers,
      configuredConcurrency: config.configuredConcurrency,
      configuredRampSeconds: config.configuredRampSeconds,
      configuredDurationSeconds: config.configuredDurationSeconds,
      configuredSustainDurationSeconds: config.configuredDurationSeconds,
      configuredThinkTimeMs: config.configuredThinkTimeMs,
      requestTimeoutMs: config.requestTimeoutMs,
      requireProductionTarget: config.requireProductionTarget,
      loadProfile: config.configuredRampSeconds > 0 ? "linear-ramp" : "instant"
    },
    slo: {
      p95Ms: config.maxP95Ms,
      errorRatePercent: config.maxErrorRatePercent,
      minimumRequests: config.minRequests
    },
    origin: {
      configured: Boolean(config.origin),
      originHash: sha256Text(originHost),
      originValueExcluded: true,
      pathValuesExcluded: true
    },
    summary: {
      durationMs,
      totalRequests: samples.length,
      success: samples.filter((sample) => sample.ok).length,
      errors,
      p50Ms: percentile(durations, 50),
      p95Ms,
      p99Ms: percentile(durations, 99),
      maxMs: durations.length ? Math.max(...durations) : 0,
      errorRatePercent,
      throughputPerSecond: Number((samples.length / (durationMs / 1000)).toFixed(2)),
      rampRequests: samples.filter((sample) => sample.phase === "ramp").length,
      sustainRequests: sustainSamples.length,
      sustainP95Ms: percentile(sustainDurations, 95),
      sustainErrorRatePercent
    },
    routes: summarizeRoutes(samples),
    checks,
    evidence: [
      `status=${failed === 0 ? "pass" : "fail"}`,
      `configuredUsers=${config.configuredUsers}`,
      `configuredConcurrency=${config.configuredConcurrency}`,
      `configuredRampSeconds=${config.configuredRampSeconds}`,
      `configuredDurationSeconds=${config.configuredDurationSeconds}`,
      `configuredSustainDurationSeconds=${config.configuredDurationSeconds}`,
      `productionTargetSatisfied=${productionTargetSatisfied}`,
      `productionOriginSatisfied=${productionOriginReady}`,
      `totalRequests=${samples.length}`,
      `rampRequests=${samples.filter((sample) => sample.phase === "ramp").length}`,
      `sustainRequests=${sustainSamples.length}`,
      `p95Ms=${p95Ms}`,
      `sustainP95Ms=${percentile(sustainDurations, 95)}`,
      `errorRatePercent=${errorRatePercent}`,
      `sustainErrorRatePercent=${sustainErrorRatePercent}`,
      `originHostHash=${sha256Text(originHost)}`,
      "originValue=excluded",
      "pathValues=excluded",
      "responseBodies=excluded",
      "secretValues=excluded"
    ],
    nextActions: Array.from(new Set(checks
      .filter((entry) => entry.status === "fail")
      .map((entry) => entry.nextAction))),
    redaction: {
      originValueExcluded: true,
      pathValuesExcluded: true,
      queryValuesExcluded: true,
      responseBodiesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

export function conferenceLoadRehearsalSha256(artifact: SenaEnterpriseConferenceLoadRehearsal) {
  return createHash("sha256").update(`${JSON.stringify(artifact, null, 2)}\n`).digest("hex");
}

// Production posture is answered by senaProductionPostureFrom() (auth-config.ts),
// never re-derived here: re-derivation is what let the password-reset interlock
// drift onto a NODE_ENV-only test and fail open (f5d94fa). The site-local opt-in
// flag is the only term this gate adds on top.
//
// This gate read NODE_ENV through envValueFrom, which trims, so " production"
// counted as production here and nowhere else. That trim was the better
// semantics and it is now the canonical one, so this site keeps its behaviour
// exactly and the rest of SENA moved to meet it — see the note on
// senaProductionPostureReasonsFrom.
export function conferenceLoadRehearsalProductionEvidenceRequired(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  return booleanEnv(env, "SENA_CONFERENCE_LOAD_REHEARSAL_REQUIRED") ||
    senaProductionPostureFrom(env);
}

export function conferenceLoadRehearsalProductionEvidenceReadiness(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const artifactHash = envValueFrom(env, "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256");
  const verifiedAt = envValueFrom(env, "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT");
  const users = Number(envValueFrom(env, "SENA_CONFERENCE_LOAD_REHEARSAL_USERS"));
  const durationSeconds = Number(envValueFrom(env, "SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS"));
  const p95Ms = Number(envValueFrom(env, "SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS"));
  const errorRatePercent = Number(envValueFrom(env, "SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT"));
  const maxP95Ms = positiveIntegerEnv(env, "SENA_LOAD_MAX_P95_MS", 2000, 120_000);
  const maxErrorRatePercent = decimalEnv(env, "SENA_LOAD_MAX_ERROR_RATE_PERCENT", 1, 100);
  const artifactHashConfigured = Boolean(artifactHash && /^[a-f0-9]{64}$/i.test(artifactHash));
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt, env);
  const usersConfigured = Number.isFinite(users) && users >= productionTargetUsers;
  const durationConfigured = Number.isFinite(durationSeconds) && durationSeconds >= productionTargetDurationSeconds;
  const p95Configured = Number.isFinite(p95Ms) && p95Ms >= 0;
  const errorRateConfigured = Number.isFinite(errorRatePercent) && errorRatePercent >= 0 && errorRatePercent <= 100;
  const p95WithinSlo = p95Configured && p95Ms <= maxP95Ms;
  const errorRateWithinSlo = errorRateConfigured && errorRatePercent <= maxErrorRatePercent;
  const confirmed = booleanEnv(env, "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    usersConfigured &&
    durationConfigured &&
    p95Configured &&
    errorRateConfigured &&
    p95WithinSlo &&
    errorRateWithinSlo;
  const required = conferenceLoadRehearsalProductionEvidenceRequired(env);

  return {
    required,
    confirmed,
    artifactHash: artifactHashConfigured ? artifactHash?.toLowerCase() : artifactHash,
    verifiedAt: verifiedAtConfigured ? verifiedAt : undefined,
    artifactHashConfigured,
    verifiedAtConfigured,
    users,
    durationSeconds,
    p95Ms,
    errorRatePercent,
    usersConfigured,
    durationConfigured,
    p95Configured,
    errorRateConfigured,
    p95WithinSlo,
    errorRateWithinSlo,
    maxP95Ms,
    maxErrorRatePercent,
    evidence: [
      `conferenceLoadRequired=${required}`,
      `conferenceLoadConfirmed=${confirmed}`,
      `conferenceLoadExplicitlyRequired=${booleanEnv(env, "SENA_CONFERENCE_LOAD_REHEARSAL_REQUIRED")}`,
      `conferenceLoadProductionRuntime=${envValueFrom(env, "NODE_ENV") === "production"}`,
      `conferenceLoadProductionPerformancePathRequired=${booleanEnv(env, "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `conferenceLoadProductionEvidenceManifestRequired=${booleanEnv(env, "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `conferenceLoadSaasOperatingModelApproved=${booleanEnv(env, "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `conferenceLoadArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `conferenceLoadVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt, env)}`,
      `conferenceLoadUsers=${usersConfigured ? "valid" : "missing-or-insufficient"}`,
      `conferenceLoadDurationSeconds=${durationConfigured ? "valid" : "missing-or-insufficient"}`,
      `conferenceLoadP95Ms=${p95Configured ? "present" : "missing-or-invalid"}`,
      `conferenceLoadP95WithinSlo=${p95WithinSlo}`,
      `conferenceLoadMaxP95Ms=${maxP95Ms}`,
      `conferenceLoadErrorRatePercent=${errorRateConfigured ? "present" : "missing-or-invalid"}`,
      `conferenceLoadErrorRateWithinSlo=${errorRateWithinSlo}`,
      `conferenceLoadMaxErrorRatePercent=${maxErrorRatePercent}`,
      "conferenceLoadScript=npm run sena:conference:load-check",
      "conferenceTarget=50-users-30-minutes"
    ]
  };
}
