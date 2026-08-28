import { createHash } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY, planSenaAnalysisQueueCommandCustody } from "../analysis-queue-command";
import type { SenaEnterpriseSession, SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import { contextFromDb } from "../enterprise/auth-session";
import { getEnterpriseClaimEvidencePackageWithPostgresEvidence } from "../enterprise/claim-evidence-package";
import {
  createEnterpriseAnalysisCommandEnvelopeWithPostgresMirrorAsync,
  createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync,
  createEnterpriseUploadsWithPostgresMirrorAsync,
  readEnterpriseUploadMetadataAsync
} from "../enterprise/import-analysis";
import { senaPublicationCommandAuthorizationDigest } from "../enterprise/publication-command-binding";
import { resolveEnterprisePublicationStateBundle } from "../enterprise/publication-state-binding";
import { assertSenaServerJobWorkerExecutable } from "../enterprise/server-job-worker-capabilities";
import {
  enqueueEnterpriseServerJob,
  getEnterpriseServerJob,
  serverJobQueueStatus,
  stableServerJobPayloadSha256,
  updateEnterpriseServerJobStatus,
  type SenaEnterpriseServerJob,
  type SenaEnterpriseServerJobKind
} from "../enterprise/server-job-queue";
import { readEnterpriseReliabilityUploadPointers } from "../enterprise/reliability-upload-reader";
import { readEnterpriseState } from "../enterprise/state";
import {
  buildEnterpriseProjectEvidenceBinding,
  getEnterpriseProjectReadOnlyAsync,
  getEnterpriseProjectRevisionByIdReadOnlyAsync
} from "../enterprise/team-project";
import { resolveEnterpriseGroupComparisonInput } from "../enterprise/validation-runs";
import { assertSenaPublicationModelCardReady, type SenaPublicationFormat } from "../publication-export";
import {
  bindSenaReliabilityAnnotationsToProject,
  preflightSenaReliabilityAnnotations,
  senaReliabilitySnapshotFingerprint
} from "../reliability";
import {
  buildSenaReliabilityReviewerEnvelope,
  SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
  SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE
} from "../reliability-queue-reviewer";
import {
  planSenaServerJobCommandCustody,
  SENA_SERVER_JOB_COMMAND_CUSTODY
} from "../server-job-command-envelope";
import { senaWorkflowDigest } from "./canonical";
import { senaWorkflowCloseoutCommitment } from "./closeout";
import {
  senaWorkflowExploratoryPublicationAuthorizationDigest,
  type SenaWorkflowExploratoryPublicationCommandCore
} from "./exploratory-publication";
import {
  evaluateSenaEngineeringEvidenceNode,
  parseSenaEngineeringEvidenceParameters,
  runSenaEngineeringVerificationNode,
  type SenaEngineeringCommandExecutor,
  type SenaEngineeringEvidenceParameters,
  type SenaEngineeringRunBinding
} from "./engineering-evidence";
import { createSenaEngineeringCommandExecutor } from "./engineering-runner";
import type {
  SenaWorkflowNodeOperationAdapter,
  SenaWorkflowNodeOperationInput,
  SenaWorkflowNodeStore,
  SenaWorkflowServerJobState
} from "./node-executor";
import type { SenaWorkflowArtifact, SenaWorkflowRun, SenaWorkflowRunEvents } from "./types";

const uploadIdPattern = /^upload_[a-f0-9]{24}$/;
const publicationFormats = new Set<SenaPublicationFormat>(["html", "svg", "png", "xlsx", "docx", "pdf", "package"]);
const serverJobNodeKinds: Readonly<Record<string, SenaEnterpriseServerJobKind>> = {
  "import-cleaning": "import",
  "fusion-analysis": "analysis",
  "coding-reliability": "reliability",
  "statistical-validation": "validation",
  "publication-export": "publication-export"
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uniqueUploadIds(parameters: Record<string, unknown>, key: string) {
  const raw = parameters[key];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    throw new Error(`SENA workflow ${key} must contain 1-100 registered upload pointers.`);
  }
  const values = raw.map((value) => typeof value === "string" ? value : "");
  if (values.some((value) => !uploadIdPattern.test(value)) || new Set(values).size !== values.length) {
    throw new Error(`SENA workflow ${key} contains invalid or duplicate upload pointers.`);
  }
  return values;
}

function deterministicUploadId(namespace: string, effectKey: string) {
  return `upload_${senaWorkflowDigest({ namespace, effectKey }).slice(0, 24)}`;
}

function deterministicJobId(effectKey: string) {
  return `server_job_${effectKey.slice(0, 24)}`;
}

async function actorContext(run: SenaWorkflowRun): Promise<SenaEnterpriseSessionContext> {
  const state = await readEnterpriseState();
  const session: SenaEnterpriseSession = {
    id: `sess_workflow_${run.id}`,
    userId: run.createdByUserId,
    tokenHash: "sena-evidenceflow-worker-no-token",
    createdAt: run.createdAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    sessionProfile: "standard",
    ttlDays: 1
  };
  return contextFromDb(state.db, session);
}

async function workflowSourceCarrier(store: SenaWorkflowNodeStore, run: SenaWorkflowRun) {
  const events = await store.runEvents(run.id, run.teamId);
  const sourceCommand = events.commands.find((command) => command.kind === "start" || command.kind === "fork");
  const parameters = record(sourceCommand?.payload.parameters);
  const sourceEvidence = record(sourceCommand?.payload.sourceEvidence);
  if (!sourceCommand || sourceCommand.payloadDigest !== senaWorkflowDigest(sourceCommand.payload)) {
    throw new Error("SENA workflow source command payload digest is invalid.");
  }
  return { parameters, sourceEvidence, sourceCommand };
}

function engineeringEvidence(
  run: SenaWorkflowRun,
  parameters: Record<string, unknown>,
  sourceEvidence: Record<string, unknown>
) {
  const workRequestDigest = typeof sourceEvidence.workRequestDigest === "string"
    ? sourceEvidence.workRequestDigest
    : "";
  if (!run.repo || !run.baseSha || !run.candidateSha ||
    senaWorkflowDigest({
      kind: run.kind,
      teamId: run.teamId,
      repo: run.repo,
      baseSha: run.baseSha,
      workRequestDigest
    }) !== run.sourceBindingDigest) {
    throw new Error("SENA engineering workflow source evidence does not match its immutable run binding.");
  }
  const binding = {
    teamId: run.teamId,
    repo: run.repo,
    baseSha: run.baseSha,
    candidateSha: run.candidateSha,
    workRequestDigest
  };
  return {
    binding,
    evidence: parseSenaEngineeringEvidenceParameters(parameters, binding)
  };
}

async function sourceRevision(
  context: SenaEnterpriseSessionContext,
  run: SenaWorkflowRun,
  sourceEvidence: Record<string, unknown>
) {
  if (!run.projectId || !run.projectRevisionId) {
    throw new Error("SENA research workflow is missing its immutable project revision binding.");
  }
  const resolved = await getEnterpriseProjectRevisionByIdReadOnlyAsync(
    context,
    run.projectId,
    run.projectRevisionId
  );
  const evidence = buildEnterpriseProjectEvidenceBinding(resolved.sourceProject);
  const researchSourceClass = sourceEvidence.researchSourceClass;
  if (
    (researchSourceClass !== "fixture" && researchSourceClass !== "approved-pseudonymized") ||
    run.researchSourceClass !== researchSourceClass
  ) {
    throw new Error("SENA workflow research source classification does not match its immutable run binding.");
  }
  const sourceBindingDigest = senaWorkflowDigest({
    kind: run.kind,
    teamId: run.teamId,
    projectId: run.projectId,
    projectRevisionId: run.projectRevisionId,
    projectVersion: resolved.revision.version,
    snapshotSha256: evidence.snapshotSha256,
    researchSourceClass,
    uploadBindings: sourceEvidence.uploadBindings
  });
  if (resolved.revision.teamId !== run.teamId || sourceBindingDigest !== run.sourceBindingDigest) {
    throw new Error("SENA workflow immutable project evidence no longer matches its source binding.");
  }
  return resolved;
}

function researchGovernancePreflight(input: {
  run: SenaWorkflowRun;
  sourceEvidence: Record<string, unknown>;
  sourceProject: Awaited<ReturnType<typeof sourceRevision>>["sourceProject"];
}) {
  const report = input.sourceProject.snapshot.report;
  const datasetMetadata = input.sourceProject.snapshot.dataset.metadata;
  const uploadBindings = record(input.sourceEvidence.uploadBindings);
  const boundUploads = [uploadBindings.import, uploadBindings.reliability]
    .flatMap((value) => Array.isArray(value) ? value : []);
  const uploadCustodyReady = boundUploads.length >= 2 && boundUploads.every((value) => {
    const binding = record(value);
    return typeof binding.id === "string" && uploadIdPattern.test(binding.id) &&
      typeof binding.sha256 === "string" && /^[a-f0-9]{64}$/.test(binding.sha256) &&
      binding.scanStatus === "passed";
  });
  const governanceReady = report.dataGovernance.status === "complete" &&
    report.dataGovernance.blockers.length === 0 &&
    report.dataGovernance.usageConstraints.length > 0;
  const pseudonymizationReady = datasetMetadata?.pseudonymization?.personIdPolicy === "opaque" &&
    datasetMetadata.pseudonymization.rosterMapping === "not-stored";
  const sourceClassReady = input.run.researchSourceClass === "fixture" ||
    input.run.researchSourceClass === "approved-pseudonymized";
  const issueCodes = [
    ...(sourceClassReady ? [] : ["research-source-class-missing"]),
    ...(uploadCustodyReady ? [] : ["source-custody-incomplete"]),
    ...(governanceReady ? [] : ["data-governance-incomplete"]),
    ...(pseudonymizationReady ? [] : ["pseudonymization-incomplete"])
  ];
  return {
    evidence: {
      researchSourceClass: input.run.researchSourceClass,
      fixtureEvidenceExcludedFromInferenceReadiness: input.run.researchSourceClass === "fixture",
      uploadCustodyReady,
      boundUploadCount: boundUploads.length,
      governanceStatus: report.dataGovernance.status,
      governanceBlockerCount: report.dataGovernance.blockers.length,
      usageConstraintCount: report.dataGovernance.usageConstraints.length,
      pseudonymizationReady,
      issueCodes
    },
    blocker: issueCodes.length > 0 ? {
      code: "workflow_data_governance_preflight_blocked",
      message: `Immutable governance preflight requires remediation and a fork (${issueCodes.join(", ")}).`,
      nodeId: "data-governance-preflight",
      retryable: false
    } : undefined
  };
}

async function ensurePlannedUpload(input: {
  context: SenaEnterpriseSessionContext;
  teamId: string;
  file: {
    name: string;
    contentType: string;
    bytes: Buffer;
    importProfile: string;
    reservedId: string;
  };
  create: () => Promise<unknown>;
}) {
  const expectedSha256 = createHash("sha256").update(input.file.bytes).digest("hex");
  const matches = async () => {
    try {
      const [existing] = await readEnterpriseUploadMetadataAsync(input.context, {
        teamId: input.teamId,
        uploadIds: [input.file.reservedId]
      });
      if (!existing || existing.sha256 !== expectedSha256 || existing.originalName !== input.file.name ||
        existing.contentType !== input.file.contentType || existing.importProfile !== input.file.importProfile) {
        throw new Error("SENA workflow command-envelope upload id is bound to different evidence.");
      }
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "upload_not_found") return false;
      throw error;
    }
  };
  if (await matches()) return;
  try {
    await input.create();
  } catch (error) {
    if (!await matches()) throw error;
  }
}

