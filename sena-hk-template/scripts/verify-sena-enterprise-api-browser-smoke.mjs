import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const defaultTimeout = 15000;
const requiredPublicationFormats = ["svg", "png", "html", "xlsx", "docx", "pdf"];
const scimIdentityProductionExtensionSchema = "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig";

function enterpriseSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
}

function header(response, name) {
  return response.headers()[name.toLowerCase()] ?? "";
}

function requireHeaderValue(headers, name) {
  const value = headers[name.toLowerCase()] ?? "";
  if (!value) throw new Error(`Missing required response header ${name}.`);
  return value;
}

function assertArrayIncludes(array, expected, label) {
  if (!Array.isArray(array) || !array.includes(expected)) {
    throw new Error(`${label} missing ${expected}; received ${JSON.stringify(array)}.`);
  }
}

function isSelfManagedIdentityEvidence(identityProductionEvidence) {
  return Array.isArray(identityProductionEvidence?.evidence) &&
    identityProductionEvidence.evidence.includes("enterpriseDeploymentMode=self-managed") &&
    identityProductionEvidence.evidence.includes("institutionIdentityEvidence=not-applicable");
}

async function fillByTestId(page, testId, value) {
  await page.locator(`[data-testid="${testId}"]`).first().fill(value, { timeout: defaultTimeout });
}

async function checkByTestId(page, testId) {
  const locator = page.locator(`[data-testid="${testId}"]`).first();
  await locator.waitFor({ state: "visible", timeout: defaultTimeout });
  await locator.check({ timeout: defaultTimeout });
}

async function submitAndWaitForResponse(page, submitTestId, apiPath) {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => (
      new URL(candidate.url()).pathname === apiPath &&
      candidate.request().method() === "POST"
    ), { timeout: defaultTimeout }),
    page.locator(`[data-testid="${submitTestId}"]`).first().click({ timeout: defaultTimeout })
  ]);
  if (!response.ok()) {
    throw new Error(`${apiPath} returned HTTP ${response.status()}: ${await response.text()}`);
  }
  return response;
}

async function registerSmokeSession(page, origin) {
  const unique = randomUUID().slice(0, 8);
  const email = `enterprise-api-smoke-${unique}@example.edu`;
  const password = "sena-secure-123";

  await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
  await fillByTestId(page, "register-full-name", "SENA Enterprise API Smoke");
  await fillByTestId(page, "register-email", email);
  await fillByTestId(page, "register-organization", "SENA Enterprise API Smoke Lab");
  await fillByTestId(page, "register-password", password);
  await fillByTestId(page, "register-confirm-password", password);
  await checkByTestId(page, "register-terms");
  const registerResponse = await submitAndWaitForResponse(page, "register-submit", "/api/auth/register");
  if (header(registerResponse, "x-sena-auth-flow") !== "password-register") {
    throw new Error(`Expected password-register flow, received ${header(registerResponse, "x-sena-auth-flow") || "<missing>"}.`);
  }
  if (header(registerResponse, "x-sena-auth-membership-role") !== "owner") {
    throw new Error(`Expected owner registration role, received ${header(registerResponse, "x-sena-auth-membership-role") || "<missing>"}.`);
  }
  const teamId = header(registerResponse, "x-sena-auth-team-id");
  if (!teamId) {
    throw new Error("Registration response did not include x-sena-auth-team-id for enterprise API smoke.");
  }
  await page.waitForURL("**/workspace/sena", { timeout: defaultTimeout });
  return { email, teamId };
}

