import { getEnterpriseServerJobWorkerContract } from "../lib/sena/enterprise/server-job-worker-contract";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA external server job worker contract.",
  command: "npm run sena:jobs:worker-contract"
});
const contract = getEnterpriseServerJobWorkerContract();
emitVerificationArtifact({
  artifact: contract,
  output: options.output,
  pathLabel: "serverJobWorkerContractArtifactPath",
  artifactSha256Label: "serverJobWorkerContractArtifactSha256",
  verifiedAtLabel: "serverJobWorkerContractVerifiedAt",
  verifiedAt: contract.generatedAt
});

if (!contract.productionReady) {
  console.error("SENA server job worker contract is not production-ready. The same-process status-store self-test cannot replace a nonce-bound managed-queue to external-worker authenticated callback receipt.");
  process.exit(1);
}

console.log("SENA server job worker contract passed.");
