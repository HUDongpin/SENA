import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const envNamesToClear = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SENA_DATABASE_URL",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_OBJECT_STORAGE_ADAPTER",
  "SENA_OBJECT_STORAGE_ENDPOINT",
  "SENA_OBJECT_STORAGE_BUCKET",
  "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
  "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "SENA_CDN_VERIFY_URL",
  "SENA_CDN_URL",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_OBSERVABILITY_EXPORTER_URL",
  "SENA_OBSERVABILITY_EXPORTER_SECRET"
];

function cleanEnv() {
  const env = { ...process.env };
  for (const name of envNamesToClear) delete env[name];
  return env;
}

function expectWrittenArtifact(outputPath: string, expectedSchemaVersion: string) {
  const artifactText = readFileSync(outputPath, "utf8");
  const shaText = readFileSync(`${outputPath}.sha256`, "utf8").trim();
  const expectedSha = createHash("sha256").update(artifactText).digest("hex");
  const artifact = JSON.parse(artifactText) as { schemaVersion?: string };

  expect(artifact.schemaVersion).toBe(expectedSchemaVersion);
  expect(shaText).toBe(`${expectedSha}  ${path.basename(outputPath)}`);
  expect(artifactText).not.toContain("postgres://");
  expect(artifactText).not.toContain("super-secret");
  expect(artifactText).not.toContain("example.neon.tech");
}

describe("SENA verifier artifact output", () => {
  it("writes redacted artifact and sha256 files for failed or review probe scripts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-verifier-output-"));
    const scripts = [
      {
        script: "scripts/verify-sena-postgres-runtime.ts",
        output: "postgres.json",
        schemaVersion: "sena-enterprise-postgres-probe/v1",
        pathLabel: "postgresProbeArtifactPath"
      },
      {
        script: "scripts/verify-sena-object-storage-runtime.ts",
        output: "object-storage.json",
        schemaVersion: "sena-enterprise-object-storage-probe/v1",
        pathLabel: "objectStorageProbeArtifactPath"
      },
      {
        script: "scripts/verify-sena-cdn-runtime.ts",
        output: "cdn.json",
        schemaVersion: "sena-enterprise-cdn-probe/v1",
        pathLabel: "cdnProbeArtifactPath"
      },
      {
        script: "scripts/verify-sena-job-queue-runtime.ts",
        output: "server-job-queue.json",
        schemaVersion: "sena-enterprise-server-job-queue-probe/v1",
        pathLabel: "serverJobQueueProbeArtifactPath"
      },
      {
        script: "scripts/verify-sena-observability-runtime.ts",
        output: "observability.json",
        schemaVersion: "sena-enterprise-observability-probe/v1",
        pathLabel: "observabilityProbeArtifactPath"
      },
      {
        script: "scripts/verify-sena-job-worker-contract.ts",
        output: "server-job-worker-contract.json",
        schemaVersion: "sena-enterprise-server-job-worker-contract/v1",
        pathLabel: "serverJobWorkerContractArtifactPath"
      },
      {
        script: "scripts/check-sena-go-live-readiness.ts",
        output: "go-live-closeout.json",
        schemaVersion: "sena-go-live-closeout-check/v1",
        pathLabel: "goLiveCloseoutCheckArtifactPath"
      }
    ];

    try {
      for (const entry of scripts) {
        const outputPath = path.join(root, entry.output);
        const result = spawnSync("./node_modules/.bin/vite-node", [
          entry.script,
          "--output",
          outputPath
        ], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: cleanEnv()
        });

        expect(result.status).toBe(1);
        expect(result.stdout).toContain(`${entry.pathLabel}=${outputPath}`);
        expectWrittenArtifact(outputPath, entry.schemaVersion);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