function workflowJobState(job: SenaEnterpriseServerJob): SenaWorkflowServerJobState {
  if (job.status === "succeeded" && !job.resultReceipt) {
    return { id: job.id, status: "failed" };
  }
  return {
    id: job.id,
    status: job.status,
    ...(job.resultReceipt ? {
      outputDigest: job.resultReceipt.outputDigest,
      artifactReferences: job.resultReceipt.artifactReferences,
      resultRecordedAt: job.resultReceipt.recordedAt
    } : {})
  };
}

async function enqueueImport(input: {
  operation: SenaWorkflowNodeOperationInput;
  context: SenaEnterpriseSessionContext;
  parameters: Record<string, unknown>;
}) {
  const uploadIds = uniqueUploadIds(input.parameters, "importUploadIds");
  await readEnterpriseUploadMetadataAsync(input.context, { teamId: input.operation.run.teamId, uploadIds });
  const payload = {
    action: "run-import",
    teamId: input.operation.run.teamId,
    uploadIds,
    persistProject: false,
    includeRuntimeBundle: false
  };
  return enqueueEnterpriseServerJob({
    jobId: deterministicJobId(input.operation.effectKey),
    kind: "import",
    teamId: input.operation.run.teamId,
    actorUserId: input.operation.run.createdByUserId,
    payload,
    payloadSummary: {
      workflowRunId: input.operation.run.id,
      workflowNodeId: input.operation.node.id,
      source: "upload",
      fileCount: uploadIds.length,
      uploadIds,
      persist: false,
      includeRuntimeBundle: false,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    },
    queue: serverJobQueueStatus()
  });
}

