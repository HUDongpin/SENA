import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";


// TODO: stopgap ceiling. Measured 126995ms against a 120s limit on 2026-10-18.
// 1.5x that measurement is 191s. This file is the one replay case; the other
// analyze-route cases stay in analysis-route.test.ts at 30s.
const analysisRouteReplayTimeoutMs = 191_000;

function analysisRouteSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Route Analysis Source",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route analysis test",
      interpretation: "Analysis route provenance test.",
      limitations: "Fixture only.",
      nextActions: "Attach analysis route headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route analysis test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
      agreementValue: "pending",
      adjudicationNotes: "Pending route test evidence.",
      limitations: "Fixture only."
    }
  });
}

function forgedClientCodingReliability() {
  return {
    status: "documented",
    reviewer: "Untrusted client",
    codingScheme: "Client supplied",
    unitOfCoding: "item-code units",
    coderCount: 2,
    agreementMetric: "kappa and alpha",
    agreementValue: "1",
    adjudicationNotes: "Client supplied",
    limitations: "Client supplied",
    machineEvidence: {
      dashboardSchemaVersion: "sena-coding-reliability-dashboard/v2",
      sourceSchemaVersion: "sena-coding-reliability-dashboard/v2",
      status: "estimable",
      meanPairwiseKappaStatus: "estimable",
      meanPairwiseKappa: 1,
      krippendorffAlphaNominalStatus: "estimable",
      krippendorffAlphaNominal: 1,
      allPairwiseKappaEstimable: true,
      claimEligibility: { eligible: true }
    }
  };
}

