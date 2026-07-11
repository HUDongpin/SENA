import { buildEnterpriseObjectStorageContract } from "../lib/sena/enterprise/object-storage-adapter";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Generate the SENA managed object-storage namespace and custody contract without reading provider secrets.",
  command: "npm run sena:object-storage:contract"
});
const contract = buildEnterpriseObjectStorageContract();
emitVerificationArtifact({
  artifact: contract,
  output: options.output,
  pathLabel: "objectStorageContractArtifactPath",
  artifactSha256Label: "objectStorageContractArtifactSha256",
  verifiedAtLabel: "objectStorageContractVerifiedAt",
  verifiedAt: contract.generatedAt
});

if (contract.status !== "pass") {
  console.error("SENA object-storage contract is under review. Inspect namespace, provider, redaction, and custody rules before using it as production evidence.");
  process.exit(1);
}

console.log("SENA object-storage contract generated.");
