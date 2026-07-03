import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildSenaPerformanceSourceCustody,
  performanceSourceCustodyEnvText
} from "../lib/sena/enterprise/performance-source-custody";
import { emitVerificationArtifact } from "./verification-artifact-output";

type Options = {
  output?: string;
  envOutput?: string;
  root?: string;
};

function nextValue(argv: string[], index: number, arg: string) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      options.output = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--env-output") {
      options.envOutput = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--root") {
      options.root = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Prepare SENA performance source custody for a reviewed clean release slice.

Usage:
  npm run sena:performance:source-custody -- [--output <file>] [--env-output <file>] [--root <dir>]

Options:
  --output <file>      Write the redacted source-custody JSON and <file>.sha256 custody hash.
  --env-output <file>  Write non-secret SENA_PERFORMANCE_SOURCE_CUSTODY_* hash/count env lines for sena:performance:check.
  --root <dir>         Project root. Default: current working directory.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const artifact = buildSenaPerformanceSourceCustody({
  root: options.root ? path.resolve(options.root) : process.cwd()
});

if (options.envOutput) {
  const envPath = path.resolve(options.envOutput);
  mkdirSync(path.dirname(envPath), { recursive: true });
  writeFileSync(envPath, performanceSourceCustodyEnvText(artifact.env));
  process.stdout.write(`performanceSourceCustodyEnvPath=${envPath}\n`);
}

emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "performanceSourceCustodyArtifactPath",
  artifactSha256Label: "performanceSourceCustodyArtifactSha256",
  verifiedAtLabel: "performanceSourceCustodyVerifiedAt",
  verifiedAt: artifact.generatedAt
});

for (const [key, value] of Object.entries(artifact.env)) {
  process.stdout.write(`${key}=${value}\n`);
}

if (artifact.status !== "pass") {
  console.error("SENA performance source custody failed. Inspect unreadable source files or missing git identity before binding performance evidence.");
  process.exit(1);
}

console.log("SENA performance source custody prepared.");
