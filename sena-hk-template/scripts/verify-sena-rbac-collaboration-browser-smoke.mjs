import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const defaultTimeout = 15000;
const password = "sena-secure-123";

function rbacSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_RBAC_COLLABORATION_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
}

function header(response, name) {
  return response.headers()[name.toLowerCase()] ?? "";
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

async function registerOwnerThroughUi(page, origin, unique) {
  const email = `rbac-owner-${unique}@example.edu`;
  await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
  await fillByTestId(page, "register-full-name", "SENA RBAC Owner");
  await fillByTestId(page, "register-email", email);
  await fillByTestId(page, "register-organization", "SENA RBAC Collaboration Lab");
  await fillByTestId(page, "register-password", password);
  await fillByTestId(page, "register-confirm-password", password);
  await checkByTestId(page, "register-terms");
  const registerResponse = await submitAndWaitForResponse(page, "register-submit", "/api/auth/register");
  requireHeader(registerResponse, "x-sena-auth-flow", "password-register");
  requireHeader(registerResponse, "x-sena-auth-membership-role", "owner");
  const teamId = requireHeader(registerResponse, "x-sena-auth-team-id");
  await page.waitForURL("**/workspace/sena", { timeout: defaultTimeout });
  return { email, teamId };
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

async function csrfToken(page) {
  const response = await fetchJson(page, "/api/auth/csrf");
  if (response.status !== 200 || response.body?.schemaVersion !== "sena-enterprise-csrf-token/v1" || !response.body?.token) {
    throw new Error(`CSRF token request failed: ${JSON.stringify(response)}.`);
  }
  return response.body.token;
}

async function createProjectFromTranscript(page, csrf) {
  const result = await page.evaluate(async ({ csrfToken }) => {
    const transcript = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "Owner: We need a sharper #Question.",
      "",
      "2",
      "00:00:04,000 --> 00:00:06,000",
      "Reviewer: The transcript gives #Evidence for the #Claim.",
      "",
      "3",
      "00:00:07,000 --> 00:00:09,000",
      "Owner: Add an {{Explanation}} and mark #Reflection."
    ].join("\n");
    const form = new FormData();
    form.set("action", "create-project");
    form.set("title", "RBAC Collaboration Smoke Project");
    form.set("includeRuntimeBundle", "true");
    form.append("files", new File([transcript], "rbac-collaboration-smoke.srt", {
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
    throw new Error(`Project import/create failed: ${JSON.stringify(result)}.`);
  }
  const projectId = requireHeader(result.headers, "x-sena-project-id");
  requireHeader(result.headers, "x-sena-import-run-id");
  requireHeader(result.headers, "x-sena-analysis-run-id");
  if (result.body?.persistedProject?.id !== projectId) {
    throw new Error(`Created project header/body mismatch: ${projectId} vs ${result.body?.persistedProject?.id}.`);
  }
  return projectId;
}

async function inviteReviewer(page, csrf, teamId, reviewerEmail) {
  const result = await fetchJson(page, "/api/sena/team/invitations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      teamId,
      email: reviewerEmail,
      role: "reviewer"
    })
  });
  if (result.status !== 201 || result.body?.schemaVersion !== "sena-team-invitation/v1") {
    throw new Error(`Reviewer invitation failed: ${JSON.stringify(result)}.`);
  }
  requireHeader(result.headers, "x-sena-invitation-id");
  requireHeader(result.headers, "x-sena-invitation-status", "pending");
  requireHeader(result.headers, "x-sena-invitation-role", "reviewer");
  if (!result.body?.invitation?.inviteCode) {
    throw new Error(`Reviewer invitation is missing inviteCode: ${JSON.stringify(result.body)}.`);
  }
  return result.body.invitation.inviteCode;
}

async function registerReviewerWithInvite(page, origin, input) {
  await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
  const result = await fetchJson(page, "/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: "SENA Invited Reviewer",
      email: input.email,
      password,
      organization: "External Reviewer Lab",
      plan: "individual"
    })
  });
  if (result.status !== 201) {
    throw new Error(`Reviewer registration failed: ${JSON.stringify(result)}.`);
  }
  requireHeader(result.headers, "x-sena-auth-flow", "password-register");
  const reviewerCsrf = await csrfToken(page);
  const accepted = await fetchJson(page, "/api/sena/team/invitations", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": reviewerCsrf
    },
    body: JSON.stringify({
      inviteCode: input.inviteCode
    })
  });
  if (accepted.status !== 200 || accepted.body?.schemaVersion !== "sena-team-invitation-acceptance/v1") {
    throw new Error(`Reviewer invite acceptance failed: ${JSON.stringify(accepted)}.`);
  }
  requireHeader(accepted.headers, "x-sena-team-id", input.teamId);
  requireHeader(accepted.headers, "x-sena-invitation-status", "accepted");
  requireHeader(accepted.headers, "x-sena-membership-role", "reviewer");
  requireHeader(accepted.headers, "x-sena-membership-status", "active");
}

async function registerOutsider(page, origin, unique) {
  await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
  const result = await fetchJson(page, "/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: "SENA RBAC Outsider",
      email: `rbac-outsider-${unique}@example.edu`,
      password,
      organization: "Outside Collaboration Lab",
      plan: "lab"
    })
  });
  if (result.status !== 201) {
    throw new Error(`Outsider registration failed: ${JSON.stringify(result)}.`);
  }
}

