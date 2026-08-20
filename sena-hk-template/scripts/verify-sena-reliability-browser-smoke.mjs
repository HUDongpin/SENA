import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const defaultTimeout = 30000;
const password = "sena-secure-123";
const reliabilityEvidencePath = "evidence.reliability";

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
  await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
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
  return projectId;
}

function reliabilityAnnotations() {
  return [
    { coder_id: "coder-a", item_id: "u1", code_id: "Question", value: "1" },
    { coder_id: "coder-b", item_id: "u1", code_id: "Question", value: "1" },
    { coder_id: "coder-a", item_id: "u1", code_id: "Evidence", value: "0" },
    { coder_id: "coder-b", item_id: "u1", code_id: "Evidence", value: "0" },
    { coder_id: "coder-a", item_id: "u2", code_id: "Evidence", value: "1" },
    { coder_id: "coder-b", item_id: "u2", code_id: "Evidence", value: "0" },
    { coder_id: "coder-a", item_id: "u2", code_id: "Claim", value: "1" },
    { coder_id: "coder-b", item_id: "u2", code_id: "Claim", value: "1" },
    { coder_id: "coder-a", item_id: "u3", code_id: "Explanation", value: "1" },
    { coder_id: "coder-b", item_id: "u3", code_id: "Explanation", value: "0" },
    { coder_id: "coder-a", item_id: "u3", code_id: "Reflection", value: "1" },
    { coder_id: "coder-b", item_id: "u3", code_id: "Reflection", value: "1" }
  ];
}

async function createReliabilityRun(page, csrf, teamId, projectId) {
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
      annotations: reliabilityAnnotations()
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
  if ((result.body?.dashboard?.disagreementCount ?? 0) <= 0) {
    throw new Error(`Reliability smoke should create adjudication disagreements: ${JSON.stringify(result.body?.dashboard)}.`);
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
  if (claim.status !== 200 || claim.body?.schemaVersion !== "sena-enterprise-claim-evidence-package/v1") {
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

export async function verifySenaReliabilityBrowserSmoke(baseUrl = reliabilitySmokeOriginFromCli()) {
  const origin = new URL(baseUrl).origin;
  const unique = randomUUID().slice(0, 8);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const reviewer = await registerReliabilityReviewer(page, origin, unique);
    const csrf = await csrfToken(page);
    const projectId = await createReliabilityProject(page, csrf);
    const runId = await createReliabilityRun(page, csrf, reviewer.teamId, projectId);
    await adjudicateReliabilityRun(page, csrf, runId);
    await approveReliabilityRun(page, csrf, runId);
    await verifyReliabilityPersistence(page, projectId, runId);
    await verifyClaimPackageReliabilityEvidence(page, projectId, runId);
    console.log(`Reliability browser smoke passed for approved multi-coder run ${runId} on project ${projectId}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaReliabilityBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
