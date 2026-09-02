import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let enterpriseDbDir: string | undefined;

afterEach(() => {
  if (enterpriseDbDir) rmSync(enterpriseDbDir, { recursive: true, force: true });
  enterpriseDbDir = undefined;
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  vi.resetModules();
});

describe("enterprise worker-effect idempotency", () => {
  it("reuses one import, analysis, reliability, project, and revision effect for one job key", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-execution-idempotency-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.resetModules();

    const enterprise = await import("../enterprise");
    const index = await import("../index");
    const importAnalysis = await import("../enterprise/import-analysis");
    const importAdapters = await import("../import-adapters");
    const reliabilityRuns = await import("../enterprise/reliability-runs");
    const teamProject = await import("../enterprise/team-project");
    const teamCollaboration = await import("../enterprise/team-collaboration");
    const reliability = await import("../reliability");
    const registered = enterprise.registerEnterpriseUser({
      name: "Execution Idempotency Owner",
      email: "execution-idempotency@example.edu",
      password: "sena-secure-123",
      organization: "Execution Idempotency Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const imported = index.importSenaJsonContract(index.lessonStudySenaContract);
    const contractText = JSON.stringify(index.lessonStudySenaContract);
    const enterpriseImported = await importAdapters.importSenaEnterpriseFiles([{
      name: "contract.json",
      text: async () => contractText,
      arrayBuffer: async () => Uint8Array.from(Buffer.from(contractText, "utf8")).buffer
    }]);
    const createdAt = "2026-08-28T00:00:00.000Z";

    const importInput = {
      teamId,
      uploadIds: ["upload_aaaaaaaaaaaaaaaaaaaaaaaa"],
      sources: enterpriseImported.sources,
      warnings: enterpriseImported.warnings,
      dataset: imported.dataset,
      cleaningManifest: enterpriseImported.cleaningManifest,
      executionIdempotency: { key: "server_job_import_effect", createdAt }
    };
    const firstImport = await importAnalysis.createEnterpriseImportRunWithPostgresMirrorAsync(
      registered.context,
      importInput
    );
    const repeatedImport = await importAnalysis.createEnterpriseImportRunWithPostgresMirrorAsync(
      registered.context,
      importInput
    );
    expect(repeatedImport.id).toBe(firstImport.id);
    expect(await importAnalysis.listEnterpriseImportRunsAsync(registered.context, teamId)).toHaveLength(1);

    const analysisArtifact = index.buildSenaAnalysisRun({
      sourceKind: "dataset",
      dataset: imported.dataset,
      title: "Idempotent analysis",
      generatedAt: createdAt
    });
    const analysisInput = {
      teamId,
      run: analysisArtifact,
      executionIdempotency: { key: "server_job_analysis_effect", createdAt }
    };
    const firstAnalysis = await importAnalysis.createEnterpriseAnalysisRunWithPostgresMirrorAsync(
      registered.context,
      analysisInput
    );
    const repeatedAnalysis = await importAnalysis.createEnterpriseAnalysisRunWithPostgresMirrorAsync(
      registered.context,
      analysisInput
    );
    expect(repeatedAnalysis.id).toBe(firstAnalysis.id);
    expect(await importAnalysis.listEnterpriseAnalysisRunsAsync(registered.context, { teamId })).toHaveLength(1);

    const annotations = [
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true }
    ];
    const dashboard = reliability.buildSenaReliabilityDashboard(annotations);
    const reliabilityInput = {
      teamId,
      reviewer: "Execution reviewer",
      fileCount: 1,
      annotationCount: annotations.length,
      annotations,
      inputFiles: [{ name: "annotations.csv", size: 10, sha256: "b".repeat(64) }],
      dashboard,
      reviewPatch: reliability.reliabilityDashboardToReview(dashboard, "Execution reviewer"),
      executionIdempotency: { key: "server_job_reliability_effect", createdAt }
    };
    const firstReliability = await reliabilityRuns.createEnterpriseReliabilityRunWithPostgresMirrorAsync(
      registered.context,
      reliabilityInput
    );
    const repeatedReliability = await reliabilityRuns.createEnterpriseReliabilityRunWithPostgresMirrorAsync(
      registered.context,
      reliabilityInput
    );
    expect(repeatedReliability.id).toBe(firstReliability.id);
    expect(await reliabilityRuns.listEnterpriseReliabilityRunsAsync(registered.context, { teamId })).toHaveLength(1);
    await expect(reliabilityRuns.createEnterpriseReliabilityRunWithPostgresMirrorAsync(
      registered.context,
      { ...reliabilityInput, reviewer: "Different reviewer" }
    )).rejects.toMatchObject({ status: 409, code: "reliability_execution_idempotency_conflict" });

    const projectInput = {
      teamId,
      title: "Idempotent project",
      snapshot: analysisArtifact.projectSnapshot,
      executionIdempotency: { key: "server_job_project_effect", createdAt }
    };
    const firstProject = await teamProject.createEnterpriseProjectAsync(registered.context, projectInput);
    const repeatedProject = await teamProject.createEnterpriseProjectAsync(registered.context, projectInput);
    expect(repeatedProject.id).toBe(firstProject.id);
    const updated = await teamProject.updateEnterpriseProjectAsync(registered.context, firstProject.id, {
      expectedVersion: firstProject.currentVersion,
      description: "One deterministic update",
      snapshot: analysisArtifact.projectSnapshot,
      executionIdempotency: { key: "server_job_project_update_effect", createdAt: "2026-08-28T00:01:00.000Z" }
    });
    const replayedUpdate = await teamProject.updateEnterpriseProjectAsync(registered.context, firstProject.id, {
      expectedVersion: firstProject.currentVersion,
      description: "One deterministic update",
      snapshot: analysisArtifact.projectSnapshot,
      executionIdempotency: { key: "server_job_project_update_effect", createdAt: "2026-08-28T00:01:00.000Z" }
    });
    expect(replayedUpdate.currentVersion).toBe(updated.currentVersion);
    const collaboration = await teamCollaboration.listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(
      registered.context,
      firstProject.id
    );
    expect(collaboration.revisions).toHaveLength(2);

    const audits = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
    expect(audits.filter((event) => event.event === "import.run")).toHaveLength(1);
    expect(audits.filter((event) => event.event === "analysis.run")).toHaveLength(1);
    expect(audits.filter((event) => event.event === "reliability.run")).toHaveLength(1);
    expect(audits.filter((event) => event.event === "project.create" && event.projectId === firstProject.id)).toHaveLength(1);
    expect(audits.filter((event) => event.event === "project.update" && event.projectId === firstProject.id)).toHaveLength(1);
  });
});
