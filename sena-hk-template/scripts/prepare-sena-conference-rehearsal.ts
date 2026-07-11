import { readFileSync } from "node:fs";
import {
  buildEnterpriseConferenceRehearsalPlan
} from "../lib/sena/enterprise/conference-rehearsal-plan";
import { emitVerificationArtifact } from "./verification-artifact-output";

type Options = {
  targetUrl?: string;
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
    targetUrl: process.env.SENA_CONFERENCE_TARGET_URL ||
      process.env.SENA_LOAD_TARGET_URL ||
      process.env.SENA_APP_URL ||
      process.env.NEXT_PUBLIC_SENA_APP_URL ||
      "https://www.sena.hk",
    vercelScope: process.env.VERCEL_SCOPE
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-url") {
      options.targetUrl = nextValue(argv, index, arg);
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
      console.log(`Prepare the SENA conference-scale rehearsal runbook artifact.

Usage:
  npm run sena:conference:prepare -- [--target-url <url>] [--scope <vercel-team>] [--preflight <file>] [--archive <file>] [--output <file>]

Options:
  --target-url <url>   Deployed URL for smoke and full rehearsal commands. Default: https://www.sena.hk.
  --scope <team>       Vercel team scope for command templates.
  --preflight <file>   Redacted sena-enterprise-vercel-production-preflight/v1 artifact.
  --archive <file>     Redacted sena-enterprise-production-evidence-archive/v1 artifact.
  --output <file>      Write the redacted plan JSON and <file>.sha256 custody hash.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readJsonArtifact(file: string | undefined) {
  if (!file) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

const options = parseArgs(process.argv.slice(2));
const artifact = buildEnterpriseConferenceRehearsalPlan({
  targetUrl: options.targetUrl,
  vercelScope: options.vercelScope,
  preflightArtifact: readJsonArtifact(options.preflight),
  archiveArtifact: readJsonArtifact(options.archive)
});

emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "conferenceRehearsalPlanArtifactPath",
  artifactSha256Label: "conferenceRehearsalPlanArtifactSha256",
  verifiedAtLabel: "conferenceRehearsalPlanGeneratedAt",
  verifiedAt: artifact.generatedAt
});

process.stdout.write(`conferenceRehearsalPlanStatus=${artifact.status}\n`);
process.stdout.write(`conferenceRehearsalHardBlockers=${artifact.summary.hardBlockers.join("|") || "none"}\n`);
process.stdout.write(`conferenceRehearsalEvidenceGaps=${artifact.summary.evidenceGaps.join("|") || "none"}\n`);

if (artifact.status === "blocked") {
  console.error("SENA conference rehearsal is blocked. Resolve hard blockers before running the full 50-user, 30-minute rehearsal.");
  process.exit(1);
}

console.log("SENA conference rehearsal plan is ready for the next step.");
