import { buildEnterpriseProductionPerformanceBudgetArtifact } from "../lib/sena/enterprise/performance-budget-artifact";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA production performance budget artifact.",
  command: "npm run sena:performance:check"
});
const artifact = buildEnterpriseProductionPerformanceBudgetArtifact();

for (const check of artifact.checks) {
  if (check.actualBrotliBytes === undefined || check.budgetBytes === undefined) {
    console.log(`${check.status}\t${check.id}\tstatus=${check.status}`);
  } else {
    const headroom = check.headroomBytes === undefined ? "" : `\theadroom=${check.headroomBytes}`;
    const minimumHeadroom = check.minimumHeadroomBytes === undefined ? "" : `\tminimumHeadroom=${check.minimumHeadroomBytes}`;
    console.log(`${check.status}\t${check.id}\tactual=${check.actualBrotliBytes}\tbudget=${check.budgetBytes}${headroom}${minimumHeadroom}`);
  }
}

emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "performanceBudgetArtifactPath",
  artifactSha256Label: "performanceBudgetArtifactSha256",
  verifiedAtLabel: "performanceBudgetVerifiedAt",
  verifiedAt: artifact.generatedAt
});

if (artifact.status !== "pass") {
  console.error(`SENA performance path check failed with ${artifact.summary.failed} budget violation(s).`);
  process.exit(1);
}

console.log("SENA performance path check passed.");
