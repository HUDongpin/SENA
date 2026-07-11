import { buildSenaGoLiveCloseoutCheck, loadSenaLocalEnv } from "../lib/sena/enterprise/go-live-closeout-check";
import { emitVerificationArtifact, parseVerificationArtifactArgs } from "./verification-artifact-output";

loadSenaLocalEnv();

const options = parseVerificationArtifactArgs(process.argv.slice(2), {
  description: "Check the SENA enterprise go-live closeout gate.",
  command: "npm run sena:go-live:check",
  outputDescription: "Write the redacted closeout JSON and <file>.sha256 custody hash."
});
const output = await buildSenaGoLiveCloseoutCheck();
emitVerificationArtifact({
  artifact: output,
  output: options.output,
  pathLabel: "goLiveCloseoutCheckArtifactPath",
  artifactSha256Label: "goLiveCloseoutCheckArtifactSha256",
  verifiedAtLabel: "goLiveCloseoutCheckVerifiedAt",
  verifiedAt: output.generatedAt
});

if (output.status !== "ready") {
  process.exit(1);
}
