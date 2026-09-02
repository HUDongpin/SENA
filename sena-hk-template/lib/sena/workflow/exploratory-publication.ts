import type { SenaProjectSnapshot } from "../types";
import { enterpriseProjectBindingSnapshotSha256 } from "../enterprise/team-project";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "./canonical";

export type SenaWorkflowExploratoryPublicationCommandCore = {
  action: "run-publication-export";
  commandCustody: "encrypted-upload-v1";
  publicationScope: "exploratory-only";
  teamId: string;
  projectId: string;
  projectRevisionId: string;
  projectVersion: number;
  format: "package";
  sourceSnapshotSha256: string;
  reportSha256: string;
  workflowRunId: string;
  workflowDefinitionHash: string;
  workflowCodeSha: string;
  workflowConfigDigest: string;
  workflowNodeId: "publication-export";
  workflowInputDigest: string;
  workflowSourceBindingDigest: string;
  sourceEvidence: Record<string, unknown>;
};

export type SenaWorkflowExploratoryPublicationCommand =
  SenaWorkflowExploratoryPublicationCommandCore & {
    authorizationEvidenceSha256: string;
  };

const SHA256 = /^[a-f0-9]{64}$/;
const CODE_SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const COMMAND_FIELDS = new Set([
  "action",
  "commandCustody",
  "publicationScope",
  "teamId",
  "projectId",
  "projectRevisionId",
  "projectVersion",
  "format",
  "sourceSnapshotSha256",
  "reportSha256",
  "workflowRunId",
  "workflowDefinitionHash",
  "workflowCodeSha",
  "workflowConfigDigest",
  "workflowNodeId",
  "workflowInputDigest",
  "workflowSourceBindingDigest",
  "sourceEvidence",
  "authorizationEvidenceSha256"
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function validUploadBinding(value: unknown) {
  const binding = record(value);
  if (!binding || Object.keys(binding).some((key) => ![
    "id", "sha256", "size", "importProfile", "scanStatus"
  ].includes(key))) return false;
  return typeof binding.id === "string" && /^upload_[a-f0-9]{24}$/.test(binding.id) &&
    typeof binding.sha256 === "string" && SHA256.test(binding.sha256) &&
    Number.isSafeInteger(binding.size) && Number(binding.size) >= 0 &&
    (binding.importProfile === null || (typeof binding.importProfile === "string" && binding.importProfile.length <= 100)) &&
    (binding.scanStatus === "passed" || binding.scanStatus === "review");
}

export function senaWorkflowExploratoryPublicationAuthorizationDigest(
  command: SenaWorkflowExploratoryPublicationCommandCore
) {
  return senaWorkflowDigest({
    authorizationKind: "sena-workflow-exploratory-publication-command/v1",
    command
  });
}

export function parseSenaWorkflowExploratoryPublicationCommand(
  value: Record<string, unknown>
): SenaWorkflowExploratoryPublicationCommand {
  const sourceEvidence = record(value.sourceEvidence);
  const uploadBindings = record(sourceEvidence?.uploadBindings);
  const importBindings = uploadBindings?.import;
  const reliabilityBindings = uploadBindings?.reliability;
  const scalarBindingsValid = sourceEvidence &&
    sourceEvidence.projectId === value.projectId &&
    sourceEvidence.projectRevisionId === value.projectRevisionId &&
    sourceEvidence.projectVersion === value.projectVersion &&
    sourceEvidence.snapshotSha256 === value.sourceSnapshotSha256 &&
    (sourceEvidence.researchSourceClass === "fixture" ||
      sourceEvidence.researchSourceClass === "approved-pseudonymized");
  if (
    Object.keys(value).some((key) => !COMMAND_FIELDS.has(key)) ||
    value.action !== "run-publication-export" ||
    value.commandCustody !== "encrypted-upload-v1" ||
    value.publicationScope !== "exploratory-only" ||
    value.format !== "package" ||
    value.workflowNodeId !== "publication-export" ||
    !Number.isSafeInteger(value.projectVersion) || Number(value.projectVersion) < 1 ||
    ![value.teamId, value.projectId, value.projectRevisionId, value.workflowRunId]
      .every((entry) => typeof entry === "string" && SAFE_ID.test(entry)) ||
    ![value.sourceSnapshotSha256, value.reportSha256, value.workflowDefinitionHash,
      value.workflowConfigDigest, value.workflowInputDigest, value.workflowSourceBindingDigest,
      value.authorizationEvidenceSha256]
      .every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
    typeof value.workflowCodeSha !== "string" || !CODE_SHA.test(value.workflowCodeSha) ||
    !sourceEvidence || Object.keys(sourceEvidence).some((key) => ![
      "projectId", "projectRevisionId", "projectVersion", "snapshotSha256", "researchSourceClass", "uploadBindings"
    ].includes(key)) ||
    !scalarBindingsValid ||
    !uploadBindings || Object.keys(uploadBindings).some((key) => key !== "import" && key !== "reliability") ||
    !Array.isArray(importBindings) || !Array.isArray(reliabilityBindings) ||
    importBindings.length > 100 || reliabilityBindings.length > 100 ||
    !importBindings.every(validUploadBinding) || !reliabilityBindings.every(validUploadBinding)
  ) {
    throw new Error("SENA exploratory publication command binding is invalid.");
  }
  const command = value as SenaWorkflowExploratoryPublicationCommand;
  const { authorizationEvidenceSha256, ...commandCore } = command;
  if (
    senaWorkflowDigest({ kind: "research-evidence", teamId: command.teamId, ...sourceEvidence }) !==
      command.workflowSourceBindingDigest ||
    senaWorkflowExploratoryPublicationAuthorizationDigest(commandCore) !== authorizationEvidenceSha256
  ) {
    throw new Error("SENA exploratory publication command authorization is invalid.");
  }
  return command;
}

function safeTitle(value: string) {
  return value.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "sena-exploratory-publication";
}

/**
 * Generates the only publication artifact permitted when EvidenceFlow has
 * completed but scientific claim gates remain incomplete. It intentionally
 * carries the aggregate report and gate statuses, never the source dataset,
 * upload values, checkpoint state, or credentials.
 */
export function buildSenaWorkflowExploratoryPublication(
  snapshot: SenaProjectSnapshot,
  command: SenaWorkflowExploratoryPublicationCommand
) {
  const {
    authorizationEvidenceSha256,
    sourceEvidence: _sourceEvidence,
    ...commandCore
  } = command;
  if (
    authorizationEvidenceSha256 !==
      senaWorkflowExploratoryPublicationAuthorizationDigest({
        ...commandCore,
        sourceEvidence: command.sourceEvidence
      }) ||
    command.sourceSnapshotSha256 !== enterpriseProjectBindingSnapshotSha256(snapshot) ||
    command.reportSha256 !== senaWorkflowDigest(snapshot.report)
  ) {
    throw new Error("SENA exploratory publication evidence binding is invalid.");
  }
  const packageCore = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowExploratoryPublication,
    generatedAt: snapshot.generatedAt,
    title: snapshot.title,
    claimBoundary: "exploratory-only" as const,
    scopeNotice: "This report is exploratory-only and is not inference-ready.",
    limitations: [
      "Incomplete, failed, or missing governance, reliability, validation, or expert-review gates are not waived by export.",
      "This artifact does not authorize confirmatory, causal, institutional-production, or deployment claims.",
      "Any later source, project revision, code, configuration, or approval change requires a new EvidenceFlow run or fork."
    ],
    workflow: {
      runId: command.workflowRunId,
      nodeId: command.workflowNodeId,
      definitionHash: command.workflowDefinitionHash,
      codeSha: command.workflowCodeSha,
      configDigest: command.workflowConfigDigest,
      inputDigest: command.workflowInputDigest,
      sourceBindingDigest: command.workflowSourceBindingDigest,
      authorizationEvidenceSha256
    },
    source: {
      teamId: command.teamId,
      projectId: command.projectId,
      projectRevisionId: command.projectRevisionId,
      projectVersion: command.projectVersion,
      snapshotSha256: command.sourceSnapshotSha256,
      reportSha256: command.reportSha256,
      researchSourceClass: command.sourceEvidence.researchSourceClass
    },
    readiness: {
      claimReadinessStatus: snapshot.report.claimReadinessGate.status,
      claimUse: snapshot.report.claimReadinessGate.claimUse,
      codingReliabilityStatus: snapshot.report.codingReliabilityGate.status,
      humanReviewStatus: snapshot.report.humanReview.status,
      completenessStatus: snapshot.report.completenessAudit.status,
      fixtureEvidenceExcludedFromInferenceReadiness:
        command.sourceEvidence.researchSourceClass === "fixture"
    },
    exclusions: {
      rawDatasetExcluded: true as const,
      uploadValuesExcluded: true as const,
      checkpointStateExcluded: true as const,
      credentialsExcluded: true as const
    },
    report: structuredClone(snapshot.report)
  };
  const manifestSha256 = senaWorkflowDigest(packageCore);
  const body = Buffer.from(JSON.stringify({
    ...packageCore,
    manifestSha256
  }, null, 2), "utf8");
  return {
    filename: `${safeTitle(snapshot.title)}.sena-exploratory-publication.json`,
    contentType: "application/vnd.sena.exploratory-publication+json",
    body,
    manifestSha256
  };
}
