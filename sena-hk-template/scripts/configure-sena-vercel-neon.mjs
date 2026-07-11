#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultDomain = "www.sena.hk";
const defaultAppUrl = `https://${defaultDomain}`;
const defaultProject = "sena-hk";
const postgresUrlKeys = [
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL"
];

function parseArgs(argv) {
  const options = {
    domain: defaultDomain,
    appUrl: defaultAppUrl,
    environment: "production",
    envFile: ".env.local",
    scope: process.env.VERCEL_SCOPE,
    project: process.env.VERCEL_PROJECT_NAME || defaultProject,
    yes: false,
    deploy: false,
    strictProduction: false,
    removeLegacyFileEnv: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };
    if (arg === "--yes") options.yes = true;
    else if (arg === "--deploy") options.deploy = true;
    else if (arg === "--strict-production") options.strictProduction = true;
    else if (arg === "--remove-legacy-file-env") options.removeLegacyFileEnv = true;
    else if (arg === "--postgres-url-stdin") options.postgresUrlStdin = true;
    else if (arg === "--domain") {
      options.domain = normalizeDomain(next());
      options.appUrl = appUrlFromDomain(options.domain);
    } else if (arg === "--app-url") options.appUrl = normalizeUrl(next());
    else if (arg === "--env") options.environment = next();
    else if (arg === "--local-env-file" || arg === "--env-file") options.envFile = next();
    else if (arg === "--scope") options.scope = next();
    else if (arg === "--project") options.project = next();
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.strictProduction) options.removeLegacyFileEnv = true;
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

function printHelp() {
  console.log(`Configure SENA Vercel production to use Neon Postgres.

Usage:
  npm run sena:vercel:neon:configure -- --yes [options]

Options:
  --domain <host>          Domain to bind to the linked Vercel project. Default: ${defaultDomain}
  --app-url <url>          Public app URL. Default: https://<domain>
  --env <name>             Vercel environment. Default: production
  --local-env-file <path>  Local env file to read if process env lacks a DB URL. Default: .env.local
  --scope <team-slug>      Vercel team scope. Defaults to VERCEL_SCOPE or linked project scope.
  --project <name>         Expected Vercel project name before writing env. Default: ${defaultProject}
  --strict-production      Also set strict production evidence gate env vars.
  --remove-legacy-file-env Remove SENA_ENTERPRISE_DB_DIR from Vercel production after writing Postgres env.
  --deploy                 Trigger a Vercel production deploy after env/domain configuration.
  --postgres-url-stdin     Read the Neon/Postgres URL from stdin instead of env vars.
  --yes                    Actually write Vercel env/domain changes. Without this, prints a dry run.

Secret handling:
  The Neon/Postgres URL is read from SENA_ENTERPRISE_POSTGRES_URL, SENA_DATABASE_URL,
  DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or NEON_DATABASE_URL, then written
  to Vercel as SENA_ENTERPRISE_POSTGRES_URL.
  The URL value is never printed. Use --local-env-file rather than Node's own --env-file flag.

Safer shell pattern:
  read -rs SENA_NEON_URL
  printf '%s\\n' "$SENA_NEON_URL" | npm run sena:vercel:neon:configure -- --yes --postgres-url-stdin`);
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) entries.set(key, value);
  }
  return entries;
}

function placeholderValue(value) {
  return value === "..." || /<[^>\r\n]+>/.test(value);
}

function usablePostgresUrl(value) {
  const trimmed = value?.trim();
  return trimmed && !placeholderValue(trimmed) ? trimmed : undefined;
}

