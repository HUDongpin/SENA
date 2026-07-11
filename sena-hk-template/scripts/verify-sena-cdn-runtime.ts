import { verifyEnterpriseCdnProbe } from "../lib/sena/enterprise/cdn-verification";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA CDN compression and static asset cache probe.",
  command: "npm run sena:cdn:verify"
});
const probe = await verifyEnterpriseCdnProbe();
emitVerificationArtifact({
  artifact: probe,
  output: options.output,
  pathLabel: "cdnProbeArtifactPath",
  artifactSha256Label: "cdnProbeArtifactSha256",
  verifiedAtLabel: "cdnProbeVerifiedAt",
  verifiedAt: probe.generatedAt
});

if (probe.status !== "pass") {
  console.error("SENA CDN live probe failed. Verify deployed CDN HTML compression and immutable _next/static caching.");
  process.exit(1);
}

console.log("SENA CDN live probe passed.");
