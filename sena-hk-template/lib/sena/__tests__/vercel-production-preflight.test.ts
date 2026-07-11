import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

function writeFakeVercel(binDir: string, options: {
  includePostgresUrl?: boolean;
  postgresUrlEnvName?: string;
  includeR2ObjectStorage?: boolean;
  includeVercelBlobObjectStorage?: boolean;
  includeVercelBlobStoreOnly?: boolean;
  includeQstashQueue?: boolean;
  includeObservabilityAliases?: boolean;
  includeCdnEvidence?: boolean;
  includeProductionRuntimeEnvPacket?: boolean;
  includeProductionGoLiveGate?: boolean;
  includeDomainAlias?: boolean;
  failDomainInspect?: boolean;
  includeLegacyDbDir?: boolean;
} = {}) {
  const scriptPath = path.join(binDir, "vercel");
  const postgresUrlEnvName = options.postgresUrlEnvName ?? "POSTGRES_URL";
  const postgresEnvLines = options.includePostgresUrl ? `
  echo " SENA_ENTERPRISE_DB_ADAPTER        Encrypted           Production"
  echo " SENA_ENTERPRISE_STATE_STORE       Encrypted           Production"
  echo " ${postgresUrlEnvName}                      Encrypted           Production"` : "";
  const cdnEnvLines = options.includeCdnEvidence ? `
  echo " SENA_CDN_VERIFY_URL               Encrypted           Production"
  echo " SENA_CDN_CONTRACT_CONFIRMED       Encrypted           Production"
  echo " SENA_CDN_CONTRACT_ARTIFACT_SHA256 Encrypted           Production"
  echo " SENA_CDN_CONTRACT_VERIFIED_AT     Encrypted           Production"
  echo " SENA_CDN_CONTRACT_ARTIFACT_VALIDATION Encrypted       Production"
  echo " SENA_CDN_LIVE_PROBE_CONFIRMED     Encrypted           Production"
  echo " SENA_CDN_PROBE_ARTIFACT_SHA256    Encrypted           Production"
  echo " SENA_CDN_PROBE_VERIFIED_AT        Encrypted           Production"
  echo " SENA_CDN_PROBE_ARTIFACT_VALIDATION Encrypted          Production"` : "";
  const r2ObjectStorageEnvLines = options.includeR2ObjectStorage ? `
  echo " R2_ACCOUNT_ID                     Encrypted           Production"
  echo " R2_BUCKET_NAME                    Encrypted           Production"
  echo " R2_ACCESS_KEY_ID                  Encrypted           Production"
  echo " R2_SECRET_ACCESS_KEY              Encrypted           Production"` : "";
  const vercelBlobObjectStorageEnvLines = options.includeVercelBlobObjectStorage ? `
  echo " BLOB_READ_WRITE_TOKEN             Encrypted           Production"
  echo " BLOB_STORE_ID                     Encrypted           Production"` : "";
  const vercelBlobStoreOnlyEnvLines = options.includeVercelBlobStoreOnly ? `
  echo " BLOB_STORE_ID                     Encrypted           Production"` : "";
  const qstashQueueEnvLines = options.includeQstashQueue ? `
  echo " QSTASH_TOKEN                      Encrypted           Production"
  echo " QSTASH_QUEUE_NAME                 Encrypted           Production"
  echo " SENA_JOB_WORKER_CALLBACK_URL      Encrypted           Production"
  echo " SENA_JOB_QUEUE_SECRET             Encrypted           Production"
  echo " SENA_JOB_QUEUE_CONTRACT_CONFIRMED       Encrypted           Production"
  echo " SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256 Encrypted           Production"
  echo " SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT     Encrypted           Production"
  echo " SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION Encrypted       Production"` : "";
  const observabilityAliasEnvLines = options.includeObservabilityAliases ? `
  echo " OBSERVABILITY_OWNER               Encrypted           Production"
  echo " OBSERVABILITY_WEBHOOK_URL         Encrypted           Production"
  echo " OBSERVABILITY_WEBHOOK_SECRET      Encrypted           Production"
  echo " OBSERVABILITY_DASHBOARD_URL       Encrypted           Production"
  echo " OBSERVABILITY_RUNBOOK_URL         Encrypted           Production"
  echo " ALERT_WEBHOOK_URL                 Encrypted           Production"
  echo " ALERT_WEBHOOK_SECRET              Encrypted           Production"
  echo " SENA_OBSERVABILITY_CONTRACT_CONFIRMED       Encrypted           Production"
  echo " SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256 Encrypted           Production"
  echo " SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT     Encrypted           Production"
  echo " SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION Encrypted       Production"` : "";
  const productionRuntimeEnvPacketLines = options.includeProductionRuntimeEnvPacket ? `
  echo " SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED                 Encrypted           Production"
  echo " SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256           Encrypted           Production"
  echo " SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT               Encrypted           Production"
  echo " SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS                    Encrypted           Production"
  echo " SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS     Encrypted           Production"
  echo " SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS  Encrypted           Production"` : "";
  const productionGoLiveGateLines = options.includeProductionGoLiveGate ? `
  echo " SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED                       Encrypted           Production"
  echo " SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256                 Encrypted           Production"
  echo " SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT                     Encrypted           Production"
  echo " SENA_PRODUCTION_GO_LIVE_GATE_STATUS                          Encrypted           Production"
  echo " SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY                Encrypted           Production"
  echo " SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS                   Encrypted           Production"
  echo " SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS                    Encrypted           Production"` : "";
  const legacyDbDirEnvLine = options.includeLegacyDbDir ? `
  echo " SENA_ENTERPRISE_DB_DIR           Encrypted           Production"` : "";
  writeFileSync(scriptPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 54.9.0"
  exit 0
fi
if [ "$1" = "inspect" ]; then
  echo "Fetching deployment"
  echo '{"name":"sena-hk","url":"sena-secret-deployment.vercel.app","readyState":"READY","target":"production","aliases":${options.includeDomainAlias ? '["www.sena.hk","sena-hk.vercel.app"]' : '[]'}}'
  exit 0
fi
if [ "$1" = "domains" ] && [ "$2" = "inspect" ]; then
  ${options.failDomainInspect ? 'echo "access denied" >&2\n  exit 1' : ""}
  echo "Project Domains"
  echo "www.sena.hk"
  exit 0
fi
if [ "$1" = "env" ] && [ "$2" = "ls" ]; then
  echo " name                               value               environments"
  echo " SENA_APP_URL                       Encrypted           Production"
  echo " NEXT_PUBLIC_SENA_APP_URL           Encrypted           Production"
  echo " SENA_SESSION_SECRET                Encrypted           Production"
  echo " SENA_CSRF_SECRET                   Encrypted           Production"
  echo " SENA_MFA_ENCRYPTION_KEY            Encrypted           Production"
  echo " SENA_OPS_TOKEN                     Encrypted           Production"
${postgresEnvLines}
${r2ObjectStorageEnvLines}
${vercelBlobObjectStorageEnvLines}
${vercelBlobStoreOnlyEnvLines}
${qstashQueueEnvLines}
${observabilityAliasEnvLines}
${cdnEnvLines}
${productionRuntimeEnvPacketLines}
${productionGoLiveGateLines}
${legacyDbDirEnvLine}
  exit 0
fi
echo "unexpected vercel args: $*" >&2
exit 1
`);
  chmodSync(scriptPath, 0o755);
}

describe("SENA Vercel production preflight", () => {
  it("emits a redacted Vercel preflight artifact with env names but no values", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir);
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          SENA_ENTERPRISE_POSTGRES_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
        }
      });
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as {
        schemaVersion?: string;
        status?: string;
        summary?: { blockers?: string[] };
        env?: {
          presentNames?: string[];
          requirements?: Array<{ id?: string; keys?: string[] }>;
          advisoryRequirements?: Array<{ id?: string; present?: boolean; keys?: string[]; missing?: string[]; evidence?: string[] }>;
        };
        http?: { runtimeStatus?: string; expectedRuntimeValues?: string[]; evidence?: string[] };
        summary?: { advisoryChecks?: number; advisoryPass?: number; advisoryReview?: number };
        deployment?: { deploymentUrlHash?: string };
      };
      const expectedSha = createHash("sha256").update(artifactText).digest("hex");
      const shaText = readFileSync(`${outputPath}.sha256`, "utf8").trim();

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`vercelProductionPreflightArtifactPath=${outputPath}`);
      expect(artifact.schemaVersion).toBe("sena-enterprise-vercel-production-preflight/v1");
      expect(artifact.status).toBe("review");
      expect(artifact.summary?.blockers).toEqual(expect.arrayContaining([
        "neon-postgres-env",
        "object-storage-env",
        "server-job-queue-env",
        "observability-env",
        "cdn-evidence-env",
        "live-http",
        "runtime-header"
      ]));
      expect(artifact.env?.presentNames).toEqual(expect.arrayContaining([
        "SENA_APP_URL",
        "NEXT_PUBLIC_SENA_APP_URL",
        "SENA_SESSION_SECRET",
        "SENA_CSRF_SECRET",
        "SENA_MFA_ENCRYPTION_KEY",
        "SENA_OPS_TOKEN"
      ]));
      expect(artifact.env?.requirements?.find((entry) => entry.id === "observability-env")?.keys).toEqual(expect.arrayContaining([
        "SENA_OBSERVABILITY_DASHBOARD_URL",
        "SENA_OBSERVABILITY_RUNBOOK_URL",
        "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
        "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
        "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
        "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
      ]));
      expect(artifact.env?.requirements?.find((entry) => entry.id === "legacy-local-file-env")).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(artifact.env?.advisoryRequirements?.find((entry) => entry.id === "production-runtime-env-packet-custody")).toEqual(expect.objectContaining({
        present: false,
        keys: expect.arrayContaining([
          "SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED",
          "SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256",
          "SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT"
        ])
      }));
      expect(artifact.env?.advisoryRequirements?.find((entry) => entry.id === "production-runtime-env-packet-custody")?.evidence)
        .toContain("advisoryOnly=true");
      expect(artifact.env?.advisoryRequirements?.find((entry) => entry.id === "production-go-live-gate-custody")).toEqual(expect.objectContaining({
        present: false,
        keys: expect.arrayContaining([
          "SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED",
          "SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256",
          "SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT"
        ])
      }));
      expect(artifact.summary).toEqual(expect.objectContaining({
        advisoryChecks: 2,
        advisoryPass: 0,
        advisoryReview: 2
      }));
      expect(artifact.http).toEqual(expect.objectContaining({
        runtimeStatus: "skipped",
        expectedRuntimeValues: ["enterprise-neon", "enterprise-postgres"]
      }));
      expect(artifact.http?.evidence).toEqual(expect.arrayContaining([
        "httpProbeMethod=skipped",
        "httpProbeAttempts=none",
        "httpProbeError=none",
        "httpProbeTimeoutMs=5000"
      ]));
      expect(artifact.deployment?.deploymentUrlHash).toMatch(/^[a-f0-9]{64}$/);
      expect(shaText).toBe(`${expectedSha}  vercel-preflight.json`);
      expect(artifactText).not.toContain("postgres://");
      expect(artifactText).not.toContain("super-secret");
      expect(artifactText).not.toContain("example.neon.tech");
      expect(artifactText).not.toContain("sena-secret-deployment.vercel.app");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it("accepts a Vercel/Neon POSTGRES_URL when adapter and state store env names are present", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-postgres-url-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includePostgresUrl: true,
        includeCdnEvidence: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as {
        summary?: { blockers?: string[] };
        http?: { runtimeStatus?: string };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; keys?: string[] }>;
        };
      };
      const postgresRequirement = artifact.env?.requirements?.find((entry) => entry.id === "neon-postgres-env");

      expect(result.status).toBe(1);
      expect(postgresRequirement).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(postgresRequirement?.keys).toEqual(expect.arrayContaining([
        "SENA_ENTERPRISE_POSTGRES_URL",
        "SENA_DATABASE_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
        "NEON_DATABASE_URL"
      ]));
      expect(artifact.summary?.blockers).not.toContain("neon-postgres-env");
      expect(artifact.summary?.blockers).not.toContain("cdn-evidence-env");
      expect(artifact.summary?.blockers).toEqual(expect.arrayContaining([
        "object-storage-env",
        "server-job-queue-env",
        "observability-env",
        "live-http",
        "runtime-header"
      ]));
      expect(artifact.http?.runtimeStatus).toBe("skipped");
      expect(artifactText).not.toContain("postgres://");
      expect(artifactText).not.toContain("super-secret");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks Vercel production when the legacy local file state env name is still configured", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-legacy-db-dir-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includePostgresUrl: true,
        includeCdnEvidence: true,
        includeLegacyDbDir: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; evidence?: string[] }>;
          presentNames?: string[];
        };
      };
      const requirement = artifact.env?.requirements?.find((entry) => entry.id === "legacy-local-file-env");

      expect(result.status).toBe(1);
      expect(artifact.env?.presentNames).toContain("SENA_ENTERPRISE_DB_DIR");
      expect(requirement).toEqual(expect.objectContaining({
        present: false,
        missing: ["remove:SENA_ENTERPRISE_DB_DIR"]
      }));
      expect(requirement?.evidence).toEqual(expect.arrayContaining([
        "mode=forbid-production-local-file-state-env",
        "configuredForbiddenKeys=SENA_ENTERPRISE_DB_DIR"
      ]));
      expect(artifact.summary?.blockers).toContain("legacy-local-file-env");
      expect(artifactText).not.toContain(".sena-enterprise");
      expect(artifactText).not.toContain("enterprise-db.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports production runtime env packet and go-live gate custody as non-blocking advisory evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-runtime-packet-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeProductionRuntimeEnvPacket: true,
        includeProductionGoLiveGate: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as {
        env?: {
          advisoryRequirements?: Array<{ id?: string; present?: boolean; missing?: string[]; evidence?: string[] }>;
        };
        summary?: { blockers?: string[]; advisoryChecks?: number; advisoryPass?: number; advisoryReview?: number };
      };
      const packetAdvisory = artifact.env?.advisoryRequirements?.find((entry) => entry.id === "production-runtime-env-packet-custody");
      const gateAdvisory = artifact.env?.advisoryRequirements?.find((entry) => entry.id === "production-go-live-gate-custody");

      expect(result.status).toBe(1);
      expect(packetAdvisory).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(packetAdvisory?.evidence).toEqual(expect.arrayContaining([
        "mode=all-advisory",
        "present=true",
        "advisoryOnly=true"
      ]));
      expect(gateAdvisory).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(gateAdvisory?.evidence).toEqual(expect.arrayContaining([
        "mode=all-advisory",
        "present=true",
        "advisoryOnly=true"
      ]));
      expect(artifact.summary).toEqual(expect.objectContaining({
        advisoryChecks: 2,
        advisoryPass: 2,
        advisoryReview: 0
      }));
      expect(artifact.summary?.blockers).not.toContain("production-runtime-env-packet-custody");
      expect(artifact.summary?.blockers).not.toContain("production-go-live-gate-custody");
      expect(artifact.summary?.blockers).toEqual(expect.arrayContaining([
        "neon-postgres-env",
        "object-storage-env",
        "server-job-queue-env",
        "observability-env"
      ]));
      expect(artifactText).not.toContain("postgres://");
      expect(artifactText).not.toContain("super-secret");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a Vercel Postgres Prisma URL env name when adapter and state store are present", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-postgres-prisma-url-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includePostgresUrl: true,
        postgresUrlEnvName: "POSTGRES_PRISMA_URL",
        includeCdnEvidence: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[] }>;
        };
      };
      const postgresRequirement = artifact.env?.requirements?.find((entry) => entry.id === "neon-postgres-env");

      expect(result.status).toBe(1);
      expect(postgresRequirement).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(artifact.summary?.blockers).not.toContain("neon-postgres-env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts Cloudflare R2 object-storage env names in Vercel production", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-r2-object-storage-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeR2ObjectStorage: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; keys?: string[]; evidence?: string[] }>;
        };
      };
      const requirement = artifact.env?.requirements?.find((entry) => entry.id === "object-storage-env");

      expect(result.status).toBe(1);
      expect(requirement).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(requirement?.keys).toEqual(expect.arrayContaining([
        "R2_ACCOUNT_ID",
        "R2_BUCKET_NAME",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY"
      ]));
      expect(requirement?.evidence).toContain("mode=canonical-sena-or-cloudflare-r2-or-vercel-blob");
      expect(artifact.summary?.blockers).not.toContain("object-storage-env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts Vercel Blob object-storage env names in Vercel production", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-vercel-blob-object-storage-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeVercelBlobObjectStorage: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; keys?: string[]; evidence?: string[] }>;
        };
      };
      const requirement = artifact.env?.requirements?.find((entry) => entry.id === "object-storage-env");

      expect(result.status).toBe(1);
      expect(requirement).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(requirement?.keys).toEqual(expect.arrayContaining([
        "BLOB_READ_WRITE_TOKEN",
        "BLOB_STORE_ID",
        "VERCEL_OIDC_TOKEN"
      ]));
      expect(requirement?.evidence).toContain("mode=canonical-sena-or-cloudflare-r2-or-vercel-blob");
      expect(requirement?.evidence).toContain("vercelBlobSignal=true");
      expect(artifact.summary?.blockers).not.toContain("object-storage-env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires a Vercel Blob token or OIDC token when only a Blob store id is configured", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-vercel-blob-store-only-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeVercelBlobStoreOnly: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; evidence?: string[] }>;
        };
      };
      const requirement = artifact.env?.requirements?.find((entry) => entry.id === "object-storage-env");

      expect(result.status).toBe(1);
      expect(requirement).toEqual(expect.objectContaining({
        present: false
      }));
      expect(requirement?.missing).toEqual(expect.arrayContaining([
        "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN|BLOB_READ_WRITE_TOKEN|SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN|VERCEL_OIDC_TOKEN"
      ]));
      expect(requirement?.evidence).toContain("vercelBlobSignal=true");
      expect(artifact.summary?.blockers).toContain("object-storage-env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts Upstash QStash queue env names in Vercel production", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-qstash-queue-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeQstashQueue: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; keys?: string[]; evidence?: string[] }>;
        };
      };
      const requirement = artifact.env?.requirements?.find((entry) => entry.id === "server-job-queue-env");

      expect(result.status).toBe(1);
      expect(requirement).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(requirement?.keys).toEqual(expect.arrayContaining([
        "QSTASH_TOKEN",
        "QSTASH_QUEUE_NAME",
        "SENA_JOB_WORKER_CALLBACK_URL",
        "SENA_JOB_QUEUE_SECRET",
        "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
        "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
        "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
        "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION"
      ]));
      expect(requirement?.evidence).toContain("mode=canonical-sena-or-upstash-qstash");
      expect(requirement?.evidence).toContain("qstashSignal=true");
      expect(requirement?.evidence).toContain("contractEvidence=true");
      expect(artifact.summary?.blockers).not.toContain("server-job-queue-env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts generic observability and alert aliases in Vercel production", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-observability-aliases-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeObservabilityAliases: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        summary?: { blockers?: string[] };
        env?: {
          requirements?: Array<{ id?: string; present?: boolean; missing?: string[]; keys?: string[]; evidence?: string[] }>;
        };
      };
      const requirement = artifact.env?.requirements?.find((entry) => entry.id === "observability-env");

      expect(result.status).toBe(1);
      expect(requirement).toEqual(expect.objectContaining({
        present: true,
        missing: []
      }));
      expect(requirement?.keys).toEqual(expect.arrayContaining([
        "OBSERVABILITY_OWNER",
        "OBSERVABILITY_WEBHOOK_URL",
        "OBSERVABILITY_WEBHOOK_SECRET",
        "OBSERVABILITY_DASHBOARD_URL",
        "OBSERVABILITY_RUNBOOK_URL",
        "ALERT_WEBHOOK_URL",
        "ALERT_WEBHOOK_SECRET",
        "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
        "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
        "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
        "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
      ]));
      expect(requirement?.evidence).toContain("mode=canonical-sena-or-generic-observability-aliases");
      expect(requirement?.evidence).toContain("exporterSignal=true");
      expect(requirement?.evidence).toContain("contractEvidence=true");
      expect(artifact.summary?.blockers).not.toContain("observability-env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts deployment aliases as domain evidence when domain inspect is unavailable", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-vercel-preflight-domain-alias-"));
    const binDir = path.join(root, "bin");
    const outputPath = path.join(root, "vercel-preflight.json");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, {
        includeDomainAlias: true,
        failDomainInspect: true
      });
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-vercel-production.ts",
        "--scope",
        "test-team",
        "--skip-http",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const artifact = JSON.parse(readFileSync(outputPath, "utf8")) as {
        domain?: {
          status?: string;
          deploymentAliasMatched?: boolean;
          evidence?: string[];
        };
        summary?: { blockers?: string[] };
      };

      expect(result.status).toBe(1);
      expect(artifact.domain).toEqual(expect.objectContaining({
        status: "pass",
        deploymentAliasMatched: true
      }));
      expect(artifact.domain?.evidence).toEqual(expect.arrayContaining([
        "domainInspectExit=1",
        "deploymentAliasMatched=true",
        "deploymentAliasCount=2"
      ]));
      expect(artifact.summary?.blockers).not.toContain("domain-configured");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
