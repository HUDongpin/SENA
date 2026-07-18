import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scriptPath = "scripts/configure-sena-vercel-production-services.mjs";
const fakeEnv = {
  SENA_OBJECT_STORAGE_ADAPTER: "r2",
  SENA_OBJECT_STORAGE_ENDPOINT: "https://secret-r2.example.com",
  SENA_OBJECT_STORAGE_BUCKET: "sena-secret-bucket",
  SENA_OBJECT_STORAGE_ACCESS_KEY_ID: "secret-access-key-id",
  SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-object-storage-key",
  SENA_JOB_QUEUE_ADAPTER: "webhook",
  SENA_JOB_QUEUE_URL: "https://queue-secret.example.com/jobs",
  SENA_JOB_QUEUE_SECRET: "secret-queue-key",
  SENA_JOB_WORKER_RUNTIME: "node-worker",
  SENA_JOB_WORKER_CALLBACK_URL: "https://worker-secret.example.com/callback",
  SENA_JOB_WORKER_RUNBOOK_URL: "https://runbook-secret.example.com/jobs",
  SENA_JOB_WORKER_OWNER: "sena-ops-owner",
  SENA_ALERTING_OWNER: "sena-alert-owner",
  SENA_ALERT_WEBHOOK_URL: "https://alert-secret.example.com/hook",
  SENA_ALERT_WEBHOOK_SECRET: "secret-alert-key",
  SENA_OBSERVABILITY_PROVIDER: "generic-webhook",
  SENA_OBSERVABILITY_EXPORTER_URL: "https://observability-secret.example.com/export",
  SENA_OBSERVABILITY_EXPORTER_SECRET: "secret-observability-key",
  SENA_OBSERVABILITY_DASHBOARD_URL: "https://dashboard-secret.example.com/sena",
  SENA_OBSERVABILITY_RUNBOOK_URL: "https://runbook-secret.example.com/observability"
};
const fakeR2Env = {
  R2_ACCOUNT_ID: "secret-r2-account-id",
  R2_BUCKET_NAME: "secret-r2-bucket",
  R2_ACCESS_KEY_ID: "secret-r2-access-key-id",
  R2_SECRET_ACCESS_KEY: "secret-r2-access-key"
};
const fakeVercelBlobEnv = {
  BLOB_READ_WRITE_TOKEN: "secret-vercel-blob-token",
  BLOB_STORE_ID: "store_secret_vercel_blob"
};
const fakeQstashEnv = {
  QSTASH_TOKEN: "secret-qstash-token",
  QSTASH_QUEUE_NAME: "secret-qstash-queue",
  SENA_JOB_WORKER_CALLBACK_URL: "https://worker-secret.example.com/api/sena/ops/jobs",
  SENA_JOB_QUEUE_SECRET: "secret-qstash-sena-hmac"
};
const fakeObservabilityAliasEnv = {
  OBSERVABILITY_OWNER: "secret-observability-owner",
  OBSERVABILITY_WEBHOOK_URL: "https://observability-alias-secret.example.com/export",
  OBSERVABILITY_WEBHOOK_SECRET: "secret-observability-alias-key",
  OBSERVABILITY_DASHBOARD_URL: "https://dashboard-alias-secret.example.com/sena",
  OBSERVABILITY_RUNBOOK_URL: "https://runbook-alias-secret.example.com/sena",
  ALERT_WEBHOOK_URL: "https://alert-alias-secret.example.com/hook",
  ALERT_WEBHOOK_SECRET: "secret-alert-alias-key"
};

