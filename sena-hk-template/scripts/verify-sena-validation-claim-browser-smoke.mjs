import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const defaultTimeout = 30000;
const password = "sena-secure-123";
const validationEvidencePath = "evidence.validation";
const expertReviewEvidencePath = "evidence.expertReview";

function validationSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_VALIDATION_CLAIM_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
}

function requireHeader(responseOrHeaders, name, expected) {
  const headers = typeof responseOrHeaders.headers === "function"
    ? responseOrHeaders.headers()
    : responseOrHeaders;
  const actual = headers[name.toLowerCase()] ?? "";
  if (expected !== undefined && actual !== expected) {
    throw new Error(`Expected ${name}=${expected}, received ${actual || "<missing>"}.`);
  }
  if (expected === undefined && !actual) {
    throw new Error(`Missing required response header ${name}.`);
  }
  return actual;
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

async function fetchJson(page, path, init = {}) {
  return await page.evaluate(async ({ path: requestPath, init: requestInit }) => {
    const response = await fetch(requestPath, {
      credentials: "include",
      ...requestInit
    });
    const body = await response.json().catch(async () => ({
      parseError: await response.text()
    }));
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(Array.from(response.headers.entries())),
      body
    };
  }, { path, init });
}

async function registerValidationReviewer(page, origin, unique) {
  const email = `validation-claim-smoke-${unique}@example.edu`;
  await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
  await fillByTestId(page, "register-full-name", "SENA Validation Claim Smoke");
  await fillByTestId(page, "register-email", email);
  await fillByTestId(page, "register-organization", "SENA Validation Lab");
  await fillByTestId(page, "register-password", password);
  await fillByTestId(page, "register-confirm-password", password);
  await checkByTestId(page, "register-terms");
  const registerResponse = await submitAndWaitForResponse(page, "register-submit", "/api/auth/register");
  requireHeader(registerResponse, "x-sena-auth-flow", "password-register");
  const teamId = requireHeader(registerResponse, "x-sena-auth-team-id");
  await page.waitForURL("**/workspace/sena", { timeout: defaultTimeout });
  return { email, teamId };
}

async function csrfToken(page) {
  const response = await fetchJson(page, "/api/auth/csrf");
  if (response.status !== 200 || response.body?.schemaVersion !== "sena-enterprise-csrf-token/v1" || !response.body?.token) {
    throw new Error(`CSRF token request failed: ${JSON.stringify(response)}.`);
  }
  return response.body.token;
}

async function createLessonStudyProject(page, csrf) {
  const result = await page.evaluate(async ({ csrfToken }) => {
    const assetResponse = await fetch("/sena-pilot/sample/lesson-study-sena-contract.json", {
      credentials: "include"
    });
    const contractText = await assetResponse.text();
    const form = new FormData();
    form.set("action", "create-project");
    form.set("title", "Validation Claim Smoke Project");
    form.set("includeRuntimeBundle", "true");
    form.append("files", new File([contractText], "lesson-study-sena-contract.json", {
      type: "application/json"
    }));
    const response = await fetch("/api/sena/import", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-sena-csrf-token": csrfToken
      },
      body: form
    });
    return {
      status: response.status,
      headers: Object.fromEntries(Array.from(response.headers.entries())),
      body: await response.json().catch(async () => ({ parseError: await response.text() }))
    };
  }, { csrfToken: csrf });

  if (result.status !== 201 || result.body?.schemaVersion !== "sena-enterprise-import/v1") {
    throw new Error(`Lesson-study project import failed: ${JSON.stringify(result)}.`);
  }
  const projectId = requireHeader(result.headers, "x-sena-project-id");
  if (result.body?.persistedProject?.id !== projectId) {
    throw new Error(`Validation project header/body mismatch: ${projectId} vs ${result.body?.persistedProject?.id}.`);
  }
  const currentVersion = result.body?.persistedProject?.currentVersion;
  if (!Number.isInteger(currentVersion) || currentVersion <= 0) {
    throw new Error(`Validation project import did not return a positive current version: ${JSON.stringify(result.body?.persistedProject)}.`);
  }
  return { projectId, currentVersion };
}