async function enqueueAnalysis(input: {
  operation: SenaWorkflowNodeOperationInput;
  context: SenaEnterpriseSessionContext;
  sourceEvidence: Record<string, unknown>;
}) {
  const resolved = await sourceRevision(input.context, input.operation.run, input.sourceEvidence);
  const payload = {
    action: "run-analysis",
    commandCustody: SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY,
    teamId: input.operation.run.teamId,
    projectId: input.operation.run.projectId,
    projectVersion: resolved.revision.version,
    sourceTitle: resolved.sourceProject.title,
    title: resolved.sourceProject.title,
    includeRuntimeBundle: true,
    persist: false,
    updateProject: false
  };
  const uploadId = deterministicUploadId("analysis-command", input.operation.effectKey);
  const custody = planSenaAnalysisQueueCommandCustody({
    jobId: deterministicJobId(input.operation.effectKey),
    kind: "analysis" as const,
    teamId: input.operation.run.teamId,
    projectId: input.operation.run.projectId,
    actorUserId: input.operation.run.createdByUserId,
    payload,
    payloadSummary: {
      workflowRunId: input.operation.run.id,
      workflowNodeId: input.operation.node.id,
      source: "project" as const,
      projectVersion: resolved.revision.version,
      includeRuntimeBundle: true,
      persist: false,
      updateProject: false,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true as const
    }
  }, uploadId, stableServerJobPayloadSha256(payload));
  return enqueueEnterpriseServerJob({
    ...custody.jobInput,
    queue: serverJobQueueStatus(),
    beforeDispatch: async () => ensurePlannedUpload({
      context: input.context,
      teamId: input.operation.run.teamId,
      file: custody.file,
      create: () => createEnterpriseAnalysisCommandEnvelopeWithPostgresMirrorAsync(input.context, {
        teamId: input.operation.run.teamId,
        files: [custody.file]
      })
    })
  });
}

async function enqueueReliability(input: {
  operation: SenaWorkflowNodeOperationInput;
  context: SenaEnterpriseSessionContext;
  parameters: Record<string, unknown>;
  sourceEvidence: Record<string, unknown>;
}) {
  const uploadIds = uniqueUploadIds(input.parameters, "reliabilityUploadIds");
  const resolved = await sourceRevision(input.context, input.operation.run, input.sourceEvidence);
  const currentProject = await getEnterpriseProjectReadOnlyAsync(input.context, resolved.currentProject.id);
  if (currentProject.currentVersion !== resolved.revision.version) {
    throw new Error("SENA reliability source changed after the workflow source was bound; fork is required.");
  }
  const pointerInput = await readEnterpriseReliabilityUploadPointers(input.context, {
    teamId: input.operation.run.teamId,
    uploadIds
  });
  preflightSenaReliabilityAnnotations(pointerInput.parsed.annotations);
  bindSenaReliabilityAnnotationsToProject(pointerInput.parsed.annotations, {
    projectId: currentProject.id,
    projectVersion: currentProject.currentVersion,
    snapshot: currentProject.snapshot,
    skippedCells: pointerInput.parsed.skippedCells
  });
  const reviewerUploadId = deterministicUploadId("reliability-reviewer", input.operation.effectKey);
  const reviewer = buildSenaReliabilityReviewerEnvelope(undefined, input.context.user.name);
  const reviewerFile = {
    name: SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
    contentType: "application/json",
    bytes: reviewer.bytes,
    importProfile: SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE,
    reservedId: reviewerUploadId
  };
  const reviewerSha256 = createHash("sha256").update(reviewer.bytes).digest("hex");
  const payload = {
    action: "run-reliability",
    teamId: input.operation.run.teamId,
    projectId: currentProject.id,
    projectVersion: currentProject.currentVersion,
    snapshotFingerprint: senaReliabilitySnapshotFingerprint(currentProject.snapshot),
    uploadIds,
    reviewerEnvelopeUploadId: reviewerUploadId,
    reviewerEnvelopeSha256: reviewerSha256
  };
  return enqueueEnterpriseServerJob({
    jobId: deterministicJobId(input.operation.effectKey),
    kind: "reliability",
    teamId: input.operation.run.teamId,
    projectId: currentProject.id,
    actorUserId: input.operation.run.createdByUserId,
    payload,
    payloadSummary: {
      workflowRunId: input.operation.run.id,
      workflowNodeId: input.operation.node.id,
      source: "upload",
      projectVersion: currentProject.currentVersion,
      snapshotFingerprint: payload.snapshotFingerprint,
      uploadIds,
      reviewerEnvelopeUploadId: reviewerUploadId,
      reviewerEnvelopeSha256: reviewerSha256,
      fileCount: uploadIds.length,
      annotationCount: pointerInput.parsed.annotations.length,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    },
    queue: serverJobQueueStatus(),
    beforeDispatch: async () => ensurePlannedUpload({
      context: input.context,
      teamId: input.operation.run.teamId,
      file: reviewerFile,
      create: () => createEnterpriseUploadsWithPostgresMirrorAsync(input.context, {
        teamId: input.operation.run.teamId,
        files: [reviewerFile]
      })
    })
  });
}

