import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type VerificationArtifactArgs = {
  output?: string;
};

export function parseVerificationArtifactArgs(argv: string[], input: {
  description: string;
  command: string;
  outputDescription?: string;
}): VerificationArtifactArgs {
  const options: VerificationArtifactArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--output requires a file path.");
      options.output = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`${input.description}

Usage:
  ${input.command} -- [--output <file>]

Options:
  --output <file>  ${input.outputDescription ?? "Write the redacted artifact JSON and <file>.sha256 custody hash."}`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export function serializeVerificationArtifact(artifact: unknown) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function sha256VerificationArtifact(serialized: string) {
  return createHash("sha256").update(serialized).digest("hex");
}

export function writeVerificationArtifact(output: string, serialized: string, artifactSha256: string) {
  const outputPath = path.resolve(output);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);
  writeFileSync(`${outputPath}.sha256`, `${artifactSha256}  ${path.basename(outputPath)}\n`);
  return outputPath;
}

export function emitVerificationArtifact(input: {
  artifact: unknown;
  output?: string;
  pathLabel?: string;
  artifactSha256Label: string;
  verifiedAtLabel?: string;
  verifiedAt?: string;
}) {
  const serialized = serializeVerificationArtifact(input.artifact);
  const artifactSha256 = sha256VerificationArtifact(serialized);
  if (input.output) {
    const outputPath = writeVerificationArtifact(input.output, serialized, artifactSha256);
    process.stdout.write(`${input.pathLabel ?? "verificationArtifactPath"}=${outputPath}\n`);
  }
  process.stdout.write(serialized);
  process.stdout.write(`${input.artifactSha256Label}=${artifactSha256}\n`);
  if (input.verifiedAtLabel && input.verifiedAt) {
    process.stdout.write(`${input.verifiedAtLabel}=${input.verifiedAt}\n`);
  }
  return { serialized, artifactSha256 };
}
