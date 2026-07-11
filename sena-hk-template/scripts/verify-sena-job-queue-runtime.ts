import { verifyEnterpriseServerJobQueueProbe } from "../lib/sena/enterprise/server-job-queue";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA managed server job queue dispatch probe.",
  command: "npm run sena:jobs:queue-verify"
});
const probe = await verifyEnterpriseServerJobQueueProbe();
emitVerificationArtifact({
  artifact: probe,
  output: options.output,
  pathLabel: "serverJobQueueProbeArtifactPath",
  artifactSha256Label: "serverJobQueueProbeArtifactSha256",
  verifiedAtLabel: "serverJobQueueProbeVerifiedAt",
  verifiedAt: probe.generatedAt
});

if (probe.status !== "pass") {
  console.error("SENA server job queue live probe failed. Verify SENA_JOB_QUEUE_ADAPTER, destination URL, SENA_JOB_QUEUE_SECRET, provider token when required, endpoint HMAC validation, and managed queue availability.");
  process.exit(1);
}

console.log("SENA server job queue live probe passed.");
