import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { gotoHydratedSenaRegisterPage } from "./sena-auth-browser-hydration.mjs";
import {
  requireExpectedReceiptKeyId,
  requireVerifierControlledLoopbackOrigin,
  requireVerifierControlledServerCustody
} from "./verify-sena-enterprise-api-browser-smoke.mjs";

const defaultTimeout = 30000;
const password = "sena-secure-123";
const reliabilityEvidencePath = "evidence.reliability";
const reliabilityFixtureContract = Object.freeze({
  authoritativeItemCount: 3,
  requiredCodeLabels: Object.freeze(["Question", "Evidence", "Claim", "Explanation", "Reflection"]),
  binaryUnitCount: 15,
  intentionalDisagreementCount: 1,
  minimumMeanPairwiseKappa: 0.8,
  minimumKrippendorffAlphaNominal: 0.8
});

function reliabilitySmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_RELIABILITY_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
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

function numericHeader(responseOrHeaders, name) {
  const value = Number(requireHeader(responseOrHeaders, name));
  if (!Number.isFinite(value)) throw new Error(`Expected numeric ${name}, received ${value}.`);
  return value;
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

async function registerReliabilityReviewer(page, origin, unique) {
  const email = `reliability-smoke-${unique}@example.edu`;
  await gotoHydratedSenaRegisterPage(page, origin, defaultTimeout);
  await fillByTestId(page, "register-full-name", "SENA Reliability Smoke");
  await fillByTestId(page, "register-email", email);
  await fillByTestId(page, "register-organization", "SENA Reliability Lab");
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

async function createReliabilityProject(page, csrf) {
  const result = await page.evaluate(async ({ csrfToken }) => {
    const transcript = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "Coder lead: We need a precise #Question.",
      "",
      "2",
      "00:00:04,000 --> 00:00:06,000",
      "Second coder: This turn contains #Evidence and #Claim.",
      "",
      "3",
      "00:00:07,000 --> 00:00:09,000",
      "Coder lead: We should add an {{Explanation}} and then #Reflection."
    ].join("\n");
    const form = new FormData();
    form.set("action", "create-project");
    form.set("title", "Reliability Adjudication Smoke Project");
    form.set("includeRuntimeBundle", "true");
    form.append("files", new File([transcript], "reliability-adjudication-smoke.srt", {
      type: "application/x-subrip"
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
    throw new Error(`Reliability project import failed: ${JSON.stringify(result)}.`);
  }
  const projectId = requireHeader(result.headers, "x-sena-project-id");
  if (result.body?.persistedProject?.id !== projectId) {
    throw new Error(`Reliability project header/body mismatch: ${projectId} vs ${result.body?.persistedProject?.id}.`);
  }
  const snapshot = result.body?.persistedProject?.snapshot;
  if (!snapshot) {
    throw new Error("Reliability project import did not return the persisted authoritative snapshot.");
  }
  return { projectId, snapshot };
}

function reliabilityAnnotations(snapshot) {
  const dataset = snapshot?.source?.sourceDataset ?? snapshot?.dataset;
  const utteranceIds = Array.isArray(dataset?.utterances)
    ? dataset.utterances.map((utterance) => utterance?.id).filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const codebook = Array.isArray(dataset?.codebook) ? dataset.codebook : [];
  const codeId = (name) => {
    const normalized = name.toLowerCase();
    const code = codebook.find((candidate) => (
      typeof candidate?.id === "string" && candidate.id.toLowerCase() === normalized
    ) || (
      typeof candidate?.label === "string" && candidate.label.toLowerCase() === normalized
    ));
    if (!code?.id) throw new Error(`Reliability project snapshot is missing the required ${name} code.`);
    return code.id;
  };
  if (utteranceIds.length < reliabilityFixtureContract.authoritativeItemCount) {
    throw new Error(
      `Reliability project snapshot must expose at least ${reliabilityFixtureContract.authoritativeItemCount} authoritative utterance IDs.`
    );
  }
  const authoritativeItemIds = utteranceIds.slice(0, reliabilityFixtureContract.authoritativeItemCount);
  const authoritativeCodeIds = reliabilityFixtureContract.requiredCodeLabels.map(codeId);
  const authoritativeUnits = authoritativeItemIds.flatMap((itemId) => (
    authoritativeCodeIds.map((authoritativeCodeId) => ({ itemId, codeId: authoritativeCodeId }))
  ));
  if (authoritativeUnits.length !== reliabilityFixtureContract.binaryUnitCount) {
    throw new Error(
      `Reliability fixture expected ${reliabilityFixtureContract.binaryUnitCount} authoritative binary units, received ${authoritativeUnits.length}.`
    );
  }
  return authoritativeUnits.flatMap((unit, unitIndex) => (
    ["coder-a", "coder-b"].map((coderId, coderIndex) => {
      const canonicalValue = unitIndex % 2 === 0;
      const value = unitIndex === 0 && coderIndex === 1 ? !canonicalValue : canonicalValue;
      return {
        coder_id: coderId,
        item_id: unit.itemId,
        code_id: unit.codeId,
        value: value ? "1" : "0"
      };
    })
  ));
}

async function createReliabilityRun(page, csrf, teamId, projectId, annotations) {
  const result = await fetchJson(page, "/api/sena/reliability", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      schemaVersion: "sena-reliability-json-request/v1",
      teamId,
      projectId,
      reviewer: "Reliability smoke reviewer",
      sourceName: "reliability-smoke-annotations.json",
      annotations
    })
  });
  if (result.status !== 200 || result.body?.schemaVersion !== "sena-reliability-response/v1") {
    throw new Error(`Reliability run failed: ${JSON.stringify(result)}.`);
  }
  if (result.body?.requestSchemaVersion !== "sena-reliability-json-request/v1") {
    throw new Error(`Reliability run did not use JSON request schema: ${JSON.stringify(result.body)}.`);
  }
  if (result.body?.dashboard?.schemaVersion !== "sena-coding-reliability-dashboard/v2") {
    throw new Error(`Reliability dashboard missing expected schema: ${JSON.stringify(result.body?.dashboard)}.`);
  }
  const dashboard = result.body.dashboard;
  if (dashboard.binaryUnitCount !== reliabilityFixtureContract.binaryUnitCount) {
    throw new Error(
      `Reliability smoke expected ${reliabilityFixtureContract.binaryUnitCount} binary units, received ${dashboard.binaryUnitCount}.`
    );
  }
  if (dashboard.disagreementCount !== reliabilityFixtureContract.intentionalDisagreementCount) {
    throw new Error(
      `Reliability smoke expected ${reliabilityFixtureContract.intentionalDisagreementCount} intentional disagreement, received ${dashboard.disagreementCount}.`
    );
  }
  if (dashboard.meanPairwiseKappa < reliabilityFixtureContract.minimumMeanPairwiseKappa) {
    throw new Error(
      `Reliability smoke mean pairwise kappa ${dashboard.meanPairwiseKappa} is below ${reliabilityFixtureContract.minimumMeanPairwiseKappa}.`
    );
  }
  if (dashboard.krippendorffAlphaNominal < reliabilityFixtureContract.minimumKrippendorffAlphaNominal) {
    throw new Error(
      `Reliability smoke Krippendorff alpha ${dashboard.krippendorffAlphaNominal} is below ${reliabilityFixtureContract.minimumKrippendorffAlphaNominal}.`
    );
  }
  const initialEligibilityBlockers = dashboard.claimEligibility?.blockers;
  if (
    dashboard.claimEligibility?.eligible !== false ||
    !Array.isArray(initialEligibilityBlockers) ||
    initialEligibilityBlockers.length !== 1 ||
    initialEligibilityBlockers[0] !== "unresolved-reliability-disagreements"
  ) {
    throw new Error(
      `Reliability smoke must be statistically eligible but blocked by its one unresolved disagreement before adjudication: ${JSON.stringify(dashboard.claimEligibility)}.`
    );
  }
  const runId = requireHeader(result.headers, "x-sena-reliability-run-id");
  requireHeader(result.headers, "x-sena-project-id", projectId);
  requireHeader(result.headers, "x-sena-reliability-status", "pending-adjudication");
  numericHeader(result.headers, "x-sena-mean-pairwise-kappa");
  numericHeader(result.headers, "x-sena-krippendorff-alpha");
  if (numericHeader(result.headers, "x-sena-unresolved-disagreements") <= 0) {
    throw new Error("Reliability run should expose unresolved disagreements before adjudication.");
  }
  return runId;
}

async function adjudicateReliabilityRun(page, csrf, runId) {
  const result = await fetchJson(page, "/api/sena/reliability", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      action: "adjudicate",
      runId,
      decision: "revise",
      notes: "Smoke adjudication records the disagreement history before approval."
    })
  });
  if (result.status !== 201 || result.body?.schemaVersion !== "sena-reliability-adjudication-response/v1") {
    throw new Error(`Reliability adjudication failed: ${JSON.stringify(result)}.`);
  }
  if ((result.body?.adjudication?.summary?.created ?? 0) <= 0) {
    throw new Error(`Reliability adjudication did not create adjudication history: ${JSON.stringify(result.body?.adjudication)}.`);
  }
  requireHeader(result.headers, "x-sena-reliability-run-id", runId);
  requireHeader(result.headers, "x-sena-unresolved-disagreements", "0");
  requireHeader(result.headers, "x-sena-reliability-coverage-rate", "1");
}

