import { buildSenaGroupComparisonSuite, lessonStudySenaContract } from "../index";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import type { SenaEnterpriseProject } from "../enterprise/team-project";

type EnterpriseModule = typeof import("../enterprise");

function validationInput(project: SenaEnterpriseProject, label: string) {
  return {
    teamId: project.teamId,
    projectId: project.id,
    preregistrationNote: `${label} preregistration fixture.`,
    methodNote: `${label} current-v2 exact-evidence fixture.`,
    parityEvidence: {
      walkthroughDatasetLabel: `${label} walkthrough`,
      walkthroughDatasetHash: "c".repeat(64),
      studySpecificInferenceReference: `prereg:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v1`
    },
    result: buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role" as const,
      comparisons: [
        { groupField: "role" as const, groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" as const },
        { groupField: "role" as const, groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" as const }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    })
  };
}

function expertInput(project: SenaEnterpriseProject, validationRunId: string, label: string) {
  return {
    projectId: project.id,
    target: { kind: "validation-run" as const, id: validationRunId },
    reviewerName: `${label} domain expert`,
    reviewerRole: "Domain expert",
    expertiseArea: "Lesson study and discourse analysis",
    status: "approved" as const,
    claimScope: "claim-ready-with-limits" as const,
    ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
    strengths: "The exact reliability, validation, and expert evidence chain is traceable.",
    concerns: "Synthetic fixture only.",
    recommendations: "Keep claims limited to the reviewed evidence.",
    limitations: "No participant data."
  };
}

export function configurePublicationAuthorizationSigning(label = "publication-test-v1") {
  process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET =
    "8c53de6a907f4c21b8a63d34e1429af8812f1f04a06b70c6d619e8a4812cbb79";
  process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = label;
}

export function createClaimReadyPublicationEvidence(
  enterprise: EnterpriseModule,
  context: SenaEnterpriseSessionContext,
  project: SenaEnterpriseProject,
  label: string
) {
  const validation = enterprise.createEnterpriseValidationRun(context, validationInput(project, label));
  const approvedValidation = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
    status: "approved",
    notes: `${label} exact current-v2 validation approved.`
  });
  const expert = enterprise.createEnterpriseExpertReview(
    context,
    expertInput(project, approvedValidation.id, label)
  );
  return { approvedValidation, expert };
}

export async function createClaimReadyPublicationEvidenceAsync(
  context: SenaEnterpriseSessionContext,
  project: SenaEnterpriseProject,
  label: string
) {
  const validationRuns = await import("../enterprise/validation-runs");
  const expertReviews = await import("../enterprise/expert-review");
  const validation = await validationRuns.createEnterpriseValidationRunWithPostgresMirrorAsync(
    context,
    validationInput(project, label)
  );
  const approvedValidation = await validationRuns.reviewEnterpriseValidationRunWithPostgresMirrorAsync(
    context,
    validation.id,
    { status: "approved", notes: `${label} exact current-v2 validation approved.` }
  );
  const expert = await expertReviews.createEnterpriseExpertReviewWithPostgresMirrorAsync(
    context,
    expertInput(project, approvedValidation.id, label)
  );
  return { approvedValidation, expert };
}
