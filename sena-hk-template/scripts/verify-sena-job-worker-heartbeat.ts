import { verifyEnterpriseServerJobWorkerHeartbeat } from "../lib/sena/enterprise/server-job-queue";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Run the SENA same-process status-store CAS self-test with a synthetic no-user-data job; this is not external-worker readiness evidence.",
  command: "npm run sena:jobs:worker-heartbeat"
});

const heartbeat = await verifyEnterpriseServerJobWorkerHeartbeat();
emitVerificationArtifact({
  artifact: heartbeat,
  output: options.output,
  pathLabel: "serverJobWorkerHeartbeatArtifactPath",
  artifactSha256Label: "serverJobWorkerHeartbeatArtifactSha256",
  verifiedAtLabel: "serverJobWorkerHeartbeatVerifiedAt",
  verifiedAt: heartbeat.generatedAt
});

if (heartbeat.status !== "pass") {
  console.error("SENA status-store CAS self-test is under review. Configure the selected store prerequisites; this command never proves external-worker readiness.");
  process.exit(1);
}

console.log("SENA same-process status-store CAS self-test passed; external-worker readiness remains unproven.");