async function approveReliabilityRun(page, csrf, runId) {
  const result = await fetchJson(page, "/api/sena/reliability", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      runId,
      status: "approved",
      notes: "Approved after full adjudication coverage in the reliability smoke."
    })
  });
  if (
    result.status !== 200 ||
    result.body?.schemaVersion !== "sena-reliability-run-review/v1" ||
    result.body?.reliabilityRun?.status !== "approved"
  ) {
    throw new Error(`Reliability approval failed: ${JSON.stringify(result)}.`);
  }
  requireHeader(result.headers, "x-sena-reliability-status", "approved");
  requireHeader(result.headers, "x-sena-unresolved-disagreements", "0");
  requireHeader(result.headers, "x-sena-reliability-coverage-rate", "1");
}

async function verifyReliabilityPersistence(page, projectId, runId) {
  const list = await fetchJson(page, `/api/sena/reliability?projectId=${encodeURIComponent(projectId)}`);
  if (list.status !== 200 || list.body?.schemaVersion !== "sena-reliability-run-list/v1") {
    throw new Error(`Reliability run list failed: ${JSON.stringify(list)}.`);
  }
  const listedRun = list.body?.reliabilityRuns?.find((run) => run.id === runId);
  if (!listedRun || listedRun.status !== "approved" || listedRun.adjudicationCoverage?.coverageRate !== 1) {
    throw new Error(`Reliability run list is missing approved run evidence: ${JSON.stringify(list.body?.reliabilityRuns)}.`);
  }

  const collaborationPath = `/api/sena/projects/${projectId}/collaboration`;
  const collaboration = await fetchJson(page, collaborationPath);
  if (collaboration.status !== 200 || collaboration.body?.schemaVersion !== "sena-project-collaboration/v1") {
    throw new Error(`Collaboration adjudication ledger failed: ${JSON.stringify(collaboration)}.`);
  }
  if (!collaboration.body?.adjudications?.some((record) => record.reliabilityRunId === runId)) {
    throw new Error(`Collaboration ledger is missing reliability adjudications for ${runId}.`);
  }
}

