import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

describe("SENA file-primary backup dry-run audit atomicity", () => {
  it("persists exactly one verification audit while leaving every restore collection unchanged", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-backup-dry-run-file-primary-"));
    const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    delete process.env.SENA_ENTERPRISE_STATE_STORE;
    delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
    delete process.env.SENA_ENTERPRISE_POSTGRES_URL;

    try {
      const enterprise = await import("../enterprise");
      const owner = enterprise.registerEnterpriseUser({
        name: "File Backup Owner",
        email: "file-backup-owner@example.edu",
        password: "sena-secure-123",
        organization: "File Backup Lab",
        plan: "enterprise"
      });
      const teamId = owner.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      enterprise.verifyEnterpriseBackup(owner.context, backup);
      const beforeText = readFileSync(dbPath, "utf8");
      const before = JSON.parse(beforeText) as SenaEnterpriseDb;

      const result = enterprise.restoreEnterpriseBackup(owner.context, backup, { dryRun: true });
      const afterText = readFileSync(dbPath, "utf8");
      const after = JSON.parse(afterText) as SenaEnterpriseDb;
      const { auditLog: beforeAudit, ...beforeDomainState } = before;
      const { auditLog: afterAudit, ...afterDomainState } = after;

      expect(result).toMatchObject({
        status: "dry-run",
        dryRun: true,
        backupId: backup.backupId
      });
      expect(afterText).not.toBe(beforeText);
      expect(afterDomainState).toEqual(beforeDomainState);
      expect(afterAudit).toHaveLength(beforeAudit.length + 1);
      expect(afterAudit.filter((entry) => entry.event === "governance.backup.verify")).toHaveLength(
        beforeAudit.filter((entry) => entry.event === "governance.backup.verify").length + 1
      );
      expect(afterAudit.filter((entry) => entry.event === "governance.backup.restore")).toHaveLength(
        beforeAudit.filter((entry) => entry.event === "governance.backup.restore").length
      );
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      vi.resetModules();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
    }
  });
});
