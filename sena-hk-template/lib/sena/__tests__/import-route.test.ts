import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("SENA import route", () => {
  it("returns import, cleaning, project, and analysis provenance headers for persisted transcript imports", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-import-route-"));
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
    vi.doMock("@/lib/sena/import-adapters", async () => await import("../import-adapters"));
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Import Reviewer",
        email: "import-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Import Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const form = new FormData();
      form.set("teamId", registered.context.teams[0].id);
      form.set("action", "create-project");
      form.set("title", "Route Transcript Import");
      form.set("includeRuntimeBundle", "true");
      form.append("files", new File([
        [
          "1",
          "00:00:01,000 --> 00:00:03,000",
          "Ada: We should ask a better #Question and gather #Evidence.",
          "",
          "2",
          "00:00:04,000 --> 00:00:06,000",
          "Ben: The board explanation needs {{Explanation}} and later #Reflection."
        ].join("\n")
      ], "route-transcript.srt", { type: "application/x-subrip" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: form
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        cleaningManifest?: {
          schemaVersion?: string;
          summary?: {
            adapterProfiles?: string[];
            warningCount?: number;
          };
          checks?: Array<{ status?: string }>;
        };
        importRun?: {
          id?: string;
          status?: string;
          teamId?: string;
          fileCount?: number;
          warningCount?: number;
          cleaningManifest?: { schemaVersion?: string };
        };
        persistedProject?: { id?: string; currentVersion?: number };
        enterpriseAnalysisRun?: { id?: string };
      };

      expect(response.status).toBe(201);
      expect(body.schemaVersion).toBe("sena-enterprise-import/v1");
      expect(body.importRun?.status).toBe("completed");
      expect(body.importRun?.cleaningManifest?.schemaVersion).toBe("sena-import-cleaning-manifest/v1");
      expect(body.cleaningManifest?.summary?.adapterProfiles).toContain("cleaned-transcript");
      expect(body.persistedProject?.currentVersion).toBe(1);
      expect(body.enterpriseAnalysisRun?.id).toMatch(/^analysis_/);
      expect(response.headers.get("x-sena-import-run-id")).toBe(body.importRun?.id);
      expect(response.headers.get("x-sena-import-status")).toBe("completed");
      expect(response.headers.get("x-sena-team-id")).toBe(registered.context.teams[0].id);
      expect(response.headers.get("x-sena-import-file-count")).toBe("1");
      expect(response.headers.get("x-sena-import-warning-count")).toBe("0");
      expect(response.headers.get("x-sena-import-cleaning-manifest")).toBe("sena-import-cleaning-manifest/v1");
      expect(response.headers.get("x-sena-import-profiles")).toContain("cleaned-transcript");
      expect(response.headers.get("x-sena-import-cleaning-review-checks")).toBe(String(body.cleaningManifest?.checks?.filter((check) => check.status === "review").length));
      expect(response.headers.get("x-sena-project-id")).toBe(body.persistedProject?.id);
      expect(response.headers.get("x-sena-project-version")).toBe(String(body.persistedProject?.currentVersion));
      expect(response.headers.get("x-sena-analysis-run-id")).toBe(body.enterpriseAnalysisRun?.id);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 30_000);
});