async function enqueueValidation(input: {
  operation: SenaWorkflowNodeOperationInput;
  context: SenaEnterpriseSessionContext;
  parameters: Record<string, unknown>;
  sourceEvidence: Record<string, unknown>;
}) {
  const resolved = await sourceRevision(input.context, input.operation.run, input.sourceEvidence);
  const currentProject = await getEnterpriseProjectReadOnlyAsync(input.context, resolved.currentProject.id);
  if (currentProject.currentVersion !== resolved.revision.version) {
    throw new Error("SENA validation source changed after workflow binding; fork is required.");
  }
  const validation = resolveEnterpriseGroupComparisonInput(record(input.parameters.validation), currentProject);
  const payload = {
    action: "run-validation",
    commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY,
    teamId: input.operation.run.teamId,
    projectId: currentProject.id,
    projectVersion: currentProject.currentVersion,
    groupField: validation.defaultGroupField,
    groupA: validation.comparisons[0].groupA,
    groupB: validation.comparisons[0].groupB,
    metric: validation.defaultMetric,
    comparisons: validation.comparisons,
    suite: validation.suite,
    iterations: validation.iterations,
    bootstrapIterations: validation.bootstrapIterations,
    alpha: validation.alpha,
    seed: validation.seed
  };
  const uploadId = deterministicUploadId("validation-command", input.operation.effectKey);
  const custody = planSenaServerJobCommandCustody({
    jobId: deterministicJobId(input.operation.effectKey),
    kind: "validation" as const,
    teamId: input.operation.run.teamId,
    projectId: currentProject.id,
    actorUserId: input.operation.run.createdByUserId,
    payload,
    payloadSummary: {
      workflowRunId: input.operation.run.id,
      workflowNodeId: input.operation.node.id,
      source: "project" as const,
      projectVersion: currentProject.currentVersion,
      projectTeamId: currentProject.teamId,
      comparisonCount: validation.comparisons.length,
      validationMethod: "group-comparison" as const,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true as const
    }
  }, uploadId, stableServerJobPayloadSha256(payload));
  return enqueueEnterpriseServerJob({
    ...custody.jobInput,
    queue: serverJobQueueStatus(),
    beforeDispatch: async () => ensurePlannedUpload({
      context: input.context,
      teamId: input.operation.run.teamId,
      file: custody.file,
      create: () => createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync(input.context, {
        teamId: input.operation.run.teamId,
        files: [custody.file],
        requiredPermission: "analysis:run"
      })
    })
  });
}

async function enqueuePublication(input: {
  operation: SenaWorkflowNodeOperationInput;
  context: SenaEnterpriseSessionContext;
  parameters: Record<string, unknown>;
  sourceEvidence: Record<string, unknown>;
}) {
  const resolved = await sourceRevision(input.context, input.operation.run, input.sourceEvidence);
  if (resolved.currentProject.currentVersion !== resolved.revision.version) {
    throw new Error("SENA publication source changed after workflow binding; fork is required.");
  }
  const requestedFormat = typeof input.parameters.publicationFormat === "string"
    ? input.parameters.publicationFormat as SenaPublicationFormat
    : "package";
  if (!publicationFormats.has(requestedFormat)) throw new Error("SENA workflow publication format is invalid.");
  const exploratoryOnly = input.operation.run.claimBoundary !== "inference-ready";
  if (exploratoryOnly && requestedFormat !== "package") {
    throw new Error("SENA exploratory workflow publication is restricted to the evidence package format.");
  }
  let payload: Record<string, unknown>;
  let publicationProjectId: string;
  let publicationProjectVersion: number;
  let publicationProjectTeamId: string;
  if (exploratoryOnly) {
    const sourceBinding = buildEnterpriseProjectEvidenceBinding(resolved.sourceProject);
    const commandCore: SenaWorkflowExploratoryPublicationCommandCore = {
      action: "run-publication-export",
      commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY,
      publicationScope: "exploratory-only",
      teamId: input.operation.run.teamId,
      projectId: resolved.sourceProject.id,
      projectRevisionId: resolved.revision.id,
      projectVersion: resolved.revision.version,
      format: "package",
      sourceSnapshotSha256: sourceBinding.snapshotSha256,
      reportSha256: senaWorkflowDigest(resolved.sourceProject.snapshot.report),
      workflowRunId: input.operation.run.id,
      workflowDefinitionHash: input.operation.run.definitionHash,
      workflowCodeSha: input.operation.run.codeSha,
      workflowConfigDigest: input.operation.run.configDigest,
      workflowNodeId: "publication-export",
      workflowInputDigest: input.operation.inputDigest,
      workflowSourceBindingDigest: input.operation.run.sourceBindingDigest,
      sourceEvidence: structuredClone(input.sourceEvidence)
    };
    payload = {
      ...commandCore,
      authorizationEvidenceSha256: senaWorkflowExploratoryPublicationAuthorizationDigest(commandCore)
    };
    publicationProjectId = resolved.sourceProject.id;
    publicationProjectVersion = resolved.revision.version;
    publicationProjectTeamId = resolved.sourceProject.teamId;
  } else {
    const publicationState = await resolveEnterprisePublicationStateBundle(input.context, resolved.currentProject.id);
    assertSenaPublicationModelCardReady(publicationState.publicationSnapshot.report);
    const sourceSnapshotSha256 = createHash("sha256")
      .update(JSON.stringify(publicationState.publicationSnapshot))
      .digest("hex");
    payload = {
      action: "run-publication-export",
      commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY,
      publicationScope: "claim-ready-with-limits",
      teamId: input.operation.run.teamId,
      projectId: publicationState.project.id,
      projectVersion: publicationState.project.currentVersion,
      format: requestedFormat,
      sourceSnapshotSha256,
      authorizationEvidenceSha256: senaPublicationCommandAuthorizationDigest(publicationState.stateBinding)
    };
    publicationProjectId = publicationState.project.id;
    publicationProjectVersion = publicationState.project.currentVersion;
    publicationProjectTeamId = publicationState.project.teamId;
  }
  const uploadId = deterministicUploadId("publication-command", input.operation.effectKey);
  const custody = planSenaServerJobCommandCustody({
    jobId: deterministicJobId(input.operation.effectKey),
    kind: "publication-export" as const,
    teamId: input.operation.run.teamId,
    projectId: publicationProjectId,
    actorUserId: input.operation.run.createdByUserId,
    payload,
    payloadSummary: {
      workflowRunId: input.operation.run.id,
      workflowNodeId: input.operation.node.id,
      source: "project" as const,
      projectVersion: publicationProjectVersion,
      projectTeamId: publicationProjectTeamId,
      format: requestedFormat,
      publicationScope: exploratoryOnly ? "exploratory-only" as const : "claim-ready-with-limits" as const,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true as const
    }
  }, uploadId, stableServerJobPayloadSha256(payload));
  return enqueueEnterpriseServerJob({
    ...custody.jobInput,
    queue: serverJobQueueStatus(),
    beforeDispatch: async () => ensurePlannedUpload({
      context: input.context,
      teamId: input.operation.run.teamId,
      file: custody.file,
      create: () => createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync(input.context, {
        teamId: input.operation.run.teamId,
        files: [custody.file],
        requiredPermission: "export:create"
      })
    })
  });
}

