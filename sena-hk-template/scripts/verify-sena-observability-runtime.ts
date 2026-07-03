import { verifyEnterpriseObservabilityProbe } from "../lib/sena/enterprise/ops-observability";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA observability exporter delivery probe.",
  command: "npm run sena:observability:verify"
});
const probe = await verifyEnterpriseObservabilityProbe();
emitVerificationArtifact({
  artifact: probe,
  output: options.output,
  pathLabel: "observabilityProbeArtifactPath",
  artifactSha256Label: "observabilityProbeArtifactSha256",
  verifiedAtLabel: "observabilityProbeVerifiedAt",
  verifiedAt: probe.generatedAt
});

if (probe.status !== "pass") {
  console.error("SENA observability live probe failed. Verify exporter URL, signing secret, provider configuration, dashboard, runbook, and owner evidence.");
  process.exit(1);
}

console.log("SENA observability live probe passed.");
