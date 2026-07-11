import { verifyEnterpriseObjectStorageProbe } from "../lib/sena/enterprise/object-storage-adapter";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA managed object-storage live probe.",
  command: "npm run sena:object-storage:verify"
});
const probe = await verifyEnterpriseObjectStorageProbe();
emitVerificationArtifact({
  artifact: probe,
  output: options.output,
  pathLabel: "objectStorageProbeArtifactPath",
  artifactSha256Label: "objectStorageProbeArtifactSha256",
  verifiedAtLabel: "objectStorageProbeVerifiedAt",
  verifiedAt: probe.generatedAt
});

if (probe.status !== "pass") {
  console.error("SENA object-storage live probe failed. Verify native S3/R2/GCS-HMAC credentials, bucket access, HEAD permissions, and DELETE cleanup.");
  process.exit(1);
}

console.log("SENA object-storage live probe passed.");