async function enqueueWorkflowServerJob(
  store: SenaWorkflowNodeStore,
  operation: SenaWorkflowNodeOperationInput
) {
  const kind = serverJobNodeKinds[operation.node.id];
  if (!kind) throw new Error(`SENA workflow node ${operation.node.id} has no server-job mapping.`);
  assertSenaServerJobWorkerExecutable(kind);
  const context = await actorContext(operation.run);
  const carrier = await workflowSourceCarrier(store, operation.run);
  const { parameters, sourceEvidence } = carrier;
  if (kind === "import") return enqueueImport({ operation, context, parameters });
  if (kind === "analysis") return enqueueAnalysis({ operation, context, sourceEvidence });
  if (kind === "reliability") return enqueueReliability({ operation, context, parameters, sourceEvidence });
  if (kind === "validation") return enqueueValidation({ operation, context, parameters, sourceEvidence });
  return enqueuePublication({ operation, context, parameters, sourceEvidence });
}

function assertResearchAudit(nodeId: string, report: Awaited<ReturnType<typeof sourceRevision>>["sourceProject"]["snapshot"]["report"]) {
  if (nodeId === "data-contract-audit" && report.dataContractAudit.status !== "valid") {
    throw new Error("SENA data-contract audit requires review.");
  }
  if (nodeId === "audit-runtime-consistency" && report.runtimeConsistencyAudit.status !== "consistent") {
    throw new Error("SENA runtime consistency audit requires review.");
  }
  if (nodeId === "audit-fusion-math" && report.fusionMathAudit.status !== "verified") {
    throw new Error("SENA fusion math audit requires review.");
  }
  if (nodeId === "audit-jena-jsna-provenance" &&
    (report.enaManifest.status !== "computed" || report.snaManifest.status !== "computed")) {
    throw new Error("SENA jENA/jSNA provenance is incomplete.");
  }
  if (nodeId === "audit-temporal-trace" && report.figures.temporalTrace.windows.length === 0) {
    throw new Error("SENA temporal trace has no evidence windows.");
  }
  if (nodeId === "audit-evidence-ledger" && report.evidenceSnippets.length === 0) {
    throw new Error("SENA evidence ledger has no source-bound snippets.");
  }
  if (nodeId === "audit-data-governance" &&
    (report.dataGovernance.status !== "complete" || report.dataGovernance.blockers.length > 0)) {
    throw new Error("SENA data-governance evidence is incomplete.");
  }
}

const requiredResearchJobNodes = [
  "import-cleaning",
  "fusion-analysis",
  "coding-reliability",
  "statistical-validation"
] as const;

async function boundResearchJobEvidence(
  events: SenaWorkflowRunEvents,
  nodeIds: readonly string[] = requiredResearchJobNodes
) {
  return Promise.all(nodeIds.map(async (nodeId) => {
    const receipt = events.receipts.find((candidate) => candidate.nodeId === nodeId);
    const job = receipt?.jobId ? await getEnterpriseServerJob(receipt.jobId) : undefined;
    const resultReceipt = job?.resultReceipt;
    const evidence = resultReceipt?.evidence ?? {};
    return {
      nodeId,
      jobId: job?.id,
      status: job?.status,
      outputDigest: resultReceipt?.outputDigest,
      receiptMatches: Boolean(
        receipt && job?.status === "succeeded" && resultReceipt &&
        resultReceipt.outputDigest === receipt.outputDigest
      ),
      ...(typeof evidence.reliabilityRunId === "string"
        ? { reliabilityRunId: evidence.reliabilityRunId }
        : {}),
      ...(typeof evidence.validationRunId === "string"
        ? { validationRunId: evidence.validationRunId }
        : {}),
      ...(typeof evidence.validationRunEvidenceHash === "string"
        ? { validationRunEvidenceHash: evidence.validationRunEvidenceHash }
        : {})
    };
  }));
}

