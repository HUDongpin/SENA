import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

async function readinessFor(target: string, platform = "1", mode = "self-managed") {
  const directory = mkdtempSync(join(tmpdir(), "sena-preview-readiness-"));
  directories.push(directory);
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", platform);
  vi.stubEnv("VERCEL_ENV", target);
  vi.stubEnv("SENA_ENTERPRISE_DEPLOYMENT_MODE", mode);
  vi.stubEnv("SENA_ENTERPRISE_DB_DIR", directory);
  vi.stubEnv("SENA_APP_URL", "https://preview.sena.hk");
  vi.stubEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED", "");
  const { getEnterpriseDeploymentReadiness } = await import("../enterprise/ops-deployment-readiness");
  return getEnterpriseDeploymentReadiness();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("preview rehearsal readiness", () => {
  it("defers only the production-domain receipt while retaining its pending production evidence", async () => {
    const readiness = await readinessFor("preview");
    expect(readiness.summary.blockers).not.toContain("production-runtime-header");
    expect(readiness.deferredProductionChecks).toEqual([
      expect.objectContaining({ id: "production-runtime-header", status: "review" })
    ]);
    expect(readiness.environment.deploymentTarget).toBe("preview");
    expect(readiness.productionAcceptanceAllowed).toBe(false);
    expect(readiness.productionPerformancePath.status).toBe("review");
    expect(readiness.productionPerformancePath.summary.blockers).toContain("production-runtime-header");
    expect(readiness.runbook.requiredBeforeProduction.join(" ")).toContain("www.sena.hk");
    expect(readiness.summary.blockers).toEqual(expect.arrayContaining([
      "production-postgres-state", "production-conference-load-rehearsal", "backup-freshness"
    ]));
    expect(readiness.status).toBe("blocked");
  });

  it.each([
    ["production", "1", "self-managed"],
    ["preview", "", "self-managed"],
    ["preview", "1", "institution-managed"]
  ])("retains the production requirement for target=%s platform=%s mode=%s", async (target, platform, mode) => {
    const readiness = await readinessFor(target, platform, mode);
    expect(readiness.summary.blockers).toContain("production-runtime-header");
    expect(readiness.deferredProductionChecks).toEqual([]);
  });

  it("preserves the strict deployment manifest while deferring only its production preflight", async () => {
    const readiness = await readinessFor("preview");
    const { getEnterpriseOrganizationDeploymentPackage } = await import("../enterprise/ops-deployment");
    const deployment = getEnterpriseOrganizationDeploymentPackage({ readiness });
    const manifest = deployment.productionEvidenceManifest;
    expect(manifest.items.find((item) => item.id === "vercel-production-preflight")?.status)
      .toBe("missing-required");
    expect(manifest.status).toBe("blocked");
    expect(deployment.summary.deferredProductionEvidenceIds).toEqual(["vercel-production-preflight"]);
    expect(deployment.summary.operationalProductionEvidenceMissingRequired)
      .toBe(manifest.summary.missingRequired - 1);
    expect(deployment.summary.operationalProductionEvidenceStatus).toBe("blocked");
    expect(deployment.status).toBe("blocked");
    expect(deployment.environment.deploymentTarget).toBe("preview");
  });
});
