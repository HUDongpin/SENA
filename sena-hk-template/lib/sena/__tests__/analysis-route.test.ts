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

const analysisRouteTestTimeoutMs = 30_000;

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
  it("persists an analysis run with project and artifact provenance headers", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-route-"));
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
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Analysis Reviewer",
        email: "analysis-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Analysis Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);

      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId: registered.context.teams[0].id,
          title: "Route Persisted Analysis",
          description: "Created by the analysis route test.",
          snapshot: analysisRouteSnapshot(),
          codingReliability: forgedClientCodingReliability(),
          persist: true,
          includeRuntimeBundle: true
        })
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as {
        schemaVersion?: string;
        provenanceEnvelope?: {
          schemaVersion?: string;
          norm_rule?: string;
          direction?: string;
          deg_convention?: string;
          Phi?: string;
          delta?: string;
          d?: number | null;
          metric_exact?: boolean;
          operator_conventions?: {
            self_loops?: string;
            zero_degree?: string;
            directed?: string;
          };
          dataset_version?: string;
          dataset_content_hash?: string;
          codebook_version?: string;
          model_card?: {
            schemaVersion?: string;
            renderGateStatus?: string;
          };
        };
        enterpriseAnalysisRun?: {
          id?: string;
          sourceKind?: string;
          persistedProjectId?: string;
          artifactFingerprints?: {
            reportSha256?: string;
            projectSnapshotSha256?: string;
            runtimeBundleSha256?: string;
          };
        };
        persistedProject?: {
          id?: string;
          currentVersion?: number;
        };
        report?: {
          codingReliabilityGate?: {
            machineClaimEligibility?: { eligible?: boolean; blockers?: string[] };
            review?: { machineEvidence?: unknown };
          };
        };
      };
      expect(body.schemaVersion).toBe("sena-analysis-run/v1");
      expect(body.provenanceEnvelope).toEqual(expect.objectContaining({
        schemaVersion: "sena-analysis-provenance-envelope/v1",
        norm_rule: "max",
        direction: "directed",
        deg_convention: "row-sum",
        Phi: "classical_mds",
        delta: "shortest_path_reciprocal_weight",
        d: 2,
        operator_conventions: {
          self_loops: "diagonal-zero-no-self-loops",
          zero_degree: "retain-I0; restrict_v_plus, zero_inverse, epsilon_regularized documented",
          directed: "directed row-sum with out-degree random-walk diagnostics unless symmetrization is declared"
        },
        dataset_content_hash: expect.stringMatching(/^0x[a-f0-9]{8}$/)
      }));
      expect(body.provenanceEnvelope?.model_card).toEqual(expect.objectContaining({
        schemaVersion: "sena-model-card/v2",
        renderGateStatus: expect.any(String)
      }));
      expect(body.enterpriseAnalysisRun?.sourceKind).toBe("snapshot");
      expect(body.enterpriseAnalysisRun?.persistedProjectId).toBe(body.persistedProject?.id);
      expect(body.enterpriseAnalysisRun?.artifactFingerprints?.reportSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.enterpriseAnalysisRun?.artifactFingerprints?.projectSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.enterpriseAnalysisRun?.artifactFingerprints?.runtimeBundleSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-analysis-run-id")).toBe(body.enterpriseAnalysisRun?.id);
      expect(response.headers.get("x-sena-analysis-source-kind")).toBe("snapshot");
      expect(response.headers.get("x-sena-project-id")).toBe(body.persistedProject?.id);
      expect(response.headers.get("x-sena-project-version")).toBe(String(body.persistedProject?.currentVersion));
      expect(response.headers.get("x-sena-report-sha256")).toBe(body.enterpriseAnalysisRun?.artifactFingerprints?.reportSha256);
      expect(response.headers.get("x-sena-project-snapshot-sha256")).toBe(body.enterpriseAnalysisRun?.artifactFingerprints?.projectSnapshotSha256);
      expect(response.headers.get("x-sena-runtime-bundle-sha256")).toBe(body.enterpriseAnalysisRun?.artifactFingerprints?.runtimeBundleSha256);
      expect(body.report?.codingReliabilityGate?.machineClaimEligibility?.eligible).toBe(false);
      expect(body.report?.codingReliabilityGate?.machineClaimEligibility?.blockers)
        .toContain("current-v2-reliability-dashboard-required");
      expect(body.report?.codingReliabilityGate?.review?.machineEvidence).toBeUndefined();
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);

  it("queues project-scoped analysis runs for the configured server job queue", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    const queueRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      queueRequests.push({
        url: String(input),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response("", { status: 202 });
    }));
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
      const registered = enterprise.registerEnterpriseUser({
        name: "Analysis Queue Reviewer",
        email: "analysis-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Analysis Queue Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Queued Analysis Project",
        snapshot: analysisRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          projectId: project.id,
          queue: true,
          description: "Managed queue description",
          codingReliability: forgedClientCodingReliability(),
          includeRuntimeBundle: true
        })
      }));

      expect(response.status).toBe(202);
      const body = await response.json() as {
        schemaVersion?: string;
        id?: string;
        kind?: string;
        status?: string;
        teamId?: string;
        projectId?: string;
        payloadSha256?: string;
        payloadSummary?: {
          source?: string;
          projectVersion?: number;
          includeRuntimeBundle?: boolean;
          commandEnvelopeUploadId?: string;
          commandEnvelopeSha256?: string;
          payloadValuesExcluded?: boolean;
        };
        provider?: {
          schemaVersion?: string;
          mode?: string;
          configured?: boolean;
          productionReady?: boolean;
          endpointHash?: string;
          secretConfigured?: boolean;
        };
        worker?: {
          expectedAction?: string;
          payloadDelivery?: string;
          execution?: string;
          statusCallback?: string;
        };
        lifecycle?: {
          attempts?: number;
          maxAttempts?: number;
          retryable?: boolean;
        };
        redaction?: {
          payloadValuesExcluded?: boolean;
          secretValuesExcluded?: boolean;
        };
        delivery?: {
          webhookStatus?: string;
          httpStatus?: number;
          endpointHash?: string;
        };
      };
      expect(body.schemaVersion).toBe("sena-enterprise-server-job/v2");
      expect(body.kind).toBe("analysis");
      expect(body.status).toBe("queued");
      expect(body.teamId).toBe(project.teamId);
      expect(body.projectId).toBe(project.id);
      expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.payloadSummary).toEqual(expect.objectContaining({
        source: "project",
        projectVersion: project.currentVersion,
        includeRuntimeBundle: true,
        commandEnvelopeUploadId: expect.stringMatching(/^upload_/),
        commandEnvelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        payloadValuesExcluded: true
      }));
      expect(body.provider).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-server-job-queue/v1",
        mode: "managed",
        configured: true,
        productionReady: true,
        secretConfigured: true,
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(body.worker).toEqual(expect.objectContaining({
        expectedAction: "run-analysis",
        payloadDelivery: "project-pointer",
        execution: "external-worker-required",
        statusCallback: "/api/sena/ops/jobs"
      }));
      expect(body.lifecycle).toEqual(expect.objectContaining({
        attempts: 0,
        maxAttempts: 3,
        retryable: false
      }));
      expect(body.redaction).toEqual(expect.objectContaining({
        payloadValuesExcluded: true,
        secretValuesExcluded: true
      }));
      expect(body.delivery).toEqual(expect.objectContaining({
        webhookStatus: "delivered",
        httpStatus: 202,
        endpointHash: body.provider?.endpointHash
      }));
      expect(response.headers.get("x-sena-server-job-id")).toBe(body.id);
      expect(response.headers.get("x-sena-server-job-kind")).toBe("analysis");
      expect(response.headers.get("x-sena-server-job-status")).toBe("queued");
      expect(response.headers.get("x-sena-job-queue-provider")).toBe("managed");
      expect(response.headers.get("x-sena-job-payload-sha256")).toBe(body.payloadSha256);
      expect(response.headers.get("x-sena-job-queue-delivery")).toBe("delivered");
      expect(response.headers.get("x-sena-job-queue-http-status")).toBe("202");
      expect(queueRequests).toHaveLength(1);
      expect(queueRequests[0].url).toBe("https://jobs.example.test/sena");
      expect(queueRequests[0].headers["x-sena-webhook-event"]).toBe("server_job.queue");
      expect(queueRequests[0].headers["x-sena-server-job-id"]).toBe(body.id);
      expect(queueRequests[0].headers["x-sena-server-job-kind"]).toBe("analysis");
      expect(queueRequests[0].headers["x-sena-job-payload-sha256"])
        .toBe(createHash("sha256").update(queueRequests[0].body).digest("hex"));
      expect(queueRequests[0].headers["x-sena-worker-payload-sha256"]).toBe(body.payloadSha256);
      const queueTimestamp = queueRequests[0].headers["x-sena-webhook-timestamp"];
      expect(queueRequests[0].headers["x-sena-webhook-signature"])
        .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${queueTimestamp}.${queueRequests[0].body}`).digest("hex")}`);
      const queuePayload = JSON.parse(queueRequests[0].body) as {
        schemaVersion?: string;
        job?: { id?: string; delivery?: unknown; payloadSha256?: string };
        workerPayload?: {
          action?: string;
          projectId?: string;
          description?: string;
          includeRuntimeBundle?: boolean;
          codingReliability?: { machineEvidence?: unknown };
          inlineSnapshot?: unknown;
          inlineDataset?: unknown;
        };
        delivery?: { workerPayloadSha256?: string; secretConfigured?: boolean };
        redaction?: { responsePayloadValuesExcluded?: boolean; auditPayloadValuesExcluded?: boolean };
      };
      expect(queuePayload.schemaVersion).toBe("sena-enterprise-server-job-queue-webhook/v2");
      expect(queuePayload.job).toEqual(expect.objectContaining({
        id: body.id,
        payloadSha256: body.payloadSha256
      }));
      expect(queuePayload.job?.delivery).toBeUndefined();
      expect(queuePayload.workerPayload).toEqual(expect.objectContaining({
        action: "run-analysis",
        projectId: project.id,
        description: "Managed queue description",
        includeRuntimeBundle: true
      }));
      expect(queuePayload.workerPayload?.inlineSnapshot).toBeUndefined();
      expect(queuePayload.workerPayload?.inlineDataset).toBeUndefined();
      expect(queuePayload.workerPayload?.codingReliability?.machineEvidence).toBeUndefined();
      expect(queuePayload.delivery).toEqual(expect.objectContaining({
        workerPayloadSha256: body.payloadSha256,
        secretConfigured: true
      }));
      expect(queuePayload.redaction).toEqual(expect.objectContaining({
        responsePayloadValuesExcluded: true,
        auditPayloadValuesExcluded: true
      }));

      const audit = enterprise.listEnterpriseAuditLog(registered.context, {
        event: "analysis.queue",
        projectId: project.id,
        limit: 5
      });
      expect(audit.events[0]).toEqual(expect.objectContaining({
        projectId: project.id,
        teamId: project.teamId
      }));
      expect(audit.events[0].detail).toEqual(expect.objectContaining({
        serverJobId: body.id,
        serverJobKind: "analysis",
        queueProvider: "managed",
        queueDelivery: "delivered",
        queueHttpStatus: 202,
        queueProductionReady: true,
        payloadSha256: body.payloadSha256,
        source: "project",
        inlinePayloadAllowed: false,
        projectVersion: project.currentVersion
      }));
      const jobs = await enterprise.listEnterpriseServerJobs({
        projectId: project.id
      });
      expect(jobs.summary).toEqual(expect.objectContaining({
        total: 1,
        queued: 1
      }));
      expect(jobs.jobs[0]).toEqual(expect.objectContaining({
        id: body.id,
        status: "queued",
        payloadSha256: body.payloadSha256
      }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_URL;
      delete process.env.SENA_JOB_QUEUE_SECRET;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);

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
          currentVersion: updatedProject.currentVersion,
          title: updatedProject.title,
          description: updatedProject.description
        })
      );
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);

  it("requires the async queue for heavy analysis when the production performance path is enabled", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-required-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS = "1";
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
      const registered = enterprise.registerEnterpriseUser({
        name: "Required Queue Analysis Reviewer",
        email: "analysis-required-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Required Queue Analysis Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Required Queue Analysis Project",
        snapshot: analysisRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          includeRuntimeBundle: true
        })
      }));

      expect(response.status).toBe(503);
      const body = await response.json() as { code?: string; error?: string };
      expect(body.code).toBe("server_job_queue_not_configured");
      expect(body.error).toContain("server job queue is not configured");
      const jobs = await enterprise.listEnterpriseServerJobs({ projectId: project.id });
      expect(jobs.summary.total).toBe(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_REQUIRE_ASYNC_HEAVY_JOBS;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);

  it("rejects local queue receipts when the production performance path requires an external worker queue", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-production-local-queue-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
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
      const registered = enterprise.registerEnterpriseUser({
        name: "Production Queue Analysis Reviewer",
        email: "analysis-production-queue-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Production Queue Analysis Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Production Queue Analysis Project",
        snapshot: analysisRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          includeRuntimeBundle: true
        })
      }));

      expect(response.status).toBe(503);
      const body = await response.json() as { code?: string; error?: string };
      expect(body.code).toBe("server_job_queue_production_provider_required");
      expect(body.error).toContain("managed or webhook provider");
      const jobs = await enterprise.listEnterpriseServerJobs({ projectId: project.id });
      expect(jobs.summary.total).toBe(0);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);

  it("persists project-scoped analysis updates through Postgres primary state when SENA_ENTERPRISE_STATE_STORE=postgres", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-analysis-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    const poolOptions: unknown[] = [];
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        constructor(options: unknown) {
          poolOptions.push(options);
        }

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
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Analysis Reviewer",
        email: "postgres-analysis-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Analysis Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Postgres Analysis Source",
        snapshot: analysisRouteSnapshot()
      });

      const route = await import("../../../app/api/sena/analyze/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          projectId: project.id,
          title: "Postgres Analysis Updated",
          persist: true,
          updateProject: true,
          expectedVersion: 1,
          includeRuntimeBundle: true
        })
      }));
      const body = await response.json() as {
        enterpriseAnalysisRun?: { id?: string; projectId?: string; persistedProjectId?: string };
        persistedProject?: { id?: string; currentVersion?: number };
      };

      expect(response.status).toBe(200);
      expect(body.persistedProject?.id).toBe(project.id);
      expect(body.persistedProject?.currentVersion).toBe(2);
      expect(response.headers.get("x-sena-project-id")).toBe(project.id);
      expect(response.headers.get("x-sena-project-version")).toBe("2");
      expect(poolOptions[0]).toEqual(expect.objectContaining({
        connectionString: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
      }));
      expect(pg.state?.payload.projects.find((candidate) => candidate.id === project.id)?.currentVersion).toBe(2);
      expect(pg.state?.payload.analysisRuns.map((run) => run.id)).toContain(body.enterpriseAnalysisRun?.id);
      expect(pg.analysisRuns.map((run) => run.id)).toContain(body.enterpriseAnalysisRun?.id);

      const queueResponse = await route.POST(new Request("https://sena.example.test/api/sena/analyze", {
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
          expectedVersion: 2,
          title: "Postgres Queued Analysis Updated",
          description: "Postgres retained the encrypted queued command.",
          buildOptions: { alpha: 0.5 },
          humanReview: {
            status: "human-reviewed",
            reviewer: "Postgres queued reviewer",
            interpretation: "Postgres queue command parity.",
            limitations: "Fixture only.",
            nextActions: "Verify the primary-state result."
          },
          includeRuntimeBundle: false
        })
      }));
      const queueReceipt = await queueResponse.json() as {
        id?: string;
        payloadSummary?: Record<string, unknown>;
      };
      expect(queueResponse.status).toBe(202);
      expect(queueReceipt.payloadSummary).toEqual(expect.objectContaining({
        commandEnvelopeUploadId: expect.stringMatching(/^upload_/),
        commandEnvelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      const workerRuntime = await import("../enterprise/server-job-worker-runtime");
      const queueDrain = await workerRuntime.drainEnterpriseServerJobQueue({ limit: 10 });
      expect(queueDrain.outcomes.find((outcome) => outcome.jobId === queueReceipt.id)).toEqual(
        expect.objectContaining({ status: "succeeded", attempts: 1 })
      );
      const queuedProject = await enterprise.getEnterpriseProjectAsync(registered.context, project.id);
      expect(queuedProject).toEqual(expect.objectContaining({
        currentVersion: 3,
        title: "Postgres Queued Analysis Updated",
        description: "Postgres retained the encrypted queued command."
      }));
      expect((queuedProject.snapshot as Record<string, any>).reproducibility.buildOptions.alpha).toBe(0.5);
      expect(pg.state?.payload.projects.find((candidate) => candidate.id === project.id)?.currentVersion).toBe(3);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/analyze?projectId=${project.id}`));
      const listBody = await listResponse.json() as {
        analysisRuns?: Array<{ id?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listBody.analysisRuns?.map((run) => run.id)).toContain(body.enterpriseAnalysisRun?.id);

      const fileBackedProjects = enterprise.readEnterpriseDb().projects;
      expect(fileBackedProjects.map((candidate: { id: string }) => candidate.id)).not.toContain(project.id);
      expect(JSON.stringify({ body, listBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ body, listBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, analysisRouteTestTimeoutMs);
});
