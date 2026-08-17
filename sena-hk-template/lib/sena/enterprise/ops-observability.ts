import { createHash, createHmac, randomUUID } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import { senaProductionPosture } from "./auth-config";
import {
  envValue,
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";
import {
  createEnterprisePostgresObservedRequestAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import {
  webhookEndpointHash,
  webhookErrorHash,
  webhookTimeoutMs
} from "./webhook-delivery";

export type SenaEnterpriseObservedRequest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObservedRequest;
  observedAt: string;
  requestIdHash: string;
  routeId: string;
  method: string;
  statusCode: number;
  statusClass: "2xx" | "3xx" | "4xx" | "5xx" | "unknown";
  durationMs: number;
  slow: boolean;
  /**
   * The response reports a state rather than a failure, as declared by the
   * handler that built it. Kept alongside `statusClass` rather than replacing it:
   * the sample still records that a 5xx went out on the wire, it just is not
   * counted against the deployment's error budget.
   *
   * Optional because samples read back out of the Postgres observed-request
   * table are rebuilt from indexed columns that predate this field
   * (enterprise-postgres.ts normalizeStoredObservedRequest). The classification
   * itself still round-trips: `error` is a stored column and is written already
   * resolved, so a window served from Postgres counts the same errors either
   * way — only the marker explaining why is absent there.
   */
  informational?: boolean;
  error: boolean;
  errorCodeHash?: string;
  redaction: {
    requestIdValueExcluded: true;
    pathValueExcluded: true;
    queryValueExcluded: true;
    payloadValueExcluded: true;
    secretValuesExcluded: true;
  };
};

export type SenaEnterpriseObservabilityRouteSummary = {
  routeId: string;
  method: string;
  total: number;
  errors: number;
  slow: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type SenaEnterpriseObservabilitySnapshot = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObservabilitySli;
  generatedAt: string;
  status: "pass" | "review";
  provider: {
    name: string;
    externalSinkConfigured: boolean;
    externalSinkOriginAllowed: boolean;
    dashboardConfigured: boolean;
    runbookConfigured: boolean;
    ownerConfigured: boolean;
    endpointHash?: string;
    dashboardUrlHash?: string;
    runbookUrlHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    urlValuesExcluded: true;
    secretValuesExcluded: true;
  };
  slo: {
    p95Ms: number;
    errorRatePercent: number;
    slowRequestMs: number;
  };
  summary: {
    sampleWindow: "current-process-ring-buffer" | "postgres-table-window";
    retainedSamples: number;
    maxSamples: number;
    total: number;
    errors: number;
    /**
     * Non-2xx responses a handler declared informational — a state report, not a
     * failure. Reported so the window stays readable: these are excluded from
     * `errors` and `serverErrors`, and this is where they went.
     */
    informational: number;
    clientErrors: number;
    serverErrors: number;
    slow: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    errorRatePercent: number;
    sloBreached: boolean;
  };
  routes: SenaEnterpriseObservabilityRouteSummary[];
  recentSlowRequests: SenaEnterpriseObservedRequest[];
  evidence: string[];
};

export type SenaEnterpriseObservabilityDelivery = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObservabilityDelivery;
  generatedAt: string;
  status: "not-configured" | "delivered" | "failed";
  provider: {
    name: string;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    urlValueExcluded: true;
    secretValuesExcluded: true;
  };
  delivery: {
    attempted: boolean;
    attemptedAt?: string;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
};

export type SenaEnterpriseObservabilityContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract;
  generatedAt: string;
  status: "pass" | "review";
  summary: {
    signalCount: number;
    sloCount: number;
    alertCategoryCount: number;
    durableSampleStoreRequired: true;
    signedExporterRequired: true;
    dashboardRunbookOwnerRequired: true;
    liveProbeRequiredBeforeProduction: true;
  };
  provider: {
    name: string;
    endpointHash?: string;
    dashboardUrlHash?: string;
    runbookUrlHash?: string;
    externalSinkConfigured: boolean;
    externalSinkOriginAllowed: boolean;
    dashboardConfigured: boolean;
    runbookConfigured: boolean;
    ownerConfigured: boolean;
    secretConfigured: boolean;
    urlValuesExcluded: true;
    secretValuesExcluded: true;
  };
  signals: Array<{
    id: "logs" | "metrics" | "traces" | "alerts";
    required: true;
    correlationKey: "requestIdHash";
    valuesExcluded: true;
  }>;
  sampleStore: {
    requiredForProduction: true;
    acceptedStore: "postgres-table";
    table: "sena_enterprise_observed_requests";
    localRingBufferFallback: "development-only";
    indexedBy: string[];
  };
  slo: {
    p95Ms: number;
    errorRatePercent: number;
    slowRequestMs: number;
    alertOnSymptoms: true;
  };
  liveProbe: {
    requiredBeforeProduction: true;
    command: "npm run sena:observability:verify";
    signedDeliveryRequired: true;
    payloadSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseObservedRequest;
  };
  alerting: {
    requiredCategories: Array<"availability" | "error-rate" | "latency" | "downstream" | "saturation">;
    runbookRequired: true;
    ownerRequired: true;
  };
  evidence: string[];
  redaction: {
    exporterUrlValuesExcluded: true;
    dashboardUrlValuesExcluded: true;
    runbookUrlValuesExcluded: true;
    requestIdValuesExcluded: true;
    secretValuesExcluded: true;
    payloadValuesExcluded: true;
  };
};