async function verifyOutsiderDenied(page, projectId) {
  const result = await fetchJson(page, `/api/sena/projects/${projectId}`);
  if (result.status !== 403 || result.body?.code !== "permission_denied") {
    throw new Error(`Outsider project read should be forbidden, received ${JSON.stringify(result)}.`);
  }
}

async function reviewerCollaborates(page, csrf, projectId) {
  const projectRead = await fetchJson(page, `/api/sena/projects/${projectId}`);
  if (projectRead.status !== 200 || projectRead.body?.schemaVersion !== "sena-project/v1") {
    throw new Error(`Reviewer could not read team project: ${JSON.stringify(projectRead)}.`);
  }
  requireHeader(projectRead.headers, "x-sena-project-id", projectId);

  const presence = await fetchJson(page, `/api/sena/projects/${projectId}/collaboration`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      action: "presence",
      activeView: "Fusion Canvas",
      cursorLabel: "Reviewer reading edge evidence"
    })
  });
  if (presence.status !== 200 || presence.body?.schemaVersion !== "sena-project-presence/v1") {
    throw new Error(`Reviewer presence failed: ${JSON.stringify(presence)}.`);
  }

  const comment = await fetchJson(page, `/api/sena/projects/${projectId}/collaboration`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      action: "comment",
      body: "Reviewer requests an evidence citation before publication export.",
      target: {
        kind: "edge",
        label: "Question-Evidence"
      }
    })
  });
  if (comment.status !== 201 || comment.body?.schemaVersion !== "sena-project-comment/v1" || !comment.body?.comment?.id) {
    throw new Error(`Reviewer comment failed: ${JSON.stringify(comment)}.`);
  }

  const collaborationStreamPath = `/api/sena/projects/${projectId}/collaboration/stream`;
  const stream = await page.evaluate(async ({ path }) => {
    const controller = new AbortController();
    const response = await fetch(path, {
      credentials: "include",
      signal: controller.signal
    });
    const reader = response.body?.getReader();
    const firstChunk = await reader?.read();
    await reader?.cancel().catch(() => {});
    controller.abort();
    return {
      status: response.status,
      headers: Object.fromEntries(Array.from(response.headers.entries())),
      text: new TextDecoder().decode(firstChunk?.value ?? new Uint8Array())
    };
  }, { path: collaborationStreamPath });
  if (stream.status !== 200) {
    throw new Error(`Reviewer collaboration stream failed: ${JSON.stringify(stream)}.`);
  }
  requireHeader(stream.headers, "x-sena-collaboration-stream-auth", "session-rbac-project-read");
  if (!stream.text.includes("event: collaboration") || !stream.text.includes("sena-project-collaboration-stream/v1")) {
    throw new Error(`Reviewer collaboration stream did not emit collaboration state: ${JSON.stringify(stream)}.`);
  }

  return comment.body.comment.id;
}

async function ownerResolvesReviewerComment(page, csrf, projectId, commentId) {
  const collaboration = await fetchJson(page, `/api/sena/projects/${projectId}/collaboration`);
  if (collaboration.status !== 200 || collaboration.body?.schemaVersion !== "sena-project-collaboration/v1") {
    throw new Error(`Owner collaboration read failed: ${JSON.stringify(collaboration)}.`);
  }
  if (!collaboration.body?.comments?.some((comment) => comment.id === commentId && comment.body.includes("evidence citation"))) {
    throw new Error(`Owner collaboration state is missing reviewer comment ${commentId}.`);
  }
  if (!collaboration.body?.presence?.some((presence) => presence.activeView === "Fusion Canvas")) {
    throw new Error("Owner collaboration state is missing reviewer presence.");
  }

  const resolved = await fetchJson(page, `/api/sena/projects/${projectId}/collaboration`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-csrf-token": csrf
    },
    body: JSON.stringify({
      action: "resolve-comment",
      commentId
    })
  });
  if (
    resolved.status !== 200 ||
    resolved.body?.schemaVersion !== "sena-project-comment/v1" ||
    resolved.body?.comment?.status !== "resolved" ||
    !resolved.body?.comment?.updatedAt
  ) {
    throw new Error(`Owner resolve-comment failed: ${JSON.stringify(resolved)}.`);
  }
}

export async function verifySenaRbacCollaborationBrowserSmoke(baseUrl = rbacSmokeOriginFromCli()) {
  const origin = new URL(baseUrl).origin;
  const unique = randomUUID().slice(0, 8);
  const browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  const outsiderContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const reviewerPage = await reviewerContext.newPage();
  const outsiderPage = await outsiderContext.newPage();

  try {
    const owner = await registerOwnerThroughUi(ownerPage, origin, unique);
    const ownerCsrf = await csrfToken(ownerPage);
    const projectId = await createProjectFromTranscript(ownerPage, ownerCsrf);
    const reviewerEmail = `rbac-reviewer-${unique}@example.edu`;
    const inviteCode = await inviteReviewer(ownerPage, ownerCsrf, owner.teamId, reviewerEmail);

    await registerReviewerWithInvite(reviewerPage, origin, {
      email: reviewerEmail,
      inviteCode,
      teamId: owner.teamId
    });
    const reviewerCsrf = await csrfToken(reviewerPage);
    await registerOutsider(outsiderPage, origin, unique);
    await verifyOutsiderDenied(outsiderPage, projectId);

    const commentId = await reviewerCollaborates(reviewerPage, reviewerCsrf, projectId);
    await ownerResolvesReviewerComment(ownerPage, ownerCsrf, projectId, commentId);

    console.log(`RBAC collaboration browser smoke passed for owner/reviewer team project ${projectId} on ${origin}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaRbacCollaborationBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
