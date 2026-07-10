import { SENA_KERNEL_PACKAGE } from "../../packages/sena-kernel";
import {
  SENA_API_ENDPOINT_FACTS,
  type SenaApiEndpointFact,
  type SenaApiGroupId
} from "./api-route-facts";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";

export type SenaAnalysisDecompositionSeamId =
  | "M1"
  | "M2"
  | "M3"
  | "M4"
  | "M5"
  | "M6"
  | "M7"
  | "M8"
  | "M9"
  | "M10"
  | "M11";

export type SenaAnalysisDecompositionSeam = {
  id: SenaAnalysisDecompositionSeamId;
  label: string;
  currentHost: "/api/sena/analyze";
  targetBoundary: string;
  kernelCovered: boolean;
  status: "kernel-boundary-present" | "api-boundary-present" | "api-decomposition-candidate";
};

export type SenaApiSurfaceMoratorium = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.apiSurfaceMoratorium;
  sourceIssue: "SENA-014";
  advisoryRecommendation: string;
  freezePolicy: {
    deletionPolicy: "moratorium";
    routeChangePolicy: "additive-or-reviewed-only";
    frozenGroups: readonly SenaApiGroupId[];
    reason: string;
  };
  frozenEndpointIds: readonly SenaApiEndpointFact["id"][];
  frozenPaths: readonly SenaApiEndpointFact["path"][];
  analysisResource: {
    currentEndpointId: "sena-analyze";
    currentPath: "/api/sena/analyze";
    currentKernelPackage: typeof SENA_KERNEL_PACKAGE.name;
    currentKernelVersion: typeof SENA_KERNEL_PACKAGE.version;
    kernelModuleMap: typeof SENA_KERNEL_PACKAGE.moduleMap;
    decompositionSeams: readonly SenaAnalysisDecompositionSeam[];
  };
  reviewGates: readonly string[];
};

const frozenGroups = [
  "auth",
  "projects",
  "team",
  "imports",
  "reliability",
  "validation",
  "exports",
  "governance",
  "ops",
  "provisioning",
  "legacy-ena"
] as const satisfies readonly SenaApiGroupId[];

function isFrozenGroup(group: SenaApiGroupId) {
  return (frozenGroups as readonly SenaApiGroupId[]).includes(group);
}

const frozenEndpoints = SENA_API_ENDPOINT_FACTS.filter((endpoint) => isFrozenGroup(endpoint.group));

const decompositionSeams = [
  {
    id: "M1",
    label: "request intake, auth preflight, and source selection",
    currentHost: "/api/sena/analyze",
    targetBoundary: "lib/sena/analysis-api.ts request orchestration helpers",
    kernelCovered: false,
    status: "api-boundary-present"
  },
  {
    id: "M2",
    label: "data contract",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel data contract exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M3",
    label: "layer construction",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel layer construction exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M4",
    label: "fusion assembly",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel fusion assembly exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M5",
    label: "graph operators",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel graph operator exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M6",
    label: "embedding diagnostics",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel embedding diagnostics exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M7",
    label: "temporal runtime",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel temporal runtime exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M8",
    label: "provenance envelope",
    currentHost: "/api/sena/analyze",
    targetBoundary: "packages/sena-kernel provenance envelope exports",
    kernelCovered: true,
    status: "kernel-boundary-present"
  },
  {
    id: "M9",
    label: "report, snapshot, and runtime-bundle handoff",
    currentHost: "/api/sena/analyze",
    targetBoundary: "lib/sena/analysis-api.ts artifact headers plus buildSenaAnalysisRun handoff",
    kernelCovered: false,
    status: "api-boundary-present"
  },
  {
    id: "M10",
    label: "validation and claim-evidence handoff",
    currentHost: "/api/sena/analyze",
    targetBoundary: "/api/sena/validation/* and project-scoped claim-package routes",
    kernelCovered: false,
    status: "api-boundary-present"
  },
  {
    id: "M11",
    label: "async server-job and worker handoff",
    currentHost: "/api/sena/analyze",
    targetBoundary: "lib/sena/analysis-api.ts queue payload helpers plus enterprise server-job queue",
    kernelCovered: false,
    status: "api-boundary-present"
  }
] as const satisfies readonly SenaAnalysisDecompositionSeam[];

export const SENA_API_SURFACE_MORATORIUM: SenaApiSurfaceMoratorium = {
  schemaVersion: SENA_SCHEMA_VERSIONS.apiSurfaceMoratorium,
  sourceIssue: "SENA-014",
  advisoryRecommendation: "Freeze the enterprise and ops route surface under a deletion moratorium, then decompose /api/sena/analyze along explicit M1-M11 seams.",
  freezePolicy: {
    deletionPolicy: "moratorium",
    routeChangePolicy: "additive-or-reviewed-only",
    frozenGroups,
    reason: "The enterprise, governance, ops, provisioning, identity, collaboration, import, reliability, validation, and export routes already form a broad external contract; SENA-014 asks for analysis decomposition without deleting that surface."
  },
  frozenEndpointIds: frozenEndpoints.map((endpoint) => endpoint.id),
  frozenPaths: frozenEndpoints.map((endpoint) => endpoint.path),
  analysisResource: {
    currentEndpointId: "sena-analyze",
    currentPath: "/api/sena/analyze",
    currentKernelPackage: SENA_KERNEL_PACKAGE.name,
    currentKernelVersion: SENA_KERNEL_PACKAGE.version,
    kernelModuleMap: SENA_KERNEL_PACKAGE.moduleMap,
    decompositionSeams
  },
  reviewGates: [
    "Do not delete frozen enterprise, ops, governance, provisioning, identity, collaboration, import, reliability, validation, export, or legacy ENA endpoints without a reviewed migration.",
    "Keep new analysis routes additive until /api/sena/analyze clients have a documented compatibility path.",
    "Route M2-M8 computation through @sena/kernel rather than duplicating formula semantics in API handlers.",
    "Keep production-readiness claims gated by live infrastructure evidence instead of API surface breadth."
  ]
};
