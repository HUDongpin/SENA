import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";
import { buildEnterpriseProjectEvidenceBinding } from "../enterprise/team-project";
import { senaWorkflowDigest } from "../workflow/canonical";
import {
  buildSenaWorkflowExploratoryPublication,
  senaWorkflowExploratoryPublicationAuthorizationDigest,
  type SenaWorkflowExploratoryPublicationCommandCore
} from "../workflow/exploratory-publication";

function fixture() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const snapshot = buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "EvidenceFlow exploratory fixture",
    generatedAt: "2026-08-28T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
  const sourceSnapshotSha256 = buildEnterpriseProjectEvidenceBinding({
    id: "workflow-project-1",
    currentVersion: 1,
    snapshot
  }).snapshotSha256;
  const command: SenaWorkflowExploratoryPublicationCommandCore = {
    action: "run-publication-export",
    commandCustody: "encrypted-upload-v1",
    publicationScope: "exploratory-only",
    teamId: "workflow-team-1",
    projectId: "workflow-project-1",
    projectRevisionId: "workflow-revision-1",
    projectVersion: 1,
    format: "package",
    sourceSnapshotSha256,
    reportSha256: senaWorkflowDigest(snapshot.report),
    workflowRunId: "workflow_run_exploratory_1",
    workflowDefinitionHash: "3".repeat(64),
    workflowCodeSha: "4".repeat(40),
    workflowConfigDigest: "5".repeat(64),
    workflowNodeId: "publication-export",
    workflowInputDigest: "6".repeat(64),
    workflowSourceBindingDigest: "7".repeat(64),
    sourceEvidence: {
      projectId: "workflow-project-1",
      projectRevisionId: "workflow-revision-1",
      projectVersion: 1,
      snapshotSha256: sourceSnapshotSha256,
      researchSourceClass: "fixture",
      uploadBindings: { import: [], reliability: [] }
    }
  };
  return { snapshot, command };
}

describe("SENA workflow exploratory publication", () => {
  it("builds a deterministic report-only package with an unmistakable exploratory boundary", () => {
    const { snapshot, command } = fixture();
    const authorizationEvidenceSha256 = senaWorkflowExploratoryPublicationAuthorizationDigest(command);
    const first = buildSenaWorkflowExploratoryPublication(snapshot, {
      ...command,
      authorizationEvidenceSha256
    });
    const second = buildSenaWorkflowExploratoryPublication(snapshot, {
      ...command,
      authorizationEvidenceSha256
    });
    const parsed = JSON.parse(first.body.toString("utf8")) as Record<string, unknown>;

    expect(second).toEqual(first);
    expect(first.filename).toBe("evidenceflow-exploratory-fixture.sena-exploratory-publication.json");
    expect(first.contentType).toBe("application/vnd.sena.exploratory-publication+json");
    expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed).toMatchObject({
      schemaVersion: "sena-workflow-exploratory-publication/v1",
      claimBoundary: "exploratory-only",
      workflow: {
        runId: command.workflowRunId,
        nodeId: "publication-export",
        sourceBindingDigest: command.workflowSourceBindingDigest
      },
      source: {
        projectId: command.projectId,
        projectRevisionId: command.projectRevisionId,
        projectVersion: command.projectVersion,
        snapshotSha256: command.sourceSnapshotSha256,
        reportSha256: command.reportSha256,
        researchSourceClass: "fixture"
      },
      readiness: {
        fixtureEvidenceExcludedFromInferenceReadiness: true
      },
      exclusions: {
        rawDatasetExcluded: true,
        uploadValuesExcluded: true,
        credentialsExcluded: true
      }
    });
    expect(parsed).toHaveProperty("report");
    expect(parsed).not.toHaveProperty("dataset");
    expect(parsed).not.toHaveProperty("sourceEvidence");
    expect(JSON.stringify(parsed)).toContain("not inference-ready");
  });

  it("changes authorization when an immutable workflow or source binding changes", () => {
    const { command } = fixture();
    const original = senaWorkflowExploratoryPublicationAuthorizationDigest(command);
    expect(senaWorkflowExploratoryPublicationAuthorizationDigest({
      ...command,
      workflowSourceBindingDigest: "8".repeat(64)
    })).not.toBe(original);
    expect(senaWorkflowExploratoryPublicationAuthorizationDigest({
      ...command,
      projectRevisionId: "workflow-revision-2"
    })).not.toBe(original);
  });
});
