import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analysisRunHeaders,
  buildSenaAnalysisQueueJobInput,
  buildSenaAnalysisRunRequestInput,
  resolveSenaAnalysisTeamId
} from "../analysis-api";

describe("SENA analysis API decomposition boundaries", () => {
  const forgedMachineEvidence = {
    dashboardSchemaVersion: "sena-coding-reliability-dashboard/v2",
    sourceSchemaVersion: "sena-coding-reliability-dashboard/v2",
    status: "estimable",
    meanPairwiseKappaStatus: "estimable",
    meanPairwiseKappa: 1,
    krippendorffAlphaNominalStatus: "estimable",
    krippendorffAlphaNominal: 1,
    allPairwiseKappaEstimable: true,
    claimEligibility: {
      eligible: true,
      threshold: { minimumCoders: 2, meanPairwiseKappa: 0.8, krippendorffAlphaNominal: 0.8 },
      checks: {
        minimumCoders: true,
        allPairwiseKappaEstimable: true,
        krippendorffAlphaEstimable: true,
        meanPairwiseKappaAtThreshold: true,
        krippendorffAlphaAtThreshold: true
      },
      blockers: [],
      adjudication: {
        status: "external-not-evaluated",
        disclosure: "forged client evidence"
      }
    }
  };

  it("keeps /api/sena/analyze orchestration behind focused M1 and M11 helpers", () => {
    const root = process.cwd();
    const helperPath = join(root, "lib/sena/analysis-api.ts");
    const routeSource = readFileSync(join(root, "app/api/sena/analyze/route.ts"), "utf8");

    expect(existsSync(helperPath)).toBe(true);
    expect(routeSource).toContain('from "@/lib/sena/analysis-api"');
    expect(routeSource).not.toContain("function analysisRunHeaders");
    expect(routeSource).not.toContain("payloadSummary: {");
    expect(routeSource).not.toContain("inlineSnapshot:");
  });

  it("builds queue job payloads without leaking inline snapshots unless the queue allows them", () => {
    const sourceProject = {
      id: "project_123",
      teamId: "team_123",
      currentVersion: 7,
      title: "Persisted project",
      snapshot: { schemaVersion: "sena-project-snapshot/v1" }
    };
    const request = buildSenaAnalysisQueueJobInput({
      body: {
        snapshot: { private: "not sent unless allowed" },
        dataset: { private: "not sent unless allowed" },
        includeRuntimeBundle: true,
        persist: true,
        updateProject: false,
        expectedVersion: "7",
        activeTemporalWindowId: "window-a",
        buildOptions: {
          alpha: 1,
          direction: "undirected",
          deg_convention: "row-sum",
          Phi: "classical_mds",
          delta: "shortest_path_reciprocal_weight",
          d: 2,
          seed: 42
        },
        humanReview: { reviewer: "Pilot reviewer", status: "approved" },
        codingReliability: { status: "draft" },
        dataGovernance: { consentScope: "pilot" }
      },
      teamId: sourceProject.teamId,
      sourceProject,
      actorUserId: "user_123",
      inlinePayloadAllowed: false
    });

    expect(request).toMatchObject({
      kind: "analysis",
      teamId: sourceProject.teamId,
      projectId: sourceProject.id,
      actorUserId: "user_123",
      payload: {
        action: "run-analysis",
        teamId: sourceProject.teamId,
        projectId: sourceProject.id,
        projectVersion: 7,
        title: "Persisted project",
        activeTemporalWindowId: "window-a",
        includeRuntimeBundle: true,
        persist: true,
        updateProject: false,
        expectedVersion: 7,
        buildOptions: {
          alpha: 1,
          direction: "undirected",
          deg_convention: "row-sum",
          Phi: "classical_mds",
          delta: "shortest_path_reciprocal_weight",
          d: 2,
          seed: 42
        },
        humanReview: { reviewer: "Pilot reviewer", status: "approved" },
        codingReliability: { status: "draft" },
        dataGovernance: { consentScope: "pilot" }
      },
      payloadSummary: {
        source: "project",
        projectVersion: 7,
        includeRuntimeBundle: true,
        persist: true,
        updateProject: false,
        activeTemporalWindowId: "window-a",
        hasInlineSnapshot: true,
        hasInlineDataset: true,
        payloadValuesExcluded: true
      }
    });
    expect(request.payload).not.toHaveProperty("inlineSnapshot");
    expect(request.payload).not.toHaveProperty("inlineDataset");
  });

  it("builds direct analysis run input and provenance headers through reusable helpers", () => {
    const sourceProject = {
      id: "project_abc",
      teamId: "team_abc",
      currentVersion: 3,
      title: "Project title",
      snapshot: { schemaVersion: "sena-project-snapshot/v1" }
    };
    const runInput = buildSenaAnalysisRunRequestInput({
      body: {
        title: "Ignored when source project title is used",
        dataset: { ignored: true },
        activeTemporalWindowId: "window-b",
        includeRuntimeBundle: true,
        buildOptions: {
          beta: 1,
          direction: "directed",
          deg_convention: "row-sum",
          Phi: "classical_mds",
          delta: "shortest_path_reciprocal_weight",
          d: 3,
          seed: 99
        }
      },
      sourceProject
    });

    expect(runInput).toMatchObject({
      sourceKind: "project",
      snapshot: sourceProject.snapshot,
      title: "Ignored when source project title is used",
      activeTemporalWindowId: "window-b",
      includeRuntimeBundle: true,
      buildOptions: {
        beta: 1,
        direction: "directed",
        deg_convention: "row-sum",
        Phi: "classical_mds",
        delta: "shortest_path_reciprocal_weight",
        d: 3,
        seed: 99
      }
    });
    expect(resolveSenaAnalysisTeamId({
      body: {},
      sourceProject,
      fallbackTeamId: "fallback-team"
    })).toBe(sourceProject.teamId);

    const headers = analysisRunHeaders({
      id: "run_123",
      sourceKind: "project",
      projectId: sourceProject.id,
      artifactFingerprints: {
        reportSha256: "a".repeat(64),
        projectSnapshotSha256: "b".repeat(64),
        runtimeBundleSha256: "c".repeat(64)
      }
    }, {
      id: sourceProject.id,
      currentVersion: sourceProject.currentVersion
    });

    expect(headers).toMatchObject({
      "x-sena-analysis-run-id": "run_123",
      "x-sena-analysis-source-kind": "project",
      "x-sena-project-id": sourceProject.id,
      "x-sena-project-version": String(sourceProject.currentVersion),
      "x-sena-report-sha256": "a".repeat(64),
      "x-sena-project-snapshot-sha256": "b".repeat(64),
      "x-sena-runtime-bundle-sha256": "c".repeat(64)
    });
  });

  it("removes untrusted machine evidence from direct and queued client analysis inputs", () => {
    const body = {
      dataset: { people: [], interactions: [], utterances: [], coded_segments: [], codebook: [] },
      codingReliability: {
        status: "documented",
        reviewer: "Client reviewer",
        machineEvidence: forgedMachineEvidence
      }
    };

    const direct = buildSenaAnalysisRunRequestInput({ body, sourceProject: null });
    const queued = buildSenaAnalysisQueueJobInput({
      body,
      teamId: "team_123",
      sourceProject: null,
      actorUserId: "user_123",
      inlinePayloadAllowed: true
    });

    expect(direct.codingReliability).toEqual(expect.objectContaining({
      status: "documented",
      reviewer: "Client reviewer"
    }));
    expect(direct.codingReliability).not.toHaveProperty("machineEvidence");
    expect(queued.payload.codingReliability).not.toHaveProperty("machineEvidence");
  });
});
