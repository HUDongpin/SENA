import { buildEnterpriseCdnContract } from "../lib/sena/enterprise/cdn-verification";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Generate the SENA CDN compression and immutable-cache contract without reading provider secrets.",
  command: "npm run sena:cdn:contract"
});
const contract = buildEnterpriseCdnContract();
emitVerificationArtifact({
  artifact: contract,
  output: options.output,
  pathLabel: "cdnContractArtifactPath",
  artifactSha256Label: "cdnContractArtifactSha256",
  verifiedAtLabel: "cdnContractVerifiedAt",
  verifiedAt: contract.generatedAt
});

if (contract.status !== "pass") {
  console.error("SENA CDN contract is under review. Inspect compression, immutable-cache, cache-key, and redaction rules before using it as production evidence.");
  process.exit(1);
}

console.log("SENA CDN contract generated.");
