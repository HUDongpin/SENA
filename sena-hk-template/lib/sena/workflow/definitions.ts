import { senaWorkflowDigest } from "./canonical";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaWorkflowDefinitionManifest, SenaWorkflowEdgeManifest, SenaWorkflowNodeManifest } from "./types";

const permanentProhibitions = [
  "no-raw-research-row-in-checkpoint",
  "no-secret-or-provider-credential-in-checkpoint-or-receipt",
  "no-llm-research-claim-approval",
  "no-automatic-real-git-merge",
  "no-automatic-provider-change",
  "no-production-deployment-in-v1",
  "no-success-inference-from-queued-command"
];

function definition(
  kind: SenaWorkflowDefinitionManifest["kind"],
  nodes: SenaWorkflowNodeManifest[],
  edges: SenaWorkflowEdgeManifest[]
): SenaWorkflowDefinitionManifest {
  const core = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowDefinition,
    kind,
    definitionVersion: "v1" as const,
    mode: "shadow" as const,
    nodes,
    edges,
    permanentProhibitions
  };
  return { ...core, definitionHash: senaWorkflowDigest(core) };
}

const researchNodes: SenaWorkflowNodeManifest[] = [
  ["bind-source", "Bind Source", ["A01", "A05"], "read-only", "source"],
  ["data-governance-preflight", "Data Governance Preflight", ["A05", "A08", "A10"], "human-interrupt", "source"],
  ["import-cleaning", "Import / Cleaning", ["A05"], "server-job", "local"],
  ["data-contract-audit", "Data Contract Audit", ["A05", "A08"], "read-only", "local"],
  ["fusion-analysis", "S/W/B/G/A_fusion Analysis", ["A02", "A03", "A04", "A13"], "server-job", "local"],
  ["audit-runtime-consistency", "Runtime Consistency Audit", ["A02", "A03", "A04"], "read-only", "local"],
  ["audit-fusion-math", "Fusion Math Audit", ["A02", "A13"], "read-only", "local"],
  ["audit-jena-jsna-provenance", "jENA/jSNA Provenance Audit", ["A03", "A04"], "read-only", "local"],
  ["audit-temporal-trace", "Temporal Trace Audit", ["A02", "A13"], "read-only", "local"],
  ["audit-evidence-ledger", "Evidence Ledger Audit", ["A07", "A08"], "read-only", "local"],
  ["audit-data-governance", "Data Governance Audit", ["A05", "A08", "A10"], "read-only", "local"],
  ["scientific-audit-join", "Scientific Audit Join", ["A02", "A05", "A08", "A13"], "read-only", "local"],
  ["coding-reliability", "Coding Reliability", ["A08"], "server-job", "local"],
  ["adjudication-gate", "Adjudication Gate", ["A08"], "human-interrupt", "local", "reliability:adjudicate"],
  ["statistical-validation", "Statistical Validation", ["A08"], "server-job", "local"],
  ["expert-review-gate", "Expert Review Gate", ["A08"], "human-interrupt", "local", "expert:review"],
  ["claim-readiness", "Claim Readiness", ["A07", "A08"], "read-only", "local"],
  ["publication-export", "Publication Export", ["A07"], "server-job", "local", "export:create"],
  ["package-verification", "Package Verification", ["A07", "A11", "A15"], "read-only", "local"],
  ["evidence-closeout", "Evidence Closeout", ["A01", "A07", "A10", "A15"], "closeout", "local"]
].map(([id, label, ownerLanes, effect, evidenceLayer, requiredPermission]) => ({
  id: id as string,
  label: label as string,
  ownerLanes: ownerLanes as string[],
  effect: effect as SenaWorkflowNodeManifest["effect"],
  evidenceLayer: evidenceLayer as SenaWorkflowNodeManifest["evidenceLayer"],
  ...(requiredPermission ? { requiredPermission: requiredPermission as string } : {})
}));

const researchAuditNodeIds = researchNodes.slice(5, 11).map((node) => node.id);
const researchEdges: SenaWorkflowEdgeManifest[] = [
  ...researchNodes.slice(0, 4).map((node, index) => ({
    from: node.id,
    to: researchNodes[index + 1].id
  })),
  ...researchAuditNodeIds.map((to) => ({ from: "fusion-analysis", to })),
  ...researchAuditNodeIds.map((from) => ({ from, to: "scientific-audit-join" })),
  ...researchNodes.slice(11, -1).map((node, index) => ({
    from: node.id,
    to: researchNodes[index + 12].id
  }))
];

const engineeringNodes: SenaWorkflowNodeManifest[] = [
  ["bind-work-request", "Bind Work Request", ["A01"], "read-only", "source"],
  ["repository-preflight", "Governance Freeze / Repository Preflight", ["A01", "A10"], "read-only", "source"],
  ["scope-routing", "A01–A15 Scope Routing", ["A01", "A14", "A15"], "human-interrupt", "source", "team:manage"],
  ["immutable-work-order", "Immutable Work Order", ["A01"], "artifact-write", "source"],
  ["implementation-handoff", "Human Implementation Handoff", ["A01"], "human-interrupt", "source", "team:manage"],
  ["candidate-sha-intake", "Candidate SHA Intake", ["A01", "A11"], "human-interrupt", "local", "team:manage"],
  ["focused-gates", "Focused Gates", ["A11"], "read-only", "local"],
  ["full-local-gate", "Full Local Gate", ["A11"], "read-only", "local"],
  ["exact-sha-review", "Exact-SHA Review", ["A11"], "human-interrupt", "local", "release:approve"],
  ["shadow-release-model", "Shadow CI / Merge / Deploy Model", ["A10", "A11"], "read-only", "ci"],
  ["evidence-closeout", "Evidence Closeout", ["A01", "A10", "A11", "A15"], "closeout", "local"]
].map(([id, label, ownerLanes, effect, evidenceLayer, requiredPermission]) => ({
  id: id as string,
  label: label as string,
  ownerLanes: ownerLanes as string[],
  effect: effect as SenaWorkflowNodeManifest["effect"],
  evidenceLayer: evidenceLayer as SenaWorkflowNodeManifest["evidenceLayer"],
  ...(requiredPermission ? { requiredPermission: requiredPermission as string } : {})
}));

const engineeringEdges = engineeringNodes.slice(0, -1).map((node, index) => ({
  from: node.id,
  to: engineeringNodes[index + 1].id
}));

export const researchEvidenceGraphV1 = definition("research-evidence", researchNodes, researchEdges);
export const engineeringReleaseGraphV1 = definition("engineering-release", engineeringNodes, engineeringEdges);

export const senaWorkflowDefinitions = [researchEvidenceGraphV1, engineeringReleaseGraphV1] as const;

export function senaWorkflowDefinition(kind: SenaWorkflowDefinitionManifest["kind"]) {
  const found = senaWorkflowDefinitions.find((candidate) => candidate.kind === kind);
  if (!found) throw new Error(`Unsupported SENA workflow kind: ${kind}`);
  return found;
}