async function refreshReviewedProject(page, csrf, project) {
  const reviewedAt = "2026-08-26T00:00:00.000Z";
  const refreshed = await fetchJson(page, "/api/sena/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      projectId: project.projectId,
      persist: true,
      updateProject: true,
      expectedVersion: project.currentVersion,
      includeRuntimeBundle: true,
      humanReview: {
        status: "human-reviewed",
        reviewer: "Validation claim smoke domain reviewer",
        reviewedAt,
        interpretation: "The synthetic lesson-study fixture supports validation workflow verification.",
        limitations: "Synthetic fixture evidence cannot support empirical or causal claims.",
        nextActions: "Retain limited-claim guardrails and verify every project-bound evidence record."
      },
      codingReliability: {
        status: "documented",
        reviewer: "Validation claim smoke reliability reviewer",
        reviewedAt,
        codingScheme: "Synthetic lesson-study validation smoke coding fixture v1",
        unitOfCoding: "utterance-code binary cell",
        coderCount: 2,
        agreementMetric: "Mean pairwise Cohen kappa and Krippendorff alpha nominal",
        agreementValue: "Verified separately by the project-bound approved reliability run.",
        adjudicationNotes: "The smoke uses deterministic consensus coding with no unresolved disagreements.",
        limitations: "Synthetic fixture only; not human-subjects research evidence."
      },
      dataGovernance: {
        irbApprovalId: "SYNTHETIC-VALIDATION-SMOKE-NOT-HUMAN-SUBJECTS",
        consentScope: "Synthetic browser-smoke fixture; no participant data.",
        retentionPolicy: "Retain only generated smoke artifacts for automated verification.",
        usageConstraints: ["Automated verification only", "Do not use for research claims"],
        dataSteward: "SENA validation claim smoke verifier",
        reviewedAt
      }
    })
  });
  if (refreshed.status !== 200 || refreshed.body?.schemaVersion !== "sena-analysis-run/v1") {
    throw new Error(`Validation project review refresh failed: ${JSON.stringify(refreshed)}.`);
  }
  const persistedProject = refreshed.body?.persistedProject;
  const currentVersion = persistedProject?.currentVersion;
  const claimGate = persistedProject?.snapshot?.report?.claimReadinessGate;
  const codingReliabilityGate = persistedProject?.snapshot?.report?.codingReliabilityGate;
  if (
    persistedProject?.id !== project.projectId ||
    currentVersion !== project.currentVersion + 1 ||
    persistedProject?.snapshot?.report?.humanReview?.status !== "human-reviewed" ||
    persistedProject?.snapshot?.report?.dataGovernance?.status !== "complete" ||
    codingReliabilityGate?.review?.status !== "documented" ||
    codingReliabilityGate?.machineClaimEligibility?.eligible !== false ||
    !codingReliabilityGate?.machineClaimEligibility?.blockers?.includes("current-v2-reliability-dashboard-required") ||
    claimGate?.status !== "exploratory" ||
    claimGate?.claimUse !== "exploratory-only" ||
    persistedProject?.claimUse !== "exploratory-only"
  ) {
    throw new Error(
      `Validation project refresh did not persist the reviewed revision with client machine evidence excluded: ${JSON.stringify({
        id: persistedProject?.id,
        currentVersion,
        claimUse: persistedProject?.claimUse,
        humanReviewStatus: persistedProject?.snapshot?.report?.humanReview?.status,
        dataGovernanceStatus: persistedProject?.snapshot?.report?.dataGovernance?.status,
        codingReliabilityStatus: codingReliabilityGate?.review?.status,
        machineEligibility: codingReliabilityGate?.machineClaimEligibility
      })}.`
    );
  }
  requireHeader(refreshed.headers, "x-sena-analysis-run-id");
  requireHeader(refreshed.headers, "x-sena-project-id", project.projectId);
  requireHeader(refreshed.headers, "x-sena-project-version", String(currentVersion));
  return { projectId: project.projectId, currentVersion };
}

function perfectReliabilityAnnotations() {
  return [
    { coder_id: "coder-a", item_id: "u1", code_id: "Question", value: "1" },
    { coder_id: "coder-b", item_id: "u1", code_id: "Question", value: "1" },
    { coder_id: "coder-a", item_id: "u2", code_id: "Evidence", value: "1" },
    { coder_id: "coder-b", item_id: "u2", code_id: "Evidence", value: "1" },
    { coder_id: "coder-a", item_id: "u3", code_id: "Explanation", value: "1" },
    { coder_id: "coder-b", item_id: "u3", code_id: "Explanation", value: "1" },
    { coder_id: "coder-a", item_id: "u4", code_id: "Reflection", value: "1" },
    { coder_id: "coder-b", item_id: "u4", code_id: "Reflection", value: "1" }
  ];
}