async function runSpecificClaimEvidence(input: {
  context: SenaEnterpriseSessionContext;
  run: SenaWorkflowRun;
  source: Awaited<ReturnType<typeof sourceRevision>>;
  events: SenaWorkflowRunEvents;
}) {
  const terminalJobEvidence = await boundResearchJobEvidence(input.events);
  const reliability = terminalJobEvidence.find((item) => item.nodeId === "coding-reliability");
  const validation = terminalJobEvidence.find((item) => item.nodeId === "statistical-validation");
  const reliabilityRunId = reliability?.reliabilityRunId;
  const validationRunId = validation?.validationRunId;
  const validationRunEvidenceHash = validation?.validationRunEvidenceHash;
  let claimPackage: Awaited<ReturnType<typeof getEnterpriseClaimEvidencePackageWithPostgresEvidence>> | undefined;
  let packageLoadFailed = false;
  if (input.run.projectId && reliabilityRunId && validationRunId) {
    try {
      claimPackage = await getEnterpriseClaimEvidencePackageWithPostgresEvidence(
        input.context,
        { projectId: input.run.projectId },
        {
          approvedReliabilityRunId: reliabilityRunId,
          approvedValidationRunId: validationRunId,
          claimReadinessSnapshot: input.source.sourceProject.snapshot,
          claimReadinessReliabilityRunId: reliabilityRunId
        }
      );
    } catch {
      packageLoadFailed = true;
    }
  }
  const packageReliability = claimPackage?.evidence.reliability;
  const packageValidation = claimPackage?.evidence.validation;
  const exactPackageBinding = Boolean(
    claimPackage &&
    claimPackage.status === "claim-ready-with-limits" &&
    claimPackage.project.id === input.run.projectId &&
    claimPackage.project.teamId === input.run.teamId &&
    claimPackage.project.currentVersion === input.source.revision.version &&
    claimPackage.sourceSnapshotEvidence.revisionId === input.run.projectRevisionId &&
    packageReliability?.runId === reliabilityRunId &&
    packageValidation?.runId === validationRunId &&
    packageValidation?.validationRunEvidenceHash === validationRunEvidenceHash
  );
  const blockers = [
    ...(terminalJobEvidence.every((item) => item.receiptMatches)
      ? []
      : ["workflow-terminal-job-evidence-required"]),
    ...(reliabilityRunId ? [] : ["workflow-reliability-run-id-required"]),
    ...(validationRunId && validationRunEvidenceHash
      ? []
      : ["workflow-validation-run-evidence-required"]),
    ...(packageLoadFailed ? ["workflow-claim-evidence-package-invalid"] : []),
    ...(claimPackage?.blockers ?? []),
    ...(exactPackageBinding ? [] : ["workflow-run-specific-claim-package-required"])
  ];
  const projection = {
    terminalJobEvidence,
    reliabilityRunId: reliabilityRunId ?? null,
    validationRunId: validationRunId ?? null,
    validationRunEvidenceHash: validationRunEvidenceHash ?? null,
    claimPackageStatus: claimPackage?.status ?? "not-available",
    claimPackageSnapshotSha256: claimPackage?.sourceSnapshotEvidence.snapshotSha256 ?? null,
    claimPackageReliabilityRunId: claimPackage?.evidence.reliability?.runId ?? null,
    claimPackageValidationRunId: claimPackage?.evidence.validation?.runId ?? null,
    blockers: [...new Set(blockers)].sort()
  };
  return {
    ...projection,
    evidenceDigest: senaWorkflowDigest(projection),
    ready: exactPackageBinding && projection.blockers.length === 0
  };
}

