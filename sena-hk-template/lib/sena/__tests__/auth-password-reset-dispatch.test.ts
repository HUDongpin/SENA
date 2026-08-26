import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type WebhookCall = { url: string; headers: Record<string, string>; body: string };

type EmailDeliveryRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastErrorCode?: string;
  lastStatus?: number;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
};

type EnterpriseDbFile = {
  emailDeliveries: EmailDeliveryRow[];
  notifications?: Array<{
    id: string;
    webhookDelivery?: { status: string; attempts: number };
  }>;
  passwordResetRequests?: Array<{ id: string; tokenHash: string }>;
  auditLog: Array<{ event: string; detail: Record<string, unknown> }>;
};

const enterpriseDbDirs: string[] = [];

function enterpriseTempDbDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  enterpriseDbDirs.push(dir);
  process.env.SENA_ENTERPRISE_DB_DIR = dir;
  return dir;
}

function readEnterpriseDbFile(dir: string): EnterpriseDbFile {
  return JSON.parse(readFileSync(path.join(dir, "enterprise-db.json"), "utf8")) as EnterpriseDbFile;
}

function configureEmailWebhook() {
  process.env.SENA_EMAIL_WEBHOOK_URL = "https://mail.example.test/sena";
  process.env.SENA_EMAIL_WEBHOOK_SECRET = "sena-email-webhook-secret-for-tests";
}