async function createApprovedReliabilityRun(page, csrf, teamId, projectId) {
  const created = await fetchJson(page, "/api/sena/reliability", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      schemaVersion: "sena-reliability-json-request/v1",
      teamId,
      projectId,
      reviewer: "Validation claim reliability reviewer",
      sourceName: "validation-claim-reliability.json",
      annotations: perfectReliabilityAnnotations()
    })
  });
  if (created.status !== 200 || created.body?.schemaVersion !== "sena-reliability-response/v1") {
    throw new Error(`Validation claim reliability run failed: ${JSON.stringify(created)}.`);
  }
  const runId = requireHeader(created.headers, "x-sena-reliability-run-id");
  requireHeader(created.headers, "x-sena-unresolved-disagreements", "0");
  const approved = await fetchJson(page, "/api/sena/reliability", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      runId,
      status: "approved",
      notes: "Approved reliability evidence before validation claim review."
    })
  });
  if (approved.status !== 200 || approved.body?.schemaVersion !== "sena-reliability-run-review/v1") {
    throw new Error(`Validation claim reliability approval failed: ${JSON.stringify(approved)}.`);
  }
  requireHeader(approved.headers, "x-sena-reliability-status", "approved");
  return runId;
}

async function createValidationSuite(page, csrf, projectId) {
  const created = await fetchJson(page, "/api/sena/validation/group-comparison", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      projectId,
      suite: true,
      comparisons: [
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" },
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "alignment" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05,
      preregistrationNote: "Validation claim smoke preregistration note for the Holm suite.",
      methodNote: "Holm-corrected multi-metric validation suite for claim-readiness smoke.",
      parityEvidence: {
        walkthroughDatasetLabel: "lesson-study sample walkthrough",
        walkthroughDatasetHash: "validation-claim-smoke-walkthrough-sha256",
        expertReviewRequired: true,
        studySpecificInferenceReference: "prereg:validation-claim-smoke-holm-model-v1",
        runtimeParityIds: ["jena-rena-sample-parity", "jsna-r-sna-social-parity"]
      }
    })
  });
  if (created.status !== 200 || created.body?.schemaVersion !== "sena-group-comparison-suite/v2") {
    throw new Error(`Validation suite failed: ${JSON.stringify(created)}.`);
  }
  if (created.body?.comparisonCount !== 3 || created.body?.correction !== "holm") {
    throw new Error(`Validation suite did not run Holm-corrected comparisons: ${JSON.stringify(created.body)}.`);
  }
  const runId = requireHeader(created.headers, "x-sena-validation-run-id");
  requireHeader(created.headers, "x-sena-project-id", projectId);
  requireHeader(created.headers, "x-sena-validation-status", "pending-review");
  requireHeader(created.headers, "x-sena-validation-preregistration-sha256");
  requireHeader(created.headers, "x-sena-validation-parity-status", "ready-for-review");
  requireHeader(created.headers, "x-sena-formal-inference-status", "model-referenced");

  const approved = await fetchJson(page, "/api/sena/validation/group-comparison", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      runId,
      status: "approved",
      notes: "Approved Holm-corrected validation suite for limited claim use."
    })
  });
  if (approved.status !== 200 || approved.body?.schemaVersion !== "sena-validation-run-review/v1") {
    throw new Error(`Validation suite approval failed: ${JSON.stringify(approved)}.`);
  }
  requireHeader(approved.headers, "x-sena-validation-status", "approved");
  return runId;
}

async function createApprovedExpertReview(page, csrf, projectId, validationRunId) {
  const created = await fetchJson(page, "/api/sena/validation/expert-review", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      projectId,
      target: {
        kind: "validation-run",
        id: validationRunId,
        label: "Holm-corrected validation suite"
      },
      reviewerName: "Dr. Validation Expert",
      reviewerRole: "Lesson-study methodologist",
      expertiseArea: "Teacher collaboration and discourse analysis",
      status: "changes-requested",
      claimScope: "exploratory-only",
      ratings: {
        dataAdequacy: 4,
        methodFit: 4,
        interpretationValidity: 3
      },
      concerns: "Tighten claim wording before marking claim-ready."
    })
  });
  if (created.status !== 200 || created.body?.schemaVersion !== "sena-expert-review-response/v1") {
    throw new Error(`Expert review creation failed: ${JSON.stringify(created)}.`);
  }
  const reviewId = requireHeader(created.headers, "x-sena-expert-review-id");
  requireHeader(created.headers, "x-sena-expert-review-target-id", validationRunId);
  requireHeader(created.headers, "x-sena-expert-review-claim-scope", "exploratory-only");

  const approved = await fetchJson(page, "/api/sena/validation/expert-review", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      reviewId,
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: {
        interpretationValidity: 5
      },
      recommendations: "Approved for limited claim use with explicit method and sample caveats."
    })
  });
  if (approved.status !== 200 || approved.body?.schemaVersion !== "sena-expert-review-response/v1") {
    throw new Error(`Expert review approval failed: ${JSON.stringify(approved)}.`);
  }
  requireHeader(approved.headers, "x-sena-expert-review-status", "approved");
  requireHeader(approved.headers, "x-sena-expert-review-claim-scope", "claim-ready-with-limits");
  return reviewId;
}

