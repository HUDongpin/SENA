import { afterEach, describe, expect, it } from "vitest";
import { buildEnterpriseProductionEvidenceManifest } from "../enterprise/ops-production-evidence";
import { buildEnterpriseProductionPerformancePath } from "../enterprise/ops-productionization";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const performanceTupleKeys = [
  "SENA_PERFORMANCE_BUDGET_CONFIRMED",
  "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
  "SENA_PERFORMANCE_BUDGET_VERIFIED_AT",
  "SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION",
  "SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256",
  "SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256",
  "SENA_PERFORMANCE_BUDGET_GIT_COMMIT",
  "SENA_PERFORMANCE_BUDGET_GIT_DIRTY",
  "SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256",
  "SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE"
] as const;

const testEnvNames = [
  "SENA_PERFORMANCE_BUDGET_ARTIFACT_REQUIRED",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  ...performanceTupleKeys
] as const;

function configureCurrentPerformanceTuple(gitCommit = "a".repeat(40)) {
  process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED = "1";
  process.env.SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256 = "1".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION =
    SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget;
  process.env.SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256 = "2".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256 = "3".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_GIT_COMMIT = gitCommit;
  process.env.SENA_PERFORMANCE_BUDGET_GIT_DIRTY = "false";
  process.env.SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256 = "4".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "git-clean-worktree";
}

function buildPerformancePath() {
  return buildEnterpriseProductionPerformancePath({
    opsStatus: {
      storage: {
        engine: "postgres",
        primaryStateRuntime: {
          mode: "postgres",
          activePrimary: "postgres",
          postgresPrimaryRequested: true
        }
      },
      counts: { uploads: 0 },
      deployment: {
        objectStorageNativeConfigured: true,
        objectStorageWebhookConfigured: false,
        opsTokenConfigured: true,
        alertWebhookConfigured: true
      }
    } as never,
    objectStorageReady: true,
    alertReady: true,
    uploadObjectStorageCustody: {
      source: "postgres-table",
      totalUploads: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
      skipped: 0,
      pendingReview: 0,
      eligibleForDelivery: 0,
      eligibleDelivered: 0,
      eligibleUndelivered: 0,
      ready: true,
      evidence: ["uploadCustodySource=postgres-table"]
    }
  });
}

function performancePathItem() {
  return buildPerformancePath().items.find((item) => item.id === "production-performance-budget");
}

describe("production performance runtime contract", () => {
  afterEach(() => {
    for (const name of testEnvNames) delete process.env[name];
  });

  it("publishes the exact complete 10-key performance binding inventory", () => {
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const performanceBudget = manifest.items.find((item) => item.id === "performance-budget-artifact");
    expect(performanceBudget).toBeDefined();

    const { required: _required, ...bindingEnv } = performanceBudget!.env;
    expect(Object.values(bindingEnv).sort()).toEqual([...performanceTupleKeys].sort());
  });

  it.each([41, 63])(
    "rejects a %i-digit Git OID in the production evidence manifest",
    (length) => {
      configureCurrentPerformanceTuple("a".repeat(length));

      const performanceBudget = buildEnterpriseProductionEvidenceManifest().items
        .find((item) => item.id === "performance-budget-artifact");

      expect(performanceBudget).toEqual(expect.objectContaining({
        confirmed: false,
        status: "missing-advisory"
      }));
      expect(performanceBudget?.evidence).toEqual(expect.arrayContaining([
        "performanceBudgetGitCommit=missing-or-invalid",
        "performanceBudgetBuildIdentityReady=false"
      ]));
    }
  );

  it.each([41, 63])(
    "rejects a %i-digit Git OID in production performance readiness",
    (length) => {
      configureCurrentPerformanceTuple("b".repeat(length));

      const performanceBudget = performancePathItem();

      expect(performanceBudget).toEqual(expect.objectContaining({ status: "review" }));
      expect(performanceBudget?.evidence).toEqual(expect.arrayContaining([
        "budgetGitCommit=missing-or-invalid",
        "budgetBuildIdentityReady=false"
      ]));
    }
  );

  it("routes incomplete current evidence through the binder for the complete tuple", () => {
    configureCurrentPerformanceTuple();
    delete process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED;

    const performanceBudget = performancePathItem();

    expect(performanceBudget).toEqual(expect.objectContaining({
      status: "review",
      nextAction: "Regenerate the current clean-build performance artifact, archive it, and use npm run sena:production-evidence:bind to bind the complete 10-key performance tuple; do not configure individual performance evidence keys by hand."
    }));
  });
});
