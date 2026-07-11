import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = "scripts/configure-sena-vercel-neon.mjs";
const postgresEnvNames = [
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "VERCEL_SCOPE"
];
const fakePostgresUrl = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

function cleanEnv(overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };
  for (const name of postgresEnvNames) delete env[name];
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

function expectSecretExcluded(output: string) {
  expect(output).not.toContain(fakePostgresUrl);
  expect(output).not.toContain("super-secret");
  expect(output).not.toContain("example.neon.tech");
}

function writeFakeVercel(binDir: string, options: {
  projectName?: string;
  logPath?: string;
} = {}) {
  const fakePath = path.join(binDir, "vercel");
  const projectName = options.projectName ?? "sena-hk";
  const logPath = options.logPath ?? path.join(binDir, "vercel.log");
  writeFileSync(fakePath, `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 54.9.0"
  exit 0
fi
if [ "$1" = "domains" ] && [ "$2" = "add" ]; then
  echo "Domain already configured"
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
if [ "$1" = "env" ] && [ "$2" = "rm" ]; then
  exit 0
fi
echo "unexpected vercel args: $*" >&2
exit 1
`);
  chmodSync(fakePath, 0o755);
}

describe("SENA Vercel Neon configuration script", () => {
  it("dry-runs Vercel production env changes without printing a process-env Postgres URL", () => {
    const result = runConfigure(["--scope", "test-team"], {
      env: cleanEnv({
        SENA_ENTERPRISE_POSTGRES_URL: fakePostgresUrl
      })
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("SENA Vercel + Neon configuration plan");
    expect(output).toContain("postgresUrlSource=SENA_ENTERPRISE_POSTGRES_URL from process-env");
    expect(output).toContain("SENA_ENTERPRISE_POSTGRES_URL=configured(redacted)");
    expect(output).toContain("Dry run only. Re-run with --yes to write these values to Vercel.");
    expect(output).toContain("npm run sena:vercel:preflight -- --scope test-team --output output/production-evidence/vercel-production-preflight.json");
    expect(output).toContain("npm run sena:postgres:verify -- --output output/production-evidence/postgres-probe.json");
    expect(output).toContain("npm run sena:production-evidence:archive -- --output-dir output/production-evidence/<release-id> --vercel-scope test-team");
    expect(output).toContain("npm run sena:production-env:packet -- --domain https://www.sena.hk --scope test-team --preflight output/production-evidence/vercel-production-preflight.json --archive output/production-evidence/<release-id>/sena-production-evidence-archive.json --output output/production-evidence/production-runtime-env-packet.json");
    expect(output).toContain("npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-runtime-env-packet.json --scope test-team");
    expect(output).toContain("npm run sena:production:gate -- --domain https://www.sena.hk --scope test-team --manifest output/production-evidence/sena-enterprise-production-evidence-manifest.json --preflight output/production-evidence/vercel-production-preflight.json --archive output/production-evidence/<release-id>/sena-production-evidence-archive.json --output output/production-evidence/production-go-live-gate.json");
    expect(output).toContain("npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-go-live-gate.json --scope test-team");
    expect(output).toContain("npm run sena:production-evidence:bind -- --artifact output/production-evidence/<release-id>/sena-production-evidence-archive.json --scope test-team");
    expectSecretExcluded(output);
  });

  it("normalizes full URL domain input before building follow-up verification commands", () => {
    const result = runConfigure(["--scope", "test-team", "--domain", "https://www.sena.hk/"], {
      env: cleanEnv({
        SENA_ENTERPRISE_POSTGRES_URL: fakePostgresUrl
      })
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("domain=www.sena.hk");
    expect(output).toContain("appUrl=https://www.sena.hk");
    expect(output).toContain("vercel inspect www.sena.hk --scope test-team");
    expect(output).toContain("npm run sena:production-env:packet -- --domain https://www.sena.hk --scope test-team");
    expect(output).not.toContain("https://https://");
    expectSecretExcluded(output);
  });

  it("accepts a stdin Postgres URL for dry-run configuration without printing the secret", () => {
    const result = runConfigure(["--postgres-url-stdin", "--scope", "test-team"], {
      input: `${fakePostgresUrl}\n`
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("postgresUrlSource=stdin from stdin");
    expect(output).toContain("SENA_ENTERPRISE_DB_ADAPTER=neon");
    expect(output).toContain("SENA_ENTERPRISE_STATE_STORE=postgres");
    expect(output).toContain("SENA_ENTERPRISE_POSTGRES_URL=configured(redacted)");
    expectSecretExcluded(output);
  });

  it("treats unresolved Neon template placeholders as a missing Postgres URL", () => {
    const result = runConfigure([
      "--postgres-url-stdin",
      "--scope",
      "test-team",
      "--strict-production",
      "--local-env-file",
      ".env.neon-missing"
    ], {
      env: cleanEnv({
        SENA_ENTERPRISE_POSTGRES_URL: "<NEON_POSTGRES_URL>"
      }),
      input: "<NEON_POSTGRES_URL>\n"
    });
    const output = outputOf(result);

    expect(result.status).toBe(1);
    expect(output).toContain("postgresUrlSource=missing");
    expect(output).toContain("SENA_ENTERPRISE_POSTGRES_URL=missing");
    expect(output).toContain("SENA_ENTERPRISE_DB_DIR=remove-after-postgres-env-write");
    expect(output).toContain("Missing Neon/Postgres URL.");
    expect(output).not.toContain("<NEON_POSTGRES_URL>");
    expect(output).not.toContain("Dry run only. Re-run with --yes to write these values to Vercel.");
  });

  it("accepts Vercel Postgres Prisma URL aliases for dry-run configuration", () => {
    const result = runConfigure(["--scope", "test-team"], {
      env: cleanEnv({
        POSTGRES_PRISMA_URL: fakePostgresUrl
      })
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("postgresUrlSource=POSTGRES_PRISMA_URL from process-env");
    expect(output).toContain("SENA_ENTERPRISE_POSTGRES_URL=configured(redacted)");
    expectSecretExcluded(output);
  });

  it("dry-runs removal of the legacy file-state env after Neon is configured", () => {
    const result = runConfigure(["--scope", "test-team", "--remove-legacy-file-env"], {
      env: cleanEnv({
        SENA_ENTERPRISE_POSTGRES_URL: fakePostgresUrl
      })
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("removeLegacyFileEnv=true");
    expect(output).toContain("SENA_ENTERPRISE_DB_DIR=remove-after-postgres-env-write");
    expect(output).toContain("vercel env rm SENA_ENTERPRISE_DB_DIR production -y --scope test-team");
    expectSecretExcluded(output);
  });

  it("enables legacy file-state env removal when strict production mode is requested", () => {
    const result = runConfigure(["--scope", "test-team", "--strict-production"], {
      env: cleanEnv({
        SENA_ENTERPRISE_POSTGRES_URL: fakePostgresUrl
      })
    });
    const output = outputOf(result);

    expect(result.status).toBe(0);
    expect(output).toContain("strictProduction=true");
    expect(output).toContain("removeLegacyFileEnv=true");
    expect(output).toContain("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH=1");
    expect(output).toContain("SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED=1");
    expect(output).toContain("SENA_ENTERPRISE_DB_DIR=remove-after-postgres-env-write");
    expectSecretExcluded(output);
  });

  it("stops before any Vercel write when no Neon/Postgres URL is available", () => {
    const result = runConfigure(["--scope", "test-team", "--local-env-file", ".env.neon-missing"]);
    const output = outputOf(result);

    expect(result.status).toBe(1);
    expect(output).toContain("postgresUrlSource=missing");
    expect(output).toContain("SENA_ENTERPRISE_POSTGRES_URL=missing");
    expect(output).toContain("Missing Neon/Postgres URL.");
    expect(output).not.toContain("Vercel production deploy failed");
  });

  it("checks Vercel project custody before writing Neon env values", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-neon-custody-"));
    const binDir = path.join(root, "bin");
    const logPath = path.join(root, "vercel.log");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, { logPath });
      const result = runConfigure([
        "--postgres-url-stdin",
        "--yes",
        "--scope",
        "test-team",
        "--strict-production"
      ], {
        input: `${fakePostgresUrl}\n`,
        env: cleanEnv({
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        })
      });
      const output = outputOf(result);
      const log = readFileSync(logPath, "utf8");

      expect(result.status).toBe(0);
      expect(output).toContain("vercelProjectCustody=pass project=sena-hk");
      expect(output).toContain("SENA_ENTERPRISE_POSTGRES_URL=added");
      expect(log.indexOf("inspect www.sena.hk --format json --scope test-team"))
        .toBeLessThan(log.indexOf("env add SENA_ENTERPRISE_DB_ADAPTER production --scope test-team"));
      expectSecretExcluded(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to write Neon env values when the linked Vercel project does not match", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-neon-custody-mismatch-"));
    const binDir = path.join(root, "bin");
    const logPath = path.join(root, "vercel.log");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, { projectName: "wrong-project", logPath });
      const result = runConfigure([
        "--postgres-url-stdin",
        "--yes",
        "--scope",
        "test-team"
      ], {
        input: `${fakePostgresUrl}\n`,
        env: cleanEnv({
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        })
      });
      const output = outputOf(result);
      const log = readFileSync(logPath, "utf8");

      expect(result.status).toBe(1);
      expect(output).toContain("project-name-mismatch expected=sena-hk actual=wrong-project");
      expect(log).not.toContain("env add SENA_ENTERPRISE_POSTGRES_URL");
      expectSecretExcluded(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
