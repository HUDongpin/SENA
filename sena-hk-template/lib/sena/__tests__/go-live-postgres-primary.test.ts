import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

describe("SENA go-live Postgres primary state", () => {
  it("writes and lists go-live attestations through Postgres primary state without initializing local JSON", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-go-live-postgres-primary-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_APP_URL = "https://sena.example.test";
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
        name: "Postgres Go Live Owner",
        email: "postgres-go-live-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Go Live Lab",
        plan: "enterprise"
      });
      sessionToken = owner.token;
      const teamId = owner.context.teams[0].id;

      const attestation = await enterprise.createEnterpriseGoLiveAttestationWithPostgresEvidence(owner.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.30-postgres-primary",
        decision: "conditional",
        attesterName: "Institution release owner",
        attesterRole: "Platform operations",
        notes: "Conditional approval keeps unresolved production evidence visible while persisting in Postgres primary state.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: false,
          platformOwnerDecisionReviewed: true
        }
      });
      const listed = await enterprise.listEnterpriseGoLiveAttestationsWithPostgresEvidence(owner.context, { teamId });
      const route = await import("../../../app/api/sena/ops/go-live-rehearsal/route");
      const response = await route.GET(new Request(`https://sena.example.test/api/sena/ops/go-live-rehearsal?teamId=${teamId}&attestations=1`));
      const body = await response.json() as {
        attestations?: {
          summary?: { conditional?: number };
          attestations?: Array<{ id?: string }>;
        };
      };

      expect(attestation.id).toMatch(/^go-live_/);
      expect(pg.state?.payload.goLiveAttestations.map((record) => record.id)).toContain(attestation.id);
      expect(pg.state?.payload.auditLog.some((entry) => entry.event === "ops.go_live.attestation")).toBe(true);
      expect(listed.attestations.map((record) => record.id)).toContain(attestation.id);
      expect(listed.summary.conditional).toBe(1);
      expect(response.status).toBe(200);
      expect(body.attestations?.summary?.conditional).toBe(1);
      expect(body.attestations?.attestations?.map((record) => record.id)).toContain(attestation.id);
      expect(pg.queries.some((query) => /UPDATE "public"\."sena_enterprise_state" SET payload/i.test(query))).toBe(true);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.doUnmock("next/headers");
      vi.resetModules();
    }
  });
});
