import { describe, expect, it } from "vitest";
import { resolveSenaWorkflowWorkerBuildAttestation } from "../workflow/worker-code-attestation";

describe("SENA workflow worker build attestation", () => {
  it("derives code provenance from the checked-out Git object instead of trusting an environment SHA", () => {
    const calls: string[][] = [];
    const codeSha = "a".repeat(40);
    const treeSha = "b".repeat(40);
    const attestation = resolveSenaWorkflowWorkerBuildAttestation({
      cwd: "/private/fixture/sena-hk-template",
      assertedCodeSha: codeSha,
      git: (args) => {
        calls.push(args);
        if (args.join(" ") === "rev-parse HEAD") return codeSha;
        if (args.join(" ") === "rev-parse HEAD^{tree}") return treeSha;
        if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") return "";
        throw new Error(`unexpected git command ${args.join(" ")}`);
      }
    });

    expect(attestation).toEqual(expect.objectContaining({
      codeSha,
      treeSha,
      source: "git-object-measurement",
      clean: true,
      attestationDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(calls).toHaveLength(3);
  });

  it("fails closed on a dirty worker tree or a mismatched asserted SHA", () => {
    const codeSha = "a".repeat(40);
    const git = (args: string[]) => args[0] === "status"
      ? " M lib/sena/workflow/worker-runtime.ts"
      : args.join(" ").includes("HEAD^{tree}")
        ? "b".repeat(40)
        : codeSha;
    expect(() => resolveSenaWorkflowWorkerBuildAttestation({ cwd: "/tmp/sena", git }))
      .toThrow(/clean/i);
    expect(() => resolveSenaWorkflowWorkerBuildAttestation({
      cwd: "/tmp/sena",
      assertedCodeSha: "c".repeat(40),
      git: (args) => args.join(" ").includes("HEAD^{tree}") ? "b".repeat(40) : args[0] === "status" ? "" : codeSha
    })).toThrow(/asserted/i);
  });
});