describe("SENA analyze route", () => {
  it("replays every admitted analysis control through the local queue for updates and creates", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-local-command-custody-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const workerRuntime = await import("../enterprise/server-job-worker-runtime");
      const registered = enterprise.registerEnterpriseUser({
        name: "Local Analysis Queue Reviewer",
        email: "local-analysis-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Local Analysis Queue Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Local Queue Source",
        description: "Original description",
        snapshot: analysisRouteSnapshot()
      });
      const route = await import("../../../app/api/sena/analyze/route");
      const controls = {
        buildOptions: { alpha: 0.5 },
        humanReview: {
          status: "human-reviewed",
          reviewer: "Queued human reviewer",
          interpretation: "The queued interpretation must survive encrypted command custody.",
          limitations: "Queue parity fixture only.",
          nextActions: "Compare synchronous and queued artifacts."
        },
        codingReliability: {
          status: "not-documented",
          reviewer: "Queued reliability reviewer",
          codingScheme: "Queue parity fixture",
          unitOfCoding: "coded_segments",
          coderCount: 2,
          agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
          agreementValue: "pending",
          adjudicationNotes: "Pending queue parity evidence.",
          limitations: "Queue parity fixture only."
        },
        dataGovernance: {
          irbApprovalId: "IRB-QUEUE-PARITY-2026",
          consentScope: "Consented queue parity fixture",
          retentionPolicy: "Delete after fixture verification",
          dataSteward: "Queue Parity Steward",
          reviewedAt: "2026-08-26T00:00:00.000Z"
        }
      };

      const updateResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          persist: true,
          updateProject: true,
          expectedVersion: project.currentVersion,
          title: "Local Queue Updated",
          description: "Updated through the queued command envelope.",
          includeRuntimeBundle: false,
          ...controls
        })
      }));
      const updateReceipt = await updateResponse.json() as {
        id?: string;
        payloadSummary?: Record<string, unknown>;
      };
      expect(updateResponse.status).toBe(202);
      expect(updateReceipt.payloadSummary).toEqual(expect.objectContaining({
        commandCustody: "encrypted-upload-v1",
        commandEnvelopeUploadId: expect.stringMatching(/^upload_/),
        commandEnvelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        payloadValuesExcluded: true
      }));
      expect(updateReceipt.payloadSummary).not.toHaveProperty("description");
      expect(updateReceipt.payloadSummary).not.toHaveProperty("buildOptions");
      expect(updateReceipt.payloadSummary).not.toHaveProperty("humanReview");
      const updateCommandUpload = enterprise.readEnterpriseDb().uploads.find(
        (upload: { id: string }) => upload.id === updateReceipt.payloadSummary?.commandEnvelopeUploadId
      );
      expect(updateCommandUpload).toEqual(expect.objectContaining({
        importProfile: "analysis-command-envelope",
        storageEncoding: "sena-upload-aes-256-gcm-envelope/v1"
      }));
      expect(readFileSync(
        path.join(enterpriseDbDir, String(updateCommandUpload?.storagePath)),
        "utf8"
      )).not.toContain("Updated through the queued command envelope.");

      const updateDrain = await workerRuntime.drainEnterpriseServerJobQueue({ limit: 10 });
      expect(updateDrain.outcomes.find((outcome) => outcome.jobId === updateReceipt.id)).toEqual(
        expect.objectContaining({ status: "succeeded", attempts: 1 })
      );
      const updatedProject = await enterprise.getEnterpriseProjectAsync(registered.context, project.id);
      const updatedSnapshot = updatedProject.snapshot as Record<string, any>;
      expect(updatedProject).toEqual(expect.objectContaining({
        title: "Local Queue Updated",
        description: "Updated through the queued command envelope.",
        currentVersion: project.currentVersion + 1
      }));
      expect(updatedSnapshot.reproducibility.buildOptions.alpha).toBe(0.5);
      expect(updatedSnapshot.report.humanReview.reviewer).toBe("Queued human reviewer");
      expect(updatedSnapshot.dataGovernance.irbApprovalId).toBe("IRB-QUEUE-PARITY-2026");
      expect(updatedSnapshot.report.codingReliabilityGate.review.reviewer)
        .toBe("Queued reliability reviewer");

      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          persist: true,
          updateProject: false,
          title: "Local Queue Created Copy",
          description: "Created through the queued command envelope.",
          includeRuntimeBundle: false,
          ...controls
        })
      }));
      const createReceipt = await createResponse.json() as { id?: string };
      expect(createResponse.status).toBe(202);
      const createDrain = await workerRuntime.drainEnterpriseServerJobQueue({ limit: 10 });
      const createOutcome = createDrain.outcomes.find((outcome) => outcome.jobId === createReceipt.id);
      expect(createOutcome).toEqual(expect.objectContaining({
        status: "succeeded",
        attempts: 1,
        result: expect.objectContaining({ persistedProjectId: expect.stringMatching(/^project_/) })
      }));
      const createdProjectId = createOutcome?.result?.persistedProjectId;
      expect(createdProjectId).not.toBe(project.id);
      const createdProject = await enterprise.getEnterpriseProjectAsync(
        registered.context,
        String(createdProjectId)
      );
      expect(createdProject).toEqual(expect.objectContaining({
        title: "Local Queue Created Copy",
        description: "Created through the queued command envelope."
      }));

      for (const [field, value] of [
        ["title", "Concurrent local title"],
        ["description", "Concurrent local description"]
      ] as const) {
        const beforeConcurrentUpdate = await enterprise.getEnterpriseProjectAsync(
          registered.context,
          project.id
        );
        const concurrentResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token,
            prefer: "respond-async"
          },
          body: JSON.stringify({
            projectId: project.id,
            queue: true,
            persist: true,
            updateProject: true,
            expectedVersion: beforeConcurrentUpdate.currentVersion,
            includeRuntimeBundle: false
          })
        }));
        const concurrentReceipt = await concurrentResponse.json() as { id?: string };
        expect(concurrentResponse.status).toBe(202);

        const concurrentlyUpdated = await enterprise.updateEnterpriseProjectAsync(
          registered.context,
          project.id,
          {
            expectedVersion: beforeConcurrentUpdate.currentVersion,
            [field]: value
          }
        );
        expect(concurrentlyUpdated.currentVersion).toBe(beforeConcurrentUpdate.currentVersion + 1);

        const concurrentDrain = await workerRuntime.drainEnterpriseServerJobQueue({ limit: 10 });
        expect(concurrentDrain.outcomes.find((outcome) => outcome.jobId === concurrentReceipt.id)).toEqual(
          expect.objectContaining({
            status: "failed",
            attempts: 0,
            retryable: false,
            errorCode: "project_version_conflict"
          })
        );
        await expect(enterprise.getEnterpriseProjectAsync(registered.context, project.id)).resolves.toEqual(
          expect.objectContaining({
            currentVersion: beforeConcurrentUpdate.currentVersion + 1,
            [field]: value
          })
        );
      }

      const projectAfterConcurrentMetadata = await enterprise.getEnterpriseProjectAsync(
        registered.context,
        project.id
      );

      const corruptResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          persist: false,
          title: "Corrupt command must not execute",
          buildOptions: { alpha: 0.5 }
        })
      }));
      const corruptReceipt = await corruptResponse.json() as {
        id?: string;
        payloadSummary?: { commandEnvelopeUploadId?: string };
      };
      expect(corruptResponse.status).toBe(202);
      const corruptUpload = enterprise.readEnterpriseDb().uploads.find(
        (upload: { id: string }) => upload.id === corruptReceipt.payloadSummary?.commandEnvelopeUploadId
      );
      expect(corruptUpload).toBeDefined();
      writeFileSync(path.join(enterpriseDbDir, String(corruptUpload?.storagePath)), "corrupt-envelope");
      const corruptDrain = await workerRuntime.drainEnterpriseServerJobQueue({ limit: 10 });
      expect(corruptDrain.outcomes.find((outcome) => outcome.jobId === corruptReceipt.id)).toEqual(
        expect.objectContaining({
          status: "failed",
          attempts: 0,
          retryable: false,
          errorCode: "server_job_worker_payload_not_reproducible"
        })
      );
      await expect(enterprise.getEnterpriseProjectAsync(registered.context, project.id)).resolves.toEqual(
        expect.objectContaining({
          currentVersion: projectAfterConcurrentMetadata.currentVersion,
          title: projectAfterConcurrentMetadata.title,
          description: projectAfterConcurrentMetadata.description
        })
      );

      const legacySourceTitle = projectAfterConcurrentMetadata.title;
      const legacyDb = enterprise.readEnterpriseDb();
      const legacyRevision = legacyDb.projectRevisions.find(
        (candidate: { projectId: string; version: number }) => (
          candidate.projectId === project.id &&
          candidate.version === projectAfterConcurrentMetadata.currentVersion
        )
      );
      if (!legacyRevision) throw new Error("legacy analysis revision fixture missing");
      delete legacyRevision.title;
      delete legacyRevision.description;
      enterprise.writeEnterpriseDb(legacyDb);

      const legacyRunResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          persist: false,
          includeRuntimeBundle: false
        })
      }));
      const legacyCopyResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          persist: true,
          updateProject: false,
          includeRuntimeBundle: false
        })
      }));
      const legacyReceipts = [legacyRunResponse, legacyCopyResponse];
      expect(legacyReceipts.map((response) => response.status)).toEqual([202, 202]);
      const [legacyRunReceipt, legacyCopyReceipt] = await Promise.all(
        legacyReceipts.map((response) => response.json() as Promise<{ id?: string }>)
      );
      const driftedProject = await enterprise.updateEnterpriseProjectAsync(
        registered.context,
        project.id,
        {
          expectedVersion: projectAfterConcurrentMetadata.currentVersion,
          title: "Title changed after legacy jobs were queued"
        }
      );
      expect(driftedProject.currentVersion).toBe(projectAfterConcurrentMetadata.currentVersion + 1);

      const legacyDrain = await workerRuntime.drainEnterpriseServerJobQueue({ limit: 10 });
      const legacyRunOutcome = legacyDrain.outcomes.find(
        (outcome) => outcome.jobId === legacyRunReceipt.id
      );
      const legacyCopyOutcome = legacyDrain.outcomes.find(
        (outcome) => outcome.jobId === legacyCopyReceipt.id
      );
      expect(legacyRunOutcome).toEqual(expect.objectContaining({
        status: "succeeded",
        result: expect.objectContaining({ analysisRunId: expect.stringMatching(/^analysis_/) })
      }));
      expect(legacyCopyOutcome).toEqual(expect.objectContaining({
        status: "succeeded",
        result: expect.objectContaining({ persistedProjectId: expect.stringMatching(/^project_/) })
      }));
      const importAnalysis = await import("../enterprise/import-analysis");
      const analysisRuns = await importAnalysis.listEnterpriseAnalysisRunsAsync(registered.context, {
        teamId: project.teamId
      });
      expect(analysisRuns.find(
        (run) => run.id === legacyRunOutcome?.result?.analysisRunId
      )?.title).toBe(legacySourceTitle);
      expect(analysisRuns.find(
        (run) => run.id === legacyCopyOutcome?.result?.analysisRunId
      )?.title).toBe(legacySourceTitle);
      await expect(enterprise.getEnterpriseProjectAsync(
        registered.context,
        String(legacyCopyOutcome?.result?.persistedProjectId)
      )).resolves.toEqual(expect.objectContaining({ title: legacySourceTitle }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteReplayTimeoutMs);
});
