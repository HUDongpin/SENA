import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const defaultTimeout = 15000;
const ssoProviders = ["institution", "orcid", "google"];

function ssoSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_SSO_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
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

function assertProviderStatus(body) {
  if (body?.schemaVersion !== "sena-sso-provider-status/v1") {
    throw new Error(`SSO status returned unexpected schema: ${JSON.stringify(body)}.`);
  }
  for (const provider of ssoProviders) {
    const status = body.providers?.find((candidate) => candidate.provider === provider);
    if (!status) throw new Error(`SSO status missing provider ${provider}.`);
    if (!["oauth-oidc", "local-pilot-fallback"].includes(status.mode)) {
      throw new Error(`SSO provider ${provider} has unexpected mode ${status.mode}.`);
    }
    if (status.fallbackPolicy?.schemaVersion !== "sena-enterprise-sso-fallback-policy/v1") {
      throw new Error(`SSO provider ${provider} missing fallback policy evidence.`);
    }
  }
}

function assertIdentityProductionGate(body) {
  const gate = body.identityProductionGate;
  if (gate?.schemaVersion !== "sena-enterprise-identity-production-gate-summary/v1") {
    throw new Error(`SSO status missing identityProductionGate summary: ${JSON.stringify(gate)}.`);
  }
  if (!["review", "ready"].includes(gate.status)) {
    throw new Error(`identityProductionGate returned unexpected status ${gate.status}.`);
  }
  if (!Array.isArray(gate.missingEvidenceIds)) {
    throw new Error(`identityProductionGate missing evidence id manifest: ${JSON.stringify(gate)}.`);
  }
  if (gate.institutionActionPlan?.summary?.submissionPath !== "/api/sena/ops/platform-decisions") {
    throw new Error(`identityProductionGate missing platform-decision submission path: ${JSON.stringify(gate.institutionActionPlan)}.`);
  }
  if (!/^[a-f0-9]{64}$/.test(gate.institutionActionPlan?.digest ?? "")) {
    throw new Error(`identityProductionGate missing action-plan digest: ${JSON.stringify(gate.institutionActionPlan)}.`);
  }
  if (gate.redaction?.secretValuesExcluded !== true ||
      gate.redaction?.evidenceUrlValuesExcluded !== true ||
      gate.redaction?.ownerNamesExcluded !== true) {
    throw new Error(`identityProductionGate redaction flags are incomplete: ${JSON.stringify(gate.redaction)}.`);
  }
  const serialized = JSON.stringify(gate);
  for (const forbidden of ["client_secret", "SENA_SSO", "https://<institution-evidence-host>"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`identityProductionGate leaked forbidden token ${forbidden}.`);
    }
  }
}

function assertSsoPreflight(body) {
  assertProviderStatus(body);
  assertIdentityProductionGate(body);
  if (body.preflight?.schemaVersion !== "sena-enterprise-sso-preflight/v1") {
    throw new Error(`SSO preflight returned unexpected schema: ${JSON.stringify(body.preflight)}.`);
  }
  if (body.preflight?.summary?.checked !== ssoProviders.length) {
    throw new Error(`SSO preflight should check ${ssoProviders.length} providers: ${JSON.stringify(body.preflight?.summary)}.`);
  }
  for (const provider of ssoProviders) {
    const preflight = body.preflight?.providers?.find((candidate) => candidate.provider === provider);
    if (!preflight) throw new Error(`SSO preflight missing provider ${provider}.`);
    if (!preflight.checks?.some((check) => check.id === "sso-provider-config")) {
      throw new Error(`SSO preflight provider ${provider} is missing config check.`);
    }
  }
}

async function assertSessionEvidence(page, provider, expectedEmail) {
  const session = await fetchJson(page, "/api/auth/me");
  if (session.status !== 200) {
    throw new Error(`${provider} /api/auth/me returned HTTP ${session.status}: ${JSON.stringify(session.body)}.`);
  }
  if (session.body?.user?.email !== expectedEmail) {
    throw new Error(`${provider} SSO session email mismatch: expected ${expectedEmail}, received ${session.body?.user?.email ?? "<missing>"}.`);
  }
  requireHeader(session.headers, "x-sena-auth-flow", "session-read");
  requireHeader(session.headers, "x-sena-auth-session-id");
  requireHeader(session.headers, "x-sena-auth-team-id");
}

async function runFallbackSsoSession(page, origin, provider, unique) {
  const email = `sso-${provider}-${unique}@example.edu`;
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
  const response = await fetchJson(page, "/api/auth/sso", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      provider,
      email,
      name: `SENA ${provider.toUpperCase()} SSO Smoke`,
      organization: `SENA ${provider.toUpperCase()} SSO Lab`,
      subject: `sso-smoke-${provider}-${unique}`
    })
  });

  if (response.status !== 200) {
    throw new Error(`${provider} local SSO fallback returned HTTP ${response.status}: ${JSON.stringify(response.body)}.`);
  }
  requireHeader(response.headers, "x-sena-auth-flow", "sso-local-fallback");
  requireHeader(response.headers, "x-sena-auth-provider", provider);
  requireHeader(response.headers, "x-sena-sso-provider", provider);
  requireHeader(response.headers, "x-sena-sso-mode", "local-pilot-fallback");
  requireHeader(response.headers, "x-sena-auth-session-id");
  requireHeader(response.headers, "x-sena-auth-team-id");
  if (response.body?.user?.email !== email) {
    throw new Error(`${provider} local SSO fallback body email mismatch: ${JSON.stringify(response.body?.user)}.`);
  }
  await assertSessionEvidence(page, provider, email);
}

export async function verifySenaSsoBrowserSmoke(baseUrl = ssoSmokeOriginFromCli()) {
  const origin = new URL(baseUrl).origin;
  const unique = randomUUID().slice(0, 8);
  const browser = await chromium.launch({ headless: true });
  const statusContext = await browser.newContext();
  const orcidContext = await browser.newContext();
  const googleContext = await browser.newContext();

  try {
    const statusPage = await statusContext.newPage();
    await statusPage.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
    const status = await fetchJson(statusPage, "/api/auth/sso?status=1&preflight=1");
    if (status.status !== 200) {
      throw new Error(`SSO preflight status failed: ${JSON.stringify(status)}.`);
    }
    requireHeader(status.headers, "x-sena-identity-institution-action-plan-digest");
    assertSsoPreflight(status.body);

    await runFallbackSsoSession(await orcidContext.newPage(), origin, "orcid", unique);
    await runFallbackSsoSession(await googleContext.newPage(), origin, "google", unique);

    console.log(`SSO browser smoke passed for provider preflight plus ORCID/Google local fallback sessions on ${origin}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaSsoBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
