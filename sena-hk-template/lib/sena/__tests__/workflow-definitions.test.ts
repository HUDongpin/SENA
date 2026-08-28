import { describe, expect, it } from "vitest";
import { senaWorkflowDigest } from "../workflow/canonical";
import {
  engineeringReleaseGraphV1,
  researchEvidenceGraphV1,
  senaWorkflowDefinitions
} from "../workflow/definitions";

const researchNodeIds = [
  "bind-source",
  "data-governance-preflight",
  "import-cleaning",
  "data-contract-audit",
  "fusion-analysis",
  "audit-runtime-consistency",
  "audit-fusion-math",
  "audit-jena-jsna-provenance",
  "audit-temporal-trace",
  "audit-evidence-ledger",
  "audit-data-governance",
  "scientific-audit-join",
  "coding-reliability",
  "adjudication-gate",
  "statistical-validation",
  "expert-review-gate",
  "claim-readiness",
  "publication-export",
  "package-verification",
  "evidence-closeout"
];

const engineeringNodeIds = [
  "bind-work-request",
  "repository-preflight",
  "scope-routing",
  "immutable-work-order",
  "implementation-handoff",
  "candidate-sha-intake",
  "focused-gates",
  "full-local-gate",
  "exact-sha-review",
  "shadow-release-model",
  "evidence-closeout"
];

function expectedLinearEdges(nodeIds: string[]) {
  return nodeIds.slice(0, -1).map((from, index) => ({ from, to: nodeIds[index + 1] }));
}

const researchEdges = [
  ...expectedLinearEdges(researchNodeIds.slice(0, 5)),
  ...researchNodeIds.slice(5, 11).map((to) => ({ from: "fusion-analysis", to })),
  ...researchNodeIds.slice(5, 11).map((from) => ({ from, to: "scientific-audit-join" })),
  ...expectedLinearEdges(researchNodeIds.slice(11))
];

function definitionCore(definition: (typeof senaWorkflowDefinitions)[number]) {
  const { definitionHash: _definitionHash, ...core } = definition;
  return core;
}

describe("SENA EvidenceFlow fixed graph definitions", () => {
  it("locks the research-evidence/v1 topology and canonical definition hash", () => {
    expect(researchEvidenceGraphV1.nodes.map((node) => node.id)).toEqual(researchNodeIds);
    expect(researchEvidenceGraphV1.edges).toEqual(researchEdges);
    expect(researchEvidenceGraphV1.definitionHash).toBe(
      "2d3ffbd8234f0d0cab9fd9d576af07b4d7e4eb56e7961e0d0cfb538ebedf7de1"
    );
    expect(senaWorkflowDigest(definitionCore(researchEvidenceGraphV1))).toBe(
      researchEvidenceGraphV1.definitionHash
    );
  });

  it("locks the engineering-release/v1 topology, shadow mode, and canonical definition hash", () => {
    expect(engineeringReleaseGraphV1.nodes.map((node) => node.id)).toEqual(engineeringNodeIds);
    expect(engineeringReleaseGraphV1.edges).toEqual(expectedLinearEdges(engineeringNodeIds));
    expect(engineeringReleaseGraphV1.mode).toBe("shadow");
    expect(engineeringReleaseGraphV1.definitionHash).toBe(
      "9d5796b20ac646a799c99223931906d3d7f8ea4cbf5fcfac7162aa013be1cefe"
    );
    expect(senaWorkflowDigest(definitionCore(engineeringReleaseGraphV1))).toBe(
      engineeringReleaseGraphV1.definitionHash
    );
  });

  it("keeps approval permissions and permanent fail-closed prohibitions explicit", () => {
    const permissions = new Map(
      senaWorkflowDefinitions.flatMap((definition) =>
        definition.nodes.map((node) => [`${definition.kind}:${node.id}`, node.requiredPermission])
      )
    );
    expect(permissions.get("research-evidence:adjudication-gate")).toBe("reliability:adjudicate");
    expect(permissions.get("research-evidence:expert-review-gate")).toBe("expert:review");
    expect(permissions.get("engineering-release:exact-sha-review")).toBe("release:approve");
    expect(
      senaWorkflowDefinitions.every((definition) =>
        definition.permanentProhibitions.includes("no-production-deployment-in-v1")
      )
    ).toBe(true);
  });
});
