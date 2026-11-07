import { afterEach, describe, expect, it, vi } from "vitest";

const legacyKeys = [
  "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION"
];

afterEach(() => {
  for (const key of legacyKeys) delete process.env[key];
  vi.resetModules();
});

describe("durable external-worker proof readiness", () => {
  it("includes the separate proof table in the additive Postgres schema contract", async () => {
    const { buildEnterprisePostgresSchemaContract } = await import("../enterprise-postgres");
    const contract = await buildEnterprisePostgresSchemaContract();
    expect(contract.status).toBe("pass");
    expect(contract.tables.some((table) => table.name === "sena_enterprise_worker_proofs")).toBe(true);
    expect(contract.summary.destructiveDdlStatementCount).toBe(0);
  });

  it("supports the proof protocol while refusing operator flags without a durable receipt", async () => {
    process.env.SENA_JOB_WORKER_CONTRACT_CONFIRMED = "1";
    process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256 = "a".repeat(64);
    process.env.SENA_JOB_WORKER_CONTRACT_VERIFIED_AT = new Date().toISOString();
    process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION = "pass";
    const { getEnterpriseServerJobWorkerContract, serverJobWorkerContractReadiness } =
      await import("../enterprise/server-job-worker-contract");
    const contract = getEnterpriseServerJobWorkerContract();
    expect(contract.worker.externalWorkerCallbackReceiptSupported).toBe(true);
    expect(contract.worker.externalWorkerCallbackReceiptConfirmed).toBe(false);
    expect(contract.productionReady).toBe(false);
    expect(serverJobWorkerContractReadiness().confirmed).toBe(false);
  });
});
