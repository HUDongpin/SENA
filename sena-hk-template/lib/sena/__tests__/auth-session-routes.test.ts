import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const legacyEvidenceTimestamp = "2026-08-25T00:00:00.000Z";

function blockedReleaseGateInput(teamId: string) {
  return {
    teamId,
    environment: "legacy-auth-evidence",
    releaseVersion: "2026.08.25-legacy-auth-evidence",
    decision: "blocked" as const,
    approverName: "Legacy evidence reviewer",
    approverRole: "Institution platform owner",
    notes: "Blocked legacy fixture retained to exercise identity evidence read projection.",
    verificationCommand: "npm run sena:pilot:verify"
  };
}

function seedLegacyIdentityEvidenceHolders(db: SenaEnterpriseDb, input: {
  teamId: string;
  userId: string;
}) {
  const releaseGateReview = db.releaseGateReviews[0];
  if (!releaseGateReview) throw new Error("Legacy release-gate fixture is missing.");
  delete (releaseGateReview as Partial<typeof releaseGateReview>).verificationEvidence;

  const releaseAudit = db.auditLog.find((entry) => entry.event === "ops.release_gate.review");
  if (!releaseAudit) throw new Error("Legacy release-gate audit fixture is missing.");
  delete (releaseAudit as Partial<typeof releaseAudit>).detail;
  releaseAudit.webhookDelivery = {
    provider: "webhook",
    status: "pending",
    endpointHash: "",
    queuedAt: legacyEvidenceTimestamp
  } as never;

  db.collaborationEvents = [{
    id: "legacy-collaboration-event",
    kind: "comment",
    teamId: input.teamId,
    projectId: "unrelated-broken-project",
    actorUserId: input.userId,
    createdAt: legacyEvidenceTimestamp
  } as never];
  db.notifications = [{
    id: "legacy-notification",
    kind: "project.comment",
    status: "delivered",
    channel: "in-app",
    userId: input.userId,
    teamId: input.teamId,
    projectId: "unrelated-broken-project",
    title: "Legacy notification",
    body: "Legacy notification body",
    createdAt: legacyEvidenceTimestamp,
    deliveredAt: legacyEvidenceTimestamp,
    webhookDelivery: {
      provider: "webhook",
      status: "pending",
      endpointHash: "",
      queuedAt: legacyEvidenceTimestamp
    }
  } as never];
  db.emailDeliveries = [{
    id: "legacy-email",
    kind: "team.invite",
    status: "pending",
    provider: "webhook",
    endpointHash: "",
    teamId: input.teamId,
    userId: input.userId,
    recipientEmailHash: "0".repeat(64),
    recipientEmailDomain: "example.edu",
    sealedPayload: {},
    queuedAt: legacyEvidenceTimestamp
  } as never];
  db.uploads = [{
    id: "legacy-upload",
    teamId: input.teamId,
    userId: input.userId,
    originalName: "legacy.csv",
    storedName: "legacy.csv",
    contentType: "text/csv",
    size: 0,
    sha256: "0".repeat(64),
    storagePath: path.join("uploads", input.teamId, "missing-legacy.csv"),
    objectStorageCustody: {},
    createdAt: legacyEvidenceTimestamp
  } as never];
  db.projects = [{
    id: "unrelated-broken-project",
    snapshot: { deliberately: "not a project snapshot" }
  } as never];
  db.projectRevisions = [{
    id: "unrelated-broken-revision",
    snapshot: { deliberately: "not a project snapshot" }
  } as never];
}

