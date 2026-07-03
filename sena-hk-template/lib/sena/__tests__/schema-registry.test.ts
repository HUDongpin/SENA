import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildSenaProductionPageContract } from "../production-page-contract";
import { buildSenaRuntimeBundle } from "../runtime-bundle";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaModel } from "../model";
import {
  assertSenaSchemaVersion,
  createSenaSchemaPayload,
  getSenaSchemaVersion,
  hasSenaSchemaVersion,
  isSenaSchemaVersion,
  listSenaSchemaVersions,
  SENA_SCHEMA_VERSIONS
} from "../schema-registry";

const productionSourceRoots = ["app", "components", "lib"];
const schemaRegistryPath = path.join(process.cwd(), "lib", "sena", "schema-registry.ts");

function collectProductionSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      if (entry === "__tests__" || entry === ".next" || entry === "node_modules") return [];
      return collectProductionSourceFiles(entryPath);
    }

    if (!/\.(ts|tsx)$/.test(entryPath)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entryPath)) return [];
    if (entryPath === schemaRegistryPath) return [];
    return [entryPath];
  });
}

describe("SENA schema registry", () => {
  it("centralizes core v1 contract identifiers without changing emitted schemas", () => {
    expect(SENA_SCHEMA_VERSIONS.productionPageContract).toBe("sena-production-page-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.runtimeBundle).toBe("sena-runtime-bundle/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseDb).toBe("sena-enterprise-db/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseCdnContract).toBe("sena-enterprise-cdn-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseCdnProbe).toBe("sena-enterprise-cdn-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservabilitySli).toBe("sena-enterprise-observability-sli/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe).toBe("sena-enterprise-observability-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservedRequest).toBe("sena-enterprise-observed-request/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal).toBe("sena-enterprise-go-live-rehearsal/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseGoLiveCloseoutCheck).toBe("sena-go-live-closeout-check/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePrimaryStateRuntime).toBe("sena-enterprise-primary-state-runtime/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseAuditStoreRuntime).toBe("sena-enterprise-audit-store-runtime/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJob).toBe("sena-enterprise-server-job/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobList).toBe("sena-enterprise-server-job-list/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate).toBe("sena-enterprise-server-job-status-update/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueue).toBe("sena-enterprise-server-job-queue/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract).toBe("sena-enterprise-server-job-queue-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook).toBe("sena-enterprise-server-job-queue-webhook/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhookReceipt).toBe("sena-enterprise-server-job-queue-webhook-receipt/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobStoreRuntime).toBe("sena-enterprise-server-job-store-runtime/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract).toBe("sena-enterprise-server-job-worker-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat).toBe("sena-enterprise-server-job-worker-heartbeat/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract).toBe("sena-enterprise-object-storage-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObjectStorageNative).toBe("sena-enterprise-object-storage-native/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe).toBe("sena-enterprise-object-storage-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract).toBe("sena-enterprise-observability-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePostgresProbe).toBe("sena-enterprise-postgres-probe/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract).toBe("sena-enterprise-postgres-schema-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget).toBe("sena-enterprise-production-performance-budget/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody).toBe("sena-performance-source-custody/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal).toBe("sena-enterprise-conference-load-rehearsal/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseConferenceRehearsalPlan).toBe("sena-enterprise-conference-rehearsal-plan/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest).toBe("sena-enterprise-production-evidence-manifest/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceArchive).toBe("sena-enterprise-production-evidence-archive/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight).toBe("sena-enterprise-vercel-production-preflight/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket).toBe("sena-enterprise-production-runtime-env-packet/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate).toBe("sena-enterprise-production-go-live-gate/v1");

    expect(getSenaSchemaVersion("productionPageContract")).toBe(buildSenaProductionPageContract().schemaVersion);

    const model = buildSenaModel(lessonStudySenaContract);
    const bundle = buildSenaRuntimeBundle(model, { sourceDataset: lessonStudySenaContract });
    expect(getSenaSchemaVersion("runtimeBundle")).toBe(bundle.schemaVersion);
  });

  it("provides registry introspection and runtime validation helpers", () => {
    const versions = listSenaSchemaVersions();
    expect(versions).toContain("sena-review-packet/v1");
    expect(versions).toContain("sena-enterprise-platform-decision-register/v1");
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((schemaVersion) => /^sena-.+\/v\d+$/.test(schemaVersion))).toBe(true);

    expect(isSenaSchemaVersion("sena-runtime-bundle/v1")).toBe(true);
    expect(isSenaSchemaVersion("sena-runtime-bundle/v2")).toBe(false);
  });

  it("builds and checks schema-versioned payloads through the registry interface", () => {
    const payload = createSenaSchemaPayload("validationRunList", {
      validationRuns: [{ id: "val_1" }]
    });

    expect(payload).toEqual({
      schemaVersion: SENA_SCHEMA_VERSIONS.validationRunList,
      validationRuns: [{ id: "val_1" }]
    });
    expect(hasSenaSchemaVersion(payload, "validationRunList")).toBe(true);
    expect(hasSenaSchemaVersion(payload, "reviewPacket")).toBe(false);
    expect(assertSenaSchemaVersion(payload, "validationRunList")).toBe(payload);
    expect(() => assertSenaSchemaVersion(payload, "reviewPacket")).toThrow("Expected sena-review-packet/v1");
  });

  it("keeps runtime bundle emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "runtime-bundle.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
  });

  it("keeps review packet emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "review-packet.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
    expect(source).not.toMatch(/schemaVersion\s+===\s+"sena-[^"]+\/v\d+"/);
  });

  it("keeps report emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "report.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
  });

  it("keeps publication export emitted schema versions behind the registry module", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "publication-export.ts"), "utf8");

    expect(source).not.toMatch(/schemaVersion:\s*"sena-[^"]+\/v\d+"/);
  });

  it("keeps production source schema versions behind the registry module", () => {
    const files = productionSourceRoots.flatMap((root) => collectProductionSourceFiles(path.join(process.cwd(), root)));
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return source
        .split("\n")
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => /schemaVersion.*["']sena-[^"']+\/v\d+["']/.test(line))
        .map(({ line, lineNumber }) => `${path.relative(process.cwd(), file)}:${lineNumber}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});
