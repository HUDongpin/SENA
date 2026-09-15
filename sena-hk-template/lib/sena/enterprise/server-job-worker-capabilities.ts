import { SenaEnterpriseError } from "./errors";
import type { SenaEnterpriseServerJobKind } from "./server-job-queue";

export const senaServerJobWorkerExecutableKinds = [
  "analysis",
  "import",
  "publication-export",
  "reliability",
  "validation"
] as const satisfies readonly SenaEnterpriseServerJobKind[];

export function senaServerJobWorkerCapability(kind: SenaEnterpriseServerJobKind) {
  const executable = (senaServerJobWorkerExecutableKinds as readonly string[]).includes(kind);
  return {
    kind,
    status: executable ? "executable" as const : "unavailable" as const,
    executable,
    executionModes: executable ? ["signed-webhook", "local-polling"] as const : [] as const
  };
}

export function assertSenaServerJobWorkerExecutable(kind: SenaEnterpriseServerJobKind) {
  const capability = senaServerJobWorkerCapability(kind);
  if (!capability.executable) {
    throw new SenaEnterpriseError(
      "The required SENA server-job worker capability is unavailable.",
      503,
      "server_job_worker_capability_unavailable"
    );
  }
  return capability;
}
