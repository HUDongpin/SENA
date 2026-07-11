import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../lib/sena/schema-registry";
import { emitVerificationArtifact } from "./verification-artifact-output";

type CheckStatus = "pass" | "review" | "skipped";

type EnvRequirement = {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
  mode: "all" | "any";
  keys: string[];
  missing: string[];
  evidence: string[];
  nextAction: string;
};

type EnvAdvisoryRequirement = {
  id: string;
  label: string;
  present: boolean;
  keys: string[];
  missing: string[];
  evidence: string[];
  nextAction: string;
};

type VercelProductionPreflight = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight;
  generatedAt: string;
  status: "pass" | "review";
  target: {
    domain: string;
    domainValueExcluded: false;
    scopeConfigured: boolean;
    scopeValueExcluded: true;
  };
  cli: {
    available: boolean;
    version?: string;
    status: CheckStatus;
  };
  deployment: {
    attempted: boolean;
    status: CheckStatus;
    readyState?: string;
    target?: string;
    projectName?: string;
    deploymentUrlHash?: string;
    urlValueExcluded: true;
    evidence: string[];
  };
  domain: {
    attempted: boolean;
    status: CheckStatus;
    deploymentAliasMatched: boolean;
    evidence: string[];
  };
  env: {
    attempted: boolean;
    status: CheckStatus;
    environment: "production";
    variableNamesOnly: true;
    presentNames: string[];
    requirements: EnvRequirement[];
    advisoryRequirements: EnvAdvisoryRequirement[];
  };
  http: {
    attempted: boolean;
    status: CheckStatus;
    runtimeStatus: CheckStatus;
    httpStatus?: number;
    server?: string;
    xVercelCache?: string;
    xSenaRuntime?: string;
    expectedRuntimeValues: string[];
    ssoStatusEndpoint: {
      attempted: boolean;
      status: CheckStatus;
      httpStatus?: number;
      providersReported?: number;
      errorCode?: string;
    };
    evidence: string[];
  };
  summary: {
    totalChecks: number;
    pass: number;
    review: number;
    skipped: number;
    advisoryChecks: number;
    advisoryPass: number;
    advisoryReview: number;
    blockers: string[];
  };
  evidence: string[];
  nextActions: string[];
  redaction: {
    secretValuesExcluded: true;
    envValuesExcluded: true;
    endpointValuesHashed: true;
    childStdoutStderrExcluded: true;
  };
};

type Options = {
  domain: string;
  scope?: string;
  skipHttp: boolean;
  output?: string;
  timeoutMs: number;
};

type RunResult = {
  status: number;
  stdout: string;
  stderr: string;
};

const defaultDomain = "www.sena.hk";
const productionRuntimeHeaderValues = ["enterprise-neon", "enterprise-postgres"];

