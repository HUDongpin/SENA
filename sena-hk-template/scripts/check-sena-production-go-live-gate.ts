import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { buildSenaGoLiveCloseoutCheck, loadSenaLocalEnv } from "../lib/sena/enterprise/go-live-closeout-check";
import { buildEnterpriseProductionEvidenceManifest } from "../lib/sena/enterprise/ops-production-evidence";
import { buildSenaEnterpriseProductionGoLiveGate } from "../lib/sena/enterprise/production-go-live-gate";
import { buildEnterpriseProductionRuntimeEnvPacket } from "../lib/sena/enterprise/production-runtime-env-packet";
import { emitVerificationArtifact } from "./verification-artifact-output";

type Options = {
  domain?: string;
  vercelScope?: string;
  manifest?: string;
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
    } else if (arg === "--manifest") {
      options.manifest = nextValue(argv, index, arg);
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
      console.log(`Check the SENA production go-live gate.

Usage:
  npm run sena:production:gate -- [--domain <host-or-url>] [--scope <vercel-team>] [--manifest <file>] [--preflight <file>] [--archive <file>] [--output <file>]

Options:
  --domain <host-or-url>  Deployment domain to hash for target evidence. Default: https://www.sena.hk.
  --scope <team>          Vercel team scope; value is excluded from the artifact.
  --manifest <file>       Redacted sena-enterprise-production-evidence-manifest/v1 artifact. Defaults to current process env.
  --preflight <file>      Redacted sena-enterprise-vercel-production-preflight/v1 artifact.
  --archive <file>        Redacted sena-enterprise-production-evidence-archive/v1 artifact.
  --output <file>         Write the redacted gate JSON and <file>.sha256 custody hash.`);
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

loadSenaLocalEnv();

const options = parseArgs(process.argv.slice(2));
const manifestArtifact = readJsonArtifact(options.manifest);
const preflight = readJsonArtifact(options.preflight);
const archive = readJsonArtifact(options.archive);
const manifest = manifestArtifact.artifact
  ? manifestArtifact.artifact as ReturnType<typeof buildEnterpriseProductionEvidenceManifest>
  : buildEnterpriseProductionEvidenceManifest();
const runtimeEnvPacket = buildEnterpriseProductionRuntimeEnvPacket({
  domain: options.domain,
  vercelScope: options.vercelScope,
  preflightArtifact: preflight.artifact,
  preflightPath: options.preflight,
  preflightArtifactSha256: preflight.artifactSha256,
  archiveArtifact: archive.artifact,
  archivePath: options.archive,
  archiveArtifactSha256: archive.artifactSha256
});
const goLiveCloseout = await buildSenaGoLiveCloseoutCheck();
const gate = buildSenaEnterpriseProductionGoLiveGate({
  manifest,
  runtimeEnvPacket,
  goLiveCloseout
});

emitVerificationArtifact({
  artifact: gate,
  output: options.output,
  pathLabel: "productionGoLiveGateArtifactPath",
  artifactSha256Label: "productionGoLiveGateArtifactSha256",
  verifiedAtLabel: "productionGoLiveGateVerifiedAt",
  verifiedAt: gate.generatedAt
});

if (gate.status !== "ready") {
  console.error("SENA production go-live gate is blocked. Keep SENA as a research-pilot delivery candidate until production evidence, runtime env packet, and go-live closeout are all ready.");
  process.exit(1);
}

console.log("SENA production go-live gate passed.");
