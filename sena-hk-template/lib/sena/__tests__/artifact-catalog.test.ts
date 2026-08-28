import { describe, expect, it } from "vitest";
import {
  getSenaCrossArtifactCatalogEntry,
  getSenaReviewPacketContentKey,
  getSenaWorkflowArtifactCatalogEntry,
  listSenaCrossArtifactCatalog,
  listSenaReviewPacketArtifacts,
  listSenaWorkflowArtifacts
} from "../artifact-catalog";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

describe("SENA handoff artifact catalog", () => {
  it("centralizes review-packet artifact inventory and content mapping", () => {
    const artifacts = listSenaReviewPacketArtifacts();

    expect(artifacts.find((artifact) => artifact.filename === "sena-review-packet.json")).toMatchObject({
      schemaVersion: SENA_SCHEMA_VERSIONS.reviewPacket
    });
    expect(artifacts.find((artifact) => artifact.filename === "sena-runtime-bundle.json")).toMatchObject({
      schemaVersion: SENA_SCHEMA_VERSIONS.runtimeBundle
    });
    expect(getSenaReviewPacketContentKey("sena-review-packet.json")).toBe("self");
    expect(getSenaReviewPacketContentKey("sena-runtime-bundle.json")).toBe("runtimeBundle");
    expect(getSenaReviewPacketContentKey("unknown.json")).toBeUndefined();

    artifacts[0].description = "mutated by test";
    expect(listSenaReviewPacketArtifacts()[0].description).not.toBe("mutated by test");
  });

  it("indexes cross-artifact ownership without replacing artifact-specific checks", () => {
    const catalog = listSenaCrossArtifactCatalog();

    expect(new Set(catalog.map((artifact) => artifact.filename)).size).toBe(catalog.length);
    expect(getSenaCrossArtifactCatalogEntry("unknown.json")).toBeUndefined();

    expect(getSenaCrossArtifactCatalogEntry("sena-runtime-bundle.json")).toMatchObject({
      filename: "sena-runtime-bundle.json",
      schemaVersion: SENA_SCHEMA_VERSIONS.runtimeBundle,
      reviewPacketContentKey: "runtimeBundle",
      surfaces: {
        reviewPacketManifest: true,
        reviewPacketContents: true,
        runtimeBundleArtifactEvidence: true,
        pilotPackageManifestExport: true
      },
      checkOwners: {
        reviewPacketAudit: "lib/sena/review-packet.ts",
        runtimeBundleArtifactEvidence: "lib/sena/runtime-bundle.ts",
        pilotPackageManifest: "public/sena-pilot/sena-pilot-package-manifest.json"
      }
    });

    expect(getSenaCrossArtifactCatalogEntry("sena-analysis-report.md")).toMatchObject({
      filename: "sena-analysis-report.md",
      schemaVersion: "markdown",
      reviewPacketContentKey: "reportMarkdown",
      surfaces: {
        reviewPacketManifest: true,
        reviewPacketContents: true,
        runtimeBundleArtifactEvidence: false,
        pilotPackageManifestExport: true
      }
    });

    expect(getSenaCrossArtifactCatalogEntry("sena-runtime-consistency-audit.json")?.surfaces.runtimeBundleArtifactEvidence).toBe(true);
    expect(getSenaCrossArtifactCatalogEntry("sena-data-contract-audit.json")?.surfaces.runtimeBundleArtifactEvidence).toBe(false);

    const packetManifestProjection = catalog.map(({ filename, schemaVersion, description }) => ({
      filename,
      schemaVersion,
      description
    }));
    expect(listSenaReviewPacketArtifacts()).toEqual(packetManifestProjection);

    const mutableRuntimeBundle = getSenaCrossArtifactCatalogEntry("sena-runtime-bundle.json");
    if (!mutableRuntimeBundle) throw new Error("Expected runtime bundle catalog entry.");
    mutableRuntimeBundle.surfaces.pilotPackageManifestExport = false;
    Object.assign(mutableRuntimeBundle.checkOwners, { runtimeBundleArtifactEvidence: "mutated" });

    expect(getSenaCrossArtifactCatalogEntry("sena-runtime-bundle.json")).toMatchObject({
      surfaces: {
        pilotPackageManifestExport: true
      },
      checkOwners: {
        runtimeBundleArtifactEvidence: "lib/sena/runtime-bundle.ts"
      }
    });
  });

  it("registers the four EvidenceFlow closeout artifacts without pretending every artifact is embedded in the research packet", () => {
    const artifacts = listSenaWorkflowArtifacts();

    expect(artifacts).toHaveLength(4);
    expect(artifacts.map((artifact) => artifact.filename)).toEqual([
      "sena-workflow-run.json",
      "sena-workflow-step-receipts.json",
      "sena-workflow-approvals.json",
      "sena-workflow-closeout.json"
    ]);
    expect(getSenaWorkflowArtifactCatalogEntry("sena-workflow-run.json")).toMatchObject({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
      closeoutContentKey: "run",
      surfaces: {
        workflowCloseout: true,
        researchReviewPacket: false,
        engineeringEvidenceIndex: false
      }
    });
    expect(getSenaWorkflowArtifactCatalogEntry("sena-workflow-closeout.json")).toMatchObject({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseout,
      closeoutContentKey: "self",
      surfaces: {
        workflowCloseout: true,
        researchReviewPacket: true,
        engineeringEvidenceIndex: true
      }
    });
    expect(getSenaWorkflowArtifactCatalogEntry("unknown.json")).toBeUndefined();

    artifacts[0].description = "mutated by test";
    artifacts[0].surfaces.workflowCloseout = false;
    expect(getSenaWorkflowArtifactCatalogEntry("sena-workflow-run.json")).toMatchObject({
      description: expect.not.stringContaining("mutated by test"),
      surfaces: { workflowCloseout: true }
    });
  });
});
