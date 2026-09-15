import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "../workflow/canonical";

const postgresUrl = process.env.SENA_WORKFLOW_TEST_POSTGRES_URL;
const describeWithPostgres = postgresUrl ? describe : describe.skip;
const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_MAX_ATTEMPTS"
];

async function createIsolatedPostgresDatabase(baseUrl: string) {
  const name = `sena_evidenceflow_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: baseUrl, max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  const isolated = new URL(baseUrl);
  isolated.pathname = `/${name}`;
  isolated.search = "";
  return {
    url: isolated.toString(),
    async dispose() {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end();
    }
  };
}

describeWithPostgres("SENA EvidenceFlow local shadow pilots", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) rmSync(enterpriseDbDir, { recursive: true, force: true });
    enterpriseDbDir = undefined;
    vi.resetModules();
  });

  it("runs the fixture research graph through real jobs, three digest-bound interrupts, restart recovery, and verified closeout", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-evidenceflow-research-pilot-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_JOB_QUEUE_MAX_ATTEMPTS = "3";
    vi.resetModules();

    const enterprise = await import("../enterprise");
    const index = await import("../index");
    const importAnalysis = await import("../enterprise/import-analysis");
    const projects = await import("../enterprise/team-project");
    const queueWorker = await import("../enterprise/server-job-worker-runtime");
    const workflowApi = await import("../workflow/api-runtime");
    const workflowStoreModule = await import("../workflow/postgres-store");
    const workflowCheckpointer = await import("../workflow/langgraph-compatibility");
    const workflowOperations = await import("../workflow/server-job-operations");
    const workflowNodeExecutor = await import("../workflow/node-executor");
    const workflowWorker = await import("../workflow/worker-runtime");
    const workflowCloseout = await import("../workflow/closeout");
    const enterpriseState = await import("../enterprise/state");

    const registered = enterprise.registerEnterpriseUser({
      name: "EvidenceFlow Fixture Pilot Owner",
      email: `evidenceflow-pilot-${randomUUID()}@example.edu`,
      password: "sena-secure-123",
      organization: "EvidenceFlow Fixture Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const fixtureContract = {
      metadata: {
        datasetVersion: "evidenceflow-fixture-v1",
        consent: {
          instrument: "synthetic-fixture",
          date: "redacted",
          scope: "Local workflow verification only"
        },
        retention: { policy: "Delete after local verification" },
        pseudonymization: { personIdPolicy: "opaque", rosterMapping: "not-stored" },
        codebook: { id: "fixture-codebook", version: "v1", contentHash: "fixture-content-hash" }
      },
      people: [
        { id: "p-1", label: "Participant A1", role: "Teacher", group: "Fixture A", initials: "A1" },
        { id: "p-2", label: "Participant A2", role: "Teacher", group: "Fixture A", initials: "A2" },
        { id: "p-3", label: "Participant B1", role: "Teacher", group: "Fixture B", initials: "B1" },
        { id: "p-4", label: "Participant B2", role: "Teacher", group: "Fixture B", initials: "B2" }
      ],
      interactions: [
        { source: "p-1", target: "p-2", weight: 2, channel: "reply", stage: "Plan", turnIndex: 1 },
        { source: "p-2", target: "p-3", weight: 1, channel: "reply", stage: "Plan", turnIndex: 2 },
        { source: "p-3", target: "p-4", weight: 2, channel: "reply", stage: "Reflect", turnIndex: 3 },
        { source: "p-4", target: "p-1", weight: 1, channel: "reply", stage: "Reflect", turnIndex: 4 }
      ],
      utterances: [
        { id: "u1", personId: "p-1", unitId: "unit-a", stanzaId: "plan-a", stage: "Plan", turnIndex: 1, text: "The question needs observable evidence" },
        { id: "u2", personId: "p-2", unitId: "unit-a", stanzaId: "plan-a", stage: "Plan", turnIndex: 2, text: "The explanation should connect the evidence" },
        { id: "u3", personId: "p-3", unitId: "unit-a", stanzaId: "reflect-a", stage: "Reflect", turnIndex: 3, text: "The evidence changed our explanation" },
        { id: "u4", personId: "p-4", unitId: "unit-a", stanzaId: "reflect-a", stage: "Reflect", turnIndex: 4, text: "We should refine the question" }
      ],
      coded_segments: [
        { segmentId: "s1", utteranceId: "u1", personId: "p-1", unitId: "unit-a", stanzaId: "plan-a", stage: "Plan", turnIndex: 1, text: "question and evidence", codes: ["question", "evidence"], confidence: 1 },
        { segmentId: "s2", utteranceId: "u2", personId: "p-2", unitId: "unit-a", stanzaId: "plan-a", stage: "Plan", turnIndex: 2, text: "evidence and explanation", codes: ["evidence", "explanation"], confidence: 1 },
        { segmentId: "s3", utteranceId: "u3", personId: "p-3", unitId: "unit-a", stanzaId: "reflect-a", stage: "Reflect", turnIndex: 3, text: "evidence changed explanation", codes: ["evidence", "explanation"], confidence: 1 },
        { segmentId: "s4", utteranceId: "u4", personId: "p-4", unitId: "unit-a", stanzaId: "reflect-a", stage: "Reflect", turnIndex: 4, text: "refine question", codes: ["question", "reflection"], confidence: 1 }
      ],
      codebook: [
        { id: "question", label: "Question", family: "Inquiry", description: "Problem framing", color: "#7c3aed" },
        { id: "evidence", label: "Evidence", family: "Inquiry", description: "Evidence use", color: "#0891b2" },
        { id: "explanation", label: "Explanation", family: "Inquiry", description: "Reasoning", color: "#2563eb" },
        { id: "reflection", label: "Reflection", family: "Learning", description: "Reflective change", color: "#db2777" }
      ]
    };
    const imported = index.importSenaJsonContract(fixtureContract);
    const reliability = index.buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
    ]);
    const snapshot = index.buildSenaProjectSnapshot(index.buildSenaModel(imported.dataset), {
      title: "EvidenceFlow fixture research pilot",
      generatedAt: "2026-08-28T01:00:00.000Z",
      sourceDataset: imported.dataset,
      humanReview: {
        status: "human-reviewed",
        reviewer: "Fixture pilot reviewer",
        interpretation: "Synthetic fixture used only to exercise the EvidenceFlow state machine.",
        limitations: "No substantive or institutional claim may be made from this fixture.",
        nextActions: "Repeat with separately approved pseudonymized evidence."
      },
      codingReliability: index.reliabilityDashboardToReview(reliability, "Fixture reliability reviewer"),
      dataGovernance: {
        irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
        consentScope: "Bundled synthetic lesson-study fixture for local workflow verification only.",
        retentionPolicy: "Delete temporary workflow state after verification.",
        usageConstraints: ["fixture only", "no research maturity claim"],
        dataSteward: "Fixture pilot steward"
      }
    });
    const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
      teamId,
      title: "EvidenceFlow fixture research pilot",
      snapshot
    });
    const revision = await projects.getEnterpriseProjectRevisionSourceReadOnlyAsync(
      registered.context,
      project.id,
      project.currentVersion
    );
    const uploads = await importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(registered.context, {
      teamId,
      files: [{
        name: "evidenceflow-fixture-source.json",
        contentType: "application/json",
        bytes: Buffer.from(JSON.stringify(fixtureContract), "utf8"),
        importProfile: "sena-json-contract"
      }, {
        name: "evidenceflow-fixture-reliability.csv",
        contentType: "text/csv",
        bytes: Buffer.from([
          "coder_id,item_id,code_id,value",
          "c1,u1,evidence,1",
          "c2,u1,evidence,1",
          "c1,u2,evidence,0",
          "c2,u2,evidence,0"
        ].join("\n"), "utf8"),
        importProfile: "reliability"
      }]
    });

    const isolatedPostgres = await createIsolatedPostgresDatabase(postgresUrl!);
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = isolatedPostgres.url;
    const pool = new Pool({ connectionString: isolatedPostgres.url, max: 8 });
    const store = workflowStoreModule.createSenaWorkflowPostgresStore({ pool });
    const checkpointer = workflowCheckpointer.createEvidenceFlowPostgresSaver(isolatedPostgres.url);
    try {
      await store.ensureSchema();
      await checkpointer.setup();
      const created = await workflowApi.createSenaWorkflowRun({
        context: registered.context,
        body: {
          kind: "research-evidence",
          teamId,
          projectId: project.id,
          projectRevisionId: revision.revision.id,
          parameters: {
            researchSourceClass: "fixture",
            importUploadIds: [uploads[0].id],
            reliabilityUploadIds: [uploads[1].id],
            validation: {
              groupField: "group",
              groupA: "Fixture A",
              groupB: "Fixture B",
              metric: "bridgeScore",
              iterations: 100,
              bootstrapIterations: 100,
              alpha: 0.05,
              seed: 20260828,
              suite: false
            },
            publicationFormat: "package"
          }
        },
        idempotencyKey: `research-pilot-${randomUUID()}`,
        codeSha: "a".repeat(40),
        idFactory: randomUUID,
        store
      });
      const operations = workflowOperations.createSenaWorkflowServerJobOperationAdapter({ store });
      const nodeExecutor = workflowNodeExecutor.createSenaWorkflowGraphNodeExecutor({ store, operations });
      let workerError: unknown;
      const makeWorker = (workerId: string) => workflowWorker.createSenaWorkflowWorkerRuntime({
        store,
        checkpointer,
        nodeExecutor,
        workerId,
        workerBuildAttestation: (() => {
          const core = {
            codeSha: "a".repeat(40),
            treeSha: "b".repeat(40),
            source: "git-object-measurement" as const,
            clean: true as const
          };
          return { ...core, attestationDigest: senaWorkflowDigest(core) };
        })(),
        maxAttempts: 3,
        onError(error) {
          workerError = error;
        }
      });
      let worker = makeWorker("research-pilot-worker-a");

      expect(created.run.createdByUserId).toBe(registered.context.user.id);
      expect(uploads.map((upload) => upload.scanStatus)).toEqual(["passed", "passed"]);
      const startSourceEvidence = (await store.runEvents(created.run.id, teamId)).commands[0]
        .payload.sourceEvidence as Record<string, unknown>;
      expect(startSourceEvidence).toMatchObject({
        researchSourceClass: "fixture",
        uploadBindings: {
          import: [expect.objectContaining({ id: uploads[0].id, scanStatus: "passed" })],
          reliability: [expect.objectContaining({ id: uploads[1].id, scanStatus: "passed" })]
        }
      });
      expect((await enterpriseState.readEnterpriseState()).db.users.some(
        (user) => user.id === created.run.createdByUserId
      )).toBe(true);

      const approvePending = async (sequence: number) => {
        const run = await store.getRun(created.run.id, teamId);
        expect(run?.status).toBe("waiting_human");
        const pending = run?.pendingInterrupt;
        if (!run || pending?.kind !== "waiting-human") throw new Error("Expected a human EvidenceFlow interrupt.");
        const decisionDigest = workflowApi.senaWorkflowDecisionDigest({
          runId: run.id,
          nodeId: pending.nodeId,
          interruptId: pending.interruptId,
          inputDigest: pending.inputDigest,
          candidateOutputDigest: pending.candidateOutputDigest,
          decision: "approve"
        });
        await workflowApi.performSenaWorkflowAction({
          context: registered.context,
          runId: run.id,
          body: {
            action: "approve",
            expectedVersion: run.version,
            interruptId: pending.interruptId,
            decisionDigest
          },
          idempotencyKey: `research-pilot-approval-${sequence}-${randomUUID()}`,
          store
        });
        return worker.runOnce();
      };
      const completePendingJob = async (expectedNodeId: string) => {
        const before = await store.getRun(created.run.id, teamId);
        expect(before).toMatchObject({ status: "waiting_job", currentNodeId: expectedNodeId });
        const drain = await queueWorker.drainEnterpriseServerJobQueue({ limit: 1, teamId });
        expect(drain).toMatchObject({ succeeded: 1, failed: 0 });
        const result = await worker.runOnce();
        expect(result, workerError instanceof Error ? workerError.message : JSON.stringify(result)).toMatchObject({
          status: "processed"
        });
        return result;
      };

      const started = await worker.runOnce();
      expect(started, started.status === "processed"
        ? JSON.stringify(started.run.blockers)
        : workerError instanceof Error ? workerError.message : String(workerError)).toMatchObject({
        status: "processed",
        run: { status: "waiting_human" }
      });
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("data-governance-preflight");

      const afterGovernance = await approvePending(1);
      expect(afterGovernance).toMatchObject({ status: "processed", run: { status: "waiting_job" } });
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("import-cleaning");

      await completePendingJob("import-cleaning");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("fusion-analysis");

      worker = makeWorker("research-pilot-worker-restarted");
      await completePendingJob("fusion-analysis");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("coding-reliability");

      await completePendingJob("coding-reliability");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("adjudication-gate");

      await approvePending(2);
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("statistical-validation");

      await completePendingJob("statistical-validation");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("expert-review-gate");

      await approvePending(3);
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("publication-export");

      const finished = await completePendingJob("publication-export");
      expect(finished).toMatchObject({ status: "processed", run: { status: "succeeded" } });

      const events = await store.runEvents(created.run.id, teamId);
      expect(events.run).toMatchObject({
        status: "succeeded",
        researchSourceClass: "fixture",
        claimBoundary: "exploratory-only",
        evidenceLayers: {
          source: "passed",
          local: "passed",
          ci: "not-run",
          merged: "not-run",
          deployed: "not-run",
          live: "not-run"
        }
      });
      expect(events.receipts.map((receipt) => receipt.nodeId)).toHaveLength(20);
      expect(events.approvals.map((approval) => approval.nodeId)).toEqual([
        "data-governance-preflight",
        "adjudication-gate",
        "expert-review-gate"
      ]);
      expect(events.artifacts.map((artifact) => artifact.nodeId).sort()).toEqual([
        "coding-reliability",
        "evidence-closeout",
        "fusion-analysis",
        "import-cleaning",
        "publication-export",
        "statistical-validation"
      ]);
      expect(events.commands.every((command) => command.status === "completed")).toBe(true);
      const closeout = workflowCloseout.buildSenaWorkflowCloseout({
        ...events,
        generatedAt: "2026-08-28T02:00:00.000Z"
      });
      expect(closeout).toMatchObject({
        workflowStatus: "succeeded",
        claimBoundary: "exploratory-only",
        auditChain: { status: "verified", receiptCount: 20 },
        evidenceBoundary: { externalGitOrDeploymentSideEffects: "none" }
      });
      expect(JSON.stringify(closeout)).not.toContain("coder_id,item_id");
      expect(JSON.stringify(closeout)).not.toContain("What evidence would tell us");
    } finally {
      await checkpointer.end().catch(() => undefined);
      await pool.end();
      await isolatedPostgres.dispose();
    }
  }, 120_000);

  it("runs the fixture engineering graph through exact-SHA gates without external side effects", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-evidenceflow-engineering-pilot-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.resetModules();

    const enterprise = await import("../enterprise");
    const schema = await import("../schema-registry");
    const canonical = await import("../workflow/canonical");
    const workflowApi = await import("../workflow/api-runtime");
    const workflowStoreModule = await import("../workflow/postgres-store");
    const workflowCheckpointer = await import("../workflow/langgraph-compatibility");
    const workflowOperations = await import("../workflow/server-job-operations");
    const workflowNodeExecutor = await import("../workflow/node-executor");
    const workflowWorker = await import("../workflow/worker-runtime");
    const workflowCloseout = await import("../workflow/closeout");

    const registered = enterprise.registerEnterpriseUser({
      name: "EvidenceFlow Engineering Pilot Owner",
      email: `evidenceflow-engineering-${randomUUID()}@example.edu`,
      password: "sena-secure-123",
      organization: "EvidenceFlow Fixture Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const repo = "HUDongpin/SENA-Fixture";
    const baseSha = "b".repeat(40);
    const candidateSha = "c".repeat(40);
    const workRequestDigest = "d".repeat(64);
    const branch = "codex/sena-evidenceflow-fixture-pilot";
    const changedPaths = ["fixture/workflow-proof.ts"];
    const parameters = {
      engineeringEvidence: {
        ownerLane: "A11",
        branch,
        worktreePathHash: "e".repeat(64),
        allowedPaths: changedPaths,
        targetKind: "fixture-repository",
        repositoryPreflight: {
          schemaVersion: schema.SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight,
          repo,
          baseSha,
          liveMainSha: baseSha,
          governanceRegistryDigest: "f".repeat(64),
          checkedAt: "2026-08-28T03:00:00.000Z",
          featureWorkFrozen: false,
          protectedMainGreen: true,
          ownerConflict: false,
          dirtyTarget: false,
          headDrift: false,
          allowedPathConflict: false,
          externalSideEffects: false
        },
        candidateReceipt: {
          schemaVersion: schema.SENA_SCHEMA_VERSIONS.workflowEngineeringCandidateReceipt,
          repo,
          branch,
          baseSha,
          candidateSha,
          ownerLane: "A11",
          changedPaths,
          changedPathDigest: canonical.senaWorkflowDigest({ changedPaths })
        }
      }
    };

    const isolatedPostgres = await createIsolatedPostgresDatabase(postgresUrl!);
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = isolatedPostgres.url;
    const pool = new Pool({ connectionString: isolatedPostgres.url, max: 8 });
    const store = workflowStoreModule.createSenaWorkflowPostgresStore({ pool });
    const checkpointer = workflowCheckpointer.createEvidenceFlowPostgresSaver(isolatedPostgres.url);
    try {
      await store.ensureSchema();
      await checkpointer.setup();
      const created = await workflowApi.createSenaWorkflowRun({
        context: registered.context,
        body: {
          kind: "engineering-release",
          teamId,
          repo,
          baseSha,
          candidateSha,
          workRequestDigest,
          parameters
        },
        idempotencyKey: `engineering-pilot-${randomUUID()}`,
        codeSha: "a".repeat(40),
        idFactory: randomUUID,
        store
      });
      const operations = workflowOperations.createSenaWorkflowServerJobOperationAdapter({
        store,
        engineeringCommandExecutorFactory: async () => async (command) => ({
          exitCode: 0,
          startedAt: "2026-08-28T03:00:00.000Z",
          finishedAt: "2026-08-28T03:00:01.000Z",
          logSummaryDigest: canonical.senaWorkflowDigest({ command, output: "fixture-pass" }),
          isolation: {
            provider: "fixed-fixture-simulation",
            snapshotKind: "fixed-fixture",
            candidateTreeSha: candidateSha,
            dependencyLockDigest: "1".repeat(64),
            sandboxPolicyDigest: "2".repeat(64),
            filesystemPolicy: "fixed-fixture",
            readPolicy: "fixed-fixture",
            networkPolicy: "none",
            temporarySnapshot: true
          }
        })
      });
      const nodeExecutor = workflowNodeExecutor.createSenaWorkflowGraphNodeExecutor({ store, operations });
      const worker = workflowWorker.createSenaWorkflowWorkerRuntime({
        store,
        checkpointer,
        nodeExecutor,
        workerId: "engineering-pilot-worker",
        workerBuildAttestation: (() => {
          const core = {
            codeSha: "a".repeat(40),
            treeSha: "b".repeat(40),
            source: "git-object-measurement" as const,
            clean: true as const
          };
          return { ...core, attestationDigest: canonical.senaWorkflowDigest(core) };
        })(),
        maxAttempts: 3
      });
      const approvePending = async (sequence: number, expectedNodeId: string) => {
        const run = await store.getRun(created.run.id, teamId);
        expect(run).toMatchObject({ status: "waiting_human", currentNodeId: expectedNodeId });
        const pending = run?.pendingInterrupt;
        if (!run || pending?.kind !== "waiting-human") throw new Error("Expected an engineering human interrupt.");
        const decisionDigest = workflowApi.senaWorkflowDecisionDigest({
          runId: run.id,
          nodeId: pending.nodeId,
          interruptId: pending.interruptId,
          inputDigest: pending.inputDigest,
          candidateOutputDigest: pending.candidateOutputDigest,
          decision: "approve"
        });
        await workflowApi.performSenaWorkflowAction({
          context: registered.context,
          runId: run.id,
          body: {
            action: "approve",
            expectedVersion: run.version,
            interruptId: pending.interruptId,
            decisionDigest
          },
          idempotencyKey: `engineering-pilot-approval-${sequence}-${randomUUID()}`,
          store
        });
        const result = await worker.runOnce();
        expect(result).toMatchObject({ status: "processed" });
        return result;
      };

      const started = await worker.runOnce();
      expect(started).toMatchObject({
        status: "processed",
        run: { status: "waiting_human", currentNodeId: "scope-routing" }
      });
      await approvePending(1, "scope-routing");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("implementation-handoff");
      await approvePending(2, "implementation-handoff");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("candidate-sha-intake");
      await approvePending(3, "candidate-sha-intake");
      expect((await store.getRun(created.run.id, teamId))?.currentNodeId).toBe("exact-sha-review");
      const finished = await approvePending(4, "exact-sha-review");
      expect(finished).toMatchObject({ status: "processed", run: { status: "succeeded" } });

      const events = await store.runEvents(created.run.id, teamId);
      expect(events.run).toMatchObject({
        status: "succeeded",
        mode: "shadow",
        baseSha,
        candidateSha,
        evidenceLayers: {
          source: "passed",
          local: "passed",
          ci: "passed",
          merged: "not-run",
          deployed: "not-run",
          live: "not-run"
        }
      });
      expect(events.receipts).toHaveLength(11);
      expect(events.approvals.map((approval) => approval.nodeId)).toEqual([
        "scope-routing",
        "implementation-handoff",
        "candidate-sha-intake",
        "exact-sha-review"
      ]);
      expect(events.commands.every((command) => command.status === "completed")).toBe(true);
      expect(events.run.jobReferences).toEqual([]);
      expect(events.artifacts).toHaveLength(15);
      expect(events.artifacts).toContainEqual(expect.objectContaining({
        nodeId: "evidence-closeout",
        filename: "sena-workflow-closeout-commitment.json",
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseoutCommitment
      }));
      expect(events.artifacts.every((artifact) => artifact.sha256.length === 64)).toBe(true);
      const closeout = workflowCloseout.buildSenaWorkflowCloseout({
        ...events,
        generatedAt: "2026-08-28T04:00:00.000Z"
      });
      expect(closeout).toMatchObject({
        workflowStatus: "succeeded",
        mode: "shadow",
        auditChain: { status: "verified", receiptCount: 11 },
        evidenceLayers: {
          ci: "passed",
          merged: "not-run",
          deployed: "not-run",
          live: "not-run"
        },
        evidenceBoundary: { externalGitOrDeploymentSideEffects: "none" }
      });
    } finally {
      await checkpointer.end().catch(() => undefined);
      await pool.end();
      await isolatedPostgres.dispose();
    }
  }, 60_000);
});