async function fetchEnterpriseWorkflow(page, teamId, provisioningToken) {
  return await page.evaluate(async ({ requiredFormats, teamId: activeTeamId, provisioningToken: bearerToken }) => {
    function responseHeaders(response) {
      return Object.fromEntries(Array.from(response.headers.entries()));
    }

    function parseJsonResponse(response) {
      return response.json().catch(async () => ({
        parseError: await response.text()
      }));
    }

    const scimConfigResponse = await fetch("/api/sena/scim/v2/ServiceProviderConfig", {
      credentials: "include",
      headers: {
        authorization: `Bearer ${bearerToken}`
      }
    });
    const scimConfigBody = await parseJsonResponse(scimConfigResponse);
    const scimConfigHeaders = responseHeaders(scimConfigResponse);

    const csrfResponse = await fetch("/api/auth/csrf", { credentials: "include" });
    const csrfBody = await parseJsonResponse(csrfResponse);
    const csrfToken = csrfBody?.token;
    if (!csrfResponse.ok || !csrfToken) {
      return {
        scimConfig: { status: scimConfigResponse.status, headers: scimConfigHeaders, body: scimConfigBody },
        csrf: { status: csrfResponse.status, headers: responseHeaders(csrfResponse), body: csrfBody },
        platformDecision: null,
        importResult: null,
        publicationBlocked: null,
        reliability: null,
        publication: null
      };
    }

    const platformDecisionResponse = await fetch("/api/sena/ops/platform-decisions", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": csrfToken
      },
      body: JSON.stringify({
        teamId: activeTeamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution Identity Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        notes: "Records identity request packet response smoke without attaching production evidence IDs yet."
      })
    });
    const platformDecisionBody = await parseJsonResponse(platformDecisionResponse);
    const platformDecisionHeaders = responseHeaders(platformDecisionResponse);

    const transcript = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "P01: We should ask a better #Question and gather #Evidence.",
      "",
      "2",
      "00:00:04,000 --> 00:00:06,000",
      "P02: The graph gives #Evidence for the emerging #Claim.",
      "",
      "3",
      "00:00:07,000 --> 00:00:09,000",
      "P01: Let's write an {{Explanation}} and return to #Reflection."
    ].join("\n");

    const form = new FormData();
    form.set("action", "create-project");
    form.set("title", "Enterprise API Smoke Transcript");
    form.set("includeRuntimeBundle", "true");
    form.set("codingReliability", JSON.stringify({
      status: "documented",
      reviewer: "Enterprise API smoke fixture",
      reviewedAt: "2026-07-07T00:00:00.000Z",
      codingScheme: "Synthetic smoke transcript coding fixture v1",
      unitOfCoding: "utterance",
      coderCount: 2,
      agreementMetric: "fixture-consensus",
      agreementValue: "1.00",
      adjudicationNotes: "Synthetic smoke fixture uses deterministic consensus coding.",
      limitations: "Synthetic fixture only; not human-subjects research evidence."
    }));
    form.set("dataGovernance", JSON.stringify({
      irbApprovalId: "SYNTHETIC-SMOKE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic browser-smoke fixture; no participant data.",
      retentionPolicy: "Retain only generated smoke artifacts for automated verification.",
      usageConstraints: ["Automated verification only", "Do not use for research claims"],
      dataSteward: "SENA enterprise smoke verifier",
      reviewedAt: "2026-07-07T00:00:00.000Z"
    }));
    form.append("files", new File([transcript], "enterprise-api-smoke-transcript.srt", {
      type: "application/x-subrip"
    }));

    const importResponse = await fetch("/api/sena/import", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-sena-csrf-token": csrfToken
      },
      body: form
    });
    const importBody = await parseJsonResponse(importResponse);
    const importHeaders = responseHeaders(importResponse);
    const projectId = importBody?.persistedProject?.id;

    let publicationBlockedResponse = null;
    let publicationBlockedBody = null;
    let publicationBlockedHeaders = null;
    let reliabilityResponse = null;
    let reliabilityBody = null;
    let reliabilityHeaders = null;
    let publicationResponse = null;
    let publicationBody = null;
    let publicationHeaders = null;
    if (projectId) {
      publicationBlockedResponse = await fetch("/api/sena/exports/publication", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectId,
          format: "package"
        })
      });
      publicationBlockedBody = await parseJsonResponse(publicationBlockedResponse);
      publicationBlockedHeaders = responseHeaders(publicationBlockedResponse);

      const snapshot = importBody?.persistedProject?.snapshot;
      const authoritativeDataset = snapshot?.source?.sourceDataset ?? snapshot?.dataset;
      const itemIds = authoritativeDataset?.utterances?.slice(0, 3).map((utterance) => utterance.id) ?? [];
      const codeIds = authoritativeDataset?.codebook?.slice(0, 3).map((code) => code.id) ?? [];
      const annotations = itemIds.flatMap((itemId, index) => ["enterprise-smoke-coder-a", "enterprise-smoke-coder-b"].map((coderId) => ({
        coder_id: coderId,
        item_id: itemId,
        code_id: codeIds[index],
        value: "1"
      })));
      reliabilityResponse = await fetch("/api/sena/reliability", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: activeTeamId,
          projectId,
          reviewer: "Enterprise API smoke reliability reviewer",
          sourceName: "enterprise-api-smoke-reliability.json",
          annotations
        })
      });
      reliabilityBody = await parseJsonResponse(reliabilityResponse);
      reliabilityHeaders = responseHeaders(reliabilityResponse);

      publicationResponse = await fetch("/api/sena/exports/publication", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectId,
          format: "package"
        })
      });
      publicationBody = await parseJsonResponse(publicationResponse);
      publicationHeaders = responseHeaders(publicationResponse);
    }

    return {
      scimConfig: {
        status: scimConfigResponse.status,
        headers: scimConfigHeaders,
        body: scimConfigBody
      },
      csrf: {
        status: csrfResponse.status,
        headers: responseHeaders(csrfResponse),
        body: csrfBody
      },
      platformDecision: {
        status: platformDecisionResponse.status,
        headers: platformDecisionHeaders,
        body: platformDecisionBody
      },
      importResult: {
        status: importResponse.status,
        headers: importHeaders,
        body: importBody
      },
      publicationBlocked: publicationBlockedResponse ? {
        status: publicationBlockedResponse.status,
        headers: publicationBlockedHeaders,
        body: publicationBlockedBody
      } : null,
      reliability: reliabilityResponse ? {
        status: reliabilityResponse.status,
        headers: reliabilityHeaders,
        body: reliabilityBody
      } : null,
      publication: publicationResponse ? {
        status: publicationResponse.status,
        headers: publicationHeaders,
        body: publicationBody,
        requiredFormats
      } : null
    };
  }, { requiredFormats: requiredPublicationFormats, teamId, provisioningToken });
}

