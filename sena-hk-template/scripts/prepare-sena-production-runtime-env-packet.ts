import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { buildEnterpriseProductionRuntimeEnvPacket } from "../lib/sena/enterprise/production-runtime-env-packet";
import { emitVerificationArtifact } from "./verification-artifact-output";

type Options = {
  domain?: string;
  vercelScope?: string;
  preflight?: string;
  archive?: string;
  output?: string;
};

function nextValue(argv: string[], index: number, arg: string) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    domain: process.env.SENA_PRODUCTION_DOMAIN || process.env.SENA_APP_URL || "https://www.sena.hk",
    vercelScope: process.env.VERCEL_SCOPE,
    preflight: "output/production-evidence/vercel-production-preflight-current.json",
    archive: "output/production-evidence/current-advisory/sena-production-evidence-archive.json"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--domain") {
      options.domain = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--vercel-scope" || arg === "--scope") {
      options.vercelScope = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--preflight") {
      options.preflight = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--archive") {
      options.archive = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--output") {
      options.output = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Prepare a redacted SENA production runtime env packet.

Usage:
  npm run sena:production-env:packet -- [--domain <host-or-url>] [--scope <vercel-team>] [--preflight <file>] [--archive <file>] [--output <file>]

Options:
  --domain <host-or-url>  Deployment domain to hash for target evidence. Default: https://www.sena.hk.
  --scope <team>          Vercel team scope; value is excluded from the artifact.
  --preflight <file>      Redacted sena-enterprise-vercel-production-preflight/v1 artifact.
  --archive <file>        Redacted sena-enterprise-production-evidence-archive/v1 artifact.
  --output <file>         Write the redacted packet JSON and <file>.sha256 custody hash.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readJsonArtifact(file: string | undefined) {
  if (!file || !existsSync(file)) return { artifact: undefined, artifactSha256: undefined };
  const text = readFileSync(file, "utf8");
  return {
    artifact: JSON.parse(text) as unknown,
    artifactSha256: createHash("sha256").update(text).digest("hex")
  };
}

const options = parseArgs(process.argv.slice(2));
const preflight = readJsonArtifact(options.preflight);
const archive = readJsonArtifact(options.archive);
const artifact = buildEnterpriseProductionRuntimeEnvPacket({
  domain: options.domain,
  vercelScope: options.vercelScope,
  preflightArtifact: preflight.artifact,
  preflightPath: options.preflight,
  preflightArtifactSha256: preflight.artifactSha256,
  archiveArtifact: archive.artifact,
  archivePath: options.archive,
  archiveArtifactSha256: archive.artifactSha256
});

emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "productionRuntimeEnvPacketArtifactPath",
  artifactSha256Label: "productionRuntimeEnvPacketArtifactSha256",
  verifiedAtLabel: "productionRuntimeEnvPacketGeneratedAt",
  verifiedAt: artifact.generatedAt
});

process.stdout.write(`productionRuntimeEnvPacketStatus=${artifact.status}\n`);
process.stdout.write(`productionRuntimeEnvPacketReadyProviderGroups=${artifact.summary.readyProviderGroups}/${artifact.summary.requiredProviderGroups}\n`);
process.stdout.write(`productionRuntimeEnvPacketBlockers=${artifact.summary.blockerIds.join("|") || "none"}\n`);