function stubWebhookFetch(handler: (call: WebhookCall, init: RequestInit) => Promise<Response>) {
  const calls: WebhookCall[] = [];
  const fetchMock = vi.fn(async (url: unknown, init: RequestInit = {}) => {
    const call: WebhookCall = {
      url: String(url),
      headers: (init.headers as Record<string, string>) ?? {},
      body: String(init.body ?? "")
    };
    calls.push(call);
    return handler(call, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

async function registerResetUser(email: string) {
  const { registerEnterpriseUser } = await import("../enterprise/auth-registration");
  return registerEnterpriseUser({
    name: "Reset Dispatch User",
    email,
    password: "sena-secure-123",
    organization: "Reset Dispatch Lab"
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_EMAIL_WEBHOOK_URL;
  delete process.env.SENA_EMAIL_WEBHOOK_SECRET;
  delete process.env.SENA_EMAIL_WEBHOOK_TIMEOUT_MS;
  delete process.env.SENA_EMAIL_WEBHOOK_MAX_ATTEMPTS;
  delete process.env.SENA_EMAIL_INLINE_DISPATCH_TIMEOUT_MS;
  delete process.env.SENA_NOTIFICATION_WEBHOOK_URL;
  delete process.env.SENA_NOTIFICATION_WEBHOOK_SECRET;
  delete process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN;
  delete process.env.SENA_APP_URL;
  while (enterpriseDbDirs.length) {
    rmSync(enterpriseDbDirs.pop()!, { recursive: true, force: true });
  }
  vi.resetModules();
});

describe("SENA password-reset email auto-dispatch (B10)", () => {
  it("dispatches the reset email at request time when a provider is configured, with no admin session in the loop", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-ok-");
    configureEmailWebhook();
    vi.resetModules();

    await registerResetUser("dispatch-ok@example.edu");
    const { calls, fetchMock } = stubWebhookFetch(async () => new Response(null, { status: 202 }));

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const result = await createEnterprisePasswordResetAsync({
      email: "dispatch-ok@example.edu",
      baseUrl: "https://sena.example.edu"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe("https://mail.example.test/sena");
    expect(calls[0].headers["x-sena-webhook-event"]).toBe("email.deliver");
    expect(calls[0].headers["idempotency-key"]).toBe(calls[0].headers["x-sena-email-delivery-id"]);
    expect(calls[0].headers["x-sena-webhook-signature"]).toMatch(/^sha256=/);
    const webhookPayload = JSON.parse(calls[0].body) as { email: { kind: string; actionUrl?: string } };
    expect(webhookPayload.email.kind).toBe("auth.password_reset");
    expect(webhookPayload.email.actionUrl).toContain("https://sena.example.edu/reset-password?token=");

    expect(result.delivery.mode).toBe("email-webhook");

    const db = readEnterpriseDbFile(dir);
    const delivery = db.emailDeliveries.find((row) => row.kind === "auth.password_reset");
    expect(delivery?.status).toBe("delivered");
    expect(delivery?.attempts).toBe(1);
    expect(delivery?.deliveredAt).toEqual(expect.any(String));
    expect(db.auditLog.some((entry) => entry.event === "email.webhook.deliver")).toBe(true);
  });

  it("keeps the mode at email-provider-required and queues nothing when no provider is configured", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-unconfigured-");
    vi.resetModules();

    await registerResetUser("dispatch-unconfigured@example.edu");
    const { fetchMock } = stubWebhookFetch(async () => new Response(null, { status: 202 }));

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const result = await createEnterprisePasswordResetAsync({
      email: "dispatch-unconfigured@example.edu",
      baseUrl: "https://sena.example.edu"
    });

    expect(result.delivery.mode).toBe("email-provider-required");
    expect(fetchMock).not.toHaveBeenCalled();
    const db = readEnterpriseDbFile(dir);
    expect(db.emailDeliveries.filter((row) => row.kind === "auth.password_reset")).toHaveLength(0);
    expect(db.auditLog.some((entry) => entry.event === "email.webhook.deliver")).toBe(false);
  });

  it("records a rejecting provider as a failure instead of reporting the reset as delivered", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-failure-");
    configureEmailWebhook();
    vi.resetModules();

    await registerResetUser("dispatch-failure@example.edu");
    const { fetchMock } = stubWebhookFetch(async () => new Response("upstream down", { status: 500 }));

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const result = await createEnterprisePasswordResetAsync({
      email: "dispatch-failure@example.edu",
      baseUrl: "https://sena.example.edu"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("queued");
    expect(result.delivery.mode).toBe("email-dispatch-failed");

    const db = readEnterpriseDbFile(dir);
    const delivery = db.emailDeliveries.find((row) => row.kind === "auth.password_reset");
    expect(delivery?.status).not.toBe("delivered");
    expect(delivery?.deliveredAt).toBeUndefined();
    expect(delivery?.attempts).toBe(1);
    expect(delivery?.lastErrorCode).toBe("http_500");
    expect(delivery?.lastStatus).toBe(500);
    expect(delivery?.nextAttemptAt).toEqual(expect.any(String));
    expect(db.auditLog.some((entry) => entry.event === "email.webhook.fail")).toBe(true);
    expect(db.auditLog.some((entry) => entry.event === "email.webhook.deliver")).toBe(false);
  });

  it("keeps the reset request alive when the provider throws instead of answering", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-network-");
    configureEmailWebhook();
    vi.resetModules();

    await registerResetUser("dispatch-network@example.edu");
    stubWebhookFetch(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const result = await createEnterprisePasswordResetAsync({
      email: "dispatch-network@example.edu",
      baseUrl: "https://sena.example.edu"
    });

    expect(result.status).toBe("queued");
    expect(result.delivery.mode).toBe("email-dispatch-failed");
    const db = readEnterpriseDbFile(dir);
    const delivery = db.emailDeliveries.find((row) => row.kind === "auth.password_reset");
    expect(delivery?.lastErrorCode).toBe("network_error");
    expect(delivery?.status).not.toBe("delivered");
  });

  it("bounds the inline dispatch so a hanging provider cannot hold the reset response open", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-timeout-");
    configureEmailWebhook();
    process.env.SENA_EMAIL_WEBHOOK_TIMEOUT_MS = "30000";
    process.env.SENA_EMAIL_INLINE_DISPATCH_TIMEOUT_MS = "60";
    vi.resetModules();

    await registerResetUser("dispatch-timeout@example.edu");
    stubWebhookFetch((_call, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (!signal) return;
      signal.addEventListener("abort", () => {
        const abortError = new Error("The operation was aborted.");
        abortError.name = "AbortError";
        reject(abortError);
      });
    }));

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const startedAt = Date.now();
    const result = await createEnterprisePasswordResetAsync({
      email: "dispatch-timeout@example.edu",
      baseUrl: "https://sena.example.edu"
    });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(5000);
    expect(result.delivery.mode).toBe("email-dispatch-failed");
    const db = readEnterpriseDbFile(dir);
    const delivery = db.emailDeliveries.find((row) => row.kind === "auth.password_reset");
    expect(delivery?.lastErrorCode).toBe("timeout");
    expect(delivery?.status).not.toBe("delivered");
  });

  it("persists the reset outbox before dispatch and survives a concurrent state commit during provider await", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-cas-");
    configureEmailWebhook();
    vi.resetModules();

    await registerResetUser("dispatch-cas@example.edu");
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseProvider = resolve; });
    let persistedBeforeFetch = false;
    const { fetchMock } = stubWebhookFetch(async () => {
      const before = readEnterpriseDbFile(dir);
      persistedBeforeFetch = Boolean(
        before.passwordResetRequests?.length === 1 &&
        before.emailDeliveries.some((entry) => entry.kind === "auth.password_reset" && entry.status === "pending")
      );
      providerStarted();
      await released;
      return new Response(null, { status: 202 });
    });

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const reset = createEnterprisePasswordResetAsync({
      email: "dispatch-cas@example.edu",
      baseUrl: "https://sena.example.edu"
    });
    await started;
    const { enforceEnterpriseApiRateLimit } = await import("../enterprise/auth-security");
    enforceEnterpriseApiRateLimit({
      bucket: "auth.password_reset.concurrent-test",
      key: "independent-writer",
      limit: 10,
      windowSeconds: 60
    });
    releaseProvider();

    await expect(reset).resolves.toMatchObject({
      status: "queued",
      delivery: { mode: "email-webhook" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(persistedBeforeFetch).toBe(true);
    const db = readEnterpriseDbFile(dir);
    expect(db.passwordResetRequests).toHaveLength(1);
    expect(db.emailDeliveries.find((entry) => entry.kind === "auth.password_reset"))
      .toEqual(expect.objectContaining({ status: "delivered", attempts: 1 }));
  });

  it("keeps an operator outbox flush consistent across a concurrent state commit", async () => {
    const dir = enterpriseTempDbDir("sena-email-flush-cas-");
    configureEmailWebhook();
    vi.resetModules();

    const registered = await registerResetUser("flush-cas@example.edu");
    const { createEnterprisePasswordReset } = await import("../enterprise/auth-password-reset");
    createEnterprisePasswordReset({ email: "flush-cas@example.edu", baseUrl: "https://sena.example.edu" });
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const { fetchMock } = stubWebhookFetch(async () => {
      providerStarted();
      await released;
      return new Response(null, { status: 202 });
    });

    const { deliverEnterpriseEmailsAsync } = await import("../enterprise/notifications-email");
    const flush = deliverEnterpriseEmailsAsync(registered.context, { limit: 1 });
    await started;
    const { enforceEnterpriseApiRateLimit } = await import("../enterprise/auth-security");
    enforceEnterpriseApiRateLimit({
      bucket: "email.flush.concurrent-test",
      key: "independent-writer",
      limit: 10,
      windowSeconds: 60
    });
    releaseProvider();

    await expect(flush).resolves.toMatchObject({
      summary: { attempted: 1, delivered: 1, failed: 0 }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readEnterpriseDbFile(dir).emailDeliveries[0]).toEqual(expect.objectContaining({
      status: "delivered",
      attempts: 1
    }));
  });

  it("keeps notification webhook delivery consistent across a concurrent state commit", async () => {
    const dir = enterpriseTempDbDir("sena-notification-flush-cas-");
    process.env.SENA_NOTIFICATION_WEBHOOK_URL = "https://notifications.example.test/sena";
    process.env.SENA_NOTIFICATION_WEBHOOK_SECRET = "sena-notification-webhook-secret-for-tests";
    vi.resetModules();

    const registered = await registerResetUser("notification-cas@example.edu");
    const { createEnterpriseInvitation } = await import("../enterprise/auth-invitations");
    createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "notification-reviewer@example.edu",
      role: "reviewer",
      baseUrl: "https://sena.example.edu"
    });
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const { calls, fetchMock } = stubWebhookFetch(async () => {
      providerStarted();
      await released;
      return new Response(null, { status: 202 });
    });

    const { deliverEnterpriseNotificationsAsync } = await import("../enterprise/notifications-delivery");
    const flush = deliverEnterpriseNotificationsAsync(registered.context, {
      teamId: registered.context.teams[0].id,
      limit: 1
    });
    await started;
    const { enforceEnterpriseApiRateLimit } = await import("../enterprise/auth-security");
    enforceEnterpriseApiRateLimit({
      bucket: "notification.flush.concurrent-test",
      key: "independent-writer",
      limit: 10,
      windowSeconds: 60
    });
    releaseProvider();

    await expect(flush).resolves.toMatchObject({
      summary: { attempted: 1, delivered: 1, failed: 0 }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].headers["idempotency-key"]).toBe(calls[0].headers["x-sena-notification-id"]);
    expect(readEnterpriseDbFile(dir).notifications?.[0]?.webhookDelivery).toEqual(expect.objectContaining({
      status: "delivered",
      attempts: 1
    }));
  });
});

describe("SENA password-reset account non-enumeration under auto-dispatch (B10)", () => {
  it("answers a healthy-provider request identically for a known and an unknown address", async () => {
    const dir = enterpriseTempDbDir("sena-password-reset-dispatch-enumeration-");
    configureEmailWebhook();
    vi.resetModules();

    await registerResetUser("enumeration-known@example.edu");
    const { fetchMock } = stubWebhookFetch(async () => new Response(null, { status: 202 }));

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const known = await createEnterprisePasswordResetAsync({
      email: "enumeration-known@example.edu",
      baseUrl: "https://sena.example.edu"
    });
    const unknown = await createEnterprisePasswordResetAsync({
      email: "enumeration-unknown@example.edu",
      baseUrl: "https://sena.example.edu"
    });

    expect(unknown.delivery).toEqual(known.delivery);
    expect(unknown.status).toBe(known.status);
    expect(unknown.schemaVersion).toBe(known.schemaVersion);
    expect(known.delivery.emailDeliveryId).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const db = readEnterpriseDbFile(dir);
    expect(db.emailDeliveries.filter((row) => row.kind === "auth.password_reset")).toHaveLength(1);
  });

  it("answers a failing-provider request identically for a known and an unknown address", async () => {
    enterpriseTempDbDir("sena-password-reset-dispatch-enumeration-failure-");
    configureEmailWebhook();
    vi.resetModules();

    await registerResetUser("enumeration-fail-known@example.edu");
    stubWebhookFetch(async () => new Response("upstream down", { status: 503 }));

    const { createEnterprisePasswordResetAsync } = await import("../enterprise/auth-password-reset");
    const known = await createEnterprisePasswordResetAsync({
      email: "enumeration-fail-known@example.edu",
      baseUrl: "https://sena.example.edu"
    });
    const unknown = await createEnterprisePasswordResetAsync({
      email: "enumeration-fail-unknown@example.edu",
      baseUrl: "https://sena.example.edu"
    });

    expect(known.delivery.mode).toBe("email-dispatch-failed");
    expect(unknown.delivery).toEqual(known.delivery);
  });
});
