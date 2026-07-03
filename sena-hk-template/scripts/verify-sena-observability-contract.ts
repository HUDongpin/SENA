import { buildEnterpriseObservabilityContract } from "../lib/sena/enterprise/ops-observability";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Generate the SENA observability SLI, alerting, and exporter contract without reading provider secrets.",
  command: "npm run sena:observability:contract"
});
const contract = buildEnterpriseObservabilityContract();
emitVerificationArtifact({
  artifact: contract,
  output: options.output,
  pathLabel: "observabilityContractArtifactPath",
  artifactSha256Label: "observabilityContractArtifactSha256",
  verifiedAtLabel: "observabilityContractVerifiedAt",
  verifiedAt: contract.generatedAt
});

if (contract.status !== "pass") {
  console.error("SENA observability contract is under review. Inspect SLI, alerting, sample-store, exporter, and redaction rules before using it as production evidence.");
  process.exit(1);
}

console.log("SENA observability contract generated.");
