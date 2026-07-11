import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const defaultTimeout = 15000;
const password = "sena-secure-123";
const pageOrigins = new WeakMap();

function rbacSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_RBAC_COLLABORATION_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
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

function rememberPageOrigin(page, origin) {
  pageOrigins.set(page, origin);
}

function pageBaseUrl(page) {
  if (!page.isClosed() && page.url().startsWith("http")) return page.url();
  return pageOrigins.get(page) ?? rbacSmokeOriginFromCli();
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[-!#$%&'*+.^_`|~0-9A-Za-z]+=)/).map((cookie) => cookie.trim()).filter(Boolean);
}

function sameSiteCookieValue(value) {
  const normalized = value.toLowerCase();
  if (normalized === "strict") return "Strict";
  if (normalized === "none") return "None";
  return "Lax";
}

function cookieFromSetCookie(setCookie, origin) {
  const [nameAndValue, ...attributes] = setCookie.split(";").map((part) => part.trim());
  const separator = nameAndValue.indexOf("=");
  if (separator <= 0) return null;

  const cookie = {
    name: nameAndValue.slice(0, separator),
    value: nameAndValue.slice(separator + 1),
    url: origin
  };

  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.toLowerCase();
    const rawValue = rawValueParts.join("=");
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "secure") cookie.secure = true;
    if (key === "samesite" && rawValue) cookie.sameSite = sameSiteCookieValue(rawValue);
    if (key === "max-age" && Number.isFinite(Number(rawValue))) {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(rawValue);
    }
    if (key === "expires" && Number.isFinite(Date.parse(rawValue))) {
      cookie.expires = Math.floor(Date.parse(rawValue) / 1000);
    }
  }

  return cookie;
}

async function syncResponseCookies(page, origin, headers) {
  const cookies = splitSetCookieHeader(headers["set-cookie"])
    .map((setCookie) => cookieFromSetCookie(setCookie, origin))
    .filter(Boolean);
  if (cookies.length > 0) await page.context().addCookies(cookies);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNavigationError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ERR_CONNECTION_REFUSED") || message.includes("ERR_CONNECTION_RESET");
}

async function gotoWithRetry(page, url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: defaultTimeout });
      return;
    } catch (error) {
      if (!isTransientNavigationError(error) || attempt === 3) throw error;
      await sleep(500 * attempt);
    }
  }
}

async function openWorkspacePage(page, origin) {
  rememberPageOrigin(page, origin);
  await gotoWithRetry(page, `${origin}/workspace/sena`);
}

async function fetchJson(page, path, init = {}) {
  if (!page.isClosed() && page.url().startsWith("http")) {
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Target page") && !message.includes("has been closed")) throw error;
    }
  }

  const baseUrl = pageBaseUrl(page);
  const requestUrl = new URL(path, baseUrl).toString();
  const { body, credentials: _credentials, ...requestInit } = init;
  const cookies = await page.context().cookies(requestUrl);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const requestOptions = { ...requestInit };
  requestOptions.headers = {
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...(requestOptions.headers ?? {})
  };
  if (body !== undefined && requestOptions.data === undefined) requestOptions.data = body;
  const response = await page.context().request.fetch(requestUrl, requestOptions);
  const text = await response.text();
  let parsedBody;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = { parseError: text };
  }
  return {
    status: response.status(),
    ok: response.ok(),
    headers: response.headers(),
    body: parsedBody
  };
}

async function registerThroughApi(page, origin, input) {
  rememberPageOrigin(page, origin);
  const result = await fetchJson(page, "/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password,
      organization: input.organization,
      plan: input.plan
    })
  });
  if (result.status !== 201) {
    throw new Error(`${input.label} registration failed: ${JSON.stringify(result)}.`);
  }
  requireHeader(result.headers, "x-sena-auth-flow", "password-register");
  await syncResponseCookies(page, origin, result.headers);
  return result;
}

async function registerOwner(page, origin, unique) {
  const email = `rbac-owner-${unique}@example.edu`;
  const result = await registerThroughApi(page, origin, {
    label: "Owner",
    name: "SENA RBAC Owner",
    email,
    organization: "SENA RBAC Collaboration Lab",
    plan: "lab"
  });
  requireHeader(result.headers, "x-sena-auth-membership-role", "owner");
  const teamId = requireHeader(result.headers, "x-sena-auth-team-id");
  await openWorkspacePage(page, origin);
  return { email, teamId };
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
  await registerThroughApi(page, origin, {
    label: "Reviewer",
    name: "SENA Invited Reviewer",
    email: input.email,
    organization: "External Reviewer Lab",
    plan: "individual"
  });
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
  await openWorkspacePage(page, origin);
}

async function registerOutsider(page, origin, unique) {
  await registerThroughApi(page, origin, {
    label: "Outsider",
    name: "SENA RBAC Outsider",
    email: `rbac-outsider-${unique}@example.edu`,
    organization: "Outside Collaboration Lab",
    plan: "lab"
  });
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
    const owner = await registerOwner(ownerPage, origin, unique);
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