export type SenaEnterpriseObservabilityProbe = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe;
  generatedAt: string;
  status: "pass" | "review";
  provider: SenaEnterpriseObservabilitySnapshot["provider"];
  probe: {
    sampleRouteId: "sena-observability-live-probe";
    sampleStatusClass: "2xx";
    sampleRequestIdHash: string;
    deliveryStatus: SenaEnterpriseObservabilityDelivery["status"];
    attempted: boolean;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
  evidence: string[];
  redaction: {
    exporterUrlValuesExcluded: true;
    requestIdValuesExcluded: true;
    secretValuesExcluded: true;
    payloadValuesExcluded: true;
  };
  contract: SenaEnterpriseObservabilityContract;
};

export type SenaEnterpriseObservabilityProbeReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

export type SenaEnterpriseObservabilityContractReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

export type SenaEnterpriseObservabilitySampleStoreRuntime = {
  activeStore: "postgres-table" | "current-process-ring-buffer";
  requested: boolean;
  postgresConfigured: boolean;
  table: "sena_enterprise_observed_requests";
  evidence: string[];
  missing: string[];
};

const maxObservedRequests = 1000;
const observedRequests: SenaEnterpriseObservedRequest[] = [];

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function positiveIntegerEnv(key: string, fallback: number, max: number) {
  const parsed = Number(envValue(key));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function statusClass(statusCode: number): SenaEnterpriseObservedRequest["statusClass"] {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return "unknown";
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function boundedDuration(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function sanitizeRouteId(value: string) {
  return value.replace(/[^a-zA-Z0-9_./:-]/g, "_").slice(0, 120) || "unknown-route";
}

function sanitizeMethod(value: string) {
  return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 12) || "GET";
}

function requestIdHash(value: string | undefined) {
  return sha256Text(value || randomUUID()) ?? sha256Text("sena-observability-missing-request-id")!;
}

function validSha256(value: string | undefined) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function firstEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = envValue(key);
    if (value) return { key, value };
  }
  return undefined;
}

function httpUrlFromEnv(keys: string[], invalidUrlErrorCode: string) {
  const resolved = firstEnvValue(keys);
  if (!resolved) return undefined;
  try {
    const parsed = new URL(resolved.value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new SenaEnterpriseError(`${resolved.key} must be an HTTP(S) URL.`, 500, invalidUrlErrorCode);
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError(`${resolved.key} must be an HTTP(S) URL.`, 500, invalidUrlErrorCode);
  }
}

function parsedUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function hostnameIsLocalOrPrivate(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".local") ||
    /^127\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
}