function cleanEnv(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const env = { ...process.env };
  for (const name of [
    ...Object.keys(fakeEnv),
    ...Object.keys(fakeR2Env),
    ...Object.keys(fakeVercelBlobEnv),
    ...Object.keys(fakeQstashEnv),
    ...Object.keys(fakeObservabilityAliasEnv),
    "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCOUNT_ID",
    "R2_ENDPOINT",
    "CLOUDFLARE_R2_ENDPOINT",
    "R2_BUCKET",
    "CLOUDFLARE_R2_BUCKET_NAME",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
    "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
    "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN",
    "VERCEL_OIDC_TOKEN",
    "SENA_JOB_QUEUE_PROVIDER_URL",
    "SENA_JOB_QUEUE_PROVIDER_TOKEN",
    "SENA_JOB_QUEUE_NAME",
    "QSTASH_URL",
    "UPSTASH_QSTASH_URL",
    "UPSTASH_QSTASH_TOKEN",
    "UPSTASH_QSTASH_QUEUE_NAME",
    "SENA_OBSERVABILITY_WEBHOOK_URL",
    "SENA_OBSERVABILITY_WEBHOOK_SECRET",
    "SENA_OBSERVABILITY_EXPORTER_TOKEN",
    "OBSERVABILITY_EXPORTER_URL",
    "OBSERVABILITY_EXPORTER_SECRET",
    "OBSERVABILITY_EXPORTER_TOKEN",
    "SENA_ALERTING_WEBHOOK_URL",
    "SENA_ALERT_WEBHOOK_SIGNING_SECRET",
    "ALERTING_OWNER",
    "ALERTING_CHANNEL",
    "ALERTING_RUNBOOK_URL",
    "ALERTS_WEBHOOK_URL",
    "ALERTS_WEBHOOK_SECRET",
    "OBSERVABILITY_ALERT_WEBHOOK_URL",
    "OBSERVABILITY_ALERT_WEBHOOK_SECRET",
    "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
    "SENA_JOB_QUEUE_CONTRACT_REQUIRED",
    "SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED",
    "SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED",
    "SENA_REQUIRE_ASYNC_HEAVY_JOBS",
    "SENA_OBSERVABILITY_REQUIRED",
    "SENA_OBSERVABILITY_CONTRACT_REQUIRED",
    "SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED",
    "VERCEL_SCOPE"
  ]) {
    delete env[name];
  }
  Object.assign(env, overrides);
  return env;
}

function runConfigure(args: string[], options: {
  env?: NodeJS.ProcessEnv;
  input?: string;
} = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? cleanEnv(),
    input: options.input
  });
}

function outputOf(result: ReturnType<typeof runConfigure>) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function expectSensitiveValuesExcluded(output: string) {
  for (const value of [
    ...Object.values(fakeEnv),
    ...Object.values(fakeR2Env),
    ...Object.values(fakeVercelBlobEnv),
    ...Object.values(fakeQstashEnv),
    ...Object.values(fakeObservabilityAliasEnv)
  ]) {
    if (value.length < 4) continue;
    expect(output).not.toContain(value);
  }
  expect(output).not.toContain("secret-r2.example.com");
  expect(output).not.toContain("queue-secret.example.com");
  expect(output).not.toContain("observability-secret.example.com");
  expect(output).not.toContain("sena-secret-bucket");
  expect(output).not.toContain("secret-object-storage-key");
  expect(output).not.toContain("secret-queue-key");
  expect(output).not.toContain("secret-observability-key");
  expect(output).not.toContain("secret-r2-account-id");
  expect(output).not.toContain("secret-r2-bucket");
  expect(output).not.toContain("secret-r2-access-key");
  expect(output).not.toContain("secret-vercel-blob-token");
  expect(output).not.toContain("store_secret_vercel_blob");
  expect(output).not.toContain("secret-qstash-token");
  expect(output).not.toContain("secret-qstash-queue");
  expect(output).not.toContain("secret-qstash-sena-hmac");
  expect(output).not.toContain("worker-secret.example.com");
  expect(output).not.toContain("observability-alias-secret.example.com");
  expect(output).not.toContain("dashboard-alias-secret.example.com");
  expect(output).not.toContain("runbook-alias-secret.example.com");
  expect(output).not.toContain("alert-alias-secret.example.com");
  expect(output).not.toContain("secret-observability-owner");
  expect(output).not.toContain("secret-observability-alias-key");
  expect(output).not.toContain("secret-alert-alias-key");
}

function writeFakeVercel(binDir: string, options: {
  projectName?: string;
  logPath?: string;
} = {}) {
  const scriptPath = path.join(binDir, "vercel");
  const projectName = options.projectName ?? "sena-hk";
  const logPath = options.logPath ?? path.join(binDir, "vercel.log");
  writeFileSync(scriptPath, `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 54.9.0"
  exit 0
fi
if [ "$1" = "inspect" ]; then
  echo '{"readyState":"READY","target":"production","name":${JSON.stringify(projectName)},"url":"deployment.example.vercel.app","aliases":["www.sena.hk"]}'
  exit 0
fi
if [ "$1" = "domains" ] && [ "$2" = "inspect" ]; then
  echo "Project Domains"
  exit 0
fi
if [ "$1" = "env" ] && [ "$2" = "ls" ]; then
  echo "name value environments created"
  exit 0
fi
if [ "$1" = "env" ] && [ "$2" = "add" ]; then
  cat >/dev/null
  exit 0
fi
echo "unexpected vercel args: $*" >&2
exit 1
`);
  chmodSync(scriptPath, 0o755);
}

