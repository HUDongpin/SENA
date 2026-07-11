import {
  conferenceLoadRehearsalSha256,
  runEnterpriseConferenceLoadRehearsal
} from "../lib/sena/enterprise/conference-load-rehearsal";
import {
  emitVerificationArtifact,
  parseVerificationArtifactArgs
} from "./verification-artifact-output";

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Verify the SENA conference-scale load rehearsal artifact.",
  command: "npm run sena:conference:load-check"
});
const artifact = await runEnterpriseConferenceLoadRehearsal();
const artifactSha256 = conferenceLoadRehearsalSha256(artifact);

for (const check of artifact.checks) {
  console.log(`${check.status}\t${check.id}\tactual=${check.actual}\tthreshold=${check.threshold}`);
}

const helperSha256 = emitVerificationArtifact({
  artifact,
  output: options.output,
  pathLabel: "conferenceLoadRehearsalArtifactPath",
  artifactSha256Label: "conferenceLoadRehearsalArtifactSha256",
  verifiedAtLabel: "conferenceLoadRehearsalVerifiedAt",
  verifiedAt: artifact.generatedAt
}).artifactSha256;

if (helperSha256 !== artifactSha256) {
  throw new Error("Conference load rehearsal artifact hash mismatch.");
}

process.stdout.write(`conferenceLoadRehearsalUsers=${artifact.target.configuredUsers}\n`);
process.stdout.write(`conferenceLoadRehearsalRampSeconds=${artifact.target.configuredRampSeconds}\n`);
process.stdout.write(`conferenceLoadRehearsalDurationSeconds=${artifact.target.configuredDurationSeconds}\n`);
process.stdout.write(`conferenceLoadRehearsalP95Ms=${artifact.summary.p95Ms}\n`);
process.stdout.write(`conferenceLoadRehearsalSustainP95Ms=${artifact.summary.sustainP95Ms}\n`);
process.stdout.write(`conferenceLoadRehearsalErrorRatePercent=${artifact.summary.errorRatePercent}\n`);
process.stdout.write(`conferenceLoadRehearsalSustainErrorRatePercent=${artifact.summary.sustainErrorRatePercent}\n`);

if (artifact.status !== "pass") {
  console.error("SENA conference load rehearsal failed. Check the route p95, error rate, target users, and target duration before conference-scale handoff.");
  process.exit(1);
}

console.log("SENA conference load rehearsal passed.");