function configuredApplicationOrigins() {
  return [
    envValue("SENA_APP_URL"),
    envValue("NEXT_PUBLIC_SENA_APP_URL"),
    envValue("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${envValue("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined,
    envValue("VERCEL_URL") ? `https://${envValue("VERCEL_URL")}` : undefined,
    "https://www.sena.hk"
  ]
    .map((value) => parsedUrl(value))
    .filter((value): value is URL => Boolean(value))
    .map((url) => url.host.toLowerCase());
}

export function enterpriseObservabilityExternalSinkOriginAllowed(url = enterpriseObservabilityExporterUrl()) {
  const parsed = parsedUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (hostnameIsLocalOrPrivate(parsed.hostname)) return false;
  return !configuredApplicationOrigins().includes(parsed.host.toLowerCase());
}

function postgresObservabilitySampleStoreRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresObservabilitySampleStoreConfigured() {
  return postgresObservabilitySampleStoreRequested() && resolveEnterprisePostgresConfig().configured;
}

// Production posture is answered by senaProductionPosture() (auth-config.ts),
// never re-derived here: re-derivation is what let the password-reset interlock
// drift onto a NODE_ENV-only test and fail open (f5d94fa). The site-local
// opt-in flag is the only term this gate adds on top.
export function enterpriseObservabilityProductionSampleStoreRequired() {
  return booleanEnv("SENA_OBSERVABILITY_REQUIRED") || senaProductionPosture();
}

export function enterpriseObservabilityLiveProbeRequired() {
  return booleanEnv("SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED") || senaProductionPosture();
}

function observabilityErrorHash(error: unknown) {
  const normalized = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return sha256Text(normalized) ?? "unknown";
}

export function enterpriseObservabilitySampleStoreRuntime(): SenaEnterpriseObservabilitySampleStoreRuntime {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresObservabilitySampleStoreRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "current-process-ring-buffer" as const;
  const missing = activeStore === "postgres-table"
    ? []
    : [
      requested ? null : "SENA_ENTERPRISE_STATE_STORE=postgres",
      ...postgresConfig.missingEnv
    ].filter((value): value is string => Boolean(value));
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_observed_requests",
    evidence: [
      `observabilitySampleStore=${activeStore}`,
      `observabilitySampleStoreSchema=${activeStore === "postgres-table" ? "sena_enterprise_observed_requests" : "current-process-ring-buffer"}`,
      `observabilitySampleStoreIndexed=${activeStore === "postgres-table"}`,
      `observabilitySampleStorePostgresRequested=${requested}`,
      `observabilitySampleStorePostgresConfigured=${postgresConfig.configured}`,
      `observabilitySampleStorePostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ],
    missing
  };
}

export function enterpriseObservabilityTimeoutMs() {
  return webhookTimeoutMs("SENA_OBSERVABILITY_TIMEOUT_MS", 2500, 30_000);
}

export function enterpriseObservabilityProviderName() {
  return envValue("SENA_OBSERVABILITY_PROVIDER") ??
    (firstEnvValue([
      "SENA_OBSERVABILITY_EXPORTER_URL",
      "SENA_OBSERVABILITY_WEBHOOK_URL",
      "OBSERVABILITY_WEBHOOK_URL",
      "OBSERVABILITY_EXPORTER_URL"
    ]) ? "generic-webhook" : "not-configured");
}

export function enterpriseObservabilityExporterUrl() {
  return httpUrlFromEnv([
    "SENA_OBSERVABILITY_EXPORTER_URL",
    "SENA_OBSERVABILITY_WEBHOOK_URL",
    "OBSERVABILITY_WEBHOOK_URL",
    "OBSERVABILITY_EXPORTER_URL"
  ], "invalid_observability_exporter_url");
}

export function enterpriseObservabilityExporterSecret() {
  return firstEnvValue([
    "SENA_OBSERVABILITY_EXPORTER_SECRET",
    "SENA_OBSERVABILITY_WEBHOOK_SECRET",
    "SENA_OBSERVABILITY_EXPORTER_TOKEN",
    "OBSERVABILITY_WEBHOOK_SECRET",
    "OBSERVABILITY_EXPORTER_SECRET",
    "OBSERVABILITY_EXPORTER_TOKEN"
  ])?.value;
}

export function enterpriseObservabilityDashboardUrlHash() {
  return sha256Text(firstEnvValue([
    "SENA_OBSERVABILITY_DASHBOARD_URL",
    "OBSERVABILITY_DASHBOARD_URL"
  ])?.value);
}

export function enterpriseObservabilityRunbookUrlHash() {
  return sha256Text(firstEnvValue([
    "SENA_OBSERVABILITY_RUNBOOK_URL",
    "OBSERVABILITY_RUNBOOK_URL",
    "SENA_ALERTING_RUNBOOK_URL"
  ])?.value);
}

export function enterpriseObservabilityOwner() {
  return firstEnvValue([
    "SENA_OBSERVABILITY_OWNER",
    "OBSERVABILITY_OWNER",
    "SENA_ALERTING_OWNER",
    "ALERTING_OWNER"
  ])?.value;
}

export function enterpriseObservabilitySloP95Ms() {
  return positiveIntegerEnv("SENA_OBSERVABILITY_SLO_P95_MS", 2000, 120_000);
}

export function enterpriseObservabilitySloErrorRatePercent() {
  const parsed = Number(envValue("SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT"));
  if (!Number.isFinite(parsed) || parsed < 0) return 5;
  return Math.min(100, parsed);
}

export function enterpriseObservabilitySlowRequestMs() {
  return positiveIntegerEnv("SENA_OBSERVABILITY_SLOW_REQUEST_MS", enterpriseObservabilitySloP95Ms(), 120_000);
}

export function buildEnterpriseObservabilityContract(): SenaEnterpriseObservabilityContract {
  const providerName = enterpriseObservabilityProviderName();
  const exporterUrl = enterpriseObservabilityExporterUrl();
  const endpointHash = webhookEndpointHash(exporterUrl);
  const externalSinkOriginAllowed = enterpriseObservabilityExternalSinkOriginAllowed(exporterUrl);
  const dashboardUrlHash = enterpriseObservabilityDashboardUrlHash();
  const runbookUrlHash = enterpriseObservabilityRunbookUrlHash();
  const secretConfigured = Boolean(enterpriseObservabilityExporterSecret());
  const ownerConfigured = Boolean(enterpriseObservabilityOwner());
  const signals: SenaEnterpriseObservabilityContract["signals"] = [
    {
      id: "logs",
      required: true,
      correlationKey: "requestIdHash",
      valuesExcluded: true
    },
    {
      id: "metrics",
      required: true,
      correlationKey: "requestIdHash",
      valuesExcluded: true
    },
    {
      id: "traces",
      required: true,
      correlationKey: "requestIdHash",
      valuesExcluded: true
    },
    {
      id: "alerts",
      required: true,
      correlationKey: "requestIdHash",
      valuesExcluded: true
    }
  ];
  const alertCategories: SenaEnterpriseObservabilityContract["alerting"]["requiredCategories"] = [
    "availability",
    "error-rate",
    "latency",
    "downstream",
    "saturation"
  ];
  const status = signals.length === 4 && alertCategories.length >= 5 ? "pass" : "review";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract,
    generatedAt: now(),
    status,
    summary: {
      signalCount: signals.length,
      sloCount: 3,
      alertCategoryCount: alertCategories.length,
      durableSampleStoreRequired: true,
      signedExporterRequired: true,
      dashboardRunbookOwnerRequired: true,
      liveProbeRequiredBeforeProduction: true
    },
    provider: {
      name: providerName,
      endpointHash,
      dashboardUrlHash,
      runbookUrlHash,
      externalSinkConfigured: providerName !== "not-configured" && Boolean(endpointHash) && secretConfigured && externalSinkOriginAllowed,
      externalSinkOriginAllowed,
      dashboardConfigured: Boolean(dashboardUrlHash),
      runbookConfigured: Boolean(runbookUrlHash),
      ownerConfigured,
      secretConfigured,
      urlValuesExcluded: true,
      secretValuesExcluded: true
    },
    signals,
    sampleStore: {
      requiredForProduction: true,
      acceptedStore: "postgres-table",
      table: "sena_enterprise_observed_requests",
      localRingBufferFallback: "development-only",
      indexedBy: [
        "observed_at",
        "route_id",
        "status_class",
        "error",
        "slow"
      ]
    },
    slo: {
      p95Ms: enterpriseObservabilitySloP95Ms(),
      errorRatePercent: enterpriseObservabilitySloErrorRatePercent(),
      slowRequestMs: enterpriseObservabilitySlowRequestMs(),
      alertOnSymptoms: true
    },
    liveProbe: {
      requiredBeforeProduction: true,
      command: "npm run sena:observability:verify",
      signedDeliveryRequired: true,
      payloadSchema: SENA_SCHEMA_VERSIONS.enterpriseObservedRequest
    },
    alerting: {
      requiredCategories: alertCategories,
      runbookRequired: true,
      ownerRequired: true
    },
    evidence: [
      "observabilityContractSource=ops-observability",
      `observabilityContractStatus=${status}`,
      `observabilityContractSignals=${signals.map((signal) => signal.id).join("|")}`,
      "observabilityContractCorrelation=requestIdHash",
      "observabilityContractSampleStore=postgres-table",
      "observabilityContractLocalRingBuffer=development-only",
      `observabilityContractSloP95Ms=${enterpriseObservabilitySloP95Ms()}`,
      `observabilityContractSloErrorRatePercent=${enterpriseObservabilitySloErrorRatePercent()}`,
      `observabilityContractSlowRequestMs=${enterpriseObservabilitySlowRequestMs()}`,
      `observabilityContractAlertCategories=${alertCategories.join("|")}`,
      "observabilityContractAlertOnSymptoms=true",
      "observabilityContractRunbookRequired=true",
      "observabilityContractOwnerRequired=true",
      "observabilityContractSignedExporterRequired=true",
      `observabilityContractExternalSinkOriginAllowed=${externalSinkOriginAllowed}`,
      "observabilityContractLiveProbeRequired=true",
      "observabilityExporterUrlValue=excluded",
      "observabilityDashboardUrlValue=excluded",
      "observabilityRunbookUrlValue=excluded",
      "observabilityRequestIdValue=excluded",
      "secretValues=excluded",
      "payloadValues=excluded"
    ],
    redaction: {
      exporterUrlValuesExcluded: true,
      dashboardUrlValuesExcluded: true,
      runbookUrlValuesExcluded: true,
      requestIdValuesExcluded: true,
      secretValuesExcluded: true,
      payloadValuesExcluded: true
    }
  };
}

export function enterpriseObservabilityReadiness() {
  const provider = enterpriseObservabilityProviderName();
  const exporterUrl = enterpriseObservabilityExporterUrl();
  const endpointHash = webhookEndpointHash(exporterUrl);
  const externalSinkOriginAllowed = enterpriseObservabilityExternalSinkOriginAllowed(exporterUrl);
  const secretConfigured = Boolean(enterpriseObservabilityExporterSecret());
  const dashboardUrlHash = enterpriseObservabilityDashboardUrlHash();
  const runbookUrlHash = enterpriseObservabilityRunbookUrlHash();
  const ownerConfigured = Boolean(enterpriseObservabilityOwner());
  const externalSinkConfigured = provider !== "not-configured" && Boolean(endpointHash) && secretConfigured && externalSinkOriginAllowed;
  const dashboardConfigured = Boolean(dashboardUrlHash);
  const runbookConfigured = Boolean(runbookUrlHash);
  const liveProbe = enterpriseObservabilityProbeReadiness();
  const contract = enterpriseObservabilityContractReadiness();
  const sampleStore = enterpriseObservabilitySampleStoreRuntime();
  const sampleStoreRequired = enterpriseObservabilityProductionSampleStoreRequired();
  const durableSampleStoreConfigured = sampleStore.activeStore === "postgres-table";
  const productionReady = externalSinkConfigured &&
    dashboardConfigured &&
    runbookConfigured &&
    ownerConfigured &&
    (!sampleStoreRequired || durableSampleStoreConfigured) &&
    (!contract.required || contract.confirmed) &&
    (!liveProbe.required || liveProbe.confirmed);

  return {
    productionReady,
    externalSinkConfigured,
    externalSinkOriginAllowed,
    dashboardConfigured,
    runbookConfigured,
    ownerConfigured,
    provider,
    endpointHash,
    dashboardUrlHash,
    runbookUrlHash,
    secretConfigured,
    timeoutMs: enterpriseObservabilityTimeoutMs(),
    evidence: [
      `observabilityProvider=${provider}`,
      `observabilityExternalSink=${externalSinkConfigured ? "configured" : "missing"}`,
      `observabilityExternalSinkOriginAllowed=${externalSinkOriginAllowed}`,
      `observabilityEndpointHash=${endpointHash ? "present" : "missing"}`,
      "observabilityEndpointValue=excluded",
      `observabilitySecret=${secretConfigured ? "configured" : "missing"}`,
      `observabilityDashboard=${dashboardConfigured ? "configured" : "missing"}`,
      `observabilityDashboardUrlHash=${dashboardUrlHash ? "present" : "missing"}`,
      "observabilityDashboardUrlValue=excluded",
      `observabilityRunbook=${runbookConfigured ? "configured" : "missing"}`,
      `observabilityRunbookUrlHash=${runbookUrlHash ? "present" : "missing"}`,
      "observabilityRunbookUrlValue=excluded",
      `observabilityOwner=${ownerConfigured ? "configured" : "missing"}`,
      `observabilitySloP95Ms=${enterpriseObservabilitySloP95Ms()}`,
      `observabilitySloErrorRatePercent=${enterpriseObservabilitySloErrorRatePercent()}`,
      `observabilitySlowRequestMs=${enterpriseObservabilitySlowRequestMs()}`,
      `observabilityRequired=${booleanEnv("SENA_OBSERVABILITY_REQUIRED")}`,
      `observabilityProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `observabilityProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `observabilityProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `observabilitySaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `observabilityProductionSampleStoreRequired=${sampleStoreRequired}`,
      `observabilityDurableSampleStore=${durableSampleStoreConfigured ? "configured" : "missing"}`,
      ...sampleStore.evidence,
      ...contract.evidence,
      ...liveProbe.evidence
    ]
  };
}

export function enterpriseObservabilityContractReadiness(): SenaEnterpriseObservabilityContractReadiness {
  const artifactHash = envValue("SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION") === "pass";
  const required = enterpriseObservabilityLiveProbeRequired() ||
    booleanEnv("SENA_OBSERVABILITY_CONTRACT_REQUIRED");
  const confirmed = booleanEnv("SENA_OBSERVABILITY_CONTRACT_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `observabilityContractRequired=${required}`,
      `observabilityContractConfirmed=${confirmed}`,
      `observabilityContractExplicitlyRequired=${booleanEnv("SENA_OBSERVABILITY_CONTRACT_REQUIRED")}`,
      `observabilityContractProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `observabilityContractProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `observabilityContractProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `observabilityContractSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `observabilityContractArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `observabilityContractVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `observabilityContractArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      `observabilityContractSchema=${SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract}`,
      "observabilityContractScript=npm run sena:observability:contract",
      "observabilityContractSource=ops-observability"
    ]
  };
}