describe("SENA Vercel production services configuration script", () => {
  it("dry-runs object storage, queue, and observability env writes without printing values", () => {
    const result = runConfigure(["--env-json-stdin", "--scope", "test-team", "--strict-production"], {
      input: `${JSON.stringify(fakeEnv)}\n`
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("SENA Vercel production services configuration plan");
    expect(output).toContain("services=object-storage,job-queue,observability");
    expect(output).toContain("SENA_OBJECT_STORAGE_ADAPTER=configured(redacted) source=stdin-json");
    expect(output).toContain("SENA_JOB_QUEUE_ADAPTER=configured(redacted) source=stdin-json");
    expect(output).toContain("SENA_OBSERVABILITY_PROVIDER=configured(redacted) source=stdin-json");
    expect(output).toContain("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH=configured(redacted) source=--strict-production");
    expect(output).toContain("SENA_JOB_QUEUE_CONTRACT_REQUIRED=configured(redacted) source=--strict-production");
    expect(output).toContain("SENA_OBSERVABILITY_CONTRACT_REQUIRED=configured(redacted) source=--strict-production");
    expect(output).toContain("Dry run only. Re-run with --yes to write these values to Vercel.");
    expect(output).toContain("npm run sena:vercel:preflight -- --scope test-team --output output/production-evidence/vercel-production-preflight.json");
    expect(output).toContain("npm run sena:jobs:queue-contract -- --output output/production-evidence/server-job-queue-contract.json");
    expect(output).toContain("npm run sena:observability:contract -- --output output/production-evidence/observability-contract.json");
    expect(output).toContain("npm run sena:production-evidence:archive -- --output-dir output/production-evidence/<release-id> --vercel-scope test-team");
    expect(output).toContain("npm run sena:production-env:packet -- --domain https://www.sena.hk --scope test-team --preflight output/production-evidence/vercel-production-preflight.json --archive output/production-evidence/<release-id>/sena-production-evidence-archive.json --output output/production-evidence/production-runtime-env-packet.json");
    expect(output).toContain("npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-runtime-env-packet.json --scope test-team");
    expect(output).toContain("npm run sena:production:gate -- --domain https://www.sena.hk --scope test-team --manifest output/production-evidence/sena-enterprise-production-evidence-manifest.json --preflight output/production-evidence/vercel-production-preflight.json --archive output/production-evidence/<release-id>/sena-production-evidence-archive.json --output output/production-evidence/production-go-live-gate.json");
    expect(output).toContain("npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-go-live-gate.json --scope test-team");
    expect(output).toContain("npm run sena:production-evidence:bind -- --artifact output/production-evidence/<release-id>/sena-production-evidence-archive.json --scope test-team");
    expectSensitiveValuesExcluded(output);
  });

  it("normalizes full URL domain input before building follow-up verification commands", () => {
    const result = runConfigure(["--env-json-stdin", "--scope", "test-team", "--domain", "https://www.sena.hk/"], {
      input: `${JSON.stringify(fakeEnv)}\n`
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("domain=www.sena.hk");
    expect(output).toContain("npm run sena:production-env:packet -- --domain https://www.sena.hk --scope test-team");
    expect(output).toContain("vercel inspect www.sena.hk --scope test-team");
    expect(output).not.toContain("https://https://");
    expectSensitiveValuesExcluded(output);
  });

  it("stops before Vercel writes when required service env is missing", () => {
    const result = runConfigure([
      "--services",
      "object-storage",
      "--local-env-file",
      ".env.production-services-missing",
      "--scope",
      "test-team"
    ]);
    const output = outputOf(result);

    expect(result.status).toBe(1);
    expect(output).toContain("SENA_OBJECT_STORAGE_ADAPTER=missing");
    expect(output).toContain("Missing required SENA production service env:");
    expect(output).not.toContain("SENA Vercel production services configuration complete");
  });

  it("treats unresolved template placeholders as missing production service env", () => {
    const templateEnv = {
      SENA_OBJECT_STORAGE_ADAPTER: "vercel-blob",
      BLOB_READ_WRITE_TOKEN: "<VERCEL_BLOB_READ_WRITE_TOKEN>",
      BLOB_STORE_ID: "<BLOB_STORE_ID>",
      SENA_JOB_QUEUE_ADAPTER: "qstash",
      QSTASH_TOKEN: "<UPSTASH_QSTASH_TOKEN>",
      QSTASH_QUEUE_NAME: "<QSTASH_QUEUE_NAME>",
      SENA_JOB_WORKER_CALLBACK_URL: "<APP_URL>/api/sena/ops/jobs",
      SENA_JOB_QUEUE_SECRET: "<SENA_JOB_QUEUE_SECRET>",
      SENA_ALERTING_OWNER: "<ALERT_OWNER>",
      SENA_ALERT_WEBHOOK_URL: "<ALERT_WEBHOOK_URL>",
      SENA_ALERT_WEBHOOK_SECRET: "<ALERT_WEBHOOK_SECRET>",
      SENA_OBSERVABILITY_PROVIDER: "<OBSERVABILITY_PROVIDER>",
      SENA_OBSERVABILITY_EXPORTER_URL: "<OBSERVABILITY_EXPORTER_URL>",
      SENA_OBSERVABILITY_EXPORTER_SECRET: "<OBSERVABILITY_EXPORTER_SECRET>",
      SENA_OBSERVABILITY_DASHBOARD_URL: "<OBSERVABILITY_DASHBOARD_URL>",
      SENA_OBSERVABILITY_RUNBOOK_URL: "<OBSERVABILITY_RUNBOOK_URL>"
    };
    const result = runConfigure(["--env-json-stdin", "--scope", "test-team", "--strict-production"], {
      input: `${JSON.stringify(templateEnv)}\n`
    });
    const output = outputOf(result);

    expect(result.status).toBe(1);
    expect(output).toContain("SENA_OBJECT_STORAGE_ADAPTER=configured(redacted) source=stdin-json");
    expect(output).toContain("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN|BLOB_READ_WRITE_TOKEN|SENA_OBJECT_STORAGE_BLOB_STORE_ID+SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN=missing");
    expect(output).toContain("SENA_JOB_QUEUE_PROVIDER_TOKEN|QSTASH_TOKEN=missing");
    expect(output).toContain("SENA_JOB_WORKER_CALLBACK_URL|SENA_JOB_QUEUE_URL=missing");
    expect(output).toContain("SENA_ALERT_WEBHOOK_URL=missing");
    expect(output).toContain("SENA_OBSERVABILITY_EXPORTER_URL=missing");
    expect(output).toContain("Missing required SENA production service env:");
    expect(output).not.toContain("<VERCEL_BLOB_READ_WRITE_TOKEN>");
    expect(output).not.toContain("<APP_URL>");
    expect(output).not.toContain("SENA Vercel production services configuration complete");
  });

  it("normalizes Cloudflare R2 env aliases into canonical SENA object-storage env names", () => {
    const result = runConfigure([
      "--services",
      "object-storage",
      "--scope",
      "test-team"
    ], {
      env: cleanEnv(fakeR2Env)
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("SENA_OBJECT_STORAGE_ADAPTER=configured(redacted) source=derived-from-R2_ACCOUNT_ID");
    expect(output).toContain("SENA_OBJECT_STORAGE_ENDPOINT=configured(redacted) source=derived-from-R2_ACCOUNT_ID");
    expect(output).toContain("SENA_OBJECT_STORAGE_BUCKET=configured(redacted) source=R2_BUCKET_NAME");
    expect(output).toContain("SENA_OBJECT_STORAGE_ACCESS_KEY_ID=configured(redacted) source=R2_ACCESS_KEY_ID");
    expect(output).toContain("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY=configured(redacted) source=R2_SECRET_ACCESS_KEY");
    expect(output).toContain("SENA_OBJECT_STORAGE_REGION=configured(redacted) source=derived-r2-default");
    expectSensitiveValuesExcluded(output);
  });

  it("normalizes Vercel Blob env aliases into canonical SENA object-storage env names", () => {
    const result = runConfigure([
      "--services",
      "object-storage",
      "--scope",
      "test-team"
    ], {
      env: cleanEnv(fakeVercelBlobEnv)
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("SENA_OBJECT_STORAGE_ADAPTER=configured(redacted) source=derived-from-BLOB_READ_WRITE_TOKEN");
    expect(output).toContain("SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN=configured(redacted) source=BLOB_READ_WRITE_TOKEN");
    expect(output).toContain("SENA_OBJECT_STORAGE_BLOB_STORE_ID=configured(redacted) source=BLOB_STORE_ID");
    expect(output).not.toContain("SENA_OBJECT_STORAGE_ENDPOINT=missing");
    expect(output).not.toContain("SENA_OBJECT_STORAGE_BUCKET=missing");
    expectSensitiveValuesExcluded(output);
  });

  it("normalizes Upstash QStash aliases into canonical SENA job-queue env names", () => {
    const result = runConfigure([
      "--services",
      "job-queue",
      "--scope",
      "test-team"
    ], {
      env: cleanEnv(fakeQstashEnv)
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("SENA_JOB_QUEUE_ADAPTER=configured(redacted) source=derived-from-QSTASH_TOKEN");
    expect(output).toContain("SENA_JOB_QUEUE_PROVIDER_URL=configured(redacted) source=derived-qstash-default");
    expect(output).toContain("SENA_JOB_QUEUE_PROVIDER_TOKEN=configured(redacted) source=QSTASH_TOKEN");
    expect(output).toContain("SENA_JOB_QUEUE_NAME=configured(redacted) source=QSTASH_QUEUE_NAME");
    expect(output).toContain("SENA_JOB_WORKER_CALLBACK_URL=configured(redacted) source=process-env");
    expect(output).toContain("SENA_JOB_QUEUE_SECRET=configured(redacted) source=process-env");
    expectSensitiveValuesExcluded(output);
  });

  it("normalizes generic observability aliases into canonical SENA observability and alert env names", () => {
    const result = runConfigure([
      "--services",
      "observability",
      "--local-env-file",
      ".env.production-services-alias-only",
      "--scope",
      "test-team"
    ], {
      env: cleanEnv(fakeObservabilityAliasEnv)
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("SENA_OBSERVABILITY_PROVIDER=configured(redacted) source=derived-from-OBSERVABILITY_WEBHOOK_URL");
    expect(output).toContain("SENA_OBSERVABILITY_EXPORTER_URL=configured(redacted) source=OBSERVABILITY_WEBHOOK_URL");
    expect(output).toContain("SENA_OBSERVABILITY_EXPORTER_SECRET=configured(redacted) source=OBSERVABILITY_WEBHOOK_SECRET");
    expect(output).toContain("SENA_OBSERVABILITY_DASHBOARD_URL=configured(redacted) source=OBSERVABILITY_DASHBOARD_URL");
    expect(output).toContain("SENA_OBSERVABILITY_RUNBOOK_URL=configured(redacted) source=OBSERVABILITY_RUNBOOK_URL");
    expect(output).toContain("SENA_ALERTING_OWNER=configured(redacted) source=OBSERVABILITY_OWNER");
    expect(output).toContain("SENA_ALERT_WEBHOOK_URL=configured(redacted) source=ALERT_WEBHOOK_URL");
    expect(output).toContain("SENA_ALERT_WEBHOOK_SECRET=configured(redacted) source=ALERT_WEBHOOK_SECRET");
    expectSensitiveValuesExcluded(output);
  });

  it("writes selected env names through the Vercel CLI without echoing secret values", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-production-services-"));
    const binDir = path.join(root, "bin");
    const logPath = path.join(root, "vercel.log");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, { logPath });
      const result = runConfigure([
        "--env-json-stdin",
        "--services",
        "object-storage",
        "--yes",
        "--scope",
        "test-team"
      ], {
        input: `${JSON.stringify(fakeEnv)}\n`,
        env: cleanEnv({
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        })
      });
      const output = outputOf(result);
      const log = readFileSync(logPath, "utf8");

      expect(result.status).toBe(0);
      expect(output).toContain("vercelProjectCustody=pass project=sena-hk");
      expect(output).toContain("SENA_OBJECT_STORAGE_ADAPTER=added");
      expect(output).toContain("SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY=added");
      expect(log.indexOf("inspect www.sena.hk --format json --scope test-team"))
        .toBeLessThan(log.indexOf("env add SENA_OBJECT_STORAGE_ADAPTER production --scope test-team"));
      expect(output).toContain("SENA Vercel production services configuration complete. Secret values were not printed.");
      expectSensitiveValuesExcluded(output);
      expect(readFileSync(path.join(binDir, "vercel"), "utf8")).toContain("env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to write service env values when Vercel custody points at the wrong project", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-production-services-mismatch-"));
    const binDir = path.join(root, "bin");
    const logPath = path.join(root, "vercel.log");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, { projectName: "wrong-project", logPath });
      const result = runConfigure([
        "--env-json-stdin",
        "--services",
        "object-storage",
        "--yes",
        "--scope",
        "test-team"
      ], {
        input: `${JSON.stringify(fakeEnv)}\n`,
        env: cleanEnv({
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        })
      });
      const output = outputOf(result);
      const log = readFileSync(logPath, "utf8");

      expect(result.status).toBe(1);
      expect(output).toContain("project-name-mismatch expected=sena-hk actual=wrong-project");
      expect(log).not.toContain("env add SENA_OBJECT_STORAGE_ADAPTER");
      expectSensitiveValuesExcluded(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
