import { verifyEnterpriseServerJobWorkerHeartbeat } from "../lib/sena/enterprise/server-job-queue";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA server job worker heartbeat by writing a synthetic no-user-data job and exercising running/succeeded status callbacks.",
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
  console.error("SENA server job worker heartbeat is under review. Configure the managed queue, Postgres job store, worker runtime, callback, owner, and runbook before binding heartbeat evidence.");
  process.exit(1);
}

console.log("SENA server job worker heartbeat passed.");
