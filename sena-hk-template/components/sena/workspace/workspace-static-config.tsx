import type { ElementType, SVGProps } from "react";
import { Activity, Database, GitMerge, Orbit, Sigma } from "lucide-react";
import {
  buildSenaProductionPageContract,
  type SenaLayer,
  type SenaLayoutMode,
  type SenaTemporalMode
} from "./analysis-runtime";
import type { SenaPlotView } from "./plot-tools-panel";
import type {
  WorkspaceRailItem,
  WorkspaceRailPanelCopy
} from "./workspace-shell-panels";

export const SHOW_ARCHIVED_FORMULA_PANEL = false;
export const senaEnterpriseImportFileAccept = ".csv,.json,.xlsx,.txt,.md,.srt,.vtt,text/csv,application/json,text/plain,text/vtt,application/x-subrip";
export const platformDecisionTimestampedEvidenceIds = new Set([
  "idp-tenant-approval",
  "idp-callback-approval",
  "sso-provider-secrets",
  "sso-secret-store-reference",
  "sso-secret-rotation",
  "provisioning-owner",
  "scim-or-idp-ownership",
  "bearer-token-rotation",
  "lifecycle-guardrails"
]);

export const layerCopy: Record<SenaLayer, { label: string; detail: string; className: string }> = {
  social: {
    label: "SNA",
    detail: "person-person ties",
    className: "border-blue-400/50 bg-blue-400/10 text-blue-200"
  },
  concept: {
    label: "ENA",
    detail: "code-code co-occurrence",
    className: "border-violetGlow/50 bg-violetGlow/10 text-violetGlow"
  },
  bridge: {
    label: "SENA",
    detail: "person-code contribution",
    className: "border-cyanGlow/50 bg-cyanGlow/10 text-cyanGlow"
  }
};

export const layoutOptions: Array<{ value: SenaLayoutMode; label: string; icon: ElementType; note: string }> = [
  { value: "explanatory", label: "Exploratory overlay", icon: Orbit, note: "Readable non-metric three-layer layout" },
  { value: "ena-space", label: "ENA Space", icon: Sigma, note: "jENA projected points and code positions" },
  { value: "joint", label: "Joint", icon: GitMerge, note: "Selectable A_fusion embedding operators" }
];

export const temporalModeOptions: Array<{ value: SenaTemporalMode; label: string }> = [
  { value: "stage", label: "Stage" },
  { value: "moving-window", label: "Moving" },
  { value: "turn-window", label: "Turn" }
];

export function StatsNetworkMetricsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 23V15.5M12.25 23V12M16.5 23V16.25M20.75 23V18.25M25 23V12.75"
        stroke="currentColor"
        strokeWidth="2.9"
        strokeLinecap="round"
        opacity="0.34"
      />
      <path
        d="M8.25 20.75L16 8.75L23.75 20.75M8.25 20.75H23.75"
        stroke="currentColor"
        strokeWidth="3.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.25" cy="20.75" r="3.65" fill="currentColor" />
      <circle cx="16" cy="8.75" r="3.65" fill="currentColor" />
      <circle cx="23.75" cy="20.75" r="3.65" fill="currentColor" />
    </svg>
  );
}

export function ModelLayerStackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 10.2L16 6.4L24 10.2L16 14L8 10.2Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M8 10.2L16 6.4L24 10.2L16 14L8 10.2Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M8 15.9L16 12.1L24 15.9L16 19.7L8 15.9Z"
        fill="currentColor"
        opacity="0.26"
      />
      <path
        d="M8 15.9L16 12.1L24 15.9L16 19.7L8 15.9Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
        opacity="0.86"
      />
      <path
        d="M8 21.6L16 17.8L24 21.6L16 25.4L8 21.6Z"
        fill="currentColor"
        opacity="0.34"
      />
      <path
        d="M8 21.6L16 17.8L24 21.6L16 25.4L8 21.6Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 21.2L20.8 10.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.92"
      />
      <circle cx="11.2" cy="21.2" r="2.15" fill="currentColor" />
      <circle cx="20.8" cy="10.8" r="2.15" fill="currentColor" />
    </svg>
  );
}

export const workspaceRailItems: WorkspaceRailItem[] = [
  { id: "sets", label: "Sets", href: "#workflow-data", icon: Database, iconName: "database" },
  { id: "model", label: "Model", href: "#workflow-model", icon: ModelLayerStackIcon, iconName: "layer-stack", visualRole: "workspace-rail-model-layer-stack-icon" },
  { id: "plots", label: "Plot Tools", href: "#workflow-canvas", icon: Activity, iconName: "activity" },
  { id: "stats", label: "Stats", href: "#sena-stats-deck", icon: StatsNetworkMetricsIcon, iconName: "network-metrics", visualRole: "workspace-rail-network-metrics-icon" }
];

export const workspaceRailPanelCopy: WorkspaceRailPanelCopy = {
  sets: {
    title: "Sets",
    subtitle: "Import, audit, and prepare SENA contract tables",
    badge: "Data",
    activeWorkflowId: "workflow-data"
  },
  model: {
    title: "Model",
    subtitle: "Tune S/W/B/B_PC/B_CP/G construction and local runtime parameters",
    badge: "Build",
    activeWorkflowId: "workflow-model"
  },
  plots: {
    title: "Plot Tools",
    subtitle: "Tune layers, thresholds, and temporal framing for the active plot",
    badge: "Canvas",
    activeWorkflowId: "workflow-canvas"
  },
  stats: {
    title: "Stats",
    subtitle: "Inspect jSNA metrics, G contribution, and validation outputs",
    badge: "Metrics",
    activeWorkflowId: "sena-stats-deck"
  }
};

export const plotViewOptions: Array<{ id: SenaPlotView; label: string; detail: string }> = [
  { id: "fusion", label: "Fusion", detail: "Current window A1 canvas" },
  { id: "dual", label: "Dual Lens", detail: "Conversation + split metrics" },
  { id: "temporal", label: "Temporal", detail: "Plan -> Teach -> Reflect" },
  { id: "ena", label: "ENA Space", detail: "jENA unit/code positions" },
  { id: "sna", label: "SNA", detail: "jSNA actor metrics" },
  { id: "evidence", label: "Evidence", detail: "Selected excerpts" },
  { id: "matrix", label: "Matrix", detail: "S/W/B/G previews" }
];

export const productionPageContract = buildSenaProductionPageContract();

export const workflowSteps = [
  { id: "workflow-data", label: "Data Import", detail: "Contract tables", href: "#workflow-data" },
  { id: "workflow-model", label: "Model Builder", detail: "S/W/B/G + weights", href: "#workflow-model" },
  { id: "workflow-canvas", label: "Fusion Canvas", detail: "Typed graph", href: "#workflow-canvas" },
  { id: "workflow-evidence", label: "Evidence", detail: "Nodes, edges, excerpts", href: "#workflow-evidence" },
  { id: "workflow-temporal", label: "Temporal Trace", detail: "Stage and turn windows", href: "#workflow-temporal" },
  { id: "workflow-report", label: "Report", detail: "Review-ready export", href: "#workflow-report" }
];

export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function formatDelta(value: number, digits = 1) {
  const formatted = formatNumber(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
}

export function upperTriangleTotal(values: number[][]) {
  let total = 0;
  for (let row = 0; row < values.length; row += 1) {
    for (let column = row + 1; column < (values[row]?.length ?? 0); column += 1) {
      const value = values[row]?.[column] ?? 0;
      total += Number.isFinite(value) ? value : 0;
    }
  }
  return total;
}

export function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}
