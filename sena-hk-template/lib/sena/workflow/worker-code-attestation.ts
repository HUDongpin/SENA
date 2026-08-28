import { execFileSync } from "node:child_process";
import { senaWorkflowDigest } from "./canonical";

const GIT_SHA = /^[a-f0-9]{40}$/;

export type SenaWorkflowWorkerBuildAttestation = {
  codeSha: string;
  treeSha: string;
  source: "git-object-measurement";
  clean: true;
  attestationDigest: string;
};

export function resolveSenaWorkflowWorkerBuildAttestation(input: {
  cwd: string;
  assertedCodeSha?: string;
  git?: (args: string[]) => string;
}): SenaWorkflowWorkerBuildAttestation {
  const git = input.git ?? ((args: string[]) => execFileSync(
    "git",
    ["-C", input.cwd, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  ).trim());
  let codeSha: string;
  let treeSha: string;
  let status: string;
  try {
    codeSha = git(["rev-parse", "HEAD"]).trim().toLowerCase();
    treeSha = git(["rev-parse", "HEAD^{tree}"]).trim().toLowerCase();
    status = git(["status", "--porcelain=v1", "--untracked-files=all"]).trim();
  } catch {
    throw new Error("SENA workflow worker build attestation requires a readable Git checkout.");
  }
  if (!GIT_SHA.test(codeSha) || !GIT_SHA.test(treeSha)) {
    throw new Error("SENA workflow worker build attestation contains an invalid Git object id.");
  }
  if (status !== "") {
    throw new Error("SENA workflow worker build attestation requires a clean Git checkout.");
  }
  const assertedCodeSha = input.assertedCodeSha?.trim().toLowerCase();
  if (assertedCodeSha && assertedCodeSha !== codeSha) {
    throw new Error("SENA workflow worker asserted code SHA does not match the measured Git checkout.");
  }
  const core = {
    codeSha,
    treeSha,
    source: "git-object-measurement" as const,
    clean: true as const
  };
  return { ...core, attestationDigest: senaWorkflowDigest(core) };
}

export function assertSenaWorkflowWorkerBuildAttestation(
  attestation: SenaWorkflowWorkerBuildAttestation
) {
  const { attestationDigest, ...core } = attestation;
  if (
    !GIT_SHA.test(core.codeSha) ||
    !GIT_SHA.test(core.treeSha) ||
    core.source !== "git-object-measurement" ||
    core.clean !== true ||
    attestationDigest !== senaWorkflowDigest(core)
  ) {
    throw new Error("SENA workflow worker build attestation is invalid.");
  }
  return attestation;
}
