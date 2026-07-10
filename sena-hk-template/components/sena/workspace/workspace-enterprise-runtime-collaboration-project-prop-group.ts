import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeCollaborationProjectPropKeys = [
  "activeEnterpriseProjectId",
  "enterpriseCollaboration",
  "enterpriseCollaborationTransport",
  "enterpriseClaimPackage",
  "latestEnterpriseAnalysisRun",
  "latestEnterpriseImportRun",
  "enterpriseComment",
  "reliabilityReviewNote",
  "validationReviewNote",
  "expertReviewerName",
  "expertExpertiseArea",
  "expertClaimScope",
  "expertDataAdequacy",
  "expertMethodFit",
  "expertInterpretationValidity",
  "expertConcerns",
  "expertRecommendations",
  "adjudicationItemId",
  "adjudicationCodeId",
  "adjudicationDecision",
  "adjudicationNotesQuick",
  "onEnterpriseCommentChange",
  "onReliabilityReviewNoteChange",
  "onValidationReviewNoteChange",
  "onExpertReviewerNameChange",
  "onExpertExpertiseAreaChange",
  "onExpertClaimScopeChange",
  "onExpertDataAdequacyChange",
  "onExpertMethodFitChange",
  "onExpertInterpretationValidityChange",
  "onExpertConcernsChange",
  "onExpertRecommendationsChange",
  "onAdjudicationItemIdChange",
  "onAdjudicationCodeIdChange",
  "onAdjudicationDecisionChange",
  "onAdjudicationNotesQuickChange",
  "onTouchEnterprisePresence",
  "onRefreshEnterpriseCollaboration",
  "onRestoreEnterpriseProjectRevision",
  "onAddEnterpriseComment",
  "onReviewEnterpriseReliabilityRun",
  "onReviewEnterpriseValidationRun",
  "onExportEnterpriseExpertReviewDossierJson",
  "onSubmitEnterpriseExpertReview",
  "onUpdateEnterpriseExpertReview",
  "onAddEnterpriseAdjudication"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeCollaborationProjectPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeCollaborationProjectPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeCollaborationProjectProps(
  props: WorkspaceEnterpriseRuntimeCollaborationProjectPropGroup
): WorkspaceEnterpriseRuntimeCollaborationProjectPropGroup {
  return props;
}