function expectProjectedLegacyIdentityEvidenceDefaults(db: SenaEnterpriseDb) {
  expect(db.collaborationEvents[0]).toMatchObject({
    detail: {},
    delivery: {
      provider: "webhook",
      status: "pending",
      endpointHash: "",
      queuedAt: legacyEvidenceTimestamp,
      attempts: 0,
      maxAttempts: 3
    }
  });
  expect(db.releaseGateReviews[0]?.verificationEvidence).toMatchObject({
    schemaVersion: "sena-enterprise-release-verification-evidence/v1",
    command: "npm run sena:pilot:verify",
    status: "not-run",
    summary: "Legacy release gate 2026.08.25-legacy-auth-evidence was recorded before verification evidence capture.",
    hashAlgorithm: "sha256",
    recordedAt: db.releaseGateReviews[0]?.updatedAt ?? db.releaseGateReviews[0]?.createdAt
  });
  expect(db.releaseGateReviews[0]?.verificationEvidence.outputSha256).toMatch(/^[a-f0-9]{64}$/);
  const releaseAudit = db.auditLog.find((entry) => entry.event === "ops.release_gate.review");
  expect(releaseAudit).toMatchObject({
    detail: {},
    webhookDelivery: { attempts: 0, maxAttempts: 3 }
  });
  expect(db.notifications[0]).toMatchObject({
    detail: {},
    webhookDelivery: { attempts: 0, maxAttempts: 3 }
  });
  expect(db.emailDeliveries[0]).toMatchObject({ attempts: 0, maxAttempts: 3 });
  expect(db.uploads[0]).toMatchObject({
    scanStatus: "passed",
    scanEngine: "sena-local-upload-scan/v1",
    scanFindings: [],
    objectStorageCustody: { status: "pending" }
  });
}

function expectLegacyIdentityEvidenceHeaders(response: Response) {
  const expectedHeaders = [
    "x-sena-auth-flow",
    "x-sena-auth-user-id",
    "x-sena-auth-session-id",
    "x-sena-auth-session-profile",
    "x-sena-auth-session-expires-at",
    "x-sena-auth-team-id",
    "x-sena-auth-membership-role",
    "x-sena-auth-production-gate",
    "x-sena-identity-production-status",
    "x-sena-identity-release-gate-blocked",
    "x-sena-identity-request-blockers",
    "x-sena-identity-production-blocking-decisions",
    "x-sena-identity-missing-evidence-ids",
    "x-sena-identity-cutover-checklist",
    "x-sena-identity-cutover-blockers",
    "x-sena-identity-rotation-freshness",
    "x-sena-identity-institution-action-plan-digest",
    "x-sena-identity-institution-action-plan-blocking-lanes",
    "x-sena-identity-institution-action-plan-ready-lanes",
    "x-sena-identity-institution-action-plan-submission-path",
    "x-sena-identity-owner-runbook-digest",
    "x-sena-identity-owner-runbook-blocking",
    "x-sena-identity-owner-runbook-preflight-checks",
    "x-sena-identity-owner-runbook-submission-steps",
    "x-sena-identity-owner-runbook-receipt-archive-steps"
  ];
  for (const header of expectedHeaders) {
    expect(response.headers.get(header), header).not.toBeNull();
    expect(response.headers.get(header), header).not.toBe("undefined");
  }
  expect(response.headers.get("x-sena-identity-institution-action-plan-digest"))
    .toMatch(/^[a-f0-9]{64}$/);
  expect(response.headers.get("x-sena-identity-owner-runbook-digest"))
    .toMatch(/^[a-f0-9]{64}$/);
}

function expectRawLegacyIdentityEvidenceUnchanged(db: SenaEnterpriseDb) {
  expect(db.collaborationEvents[0]).not.toHaveProperty("detail");
  expect(db.collaborationEvents[0]).not.toHaveProperty("delivery");
  expect(db.releaseGateReviews[0]).not.toHaveProperty("verificationEvidence");
  const releaseAudit = db.auditLog.find((entry) => entry.event === "ops.release_gate.review");
  expect(releaseAudit).not.toHaveProperty("detail");
  expect(releaseAudit?.webhookDelivery).not.toHaveProperty("attempts");
  expect(releaseAudit?.webhookDelivery).not.toHaveProperty("maxAttempts");
  expect(db.notifications[0]).not.toHaveProperty("detail");
  expect(db.notifications[0]?.webhookDelivery).not.toHaveProperty("attempts");
  expect(db.notifications[0]?.webhookDelivery).not.toHaveProperty("maxAttempts");
  expect(db.emailDeliveries[0]).not.toHaveProperty("attempts");
  expect(db.emailDeliveries[0]).not.toHaveProperty("maxAttempts");
  expect(db.uploads[0]).not.toHaveProperty("scanStatus");
  expect(db.uploads[0]).not.toHaveProperty("scanEngine");
  expect(db.uploads[0]).not.toHaveProperty("scanFindings");
  expect(db.uploads[0]?.objectStorageCustody).not.toHaveProperty("status");
  expect(db.projects[0]?.snapshot).toEqual({ deliberately: "not a project snapshot" });
  expect(db.projectRevisions[0]?.snapshot).toEqual({ deliberately: "not a project snapshot" });
}