function assertEnterpriseWorkflowEvidence(evidence) {
  const scimConfig = evidence.scimConfig;
  if (scimConfig?.status !== 200) {
    throw new Error(`SCIM ServiceProviderConfig returned HTTP ${scimConfig?.status ?? "<missing>"}: ${JSON.stringify(scimConfig?.body)}.`);
  }
  if (scimConfig.body?.schemaVersion !== "sena-scim-service-provider-config/v1") {
    throw new Error(`SCIM ServiceProviderConfig returned unexpected schema ${scimConfig.body?.schemaVersion ?? "<missing>"}.`);
  }
  assertArrayIncludes(scimConfig.body?.schemas, scimIdentityProductionExtensionSchema, "SCIM ServiceProviderConfig schemas");
  assertArrayIncludes(scimConfig.body?.supportedSchemas, scimIdentityProductionExtensionSchema, "SCIM ServiceProviderConfig supportedSchemas");
  const scimIdentityGate = scimConfig.body?.[scimIdentityProductionExtensionSchema];
  if (scimIdentityGate?.schemaVersion !== "sena-scim-identity-production-gate/v1") {
    throw new Error(`SCIM ServiceProviderConfig missing identity production extension: ${JSON.stringify(scimIdentityGate)}.`);
  }
  if (scimConfig.headers["x-sena-scim-production-owner-gate"] !== scimIdentityGate.status) {
    throw new Error(`SCIM production owner gate header/body mismatch: ${scimConfig.headers["x-sena-scim-production-owner-gate"]} vs ${scimIdentityGate.status}.`);
  }
  requireHeaderValue(scimConfig.headers, "x-sena-identity-institution-action-plan-digest");
  requireHeaderValue(scimConfig.headers, "x-sena-identity-owner-runbook-digest");
  requireHeaderValue(scimConfig.headers, "x-sena-identity-owner-runbook-blocking");
  requireHeaderValue(scimConfig.headers, "x-sena-identity-owner-runbook-preflight-checks");
  if (!/^[a-f0-9]{64}$/.test(String(scimIdentityGate.institutionActionPlan?.digest ?? ""))) {
    throw new Error(`SCIM identity production extension is missing action-plan digest: ${JSON.stringify(scimIdentityGate.institutionActionPlan)}.`);
  }
  if (scimIdentityGate.platformDecisionSubmission?.path !== "/api/sena/ops/platform-decisions") {
    throw new Error(`SCIM identity production extension is missing platform decision submission path: ${JSON.stringify(scimIdentityGate.platformDecisionSubmission)}.`);
  }
  if (scimIdentityGate.redaction?.secretValuesExcluded !== true ||
      scimIdentityGate.redaction?.evidenceUrlValuesExcluded !== true ||
      scimIdentityGate.redaction?.ownerNamesExcluded !== true) {
    throw new Error(`SCIM identity production redaction flags are incomplete: ${JSON.stringify(scimIdentityGate.redaction)}.`);
  }

  if (evidence.csrf.status !== 200 || evidence.csrf.body?.schemaVersion !== "sena-enterprise-csrf-token/v1") {
    throw new Error(`CSRF preflight failed: ${JSON.stringify(evidence.csrf)}.`);
  }

  const platformDecision = evidence.platformDecision;
  if (platformDecision?.status !== 201) {
    throw new Error(`Platform decision POST returned HTTP ${platformDecision?.status ?? "<missing>"}: ${JSON.stringify(platformDecision?.body)}.`);
  }
  if (platformDecision.body?.acceptance?.decisionId !== "institution-idp-approval") {
    throw new Error(`Platform decision response did not record institution-idp-approval: ${JSON.stringify(platformDecision.body?.acceptance)}.`);
  }
  if (platformDecision.body?.identityProductionEvidence?.schemaVersion !== "sena-enterprise-identity-production-evidence/v1") {
    throw new Error(`Platform decision response did not include refreshed identityProductionEvidence: ${JSON.stringify(platformDecision.body?.identityProductionEvidence)}.`);
  }
  const identityProductionEvidence = platformDecision.body.identityProductionEvidence;
  if (!Number.isFinite(identityProductionEvidence?.platformRequestPacket?.summary?.blockingRequests)) {
    throw new Error(`Identity production evidence is missing platformRequestPacket.summary.blockingRequests: ${JSON.stringify(platformDecision.body?.identityProductionEvidence)}.`);
  }
  if (!Number.isFinite(identityProductionEvidence?.submissionVerifier?.summary?.incompleteDecisions)) {
    throw new Error(`Identity production evidence is missing submissionVerifier.summary.incompleteDecisions: ${JSON.stringify(platformDecision.body?.identityProductionEvidence)}.`);
  }
  const cutoverChecklist = identityProductionEvidence.cutoverChecklist;
  if (cutoverChecklist?.schemaVersion !== "sena-enterprise-identity-cutover-checklist/v1") {
    throw new Error(`Identity production evidence is missing sena-enterprise-identity-cutover-checklist/v1: ${JSON.stringify(identityProductionEvidence)}.`);
  }
  if (!Number.isFinite(cutoverChecklist.summary.blockingItems)) {
    throw new Error(`Identity production evidence is missing cutoverChecklist.summary.blockingItems: ${JSON.stringify(cutoverChecklist)}.`);
  }
  ["idp-tenant-approval", "sso-secret-custody", "scim-idp-ownership", "identity-secret-rotation"].forEach((cutoverItemId) => {
    if (!cutoverChecklist.items?.some((item) => item.id === cutoverItemId)) {
      throw new Error(`Identity cutover checklist missing ${cutoverItemId}: ${JSON.stringify(cutoverChecklist)}.`);
    }
  });
  const submissionMatrix = identityProductionEvidence.institutionActionPlan?.submissionMatrix;
  if (submissionMatrix?.schemaVersion !== "sena-enterprise-identity-submission-matrix/v1") {
    throw new Error(`Identity production evidence is missing sena-enterprise-identity-submission-matrix/v1: ${JSON.stringify(identityProductionEvidence.institutionActionPlan)}.`);
  }
  const selfManagedIdentityEvidence = isSelfManagedIdentityEvidence(identityProductionEvidence);
  if (selfManagedIdentityEvidence) {
    if (identityProductionEvidence.status !== "ready" || identityProductionEvidence.releaseGate?.approvalBlocked !== false) {
      throw new Error(`Self-managed identity evidence should be ready and not release-blocking: ${JSON.stringify({
        status: identityProductionEvidence.status,
        releaseGate: identityProductionEvidence.releaseGate
      })}.`);
    }
    if (submissionMatrix.summary?.rows !== 0 || submissionMatrix.summary?.blockingRows !== 0) {
      throw new Error(`Self-managed identity submission matrix should have no institution-submission rows: ${JSON.stringify(submissionMatrix.summary)}.`);
    }
  } else {
    if (!Number.isFinite(submissionMatrix.summary?.rows) || submissionMatrix.summary.rows < 4) {
      throw new Error(`Identity submission matrix has invalid submissionMatrix.rows: ${JSON.stringify(submissionMatrix.summary)}.`);
    }
    [
      ["institution-idp-owner", "institution-idp-approval", "idp-tenant-approval", "platform-acceptance"],
      ["institution-idp-owner", "institution-idp-approval", "sso-secret-rotation", "platform-acceptance"],
      ["institution-provisioning-owner", "institution-provisioning-owner", "scim-or-idp-ownership", "platform-acceptance"],
      ["institution-provisioning-owner", "institution-provisioning-owner", "identity-lifecycle-owner-mode", "technical-readiness"]
    ].forEach(([laneId, decisionId, evidenceId, evidenceSource]) => {
      const row = submissionMatrix.rows?.find((candidate) =>
        candidate.laneId === laneId &&
        candidate.decisionId === decisionId &&
        candidate.evidenceId === evidenceId &&
        candidate.evidenceSource === evidenceSource
      );
      if (!row) {
        throw new Error(`Identity submission matrix missing ${laneId}/${decisionId}/${evidenceId}/${evidenceSource}: ${JSON.stringify(submissionMatrix.rows)}.`);
      }
      if (!Array.isArray(row.responseAuditHeaders) || !row.responseAuditHeaders.includes("x-sena-identity-production-status")) {
        throw new Error(`Identity submission matrix row is missing response audit headers: ${JSON.stringify(row)}.`);
      }
      if (!Array.isArray(row.receiptArchiveBodyPaths) || !row.receiptArchiveBodyPaths.includes("identityProductionEvidence.institutionActionPlan")) {
        throw new Error(`Identity submission matrix row is missing receipt archive body paths: ${JSON.stringify(row)}.`);
      }
    });
  }
  const ownerRunbooks = identityProductionEvidence.institutionActionPlan?.ownerRunbooks;
  if (ownerRunbooks?.schemaVersion !== "sena-enterprise-identity-owner-runbook/v1") {
    throw new Error(`Identity production evidence is missing sena-enterprise-identity-owner-runbook/v1: ${JSON.stringify(identityProductionEvidence.institutionActionPlan)}.`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(ownerRunbooks.digest ?? ""))) {
    throw new Error(`Identity owner runbook is missing ownerRunbooks.digest: ${JSON.stringify(ownerRunbooks)}.`);
  }
  if (requireHeaderValue(platformDecision.headers, "x-sena-identity-owner-runbook-digest") !== ownerRunbooks.digest) {
    throw new Error(`Identity owner runbook digest header/body mismatch: ${platformDecision.headers["x-sena-identity-owner-runbook-digest"]} vs ${ownerRunbooks.digest}.`);
  }
  [
    ["x-sena-identity-owner-runbook-blocking", ownerRunbooks.summary.blockingRunbooks],
    ["x-sena-identity-owner-runbook-preflight-checks", ownerRunbooks.summary.preflightChecks],
    ["x-sena-identity-owner-runbook-submission-steps", ownerRunbooks.summary.submissionSteps],
    ["x-sena-identity-owner-runbook-receipt-archive-steps", ownerRunbooks.summary.receiptArchiveSteps]
  ].forEach(([headerName, expected]) => {
    const headerValue = requireHeaderValue(platformDecision.headers, headerName);
    if (headerValue !== String(expected)) {
      throw new Error(`Identity owner runbook ${headerName} header/body mismatch: ${headerValue} vs ${expected}.`);
    }
  });
  if (!Number.isFinite(ownerRunbooks.summary?.lanes) || ownerRunbooks.summary.lanes < 2) {
    throw new Error(`Identity owner runbook has invalid ownerRunbooks.runbooks summary: ${JSON.stringify(ownerRunbooks.summary)}.`);
  }
  [
    ["institution-idp-owner", "Institution IdP owner", "idp-tenant-technical-binding", "SENA_SSO_INSTITUTION_TENANT_ID", "institution-idp-approval"],
    ["institution-provisioning-owner", "Institution provisioning owner", "scim-lifecycle-owner-mode", "SENA_IDENTITY_LIFECYCLE_OWNER_MODE", "institution-provisioning-owner"]
  ].forEach(([laneId, ownerRole, preflightId, envVar, decisionId]) => {
    const runbook = ownerRunbooks.runbooks?.find((candidate) => candidate.laneId === laneId);
    if (!runbook) {
      throw new Error(`Identity ownerRunbooks.runbooks missing ${laneId}: ${JSON.stringify(ownerRunbooks.runbooks)}.`);
    }
    if (runbook.ownerRole !== ownerRole) {
      throw new Error(`Identity owner runbook has unexpected ownerRole for ${laneId}: ${JSON.stringify(runbook)}.`);
    }
    const preflight = runbook.preflightChecks?.find((candidate) => candidate.id === preflightId);
    if (!preflight || !preflight.envVars?.includes(envVar)) {
      throw new Error(`Identity owner runbook missing ${preflightId}/${envVar}: ${JSON.stringify(runbook.preflightChecks)}.`);
    }
    const submissionStep = runbook.submissionSteps?.find((candidate) => candidate.decisionId === decisionId);
    if (!submissionStep || submissionStep.path !== "/api/sena/ops/platform-decisions" || !submissionStep.responseAuditHeaders?.includes("x-sena-identity-production-status")) {
      throw new Error(`Identity owner runbook missing submission step for ${decisionId}: ${JSON.stringify(runbook.submissionSteps)}.`);
    }
    const archiveStep = runbook.receiptArchiveSteps?.find((candidate) => candidate.decisionId === decisionId);
    if (!archiveStep || !archiveStep.requiredBodyPaths?.includes("identityProductionEvidence.institutionActionPlan")) {
      throw new Error(`Identity owner runbook missing receipt archive step for ${decisionId}: ${JSON.stringify(runbook.receiptArchiveSteps)}.`);
    }
  });

  const importResult = evidence.importResult;
  if (importResult?.status !== 201) {
    throw new Error(`Enterprise import returned HTTP ${importResult?.status ?? "<missing>"}: ${JSON.stringify(importResult?.body)}.`);
  }
  if (importResult.body?.schemaVersion !== "sena-enterprise-import/v1") {
    throw new Error(`Enterprise import returned unexpected schema ${importResult.body?.schemaVersion ?? "<missing>"}.`);
  }
  if (importResult.body?.importRun?.status !== "completed") {
    throw new Error(`Enterprise import run was not completed: ${JSON.stringify(importResult.body?.importRun)}.`);
  }
  assertArrayIncludes(importResult.body?.cleaningManifest?.summary?.adapterProfiles, "cleaned-transcript", "import cleaning adapter profiles");
  const importRunId = requireHeaderValue(importResult.headers, "x-sena-import-run-id");
  const projectId = requireHeaderValue(importResult.headers, "x-sena-project-id");
  const analysisRunId = requireHeaderValue(importResult.headers, "x-sena-analysis-run-id");
  const importProfiles = requireHeaderValue(importResult.headers, "x-sena-import-profiles");
  if (!importProfiles.includes("cleaned-transcript")) {
    throw new Error(`Expected x-sena-import-profiles to include cleaned-transcript, received ${importProfiles}.`);
  }
  if (importResult.body?.importRun?.id !== importRunId) {
    throw new Error(`Import run id header/body mismatch: ${importRunId} vs ${importResult.body?.importRun?.id}.`);
  }
  if (importResult.body?.persistedProject?.id !== projectId) {
    throw new Error(`Project id header/body mismatch: ${projectId} vs ${importResult.body?.persistedProject?.id}.`);
  }
  if (importResult.body?.enterpriseAnalysisRun?.id !== analysisRunId) {
    throw new Error(`Analysis run id header/body mismatch: ${analysisRunId} vs ${importResult.body?.enterpriseAnalysisRun?.id}.`);
  }

  const publicationBlocked = evidence.publicationBlocked;
  if (publicationBlocked?.status !== 409 || publicationBlocked.body?.code !== "publication_export_model_card_blocked") {
    throw new Error(`Publication export without current v2 machine evidence should return 409: ${JSON.stringify(publicationBlocked)}.`);
  }
  if (publicationBlocked.headers?.["x-sena-observed-status-class"] !== "4xx") {
    throw new Error(`Blocked publication export did not expose observed 4xx evidence: ${JSON.stringify(publicationBlocked.headers)}.`);
  }

  const reliability = evidence.reliability;
  if (reliability?.status !== 200 || reliability.body?.schemaVersion !== "sena-reliability-response/v1") {
    throw new Error(`Enterprise reliability run returned invalid current-v2 evidence: ${JSON.stringify(reliability)}.`);
  }
  if (reliability.body?.dashboard?.schemaVersion !== "sena-coding-reliability-dashboard/v2" ||
    reliability.body?.dashboard?.claimEligibility?.eligible !== true) {
    throw new Error(`Enterprise reliability dashboard is not current-v2 claim-eligible evidence: ${JSON.stringify(reliability.body?.dashboard)}.`);
  }
  const reliabilityRunId = requireHeaderValue(reliability.headers, "x-sena-reliability-run-id");
  if (reliability.body?.reliabilityRun?.id !== reliabilityRunId ||
    reliability.body?.reliabilityRun?.projectId !== projectId ||
    reliability.body?.reliabilityRun?.projectBinding?.projectId !== projectId ||
    reliability.body?.reliabilityRun?.projectBinding?.projectVersion !== importResult.body?.persistedProject?.currentVersion) {
    throw new Error(`Enterprise reliability evidence is not bound to the imported current project revision: ${JSON.stringify(reliability.body?.reliabilityRun)}.`);
  }

  const publication = evidence.publication;
  if (publication?.status !== 200) {
    throw new Error(`Publication package export returned HTTP ${publication?.status ?? "<missing>"}: ${JSON.stringify(publication?.body)}.`);
  }
  if (publication.body?.schemaVersion !== "sena-publication-package/v1") {
    throw new Error(`Publication package returned unexpected schema ${publication.body?.schemaVersion ?? "<missing>"}.`);
  }
  if (publication.body?.enterpriseProjectEvidence?.projectId !== projectId) {
    throw new Error(`Publication package did not use the imported persisted project ${projectId}.`);
  }
  if (publication.body?.sourceSnapshotEvidence?.snapshotSchemaVersion !== "sena-project-snapshot/v1") {
    throw new Error(`Publication package is missing project snapshot evidence: ${JSON.stringify(publication.body?.sourceSnapshotEvidence)}.`);
  }
  const derivation = publication.body?.enterpriseProjectEvidence?.publicationDerivation;
  if (derivation?.kind !== "current-project-reliability-run" ||
    derivation?.reliabilityRunId !== reliabilityRunId ||
    derivation?.reliabilityDashboardSchemaVersion !== "sena-coding-reliability-dashboard/v2" ||
    derivation?.projectVersion !== importResult.body?.persistedProject?.currentVersion) {
    throw new Error(`Publication package is missing its current-v2 reliability derivation: ${JSON.stringify(derivation)}.`);
  }
  if (publication.body?.claimEvidence?.codingReliability !== "ready") {
    throw new Error(`Publication package coding reliability gate is not ready: ${JSON.stringify(publication.body?.claimEvidence)}.`);
  }
  if (publication.body?.enterpriseProjectEvidence?.sourceSnapshotSha256 !== publication.body?.sourceSnapshotEvidence?.snapshotSha256) {
    throw new Error(`Derived publication snapshot hash does not match enterprise project evidence: ${JSON.stringify(publication.body?.enterpriseProjectEvidence)}.`);
  }
  if (derivation?.persistedSourceSnapshotSha256 !== publication.body?.enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256 ||
    derivation?.persistedSourceSnapshotSha256 === publication.body?.sourceSnapshotEvidence?.snapshotSha256) {
    throw new Error(`Persisted and reliability-derived publication snapshot hashes are not distinguished: ${JSON.stringify(publication.body?.enterpriseProjectEvidence)}.`);
  }
  if (requireHeaderValue(publication.headers, "x-sena-publication-reliability-run-id") !== reliabilityRunId ||
    requireHeaderValue(publication.headers, "x-sena-persisted-source-snapshot-sha256") !== derivation.persistedSourceSnapshotSha256) {
    throw new Error(`Publication response headers do not bind the current-v2 reliability derivation: ${JSON.stringify(publication.headers)}.`);
  }
  requiredPublicationFormats.forEach((format) => {
    assertArrayIncludes(publication.body?.manifest?.formats, format, "publication package manifest formats");
    assertArrayIncludes(publication.headers["x-sena-publication-formats"]?.split(","), format, "x-sena-publication-formats");
  });
  requireHeaderValue(publication.headers, "x-sena-publication-package-sha256");
  requireHeaderValue(publication.headers, "x-sena-publication-artifact-count");
  requireHeaderValue(publication.headers, "x-sena-publication-verification-status");
  if (publication.headers["x-sena-publication-verification-status"] !== "verified") {
    throw new Error(`Publication package verification status should be verified, received ${publication.headers["x-sena-publication-verification-status"]}.`);
  }
  if (publication.body?.verificationCertificate?.status !== "verified") {
    throw new Error(`Publication verification certificate should be verified: ${JSON.stringify(publication.body?.verificationCertificate)}.`);
  }
  const artifactManifest = publication.body?.artifactManifest ?? [];
  if (!Array.isArray(artifactManifest) || artifactManifest.length < requiredPublicationFormats.length) {
    throw new Error(`Publication package artifact manifest is incomplete: ${JSON.stringify(artifactManifest)}.`);
  }
  for (const format of requiredPublicationFormats) {
    const artifact = artifactManifest.find((candidate) => candidate.format === format);
    if (!artifact || artifact.bytes <= 0 || !/^[a-f0-9]{64}$/.test(String(artifact.sha256))) {
      throw new Error(`Publication package has invalid ${format} artifact evidence: ${JSON.stringify(artifact)}.`);
    }
  }
}

export async function verifySenaEnterpriseApiBrowserSmoke(baseUrl = enterpriseSmokeOriginFromCli(), options = {}) {
  const origin = new URL(baseUrl).origin;
  const provisioningToken = options.provisioningToken ??
    process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_PROVISIONING_TOKEN ??
    process.env.SENA_PROVISIONING_TOKEN ??
    "sena-pilot-provisioning-token";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const session = await registerSmokeSession(page, origin);
    const evidence = await fetchEnterpriseWorkflow(page, session.teamId, provisioningToken);
    assertEnterpriseWorkflowEvidence(evidence);
    console.log(`Enterprise API browser smoke passed for identity platform decision plus import, missing-evidence 409, current-v2 reliability binding, and publication package 200 on ${origin}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaEnterpriseApiBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
