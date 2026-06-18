import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const defaultTimeout = 15000;

function authSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_AUTH_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
}

function header(response, name) {
  return response.headers()[name.toLowerCase()] ?? "";
}

function requireHeader(response, name, expected) {
  const actual = header(response, name);
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

async function fetchSessionEvidence(page) {
  return await page.evaluate(async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      headers: {
        flow: response.headers.get("x-sena-auth-flow"),
        userId: response.headers.get("x-sena-auth-user-id"),
        sessionId: response.headers.get("x-sena-auth-session-id"),
        teamId: response.headers.get("x-sena-auth-team-id"),
        role: response.headers.get("x-sena-auth-membership-role")
      },
      body
    };
  });
}

function assertSessionEvidence(evidence, expectedEmail, label) {
  if (evidence.status !== 200) {
    throw new Error(`${label} /api/auth/me returned HTTP ${evidence.status}.`);
  }
  if (evidence.body?.user?.email !== expectedEmail) {
    throw new Error(`${label} session email mismatch: expected ${expectedEmail}, received ${evidence.body?.user?.email ?? "<missing>"}.`);
  }
  for (const [key, value] of Object.entries(evidence.headers)) {
    if (!value) throw new Error(`${label} missing /api/auth/me header ${key}.`);
  }
  if (evidence.headers.flow !== "session-read") {
    throw new Error(`${label} expected x-sena-auth-flow=session-read from /api/auth/me, received ${evidence.headers.flow}.`);
  }
}

export async function verifySenaAuthBrowserSmoke(baseUrl = authSmokeOriginFromCli()) {
  const origin = new URL(baseUrl).origin;
  const unique = randomUUID().slice(0, 8);
  const email = `auth-smoke-${unique}@example.edu`;
  const password = "sena-secure-123";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
    await fillByTestId(page, "register-full-name", "SENA Auth Smoke");
    await fillByTestId(page, "register-email", email);
    await fillByTestId(page, "register-organization", "SENA Auth Smoke Lab");
    await fillByTestId(page, "register-password", password);
    await fillByTestId(page, "register-confirm-password", password);
    await checkByTestId(page, "register-terms");
    const registerResponse = await submitAndWaitForResponse(page, "register-submit", "/api/auth/register");
    requireHeader(registerResponse, "x-sena-auth-flow", "password-register");
    requireHeader(registerResponse, "x-sena-auth-session-id");
    requireHeader(registerResponse, "x-sena-auth-team-id");
    await page.waitForURL("**/workspace/sena", { timeout: defaultTimeout });
    assertSessionEvidence(await fetchSessionEvidence(page), email, "registered browser session");

    await context.clearCookies();
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
    await fillByTestId(page, "login-email", email);
    await fillByTestId(page, "login-password", password);
    await checkByTestId(page, "login-remember-session");
    const loginResponse = await submitAndWaitForResponse(page, "login-submit", "/api/auth/login");
    requireHeader(loginResponse, "x-sena-auth-flow", "password-login");
    requireHeader(loginResponse, "x-sena-auth-session-profile", "remembered");
    requireHeader(loginResponse, "x-sena-auth-session-id");
    requireHeader(loginResponse, "x-sena-auth-team-id");
    await page.waitForURL("**/workspace/sena", { timeout: defaultTimeout });
    assertSessionEvidence(await fetchSessionEvidence(page), email, "login browser session");

    console.log(`Auth browser smoke passed for ${origin}/register and ${origin}/login.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaAuthBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
