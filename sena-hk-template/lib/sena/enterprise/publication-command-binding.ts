import { createHash } from "node:crypto";
import { canonicalSenaJson } from "../canonical-json";
import type { SenaEnterprisePublicationStateBinding } from "./publication-state-binding";

/**
 * Stable authorization binding for an asynchronous publication command.
 *
 * The global state revision is deliberately excluded: persisting the command
 * envelope, queue receipt, and queue audit changes that revision. Every
 * scientific/authorization component remains included, so project, claim,
 * reliability, validation, expert-review, or storage-primary drift still
 * invalidates the command before artifact generation.
 */
export function senaPublicationCommandAuthorizationDigest(
  binding: SenaEnterprisePublicationStateBinding
) {
  const { sha256: _stateRevisionBoundClaimPackageSha256, ...stableClaimPackage } = binding.claimPackage;
  const stableAuthorization = {
    schemaVersion: binding.schemaVersion,
    activePrimary: binding.activePrimary,
    stateRevisionKind: binding.stateRevisionKind,
    project: binding.project,
    claimPackage: stableClaimPackage,
    reliabilityRun: binding.reliabilityRun,
    validationRun: binding.validationRun,
    expertReview: binding.expertReview
  };
  return createHash("sha256")
    .update(canonicalSenaJson(stableAuthorization) ?? "")
    .digest("hex");
}