async function verifyClaimPackageReliabilityEvidence(page, projectId, runId) {
  const claim = await fetchJson(page, `/api/sena/validation/claim-package?projectId=${encodeURIComponent(projectId)}`);
  if (claim.status !== 200 || claim.body?.schemaVersion !== "sena-enterprise-claim-evidence-package/v2") {
    throw new Error(`Claim package request failed: ${JSON.stringify(claim)}.`);
  }
  requireHeader(claim.headers, "x-sena-project-id", projectId);
  if (claim.body?.evidence?.reliability?.runId !== runId) {
    throw new Error(`Claim package is missing ${reliabilityEvidencePath} run ${runId}: ${JSON.stringify(claim.body?.evidence)}`);
  }
  if (claim.body?.evidence?.reliability?.status !== "approved") {
    throw new Error(`Claim package reliability evidence is not approved: ${JSON.stringify(claim.body?.evidence?.reliability)}.`);
  }
  if (claim.body?.evidence?.reliability?.adjudicationCoverage?.coverageRate !== 1) {
    throw new Error(`Claim package reliability coverage is incomplete: ${JSON.stringify(claim.body?.evidence?.reliability)}.`);
  }
  if (claim.body?.blockers?.includes("approved-reliability-run-required") ||
    claim.body?.blockers?.includes("approved-reliability-adjudication-coverage-required")) {
    throw new Error(`Claim package still reports reliability blockers after approval: ${JSON.stringify(claim.body?.blockers)}.`);
  }
  if (!claim.body?.artifacts?.some((artifact) => artifact.id === "reliability-dashboard" && artifact.sourceId === runId)) {
    throw new Error(`Claim package artifacts are missing reliability-dashboard for ${runId}.`);
  }
}

export async function verifySenaReliabilityBrowserSmoke(baseUrl = reliabilitySmokeOriginFromCli(), options = {}) {
  const expectedReceiptKeyId = requireExpectedReceiptKeyId(options);
  const origin = requireVerifierControlledLoopbackOrigin(baseUrl);
  const provisioningToken = options.provisioningToken ??
    process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_PROVISIONING_TOKEN ??
    process.env.SENA_PROVISIONING_TOKEN ??
    "sena-pilot-provisioning-token";
  requireVerifierControlledServerCustody(options, origin, expectedReceiptKeyId, provisioningToken);
  const unique = randomUUID().slice(0, 8);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const reviewer = await registerReliabilityReviewer(page, origin, unique);
    const csrf = await csrfToken(page);
    const project = await createReliabilityProject(page, csrf);
    const runId = await createReliabilityRun(
      page,
      csrf,
      reviewer.teamId,
      project.projectId,
      reliabilityAnnotations(project.snapshot)
    );
    await adjudicateReliabilityRun(page, csrf, runId);
    await approveReliabilityRun(page, csrf, runId);
    await verifyReliabilityPersistence(page, project.projectId, runId);
    await verifyClaimPackageReliabilityEvidence(page, project.projectId, runId);
    console.log(`Reliability browser smoke passed for approved multi-coder run ${runId} on project ${project.projectId}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaReliabilityBrowserSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : "Reliability browser smoke failed.");
    process.exit(1);
  });
}
