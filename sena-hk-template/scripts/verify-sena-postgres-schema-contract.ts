import { buildEnterprisePostgresSchemaContract } from "../lib/sena/enterprise-postgres";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Generate the SENA managed Postgres schema contract without reading connection secrets.",
  command: "npm run sena:postgres:schema-contract"
});
const contract = await buildEnterprisePostgresSchemaContract();
emitVerificationArtifact({
  artifact: contract,
  output: options.output,
  pathLabel: "postgresSchemaContractArtifactPath",
  artifactSha256Label: "postgresSchemaContractArtifactSha256",
  verifiedAtLabel: "postgresSchemaContractVerifiedAt",
  verifiedAt: contract.generatedAt
});

if (contract.status !== "pass") {
  console.error("SENA Postgres schema contract is under review. Inspect table/index DDL generation before using it as production evidence.");
  process.exit(1);
}

console.log("SENA Postgres schema contract generated.");
