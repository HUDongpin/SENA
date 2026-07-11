#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultDomain = "www.sena.hk";
const defaultProject = "sena-hk";
const serviceAliases = new Map([
  ["object-storage", "object-storage"],
  ["object", "object-storage"],
  ["storage", "object-storage"],
  ["job-queue", "job-queue"],
  ["jobs", "job-queue"],
  ["queue", "job-queue"],
  ["observability", "observability"],
  ["monitoring", "observability"],
  ["alerts", "observability"]
]);

const serviceDefinitions = {
  "object-storage": {
    label: "Managed object storage",
    required: [
      "SENA_OBJECT_STORAGE_ADAPTER",
      "SENA_OBJECT_STORAGE_ENDPOINT",
      "SENA_OBJECT_STORAGE_BUCKET",
      "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
      "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY"
    ],
    optional: [
      "SENA_OBJECT_STORAGE_REGION",
      "SENA_OBJECT_STORAGE_PREFIX",
      "SENA_OBJECT_STORAGE_TIMEOUT_MS",
      "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
      "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
      "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN"
    ],
    strict: [
      ["SENA_OBJECT_STORAGE_CONTRACT_REQUIRED", "1"],
      ["SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED", "1"]
    ],
    verifyCommands: [
      "npm run sena:object-storage:contract -- --output output/production-evidence/object-storage-contract.json",
      "npm run sena:object-storage:verify -- --output output/production-evidence/object-storage-probe.json"
    ]
  },
  "job-queue": {
    label: "Managed server job queue",
    required: [
      "SENA_JOB_QUEUE_ADAPTER",
      "SENA_JOB_QUEUE_URL",
      "SENA_JOB_QUEUE_SECRET"
    ],
    optional: [
      "SENA_JOB_QUEUE_PROVIDER_URL",
      "SENA_JOB_QUEUE_PROVIDER_TOKEN",
      "SENA_JOB_QUEUE_NAME",
      "SENA_JOB_QUEUE_TIMEOUT_MS",
      "SENA_JOB_QUEUE_MAX_ATTEMPTS",
      "SENA_JOB_WORKER_RUNTIME",
      "SENA_JOB_WORKER_CALLBACK_URL",
      "SENA_JOB_WORKER_RUNBOOK_URL",
      "SENA_JOB_WORKER_OWNER"
    ],
    strict: [
      ["SENA_JOB_QUEUE_CONTRACT_REQUIRED", "1"],
      ["SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED", "1"],
      ["SENA_REQUIRE_ASYNC_HEAVY_JOBS", "1"]
    ],
    verifyCommands: [
      "npm run sena:jobs:queue-contract -- --output output/production-evidence/server-job-queue-contract.json",
      "npm run sena:jobs:queue-verify -- --output output/production-evidence/server-job-queue-probe.json",
      "npm run sena:jobs:worker-contract -- --output output/production-evidence/server-job-worker-contract.json"
    ]
  },
  observability: {
    label: "Observability and alerting",
    required: [
      "SENA_ALERTING_OWNER",
      "SENA_ALERT_WEBHOOK_URL",
      "SENA_ALERT_WEBHOOK_SECRET",
      "SENA_OBSERVABILITY_PROVIDER",
      "SENA_OBSERVABILITY_EXPORTER_URL",
      "SENA_OBSERVABILITY_EXPORTER_SECRET",
      "SENA_OBSERVABILITY_DASHBOARD_URL",
      "SENA_OBSERVABILITY_RUNBOOK_URL"
    ],
    optional: [
      "SENA_OBSERVABILITY_OWNER",
      "SENA_OBSERVABILITY_WEBHOOK_URL",
      "SENA_OBSERVABILITY_WEBHOOK_SECRET",
      "SENA_OBSERVABILITY_EXPORTER_TOKEN",
      "SENA_ALERTING_CHANNEL",
      "SENA_ALERTING_RUNBOOK_URL",
      "SENA_ALERT_WEBHOOK_TIMEOUT_MS",
      "SENA_OBSERVABILITY_TIMEOUT_MS",
      "SENA_OBSERVABILITY_SLO_P95_MS",
      "SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT",
      "SENA_OBSERVABILITY_SLOW_REQUEST_MS"
    ],
    strict: [
      ["SENA_OBSERVABILITY_REQUIRED", "1"],
      ["SENA_OBSERVABILITY_CONTRACT_REQUIRED", "1"],
      ["SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED", "1"]
    ],
    verifyCommands: [
      "npm run sena:observability:contract -- --output output/production-evidence/observability-contract.json",
      "npm run sena:observability:verify -- --output output/production-evidence/observability-probe.json"
    ]
  }
};

