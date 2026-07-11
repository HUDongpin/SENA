import { buildEnterpriseProductionEvidenceManifest } from "../lib/sena/enterprise/ops-production-evidence";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA production evidence manifest.",
  command: "npm run sena:production-evidence:check",
  outputDescription: "Write the redacted manifest JSON and <file>.sha256 custody hash."
});
const manifest = buildEnterpriseProductionEvidenceManifest();
emitVerificationArtifact({
  artifact: manifest,
  output: options.output,
  pathLabel: "productionEvidenceManifestArtifactPath",
  artifactSha256Label: "productionEvidenceManifestArtifactSha256",
  verifiedAtLabel: "productionEvidenceManifestVerifiedAt",
  verifiedAt: manifest.generatedAt
});

if (manifest.status !== "ready") {
  console.error("SENA production evidence manifest is not ready. Archive every required live probe artifact, confirm the performance budget, and keep .sena-enterprise/enterprise-db.json scoped to research-pilot use.");
  process.exit(1);
}

console.log("SENA production evidence manifest passed.");
