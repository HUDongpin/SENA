import { describe, expect, it } from "vitest";
import {
  assertSenaServerJobWorkerExecutable,
  senaServerJobWorkerCapability,
  senaServerJobWorkerExecutableKinds
} from "../enterprise/server-job-worker-capabilities";
import { senaEnterpriseServerJobKinds } from "../enterprise/server-job-queue";

describe("SENA server-job executable capability registry", () => {
  it("fails closed at the route boundary unless every advertised heavy-job kind has a real executor", () => {
    expect(senaServerJobWorkerExecutableKinds).toEqual(senaEnterpriseServerJobKinds);
    for (const kind of senaEnterpriseServerJobKinds) {
      expect(senaServerJobWorkerCapability(kind)).toEqual({
        kind,
        status: "executable",
        executable: true,
        executionModes: ["signed-webhook", "local-polling"]
      });
      expect(assertSenaServerJobWorkerExecutable(kind).executable).toBe(true);
    }
  });
});