function parseArgs(argv) {
  const options = {
    domain: defaultDomain,
    environment: "production",
    envFile: ".env.local",
    scope: process.env.VERCEL_SCOPE,
    project: process.env.VERCEL_PROJECT_NAME || defaultProject,
    services: ["object-storage", "job-queue", "observability"],
    yes: false,
    deploy: false,
    strictProduction: false,
    envJsonStdin: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--yes") options.yes = true;
    else if (arg === "--deploy") options.deploy = true;
    else if (arg === "--strict-production") options.strictProduction = true;
    else if (arg === "--env-json-stdin") options.envJsonStdin = true;
    else if (arg === "--domain") options.domain = normalizeDomain(next());
    else if (arg === "--env") options.environment = next();
    else if (arg === "--local-env-file" || arg === "--env-file") options.envFile = next();
    else if (arg === "--scope") options.scope = next();
    else if (arg === "--project") options.project = next();
    else if (arg === "--services") options.services = parseServices(next());
    else if (arg === "--help" || arg === "-h") {
      printHelp(options);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function normalizeDomain(value) {
  return normalizeUrl(value).replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

function appUrlFromDomain(value) {
  return `https://${normalizeDomain(value)}`;
}

function parseServices(raw) {
  if (raw === "all") return ["object-storage", "job-queue", "observability"];
  const services = raw
    .split(",")
    .map((entry) => serviceAliases.get(entry.trim()) ?? entry.trim())
    .filter(Boolean);
  const unknown = services.filter((entry) => !(entry in serviceDefinitions));
  if (unknown.length) throw new Error(`Unknown service(s): ${unknown.join(", ")}.`);
  return [...new Set(services)];
}

function printHelp(options) {
  console.log(`Configure SENA Vercel production services beyond Neon.

Usage:
  npm run sena:vercel:production-services:configure -- --yes [options]

Options:
  --services <list>        all, object-storage, job-queue, observability. Default: all.
  --env <name>             Vercel environment. Default: production.
  --local-env-file <path>  Local env file to read if process env lacks values. Default: ${options.envFile}
  --env-json-stdin         Read an env-name JSON object from stdin.
  --scope <team-slug>      Vercel team scope. Defaults to VERCEL_SCOPE or linked project scope.
  --project <name>         Expected Vercel project name before writing env. Default: ${defaultProject}
  --strict-production      Add live-probe and async-heavy-job required flags.
  --deploy                 Trigger a Vercel production deploy after env configuration.
  --yes                    Actually write Vercel env changes. Without this, prints a dry run.

Secret handling:
  Values are read from process env, optional JSON stdin, or the local env file.
  Env values, URLs, bucket names, and secrets are never printed.
  For Cloudflare R2, the script can derive canonical SENA_OBJECT_STORAGE_* env
  from R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.
  For Vercel Blob, it can derive SENA_OBJECT_STORAGE_ADAPTER=vercel-blob
  from BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID, preserving OIDC/read-write-token auth.
  For Upstash QStash, the script can derive SENA_JOB_QUEUE_ADAPTER=qstash,
  SENA_JOB_QUEUE_PROVIDER_URL, and SENA_JOB_QUEUE_PROVIDER_TOKEN from
  QSTASH_URL and QSTASH_TOKEN while keeping the SENA worker HMAC secret separate.
  For generic observability collectors, it can normalize OBSERVABILITY_* and
  ALERTING_* aliases into canonical SENA_OBSERVABILITY_* and SENA_ALERT_* env.

Safer shell pattern:
  printf '%s\\n' '{"SENA_OBJECT_STORAGE_ADAPTER":"r2","...":"..."}' \\
    | npm run sena:vercel:production-services:configure -- --env-json-stdin --yes --scope <team-slug>`);
}

function parseEnvFile(filePath) {
  const entries = new Map();
  if (!existsSync(filePath)) return entries;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) entries.set(key, value);
  }
  return entries;
}

function parseJsonStdin(enabled) {
  if (!enabled) return new Map();
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) return new Map();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--env-json-stdin expects a JSON object keyed by env var name.");
  }
  return new Map(
    Object.entries(parsed)
      .filter(([key, value]) => /^[A-Z][A-Z0-9_]*$/.test(key) && value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

function placeholderValue(value) {
  return value === "..." || /<[^>\r\n]+>/.test(value);
}

function usableEnvValue(value) {
  const trimmed = value?.trim();
  return trimmed && !placeholderValue(trimmed) ? trimmed : undefined;
}

function resolveEnvValues(options) {
  const jsonEnv = parseJsonStdin(options.envJsonStdin);
  const fileEnv = parseEnvFile(resolve(process.cwd(), options.envFile));
  const values = new Map();
  const sources = new Map();
  const selectedDefinitions = options.services.map((service) => serviceDefinitions[service]);
  const keys = new Set([
    ...selectedDefinitions.flatMap((definition) => definition.required),
    ...selectedDefinitions.flatMap((definition) => definition.optional)
  ]);

  const sourceValue = (candidateKeys) => {
    for (const key of candidateKeys) {
      const jsonValue = usableEnvValue(jsonEnv.get(key));
      const processValue = usableEnvValue(process.env[key]);
      const fileValue = usableEnvValue(fileEnv.get(key));
      if (jsonValue) return { key, value: jsonValue, source: "stdin-json" };
      if (processValue) return { key, value: processValue, source: "process-env" };
      if (fileValue) return { key, value: fileValue, source: options.envFile };
    }
    return undefined;
  };

  for (const key of keys) {
    const resolved = sourceValue([key]);
    if (resolved) {
      values.set(key, resolved.value);
      sources.set(key, resolved.source);
    }
  }

  if (options.services.includes("object-storage")) {
    const vercelBlobSignal = sourceValue([
      "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
      "BLOB_READ_WRITE_TOKEN",
      "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
      "BLOB_STORE_ID",
      "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN",
      "VERCEL_OIDC_TOKEN"
    ]);
    const r2Signal = sourceValue([
      "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
      "R2_ACCOUNT_ID",
      "CLOUDFLARE_R2_ACCOUNT_ID",
      "R2_ENDPOINT",
      "CLOUDFLARE_R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "CLOUDFLARE_R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
    ]);
    if (!values.has("SENA_OBJECT_STORAGE_ADAPTER")) {
      if (r2Signal) {
        values.set("SENA_OBJECT_STORAGE_ADAPTER", "r2");
        sources.set("SENA_OBJECT_STORAGE_ADAPTER", `derived-from-${r2Signal.key}`);
      } else if (vercelBlobSignal) {
        values.set("SENA_OBJECT_STORAGE_ADAPTER", "vercel-blob");
        sources.set("SENA_OBJECT_STORAGE_ADAPTER", `derived-from-${vercelBlobSignal.key}`);
      }
    }
    const objectStorageAdapter = values.get("SENA_OBJECT_STORAGE_ADAPTER")?.toLowerCase().replace(/_/g, "-");
    if (objectStorageAdapter === "vercel-blob") {
      const blobToken = sourceValue(["SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN", "BLOB_READ_WRITE_TOKEN"]);
      if (!values.has("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN") && blobToken) {
        values.set("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN", blobToken.value);
        sources.set("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN", blobToken.key);
      }
      const blobStoreId = sourceValue(["SENA_OBJECT_STORAGE_BLOB_STORE_ID", "BLOB_STORE_ID"]);
      if (!values.has("SENA_OBJECT_STORAGE_BLOB_STORE_ID") && blobStoreId) {
        values.set("SENA_OBJECT_STORAGE_BLOB_STORE_ID", blobStoreId.value);
        sources.set("SENA_OBJECT_STORAGE_BLOB_STORE_ID", blobStoreId.key);
      }
      const blobOidcToken = sourceValue(["SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN", "VERCEL_OIDC_TOKEN"]);
      if (!values.has("SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN") && blobOidcToken) {
        values.set("SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN", blobOidcToken.value);
        sources.set("SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN", blobOidcToken.key);
      }
    }
    if (!values.has("SENA_OBJECT_STORAGE_ENDPOINT") && objectStorageAdapter !== "vercel-blob") {
      const explicitEndpoint = sourceValue(["R2_ENDPOINT", "CLOUDFLARE_R2_ENDPOINT"]);
      const account = sourceValue(["SENA_OBJECT_STORAGE_R2_ACCOUNT_ID", "R2_ACCOUNT_ID", "CLOUDFLARE_R2_ACCOUNT_ID"]);
      if (explicitEndpoint) {
        values.set("SENA_OBJECT_STORAGE_ENDPOINT", explicitEndpoint.value);
        sources.set("SENA_OBJECT_STORAGE_ENDPOINT", explicitEndpoint.key);
      } else if (account && /^[a-zA-Z0-9_-]+$/.test(account.value)) {
        values.set("SENA_OBJECT_STORAGE_ENDPOINT", `https://${account.value}.r2.cloudflarestorage.com`);
        sources.set("SENA_OBJECT_STORAGE_ENDPOINT", `derived-from-${account.key}`);
      }
    }
    const bucket = sourceValue(["R2_BUCKET_NAME", "R2_BUCKET", "CLOUDFLARE_R2_BUCKET_NAME"]);
    if (!values.has("SENA_OBJECT_STORAGE_BUCKET") && bucket && objectStorageAdapter !== "vercel-blob") {
      values.set("SENA_OBJECT_STORAGE_BUCKET", bucket.value);
      sources.set("SENA_OBJECT_STORAGE_BUCKET", bucket.key);
    }
    const accessKey = sourceValue(["R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID"]);
    if (!values.has("SENA_OBJECT_STORAGE_ACCESS_KEY_ID") && accessKey && objectStorageAdapter !== "vercel-blob") {
      values.set("SENA_OBJECT_STORAGE_ACCESS_KEY_ID", accessKey.value);
      sources.set("SENA_OBJECT_STORAGE_ACCESS_KEY_ID", accessKey.key);
    }
    const secretKey = sourceValue(["R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY"]);
    if (!values.has("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY") && secretKey && objectStorageAdapter !== "vercel-blob") {
      values.set("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY", secretKey.value);
      sources.set("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY", secretKey.key);
    }
    if (!values.has("SENA_OBJECT_STORAGE_REGION") && values.get("SENA_OBJECT_STORAGE_ADAPTER") === "r2") {
      values.set("SENA_OBJECT_STORAGE_REGION", "auto");
      sources.set("SENA_OBJECT_STORAGE_REGION", "derived-r2-default");
    }
  }

  if (options.services.includes("job-queue")) {
    const qstashSignal = sourceValue([
      "SENA_JOB_QUEUE_PROVIDER_TOKEN",
      "QSTASH_TOKEN",
      "UPSTASH_QSTASH_TOKEN",
      "SENA_JOB_QUEUE_PROVIDER_URL",
      "QSTASH_URL",
      "UPSTASH_QSTASH_URL",
      "SENA_JOB_QUEUE_NAME",
      "QSTASH_QUEUE_NAME",
      "UPSTASH_QSTASH_QUEUE_NAME"
    ]);
    if (!values.has("SENA_JOB_QUEUE_ADAPTER") && qstashSignal) {
      values.set("SENA_JOB_QUEUE_ADAPTER", "qstash");
      sources.set("SENA_JOB_QUEUE_ADAPTER", `derived-from-${qstashSignal.key}`);
    }

    const queueAdapter = values.get("SENA_JOB_QUEUE_ADAPTER")?.toLowerCase().replace(/_/g, "-");
    if (queueAdapter === "qstash") {
      const providerUrl = sourceValue([
        "SENA_JOB_QUEUE_PROVIDER_URL",
        "QSTASH_URL",
        "UPSTASH_QSTASH_URL"
      ]);
      if (!values.has("SENA_JOB_QUEUE_PROVIDER_URL")) {
        values.set("SENA_JOB_QUEUE_PROVIDER_URL", providerUrl?.value ?? "https://qstash.upstash.io");
        sources.set("SENA_JOB_QUEUE_PROVIDER_URL", providerUrl?.key ?? "derived-qstash-default");
      }
      const providerToken = sourceValue([
        "SENA_JOB_QUEUE_PROVIDER_TOKEN",
        "QSTASH_TOKEN",
        "UPSTASH_QSTASH_TOKEN"
      ]);
      if (!values.has("SENA_JOB_QUEUE_PROVIDER_TOKEN") && providerToken) {
        values.set("SENA_JOB_QUEUE_PROVIDER_TOKEN", providerToken.value);
        sources.set("SENA_JOB_QUEUE_PROVIDER_TOKEN", providerToken.key);
      }
      const queueName = sourceValue([
        "SENA_JOB_QUEUE_NAME",
        "QSTASH_QUEUE_NAME",
        "UPSTASH_QSTASH_QUEUE_NAME"
      ]);
      if (!values.has("SENA_JOB_QUEUE_NAME") && queueName) {
        values.set("SENA_JOB_QUEUE_NAME", queueName.value);
        sources.set("SENA_JOB_QUEUE_NAME", queueName.key);
      }
    }
  }

  if (options.services.includes("observability")) {
    const observabilitySignal = sourceValue([
      "SENA_OBSERVABILITY_PROVIDER",
      "SENA_OBSERVABILITY_EXPORTER_URL",
      "SENA_OBSERVABILITY_WEBHOOK_URL",
      "OBSERVABILITY_WEBHOOK_URL",
      "OBSERVABILITY_EXPORTER_URL",
      "SENA_OBSERVABILITY_EXPORTER_SECRET",
      "SENA_OBSERVABILITY_WEBHOOK_SECRET",
      "SENA_OBSERVABILITY_EXPORTER_TOKEN",
      "OBSERVABILITY_WEBHOOK_SECRET",
      "OBSERVABILITY_EXPORTER_SECRET",
      "OBSERVABILITY_EXPORTER_TOKEN"
    ]);
    if (!values.has("SENA_OBSERVABILITY_PROVIDER") && observabilitySignal) {
      values.set("SENA_OBSERVABILITY_PROVIDER", "generic-webhook");
      sources.set("SENA_OBSERVABILITY_PROVIDER", `derived-from-${observabilitySignal.key}`);
    }

    const exporterUrl = sourceValue([
      "SENA_OBSERVABILITY_EXPORTER_URL",
      "SENA_OBSERVABILITY_WEBHOOK_URL",
      "OBSERVABILITY_WEBHOOK_URL",
      "OBSERVABILITY_EXPORTER_URL"
    ]);
    if (!values.has("SENA_OBSERVABILITY_EXPORTER_URL") && exporterUrl) {
      values.set("SENA_OBSERVABILITY_EXPORTER_URL", exporterUrl.value);
      sources.set("SENA_OBSERVABILITY_EXPORTER_URL", exporterUrl.key);
    }
    const exporterSecret = sourceValue([
      "SENA_OBSERVABILITY_EXPORTER_SECRET",
      "SENA_OBSERVABILITY_WEBHOOK_SECRET",
      "SENA_OBSERVABILITY_EXPORTER_TOKEN",
      "OBSERVABILITY_WEBHOOK_SECRET",
      "OBSERVABILITY_EXPORTER_SECRET",
      "OBSERVABILITY_EXPORTER_TOKEN"
    ]);
    if (!values.has("SENA_OBSERVABILITY_EXPORTER_SECRET") && exporterSecret) {
      values.set("SENA_OBSERVABILITY_EXPORTER_SECRET", exporterSecret.value);
      sources.set("SENA_OBSERVABILITY_EXPORTER_SECRET", exporterSecret.key);
    }
    const dashboardUrl = sourceValue([
      "SENA_OBSERVABILITY_DASHBOARD_URL",
      "OBSERVABILITY_DASHBOARD_URL"
    ]);
    if (!values.has("SENA_OBSERVABILITY_DASHBOARD_URL") && dashboardUrl) {
      values.set("SENA_OBSERVABILITY_DASHBOARD_URL", dashboardUrl.value);
      sources.set("SENA_OBSERVABILITY_DASHBOARD_URL", dashboardUrl.key);
    }
    const runbookUrl = sourceValue([
      "SENA_OBSERVABILITY_RUNBOOK_URL",
      "OBSERVABILITY_RUNBOOK_URL",
      "SENA_ALERTING_RUNBOOK_URL",
      "ALERTING_RUNBOOK_URL"
    ]);
    if (!values.has("SENA_OBSERVABILITY_RUNBOOK_URL") && runbookUrl) {
      values.set("SENA_OBSERVABILITY_RUNBOOK_URL", runbookUrl.value);
      sources.set("SENA_OBSERVABILITY_RUNBOOK_URL", runbookUrl.key);
    }
    if (!values.has("SENA_ALERTING_RUNBOOK_URL") && runbookUrl) {
      values.set("SENA_ALERTING_RUNBOOK_URL", runbookUrl.value);
      sources.set("SENA_ALERTING_RUNBOOK_URL", runbookUrl.key);
    }
    const owner = sourceValue([
      "SENA_ALERTING_OWNER",
      "SENA_OBSERVABILITY_OWNER",
      "ALERTING_OWNER",
      "OBSERVABILITY_OWNER"
    ]);
    if (!values.has("SENA_ALERTING_OWNER") && owner) {
      values.set("SENA_ALERTING_OWNER", owner.value);
      sources.set("SENA_ALERTING_OWNER", owner.key);
    }
    if (!values.has("SENA_OBSERVABILITY_OWNER") && owner) {
      values.set("SENA_OBSERVABILITY_OWNER", owner.value);
      sources.set("SENA_OBSERVABILITY_OWNER", owner.key);
    }
    const alertUrl = sourceValue([
      "SENA_ALERT_WEBHOOK_URL",
      "SENA_ALERTING_WEBHOOK_URL",
      "ALERT_WEBHOOK_URL",
      "ALERTS_WEBHOOK_URL",
      "OBSERVABILITY_ALERT_WEBHOOK_URL"
    ]);
    if (!values.has("SENA_ALERT_WEBHOOK_URL") && alertUrl) {
      values.set("SENA_ALERT_WEBHOOK_URL", alertUrl.value);
      sources.set("SENA_ALERT_WEBHOOK_URL", alertUrl.key);
    }
    const alertSecret = sourceValue([
      "SENA_ALERT_WEBHOOK_SECRET",
      "SENA_ALERTING_WEBHOOK_SECRET",
      "SENA_ALERT_WEBHOOK_SIGNING_SECRET",
      "ALERT_WEBHOOK_SECRET",
      "ALERTS_WEBHOOK_SECRET",
      "OBSERVABILITY_ALERT_WEBHOOK_SECRET"
    ]);
    if (!values.has("SENA_ALERT_WEBHOOK_SECRET") && alertSecret) {
      values.set("SENA_ALERT_WEBHOOK_SECRET", alertSecret.value);
      sources.set("SENA_ALERT_WEBHOOK_SECRET", alertSecret.key);
    }
  }

  if (options.strictProduction) {
    for (const definition of selectedDefinitions) {
      for (const [key, value] of definition.strict) {
        values.set(key, value);
        sources.set(key, "--strict-production");
      }
    }
    values.set("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
    sources.set("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "--strict-production");
  }

  return { values, sources };
}

function missingRequired(options, values) {
  return options.services.flatMap((service) => {
    if (service === "object-storage") {
      const adapter = values.get("SENA_OBJECT_STORAGE_ADAPTER")?.toLowerCase().replace(/_/g, "-");
      const missing = [];
      if (!values.get("SENA_OBJECT_STORAGE_ADAPTER")) missing.push("SENA_OBJECT_STORAGE_ADAPTER");
      if (adapter === "vercel-blob") {
        if (!values.get("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN") &&
          !(values.get("SENA_OBJECT_STORAGE_BLOB_STORE_ID") && values.get("SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN"))) {
          missing.push("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN|BLOB_READ_WRITE_TOKEN|SENA_OBJECT_STORAGE_BLOB_STORE_ID+SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN");
        }
      } else {
        if (!values.get("SENA_OBJECT_STORAGE_ENDPOINT")) missing.push("SENA_OBJECT_STORAGE_ENDPOINT");
        if (!values.get("SENA_OBJECT_STORAGE_BUCKET")) missing.push("SENA_OBJECT_STORAGE_BUCKET");
        if (!values.get("SENA_OBJECT_STORAGE_ACCESS_KEY_ID")) missing.push("SENA_OBJECT_STORAGE_ACCESS_KEY_ID");
        if (!values.get("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY")) missing.push("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY");
      }
      return missing.map((key) => `${service}:${key}`);
    }
    if (service === "job-queue") {
      const adapter = values.get("SENA_JOB_QUEUE_ADAPTER")?.toLowerCase().replace(/_/g, "-");
      const missing = [];
      if (!values.get("SENA_JOB_QUEUE_ADAPTER")) missing.push("SENA_JOB_QUEUE_ADAPTER");
      if (!values.get("SENA_JOB_QUEUE_SECRET")) missing.push("SENA_JOB_QUEUE_SECRET");
      if (adapter === "qstash") {
        if (!values.get("SENA_JOB_QUEUE_PROVIDER_URL")) missing.push("SENA_JOB_QUEUE_PROVIDER_URL");
        if (!values.get("SENA_JOB_QUEUE_PROVIDER_TOKEN")) missing.push("SENA_JOB_QUEUE_PROVIDER_TOKEN|QSTASH_TOKEN");
        if (!values.get("SENA_JOB_WORKER_CALLBACK_URL") && !values.get("SENA_JOB_QUEUE_URL")) {
          missing.push("SENA_JOB_WORKER_CALLBACK_URL|SENA_JOB_QUEUE_URL");
        }
      } else if (!values.get("SENA_JOB_QUEUE_URL")) {
        missing.push("SENA_JOB_QUEUE_URL");
      }
      return missing.map((key) => `${service}:${key}`);
    }
    const definition = serviceDefinitions[service];
    return definition.required
      .filter((key) => !values.get(key))
      .map((key) => `${service}:${key}`);
  });
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function vercelArgs(options, args) {
  return options.scope ? [...args, "--scope", options.scope] : args;
}

function redactOutput(output, values) {
  let redacted = output;
  for (const value of values) {
    if (value && value.length > 2) redacted = redacted.split(value).join("[redacted]");
  }
  return redacted
    .split(/\r?\n/)
    .filter((line) => !/postgres:\/\/|postgresql:\/\/|https?:\/\/|secret|password|token/i.test(line))
    .join("\n")
    .trim();
}

function parseJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function normalizedHost(value) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function deploymentAliases(value) {
  if (!Array.isArray(value?.aliases)) return [];
  return value.aliases
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.alias === "string") return entry.alias;
      if (entry && typeof entry === "object" && typeof entry.domain === "string") return entry.domain;
      return undefined;
    })
    .filter(Boolean);
}

function assertVercelAvailable() {
  const result = run("vercel", ["--version"]);
  if (result.status !== 0) {
    throw new Error("Vercel CLI is not available. Install it with npm install -g vercel.");
  }
}

function assertVercelWriteCustody(options, values) {
  const inspect = run("vercel", vercelArgs(options, ["inspect", options.domain, "--format", "json"]));
  const inspectJson = parseJson(`${inspect.stdout}\n${inspect.stderr}`);
  const projectName = typeof inspectJson?.name === "string" ? inspectJson.name : undefined;
  const readyState = typeof inspectJson?.readyState === "string" ? inspectJson.readyState : undefined;
  const target = typeof inspectJson?.target === "string" ? inspectJson.target : undefined;
  const aliasMatched = deploymentAliases(inspectJson).some((alias) => normalizedHost(alias) === normalizedHost(options.domain));
  if (inspect.status !== 0) {
    throw new Error(`Vercel custody check failed before writing provider env: deployment-inspect-failed (${redactOutput(`${inspect.stdout}\n${inspect.stderr}`, values) || "no-output"}).`);
  }
  if (projectName !== options.project) {
    throw new Error(`Vercel custody check failed before writing provider env: project-name-mismatch expected=${options.project} actual=${projectName ?? "missing"}.`);
  }
  if (readyState !== "READY" || target !== "production") {
    throw new Error(`Vercel custody check failed before writing provider env: deployment-not-production-ready readyState=${readyState ?? "missing"} target=${target ?? "missing"}.`);
  }

  const domainInspect = run("vercel", vercelArgs(options, ["domains", "inspect", options.domain]));
  if (domainInspect.status !== 0 && !aliasMatched) {
    throw new Error(`Vercel custody check failed before writing provider env: domain-not-bound (${redactOutput(`${domainInspect.stdout}\n${domainInspect.stderr}`, values) || "no-output"}).`);
  }

  const envList = run("vercel", vercelArgs(options, ["env", "ls", options.environment]));
  if (envList.status !== 0) {
    throw new Error(`Vercel custody check failed before writing provider env: env-list-unreadable (${redactOutput(`${envList.stdout}\n${envList.stderr}`, values) || "no-output"}).`);
  }

  return {
    projectName,
    domainStatus: domainInspect.status === 0 ? "domain-inspect-pass" : "deployment-alias-pass"
  };
}

function upsertVercelEnv(options, key, value, allValues) {
  const addArgs = vercelArgs(options, ["env", "add", key, options.environment]);
  const add = run("vercel", addArgs, `${value}\n`);
  if (add.status === 0) return "added";
  const combined = `${add.stdout}\n${add.stderr}`;
  if (!/already exists|exists/i.test(combined)) {
    throw new Error(`Failed to add ${key}: ${redactOutput(combined, allValues)}`);
  }
  const removeArgs = vercelArgs(options, ["env", "rm", key, options.environment, "-y"]);
  const remove = run("vercel", removeArgs);
  if (remove.status !== 0) {
    throw new Error(`Failed to replace existing ${key}: ${redactOutput(`${remove.stdout}\n${remove.stderr}`, allValues)}`);
  }
  const retry = run("vercel", addArgs, `${value}\n`);
  if (retry.status !== 0) {
    throw new Error(`Failed to re-add ${key}: ${redactOutput(`${retry.stdout}\n${retry.stderr}`, allValues)}`);
  }
  return "replaced";
}

function deployProduction(options, values) {
  const result = run("vercel", vercelArgs(options, ["deploy", "--prod", "-y", "--no-wait"]));
  if (result.status !== 0) {
    throw new Error(`Vercel production deploy failed: ${redactOutput(`${result.stdout}\n${result.stderr}`, values)}`);
  }
  return redactOutput(result.stdout, values);
}

function plannedKeys(options, values) {
  const selectedDefinitions = options.services.map((service) => serviceDefinitions[service]);
  const keys = new Set([
    ...selectedDefinitions.flatMap((definition) => definition.required),
    ...selectedDefinitions.flatMap((definition) => definition.optional)
  ]);
  if (options.strictProduction) {
    for (const definition of selectedDefinitions) {
      for (const [key] of definition.strict) keys.add(key);
    }
    keys.add("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH");
  }
  return [...keys].filter((key) => values.has(key)).sort();
}

function verificationPlan(options) {
  const scope = options.scope ? ` --scope ${options.scope}` : "";
  const scopeValue = options.scope ?? "<team-slug>";
  const evidenceDir = "output/production-evidence/<release-id>";
  const appUrl = appUrlFromDomain(options.domain);
  return [
    `npm run sena:vercel:preflight -- --scope ${scopeValue} --output output/production-evidence/vercel-production-preflight.json`,
    ...options.services.flatMap((service) => serviceDefinitions[service].verifyCommands),
    `npm run sena:production-evidence:archive -- --output-dir ${evidenceDir} --vercel-scope ${scopeValue}`,
    `npm run sena:production-env:packet -- --domain ${appUrl} --scope ${scopeValue} --preflight output/production-evidence/vercel-production-preflight.json --archive ${evidenceDir}/sena-production-evidence-archive.json --output output/production-evidence/production-runtime-env-packet.json`,
    `npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-runtime-env-packet.json --scope ${scopeValue}`,
    `npm run sena:production:gate -- --domain ${appUrl} --scope ${scopeValue} --manifest output/production-evidence/sena-enterprise-production-evidence-manifest.json --preflight output/production-evidence/vercel-production-preflight.json --archive ${evidenceDir}/sena-production-evidence-archive.json --output output/production-evidence/production-go-live-gate.json`,
    `npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-go-live-gate.json --scope ${scopeValue}`,
    `npm run sena:production-evidence:bind -- --artifact ${evidenceDir}/sena-production-evidence-archive.json --scope ${scopeValue}`,
    `vercel inspect ${options.domain}${scope}`
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { values, sources } = resolveEnvValues(options);
  const missing = missingRequired(options, values);
  const keys = plannedKeys(options, values);

  console.log("SENA Vercel production services configuration plan");
  console.log(`  domain=${options.domain}`);
  console.log(`  vercelEnvironment=${options.environment}`);
  console.log(`  vercelScope=${options.scope ?? "linked-project-default"}`);
  console.log(`  vercelProject=${options.project}`);
  console.log(`  services=${options.services.join(",")}`);
  console.log(`  deploy=${options.deploy}`);
  console.log(`  strictProduction=${options.strictProduction}`);
  console.log("  env:");
  for (const key of keys) {
    console.log(`    ${key}=configured(redacted) source=${sources.get(key) ?? "unknown"}`);
  }
  for (const entry of missing) {
    const [, key] = entry.split(":");
    console.log(`    ${key}=missing`);
  }

  if (missing.length) {
    throw new Error(`Missing required SENA production service env: ${missing.join(", ")}.`);
  }
  if (!options.yes) {
    console.log("Dry run only. Re-run with --yes to write these values to Vercel.");
    console.log("Next verification commands after a real write:");
    for (const command of verificationPlan(options)) console.log(`  ${command}`);
    return;
  }

  assertVercelAvailable();
  const allValues = [...values.values()];
  const custody = assertVercelWriteCustody(options, allValues);
  console.log(`  vercelProjectCustody=pass project=${custody.projectName} domain=${custody.domainStatus}`);
  for (const key of keys) {
    const action = upsertVercelEnv(options, key, values.get(key), allValues);
    console.log(`  ${key}=${action}`);
  }
  if (options.deploy) {
    console.log("  deploymentUrl:");
    console.log(deployProduction(options, allValues));
  }
  console.log("SENA Vercel production services configuration complete. Secret values were not printed.");
  console.log("Next verification commands:");
  for (const command of verificationPlan(options)) console.log(`  ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