function containsDeliberatelyBrokenSnapshot(
  candidate: unknown,
  seen = new WeakSet<object>()
): boolean {
  if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return false;
  seen.add(candidate);
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch {
    return false;
  }
  if (descriptors.deliberately && "value" in descriptors.deliberately
    && descriptors.deliberately.value === "not a project snapshot") {
    return true;
  }
  return Reflect.ownKeys(descriptors).some((key) => {
    const descriptor = descriptors[key as keyof typeof descriptors];
    return Boolean(descriptor && "value" in descriptor
      && containsDeliberatelyBrokenSnapshot(descriptor.value, seen));
  });
}

describe("SENA auth session routes", () => {
  it("observes session read, CSRF, session list, and logout routes without dropping cookies", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-session-routes-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Session Route User",
        email: "session-route-user@example.edu",
        password: "sena-secure-123",
        organization: "Session Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;

      const meRoute = await import("../../../app/api/auth/me/route");
      const meResponse = await meRoute.GET(new Request("https://sena.example.test/api/auth/me"));
      const meBody = await meResponse.json() as { user?: { id?: string } };
      expect(meResponse.status).toBe(200);
      expect(meResponse.headers.get("x-sena-observed-route")).toBe("auth-me");
      expect(meResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(meBody.user?.id).toBe(registered.context.user.id);

      const csrfRoute = await import("../../../app/api/auth/csrf/route");
      const csrfResponse = await csrfRoute.GET(new Request("https://sena.example.test/api/auth/csrf"));
      const csrf = await csrfResponse.json() as { headerName?: string; token?: string };
      expect(csrfResponse.status).toBe(200);
      expect(csrfResponse.headers.get("x-sena-observed-route")).toBe("auth-csrf");
      expect(csrf.headerName).toBe("x-sena-csrf-token");
      expect(csrf.token).toBeTruthy();

      const sessionsRoute = await import("../../../app/api/auth/sessions/route");
      const sessionsResponse = await sessionsRoute.GET(new Request("https://sena.example.test/api/auth/sessions"));
      const sessionsBody = await sessionsResponse.json() as { sessions?: Array<{ id?: string }> };
      expect(sessionsResponse.status).toBe(200);
      expect(sessionsResponse.headers.get("x-sena-observed-route")).toBe("auth-sessions");
      expect(sessionsBody.sessions?.map((session) => session.id)).toContain(registered.context.session.id);

      const logoutRoute = await import("../../../app/api/auth/logout/route");
      const logoutResponse = await logoutRoute.POST(new Request("https://sena.example.test/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [String(csrf.headerName)]: String(csrf.token)
        },
        body: "{}"
      }));
      const logoutBody = await logoutResponse.json() as { ok?: boolean };
      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.headers.get("x-sena-observed-route")).toBe("auth-logout");
      expect(logoutResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(logoutResponse.headers.get("set-cookie")).toContain("sena_session=;");
      expect(logoutBody.ok).toBe(true);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("projects legacy file-backed session defaults without importing unrelated snapshots", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-session-legacy-file-"));
    const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Legacy File Session User",
        email: "legacy-file-session@example.edu",
        password: "sena-secure-123",
        organization: "Legacy File Session Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      enterprise.createEnterpriseReleaseGateReview(
        registered.context,
        blockedReleaseGateInput(registered.context.teams[0].id)
      );

      const persisted = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
      const legacySession = persisted.sessions.find((session) => session.id === registered.context.session.id);
      if (!legacySession) throw new Error("Registered legacy file session fixture is missing.");
      delete (legacySession as Partial<typeof legacySession>).sessionProfile;
      delete (legacySession as Partial<typeof legacySession>).ttlDays;
      seedLegacyIdentityEvidenceHolders(persisted, {
        teamId: registered.context.teams[0].id,
        userId: registered.context.user.id
      });
      const persistedBytesBeforeRead = JSON.stringify(persisted);
      writeFileSync(dbPath, persistedBytesBeforeRead);

      const clone = vi.spyOn(globalThis, "structuredClone");
      try {
        const meRoute = await import("../../../app/api/auth/me/route");
        const response = await meRoute.GET(new Request("https://sena.example.test/api/auth/me"));
        const body = await response.json() as {
          session?: { id?: string; sessionProfile?: string; ttlDays?: number };
        };
        const { SENA_API_ENDPOINT_FACTS } = await import("../api-route-facts");

        expect(response.status).toBe(200);
        expect(SENA_API_ENDPOINT_FACTS.find((fact) => fact.id === "auth-session")?.responses)
          .toContain("sena-auth-session/v1");
        expect(body.session).toMatchObject({
          id: registered.context.session.id,
          sessionProfile: "standard",
          ttlDays: 7
        });
        expect(response.headers.get("x-sena-auth-session-profile")).toBe("standard");
        expectLegacyIdentityEvidenceHeaders(response);
        const { readEnterpriseIdentityEvidenceState } = await import("../enterprise/state");
        const projected = await readEnterpriseIdentityEvidenceState();
        expectProjectedLegacyIdentityEvidenceDefaults(projected.db);
        expect(clone.mock.calls.some(([value]) => containsDeliberatelyBrokenSnapshot(value))).toBe(false);
      } finally {
        clone.mockRestore();
      }

      const unchanged = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
      expect(readFileSync(dbPath, "utf8")).toBe(persistedBytesBeforeRead);
      const unchangedSession = unchanged.sessions.find((session) => session.id === registered.context.session.id);
      expect(unchangedSession).not.toHaveProperty("sessionProfile");
      expect(unchangedSession).not.toHaveProperty("ttlDays");
      expectRawLegacyIdentityEvidenceUnchanged(unchanged);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("projects legacy Postgres-primary session defaults without importing unrelated snapshots", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-session-legacy-postgres-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:redacted@example.test/senadb?sslmode=require";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        query(sql: string, values?: unknown[]) {
          return pg.query(sql, values);
        }
      }
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Legacy Postgres Session User",
        email: "legacy-postgres-session@example.edu",
        password: "sena-secure-123",
        organization: "Legacy Postgres Session Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      await enterprise.createEnterpriseReleaseGateReviewWithPostgresEvidence(
        registered.context,
        blockedReleaseGateInput(registered.context.teams[0].id)
      );
      if (!pg.state) throw new Error("Postgres legacy session fixture was not initialized.");
      const legacySession = pg.state.payload.sessions.find((session) => session.id === registered.context.session.id);
      if (!legacySession) throw new Error("Registered legacy Postgres session fixture is missing.");
      delete (legacySession as Partial<typeof legacySession>).sessionProfile;
      delete (legacySession as Partial<typeof legacySession>).ttlDays;
      seedLegacyIdentityEvidenceHolders(pg.state.payload, {
        teamId: registered.context.teams[0].id,
        userId: registered.context.user.id
      });
      const revisionBeforeRead = pg.state.revision;

      const clone = vi.spyOn(globalThis, "structuredClone");
      try {
        const meRoute = await import("../../../app/api/auth/me/route");
        const response = await meRoute.GET(new Request("https://sena.example.test/api/auth/me"));
        const body = await response.json() as {
          session?: { id?: string; sessionProfile?: string; ttlDays?: number };
        };
        const { SENA_API_ENDPOINT_FACTS } = await import("../api-route-facts");

        expect(response.status).toBe(200);
        expect(SENA_API_ENDPOINT_FACTS.find((fact) => fact.id === "auth-session")?.responses)
          .toContain("sena-auth-session/v1");
        expect(body.session).toMatchObject({
          id: registered.context.session.id,
          sessionProfile: "standard",
          ttlDays: 7
        });
        expect(response.headers.get("x-sena-auth-session-profile")).toBe("standard");
        expectLegacyIdentityEvidenceHeaders(response);
        const { readEnterpriseIdentityEvidenceState } = await import("../enterprise/state");
        const projected = await readEnterpriseIdentityEvidenceState();
        expectProjectedLegacyIdentityEvidenceDefaults(projected.db);
        expect(clone.mock.calls.some(([value]) => containsDeliberatelyBrokenSnapshot(value))).toBe(false);
      } finally {
        clone.mockRestore();
      }

      expect(pg.state.revision).toBe(revisionBeforeRead);
      const unchangedSession = pg.state.payload.sessions.find((session) => session.id === registered.context.session.id);
      expect(unchangedSession).not.toHaveProperty("sessionProfile");
      expect(unchangedSession).not.toHaveProperty("ttlDays");
      expectRawLegacyIdentityEvidenceUnchanged(pg.state.payload);
    } finally {
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