type HttpProbeResult = {
  attempted: boolean;
  method?: "HEAD" | "GET";
  attempts: string[];
  status?: number;
  server?: string;
  xVercelCache?: string;
  xSenaRuntime?: string;
  errorCode?: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    domain: defaultDomain,
    scope: process.env.VERCEL_SCOPE,
    skipHttp: false,
    timeoutMs: 5000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--domain") options.domain = next();
    else if (arg === "--scope") options.scope = next();
    else if (arg === "--skip-http") options.skipHttp = true;
    else if (arg === "--timeout-ms") options.timeoutMs = Math.max(1000, Math.min(30_000, Number(next()) || 5000));
    else if (arg === "--output") {
      options.output = next();
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Verify the SENA Vercel production deployment preflight.

Usage:
  npm run sena:vercel:preflight -- [--domain www.sena.hk] [--scope <team>] [--output <file>] [--skip-http]

Options:
  --domain <host>      Production domain. Default: ${defaultDomain}
  --scope <team>       Vercel team scope.
  --output <file>      Write the redacted preflight JSON and <file>.sha256.
  --skip-http          Do not make the live HTTPS HEAD request.
  --timeout-ms <ms>    Live HTTP timeout. Default: 5000`);
      process.exit(0);
    }
  }
  return options;
}

function run(command: string, args: string[]): RunResult {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function vercelArgs(options: Options, args: string[]) {
  return options.scope ? [...args, "--scope", options.scope] : args;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function extractJson(output: string) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseEnvNames(output: string) {
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]+)\s+/.exec(line);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

function deploymentAliasesFromJson(value: Record<string, unknown> | undefined) {
  const aliases = value?.aliases;
  if (!Array.isArray(aliases)) return [];
  return aliases
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "alias" in entry && typeof entry.alias === "string") {
        return entry.alias;
      }
      if (entry && typeof entry === "object" && "domain" in entry && typeof entry.domain === "string") {
        return entry.domain;
      }
      return undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function normalizedHost(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function httpProbeErrorCode(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "timeout";
    if (error.name) return error.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "error";
  }
  return "unknown";
}

async function fetchHttpProbe(input: {
  url: string;
  method: "HEAD" | "GET";
  timeoutMs: number;
}): Promise<{
  method: "HEAD" | "GET";
  status?: number;
  server?: string;
  xVercelCache?: string;
  xSenaRuntime?: string;
  errorCode?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(input.url, {
      method: input.method,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "user-agent": "sena-vercel-production-preflight/1.0"
      }
    });
    if (input.method === "GET") {
      await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    }
    return {
      method: input.method,
      status: response.status,
      server: response.headers.get("server") ?? undefined,
      xVercelCache: response.headers.get("x-vercel-cache") ?? undefined,
      xSenaRuntime: response.headers.get("x-sena-runtime") ?? undefined
    };
  } catch (error) {
    return {
      method: input.method,
      errorCode: httpProbeErrorCode(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

type SsoStatusProbeResult = {
  attempted: boolean;
  status?: number;
  providersReported?: number;
  errorCode?: string;
};

// The login and register pages query /api/auth/sso?status=1 for SSO button
// state; the deployed endpoint must answer 200 with a providers array or the
// live sign-in surface is broken even when the homepage is healthy.
async function probeSsoStatusEndpoint(options: Options): Promise<SsoStatusProbeResult> {
  if (options.skipHttp) return { attempted: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(`https://${options.domain}/api/auth/sso?status=1`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "sena-vercel-production-preflight/1.0"
      }
    });
    const body = await response.json().catch(() => null) as { providers?: unknown } | null;
    return {
      attempted: true,
      status: response.status,
      providersReported: Array.isArray(body?.providers) ? body.providers.length : undefined
    };
  } catch (error) {
    return {
      attempted: true,
      errorCode: httpProbeErrorCode(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeHttpEndpoint(options: Options): Promise<HttpProbeResult> {
  if (options.skipHttp) {
    return {
      attempted: false,
      attempts: []
    };
  }
  const url = `https://${options.domain}`;
  const head = await fetchHttpProbe({ url, method: "HEAD", timeoutMs: options.timeoutMs });
  const attempts = [
    `HEAD:${head.status ?? head.errorCode ?? "missing"}`
  ];
  const headPass = typeof head.status === "number" && head.status >= 200 && head.status < 400;
  if (headPass) {
    return {
      attempted: true,
      method: "HEAD",
      attempts,
      status: head.status,
      server: head.server,
      xVercelCache: head.xVercelCache,
      xSenaRuntime: head.xSenaRuntime
    };
  }
  const get = await fetchHttpProbe({ url, method: "GET", timeoutMs: options.timeoutMs });
  attempts.push(`GET:${get.status ?? get.errorCode ?? "missing"}`);
  return {
    attempted: true,
    method: typeof get.status === "number" ? "GET" : head.method,
    attempts,
    status: get.status ?? head.status,
    server: get.server ?? head.server,
    xVercelCache: get.xVercelCache ?? head.xVercelCache,
    xSenaRuntime: get.xSenaRuntime ?? head.xSenaRuntime,
    errorCode: typeof get.status === "number" ? undefined : get.errorCode ?? head.errorCode
  };
}

function requirement(input: {
  id: string;
  label: string;
  keys: string[];
  presentNames: Set<string>;
  mode?: "all" | "any";
  nextAction: string;
}): EnvRequirement {
  const mode = input.mode ?? "all";
  const missing = input.keys.filter((key) => !input.presentNames.has(key));
  const present = mode === "all" ? missing.length === 0 : input.keys.some((key) => input.presentNames.has(key));
  return {
    id: input.id,
    label: input.label,
    required: true,
    present,
    mode,
    keys: input.keys,
    missing: mode === "all" ? missing : present ? [] : input.keys,
    evidence: [
      `mode=${mode}`,
      `present=${present}`,
      `keys=${input.keys.join("|")}`,
      `missing=${(mode === "all" ? missing : present ? [] : input.keys).join("|") || "none"}`,
      "envValues=excluded"
    ],
    nextAction: present ? "Keep these Vercel production env variable names configured." : input.nextAction
  };
}

function advisoryRequirement(input: {
  id: string;
  label: string;
  keys: string[];
  presentNames: Set<string>;
  nextAction: string;
}): EnvAdvisoryRequirement {
  const missing = input.keys.filter((key) => !input.presentNames.has(key));
  const present = missing.length === 0;
  return {
    id: input.id,
    label: input.label,
    present,
    keys: input.keys,
    missing,
    evidence: [
      "mode=all-advisory",
      `present=${present}`,
      `keys=${input.keys.join("|")}`,
      `missing=${missing.join("|") || "none"}`,
      "envValues=excluded",
      "advisoryOnly=true"
    ],
    nextAction: present ? "Keep this advisory evidence custody attached to the production handoff." : input.nextAction
  };
}

function productionRuntimeEnvPacketAdvisory(presentNames: Set<string>): EnvAdvisoryRequirement {
  return advisoryRequirement({
    id: "production-runtime-env-packet-custody",
    label: "Production runtime env packet custody",
    keys: [
      "SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED",
      "SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256",
      "SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT",
      "SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS",
      "SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS",
      "SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS"
    ],
    presentNames,
    nextAction: "Run npm run sena:production-env:packet and bind the emitted redacted packet with npm run sena:production-evidence:bind so Vercel production carries the provider-env handoff custody hash."
  });
}

function productionGoLiveGateAdvisory(presentNames: Set<string>): EnvAdvisoryRequirement {
  return advisoryRequirement({
    id: "production-go-live-gate-custody",
    label: "Production go-live gate custody",
    keys: [
      "SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED",
      "SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256",
      "SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT",
      "SENA_PRODUCTION_GO_LIVE_GATE_STATUS",
      "SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY",
      "SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS",
      "SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS"
    ],
    presentNames,
    nextAction: "Run npm run sena:production:gate and bind the emitted redacted gate with npm run sena:production-evidence:bind so Vercel production carries final gate custody without replacing live probe evidence."
  });
}

function postgresEnvRequirement(presentNames: Set<string>): EnvRequirement {
  const adapterKeys = ["SENA_ENTERPRISE_DB_ADAPTER"];
  const stateStoreKeys = ["SENA_ENTERPRISE_STATE_STORE"];
  const urlKeys = [
    "SENA_ENTERPRISE_POSTGRES_URL",
    "SENA_DATABASE_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "NEON_DATABASE_URL"
  ];
  const adapterPresent = adapterKeys.every((key) => presentNames.has(key));
  const stateStorePresent = stateStoreKeys.every((key) => presentNames.has(key));
  const urlPresent = urlKeys.some((key) => presentNames.has(key));
  const missing = [
    ...adapterKeys.filter((key) => !presentNames.has(key)),
    ...stateStoreKeys.filter((key) => !presentNames.has(key)),
    urlPresent ? null : urlKeys.join("|")
  ].filter((value): value is string => Boolean(value));
  const present = adapterPresent && stateStorePresent && urlPresent;
  const keys = [...adapterKeys, ...stateStoreKeys, ...urlKeys];
  return {
    id: "neon-postgres-env",
    label: "Neon/Postgres primary state env",
    required: true,
    present,
    mode: "all",
    keys,
    missing,
    evidence: [
      "mode=adapter-and-state-store-and-any-url",
      `present=${present}`,
      `keys=${keys.join("|")}`,
      `urlKeys=${urlKeys.join("|")}`,
      `missing=${missing.join("|") || "none"}`,
      "envValues=excluded"
    ],
    nextAction: present
      ? "Keep the Postgres adapter, state store, and one supported Postgres URL env variable configured."
      : "Run sena:vercel:neon:configure with the real Neon URL, or configure SENA_ENTERPRISE_DB_ADAPTER, SENA_ENTERPRISE_STATE_STORE, and one supported Postgres URL env variable in Vercel production."
  };
}

function legacyLocalFileEnvRequirement(presentNames: Set<string>): EnvRequirement {
  const keys = ["SENA_ENTERPRISE_DB_DIR"];
  const configured = keys.filter((key) => presentNames.has(key));
  const present = configured.length === 0;
  return {
    id: "legacy-local-file-env",
    label: "Legacy local file state env absent",
    required: true,
    present,
    mode: "all",
    keys,
    missing: present ? [] : configured.map((key) => `remove:${key}`),
    evidence: [
      "mode=forbid-production-local-file-state-env",
      `present=${present}`,
      `forbiddenKeys=${keys.join("|")}`,
      `configuredForbiddenKeys=${configured.join("|") || "none"}`,
      "envValues=excluded"
    ],
    nextAction: present
      ? "Keep legacy file-state env names out of Vercel production."
      : "Remove SENA_ENTERPRISE_DB_DIR from Vercel production after Postgres primary state is configured; the local JSON store remains a research-pilot artifact, not the multi-user production backend."
  };
}

function objectStorageEnvRequirement(presentNames: Set<string>): EnvRequirement {
  const adapterKeys = ["SENA_OBJECT_STORAGE_ADAPTER"];
  const endpointKeys = [
    "SENA_OBJECT_STORAGE_ENDPOINT",
    "R2_ENDPOINT",
    "CLOUDFLARE_R2_ENDPOINT",
    "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
    "R2_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCOUNT_ID"
  ];
  const bucketKeys = [
    "SENA_OBJECT_STORAGE_BUCKET",
    "R2_BUCKET_NAME",
    "R2_BUCKET",
    "CLOUDFLARE_R2_BUCKET_NAME"
  ];
  const accessKeyIdKeys = [
    "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID"
  ];
  const secretAccessKeyKeys = [
    "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  ];
  const vercelBlobTokenKeys = [
    "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
    "BLOB_READ_WRITE_TOKEN"
  ];
  const vercelBlobStoreIdKeys = [
    "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
    "BLOB_STORE_ID"
  ];
  const vercelBlobOidcKeys = [
    "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN",
    "VERCEL_OIDC_TOKEN"
  ];
  const r2SignalKeys = [
    "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
    "R2_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCOUNT_ID",
    "R2_ENDPOINT",
    "CLOUDFLARE_R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  ];
  const vercelBlobSignalKeys = [
    ...vercelBlobTokenKeys,
    ...vercelBlobStoreIdKeys
  ];
  const anyPresent = (keys: string[]) => keys.some((key) => presentNames.has(key));
  const r2Signal = anyPresent(r2SignalKeys);
  const vercelBlobSignal = anyPresent(vercelBlobSignalKeys);
  const adapterPresent = adapterKeys.every((key) => presentNames.has(key)) || r2Signal || vercelBlobSignal;
  const vercelBlobTokenPresent = anyPresent(vercelBlobTokenKeys);
  const vercelBlobOidcPresent = anyPresent(vercelBlobStoreIdKeys) && anyPresent(vercelBlobOidcKeys);
  const vercelBlobStoreIdPresent = anyPresent(vercelBlobStoreIdKeys);
  const vercelBlobPresent = vercelBlobSignal && (vercelBlobTokenPresent || vercelBlobOidcPresent);
  const endpointPresent = anyPresent(endpointKeys);
  const bucketPresent = anyPresent(bucketKeys);
  const accessKeyPresent = anyPresent(accessKeyIdKeys);
  const secretKeyPresent = anyPresent(secretAccessKeyKeys);
  const s3CompatiblePresent = endpointPresent && bucketPresent && accessKeyPresent && secretKeyPresent;
  const missing = vercelBlobSignal
    ? [
      adapterPresent ? null : "SENA_OBJECT_STORAGE_ADAPTER|BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID",
      vercelBlobTokenPresent || vercelBlobOidcPresent
        ? null
        : vercelBlobStoreIdPresent
          ? [...vercelBlobTokenKeys, ...vercelBlobOidcKeys].join("|")
          : [...vercelBlobTokenKeys, ...vercelBlobStoreIdKeys].join("|")
    ].filter((value): value is string => Boolean(value))
    : [
      adapterPresent ? null : "SENA_OBJECT_STORAGE_ADAPTER|R2_ACCOUNT_ID|R2_ENDPOINT|BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID",
      endpointPresent ? null : endpointKeys.join("|"),
      bucketPresent ? null : bucketKeys.join("|"),
      accessKeyPresent ? null : accessKeyIdKeys.join("|"),
      secretKeyPresent ? null : secretAccessKeyKeys.join("|")
    ].filter((value): value is string => Boolean(value));
  const keys = [
    ...adapterKeys,
    ...endpointKeys,
    ...bucketKeys,
    ...accessKeyIdKeys,
    ...secretAccessKeyKeys,
    ...vercelBlobTokenKeys,
    ...vercelBlobStoreIdKeys,
    ...vercelBlobOidcKeys
  ];
  const present = adapterPresent && (s3CompatiblePresent || vercelBlobPresent);
  return {
    id: "object-storage-env",
    label: "Object storage env",
    required: true,
    present,
    mode: "all",
    keys: [...new Set(keys)],
    missing,
    evidence: [
      "mode=canonical-sena-or-cloudflare-r2-or-vercel-blob",
      `present=${present}`,
      `keys=${[...new Set(keys)].join("|")}`,
      `r2Signal=${r2Signal}`,
      `vercelBlobSignal=${vercelBlobSignal}`,
      `missing=${missing.join("|") || "none"}`,
      "envValues=excluded"
    ],
    nextAction: present
      ? "Keep the native object-storage env variable names configured."
      : "Configure native object-storage env vars, provide Cloudflare R2 env names, or connect Vercel Blob env names that SENA can normalize before production upload custody is claimed."
  };
}

function serverJobQueueEnvRequirement(presentNames: Set<string>): EnvRequirement {
  const adapterKeys = ["SENA_JOB_QUEUE_ADAPTER"];
  const destinationKeys = ["SENA_JOB_QUEUE_URL", "SENA_JOB_WORKER_CALLBACK_URL"];
  const secretKeys = ["SENA_JOB_QUEUE_SECRET"];
  const providerUrlKeys = ["SENA_JOB_QUEUE_PROVIDER_URL", "QSTASH_URL", "UPSTASH_QSTASH_URL"];
  const providerTokenKeys = ["SENA_JOB_QUEUE_PROVIDER_TOKEN", "QSTASH_TOKEN", "UPSTASH_QSTASH_TOKEN"];
  const queueNameKeys = ["SENA_JOB_QUEUE_NAME", "QSTASH_QUEUE_NAME", "UPSTASH_QSTASH_QUEUE_NAME"];
  const contractKeys = [
    "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
    "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
    "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
    "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION"
  ];
  const anyPresent = (keys: string[]) => keys.some((key) => presentNames.has(key));
  const allPresent = (keys: string[]) => keys.every((key) => presentNames.has(key));
  const qstashSignal = anyPresent([...providerUrlKeys, ...providerTokenKeys, ...queueNameKeys]);
  const adapterPresent = anyPresent(adapterKeys) || qstashSignal;
  const destinationPresent = anyPresent(destinationKeys);
  const secretPresent = anyPresent(secretKeys);
  const providerTokenPresent = anyPresent(providerTokenKeys);
  const providerUrlPresent = anyPresent(providerUrlKeys) || qstashSignal;
  const contractPresent = allPresent(contractKeys);
  const missing = [
    adapterPresent ? null : "SENA_JOB_QUEUE_ADAPTER|QSTASH_TOKEN",
    destinationPresent ? null : destinationKeys.join("|"),
    secretPresent ? null : secretKeys.join("|"),
    qstashSignal && !providerUrlPresent ? providerUrlKeys.join("|") : null,
    qstashSignal && !providerTokenPresent ? providerTokenKeys.join("|") : null,
    contractPresent ? null : contractKeys.join("|")
  ].filter((value): value is string => Boolean(value));
  const keys = [
    ...adapterKeys,
    ...destinationKeys,
    ...secretKeys,
    ...providerUrlKeys,
    ...providerTokenKeys,
    ...queueNameKeys,
    ...contractKeys
  ];
  const present = adapterPresent &&
    destinationPresent &&
    secretPresent &&
    (!qstashSignal || (providerUrlPresent && providerTokenPresent)) &&
    contractPresent;
  return {
    id: "server-job-queue-env",
    label: "Server job queue env",
    required: true,
    present,
    mode: "all",
    keys: [...new Set(keys)],
    missing,
    evidence: [
      "mode=canonical-sena-or-upstash-qstash",
      `present=${present}`,
      `keys=${[...new Set(keys)].join("|")}`,
      `qstashSignal=${qstashSignal}`,
      `contractEvidence=${contractPresent}`,
      `missing=${missing.join("|") || "none"}`,
      "envValues=excluded"
    ],
    nextAction: present
      ? "Keep the managed server job queue env variable names configured."
      : "Configure SENA managed queue env vars, or provide Upstash QStash token/provider env plus SENA_JOB_WORKER_CALLBACK_URL, SENA_JOB_QUEUE_SECRET, and queue contract artifact env vars before heavy analysis/export work is production-ready."
  };
}

function observabilityEnvRequirement(presentNames: Set<string>): EnvRequirement {
  const ownerKeys = [
    "SENA_ALERTING_OWNER",
    "SENA_OBSERVABILITY_OWNER",
    "ALERTING_OWNER",
    "OBSERVABILITY_OWNER"
  ];
  const alertUrlKeys = [
    "SENA_ALERT_WEBHOOK_URL",
    "SENA_ALERTING_WEBHOOK_URL",
    "ALERT_WEBHOOK_URL",
    "ALERTS_WEBHOOK_URL",
    "OBSERVABILITY_ALERT_WEBHOOK_URL"
  ];
  const alertSecretKeys = [
    "SENA_ALERT_WEBHOOK_SECRET",
    "SENA_ALERTING_WEBHOOK_SECRET",
    "SENA_ALERT_WEBHOOK_SIGNING_SECRET",
    "ALERT_WEBHOOK_SECRET",
    "ALERTS_WEBHOOK_SECRET",
    "OBSERVABILITY_ALERT_WEBHOOK_SECRET"
  ];
  const providerKeys = [
    "SENA_OBSERVABILITY_PROVIDER"
  ];
  const exporterUrlKeys = [
    "SENA_OBSERVABILITY_EXPORTER_URL",
    "SENA_OBSERVABILITY_WEBHOOK_URL",
    "OBSERVABILITY_WEBHOOK_URL",
    "OBSERVABILITY_EXPORTER_URL"
  ];
  const exporterSecretKeys = [
    "SENA_OBSERVABILITY_EXPORTER_SECRET",
    "SENA_OBSERVABILITY_WEBHOOK_SECRET",
    "SENA_OBSERVABILITY_EXPORTER_TOKEN",
    "OBSERVABILITY_WEBHOOK_SECRET",
    "OBSERVABILITY_EXPORTER_SECRET",
    "OBSERVABILITY_EXPORTER_TOKEN"
  ];
  const dashboardKeys = [
    "SENA_OBSERVABILITY_DASHBOARD_URL",
    "OBSERVABILITY_DASHBOARD_URL"
  ];
  const runbookKeys = [
    "SENA_OBSERVABILITY_RUNBOOK_URL",
    "OBSERVABILITY_RUNBOOK_URL",
    "SENA_ALERTING_RUNBOOK_URL",
    "ALERTING_RUNBOOK_URL"
  ];
  const contractKeys = [
    "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
    "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
    "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
    "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
  ];
  const anyPresent = (keys: string[]) => keys.some((key) => presentNames.has(key));
  const allPresent = (keys: string[]) => keys.every((key) => presentNames.has(key));
  const exporterSignal = anyPresent([...exporterUrlKeys, ...exporterSecretKeys]);
  const providerPresent = anyPresent(providerKeys) || exporterSignal;
  const ownerPresent = anyPresent(ownerKeys);
  const alertUrlPresent = anyPresent(alertUrlKeys);
  const alertSecretPresent = anyPresent(alertSecretKeys);
  const exporterUrlPresent = anyPresent(exporterUrlKeys);
  const exporterSecretPresent = anyPresent(exporterSecretKeys);
  const dashboardPresent = anyPresent(dashboardKeys);
  const runbookPresent = anyPresent(runbookKeys);
  const contractPresent = allPresent(contractKeys);
  const missing = [
    ownerPresent ? null : ownerKeys.join("|"),
    alertUrlPresent ? null : alertUrlKeys.join("|"),
    alertSecretPresent ? null : alertSecretKeys.join("|"),
    providerPresent ? null : "SENA_OBSERVABILITY_PROVIDER|OBSERVABILITY_WEBHOOK_URL",
    exporterUrlPresent ? null : exporterUrlKeys.join("|"),
    exporterSecretPresent ? null : exporterSecretKeys.join("|"),
    dashboardPresent ? null : dashboardKeys.join("|"),
    runbookPresent ? null : runbookKeys.join("|"),
    contractPresent ? null : contractKeys.join("|")
  ].filter((value): value is string => Boolean(value));
  const keys = [
    ...ownerKeys,
    ...alertUrlKeys,
    ...alertSecretKeys,
    ...providerKeys,
    ...exporterUrlKeys,
    ...exporterSecretKeys,
    ...dashboardKeys,
    ...runbookKeys,
    ...contractKeys
  ];
  const present = ownerPresent &&
    alertUrlPresent &&
    alertSecretPresent &&
    providerPresent &&
    exporterUrlPresent &&
    exporterSecretPresent &&
    dashboardPresent &&
    runbookPresent &&
    contractPresent;
  return {
    id: "observability-env",
    label: "Observability and alert env",
    required: true,
    present,
    mode: "all",
    keys: [...new Set(keys)],
    missing,
    evidence: [
      "mode=canonical-sena-or-generic-observability-aliases",
      `present=${present}`,
      `keys=${[...new Set(keys)].join("|")}`,
      `exporterSignal=${exporterSignal}`,
      `contractEvidence=${contractPresent}`,
      `missing=${missing.join("|") || "none"}`,
      "envValues=excluded"
    ],
    nextAction: present
      ? "Keep the alerting and observability env variable names configured."
      : "Configure alert ownership, alert webhook, observability exporter, dashboard, runbook, and observability contract artifact env vars before production observability is claimed."
  };
}

async function buildPreflight(options: Options): Promise<VercelProductionPreflight> {
  const cliVersion = run("vercel", ["--version"]);
  const cliAvailable = cliVersion.status === 0;
  const deployment = cliAvailable
    ? run("vercel", vercelArgs(options, ["inspect", options.domain, "--format", "json"]))
    : { status: 1, stdout: "", stderr: "" };
  const deploymentJson = extractJson(`${deployment.stdout}\n${deployment.stderr}`);
  const readyState = typeof deploymentJson?.readyState === "string" ? deploymentJson.readyState : undefined;
  const target = typeof deploymentJson?.target === "string" ? deploymentJson.target : undefined;
  const projectName = typeof deploymentJson?.name === "string" ? deploymentJson.name : undefined;
  const deploymentUrl = typeof deploymentJson?.url === "string" ? deploymentJson.url : undefined;
  const deploymentAliases = deploymentAliasesFromJson(deploymentJson);
  const deploymentAliasMatched = deploymentAliases.some((alias) => normalizedHost(alias) === normalizedHost(options.domain));
  const deploymentReady = deployment.status === 0 && readyState === "READY" && target === "production";
  const domainInspect = cliAvailable
    ? run("vercel", vercelArgs(options, ["domains", "inspect", options.domain]))
    : { status: 1, stdout: "", stderr: "" };
  const envList = cliAvailable
    ? run("vercel", vercelArgs(options, ["env", "ls", "production"]))
    : { status: 1, stdout: "", stderr: "" };
  const presentNames = parseEnvNames(envList.stdout);
  const presentNameSet = new Set(presentNames);
  const envRequirements = [
    postgresEnvRequirement(presentNameSet),
    legacyLocalFileEnvRequirement(presentNameSet),
    requirement({
      id: "app-url-env",
      label: "Public app URL env",
      keys: ["SENA_APP_URL", "NEXT_PUBLIC_SENA_APP_URL"],
      presentNames: presentNameSet,
      nextAction: "Set SENA_APP_URL and NEXT_PUBLIC_SENA_APP_URL to https://www.sena.hk in Vercel production."
    }),
    requirement({
      id: "security-env",
      label: "Core security env",
      keys: ["SENA_SESSION_SECRET", "SENA_CSRF_SECRET", "SENA_MFA_ENCRYPTION_KEY", "SENA_OPS_TOKEN"],
      presentNames: presentNameSet,
      nextAction: "Configure SENA session, CSRF, MFA encryption, and ops bearer token secrets in Vercel production."
    }),
    objectStorageEnvRequirement(presentNameSet),
    serverJobQueueEnvRequirement(presentNameSet),
    observabilityEnvRequirement(presentNameSet),
    requirement({
      id: "cdn-evidence-env",
      label: "CDN evidence env",
      keys: [
        "SENA_CDN_VERIFY_URL",
        "SENA_CDN_CONTRACT_CONFIRMED",
        "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
        "SENA_CDN_CONTRACT_VERIFIED_AT",
        "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION",
        "SENA_CDN_LIVE_PROBE_CONFIRMED",
        "SENA_CDN_PROBE_ARTIFACT_SHA256",
        "SENA_CDN_PROBE_VERIFIED_AT",
        "SENA_CDN_PROBE_ARTIFACT_VALIDATION"
      ],
      presentNames: presentNameSet,
      nextAction: "Configure CDN contract and live-probe evidence env vars after running the CDN contract and verifier against the deployed URL."
    })
  ];
  const envAdvisoryRequirements = [
    productionRuntimeEnvPacketAdvisory(presentNameSet),
    productionGoLiveGateAdvisory(presentNameSet)
  ];
  const httpProbe = await probeHttpEndpoint(options);
  const httpStatus = httpProbe.status;
  const server = httpProbe.server;
  const xVercelCache = httpProbe.xVercelCache;
  const xSenaRuntime = httpProbe.xSenaRuntime;
  const ssoStatusProbe = await probeSsoStatusEndpoint(options);
  const ssoStatusPass = ssoStatusProbe.status === 200 && ssoStatusProbe.providersReported !== undefined;
  const checkStatuses: Array<{ id: string; status: CheckStatus }> = [
    { id: "vercel-cli", status: cliAvailable ? "pass" : "review" },
    { id: "deployment-ready", status: deploymentReady ? "pass" : "review" },
    { id: "domain-configured", status: domainInspect.status === 0 || deploymentAliasMatched ? "pass" : "review" },
    { id: "env-list", status: envList.status === 0 ? "pass" : "review" },
    ...envRequirements.map((entry) => ({ id: entry.id, status: entry.present ? "pass" as const : "review" as const })),
    { id: "live-http", status: options.skipHttp ? "skipped" : httpStatus && httpStatus >= 200 && httpStatus < 400 ? "pass" : "review" },
    {
      id: "runtime-header",
      status: options.skipHttp
        ? "skipped"
        : xSenaRuntime && productionRuntimeHeaderValues.includes(xSenaRuntime)
          ? "pass"
          : "review"
    },
    { id: "sso-status-endpoint", status: options.skipHttp ? "skipped" : ssoStatusPass ? "pass" : "review" }
  ];
  const blockers = checkStatuses.filter((entry) => entry.status !== "pass").map((entry) => entry.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight,
    generatedAt: new Date().toISOString(),
    status: blockers.length ? "review" : "pass",
    target: {
      domain: options.domain,
      domainValueExcluded: false,
      scopeConfigured: Boolean(options.scope),
      scopeValueExcluded: true
    },
    cli: {
      available: cliAvailable,
      version: cliAvailable ? cliVersion.stdout.trim().split(/\s+/).slice(0, 3).join(" ") : undefined,
      status: cliAvailable ? "pass" : "review"
    },
    deployment: {
      attempted: cliAvailable,
      status: deploymentReady ? "pass" : "review",
      readyState,
      target,
      projectName,
      deploymentUrlHash: deploymentUrl ? sha256Text(deploymentUrl) : undefined,
      urlValueExcluded: true,
      evidence: [
        `inspectExit=${deployment.status}`,
        `readyState=${readyState ?? "missing"}`,
        `target=${target ?? "missing"}`,
        `deploymentUrlHash=${deploymentUrl ? "present" : "missing"}`
      ]
    },
    domain: {
      attempted: cliAvailable,
      status: domainInspect.status === 0 || deploymentAliasMatched ? "pass" : "review",
      deploymentAliasMatched,
      evidence: [
        `domainInspectExit=${domainInspect.status}`,
        `deploymentAliasMatched=${deploymentAliasMatched}`,
        `deploymentAliasCount=${deploymentAliases.length}`,
        "domainInspectValues=excluded"
      ]
    },
    env: {
      attempted: cliAvailable,
      status: envList.status === 0 && envRequirements.every((entry) => entry.present) ? "pass" : "review",
      environment: "production",
      variableNamesOnly: true,
      presentNames,
      requirements: envRequirements,
      advisoryRequirements: envAdvisoryRequirements
    },
    http: {
      attempted: httpProbe.attempted,
      status: options.skipHttp ? "skipped" : httpStatus && httpStatus >= 200 && httpStatus < 400 ? "pass" : "review",
      runtimeStatus: options.skipHttp ? "skipped" : xSenaRuntime && productionRuntimeHeaderValues.includes(xSenaRuntime) ? "pass" : "review",
      httpStatus,
      server,
      xVercelCache,
      xSenaRuntime,
      expectedRuntimeValues: productionRuntimeHeaderValues,
      ssoStatusEndpoint: {
        attempted: ssoStatusProbe.attempted,
        status: options.skipHttp ? "skipped" : ssoStatusPass ? "pass" : "review",
        httpStatus: ssoStatusProbe.status,
        providersReported: ssoStatusProbe.providersReported,
        errorCode: ssoStatusProbe.errorCode
      },
      evidence: [
        `attempted=${httpProbe.attempted}`,
        `httpProbeMethod=${options.skipHttp ? "skipped" : httpProbe.method ?? "missing"}`,
        `httpProbeAttempts=${httpProbe.attempts.join("|") || "none"}`,
        `httpProbeError=${httpProbe.errorCode ?? "none"}`,
        `httpProbeTimeoutMs=${options.timeoutMs}`,
        `httpStatus=${httpStatus ?? "missing"}`,
        `xSenaRuntime=${xSenaRuntime ?? "missing"}`,
        `runtimeHeaderStatus=${options.skipHttp ? "skipped" : xSenaRuntime && productionRuntimeHeaderValues.includes(xSenaRuntime) ? "pass" : "review"}`,
        `runtimeHeaderExpected=${productionRuntimeHeaderValues.join("|")}`,
        `ssoStatusEndpointStatus=${options.skipHttp ? "skipped" : ssoStatusProbe.status ?? ssoStatusProbe.errorCode ?? "missing"}`,
        `ssoStatusProvidersReported=${ssoStatusProbe.providersReported ?? "missing"}`,
        "responseBody=excluded"
      ]
    },
    summary: {
      totalChecks: checkStatuses.length,
      pass: checkStatuses.filter((entry) => entry.status === "pass").length,
      review: checkStatuses.filter((entry) => entry.status === "review").length,
      skipped: checkStatuses.filter((entry) => entry.status === "skipped").length,
      advisoryChecks: envAdvisoryRequirements.length,
      advisoryPass: envAdvisoryRequirements.filter((entry) => entry.present).length,
      advisoryReview: envAdvisoryRequirements.filter((entry) => !entry.present).length,
      blockers
    },
    evidence: [
      `domain=${options.domain}`,
      `scopeConfigured=${Boolean(options.scope)}`,
      `blockers=${blockers.join("|") || "none"}`,
      "envValues=excluded",
      "secretValues=excluded"
    ],
    nextActions: [
      ...envRequirements.filter((entry) => !entry.present).map((entry) => entry.nextAction),
      ...(deploymentReady ? [] : ["Verify that the Vercel production deployment is READY for www.sena.hk."]),
      ...(domainInspect.status === 0 || deploymentAliasMatched ? [] : ["Verify that www.sena.hk is assigned to the linked Vercel project."]),
      ...(!options.skipHttp && (!xSenaRuntime || !productionRuntimeHeaderValues.includes(xSenaRuntime))
        ? ["Deploy after configuring Postgres primary state so x-sena-runtime reports enterprise-neon or enterprise-postgres instead of the local file runtime."]
        : []),
      ...(options.skipHttp || (httpStatus && httpStatus >= 200 && httpStatus < 400) ? [] : ["Verify that https://www.sena.hk responds from Vercel before conference traffic."])
    ],
    redaction: {
      secretValuesExcluded: true,
      envValuesExcluded: true,
      endpointValuesHashed: true,
      childStdoutStderrExcluded: true
    }
  };
}

const options = parseArgs(process.argv.slice(2));
const artifact = await buildPreflight(options);
emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "vercelProductionPreflightArtifactPath",
  artifactSha256Label: "vercelProductionPreflightArtifactSha256",
  verifiedAtLabel: "vercelProductionPreflightVerifiedAt",
  verifiedAt: artifact.generatedAt
});

if (artifact.status !== "pass") {
  console.error("SENA Vercel production preflight is not ready. One or more required production checks remain under review.");
  process.exit(1);
}

console.log("SENA Vercel production preflight passed.");
