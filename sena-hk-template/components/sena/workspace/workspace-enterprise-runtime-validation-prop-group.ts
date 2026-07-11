import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeValidationPropKeys = [
  "latestEnterpriseValidationRun",
  "onExportEnterpriseExpertReviewDossierJson",
  "onExportEnterpriseValidationParityEvidenceJson",
  "validationGroupField",
  "validationGroupValues",
  "selectedValidationGroupA",
  "selectedValidationGroupB",
  "validationMetric",
  "validationPreregistrationNote",
  "validationMethodNote",
  "validationStudySpecificInferenceReference",
  "localEnterpriseValidationResult",
  "latestValidationResult",
  "latestValidationPreregistrationPlan",
  "onValidationGroupFieldChange",
  "onValidationGroupAChange",
  "onValidationGroupBChange",
  "onValidationMetricChange",
  "onValidationPreregistrationNoteChange",
  "onValidationMethodNoteChange",
  "onValidationStudySpecificInferenceReferenceChange",
  "onRunEnterpriseValidationComparison",
  "onExportLocalValidationResultJson",
  "onExportValidationPreregistrationPlanJson"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeValidationPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeValidationPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeValidationProps(
  props: WorkspaceEnterpriseRuntimeValidationPropGroup
): WorkspaceEnterpriseRuntimeValidationPropGroup {
  return props;
}