async function verifyPersistedClaimEvidencePackage(
  page,
  projectId,
  projectVersion,
  reliabilityRunId,
  validationRunId,
  expertReviewId
) {
  const claim = await fetchJson(page, `/api/sena/validation/claim-package?projectId=${encodeURIComponent(projectId)}`);
  if (claim.status !== 200 || claim.body?.schemaVersion !== "sena-enterprise-claim-evidence-package/v2") {
    throw new Error(`Claim package request failed: ${JSON.stringify(claim)}.`);
  }
  requireHeader(claim.headers, "x-sena-claim-package-status", "exploratory-only");
  requireHeader(claim.headers, "x-sena-project-id", projectId);
  requireHeader(claim.headers, "x-sena-project-version", String(projectVersion));
  const persistedBlockers = claim.body?.blockers;
  if (
    claim.body?.status !== "exploratory-only" ||
    claim.body?.project?.claimUse !== "exploratory-only" ||
    claim.body?.summary?.blockers !== 1 ||
    !Array.isArray(persistedBlockers) ||
    persistedBlockers.length !== 1 ||
    persistedBlockers[0] !== "project-claim-readiness-required" ||
    claim.body?.claimReadinessEvidence?.kind !== "persisted-project-snapshot" ||
    claim.body?.claimReadinessEvidence?.claimUse !== "exploratory-only" ||
    claim.body?.claimReadinessEvidence?.reliabilityRunId !== null ||
    claim.body?.sourceSnapshotEvidence?.projectVersion !== projectVersion ||
    claim.body?.sourceSnapshotEvidence?.snapshotSha256 !== claim.body?.sourceSnapshotEvidence?.persistedSnapshotSha256
  ) {
    throw new Error(`Persisted claim package did not preserve the non-derived exploratory boundary: ${JSON.stringify({
      status: claim.body?.status,
      project: claim.body?.project,
      summary: claim.body?.summary,
      blockers: persistedBlockers,
      claimReadinessEvidence: claim.body?.claimReadinessEvidence,
      sourceSnapshotEvidence: claim.body?.sourceSnapshotEvidence
    })}`);
  }
  if (claim.body?.evidence?.reliability?.runId !== reliabilityRunId) {
    throw new Error(`Claim package missing approved reliability evidence ${reliabilityRunId}.`);
  }
  if (claim.body?.evidence?.validation?.runId !== validationRunId) {
    throw new Error(`Claim package missing ${validationEvidencePath} run ${validationRunId}.`);
  }
  if (claim.body?.evidence?.validation?.suiteCorrection !== "holm") {
    throw new Error(`Claim package validation evidence is missing Holm correction: ${JSON.stringify(claim.body?.evidence?.validation)}.`);
  }
  if (claim.body?.evidence?.expertReview?.reviewId !== expertReviewId ||
    claim.body?.evidence?.expertReview?.claimScope !== "claim-ready-with-limits") {
    throw new Error(`Claim package missing ${expertReviewEvidencePath} review ${expertReviewId}.`);
  }
  const artifactIds = claim.body?.artifacts?.map((artifact) => artifact.id) ?? [];
  for (const expectedArtifact of [
    "reliability-dashboard",
    "validation-preregistration-plan",
    "validation-parity-evidence",
    "formal-inference-readiness",
    "domain-expert-review"
  ]) {
    if (!artifactIds.includes(expectedArtifact)) {
      throw new Error(`Claim package artifacts missing ${expectedArtifact}: ${JSON.stringify(claim.body?.artifacts)}.`);
    }
  }
}

export async function verifySenaValidationClaimBrowserSmoke(baseUrl = validationSmokeOriginFromCli()) {
  const origin = new URL(baseUrl).origin;
  const unique = randomUUID().slice(0, 8);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const reviewer = await registerValidationReviewer(page, origin, unique);
    const csrf = await csrfToken(page);
    const importedProject = await createLessonStudyProject(page, csrf);
    const project = await refreshReviewedProject(page, csrf, importedProject);
    const reliabilityRunId = await createApprovedReliabilityRun(page, csrf, reviewer.teamId, project.projectId);
    const validationRunId = await createValidationSuite(page, csrf, project.projectId);
    const expertReviewId = await createApprovedExpertReview(page, csrf, project.projectId, validationRunId);
    await verifyPersistedClaimEvidencePackage(
      page,
      project.projectId,
      project.currentVersion,
      reliabilityRunId,
      validationRunId,
      expertReviewId
    );
    console.log(
      `Validation claim browser smoke passed for project-bound approved evidence with a non-derived exploratory read on project ${project.projectId}.`
    );
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaValidationClaimBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
