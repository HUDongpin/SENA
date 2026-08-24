import path from "node:path";
import { buildSenaPerformanceSourceCustody } from "../lib/sena/enterprise/performance-source-custody";
import { emitVerificationArtifact } from "./verification-artifact-output";

type Options = {
  output?: string;
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
      throw new Error("--env-output is disabled: performance source custody is diagnostic-only and cannot authorize or bind a dirty production build.");
    } else if (arg === "--root") {
      options.root = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Capture a redacted, diagnostic SENA performance source snapshot.

Usage:
  npm run sena:performance:source-custody -- [--output <file>] [--root <dir>]

Options:
  --output <file>      Write the redacted diagnostic JSON and <file>.sha256 transport checksum.
  --root <dir>         Project root. Default: current working directory.

This diagnostic snapshot cannot authorize production evidence. Production performance
binding requires a fresh build from a clean Git worktree.`);
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

emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "performanceSourceCustodyArtifactPath",
  artifactSha256Label: "performanceSourceCustodyArtifactSha256",
  verifiedAtLabel: "performanceSourceCustodyVerifiedAt",
  verifiedAt: artifact.generatedAt
});

if (artifact.status !== "pass") {
  console.error("SENA diagnostic performance source snapshot failed. Inspect unreadable source files or missing Git identity; this snapshot is not production authorization.");
  process.exit(1);
}

console.log("SENA diagnostic performance source snapshot captured (non-bindable).");
