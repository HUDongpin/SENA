import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const notificationsRouteTestTimeoutMs = 30_000;

describe("SENA notifications route", () => {
  it("reads, marks, and delivers notifications through Postgres primary state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-notifications-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_ENTERPRISE_MODE = "self-managed";
    process.env.SENA_SELF_MANAGED_WEBHOOK_SINK = "local";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
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
      const owner = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Notification Owner",
        email: "postgres-notification-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Notification Lab",
        plan: "lab"
      });
      sessionToken = owner.token;
      const teamId = owner.context.teams[0].id;
      await enterprise.createEnterpriseInvitationAsync(owner.context, {
        teamId,
        email: "postgres-notification-reviewer@example.edu",
        role: "reviewer",
        baseUrl: "https://sena.example.test"
      });

      const route = await import("../../../app/api/sena/notifications/route");
      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/notifications?teamId=${teamId}`));
      const listBody = await listResponse.json() as {
        notifications?: Array<{ id?: string; kind?: string; status?: string }>;
      };
      const notificationId = listBody.notifications?.find((notification) => notification.kind === "team.invite")?.id;
      const emailDeliveryId = pg.state?.payload.emailDeliveries.find((delivery) => delivery.kind === "team.invite")?.id;

      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-notifications");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(notificationId).toMatch(/^notif_/);
      expect(emailDeliveryId).toMatch(/^email_/);
      expect(pg.state?.payload.notifications.map((notification) => notification.id)).toContain(notificationId);

      const readCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const readResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/notifications", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": readCsrf.token
        },
        body: JSON.stringify({ notificationId })
      }));
      const readBody = await readResponse.json() as {
        notification?: { id?: string; status?: string };
      };
      expect(readResponse.status).toBe(200);
      expect(readResponse.headers.get("x-sena-observed-route")).toBe("sena-notifications");
      expect(readBody.notification?.id).toBe(notificationId);
      expect(readBody.notification?.status).toBe("read");
      expect(pg.state?.payload.notifications.find((notification) => notification.id === notificationId)?.status).toBe("read");

      const deliveryCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const deliveryResponse = await route.POST(new Request("https://sena.example.test/api/sena/notifications", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": deliveryCsrf.token
        },
        body: JSON.stringify({ teamId, force: true })
      }));
      const deliveryBody = await deliveryResponse.json() as {
        summary?: { attempted?: number; delivered?: number };
      };
      expect(deliveryResponse.status).toBe(200);
      expect(deliveryResponse.headers.get("x-sena-observed-route")).toBe("sena-notifications");
      expect(deliveryBody.summary?.attempted).toBeGreaterThanOrEqual(1);
      expect(deliveryBody.summary?.delivered).toBeGreaterThanOrEqual(1);
      expect(pg.state?.payload.notifications.find((notification) => notification.id === notificationId)?.webhookDelivery?.status).toBe("delivered");

      const emailCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const emailResponse = await route.POST(new Request("https://sena.example.test/api/sena/notifications", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": emailCsrf.token
        },
        body: JSON.stringify({ action: "deliver-email", teamId, force: true })
      }));
      const emailBody = await emailResponse.json() as {
        summary?: { attempted?: number; delivered?: number };
      };
      expect(emailResponse.status).toBe(200);
      expect(emailResponse.headers.get("x-sena-observed-route")).toBe("sena-notifications");
      expect(emailBody.summary?.attempted).toBeGreaterThanOrEqual(1);
      expect(emailBody.summary?.delivered).toBeGreaterThanOrEqual(1);
      expect(pg.state?.payload.emailDeliveries.find((delivery) => delivery.id === emailDeliveryId)?.status).toBe("delivered");

      const fileBackedDb = enterprise.readEnterpriseDb();
      expect(fileBackedDb.notifications.map((notification: { id: string }) => notification.id)).not.toContain(notificationId);
      expect(fileBackedDb.emailDeliveries.map((delivery: { id: string }) => delivery.id)).not.toContain(emailDeliveryId);
      expect(JSON.stringify({ listBody, readBody, deliveryBody, emailBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ listBody, readBody, deliveryBody, emailBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      delete process.env.SENA_ENTERPRISE_MODE;
      delete process.env.SENA_SELF_MANAGED_WEBHOOK_SINK;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, notificationsRouteTestTimeoutMs);
});