export function enterpriseObservabilityProbeReadiness(): SenaEnterpriseObservabilityProbeReadiness {
  const artifactHash = envValue("SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_OBSERVABILITY_PROBE_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION") === "pass";
  const required = enterpriseObservabilityLiveProbeRequired();
  const confirmed = booleanEnv("SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `observabilityLiveProbeRequired=${required}`,
      `observabilityLiveProbeConfirmed=${confirmed}`,
      `observabilityProbeExplicitlyRequired=${booleanEnv("SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED")}`,
      `observabilityProbeProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `observabilityProbeProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `observabilityProbeProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `observabilityProbeSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `observabilityProbeArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `observabilityProbeVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `observabilityProbeArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      "observabilityProbeApi=/api/sena/ops/observability/probe",
      "observabilityProbeScript=npm run sena:observability:verify"
    ]
  };
}

/**
 * Records one handled response into the SLI window.
 *
 * The error classification deliberately does NOT come from the status code
 * alone. A 503 can mean two unrelated things: an exhausted backend or a lock
 * timeout — a genuine failure that must burn error budget — or a probe
 * reporting "this backend is not configured yet", which is the answer that
 * endpoint exists to give and in which nothing has failed. Only the handler
 * that built the response can tell those apart, so the intent is carried in
 * from there via `informational` and is never inferred here. Anything a handler
 * does not explicitly declare informational is classified exactly as before.
 */
export function recordEnterpriseObservedRequest(input: {
  routeId: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestId?: string;
  errorCode?: string;
  /**
   * Declared by the handler when the response reports a state rather than a
   * failure — e.g. an ops probe answering "not configured yet". Narrow on
   * purpose: it takes a non-2xx out of the error count without touching the
   * status code, the status class, or any other response's classification.
   */
  informational?: boolean;
}): SenaEnterpriseObservedRequest {
  const observedAt = now();
  const durationMs = boundedDuration(input.durationMs);
  const cls = statusClass(input.statusCode);
  const informational = input.informational === true;
  const entry: SenaEnterpriseObservedRequest = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservedRequest,
    observedAt,
    requestIdHash: requestIdHash(input.requestId),
    routeId: sanitizeRouteId(input.routeId),
    method: sanitizeMethod(input.method),
    statusCode: input.statusCode,
    statusClass: cls,
    durationMs,
    slow: durationMs >= enterpriseObservabilitySlowRequestMs(),
    informational,
    error: input.statusCode >= 500 && !informational,
    errorCodeHash: input.errorCode ? sha256Text(input.errorCode) : undefined,
    redaction: {
      requestIdValueExcluded: true,
      pathValueExcluded: true,
      queryValueExcluded: true,
      payloadValueExcluded: true,
      secretValuesExcluded: true
    }
  };
  observedRequests.push(entry);
  if (observedRequests.length > maxObservedRequests) {
    observedRequests.splice(0, observedRequests.length - maxObservedRequests);
  }
  return entry;
}

export function listEnterpriseObservedRequests() {
  return [...observedRequests];
}

export async function mirrorEnterpriseObservedRequestToPostgres(sample: SenaEnterpriseObservedRequest) {
  if (!postgresObservabilitySampleStoreConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresObservedRequestAdapterFromEnv({});
  try {
    await adapter.upsertObservedRequests([sample]);
  } catch {
    // Request observation must never turn a successful business response into a Postgres failure.
  } finally {
    await pool.end?.();
  }
}

async function listEnterpriseObservedRequestsFromPostgres() {
  const { adapter, pool } = createEnterprisePostgresObservedRequestAdapterFromEnv({});
  try {
    return await adapter.listObservedRequests({ limit: maxObservedRequests });
  } finally {
    await pool.end?.();
  }
}

function routeSummary(samples: SenaEnterpriseObservedRequest[]): SenaEnterpriseObservabilityRouteSummary[] {
  const grouped = new Map<string, SenaEnterpriseObservedRequest[]>();
  for (const sample of samples) {
    const key = `${sample.routeId}\t${sample.method}`;
    grouped.set(key, [...(grouped.get(key) ?? []), sample]);
  }
  return [...grouped.values()]
    .map((entries) => {
      const durations = entries.map((entry) => entry.durationMs);
      return {
        routeId: entries[0]?.routeId ?? "unknown-route",
        method: entries[0]?.method ?? "GET",
        total: entries.length,
        errors: entries.filter((entry) => entry.error).length,
        slow: entries.filter((entry) => entry.slow).length,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        maxMs: durations.length ? Math.max(...durations) : 0
      };
    })
    .sort((left, right) => right.total - left.total || left.routeId.localeCompare(right.routeId));
}

function buildEnterpriseObservabilitySnapshot(input: {
  samples: SenaEnterpriseObservedRequest[];
  sampleWindow: SenaEnterpriseObservabilitySnapshot["summary"]["sampleWindow"];
  evidence: string[];
  forceReview?: boolean;
}): SenaEnterpriseObservabilitySnapshot {
  const samples = input.samples;
  const durations = samples.map((sample) => sample.durationMs);
  const errors = samples.filter((sample) => sample.error).length;
  const informational = samples.filter((sample) => sample.informational === true).length;
  const clientErrors = samples.filter((sample) => sample.statusClass === "4xx").length;
  // Counts the 5xx responses that actually failed. Reading the resolved `error`
  // flag rather than re-deriving from `informational` keeps this correct for
  // samples served out of the Postgres window, where the marker is not stored
  // but `error` is.
  const serverErrors = samples.filter((sample) => sample.statusClass === "5xx" && sample.error).length;
  const slow = samples.filter((sample) => sample.slow).length;
  const p95Ms = percentile(durations, 95);
  const errorRatePercent = samples.length ? Number(((errors / samples.length) * 100).toFixed(2)) : 0;
  const readiness = enterpriseObservabilityReadiness();
  const sloBreached = samples.length > 0 &&
    (p95Ms > enterpriseObservabilitySloP95Ms() || errorRatePercent > enterpriseObservabilitySloErrorRatePercent());
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilitySli,
    generatedAt: now(),
    status: readiness.productionReady && !sloBreached && !input.forceReview ? "pass" : "review",
    provider: {
      name: readiness.provider,
      externalSinkConfigured: readiness.externalSinkConfigured,
      externalSinkOriginAllowed: readiness.externalSinkOriginAllowed,
      dashboardConfigured: readiness.dashboardConfigured,
      runbookConfigured: readiness.runbookConfigured,
      ownerConfigured: readiness.ownerConfigured,
      endpointHash: readiness.endpointHash,
      dashboardUrlHash: readiness.dashboardUrlHash,
      runbookUrlHash: readiness.runbookUrlHash,
      secretConfigured: readiness.secretConfigured,
      timeoutMs: readiness.timeoutMs,
      urlValuesExcluded: true,
      secretValuesExcluded: true
    },
    slo: {
      p95Ms: enterpriseObservabilitySloP95Ms(),
      errorRatePercent: enterpriseObservabilitySloErrorRatePercent(),
      slowRequestMs: enterpriseObservabilitySlowRequestMs()
    },
    summary: {
      sampleWindow: input.sampleWindow,
      retainedSamples: samples.length,
      maxSamples: maxObservedRequests,
      total: samples.length,
      errors,
      informational,
      clientErrors,
      serverErrors,
      slow,
      p50Ms: percentile(durations, 50),
      p95Ms,
      p99Ms: percentile(durations, 99),
      maxMs: durations.length ? Math.max(...durations) : 0,
      errorRatePercent,
      sloBreached
    },
    routes: routeSummary(samples),
    recentSlowRequests: samples
      .filter((sample) => sample.slow)
      .slice(-10)
      .reverse(),
    evidence: [
      ...readiness.evidence,
      `observabilitySamples=${samples.length}`,
      `observabilityErrors=${errors}`,
      `observabilityInformationalResponses=${informational}`,
      `observabilityP95Ms=${p95Ms}`,
      `observabilityErrorRatePercent=${errorRatePercent}`,
      `observabilitySloBreached=${sloBreached}`,
      ...input.evidence,
      "observabilityPayloadValues=excluded"
    ]
  };
}

export function getEnterpriseObservabilitySnapshot(): SenaEnterpriseObservabilitySnapshot {
  return buildEnterpriseObservabilitySnapshot({
    samples: listEnterpriseObservedRequests(),
    sampleWindow: "current-process-ring-buffer",
    evidence: enterpriseObservabilitySampleStoreRuntime().evidence
  });
}

export async function getEnterpriseObservabilitySnapshotWithPostgresEvidence(): Promise<SenaEnterpriseObservabilitySnapshot> {
  const sampleStore = enterpriseObservabilitySampleStoreRuntime();
  if (sampleStore.activeStore !== "postgres-table") {
    return getEnterpriseObservabilitySnapshot();
  }
  try {
    return buildEnterpriseObservabilitySnapshot({
      samples: await listEnterpriseObservedRequestsFromPostgres(),
      sampleWindow: "postgres-table-window",
      evidence: sampleStore.evidence
    });
  } catch (error) {
    return buildEnterpriseObservabilitySnapshot({
      samples: listEnterpriseObservedRequests(),
      sampleWindow: "current-process-ring-buffer",
      evidence: [
        ...sampleStore.evidence,
        "observabilitySampleStoreFallback=current-process-ring-buffer",
        `observabilitySampleStoreReadErrorHash=${observabilityErrorHash(error)}`
      ],
      forceReview: true
    });
  }
}

export async function deliverEnterpriseObservedRequest(
  sample: SenaEnterpriseObservedRequest,
  input: { fetchImpl?: typeof fetch } = {}
): Promise<SenaEnterpriseObservabilityDelivery> {
  const generatedAt = now();
  const provider = enterpriseObservabilityProviderName();
  const exporterUrl = enterpriseObservabilityExporterUrl();
  const secret = enterpriseObservabilityExporterSecret();
  const endpointHash = webhookEndpointHash(exporterUrl);
  const externalSinkOriginAllowed = enterpriseObservabilityExternalSinkOriginAllowed(exporterUrl);
  const timeoutMs = enterpriseObservabilityTimeoutMs();
  const baseProvider = {
    name: provider,
    endpointHash,
    secretConfigured: Boolean(secret),
    timeoutMs,
    urlValueExcluded: true as const,
    secretValuesExcluded: true as const
  };
  if (!exporterUrl || !secret || provider === "not-configured" || !externalSinkOriginAllowed) {
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilityDelivery,
      generatedAt,
      status: "not-configured",
      provider: baseProvider,
      delivery: {
        attempted: false,
        errorCode: exporterUrl && !externalSinkOriginAllowed
          ? "observability_exporter_origin_not_allowed"
          : undefined
      }
    };
  }

  const payload = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilityDelivery,
    generatedAt,
    sample,
    redaction: {
      urlValuesExcluded: true,
      secretValuesExcluded: true,
      requestPayloadValuesExcluded: true
    }
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const attemptedAt = now();
  try {
    const response = await (input.fetchImpl ?? fetch)(exporterUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-schema-version": SENA_SCHEMA_VERSIONS.enterpriseObservedRequest,
        "x-sena-signature": `sha256=${signature}`
      },
      body,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilityDelivery,
      generatedAt,
      status: response.ok ? "delivered" : "failed",
      provider: baseProvider,
      delivery: {
        attempted: true,
        attemptedAt,
        httpStatus: response.status,
        errorCode: response.ok ? undefined : "observability_exporter_rejected",
        errorHash: response.ok ? undefined : webhookErrorHash(`observability_exporter_rejected:${response.status}`)
      }
    };
  } catch (error) {
    clearTimeout(timeout);
    const code = error instanceof Error && error.name === "AbortError"
      ? "observability_exporter_timeout"
      : "observability_exporter_delivery_failed";
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilityDelivery,
      generatedAt,
      status: "failed",
      provider: baseProvider,
      delivery: {
        attempted: true,
        attemptedAt,
        errorCode: code,
        errorHash: webhookErrorHash(error instanceof Error ? error.message : String(error))
      }
    };
  }
}

function observabilityProbeProvider(): SenaEnterpriseObservabilityProbe["provider"] {
  const readiness = enterpriseObservabilityReadiness();
  return {
    name: readiness.provider,
    externalSinkConfigured: readiness.externalSinkConfigured,
    externalSinkOriginAllowed: readiness.externalSinkOriginAllowed,
    dashboardConfigured: readiness.dashboardConfigured,
    runbookConfigured: readiness.runbookConfigured,
    ownerConfigured: readiness.ownerConfigured,
    endpointHash: readiness.endpointHash,
    dashboardUrlHash: readiness.dashboardUrlHash,
    runbookUrlHash: readiness.runbookUrlHash,
    secretConfigured: readiness.secretConfigured,
    timeoutMs: readiness.timeoutMs,
    urlValuesExcluded: true,
    secretValuesExcluded: true
  };
}

export async function verifyEnterpriseObservabilityProbe(input: {
  fetchImpl?: typeof fetch;
  requestId?: string;
} = {}): Promise<SenaEnterpriseObservabilityProbe> {
  const generatedAt = now();
  const sample: SenaEnterpriseObservedRequest = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservedRequest,
    observedAt: generatedAt,
    requestIdHash: requestIdHash(input.requestId ?? `sena-observability-probe-${randomUUID()}`),
    routeId: "sena-observability-live-probe",
    method: "GET",
    statusCode: 204,
    statusClass: "2xx",
    durationMs: 1,
    slow: false,
    error: false,
    redaction: {
      requestIdValueExcluded: true,
      pathValueExcluded: true,
      queryValueExcluded: true,
      payloadValueExcluded: true,
      secretValuesExcluded: true
    }
  };
  const delivery = await deliverEnterpriseObservedRequest(sample, { fetchImpl: input.fetchImpl });
  const status = delivery.status === "delivered" ? "pass" : "review";
  const readiness = enterpriseObservabilityReadiness();
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe,
    generatedAt,
    status,
    provider: observabilityProbeProvider(),
    probe: {
      sampleRouteId: "sena-observability-live-probe",
      sampleStatusClass: "2xx",
      sampleRequestIdHash: sample.requestIdHash,
      deliveryStatus: delivery.status,
      attempted: delivery.delivery.attempted,
      httpStatus: delivery.delivery.httpStatus,
      errorCode: delivery.delivery.errorCode,
      errorHash: delivery.delivery.errorHash
    },
    evidence: [
      ...readiness.evidence,
      `observabilityProbeStatus=${status}`,
      `observabilityProbeDelivery=${delivery.status}`,
      `observabilityProbeAttempted=${delivery.delivery.attempted}`,
      `observabilityProbeHttpStatus=${delivery.delivery.httpStatus ?? "missing"}`,
      "observabilityProbePayload=sena-enterprise-observed-request",
      "observabilityProbeRequestIdValue=excluded",
      "observabilityProbeExporterUrlValue=excluded"
    ],
    redaction: {
      exporterUrlValuesExcluded: true,
      requestIdValuesExcluded: true,
      secretValuesExcluded: true,
      payloadValuesExcluded: true
    },
    contract: buildEnterpriseObservabilityContract()
  };
}

export function emitEnterpriseObservedRequest(sample: SenaEnterpriseObservedRequest) {
  try {
    if (enterpriseObservabilityReadiness().externalSinkConfigured) {
      void deliverEnterpriseObservedRequest(sample).catch(() => undefined);
    }
  } catch {
    // Request observation must never turn a successful business response into an exporter failure.
  }
}

export function resetEnterpriseObservabilityForTests() {
  observedRequests.splice(0, observedRequests.length);
}