export function createSenaWorkflowServerJobOperationAdapter(input: {
  store: SenaWorkflowNodeStore;
  engineeringCommandExecutorFactory?: (input: {
    evidence: SenaEngineeringEvidenceParameters;
    binding: SenaEngineeringRunBinding;
  }) => Promise<SenaEngineeringCommandExecutor>;
}): SenaWorkflowNodeOperationAdapter {
  return {
    async ensureServerJob(operation) {
      return workflowJobState(await enqueueWorkflowServerJob(input.store, operation));
    },

    async readServerJob(operation) {
      const expectedJobId = deterministicJobId(operation.effectKey);
      if (operation.jobId !== expectedJobId) {
        throw new Error("SENA workflow server-job id does not match its deterministic effect key.");
      }
      return workflowJobState(await getEnterpriseServerJob(operation.jobId));
    },

    async retryServerJob(operation) {
      const expectedJobId = deterministicJobId(operation.effectKey);
      if (operation.jobId !== expectedJobId) {
        throw new Error("SENA workflow retry does not match its deterministic server-job binding.");
      }
      const current = await getEnterpriseServerJob(operation.jobId);
      if (current.status !== "failed" || current.lifecycle.retryable !== true) {
        throw new Error("SENA workflow retry requires one failed, retryable, source-ready local server job.");
      }
      const retried = await updateEnterpriseServerJobStatus({
        jobId: current.id,
        action: "retry"
      });
      return workflowJobState(retried.job);
    },

    async prepareHumanGate(operation) {
      const context = await actorContext(operation.run);
      const carrier = await workflowSourceCarrier(input.store, operation.run);
      if (operation.run.kind === "engineering-release") {
        const parsed = engineeringEvidence(operation.run, carrier.parameters, carrier.sourceEvidence);
        const evaluated = evaluateSenaEngineeringEvidenceNode(
          operation.node.id,
          parsed.evidence,
          parsed.binding
        );
        return {
          candidateOutputDigest: senaWorkflowDigest({
            runId: operation.run.id,
            nodeId: operation.node.id,
            inputDigest: operation.inputDigest,
            predecessorReceiptHashes: operation.predecessorReceiptHashes,
            sourceBindingDigest: operation.run.sourceBindingDigest,
            evidenceOutputDigest: evaluated.outputDigest
          })
        };
      }
      const resolved = operation.run.kind === "research-evidence"
        ? await sourceRevision(context, operation.run, carrier.sourceEvidence)
        : undefined;
      const governancePreflight = operation.node.id === "data-governance-preflight" && resolved
        ? researchGovernancePreflight({
            run: operation.run,
            sourceEvidence: carrier.sourceEvidence,
            sourceProject: resolved.sourceProject
          })
        : undefined;
      const events = resolved && ["adjudication-gate", "expert-review-gate"].includes(operation.node.id)
        ? await input.store.runEvents(operation.run.id, operation.run.teamId)
        : undefined;
      const runSpecificGateEvidence = resolved && events
        ? operation.node.id === "adjudication-gate"
          ? await boundResearchJobEvidence(events, ["coding-reliability"])
          : await runSpecificClaimEvidence({ context, run: operation.run, source: resolved, events })
        : undefined;
      return {
        candidateOutputDigest: senaWorkflowDigest({
          runId: operation.run.id,
          nodeId: operation.node.id,
          inputDigest: operation.inputDigest,
          predecessorReceiptHashes: operation.predecessorReceiptHashes,
          sourceBindingDigest: operation.run.sourceBindingDigest,
          ...(governancePreflight ? { governancePreflight: governancePreflight.evidence } : {}),
          ...(runSpecificGateEvidence ? { runSpecificGateEvidence } : {}),
          sourceReviewEvidence: resolved ? {
            dataGovernance: resolved.sourceProject.snapshot.report.dataGovernance,
            codingReliabilityGate: resolved.sourceProject.snapshot.report.codingReliabilityGate,
            claimReadinessGate: resolved.sourceProject.snapshot.report.claimReadinessGate
          } : { candidateSha: operation.run.candidateSha ?? null }
        }),
        ...(governancePreflight?.blocker ? { blocker: governancePreflight.blocker } : {})
      };
    },

    async materialize(operation) {
      if (operation.node.effect === "server-job") {
        if (!operation.job?.outputDigest) {
          throw new Error("SENA workflow server job lacks a durable result receipt.");
        }
        const resultReceiptArtifact: SenaWorkflowArtifact = {
          id: `workflow_artifact_${senaWorkflowDigest({
            runId: operation.run.id,
            nodeId: operation.node.id,
            jobId: operation.job.id,
            outputDigest: operation.job.outputDigest
          }).slice(0, 24)}`,
          runId: operation.run.id,
          nodeId: operation.node.id,
          filename: `sena-workflow-${operation.node.id}-job-result.json`,
          schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobResult,
          sha256: operation.job.outputDigest,
          storageReference: `server-job:${operation.job.id}#resultReceipt`,
          evidenceLayer: operation.node.evidenceLayer,
          createdAt: operation.job.resultRecordedAt ?? operation.run.updatedAt
        };
        return {
          outputDigest: operation.job.outputDigest,
          artifacts: [resultReceiptArtifact],
          artifactReferences: operation.job.artifactReferences ?? [],
          jobReferences: [operation.job.id]
        };
      }
      if (operation.node.id === "evidence-closeout") {
        const events = await input.store.runEvents(operation.run.id, operation.run.teamId);
        const projectedRun: SenaWorkflowRun = {
          ...operation.run,
          status: "succeeded",
          currentNodeId: "evidence-closeout",
          pendingInterrupt: undefined,
          ...(operation.state.claimBoundary ? { claimBoundary: operation.state.claimBoundary } : {}),
          evidenceLayers: {
            ...operation.state.evidenceLayers,
            [operation.node.evidenceLayer]: "passed"
          }
        };
        const commitment = senaWorkflowCloseoutCommitment({ ...events, run: projectedRun });
        const artifact: SenaWorkflowArtifact = {
          id: `workflow_artifact_${senaWorkflowDigest({
            runId: operation.run.id,
            nodeId: operation.node.id,
            commitment
          }).slice(0, 24)}`,
          runId: operation.run.id,
          nodeId: operation.node.id,
          filename: "sena-workflow-closeout-commitment.json",
          schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseoutCommitment,
          sha256: commitment,
          storageReference: `workflow-closeout:${operation.run.id}#commitment-v1`,
          evidenceLayer: operation.node.evidenceLayer,
          createdAt: operation.run.updatedAt
        };
        return {
          outputDigest: commitment,
          artifacts: [artifact],
          artifactReferences: [artifact.id]
        };
      }
      if (operation.run.kind === "engineering-release") {
        const carrier = await workflowSourceCarrier(input.store, operation.run);
        const parsed = engineeringEvidence(operation.run, carrier.parameters, carrier.sourceEvidence);
        const executesGates = ["focused-gates", "full-local-gate", "shadow-release-model"]
          .includes(operation.node.id);
        const trustedGateReceipts = executesGates
          ? (await runSenaEngineeringVerificationNode({
              nodeId: operation.node.id,
              runId: operation.run.id,
              evidence: parsed.evidence,
              binding: parsed.binding,
              executeCommand: await (input.engineeringCommandExecutorFactory ?? createSenaEngineeringCommandExecutor)({
                evidence: parsed.evidence,
                binding: parsed.binding
              })
            })).receipts
          : [];
        const evaluated = evaluateSenaEngineeringEvidenceNode(
          operation.node.id,
          parsed.evidence,
          parsed.binding,
          trustedGateReceipts
        );
        const artifacts: SenaWorkflowArtifact[] = [];
        if (evaluated.document && evaluated.filename && evaluated.schemaVersion) {
          const sha256 = senaWorkflowDigest(evaluated.document);
          artifacts.push({
            id: `workflow_artifact_${senaWorkflowDigest({
              runId: operation.run.id,
              nodeId: operation.node.id,
              sha256
            }).slice(0, 24)}`,
            runId: operation.run.id,
            nodeId: operation.node.id,
            filename: evaluated.filename,
            schemaVersion: evaluated.schemaVersion,
            sha256,
            storageReference: `workflow-command:${carrier.sourceCommand.id}#parameters.engineeringEvidence`,
            evidenceLayer: operation.node.evidenceLayer,
            createdAt: operation.run.createdAt
          });
        }
        for (const receipt of evaluated.receipts) {
          const sha256 = senaWorkflowDigest(receipt);
          artifacts.push({
            id: `workflow_artifact_${senaWorkflowDigest({
              runId: operation.run.id,
              nodeId: operation.node.id,
              gate: receipt.gate,
              sha256
            }).slice(0, 24)}`,
            runId: operation.run.id,
            nodeId: operation.node.id,
            filename: `sena-engineering-${receipt.gate}-receipt.json`,
            schemaVersion: receipt.schemaVersion,
            sha256,
            storageReference: `workflow-worker:${operation.run.id}#engineering-gate/${receipt.gate}`,
            evidenceLayer: receipt.evidenceLayer,
            createdAt: receipt.finishedAt
          });
        }
        return {
          outputDigest: senaWorkflowDigest({
            mode: "shadow",
            runId: operation.run.id,
            nodeId: operation.node.id,
            inputDigest: operation.inputDigest,
            baseSha: operation.run.baseSha,
            candidateSha: operation.run.candidateSha ?? null,
            predecessorReceiptHashes: operation.predecessorReceiptHashes,
            evidenceOutputDigest: evaluated.outputDigest,
            externalSideEffects: false
          }),
          artifacts,
          ...(executesGates ? { actorType: "worker" as const } : {}),
          ...(evaluated.evidenceLayers ? { evidenceLayers: evaluated.evidenceLayers } : {})
        };
      }
      const context = await actorContext(operation.run);
      const carrier = await workflowSourceCarrier(input.store, operation.run);
      const resolved = await sourceRevision(context, operation.run, carrier.sourceEvidence);
      const report = resolved.sourceProject.snapshot.report;
      assertResearchAudit(operation.node.id, report);
      const events = await input.store.runEvents(operation.run.id, operation.run.teamId);
      let importBindingEvidence: Record<string, unknown> | undefined;
      if (operation.node.id === "data-contract-audit") {
        const importReceipt = events.receipts.find((receipt) => receipt.nodeId === "import-cleaning");
        const importJob = importReceipt?.jobId ? await getEnterpriseServerJob(importReceipt.jobId) : undefined;
        const importEvidence = importJob?.resultReceipt?.evidence;
        if (
          !importJob || importJob.status !== "succeeded" ||
          importEvidence?.importDatasetContentHash !== report.operatorDiagnostics.runIdentity.datasetContentHash ||
          typeof importEvidence.importCleaningManifestSha256 !== "string"
        ) {
          throw new Error("SENA imported dataset and cleaning receipt do not match the immutable analysis source.");
        }
        importBindingEvidence = {
          importJobId: importJob.id,
          importRunId: importEvidence.importRunId,
          datasetContentHash: importEvidence.importDatasetContentHash,
          cleaningManifestSha256: importEvidence.importCleaningManifestSha256,
          resultReceiptDigest: importJob.resultReceipt?.outputDigest
        };
      }
      let packageVerificationEvidence: Record<string, unknown> | undefined;
      if (operation.node.id === "package-verification") {
        const publicationReceipt = events.receipts.find((receipt) => receipt.nodeId === "publication-export");
        const publicationJob = publicationReceipt?.jobId
          ? await getEnterpriseServerJob(publicationReceipt.jobId)
          : undefined;
        const resultReceipt = publicationJob?.resultReceipt;
        const publicationArtifactId = resultReceipt?.evidence.publicationArtifactId;
        const publicationManifestSha256 = resultReceipt?.evidence.publicationDerivationManifestSha256 ??
          resultReceipt?.evidence.publicationBoundaryManifestSha256;
        if (
          !publicationReceipt || !publicationJob || publicationJob.status !== "succeeded" || !resultReceipt ||
          resultReceipt.outputDigest !== publicationReceipt.outputDigest ||
          typeof publicationArtifactId !== "string" ||
          typeof resultReceipt.evidence.publicationSha256 !== "string" ||
          typeof resultReceipt.evidence.publicationBytes !== "number" ||
          typeof publicationManifestSha256 !== "string"
        ) {
          throw new Error("SENA publication package lacks a complete bound terminal receipt.");
        }
        const [artifactMetadata] = await readEnterpriseUploadMetadataAsync(context, {
          teamId: operation.run.teamId,
          uploadIds: [publicationArtifactId]
        });
        if (
          !artifactMetadata || artifactMetadata.sha256 !== resultReceipt.evidence.publicationSha256 ||
          artifactMetadata.size !== resultReceipt.evidence.publicationBytes ||
          !resultReceipt.artifactReferences.includes(publicationArtifactId) ||
          (operation.run.claimBoundary === "exploratory-only" &&
            publicationJob.payloadSummary.publicationScope !== "exploratory-only") ||
          (operation.run.claimBoundary === "inference-ready" &&
            publicationJob.payloadSummary.publicationScope !== "claim-ready-with-limits")
        ) {
          throw new Error("SENA publication artifact metadata drifted from its terminal result receipt.");
        }
        packageVerificationEvidence = {
          publicationJobId: publicationJob.id,
          publicationArtifactId,
          publicationSha256: resultReceipt.evidence.publicationSha256,
          publicationBytes: resultReceipt.evidence.publicationBytes,
          publicationManifestSha256,
          publicationScope: publicationJob.payloadSummary.publicationScope,
          claimBoundary: operation.run.claimBoundary,
          resultReceiptDigest: resultReceipt.outputDigest
        };
      }
      const claimEvidence = operation.node.id === "claim-readiness"
        ? await runSpecificClaimEvidence({ context, run: operation.run, source: resolved, events })
        : undefined;
      const claimBoundary = operation.node.id === "claim-readiness"
        ? operation.run.researchSourceClass === "approved-pseudonymized" &&
          claimEvidence?.ready === true &&
          ["adjudication-gate", "expert-review-gate"].every((nodeId) => events.approvals.some(
            (approval) => approval.nodeId === nodeId && approval.decision === "approve"
          ))
          ? "inference-ready" as const
          : "exploratory-only" as const
        : undefined;
      return {
        outputDigest: senaWorkflowDigest({
          runId: operation.run.id,
          nodeId: operation.node.id,
          inputDigest: operation.inputDigest,
          predecessorReceiptHashes: operation.predecessorReceiptHashes,
          sourceBindingDigest: operation.run.sourceBindingDigest,
          reportEvidence: operation.node.id === "data-contract-audit"
            ? { dataContractAudit: report.dataContractAudit, importBindingEvidence }
            : operation.node.id === "audit-runtime-consistency"
              ? report.runtimeConsistencyAudit
              : operation.node.id === "audit-fusion-math"
                ? report.fusionMathAudit
                : operation.node.id === "audit-jena-jsna-provenance"
                  ? { ena: report.enaManifest, sna: report.snaManifest }
                  : operation.node.id === "audit-temporal-trace"
                    ? report.figures.temporalTrace
                    : operation.node.id === "audit-evidence-ledger"
                      ? report.evidenceSnippets
                      : operation.node.id === "audit-data-governance"
                        ? report.dataGovernance
                        : operation.node.id === "claim-readiness"
                          ? {
                              claimReadinessGate: report.claimReadinessGate,
                              researchSourceClass: operation.run.researchSourceClass,
                              fixtureEvidenceExcludedFromInferenceReadiness:
                                operation.run.researchSourceClass === "fixture",
                              runSpecificClaimEvidence: claimEvidence
                            }
                          : operation.node.id === "package-verification"
                            ? packageVerificationEvidence
                          : {
                              reportSchemaVersion: report.schemaVersion,
                              generatedAt: report.generatedAt,
                              completedReceiptCount: events.receipts.length
                            }
        }),
        ...(claimBoundary ? { claimBoundary } : {})
      };
    }
  };
}
