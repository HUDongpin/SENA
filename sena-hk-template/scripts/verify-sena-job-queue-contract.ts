import { buildEnterpriseServerJobQueueContract } from "../lib/sena/enterprise/server-job-queue";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Generate the SENA managed server job queue contract without dispatching a live queue probe.",
  command: "npm run sena:jobs:queue-contract"
});
const contract = buildEnterpriseServerJobQueueContract();
emitVerificationArtifact({
  artifact: contract,
  output: options.output,
  pathLabel: "serverJobQueueContractArtifactPath",
  artifactSha256Label: "serverJobQueueContractArtifactSha256",
  verifiedAtLabel: "serverJobQueueContractVerifiedAt",
  verifiedAt: contract.generatedAt
});

if (contract.status !== "pass") {
  console.error("SENA server job queue contract is under review. Inspect provider modes, payload schema, signature, job store, retry/dead-letter, and redaction rules before using it as production evidence.");
  process.exit(1);
}

console.log("SENA server job queue contract generated.");
