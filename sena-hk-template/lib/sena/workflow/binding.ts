import type { SenaWorkflowRun } from "./types";

export type SenaWorkflowCurrentBinding = Pick<
  SenaWorkflowRun,
  "definitionHash" | "sourceBindingDigest" | "codeSha" | "configDigest"
> & Partial<Pick<SenaWorkflowRun, "projectRevisionId" | "repo" | "baseSha" | "candidateSha">>;

export type SenaWorkflowBindingDriftField = keyof SenaWorkflowCurrentBinding;

export function assessSenaWorkflowBinding(
  run: SenaWorkflowRun,
  current: SenaWorkflowCurrentBinding
): {
  action: "continue" | "fork-required";
  driftFields: SenaWorkflowBindingDriftField[];
  invalidatesExistingReceipts: boolean;
} {
  const commonFields: SenaWorkflowBindingDriftField[] = [
    "definitionHash",
    "sourceBindingDigest",
    "codeSha",
    "configDigest"
  ];
  const kindFields: SenaWorkflowBindingDriftField[] = run.kind === "research-evidence"
    ? ["projectRevisionId"]
    : ["repo", "baseSha", "candidateSha"];
  const driftFields = [...commonFields, ...kindFields]
    .filter((field) => run[field] !== current[field])
    .sort();

  return {
    action: driftFields.length === 0 ? "continue" : "fork-required",
    driftFields,
    invalidatesExistingReceipts: driftFields.length > 0 && run.receiptSequence > 0
  };
}