function resolvePostgresUrl(options) {
  if (options.postgresUrlStdin) {
    const value = usablePostgresUrl(readFileSync(0, "utf8"));
    if (value) return { key: "stdin", value, source: "stdin" };
  }
  for (const key of postgresUrlKeys) {
    const value = usablePostgresUrl(process.env[key]);
    if (value) return { key, value, source: "process-env" };
  }
  const localEnv = parseEnvFile(resolve(process.cwd(), options.envFile));
  for (const key of postgresUrlKeys) {
    const value = usablePostgresUrl(localEnv.get(key));
    if (value) return { key, value, source: options.envFile };
  }
  return null;
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

function redactOutput(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => !/postgres:\/\/|postgresql:\/\//i.test(line))
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

function assertVercelWriteCustody(options) {
  const inspect = run("vercel", vercelArgs(options, ["inspect", options.domain, "--format", "json"]));
  const inspectJson = parseJson(`${inspect.stdout}\n${inspect.stderr}`);
  const projectName = typeof inspectJson?.name === "string" ? inspectJson.name : undefined;
  const readyState = typeof inspectJson?.readyState === "string" ? inspectJson.readyState : undefined;
  const target = typeof inspectJson?.target === "string" ? inspectJson.target : undefined;
  const aliasMatched = deploymentAliases(inspectJson).some((alias) => normalizedHost(alias) === normalizedHost(options.domain));
  if (inspect.status !== 0) {
    throw new Error(`Vercel custody check failed before writing provider env: deployment-inspect-failed (${redactOutput(`${inspect.stdout}\n${inspect.stderr}`) || "no-output"}).`);
  }
  if (projectName !== options.project) {
    throw new Error(`Vercel custody check failed before writing provider env: project-name-mismatch expected=${options.project} actual=${projectName ?? "missing"}.`);
  }
  if (readyState !== "READY" || target !== "production") {
    throw new Error(`Vercel custody check failed before writing provider env: deployment-not-production-ready readyState=${readyState ?? "missing"} target=${target ?? "missing"}.`);
  }

  const domainInspect = run("vercel", vercelArgs(options, ["domains", "inspect", options.domain]));
  if (domainInspect.status !== 0 && !aliasMatched) {
    throw new Error(`Vercel custody check failed before writing provider env: domain-not-bound (${redactOutput(`${domainInspect.stdout}\n${domainInspect.stderr}`) || "no-output"}).`);
  }

  const envList = run("vercel", vercelArgs(options, ["env", "ls", options.environment]));
  if (envList.status !== 0) {
    throw new Error(`Vercel custody check failed before writing provider env: env-list-unreadable (${redactOutput(`${envList.stdout}\n${envList.stderr}`) || "no-output"}).`);
  }

  return {
    projectName,
    domainStatus: domainInspect.status === 0 ? "domain-inspect-pass" : "deployment-alias-pass"
  };
}

function upsertVercelEnv(options, key, value) {
  const addArgs = vercelArgs(options, ["env", "add", key, options.environment]);
  const add = run("vercel", addArgs, `${value}\n`);
  if (add.status === 0) return "added";
  const combined = `${add.stdout}\n${add.stderr}`;
  if (!/already exists|exists/i.test(combined)) {
    throw new Error(`Failed to add ${key}: ${redactOutput(combined)}`);
  }
  const removeArgs = vercelArgs(options, ["env", "rm", key, options.environment, "-y"]);
  const remove = run("vercel", removeArgs);
  if (remove.status !== 0) {
    throw new Error(`Failed to replace existing ${key}: ${redactOutput(`${remove.stdout}\n${remove.stderr}`)}`);
  }
  const retry = run("vercel", addArgs, `${value}\n`);
  if (retry.status !== 0) {
    throw new Error(`Failed to re-add ${key}: ${redactOutput(`${retry.stdout}\n${retry.stderr}`)}`);
  }
  return "replaced";
}

function removeVercelEnvIfPresent(options, key) {
  const removeArgs = vercelArgs(options, ["env", "rm", key, options.environment, "-y"]);
  const remove = run("vercel", removeArgs);
  const combined = `${remove.stdout}\n${remove.stderr}`;
  if (remove.status === 0) return "removed";
  if (/not found|does not exist|no environment variable|couldn't find|cannot find/i.test(combined)) {
    return "already-absent";
  }
  throw new Error(`Failed to remove ${key}: ${redactOutput(combined)}`);
}

function ensureDomain(options) {
  const result = run("vercel", vercelArgs(options, ["domains", "add", options.domain]));
  const combined = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) return "added";
  if (/alias_conflict|already assigned|already exists/i.test(combined)) {
    const inspect = run("vercel", vercelArgs(options, ["domains", "inspect", options.domain]));
    if (inspect.status === 0 && /Project\s+Domains|sena-hk/i.test(inspect.stdout)) {
      return "already-configured";
    }
  }
  throw new Error(`Failed to configure ${options.domain}: ${redactOutput(combined)}`);
}

function deployProduction(options) {
  const result = run("vercel", vercelArgs(options, ["deploy", "--prod", "-y", "--no-wait"]));
  if (result.status !== 0) {
    throw new Error(`Vercel production deploy failed: ${redactOutput(`${result.stdout}\n${result.stderr}`)}`);
  }
  return redactOutput(result.stdout);
}

function verificationPlan(options) {
  const scope = options.scope ? ` --scope ${options.scope}` : "";
  const scopeValue = options.scope ?? "<team-slug>";
  const evidenceDir = "output/production-evidence/<release-id>";
  const commands = [
    `vercel inspect ${options.domain}${scope}`,
    `npm run sena:vercel:preflight -- --scope ${scopeValue} --output output/production-evidence/vercel-production-preflight.json`,
    "npm run sena:postgres:schema-contract -- --output output/production-evidence/postgres-schema-contract.json",
    "npm run sena:postgres:verify -- --output output/production-evidence/postgres-probe.json",
    `SENA_CDN_VERIFY_URL=${options.appUrl} npm run sena:cdn:verify -- --output output/production-evidence/cdn-probe.json`,
    `npm run sena:production-evidence:archive -- --output-dir ${evidenceDir} --vercel-scope ${scopeValue}`,
    `npm run sena:production-env:packet -- --domain ${options.appUrl} --scope ${scopeValue} --preflight output/production-evidence/vercel-production-preflight.json --archive ${evidenceDir}/sena-production-evidence-archive.json --output output/production-evidence/production-runtime-env-packet.json`,
    `npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-runtime-env-packet.json --scope ${scopeValue}`,
    `npm run sena:production:gate -- --domain ${options.appUrl} --scope ${scopeValue} --manifest output/production-evidence/sena-enterprise-production-evidence-manifest.json --preflight output/production-evidence/vercel-production-preflight.json --archive ${evidenceDir}/sena-production-evidence-archive.json --output output/production-evidence/production-go-live-gate.json`,
    `npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-go-live-gate.json --scope ${scopeValue}`,
    `npm run sena:production-evidence:bind -- --artifact ${evidenceDir}/sena-production-evidence-archive.json --scope ${scopeValue}`,
    "npm run sena:production-evidence:check -- --output output/production-evidence/sena-enterprise-production-evidence-manifest.json",
    "npm run sena:go-live:check"
  ];
  if (options.removeLegacyFileEnv) {
    commands.splice(2, 0, `vercel env rm SENA_ENTERPRISE_DB_DIR ${options.environment} -y${scope}`);
  }
  return commands;
}

function plannedEnv(options, postgres) {
  const entries = new Map([
    ["SENA_ENTERPRISE_DB_ADAPTER", "neon"],
    ["SENA_ENTERPRISE_STATE_STORE", "postgres"],
    ["SENA_ENTERPRISE_POSTGRES_URL", postgres ? "configured(redacted)" : "missing"],
    ["SENA_APP_URL", options.appUrl],
    ["NEXT_PUBLIC_SENA_APP_URL", options.appUrl]
  ]);
  if (options.strictProduction) {
    entries.set("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
    entries.set("SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED", "1");
  }
  if (options.removeLegacyFileEnv) {
    entries.set("SENA_ENTERPRISE_DB_DIR", "remove-after-postgres-env-write");
  }
  return entries;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const postgres = resolvePostgresUrl(options);
  const envPlan = plannedEnv(options, postgres);

  console.log("SENA Vercel + Neon configuration plan");
  console.log(`  domain=${options.domain}`);
  console.log(`  appUrl=${options.appUrl}`);
  console.log(`  vercelEnvironment=${options.environment}`);
  console.log(`  vercelScope=${options.scope ?? "linked-project-default"}`);
  console.log(`  vercelProject=${options.project}`);
  console.log(`  deploy=${options.deploy}`);
  console.log(`  strictProduction=${options.strictProduction}`);
  console.log(`  removeLegacyFileEnv=${options.removeLegacyFileEnv}`);
  console.log(`  postgresUrlSource=${postgres ? `${postgres.key} from ${postgres.source}` : "missing"}`);
  console.log("  env:");
  for (const [key, value] of envPlan) console.log(`    ${key}=${value}`);

  if (!postgres) {
    throw new Error(
      `Missing Neon/Postgres URL. Provide one as ${postgresUrlKeys.join(", ")} in the process environment or ${options.envFile}.`
    );
  }
  if (!options.yes) {
    console.log("Dry run only. Re-run with --yes to write these values to Vercel.");
    console.log("Next verification commands after a real write:");
    for (const command of verificationPlan(options)) console.log(`  ${command}`);
    return;
  }

  assertVercelAvailable();
  const domainAction = ensureDomain(options);
  const custody = assertVercelWriteCustody(options);
  console.log(`  vercelProjectCustody=pass project=${custody.projectName} domain=${custody.domainStatus}`);
  const concreteEnv = new Map([
    ["SENA_ENTERPRISE_DB_ADAPTER", "neon"],
    ["SENA_ENTERPRISE_STATE_STORE", "postgres"],
    ["SENA_ENTERPRISE_POSTGRES_URL", postgres.value],
    ["SENA_APP_URL", options.appUrl],
    ["NEXT_PUBLIC_SENA_APP_URL", options.appUrl]
  ]);
  if (options.strictProduction) {
    concreteEnv.set("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
    concreteEnv.set("SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED", "1");
  }

  for (const [key, value] of concreteEnv) {
    const action = upsertVercelEnv(options, key, value);
    console.log(`  ${key}=${action}`);
  }
  if (options.removeLegacyFileEnv) {
    console.log(`  SENA_ENTERPRISE_DB_DIR=${removeVercelEnvIfPresent(options, "SENA_ENTERPRISE_DB_DIR")}`);
  }
  console.log(`  ${options.domain}=${domainAction}`);
  if (options.deploy) {
    console.log("  deploymentUrl:");
    console.log(deployProduction(options));
  }
  console.log("SENA Vercel + Neon configuration complete. Secret values were not printed.");
  console.log("Next verification commands:");
  for (const command of verificationPlan(options)) console.log(`  ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
