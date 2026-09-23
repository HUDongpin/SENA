import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(process.cwd(), "..");
const registryPath = join(projectRoot, "coordination", "repo-governance", "active-work.json");
const governanceScript = join(projectRoot, "scripts", "verify-sena-repo-governance.mjs");
const protectedMainSha = "9274e313251014d142369a5f338e7a5a7f1f1fc7";
const protectedMainTree = "e6c837f66528b98040ce6c226b512a90b3c95597";
const protectedRegistryBlob = "5d28382bed375f9cfe64ba972b24fd06e8cd87a9";
const gTaskId = "SENA-G-LOCAL-INTEGRATION-20260923";
const gBranch = "codex/sena-g-local-integration-20260923";

function protectedGit(args: string[]) {
  return execFileSync("git", ["--no-optional-locks", "-C", projectRoot, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1"
    }
  }).trim();
}

function protectedRegistry() {
  expect(protectedGit(["rev-parse", `${protectedMainSha}^{tree}`])).toBe(protectedMainTree);
  expect(protectedGit(["rev-parse", `${protectedMainSha}:coordination/repo-governance/active-work.json`]))
    .toBe(protectedRegistryBlob);
  return JSON.parse(protectedGit([
    "show", `${protectedMainSha}:coordination/repo-governance/active-work.json`
  ]));
}

function gSuccessorRegistry() {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

async function governance() {
  return import(`${pathToFileURL(governanceScript).href}?g-successor=${Date.now()}`);
}

describe("A01 protected G registration successor", () => {
  it("admits the one exact G work item and branch without changing historical Q authority", async () => {
    const rules: any = await governance();
    const protectedMain = protectedRegistry();
    const candidate = gSuccessorRegistry();
    expect(rules.validateRegistry(protectedMain).errors).toEqual([]);
    expect(candidate.workItems.filter((item: any) => item.taskId === gTaskId)).toHaveLength(1);
    expect(candidate.branches.filter((branch: any) => branch.name === gBranch)).toHaveLength(1);
    expect(rules.validateRegistry(candidate).errors).toEqual([]);
    expect(rules.postPr83ProtectedLaneShapeAllowed(
      candidate.workItems.find((item: any) => item.taskId === "SENA-BRANCH-RETIREMENT-20260829"),
      candidate
    )).toBe(true);
    expect(rules.validateGLocalIntegrationGovernanceSuccessor(protectedMain, candidate)).toMatchObject({
      sourceCommitSha: protectedMainSha,
      sourceTreeSha: protectedMainTree,
      registeredTaskId: gTaskId,
      registeredBranch: gBranch,
      authorityExpanded: false,
      commitAuthorized: false,
      pushAuthorized: false,
      mergeAuthorized: false
    });
    const historicalQSource = JSON.parse(protectedGit([
      "show", "6d65770dbae5db94d9c99decdddbebe3d978b8ae:coordination/repo-governance/active-work.json"
    ]));
    expect(() => rules.validateLatestMainQConvergenceRemediationTransition(
      historicalQSource, candidate
    )).toThrow("rule=latest-main-q-convergence-remediation-invalid");
  });

  it("rejects arbitrary extra work items and branches", async () => {
    const rules: any = await governance();
    const protectedMain = protectedRegistry();
    for (const mutate of [
      (candidate: any) => candidate.workItems.push({
        ...candidate.workItems.find((item: any) => item.taskId === gTaskId),
        taskId: "SENA-UNAUTHORIZED-EXTRA"
      }),
      (candidate: any) => candidate.branches.push({
        ...candidate.branches.find((branch: any) => branch.name === gBranch),
        name: "codex/unauthorized-extra"
      })
    ]) {
      const candidate = structuredClone(gSuccessorRegistry());
      mutate(candidate);
      expect(() => rules.validateGLocalIntegrationGovernanceSuccessor(protectedMain, candidate))
        .toThrow("rule=g-local-integration-successor-invalid");
      expect(rules.validateRegistry(candidate).errors)
        .toContain("rule=latest-main-q-convergence-remediation-invalid");
    }
  });

  it("rejects a changed PR46 merge-chain observation and stale G or source SHAs", async () => {
    const rules: any = await governance();
    const protectedMain = protectedRegistry();
    const mutations = [
      (candidate: any) => {
        candidate.workItems.find((item: any) => item.taskId === "SENA-BRANCH-RETIREMENT-20260829")
          .aheadBehind.behind += 1;
      },
      (candidate: any) => {
        candidate.workItems.find((item: any) => item.taskId === "SENA-BRANCH-RETIREMENT-20260829")
          .protectedMainBaselineSha = "4ddb4ea869f39b6ae00a728ccc0d28a410c98017";
      },
      (candidate: any) => {
        candidate.workItems.find((item: any) => item.taskId === gTaskId).headSha =
          "4ddb4ea869f39b6ae00a728ccc0d28a410c98017";
      },
      (candidate: any) => {
        candidate.branches.find((branch: any) => branch.name === gBranch).baseSha =
          "4ddb4ea869f39b6ae00a728ccc0d28a410c98017";
      }
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(gSuccessorRegistry());
      mutate(candidate);
      expect(() => rules.validateGLocalIntegrationGovernanceSuccessor(protectedMain, candidate))
        .toThrow("rule=g-local-integration-successor-invalid");
      expect(rules.validateRegistry(candidate).errors)
        .toContain("rule=latest-main-q-convergence-remediation-invalid");
    }
    const staleSource = JSON.parse(protectedGit([
      "show", "4ddb4ea869f39b6ae00a728ccc0d28a410c98017:coordination/repo-governance/active-work.json"
    ]));
    expect(() => rules.validateGLocalIntegrationGovernanceSuccessor(staleSource, gSuccessorRegistry()))
      .toThrow("rule=g-local-integration-successor-invalid");
  });

  it("does not re-run superseded physical custody contracts for the exact G registry", () => {
    const root = mkdtempSync(join(tmpdir(), "sena-a01-g-physical-audit-"));
    const historicalRules = [
      "rule=pr86-delivery-closeout-snapshot-invalid",
      "rule=o-n-evidenceflow-preservation-custody-invalid",
      "rule=j-h-evidence-custody-reconstruction-invalid",
      "rule=i-h-dedicated-landing-g-host-custody-invalid",
      "rule=i-h-dedicated-landing-preserved-h-custody-invalid",
      "rule=mobile-pilot-retained-source-physical-custody-invalid"
    ];
    const audit = (registryFile: string) => {
      const output = join(root, "candidate-audit.json");
      const result = spawnSync(process.execPath, [
        governanceScript, "audit", "--registry", registryFile, "--output", output
      ], {
        cwd: projectRoot,
        encoding: "utf8",
        // A full repository fsck can exceed 30 seconds as the preserved
        // worktree history grows. This is a harness ceiling, not an app wait.
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024
      });
      expect(result.error).toBeUndefined();
      expect([0, 1]).toContain(result.status);
      const report = JSON.parse(readFileSync(output, "utf8"));
      return report.errors.filter((error: string) => historicalRules.includes(error));
    };
    try {
      // The first RED run introduced exactly these six historical-only errors.
      // The exact successor must not reintroduce any of them on the host.
      expect(audit(registryPath)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 75_000);
});
