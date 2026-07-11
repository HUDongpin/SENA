import { verifyEnterprisePostgresProbe } from "../lib/sena/enterprise-postgres";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA managed Postgres live probe.",
  command: "npm run sena:postgres:verify"
});
const probe = await verifyEnterprisePostgresProbe();
emitVerificationArtifact({
  artifact: probe,
  output: options.output,
  pathLabel: "postgresProbeArtifactPath",
  artifactSha256Label: "postgresProbeArtifactSha256",
  verifiedAtLabel: "postgresProbeVerifiedAt",
  verifiedAt: probe.generatedAt
});

if (probe.status !== "pass") {
  console.error("SENA Postgres live probe failed. Verify adapter, connection string, DDL/DML permissions, and cleanup permissions.");
  process.exit(1);
}

console.log("SENA Postgres live probe passed.");
