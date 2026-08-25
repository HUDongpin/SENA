import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("SENA validation request scope round 26", () => {
  let dbDir: string | undefined;

  afterEach(() => {
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    if (dbDir) rmSync(dbDir, { recursive: true, force: true });
    dbDir = undefined;
    vi.resetModules();
  });

  it("keeps one verification cache across asynchronous route work and releases it afterward", async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-request-scope-"));
    process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
    vi.resetModules();
    const { observeSenaApiRoute } = await import("../api-helpers");
    const { currentSenaValidationSourceVerificationCache } = await import(
      "../enterprise/validation-request-scope"
    );
    let beforeAwait: unknown;
    let afterAwait: unknown;

    const response = await observeSenaApiRoute(
      new Request("https://sena.example.test/api/sena/request-scope", { method: "GET" }),
      { routeId: "sena-validation-request-scope-round26" },
      async () => {
        beforeAwait = currentSenaValidationSourceVerificationCache();
        await Promise.resolve();
        afterAwait = currentSenaValidationSourceVerificationCache();
        return Response.json({ status: "ok" });
      }
    );

    expect(response.status).toBe(200);
    expect(beforeAwait).toBeDefined();
    expect(afterAwait).toBe(beforeAwait);
    expect(currentSenaValidationSourceVerificationCache()).toBeUndefined();
  });
});
