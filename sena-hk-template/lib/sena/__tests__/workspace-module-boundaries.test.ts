import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaReport,
  importSenaJsonContract
} from "../../../components/sena/workspace/analysis-runtime";
import {
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES
} from "../../../components/sena/workspace/api-client";
import { useSenaFusionWorkspaceMainShellProps } from "../../../components/sena/workspace/use-sena-fusion-workspace-main-shell-props";
import {
  createTeamInvitationAction,
  deliverEnterpriseNotificationsAction,
  startEnterpriseMfaSetupAction
} from "../../../components/sena/workspace/enterprise-actions";
import type {
  EnterpriseContext,
  EnterprisePlatformDecisionState,
  EnterpriseReleaseGateState,
  EnterpriseTeamState
} from "../../../components/sena/workspace/enterprise-contracts";
import {
  enterprisePlatformDecisionOptions,
  enterpriseSsoProviderOptions,
  enterpriseValidationMetrics
} from "../../../components/sena/workspace/enterprise-options";
import { EnterpriseOpsExports } from "../../../components/sena/workspace/enterprise-ops-exports";
import { EnterpriseReleaseGatePanel } from "../../../components/sena/workspace/enterprise-release-gate-panel";
import {
  SENA_WORKSPACE_MODULE_BOUNDARIES,
  type SenaWorkspaceBoundaryModule,
  type SenaWorkspaceBoundaryModuleId
} from "../../../components/sena/workspace/module-boundaries";
import {
  SHOW_ARCHIVED_FORMULA_PANEL,
  StatsNetworkMetricsIcon,
  downloadText,
  formatDelta,
  formatNumber,
  layerCopy,
  layoutOptions,
  platformDecisionTimestampedEvidenceIds,
  plotViewOptions,
  productionPageContract,
  senaEnterpriseImportFileAccept,
  temporalModeOptions,
  upperTriangleTotal,
  workflowSteps,
  workspaceRailItems,
  workspaceRailPanelCopy
} from "../../../components/sena/workspace/workspace-static-config";
import { SenaFusionWorkspaceLoader } from "../../../components/sena/SenaFusionWorkspaceLoader";
import { ReportGenerator } from "../../../components/sena/workspace/report-generator";
import { TemporalFusionArc } from "../../../components/sena/workspace/temporal-fusion-arc";
import { buildWorkspaceCentralPlotDeckContainerProps } from "../../../components/sena/workspace/workspace-central-plot-deck-container-props";
import { buildWorkspaceEnterpriseRuntimeContainerProps } from "../../../components/sena/workspace/workspace-enterprise-runtime-container-props";
import { buildWorkspaceFusionOverlayRailMainShellContainerProps } from "../../../components/sena/workspace/workspace-fusion-overlay-rail-main-shell-container-props";
import { buildWorkspaceHeaderLeftRailContainerProps } from "../../../components/sena/workspace/workspace-header-left-rail-container-props";
import { buildWorkspaceReportAndStatsDeckContainerProps } from "../../../components/sena/workspace/workspace-report-and-stats-deck-container-props";
import { buildWorkspaceRightInspectorContainerProps } from "../../../components/sena/workspace/workspace-right-inspector-container-props";
import { useContractUploadAction } from "../../../components/sena/workspace/use-contract-upload-action";
import { useCurrentProjectSnapshotBuilder } from "../../../components/sena/workspace/use-current-project-snapshot-builder";
import { useDataContractEvidenceExportActions } from "../../../components/sena/workspace/use-data-contract-evidence-export-actions";
import { useDataImportMappedTableActions } from "../../../components/sena/workspace/use-data-import-mapped-table-actions";
import { useDemoVerificationManualReviewActions } from "../../../components/sena/workspace/use-demo-verification-manual-review-actions";
import { useFusionCanvasSelectionState } from "../../../components/sena/workspace/use-fusion-canvas-selection-state";
import { useFusionPlotInteractions } from "../../../components/sena/workspace/use-fusion-plot-interactions";
import { useMethodArtifactExportActions } from "../../../components/sena/workspace/use-method-artifact-export-actions";
import { useProjectSnapshotExportActions } from "../../../components/sena/workspace/use-project-snapshot-export-actions";
import { useProjectSnapshotRestoreAction } from "../../../components/sena/workspace/use-project-snapshot-restore-action";
import { useReportAndEvidenceArtifactExportActions } from "../../../components/sena/workspace/use-report-and-evidence-artifact-export-actions";
import { useRuntimeBundleExportActions } from "../../../components/sena/workspace/use-runtime-bundle-export-actions";
import { useRuntimeManifestExportActions } from "../../../components/sena/workspace/use-runtime-manifest-export-actions";
import { useSenaReportExportActions } from "../../../components/sena/workspace/use-sena-report-export-actions";
import { useTemporalAnimationEffects } from "../../../components/sena/workspace/use-temporal-animation-effects";
import { useTemporalRuntimeTraceExportActions } from "../../../components/sena/workspace/use-temporal-runtime-trace-export-actions";
import { useEnterpriseAuditBackupActions } from "../../../components/sena/workspace/use-enterprise-audit-backup-actions";
import { useEnterpriseCollaborationActions } from "../../../components/sena/workspace/use-enterprise-collaboration-actions";
import { useEnterpriseCollaborationEffects } from "../../../components/sena/workspace/use-enterprise-collaboration-effects";
import { useEnterpriseDatabaseSyncActions } from "../../../components/sena/workspace/use-enterprise-database-sync-actions";
import { useEnterpriseExpertReviewActions } from "../../../components/sena/workspace/use-enterprise-expert-review-actions";
import { useEnterpriseGoLiveActions } from "../../../components/sena/workspace/use-enterprise-go-live-actions";
import { useEnterpriseGovernanceExportActions } from "../../../components/sena/workspace/use-enterprise-governance-export-actions";
import { useEnterpriseImportActions } from "../../../components/sena/workspace/use-enterprise-import-actions";
import { useEnterpriseJsonArtifactExportAction } from "../../../components/sena/workspace/use-enterprise-json-artifact-export-action";
import { useEnterpriseMfaActions } from "../../../components/sena/workspace/use-enterprise-mfa-actions";
import { useEnterpriseNotificationActions } from "../../../components/sena/workspace/use-enterprise-notification-actions";
import { useEnterpriseOpsAlertsActions } from "../../../components/sena/workspace/use-enterprise-ops-alerts-actions";
import { useEnterprisePlatformDecisionActions } from "../../../components/sena/workspace/use-enterprise-platform-decision-actions";
import { useEnterpriseProjectActions } from "../../../components/sena/workspace/use-enterprise-project-actions";
import { useEnterprisePublicationActions } from "../../../components/sena/workspace/use-enterprise-publication-actions";
import { useEnterpriseProvisioningReadinessActions } from "../../../components/sena/workspace/use-enterprise-provisioning-readiness-actions";
import { useEnterpriseReleaseGateActions } from "../../../components/sena/workspace/use-enterprise-release-gate-actions";
import { useEnterpriseRefreshActions } from "../../../components/sena/workspace/use-enterprise-refresh-actions";
import { useEnterpriseReliabilityActions } from "../../../components/sena/workspace/use-enterprise-reliability-actions";
import { useEnterpriseTeamActions } from "../../../components/sena/workspace/use-enterprise-team-actions";
import { useEnterpriseUploadStorageActions } from "../../../components/sena/workspace/use-enterprise-upload-storage-actions";
import { useEnterpriseValidationActions } from "../../../components/sena/workspace/use-enterprise-validation-actions";
import { useEnterpriseWorkspaceApi } from "../../../components/sena/workspace/use-enterprise-runtime";

type EnterpriseWorkspaceContractTypes = {
  EnterpriseContext: EnterpriseContext;
  EnterprisePlatformDecisionState: EnterprisePlatformDecisionState;
  EnterpriseReleaseGateState: EnterpriseReleaseGateState;
  EnterpriseTeamState: EnterpriseTeamState;
};

const requiredContractTypes = [
  "EnterpriseContext",
  "EnterprisePlatformDecisionState",
  "EnterpriseReleaseGateState",
  "EnterpriseTeamState"
] as const satisfies ReadonlyArray<keyof EnterpriseWorkspaceContractTypes>;

function boundaryModule(id: SenaWorkspaceBoundaryModuleId): SenaWorkspaceBoundaryModule {
  const boundary = SENA_WORKSPACE_MODULE_BOUNDARIES.modules.find((candidate) => candidate.id === id);
  expect(boundary, `Missing workspace boundary module ${id}`).toBeDefined();
  return boundary! as SenaWorkspaceBoundaryModule;
}

function mainWorkspaceSource() {
  return readFileSync(new URL("../../../components/sena/SenaFusionWorkspace.tsx", import.meta.url), "utf8");
}

function workspaceHookSource() {
  return readFileSync(new URL("../../../components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts", import.meta.url), "utf8");
}

function workspaceContainerSource() {
  return [
    mainWorkspaceSource(),
    workspaceHookSource()
  ].join("\n");
}

function reportAndStatsCompositionSource() {
  return [
    workspaceContainerSource(),
    readFileSync(new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-container-props.ts", import.meta.url), "utf8")
  ].join("\n");
}

function centralPlotCompositionSource() {
  return [
    workspaceContainerSource(),
    readFileSync(new URL("../../../components/sena/workspace/workspace-central-plot-deck-container-props.ts", import.meta.url), "utf8")
  ].join("\n");
}

function rightInspectorCompositionSource() {
  return [
    workspaceContainerSource(),
    readFileSync(new URL("../../../components/sena/workspace/workspace-right-inspector-container-props.ts", import.meta.url), "utf8")
  ].join("\n");
}

function enterpriseRuntimeCompositionSource() {
  return [
    workspaceContainerSource(),
    readFileSync(new URL("../../../components/sena/workspace/workspace-enterprise-runtime-container-props.ts", import.meta.url), "utf8")
  ].join("\n");
}

function headerLeftRailCompositionSource() {
  return [
    workspaceContainerSource(),
    readFileSync(new URL("../../../components/sena/workspace/workspace-header-left-rail-container-props.ts", import.meta.url), "utf8")
  ].join("\n");
}

function fusionOverlayRailMainShellCompositionSource() {
  return [
    workspaceContainerSource(),
    readFileSync(new URL("../../../components/sena/workspace/workspace-fusion-overlay-rail-main-shell-container-props.ts", import.meta.url), "utf8")
  ].join("\n");
}

function staticWorkspaceConfigSource() {
  return readFileSync(new URL("../../../components/sena/workspace/workspace-static-config.tsx", import.meta.url), "utf8");
}

function analysisRuntimeSource() {
  return readFileSync(new URL("../../../components/sena/workspace/analysis-runtime.ts", import.meta.url), "utf8");
}

function enterpriseRuntimePanelSource() {
  return readFileSync(new URL("../../../components/sena/workspace/enterprise-runtime-panel.tsx", import.meta.url), "utf8");
}

describe("SENA workspace module boundaries", () => {
  it("keeps server-side snapshot restore validators out of the client-safe analysis adapter", () => {
    const source = analysisRuntimeSource();

    expect(source).not.toContain("importSenaProjectSnapshot");
    expect(source).not.toContain("importSenaReviewPacket");
  });

  it("declares the main workspace container boundaries as typed manifest data", () => {
    expect(SENA_WORKSPACE_MODULE_BOUNDARIES.container).toMatchObject({
      id: "SenaFusionWorkspace",
      directFetchPolicy: "forbidden",
      requestTokenState: "delegated-to-runtime-hook"
    });
    expect(SENA_WORKSPACE_MODULE_BOUNDARIES.container.delegatedModules).toEqual([
      "enterprise-contracts",
      "workspace-loader",
      "enterprise-options",
      "analysis-runtime",
      "api-client",
      "use-sena-fusion-workspace-main-shell-props",
      "use-enterprise-runtime",
      "use-enterprise-refresh-actions",
      "use-enterprise-mfa-actions",
      "use-enterprise-team-actions",
      "use-enterprise-notification-actions",
      "use-enterprise-upload-storage-actions",
      "use-enterprise-import-actions",
      "use-enterprise-json-artifact-export-action",
      "use-enterprise-project-actions",
      "use-enterprise-publication-actions",
      "use-enterprise-provisioning-readiness-actions",
      "use-enterprise-collaboration-actions",
      "use-enterprise-collaboration-effects",
      "use-fusion-plot-interactions",
      "use-temporal-animation-effects",
      "use-fusion-canvas-selection-state",
      "use-demo-verification-manual-review-actions",
      "use-data-contract-evidence-export-actions",
      "use-contract-upload-action",
      "use-current-project-snapshot-builder",
      "use-data-import-mapped-table-actions",
      "use-project-snapshot-export-actions",
      "use-project-snapshot-restore-action",
      "use-report-and-evidence-artifact-export-actions",
      "use-runtime-bundle-export-actions",
      "use-temporal-runtime-trace-export-actions",
      "use-method-artifact-export-actions",
      "use-runtime-manifest-export-actions",
      "use-sena-report-export-actions",
      "use-enterprise-validation-actions",
      "use-enterprise-expert-review-actions",
      "use-enterprise-reliability-actions",
      "use-enterprise-platform-decision-actions",
      "use-enterprise-release-gate-actions",
      "use-enterprise-go-live-actions",
      "use-enterprise-governance-export-actions",
      "use-enterprise-ops-alerts-actions",
      "use-enterprise-audit-backup-actions",
      "use-enterprise-database-sync-actions",
      "enterprise-actions",
      "enterprise-ops-actions",
      "enterprise-governance-notifications-panel",
      "enterprise-upload-storage-panel",
      "enterprise-platform-decision-panel",
      "enterprise-collaboration-sso-panel",
      "enterprise-account-security-panel",
      "enterprise-provisioning-readiness-panel",
      "enterprise-team-operations-panel",
      "enterprise-collaboration-project-panel",
      "enterprise-local-validation-panel",
      "enterprise-runtime-header-panel",
      "enterprise-server-project-controls-panel",
      "enterprise-runtime-panel",
      "workspace-enterprise-runtime-section",
      "workspace-enterprise-runtime-container-props",
      "workspace-enterprise-runtime-prop-group",
      "workspace-enterprise-runtime-validation-prop-group",
      "workspace-enterprise-runtime-project-prop-group",
      "workspace-enterprise-runtime-governance-prop-group",
      "workspace-enterprise-runtime-ops-prop-group",
      "workspace-enterprise-runtime-upload-prop-group",
      "workspace-enterprise-runtime-collaboration-prop-group",
      "workspace-enterprise-runtime-provisioning-prop-group",
      "workspace-enterprise-runtime-account-security-prop-group",
      "workspace-enterprise-runtime-team-operations-prop-group",
      "workspace-enterprise-runtime-platform-decision-prop-group",
      "workspace-enterprise-runtime-release-gate-prop-group",
      "workspace-enterprise-runtime-collaboration-project-prop-group",
      "enterprise-ops-exports",
      "enterprise-release-gate-panel",
      "workspace-primitives",
      "workspace-shell-panels",
      "workspace-static-config",
      "workspace-header-section",
      "pilot-assets-panel",
      "workspace-left-rail-panel-section",
      "workspace-data-import-panel",
      "workspace-data-import-feedback-section",
      "model-builder-panel",
      "plot-tools-panel",
      "uploaded-table-mapper",
      "matrix-preview",
      "report-generator",
      "workspace-report-section",
      "runtime-provenance-panels",
      "central-fusion-analysis-scope",
      "workspace-central-plot-deck",
      "workspace-central-plot-deck-render",
      "workspace-central-plot-deck-render-props",
      "workspace-central-plot-deck-body-props",
      "workspace-central-plot-deck-body",
      "workspace-central-plot-deck-view-panel-branches",
      "workspace-central-plot-deck-fusion-panel",
      "workspace-central-plot-deck-temporal-panel",
      "workspace-central-plot-deck-dual-lens-panel",
      "workspace-central-plot-deck-ena-space-panel",
      "workspace-central-plot-deck-sna-metrics-panel",
      "workspace-central-plot-deck-evidence-ledger-panel",
      "workspace-central-plot-deck-matrix-panel",
      "workspace-central-plot-deck-view-panel-props",
      "workspace-central-plot-deck-shell-controls",
      "workspace-central-plot-deck-container-props",
      "workspace-central-plot-deck-prop-group",
      "workspace-central-plot-deck-composition-prop-group",
      "workspace-central-plot-deck-composition-field-prop-group",
      "workspace-central-plot-deck-boundary-composition-field-prop-group",
      "workspace-central-plot-deck-boundary-composition-prop-group",
      "workspace-central-plot-temporal-controls-prop-group",
      "workspace-central-plot-temporal-controls-field-prop-group",
      "workspace-central-plot-temporal-controls-composition-field-prop-group",
      "workspace-central-plot-temporal-controls-composition-prop-group",
      "workspace-central-plot-temporal-controls-boundary-composition-field-prop-group",
      "workspace-central-plot-temporal-controls-boundary-composition-prop-group",
      "workspace-central-plot-evidence-prop-group",
      "workspace-central-plot-evidence-field-prop-group",
      "workspace-central-plot-evidence-composition-field-prop-group",
      "workspace-central-plot-evidence-composition-prop-group",
      "workspace-central-plot-evidence-boundary-composition-field-prop-group",
      "workspace-central-plot-evidence-boundary-composition-prop-group",
      "workspace-central-plot-data-view-prop-group",
      "workspace-central-plot-data-view-field-prop-group",
      "workspace-central-plot-data-view-composition-field-prop-group",
      "workspace-central-plot-data-view-composition-prop-group",
      "workspace-central-plot-data-view-boundary-composition-field-prop-group",
      "workspace-central-plot-data-view-boundary-composition-prop-group",
      "workspace-central-plot-interaction-prop-group",
      "workspace-central-plot-interaction-field-prop-group",
      "workspace-central-plot-interaction-composition-field-prop-group",
      "workspace-central-plot-interaction-composition-prop-group",
      "workspace-central-plot-interaction-boundary-composition-field-prop-group",
      "workspace-central-plot-interaction-boundary-composition-prop-group",
      "workspace-central-plot-model-prop-group",
      "workspace-central-plot-model-field-prop-group",
      "workspace-central-plot-model-composition-field-prop-group",
      "workspace-central-plot-model-composition-prop-group",
      "workspace-central-plot-model-boundary-composition-field-prop-group",
      "workspace-central-plot-model-boundary-composition-prop-group",
      "workspace-central-plot-view-state-prop-group",
      "workspace-central-plot-view-state-field-prop-group",
      "workspace-central-plot-view-state-composition-field-prop-group",
      "workspace-central-plot-view-state-composition-prop-group",
      "workspace-central-plot-view-state-boundary-composition-field-prop-group",
      "workspace-central-plot-view-state-boundary-composition-prop-group",
      "workspace-secondary-comparison-lens",
      "workspace-right-inspector-column",
      "workspace-right-inspector-container-props",
      "workspace-right-inspector-prop-group",
      "workspace-right-inspector-layout-prop-group",
      "workspace-right-inspector-layout-field-prop-group",
      "workspace-right-inspector-layout-composition-field-prop-group",
      "workspace-right-inspector-layout-composition-prop-group",
      "workspace-right-inspector-layout-boundary-composition-field-prop-group",
      "workspace-right-inspector-layout-boundary-composition-prop-group",
      "workspace-right-inspector-evidence-prop-group",
      "workspace-right-inspector-evidence-field-prop-group",
      "workspace-right-inspector-evidence-composition-field-prop-group",
      "workspace-right-inspector-evidence-composition-prop-group",
      "workspace-right-inspector-evidence-boundary-composition-field-prop-group",
      "workspace-right-inspector-evidence-boundary-composition-prop-group",
      "workspace-right-inspector-model-prop-group",
      "workspace-right-inspector-model-field-prop-group",
      "workspace-right-inspector-model-boundary-composition-field-prop-group",
      "workspace-right-inspector-model-boundary-composition-prop-group",
      "workspace-right-inspector-selection-prop-group",
      "workspace-right-inspector-selection-field-prop-group",
      "workspace-right-inspector-selection-boundary-composition-field-prop-group",
      "workspace-right-inspector-selection-boundary-composition-prop-group",
      "workspace-right-inspector-composition-prop-group",
      "workspace-right-inspector-composition-field-prop-group",
      "workspace-right-inspector-boundary-composition-field-prop-group",
      "workspace-right-inspector-boundary-composition-prop-group",
      "evidence-ledger-panel",
      "dual-lens-dashboard",
      "ena-space-plot",
      "fusion-canvas",
      "fusion-orbit-layer",
      "fusion-plane-orbit",
      "fusion-plot-overlay",
      "fusion-layer-key",
      "inspector-panel",
      "workspace-stats-panel",
      "timeline-trace",
      "temporal-window-builder",
      "workspace-data-view-drawer",
      "temporal-runtime-trace-panel",
      "data-contract-audit-panel",
      "sena-stats-tables",
      "workspace-report-and-stats-deck-section",
      "workspace-report-and-stats-deck-container-props",
      "workspace-report-and-stats-deck-prop-group",
      "workspace-header-left-rail-container-props",
      "workspace-fusion-overlay-rail-main-shell-container-props",
      "workspace-main-shell-section",
      "workspace-main-shell-render",
      "workspace-main-shell-prop-group",
      "workspace-main-shell-boundary-composition-field-prop-group",
      "workspace-main-shell-boundary-composition-prop-group",
      "workspace-fusion-plot-maximized-overlay-prop-group",
      "workspace-fusion-plot-overlay-selection-prop-group",
      "workspace-fusion-plot-overlay-selection-field-prop-group",
      "workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-selection-boundary-composition-prop-group",
      "workspace-fusion-plot-overlay-model-prop-group",
      "workspace-fusion-plot-overlay-model-field-prop-group",
      "workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-model-boundary-composition-prop-group",
      "workspace-fusion-plot-overlay-zoom-prop-group",
      "workspace-fusion-plot-overlay-zoom-field-prop-group",
      "workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group",
      "workspace-fusion-plot-overlay-composition-prop-group",
      "workspace-fusion-plot-overlay-composition-field-prop-group",
      "workspace-fusion-plot-overlay-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-boundary-composition-prop-group",
      "workspace-rail-prop-group",
      "workspace-rail-field-prop-group",
      "workspace-rail-composition-field-prop-group",
      "workspace-rail-composition-prop-group",
      "workspace-rail-boundary-composition-field-prop-group",
      "workspace-rail-boundary-composition-prop-group",
      "workspace-rail-mode-handler-prop-group",
      "workspace-header-prop-group",
      "workspace-header-composition-prop-group",
      "workspace-header-composition-field-prop-group",
      "workspace-header-boundary-composition-field-prop-group",
      "workspace-header-boundary-composition-prop-group",
      "workspace-header-export-prop-group",
      "workspace-header-export-field-prop-group",
      "workspace-header-temporal-summary-prop-group",
      "workspace-header-temporal-summary-field-prop-group",
      "workspace-left-rail-prop-group",
      "workspace-left-rail-composition-prop-group",
      "workspace-left-rail-composition-field-prop-group",
      "workspace-left-rail-boundary-composition-field-prop-group",
      "workspace-left-rail-boundary-composition-prop-group",
      "workspace-left-rail-panel-data-prop-group",
      "workspace-left-rail-panel-data-field-prop-group",
      "workspace-left-rail-panel-data-boundary-composition-field-prop-group",
      "workspace-left-rail-panel-data-boundary-composition-prop-group",
      "workspace-left-rail-panel-model-prop-group",
      "workspace-left-rail-panel-model-field-prop-group",
      "workspace-left-rail-panel-model-boundary-composition-field-prop-group",
      "workspace-left-rail-panel-model-boundary-composition-prop-group",
      "workspace-left-rail-workflow-prop-group",
      "workspace-left-rail-workflow-boundary-composition-field-prop-group",
      "workspace-left-rail-workflow-boundary-composition-prop-group",
      "workspace-report-generator-prop-group",
      "workspace-report-generator-composition-field-prop-group",
      "workspace-report-generator-composition-prop-group",
      "workspace-report-generator-boundary-composition-field-prop-group",
      "workspace-report-generator-boundary-composition-prop-group",
      "workspace-report-generator-report-composition-field-prop-group",
      "workspace-report-generator-report-composition-prop-group",
      "workspace-report-generator-report-composition-boundary-field-prop-group",
      "workspace-report-generator-report-composition-boundary-prop-group",
      "workspace-report-generator-governance-prop-group",
      "workspace-report-generator-governance-composition-field-prop-group",
      "workspace-report-generator-governance-composition-prop-group",
      "workspace-report-generator-governance-boundary-composition-field-prop-group",
      "workspace-report-generator-governance-boundary-composition-prop-group",
      "workspace-report-generator-governance-field-prop-group",
      "workspace-report-generator-reliability-prop-group",
      "workspace-report-generator-reliability-composition-field-prop-group",
      "workspace-report-generator-reliability-composition-prop-group",
      "workspace-report-generator-reliability-boundary-composition-field-prop-group",
      "workspace-report-generator-reliability-boundary-composition-prop-group",
      "workspace-report-generator-reliability-field-prop-group",
      "workspace-report-generator-export-prop-group",
      "workspace-report-generator-export-composition-field-prop-group",
      "workspace-report-generator-export-composition-prop-group",
      "workspace-report-generator-export-boundary-composition-field-prop-group",
      "workspace-report-generator-export-boundary-composition-prop-group",
      "workspace-report-generator-export-callback-prop-group",
      "workspace-report-generator-review-metadata-prop-group",
      "workspace-report-generator-review-metadata-composition-field-prop-group",
      "workspace-report-generator-review-metadata-composition-prop-group",
      "workspace-report-generator-review-metadata-boundary-composition-field-prop-group",
      "workspace-report-generator-review-metadata-boundary-composition-prop-group",
      "workspace-report-generator-review-status-field-prop-group",
      "workspace-report-generator-review-status-prop-group",
      "workspace-report-generator-audit-summary-prop-group",
      "workspace-report-generator-audit-summary-composition-field-prop-group",
      "workspace-report-generator-audit-summary-composition-prop-group",
      "workspace-report-generator-audit-summary-boundary-composition-field-prop-group",
      "workspace-report-generator-audit-summary-boundary-composition-prop-group",
      "workspace-report-generator-audit-summary-field-prop-group",
      "workspace-data-import-prop-group",
      "workspace-data-import-field-prop-group",
      "workspace-model-builder-prop-group",
      "workspace-model-builder-field-prop-group",
      "workspace-plot-tools-prop-group",
      "workspace-plot-tools-field-prop-group",
      "workspace-stats-prop-group",
      "workspace-stats-field-prop-group",
      "workspace-data-contract-audit-prop-group",
      "workspace-data-contract-audit-field-prop-group",
      "workspace-data-import-feedback-prop-group",
      "workspace-data-import-feedback-field-prop-group",
      "workspace-workflow-steps-prop-group",
      "workspace-workflow-steps-field-prop-group",
      "workspace-report-and-stats-deck-metrics-prop-group",
      "workspace-report-and-stats-deck-metrics-field-prop-group",
      "workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group",
      "workspace-report-and-stats-deck-metrics-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-evidence-prop-group",
      "workspace-report-and-stats-deck-evidence-field-prop-group",
      "workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group",
      "workspace-report-and-stats-deck-evidence-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-report-prop-group",
      "workspace-report-and-stats-deck-report-field-prop-group",
      "workspace-report-and-stats-deck-report-boundary-composition-field-prop-group",
      "workspace-report-and-stats-deck-report-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-composition-prop-group",
      "workspace-report-and-stats-deck-composition-field-prop-group",
      "workspace-report-and-stats-deck-composition-boundary-field-prop-group",
      "workspace-report-and-stats-deck-composition-boundary-prop-group",
      "workspace-report-and-stats-deck-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-boundary-composition-field-prop-group",
      "fusion-math-audit-panel",
      "method-formula-panel",
      "method-validation-panel",
      "temporal-fusion-arc"
    ]);
  });

  it("keeps the full workspace behind a lightweight dynamic loader", () => {
    const loader = boundaryModule("workspace-loader");

    expect(loader.runtimeExports).toMatchObject({
      SenaFusionWorkspaceLoader
    });
    expect(loader.containerResponsibilities).toEqual([
      "render a lightweight loading shell before the full workspace bundle is requested",
      "avoid server-prerendering the entire interactive workbench HTML"
    ]);
    expect(loader.testIds).toContain("sena-workspace-loading");
  });

  it("keeps the workspace component thin by delegating state and action wiring to a client hook", () => {
    const mainSource = mainWorkspaceSource();
    const hookSource = workspaceHookSource();

    expect(mainSource).toContain("useSenaFusionWorkspaceMainShellProps()");
    expect(mainSource).toContain("return renderWorkspaceMainShell(workspaceMainShellSectionProps);");
    expect(mainSource).not.toContain("useState(");
    expect(mainSource).not.toContain("useEnterpriseWorkspaceApi(");
    expect(hookSource).toContain("export function useSenaFusionWorkspaceMainShellProps()");
    expect(hookSource).toContain("const [dataset, setDataset] = useState(() => lessonStudySenaContract);");
    expect(hookSource).toContain("const workspaceMainShellSectionProps = buildWorkspaceFusionOverlayRailMainShellContainerProps({");
    expect(boundaryModule("use-sena-fusion-workspace-main-shell-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      useSenaFusionWorkspaceMainShellProps
    });
  });

  it("keeps the main workspace container under an explicit extraction budget", () => {
    const workspaceSource = mainWorkspaceSource();
    const lineCount = workspaceSource.split(/\r?\n/).length;
    const budget = SENA_WORKSPACE_MODULE_BOUNDARIES.container.sizeBudget;

    expect(lineCount).toBeLessThanOrEqual(budget.maxLinesBeforeNextExtraction);
    expect(budget.observedLines).toBe(9);
    expect(budget.maxLinesBeforeNextExtraction).toBe(120);
    expect(budget.nextExtractionTarget).toBe("sena-fusion-workspace-container-derived-data-and-action-state-extraction");
    expect(budget.nextExtractionCandidates).toContain("sena fusion workspace container derived data and action state extraction");
  });

  it("keeps static workspace configuration and helpers outside the main container", () => {
    const workspaceSource = workspaceContainerSource();
    const staticConfigSource = staticWorkspaceConfigSource();

    expect(workspaceSource).toContain("} from \"./workspace-static-config\";");
    expect(workspaceSource).not.toContain("function StatsNetworkMetricsIcon");
    expect(workspaceSource).not.toContain("function ModelLayerStackIcon");
    expect(workspaceSource).not.toContain("const workspaceRailItems: WorkspaceRailItem[]");
    expect(workspaceSource).not.toContain("function downloadText(");
    expect(staticConfigSource).toContain("export function StatsNetworkMetricsIcon");
    expect(staticConfigSource).toContain("export function ModelLayerStackIcon");
    expect(staticConfigSource).toContain("export const workspaceRailItems");
    expect(staticConfigSource).toContain("export function downloadText");
    expect(boundaryModule("workspace-static-config" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      SHOW_ARCHIVED_FORMULA_PANEL,
      StatsNetworkMetricsIcon,
      downloadText,
      formatDelta,
      formatNumber,
      layerCopy,
      layoutOptions,
      platformDecisionTimestampedEvidenceIds,
      plotViewOptions,
      productionPageContract,
      senaEnterpriseImportFileAccept,
      temporalModeOptions,
      upperTriangleTotal,
      workflowSteps,
      workspaceRailItems,
      workspaceRailPanelCopy
    });
  });

  it("keeps enterprise response contracts in a focused typed contracts module", () => {
    const contracts = boundaryModule("enterprise-contracts");

    expect(contracts.typeExports).toEqual(expect.arrayContaining([...requiredContractTypes]));
    expect(contracts.containerResponsibilities).toEqual([
      "consume imported enterprise response types",
      "avoid redeclaring enterprise response contracts inline"
    ]);
  });

  it("keeps enterprise workspace option sets in a focused module", () => {
    const options = boundaryModule("enterprise-options");

    expect(options.runtimeExports).toMatchObject({
      enterprisePlatformDecisionOptions,
      enterpriseSsoProviderOptions,
      enterpriseValidationMetrics
    });
    expect(options.containerResponsibilities).toEqual([
      "render imported option collections",
      "avoid declaring enterprise option arrays inline"
    ]);
  });

  it("keeps SENA analysis runtime imports behind a client-safe adapter seam", () => {
    const analysisRuntime = boundaryModule("analysis-runtime");

    expect(analysisRuntime.runtimeExports).toMatchObject({
      buildSenaModel,
      buildSenaReport,
      importSenaJsonContract
    });
    expect(analysisRuntime.containerResponsibilities).toEqual([
      "call imported runtime adapter functions",
      "avoid importing from the lib/sena barrel in client workspace modules"
    ]);
  });

  it("routes enterprise JSON refresh calls through the workspace API helper", () => {
    const apiClient = boundaryModule("api-client");

    expect(apiClient.runtimeExports).toMatchObject({
      requestSenaWorkspaceJson,
      SENA_WORKSPACE_API_ROUTES
    });
    expect(SENA_WORKSPACE_MODULE_BOUNDARIES.container.refreshContracts).toEqual([
      {
        state: "EnterpriseTeamState",
        route: SENA_WORKSPACE_API_ROUTES.enterprise.team,
        transport: "requestSenaWorkspaceJson"
      },
      {
        state: "EnterprisePlatformDecisionState",
        route: SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions,
        transport: "requestSenaWorkspaceJson"
      },
      {
        state: "EnterpriseReleaseGateState",
        route: SENA_WORKSPACE_API_ROUTES.enterprise.releaseGate,
        transport: "requestSenaWorkspaceJson"
      }
    ]);
  });

  it("keeps enterprise request token state in a runtime hook", () => {
    const runtimeHook = boundaryModule("use-enterprise-runtime");

    expect(runtimeHook.runtimeExports).toMatchObject({
      useEnterpriseWorkspaceApi
    });
    expect(runtimeHook.ownedState).toEqual(["EnterpriseCsrfToken"]);
    expect(runtimeHook.containerResponsibilities).toEqual([
      "call useEnterpriseWorkspaceApi",
      "reset CSRF state through resetEnterpriseCsrfToken"
    ]);
  });

  it("keeps enterprise refresh callbacks in a focused runtime hook", () => {
    const refreshHookPath = new URL("../../../components/sena/workspace/use-enterprise-refresh-actions.ts", import.meta.url);
    const refreshHookSource = existsSync(refreshHookPath) ? readFileSync(refreshHookPath, "utf8") : "";
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const refreshHook = boundaryModule("use-enterprise-refresh-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(refreshHookPath)).toBe(true);
    expect(refreshHookSource).toContain("export function useEnterpriseRefreshActions");
    expect(refreshHookSource).toContain("refreshEnterpriseTeamState");
    expect(refreshHookSource).toContain("refreshEnterpriseState");
    expect(refreshHookSource).toContain("SENA_WORKSPACE_API_ROUTES.enterprise.team");
    expect(refreshHookSource).toContain("SENA_WORKSPACE_API_ROUTES.auth.me");
    expect(refreshHookSource).toContain("logoutEnterpriseSessionFromWorkspace");
    expect(refreshHookSource).toContain("logoutEnterpriseSessionAction");
    expect(refreshHookSource).toContain("No active enterprise session is signed in.");
    expect(refreshHookSource).toContain("Signed out of the SENA enterprise runtime.");
    expect(refreshHookSource).toContain("revokeEnterpriseSessionAction");
    expect(refreshHookSource).toContain("Sign in before managing sessions.");
    expect(refreshHookSource).toContain("SENA_SCHEMA_VERSIONS.enterpriseSessionList");
    expect(refreshHookSource).toContain("Revoked ${payload.revokedCount");
    expect(workspaceSource).not.toContain("Could not load team state.");
    expect(workspaceSource).not.toContain("Could not load enterprise session.");
    expect(workspaceSource).not.toContain("No active enterprise session is signed in.");
    expect(workspaceSource).not.toContain("Signed out of the SENA enterprise runtime.");
    expect(workspaceSource).not.toContain("Enterprise logout failed.");
    expect(workspaceSource).not.toContain("Sign in before managing sessions.");
    expect(workspaceSource).not.toContain("SENA_SCHEMA_VERSIONS.enterpriseSessionList");
    expect(workspaceSource).not.toContain("Session revoke failed.");
    expect(refreshHook.runtimeExports).toMatchObject({
      useEnterpriseRefreshActions
    });
    expect(refreshHook.containerResponsibilities).toEqual([
      "own enterprise refresh callbacks for session, team, MFA status, platform decisions, release gate, imports, analysis runs, logout, and session revoke",
      "keep refresh request route literals, logout and revoke action calls, session-list patching, and reset-on-missing-session state cleanup outside the main workspace container"
    ]);
  });

  it("keeps enterprise MFA mutation callbacks in a focused runtime hook", () => {
    const mfaHookPath = new URL("../../../components/sena/workspace/use-enterprise-mfa-actions.ts", import.meta.url);
    const mfaHookSource = existsSync(mfaHookPath) ? readFileSync(mfaHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const mfaHook = boundaryModule("use-enterprise-mfa-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(mfaHookPath)).toBe(true);
    expect(mfaHookSource).toContain("export function useEnterpriseMfaActions");
    expect(mfaHookSource).toContain("startEnterpriseMfaSetupAction");
    expect(mfaHookSource).toContain("enableEnterpriseMfaAction");
    expect(mfaHookSource).toContain("disableEnterpriseMfaAction");
    expect(mfaHookSource).toContain("Sign in before setting up authenticator MFA.");
    expect(mfaHookSource).toContain("Start MFA setup and enter the authenticator code before enabling.");
    expect(mfaHookSource).toContain("Enter your current authenticator code before disabling MFA.");
    expect(mfaHookSource).toContain("Authenticator MFA enabled for this SENA account.");
    expect(mfaHookSource).toContain("Authenticator MFA disabled for this SENA account.");
    expect(workspaceSource).not.toContain("startEnterpriseMfaSetupAction");
    expect(workspaceSource).not.toContain("enableEnterpriseMfaAction");
    expect(workspaceSource).not.toContain("disableEnterpriseMfaAction");
    expect(workspaceSource).not.toContain("Sign in before setting up authenticator MFA.");
    expect(workspaceSource).not.toContain("Start MFA setup and enter the authenticator code before enabling.");
    expect(workspaceSource).not.toContain("Enter your current authenticator code before disabling MFA.");
    expect(workspaceSource).not.toContain("MFA setup failed.");
    expect(workspaceSource).not.toContain("MFA enable failed.");
    expect(workspaceSource).not.toContain("MFA disable failed.");
    expect(mfaHook.runtimeExports).toMatchObject({
      useEnterpriseMfaActions
    });
    expect(mfaHook.containerResponsibilities).toEqual([
      "own enterprise authenticator MFA setup, enable, and disable callbacks",
      "keep MFA action calls, setup-token binding, authenticator-code validation, and MFA status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise team mutation callbacks in a focused runtime hook", () => {
    const teamHookPath = new URL("../../../components/sena/workspace/use-enterprise-team-actions.ts", import.meta.url);
    const teamHookSource = existsSync(teamHookPath) ? readFileSync(teamHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const teamHook = boundaryModule("use-enterprise-team-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(teamHookPath)).toBe(true);
    expect(teamHookSource).toContain("export function useEnterpriseTeamActions");
    expect(teamHookSource).toContain("createTeamInvitationAction");
    expect(teamHookSource).toContain("acceptTeamInvitationAction");
    expect(teamHookSource).toContain("revokeTeamInvitationAction");
    expect(teamHookSource).toContain("updateTeamMembershipAction");
    expect(teamHookSource).toContain("Choose a team and enter an email before creating an invitation.");
    expect(teamHookSource).toContain("Paste an invitation code before accepting an invitation.");
    expect(teamHookSource).toContain("Invitation queued for ${payload.invitation?.email");
    expect(teamHookSource).toContain("Invitation accepted for ${payload.context?.teams");
    expect(teamHookSource).toContain("Invitation revoked for ${payload.invitation?.email");
    expect(teamHookSource).toContain("Membership ${payload.membership?.id");
    expect(workspaceSource).not.toContain("createTeamInvitationAction");
    expect(workspaceSource).not.toContain("acceptTeamInvitationAction");
    expect(workspaceSource).not.toContain("revokeTeamInvitationAction");
    expect(workspaceSource).not.toContain("updateTeamMembershipAction");
    expect(workspaceSource).not.toContain("Choose a team and enter an email before creating an invitation.");
    expect(workspaceSource).not.toContain("Paste an invitation code before accepting an invitation.");
    expect(workspaceSource).not.toContain("Invitation failed.");
    expect(workspaceSource).not.toContain("Invitation acceptance failed.");
    expect(workspaceSource).not.toContain("Invitation revoke failed.");
    expect(workspaceSource).not.toContain("Membership update failed.");
    expect(teamHook.runtimeExports).toMatchObject({
      useEnterpriseTeamActions
    });
    expect(teamHook.containerResponsibilities).toEqual([
      "own enterprise team invitation create, accept, revoke, and membership update callbacks",
      "keep team action calls, invite-code validation, team refresh choreography, and team status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise notification callbacks in a focused runtime hook", () => {
    const notificationHookPath = new URL("../../../components/sena/workspace/use-enterprise-notification-actions.ts", import.meta.url);
    const notificationHookSource = existsSync(notificationHookPath) ? readFileSync(notificationHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const notificationHook = boundaryModule("use-enterprise-notification-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(notificationHookPath)).toBe(true);
    expect(notificationHookSource).toContain("export function useEnterpriseNotificationActions");
    expect(notificationHookSource).toContain("markEnterpriseNotificationReadAction");
    expect(notificationHookSource).toContain("deliverEnterpriseNotificationsAction");
    expect(notificationHookSource).toContain("Notification ${payload.notification?.id");
    expect(notificationHookSource).toContain("Sign in before running notification delivery.");
    expect(notificationHookSource).toContain("Notification webhook delivery checked ${payload.notifications?.length");
    expect(notificationHookSource).toContain("Sign in before running email delivery.");
    expect(notificationHookSource).toContain("Institution email delivery checked ${payload.deliveries?.length");
    expect(workspaceSource).not.toContain("markEnterpriseNotificationReadAction");
    expect(workspaceSource).not.toContain("deliverEnterpriseNotificationsAction");
    expect(workspaceSource).not.toContain("Notification update failed.");
    expect(workspaceSource).not.toContain("Sign in before running notification delivery.");
    expect(workspaceSource).not.toContain("Notification delivery failed.");
    expect(workspaceSource).not.toContain("Sign in before running email delivery.");
    expect(workspaceSource).not.toContain("Email delivery failed.");
    expect(notificationHook.runtimeExports).toMatchObject({
      useEnterpriseNotificationActions
    });
    expect(notificationHook.containerResponsibilities).toEqual([
      "own enterprise notification mark-read, webhook delivery, and email delivery callbacks",
      "keep notification action calls, delivery target binding, team refresh choreography, and notification status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise upload storage callbacks in a focused runtime hook", () => {
    const uploadHookPath = new URL("../../../components/sena/workspace/use-enterprise-upload-storage-actions.ts", import.meta.url);
    const uploadHookSource = existsSync(uploadHookPath) ? readFileSync(uploadHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const uploadHook = boundaryModule("use-enterprise-upload-storage-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(uploadHookPath)).toBe(true);
    expect(uploadHookSource).toContain("export function useEnterpriseUploadStorageActions");
    expect(uploadHookSource).toContain("refreshEnterpriseUploadStorageAction");
    expect(uploadHookSource).toContain("createEnterpriseUploadRegistryFilesAction");
    expect(uploadHookSource).toContain("deliverEnterpriseUploadObjectStorageAction");
    expect(uploadHookSource).toContain("event.currentTarget.value = \"\"");
    expect(uploadHookSource).toContain("Sign in before loading enterprise upload storage.");
    expect(uploadHookSource).toContain("Upload storage ${verification.status");
    expect(uploadHookSource).toContain("Sign in with an active team before creating enterprise uploads.");
    expect(uploadHookSource).toContain("Enterprise upload registry created ${payload.uploads?.length");
    expect(uploadHookSource).toContain("Sign in before delivering enterprise uploads to object storage.");
    expect(uploadHookSource).toContain("Object-storage delivery ${payload.status");
    expect(workspaceSource).not.toContain("refreshEnterpriseUploadStorageAction");
    expect(workspaceSource).not.toContain("createEnterpriseUploadRegistryFilesAction");
    expect(workspaceSource).not.toContain("deliverEnterpriseUploadObjectStorageAction");
    expect(workspaceSource).not.toContain("Sign in before loading enterprise upload storage.");
    expect(workspaceSource).not.toContain("Upload storage refresh failed.");
    expect(workspaceSource).not.toContain("Sign in with an active team before creating enterprise uploads.");
    expect(workspaceSource).not.toContain("Enterprise upload failed.");
    expect(workspaceSource).not.toContain("Sign in before delivering enterprise uploads to object storage.");
    expect(workspaceSource).not.toContain("Object-storage delivery failed.");
    expect(uploadHook.runtimeExports).toMatchObject({
      useEnterpriseUploadStorageActions
    });
    expect(uploadHook.containerResponsibilities).toEqual([
      "own enterprise upload storage refresh, registry file creation, and object-storage delivery callbacks",
      "keep upload action calls, file input clearing, CSRF upload binding, object-storage delivery binding, and upload status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise import callbacks in a focused runtime hook", () => {
    const importHookPath = new URL("../../../components/sena/workspace/use-enterprise-import-actions.ts", import.meta.url);
    const importHookSource = existsSync(importHookPath) ? readFileSync(importHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const importHook = boundaryModule("use-enterprise-import-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(importHookPath)).toBe(true);
    expect(importHookSource).toContain("export function useEnterpriseImportActions");
    expect(importHookSource).toContain("importFilesViaEnterpriseApi");
    expect(importHookSource).toContain("importFilesLocallyWithEnterpriseAdapters");
    expect(importHookSource).toContain("importEnterpriseFilesAction");
    expect(importHookSource).toContain("importSenaEnterpriseFiles");
    expect(importHookSource).toContain("Enterprise import loaded ${files.length");
    expect(importHookSource).toContain("Local enterprise import loaded ${files.length");
    expect(importHookSource).toContain("Local import completed without sign-in");
    expect(importHookSource).toContain("Enterprise import ${payload.importRun?.id");
    expect(workspaceSource).not.toContain("importEnterpriseFilesAction");
    expect(workspaceSource).not.toContain("importSenaEnterpriseFiles");
    expect(workspaceSource).not.toContain("Enterprise import failed.");
    expect(workspaceSource).not.toContain("Local enterprise import failed.");
    expect(workspaceSource).not.toContain("Local import completed without sign-in");
    expect(importHook.runtimeExports).toMatchObject({
      useEnterpriseImportActions
    });
    expect(importHook.containerResponsibilities).toEqual([
      "own enterprise file import, persisted project hydration, import-run list updates, and local adapter fallback callbacks",
      "keep enterprise import action calls, dynamic adapter import, upload scan summaries, cleaning-manifest summaries, and import status messages outside the main workspace container"
    ]);
  });

  it("keeps generic enterprise JSON artifact export in a focused runtime hook", () => {
    const artifactExportHookPath = new URL("../../../components/sena/workspace/use-enterprise-json-artifact-export-action.ts", import.meta.url);
    const artifactExportHookSource = existsSync(artifactExportHookPath) ? readFileSync(artifactExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const artifactExportHook = boundaryModule("use-enterprise-json-artifact-export-action" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(artifactExportHookPath)).toBe(true);
    expect(artifactExportHookSource).toContain("export function useEnterpriseJsonArtifactExportAction");
    expect(artifactExportHookSource).toContain("exportEnterpriseJsonArtifactAction");
    expect(artifactExportHookSource).toContain("Sign in before exporting enterprise governance artifacts.");
    expect(artifactExportHookSource).toContain("downloadText(filename, JSON.stringify(payload, null, 2), \"application/json\")");
    expect(artifactExportHookSource).toContain("`${label} exported.`");
    expect(artifactExportHookSource).toContain("`${label} export failed.`");
    expect(workspaceSource).not.toContain("exportEnterpriseJsonArtifactAction");
    expect(workspaceSource).not.toContain("Sign in before exporting enterprise governance artifacts.");
    expect(workspaceSource).not.toContain("`${label} exported.`");
    expect(workspaceSource).not.toContain("`${label} export failed.`");
    expect(artifactExportHook.runtimeExports).toMatchObject({
      useEnterpriseJsonArtifactExportAction
    });
    expect(artifactExportHook.containerResponsibilities).toEqual([
      "own enterprise JSON artifact auth guard, busy-state binding, action call, JSON serialization, download callback, and status messages",
      "keep generic enterprise artifact export side effects outside the main workspace container while downstream enterprise hooks share one callback"
    ]);
  });

  it("keeps enterprise project persistence callbacks in a focused runtime hook", () => {
    const projectHookPath = new URL("../../../components/sena/workspace/use-enterprise-project-actions.ts", import.meta.url);
    const projectHookSource = existsSync(projectHookPath) ? readFileSync(projectHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const projectHook = boundaryModule("use-enterprise-project-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(projectHookPath)).toBe(true);
    expect(projectHookSource).toContain("export function useEnterpriseProjectActions");
    expect(projectHookSource).toContain("saveEnterpriseProjectAction");
    expect(projectHookSource).toContain("runEnterpriseAnalysisAction");
    expect(projectHookSource).toContain("openEnterpriseProjectAction");
    expect(projectHookSource).toContain("restoreEnterpriseProjectRevisionAction");
    expect(projectHookSource).toContain("SenaWorkspaceApiError");
    expect(projectHookSource).toContain("Sign in before saving server-side SENA projects.");
    expect(projectHookSource).toContain("Project version conflict.");
    expect(projectHookSource).toContain("Sign in before running server-side SENA analysis.");
    expect(projectHookSource).toContain("Server analysis ${payload.enterpriseAnalysisRun?.id");
    expect(projectHookSource).toContain("opened from server project storage.");
    expect(projectHookSource).toContain("Project revision restore conflict.");
    expect(workspaceSource).not.toContain("saveEnterpriseProjectAction");
    expect(workspaceSource).not.toContain("runEnterpriseAnalysisAction");
    expect(workspaceSource).not.toContain("openEnterpriseProjectAction");
    expect(workspaceSource).not.toContain("restoreEnterpriseProjectRevisionAction");
    expect(workspaceSource).not.toContain("Sign in before saving server-side SENA projects.");
    expect(workspaceSource).not.toContain("Project save failed.");
    expect(workspaceSource).not.toContain("Sign in before running server-side SENA analysis.");
    expect(workspaceSource).not.toContain("Server-side SENA analysis failed.");
    expect(workspaceSource).not.toContain("Could not open project.");
    expect(workspaceSource).not.toContain("Project revision restore failed.");
    expect(projectHook.runtimeExports).toMatchObject({
      useEnterpriseProjectActions
    });
    expect(projectHook.containerResponsibilities).toEqual([
      "own enterprise project save, open, revision restore, and server-side analysis callbacks",
      "keep project action calls, snapshot persistence binding, version conflict handling, analysis-run list updates, and project status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise publication export callbacks in a focused runtime hook", () => {
    const publicationHookPath = new URL("../../../components/sena/workspace/use-enterprise-publication-actions.ts", import.meta.url);
    const publicationHookSource = existsSync(publicationHookPath) ? readFileSync(publicationHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const publicationHook = boundaryModule("use-enterprise-publication-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(publicationHookPath)).toBe(true);
    expect(publicationHookSource).toContain("export function useEnterprisePublicationActions");
    expect(publicationHookSource).toContain("exportEnterprisePublicationAction");
    expect(publicationHookSource).toContain("Sign in before using enterprise publication exports.");
    expect(publicationHookSource).toContain("Save or open a server-side project before using enterprise publication exports.");
    expect(publicationHookSource).not.toContain("buildCurrentProjectSnapshot");
    expect(publicationHookSource).toContain("URL.createObjectURL");
    expect(publicationHookSource).toContain("document.createElement(\"a\")");
    expect(publicationHookSource).toContain("exported from the enterprise publication API");
    expect(publicationHookSource).toContain("Publication export failed.");
    expect(workspaceSource).not.toContain("exportEnterprisePublicationAction");
    expect(workspaceSource).not.toContain("Sign in before using enterprise publication exports.");
    expect(workspaceSource).not.toContain("Publication export failed.");
    expect(publicationHook.runtimeExports).toMatchObject({
      useEnterprisePublicationActions
    });
    expect(publicationHook.containerResponsibilities).toEqual([
      "own enterprise publication export callbacks",
      "keep project-bound publication export calls, Blob download binding, and publication status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise collaboration callbacks in a focused runtime hook", () => {
    const collaborationHookPath = new URL("../../../components/sena/workspace/use-enterprise-collaboration-actions.ts", import.meta.url);
    const collaborationHookSource = existsSync(collaborationHookPath) ? readFileSync(collaborationHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const collaborationHook = boundaryModule("use-enterprise-collaboration-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(collaborationHookPath)).toBe(true);
    expect(collaborationHookSource).toContain("export function useEnterpriseCollaborationActions");
    expect(collaborationHookSource).toContain("refreshEnterpriseCollaboration");
    expect(collaborationHookSource).toContain("touchEnterprisePresence");
    expect(collaborationHookSource).toContain("addEnterpriseComment");
    expect(collaborationHookSource).toContain("addEnterpriseAdjudication");
    expect(collaborationHookSource).toContain("runEnterpriseSsoPreflightFromWorkspace");
    expect(collaborationHookSource).toContain("deliverEnterpriseCollaborationPubSubFromWorkspace");
    expect(collaborationHookSource).toContain("runEnterpriseSsoPreflightAction");
    expect(collaborationHookSource).toContain("deliverEnterpriseCollaborationPubSubAction");
    expect(collaborationHookSource).toContain("Sign in before running enterprise SSO preflight.");
    expect(collaborationHookSource).toContain("Collaboration pub/sub delivery checked:");
    expect(workspaceSource).not.toContain("Could not load collaboration state.");
    expect(workspaceSource).not.toContain("Project comment added.");
    expect(workspaceSource).not.toContain("Adjudication record added to the project history.");
    expect(workspaceSource).not.toContain("Sign in before running enterprise SSO preflight.");
    expect(workspaceSource).not.toContain("Enterprise SSO preflight failed.");
    expect(workspaceSource).not.toContain("Sign in before delivering collaboration pub/sub events.");
    expect(workspaceSource).not.toContain("Collaboration pub/sub delivery checked:");
    expect(workspaceSource).not.toContain("Collaboration pub/sub delivery failed.");
    expect(collaborationHook.runtimeExports).toMatchObject({
      useEnterpriseCollaborationActions
    });
    expect(collaborationHook.containerResponsibilities).toEqual([
      "own enterprise collaboration refresh, presence, comment, adjudication, pub/sub delivery, and SSO preflight callbacks",
      "keep collaboration request actions, SSO preflight action calls, delivery status messages, and comment/adjudication form cleanup outside the main workspace container"
    ]);
  });

  it("keeps enterprise collaboration stream and presence effects in a focused runtime hook", () => {
    const effectsHookPath = new URL("../../../components/sena/workspace/use-enterprise-collaboration-effects.ts", import.meta.url);
    const effectsHookSource = existsSync(effectsHookPath) ? readFileSync(effectsHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const effectsHook = boundaryModule("use-enterprise-collaboration-effects" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(effectsHookPath)).toBe(true);
    expect(effectsHookSource).toContain("export function useEnterpriseCollaborationEffects");
    expect(effectsHookSource).toContain("EventSource");
    expect(effectsHookSource).toContain("SENA_WORKSPACE_API_ROUTES.enterprise.collaborationStream");
    expect(effectsHookSource).toContain("touchEnterprisePresenceAction");
    expect(effectsHookSource).toContain("setEnterpriseCollaborationTransport(\"streaming\")");
    expect(effectsHookSource).toContain("setEnterpriseCollaborationTransport(\"reconnecting\")");
    expect(effectsHookSource).toContain("window.setInterval");
    expect(effectsHookSource).toContain("window.clearInterval");
    expect(workspaceSource).not.toContain("EventSource");
    expect(workspaceSource).not.toContain("SENA_WORKSPACE_API_ROUTES.enterprise.collaborationStream");
    expect(workspaceSource).not.toContain("touchEnterprisePresenceAction");
    expect(workspaceSource).not.toContain("activeView: workspaceRailMode");
    expect(effectsHook.runtimeExports).toMatchObject({
      useEnterpriseCollaborationEffects
    });
    expect(effectsHook.containerResponsibilities).toEqual([
      "own enterprise collaboration EventSource subscription and presence heartbeat effects",
      "keep collaboration stream route binding, presence action calls, transport state transitions, and heartbeat interval cleanup outside the main workspace container"
    ]);
  });

  it("keeps Fusion Plot fullscreen and zoom interactions in a focused runtime hook", () => {
    const fusionPlotHookPath = new URL("../../../components/sena/workspace/use-fusion-plot-interactions.ts", import.meta.url);
    const fusionPlotHookSource = existsSync(fusionPlotHookPath) ? readFileSync(fusionPlotHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const fusionPlotHook = boundaryModule("use-fusion-plot-interactions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(fusionPlotHookPath)).toBe(true);
    expect(fusionPlotHookSource).toContain("export function useFusionPlotInteractions");
    expect(fusionPlotHookSource).toContain("KeyboardEvent");
    expect(fusionPlotHookSource).toContain("event.key === \"Escape\"");
    expect(fusionPlotHookSource).toContain("document.body.style.overflow");
    expect(fusionPlotHookSource).toContain("clampFusionPlotZoom");
    expect(fusionPlotHookSource).toContain("fusionPlotZoomStep");
    expect(fusionPlotHookSource).toContain("maximizeFusionPlot");
    expect(fusionPlotHookSource).toContain("closeFusionPlotMaximized");
    expect(fusionPlotHookSource).toContain("toggleLayer");
    expect(fusionPlotHookSource).toContain("setLayers((current) => ({ ...current, [layer]: !current[layer] }))");
    expect(workspaceSource).not.toContain("KeyboardEvent");
    expect(workspaceSource).not.toContain("event.key === \"Escape\"");
    expect(workspaceSource).not.toContain("document.body.style.overflow");
    expect(workspaceSource).not.toContain("clampFusionPlotZoom");
    expect(workspaceSource).not.toContain("fusionPlotZoomStep");
    expect(workspaceSource).not.toContain("setLayers((current) => ({ ...current, [layer]: !current[layer] }))");
    expect(fusionPlotHook.runtimeExports).toMatchObject({
      useFusionPlotInteractions
    });
    expect(fusionPlotHook.containerResponsibilities).toEqual([
      "own Fusion Plot fullscreen keyboard, body overflow, maximize, close, zoom, and layer visibility callbacks",
      "keep fullscreen Escape handling, body scroll locking, zoom clamping, zoom step binding, and layer toggle state updates outside the main workspace container"
    ]);
  });

  it("keeps temporal animation effects in a focused runtime hook", () => {
    const temporalHookPath = new URL("../../../components/sena/workspace/use-temporal-animation-effects.ts", import.meta.url);
    const temporalHookSource = existsSync(temporalHookPath) ? readFileSync(temporalHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const temporalHook = boundaryModule("use-temporal-animation-effects" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(temporalHookPath)).toBe(true);
    expect(temporalHookSource).toContain("export function useTemporalAnimationEffects");
    expect(temporalHookSource).toContain("setActiveWindowIndex(0)");
    expect(temporalHookSource).toContain("setIsAnimating(false)");
    expect(temporalHookSource).toContain("pendingActiveWindow");
    expect(temporalHookSource).toContain("restoredIndex >= 0 ? restoredIndex : 0");
    expect(temporalHookSource).toContain("window.setInterval");
    expect(temporalHookSource).toContain("window.clearInterval");
    expect(workspaceSource).not.toContain("restoredIndex >= 0 ? restoredIndex : 0");
    expect(workspaceSource).not.toContain("(current + 1) % temporalWindows.length");
    expect(temporalHook.runtimeExports).toMatchObject({
      useTemporalAnimationEffects
    });
    expect(temporalHook.containerResponsibilities).toEqual([
      "own temporal active-window reset, restored-window selection, bounds clamping, and animation interval effects",
      "keep temporal playback interval binding, pending-window restoration, and animation stop conditions outside the main workspace container"
    ]);
  });

  it("keeps demo verification manual-review callbacks in a focused runtime hook", () => {
    const demoReviewHookPath = new URL("../../../components/sena/workspace/use-demo-verification-manual-review-actions.ts", import.meta.url);
    const demoReviewHookSource = existsSync(demoReviewHookPath) ? readFileSync(demoReviewHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const demoReviewHook = boundaryModule("use-demo-verification-manual-review-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(demoReviewHookPath)).toBe(true);
    expect(demoReviewHookSource).toContain("export function useDemoVerificationManualReviewActions");
    expect(demoReviewHookSource).toContain("status: \"pending\"");
    expect(demoReviewHookSource).toContain("buildSenaDemoVerificationCompatibilityAudit");
    expect(demoReviewHookSource).toContain("manual-review records applied");
    expect(demoReviewHookSource).toContain("demo verification does not match the active model");
    expect(workspaceSource).not.toContain("manual-review records applied");
    expect(workspaceSource).not.toContain("demo verification does not match the active model");
    expect(workspaceSource).not.toContain("buildSenaDemoVerificationCompatibilityAudit(model, verification)");
    expect(demoReviewHook.runtimeExports).toMatchObject({
      useDemoVerificationManualReviewActions
    });
    expect(demoReviewHook.containerResponsibilities).toEqual([
      "own demo verification manual-review patching and compatibility-checked import callbacks",
      "keep manual-review default state, compatibility mismatch messages, and verification summary status messages outside the main workspace container"
    ]);
  });

  it("keeps data-contract evidence export callbacks in a focused runtime hook", () => {
    const evidenceExportHookPath = new URL("../../../components/sena/workspace/use-data-contract-evidence-export-actions.ts", import.meta.url);
    const evidenceExportHookSource = existsSync(evidenceExportHookPath) ? readFileSync(evidenceExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const evidenceExportHook = boundaryModule("use-data-contract-evidence-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(evidenceExportHookPath)).toBe(true);
    expect(evidenceExportHookSource).toContain("export function useDataContractEvidenceExportActions");
    expect(evidenceExportHookSource).toContain("sena-data-contract-audit.json");
    expect(evidenceExportHookSource).toContain("sena-import-cleaning-manifest.json");
    expect(evidenceExportHookSource).toContain("sena-validation-parity-evidence.json");
    expect(evidenceExportHookSource).toContain("Run an enterprise or local adapter import with a cleaning manifest before exporting.");
    expect(evidenceExportHookSource).toContain("Run a group-comparison validation with parity evidence before exporting.");
    expect(evidenceExportHookSource).toContain("Validation parity evidence exported.");
    expect(workspaceSource).not.toContain("sena-data-contract-audit.json");
    expect(workspaceSource).not.toContain("sena-import-cleaning-manifest.json");
    expect(workspaceSource).not.toContain("sena-validation-parity-evidence.json");
    expect(workspaceSource).not.toContain("Run an enterprise or local adapter import with a cleaning manifest before exporting.");
    expect(workspaceSource).not.toContain("Run a group-comparison validation with parity evidence before exporting.");
    expect(workspaceSource).not.toContain("Validation parity evidence exported.");
    expect(evidenceExportHook.runtimeExports).toMatchObject({
      useDataContractEvidenceExportActions
    });
    expect(evidenceExportHook.containerResponsibilities).toEqual([
      "own data-contract audit, import cleaning manifest, and validation parity evidence filenames, JSON serialization, guard messages, and download callbacks",
      "keep data-contract and validation evidence export side effects outside the main workspace container"
    ]);
  });

  it("keeps mapped-table import callbacks in a focused runtime hook", () => {
    const mappedTableHookPath = new URL("../../../components/sena/workspace/use-data-import-mapped-table-actions.ts", import.meta.url);
    const mappedTableHookSource = existsSync(mappedTableHookPath) ? readFileSync(mappedTableHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const mappedTableHook = boundaryModule("use-data-import-mapped-table-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(mappedTableHookPath)).toBe(true);
    expect(mappedTableHookSource).toContain("export function useDataImportMappedTableActions");
    expect(mappedTableHookSource).toContain("buildSenaDatasetFromTables");
    expect(mappedTableHookSource).toContain("setLocalEnterpriseImportResult(null)");
    expect(mappedTableHookSource).toContain("setLocalEnterpriseReliabilityResult(null)");
    expect(mappedTableHookSource).toContain("setLocalEnterpriseValidationResult(null)");
    expect(mappedTableHookSource).toContain("mapped table${tables.length === 1 ? \"\" : \"s\"} loaded");
    expect(mappedTableHookSource).toContain("updateUploadedTable");
    expect(mappedTableHookSource).toContain("uploadedTables.map");
    expect(mappedTableHookSource).toContain("updateTableContract");
    expect(mappedTableHookSource).toContain("updateTableField");
    expect(mappedTableHookSource).toContain("const mapping = { ...current.mapping }");
    expect(mappedTableHookSource).toContain("clearContract");
    expect(mappedTableHookSource).toContain("createEmptySenaDataset");
    expect(mappedTableHookSource).toContain("No SENA contract loaded.");
    expect(mappedTableHookSource).toContain("loadLessonStudySample");
    expect(mappedTableHookSource).toContain("requestSenaWorkspaceJson<unknown>");
    expect(mappedTableHookSource).toContain("lessonStudySampleUrl");
    expect(mappedTableHookSource).toContain("Lesson-study sample loaded from the research pilot package.");
    expect(mappedTableHookSource).toContain("Could not load the lesson-study sample.");
    expect(mappedTableHookSource).toContain("exportContractTemplate");
    expect(mappedTableHookSource).toContain("sena-data-contract-template.json");
    expect(workspaceSource).not.toContain("buildSenaDatasetFromTables");
    expect(workspaceSource).not.toContain("mapped table${tables.length === 1 ? \"\" : \"s\"} loaded");
    expect(workspaceSource).not.toContain("uploadedTables.map");
    expect(workspaceSource).not.toContain("const mapping = { ...current.mapping }");
    expect(workspaceSource).not.toContain("createEmptySenaDataset");
    expect(workspaceSource).not.toContain("No SENA contract loaded.");
    expect(workspaceSource).not.toContain("requestSenaWorkspaceJson<unknown>");
    expect(workspaceSource).not.toContain("lessonStudySampleUrl");
    expect(workspaceSource).not.toContain("Lesson-study sample loaded from the research pilot package.");
    expect(workspaceSource).not.toContain("Could not load the lesson-study sample.");
    expect(workspaceSource).not.toContain("sena-data-contract-template.json");
    expect(mappedTableHook.runtimeExports).toMatchObject({
      useDataImportMappedTableActions
    });
    expect(mappedTableHook.containerResponsibilities).toEqual([
      "own mapped-table dataset construction, upload table commits, uploaded table updates, table mapping callbacks, clear-contract reset, lesson-study sample loading, contract-template export, local enterprise result resets, and import status messages",
      "keep buildSenaDatasetFromTables binding, uploaded table mapping, empty dataset reset, sample fetch/import, contract-template JSON, and mapped-table reset side effects outside the main workspace container"
    ]);
  });

  it("keeps contract upload branching in a focused runtime hook", () => {
    const uploadHookPath = new URL("../../../components/sena/workspace/use-contract-upload-action.ts", import.meta.url);
    const uploadHookSource = existsSync(uploadHookPath) ? readFileSync(uploadHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const uploadHook = boundaryModule("use-contract-upload-action" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(uploadHookPath)).toBe(true);
    expect(uploadHookSource).toContain("export function useContractUploadAction");
    expect(uploadHookSource).toContain("SENA_SCHEMA_VERSIONS.projectSnapshot");
    expect(uploadHookSource).toContain("SENA_SCHEMA_VERSIONS.reviewPacket");
    expect(uploadHookSource).toContain("SENA_SCHEMA_VERSIONS.demoVerification");
    expect(uploadHookSource).toContain("parseSenaCsv");
    expect(uploadHookSource).toContain("importFilesViaEnterpriseApi(files)");
    expect(workspaceSource).not.toContain("async function handleContractUpload");
    expect(workspaceSource).not.toContain("SENA_SCHEMA_VERSIONS.projectSnapshot");
    expect(workspaceSource).not.toContain("parseSenaCsv(text)");
    expect(uploadHook.runtimeExports).toMatchObject({
      useContractUploadAction
    });
    expect(uploadHook.containerResponsibilities).toEqual([
      "own contract upload file filtering, JSON schema dispatch, CSV table inference, enterprise import fallback, and upload input reset",
      "keep project snapshot, review packet, demo verification, JSON contract, and CSV upload branching outside the main workspace container"
    ]);
  });

  it("keeps project snapshot export in a focused runtime hook", () => {
    const exportHookPath = new URL("../../../components/sena/workspace/use-project-snapshot-export-actions.ts", import.meta.url);
    const exportHookSource = existsSync(exportHookPath) ? readFileSync(exportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const exportHook = boundaryModule("use-project-snapshot-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(exportHookPath)).toBe(true);
    expect(exportHookSource).toContain("export function useProjectSnapshotExportActions");
    expect(exportHookSource).toContain("exportProjectSnapshot");
    expect(exportHookSource).toContain("new Date().toISOString()");
    expect(exportHookSource).toContain("sena-project-snapshot.json");
    expect(exportHookSource).toContain("JSON.stringify(buildCurrentProjectSnapshot(generatedAt), null, 2)");
    expect(workspaceSource).not.toContain("sena-project-snapshot.json");
    expect(workspaceSource).not.toContain("JSON.stringify(buildCurrentProjectSnapshot(generatedAt), null, 2)");
    expect(exportHook.runtimeExports).toMatchObject({
      useProjectSnapshotExportActions
    });
    expect(exportHook.containerResponsibilities).toEqual([
      "own project snapshot generatedAt creation, JSON serialization, filename binding, and download callback",
      "keep project snapshot export side effects outside the main workspace container while preserving the container-owned snapshot builder"
    ]);
  });

  it("keeps project snapshot restore in a focused runtime hook", () => {
    const restoreHookPath = new URL("../../../components/sena/workspace/use-project-snapshot-restore-action.ts", import.meta.url);
    const restoreHookSource = existsSync(restoreHookPath) ? readFileSync(restoreHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const restoreHook = boundaryModule("use-project-snapshot-restore-action" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(restoreHookPath)).toBe(true);
    expect(restoreHookSource).toContain("export function useProjectSnapshotRestoreAction");
    expect(restoreHookSource).toContain("snapshot.reproducibility.buildOptions");
    expect(restoreHookSource).toContain("snapshot.source.sourceDataset ?? snapshot.dataset");
    expect(restoreHookSource).toContain("project snapshot restored");
    expect(restoreHookSource).not.toContain('import { importSenaProjectSnapshot } from "./analysis-runtime"');
    expect(restoreHookSource).not.toContain('import("@/lib/sena/snapshot")');
    expect(restoreHookSource).toContain("requestSenaSnapshotRestore");
    expect(restoreHookSource).toContain("restoreValidatedProjectSnapshot");
    expect(workspaceSource).not.toContain("function restoreProjectSnapshot");
    expect(workspaceSource).not.toContain("snapshot.reproducibility.buildOptions");
    expect(workspaceSource).not.toContain("project snapshot restored");
    expect(restoreHook.runtimeExports).toMatchObject({
      useProjectSnapshotRestoreAction
    });
    expect(restoreHook.containerResponsibilities).toEqual([
      "own snapshot dataset, build options, review, reliability, governance, manual-review, selection, temporal-window, and import-message state restoration",
      "keep project snapshot restore state hydration outside the main workspace container while enterprise import and project hooks share one restore callback"
    ]);
  });

  it("keeps snapshot and review-packet validators behind a stateless server boundary", () => {
    const uploadHookPath = new URL("../../../components/sena/workspace/use-contract-upload-action.ts", import.meta.url);
    const uploadHookSource = existsSync(uploadHookPath) ? readFileSync(uploadHookPath, "utf8") : "";
    const restoreHookPath = new URL("../../../components/sena/workspace/use-project-snapshot-restore-action.ts", import.meta.url);
    const restoreHookSource = existsSync(restoreHookPath) ? readFileSync(restoreHookPath, "utf8") : "";
    const restoreRoutePath = new URL("../../../app/api/sena/snapshot/restore/route.ts", import.meta.url);
    const restoreRouteSource = existsSync(restoreRoutePath) ? readFileSync(restoreRoutePath, "utf8") : "";
    const restoreRuntimePath = new URL("../snapshot-restore.ts", import.meta.url);
    const restoreRuntimeSource = existsSync(restoreRuntimePath) ? readFileSync(restoreRuntimePath, "utf8") : "";

    expect(uploadHookSource).not.toContain("  importSenaProjectSnapshot,\n");
    expect(uploadHookSource).not.toContain("  importSenaReviewPacket,\n");
    expect(uploadHookSource).not.toContain('import("@/lib/sena/snapshot")');
    expect(uploadHookSource).not.toContain('import("@/lib/sena/review-packet")');
    expect(restoreHookSource).not.toContain('import("@/lib/sena/snapshot")');
    expect(uploadHookSource).toContain("requestSenaSnapshotRestore");
    expect(restoreHookSource).toContain("requestSenaSnapshotRestore");
    expect(uploadHookSource).toContain("await restoreProjectSnapshot(");
    expect(restoreRouteSource).toContain('from "@/lib/sena/snapshot-restore"');
    expect(restoreRuntimeSource).toContain('from "./project-handoff"');
    expect(restoreRuntimeSource).toContain('from "./review-packet"');
    expect(restoreRuntimeSource).toContain('persisted: false');
    expect(restoreRuntimeSource).toContain('audited: false');
  });

  it("keeps current project snapshot builder in a focused runtime hook", () => {
    const builderHookPath = new URL("../../../components/sena/workspace/use-current-project-snapshot-builder.ts", import.meta.url);
    const builderHookSource = existsSync(builderHookPath) ? readFileSync(builderHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const builderHook = boundaryModule("use-current-project-snapshot-builder" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(builderHookPath)).toBe(true);
    expect(builderHookSource).toContain("export function useCurrentProjectSnapshotBuilder");
    expect(builderHookSource).toContain("buildSenaProjectSnapshot");
    expect(builderHookSource).toContain("demoVerificationManualReviews: demoManualReviews");
    expect(builderHookSource).toContain("codingReliability");
    expect(workspaceSource).not.toContain("function buildCurrentProjectSnapshot");
    expect(workspaceSource).not.toContain("buildSenaProjectSnapshot");
    expect(builderHook.runtimeExports).toMatchObject({
      useCurrentProjectSnapshotBuilder
    });
    expect(builderHook.containerResponsibilities).toEqual([
      "own current project snapshot generatedAt default, source dataset, temporal trace, demo manual-review, human-review, coding-reliability, and data-governance binding",
      "keep buildSenaProjectSnapshot callback construction outside the main workspace container while export, validation, project, and publication hooks share one builder"
    ]);
  });

  it("keeps report and evidence artifact exports in a focused runtime hook", () => {
    const artifactExportHookPath = new URL("../../../components/sena/workspace/use-report-and-evidence-artifact-export-actions.ts", import.meta.url);
    const artifactExportHookSource = existsSync(artifactExportHookPath) ? readFileSync(artifactExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const artifactExportHook = boundaryModule("use-report-and-evidence-artifact-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(artifactExportHookPath)).toBe(true);
    expect(artifactExportHookSource).toContain("export function useReportAndEvidenceArtifactExportActions");
    expect(artifactExportHookSource).toContain("buildSenaReport");
    expect(artifactExportHookSource).toContain("buildSenaReviewPacket");
    expect(artifactExportHookSource).toContain("buildSenaMarkdownReport");
    expect(artifactExportHookSource).toContain("sena-analysis-report.json");
    expect(artifactExportHookSource).toContain("sena-review-packet.json");
    expect(artifactExportHookSource).toContain("Run a group-comparison validation before exporting validation evidence.");
    expect(workspaceSource).not.toContain("function buildCurrentReport()");
    expect(workspaceSource).not.toContain("function exportReviewPacketJson()");
    expect(workspaceSource).not.toContain("sena-analysis-report.json");
    expect(workspaceSource).not.toContain("sena-review-packet.json");
    expect(artifactExportHook.runtimeExports).toMatchObject({
      useReportAndEvidenceArtifactExportActions
    });
    expect(artifactExportHook.containerResponsibilities).toEqual([
      "own report, evidence ledger, demo walkthrough, demo verification, development plan, pilot readiness, reliability, validation, claim readiness, and review-packet export callbacks",
      "keep report and evidence artifact construction, JSON serialization, Markdown conversion, filename binding, and missing-evidence messages outside the main workspace container"
    ]);
  });

  it("keeps runtime manifest and audit exports in a focused runtime hook", () => {
    const runtimeExportHookPath = new URL("../../../components/sena/workspace/use-runtime-manifest-export-actions.ts", import.meta.url);
    const runtimeExportHookSource = existsSync(runtimeExportHookPath) ? readFileSync(runtimeExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const runtimeExportHook = boundaryModule("use-runtime-manifest-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(runtimeExportHookPath)).toBe(true);
    expect(runtimeExportHookSource).toContain("export function useRuntimeManifestExportActions");
    expect(runtimeExportHookSource).toContain("sena-jena-manifest.json");
    expect(runtimeExportHookSource).toContain("sena-jsna-manifest.json");
    expect(runtimeExportHookSource).toContain("sena-runtime-consistency-audit.json");
    expect(runtimeExportHookSource).toContain("sena-fusion-math-audit.json");
    expect(workspaceSource).not.toContain("sena-jena-manifest.json");
    expect(workspaceSource).not.toContain("sena-jsna-manifest.json");
    expect(workspaceSource).not.toContain("sena-runtime-consistency-audit.json");
    expect(workspaceSource).not.toContain("sena-fusion-math-audit.json");
    expect(runtimeExportHook.runtimeExports).toMatchObject({
      useRuntimeManifestExportActions
    });
    expect(runtimeExportHook.containerResponsibilities).toEqual([
      "own jENA manifest, jSNA manifest, runtime consistency audit, and fusion math audit JSON download callbacks",
      "keep already-built runtime manifest and audit object serialization outside the main workspace container"
    ]);
  });

  it("keeps runtime bundle export in a focused runtime hook", () => {
    const runtimeBundleHookPath = new URL("../../../components/sena/workspace/use-runtime-bundle-export-actions.ts", import.meta.url);
    const runtimeBundleHookSource = existsSync(runtimeBundleHookPath) ? readFileSync(runtimeBundleHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const runtimeBundleHook = boundaryModule("use-runtime-bundle-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(runtimeBundleHookPath)).toBe(true);
    expect(runtimeBundleHookSource).toContain("export function useRuntimeBundleExportActions");
    expect(runtimeBundleHookSource).toContain("buildSenaRuntimeBundle");
    expect(runtimeBundleHookSource).toContain("sena-runtime-bundle.json");
    expect(runtimeBundleHookSource).toContain("evidenceLimit: 500");
    expect(runtimeBundleHookSource).toContain("demoVerificationManualReviews: demoManualReviews");
    expect(runtimeBundleHookSource).toContain("reviewedAt: generatedAt");
    expect(workspaceSource).not.toContain("buildSenaRuntimeBundle");
    expect(workspaceSource).not.toContain("sena-runtime-bundle.json");
    expect(runtimeBundleHook.runtimeExports).toMatchObject({
      useRuntimeBundleExportActions
    });
    expect(runtimeBundleHook.containerResponsibilities).toEqual([
      "own runtime bundle generatedAt creation, human-review binding, coding-reliability reviewedAt binding, JSON serialization, filename binding, and download callback",
      "keep buildSenaRuntimeBundle export side effects outside the main workspace container while preserving the current report review and governance inputs"
    ]);
  });

  it("keeps temporal runtime trace export in a focused runtime hook", () => {
    const temporalTraceHookPath = new URL("../../../components/sena/workspace/use-temporal-runtime-trace-export-actions.ts", import.meta.url);
    const temporalTraceHookSource = existsSync(temporalTraceHookPath) ? readFileSync(temporalTraceHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const temporalTraceHook = boundaryModule("use-temporal-runtime-trace-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(temporalTraceHookPath)).toBe(true);
    expect(temporalTraceHookSource).toContain("export function useTemporalRuntimeTraceExportActions");
    expect(temporalTraceHookSource).toContain("buildSenaTemporalRuntimeTrace");
    expect(temporalTraceHookSource).toContain("sena-temporal-runtime-trace.json");
    expect(temporalTraceHookSource).toContain("generatedAt");
    expect(workspaceSource).not.toContain("function exportTemporalRuntimeTraceJson()");
    expect(workspaceSource).not.toContain("sena-temporal-runtime-trace.json");
    expect(temporalTraceHook.runtimeExports).toMatchObject({
      useTemporalRuntimeTraceExportActions
    });
    expect(temporalTraceHook.containerResponsibilities).toEqual([
      "own temporal runtime trace generatedAt creation, trace rebuild binding, JSON serialization, filename binding, and download callback",
      "keep buildSenaTemporalRuntimeTrace export side effects outside the main workspace container while preserving the container-owned timeline model"
    ]);
  });

  it("keeps Fusion Canvas selection state in a focused runtime hook", () => {
    const selectionHookPath = new URL("../../../components/sena/workspace/use-fusion-canvas-selection-state.ts", import.meta.url);
    const selectionHookSource = existsSync(selectionHookPath) ? readFileSync(selectionHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const selectionHook = boundaryModule("use-fusion-canvas-selection-state" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(selectionHookPath)).toBe(true);
    expect(selectionHookSource).toContain("export function useFusionCanvasSelectionState");
    expect(selectionHookSource).toContain("setRevealedNodeLabelIds");
    expect(selectionHookSource).toContain("handleCanvasSelect");
    expect(selectionHookSource).toContain("graphNodeIds.has(id)");
    expect(workspaceSource).not.toContain("function handleCanvasSelect");
    expect(workspaceSource).not.toContain("setRevealedNodeLabelIds");
    expect(workspaceSource).not.toContain("graphNodeIds.has(id)");
    expect(selectionHook.runtimeExports).toMatchObject({
      useFusionCanvasSelectionState
    });
    expect(selectionHook.containerResponsibilities).toEqual([
      "own selected id, selected element fallback resolution, graph-node label reveal state, label pruning, and canvas selection callback",
      "keep Fusion Canvas selection and revealed-label state transitions outside the main workspace container"
    ]);
  });

  it("keeps SENA report exports in a focused runtime hook", () => {
    const reportExportHookPath = new URL("../../../components/sena/workspace/use-sena-report-export-actions.ts", import.meta.url);
    const reportExportHookSource = existsSync(reportExportHookPath) ? readFileSync(reportExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const reportExportHook = boundaryModule("use-sena-report-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(reportExportHookPath)).toBe(true);
    expect(reportExportHookSource).toContain("export function useSenaReportExportActions");
    expect(reportExportHookSource).toContain("buildSenaPairContributionReportArtifact");
    expect(reportExportHookSource).toContain("buildSenaSnaReportArtifact");
    expect(reportExportHookSource).toContain("buildSenaMetricProvenanceArtifact");
    expect(reportExportHookSource).toContain("buildSenaEnaReportArtifact");
    expect(reportExportHookSource).toContain("sena-person-code-pair-g-report.json");
    expect(reportExportHookSource).toContain("sena-sna-report.json");
    expect(reportExportHookSource).toContain("sena-metric-provenance.json");
    expect(reportExportHookSource).toContain("sena-ena-report.json");
    expect(workspaceSource).not.toContain("buildSenaPairContributionReportArtifact");
    expect(workspaceSource).not.toContain("buildSenaSnaReportArtifact");
    expect(workspaceSource).not.toContain("buildSenaMetricProvenanceArtifact");
    expect(workspaceSource).not.toContain("buildSenaEnaReportArtifact");
    expect(workspaceSource).not.toContain("sena-person-code-pair-g-report.json");
    expect(workspaceSource).not.toContain("sena-sna-report.json");
    expect(workspaceSource).not.toContain("sena-metric-provenance.json");
    expect(workspaceSource).not.toContain("sena-ena-report.json");
    expect(reportExportHook.runtimeExports).toMatchObject({
      useSenaReportExportActions
    });
    expect(reportExportHook.containerResponsibilities).toEqual([
      "own generatedAt creation, artifact builder calls, filenames, JSON serialization, and download callbacks for SENA report exports",
      "keep pair contribution, jSNA, metric provenance, and jENA report export side effects outside the main workspace container"
    ]);
  });

  it("keeps method artifact exports in a focused runtime hook", () => {
    const methodExportHookPath = new URL("../../../components/sena/workspace/use-method-artifact-export-actions.ts", import.meta.url);
    const methodExportHookSource = existsSync(methodExportHookPath) ? readFileSync(methodExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const methodExportHook = boundaryModule("use-method-artifact-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(methodExportHookPath)).toBe(true);
    expect(methodExportHookSource).toContain("export function useMethodArtifactExportActions");
    expect(methodExportHookSource).toContain("buildSenaMethodProtocol");
    expect(methodExportHookSource).toContain("buildSenaVisualGrammarArtifact");
    expect(methodExportHookSource).toContain("sena-method-protocol.json");
    expect(methodExportHookSource).toContain("sena-visual-grammar.json");
    expect(workspaceSource).not.toContain("buildSenaVisualGrammarArtifact");
    expect(workspaceSource).not.toContain("sena-method-protocol.json");
    expect(workspaceSource).not.toContain("sena-visual-grammar.json");
    expect(methodExportHook.runtimeExports).toMatchObject({
      useMethodArtifactExportActions
    });
    expect(methodExportHook.containerResponsibilities).toEqual([
      "own method protocol and visual grammar generatedAt creation, artifact builder calls, filenames, JSON serialization, and download callbacks",
      "keep method protocol and visual grammar export side effects outside the main workspace container"
    ]);
  });

  it("keeps enterprise validation callbacks in a focused runtime hook", () => {
    const validationHookPath = new URL("../../../components/sena/workspace/use-enterprise-validation-actions.ts", import.meta.url);
    const validationHookSource = existsSync(validationHookPath) ? readFileSync(validationHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const validationHook = boundaryModule("use-enterprise-validation-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(validationHookPath)).toBe(true);
    expect(validationHookSource).toContain("export function useEnterpriseValidationActions");
    expect(validationHookSource).toContain("runEnterpriseValidationComparison");
    expect(validationHookSource).toContain("runValidationComparisonLocally");
    expect(validationHookSource).toContain("reviewEnterpriseValidationRun");
    expect(validationHookSource).toContain("buildLocalValidationPreregistrationPlan");
    expect(workspaceSource).not.toContain("Choose two different groups or roles before running validation.");
    expect(workspaceSource).not.toContain("Local group-comparison validation calculated without sign-in:");
    expect(workspaceSource).not.toContain("Validation run ${payload.validationRun?.id ?? \"local\"} saved:");
    expect(validationHook.runtimeExports).toMatchObject({
      useEnterpriseValidationActions
    });
    expect(validationHook.containerResponsibilities).toEqual([
      "own local and server-backed enterprise validation run callbacks plus validation review actions",
      "keep validation inference imports, preregistration hashing, and validation status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise expert-review callbacks in a focused runtime hook", () => {
    const expertReviewHookPath = new URL("../../../components/sena/workspace/use-enterprise-expert-review-actions.ts", import.meta.url);
    const expertReviewHookSource = existsSync(expertReviewHookPath) ? readFileSync(expertReviewHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const expertReviewHook = boundaryModule("use-enterprise-expert-review-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(expertReviewHookPath)).toBe(true);
    expect(expertReviewHookSource).toContain("export function useEnterpriseExpertReviewActions");
    expect(expertReviewHookSource).toContain("submitEnterpriseExpertReview");
    expect(expertReviewHookSource).toContain("updateEnterpriseExpertReview");
    expect(expertReviewHookSource).toContain("exportEnterpriseExpertReviewDossierJson");
    expect(workspaceSource).not.toContain("Save or select a server project before recording expert review.");
    expect(workspaceSource).not.toContain("Expert review ${payload.expertReview.id} recorded:");
    expect(workspaceSource).not.toContain("Expert review ${payload.expertReview.id} marked");
    expect(workspaceSource).not.toContain("Expert review update failed.");
    expect(expertReviewHook.runtimeExports).toMatchObject({
      useEnterpriseExpertReviewActions
    });
    expect(expertReviewHook.containerResponsibilities).toEqual([
      "own enterprise expert-review submit, update, and dossier export callbacks",
      "keep expert-review request actions, target selection, form cleanup, and status messages outside the main workspace container"
    ]);
  });

  it("keeps enterprise reliability callbacks in a focused runtime hook", () => {
    const reliabilityHookPath = new URL("../../../components/sena/workspace/use-enterprise-reliability-actions.ts", import.meta.url);
    const reliabilityHookSource = existsSync(reliabilityHookPath) ? readFileSync(reliabilityHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const reliabilityHook = boundaryModule("use-enterprise-reliability-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(reliabilityHookPath)).toBe(true);
    expect(reliabilityHookSource).toContain("export function useEnterpriseReliabilityActions");
    expect(reliabilityHookSource).toContain("handleReliabilityUpload");
    expect(reliabilityHookSource).toContain("reviewEnterpriseReliabilityRun");
    expect(reliabilityHookSource).toContain("applyReliabilityReviewPatch");
    expect(reliabilityHookSource).toContain("importReliabilityFilesLocally");
    expect(workspaceSource).not.toContain("Local reliability dashboard calculated without sign-in:");
    expect(workspaceSource).not.toContain("Reliability run ${payload.reliabilityRun?.id ?? \"local\"} saved:");
    expect(workspaceSource).not.toContain("Reliability run ${payload.reliabilityRun.id} marked");
    expect(workspaceSource).not.toContain("Reliability review failed.");
    expect(workspaceSource).not.toContain("Reliability calculation failed.");
    expect(reliabilityHook.runtimeExports).toMatchObject({
      useEnterpriseReliabilityActions
    });
    expect(reliabilityHook.containerResponsibilities).toEqual([
      "own enterprise reliability review, local import fallback, server upload, and review-patch callbacks",
      "keep reliability adapter imports, CSRF upload actions, review-patch field hydration, and reliability status messages outside the main workspace container"
    ]);
  });

  it("keeps provisioning readiness refresh callbacks in a focused runtime hook", () => {
    const provisioningHookPath = new URL("../../../components/sena/workspace/use-enterprise-provisioning-readiness-actions.ts", import.meta.url);
    const provisioningHookSource = existsSync(provisioningHookPath) ? readFileSync(provisioningHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const provisioningHook = boundaryModule("use-enterprise-provisioning-readiness-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(provisioningHookPath)).toBe(true);
    expect(provisioningHookSource).toContain("export function useEnterpriseProvisioningReadinessActions");
    expect(provisioningHookSource).toContain("refreshEnterpriseProvisioningReadiness");
    expect(provisioningHookSource).toContain("refreshEnterpriseProvisioningReadinessAction");
    expect(provisioningHookSource).toContain("identityEvidence.platformRequestPacket.summary.blockingRequests");
    expect(provisioningHookSource).toContain("Provisioning readiness ${deployment.status}");
    expect(workspaceSource).not.toContain("Sign in before refreshing provisioning and SCIM readiness.");
    expect(workspaceSource).not.toContain("Provisioning readiness ${deployment.status}");
    expect(workspaceSource).not.toContain("Provisioning readiness refresh failed.");
    expect(provisioningHook.runtimeExports).toMatchObject({
      useEnterpriseProvisioningReadinessActions
    });
    expect(provisioningHook.containerResponsibilities).toEqual([
      "own provisioning and SCIM readiness refresh callbacks",
      "keep provisioning readiness action calls, deployment package hydration, identity evidence hydration, and readiness status messages outside the main workspace container"
    ]);
  });

  it("keeps platform-decision callbacks in a focused runtime hook", () => {
    const platformDecisionHookPath = new URL("../../../components/sena/workspace/use-enterprise-platform-decision-actions.ts", import.meta.url);
    const platformDecisionHookSource = existsSync(platformDecisionHookPath) ? readFileSync(platformDecisionHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const platformDecisionHook = boundaryModule("use-enterprise-platform-decision-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(platformDecisionHookPath)).toBe(true);
    expect(platformDecisionHookSource).toContain("export function useEnterprisePlatformDecisionActions");
    expect(platformDecisionHookSource).toContain("submitEnterprisePlatformDecisionReview");
    expect(platformDecisionHookSource).toContain("applyEnterpriseIdentityRequestToPlatformDecision");
    expect(platformDecisionHookSource).toContain("exportEnterprisePlatformDecisionRegisterJson");
    expect(platformDecisionHookSource).toContain("SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions");
    expect(platformDecisionHookSource).toContain("sena-enterprise-platform-decision-register.json");
    expect(platformDecisionHookSource).toContain("Enterprise platform decision register");
    expect(platformDecisionHookSource).toContain("Evidence URL must not include embedded credentials, fragments, or sensitive query parameters.");
    expect(workspaceSource).not.toContain("sena-enterprise-platform-decision-register.json");
    expect(workspaceSource).not.toContain("SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions");
    expect(workspaceSource).not.toContain("Add owner, role, environment, and notes before recording a platform decision.");
    expect(workspaceSource).not.toContain("Evidence URL must not include embedded credentials, fragments, or sensitive query parameters.");
    expect(workspaceSource).not.toContain("Platform decision recorded: ${payload.acceptance?.decisionId");
    expect(workspaceSource).not.toContain("Platform decision review failed.");
    expect(workspaceSource).not.toContain("Loaded ${request.decisionId} identity request into the platform decision form.");
    expect(platformDecisionHook.runtimeExports).toMatchObject({
      useEnterprisePlatformDecisionActions
    });
    expect(platformDecisionHook.containerResponsibilities).toEqual([
      "own platform-decision review submission, register JSON export, and identity request form hydration callbacks",
      "keep platform decision export route binding, artifact filename, URL policy checks, production evidence timestamp checks, policy hash binding, and identity evidence status messages outside the main workspace container"
    ]);
  });

  it("keeps release-gate callbacks in a focused runtime hook", () => {
    const releaseGateHookPath = new URL("../../../components/sena/workspace/use-enterprise-release-gate-actions.ts", import.meta.url);
    const releaseGateHookSource = existsSync(releaseGateHookPath) ? readFileSync(releaseGateHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const releaseGateHook = boundaryModule("use-enterprise-release-gate-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(releaseGateHookPath)).toBe(true);
    expect(releaseGateHookSource).toContain("export function useEnterpriseReleaseGateActions");
    expect(releaseGateHookSource).toContain("submitEnterpriseReleaseGateReview");
    expect(releaseGateHookSource).toContain("exportEnterpriseReleaseGateReviewsJson");
    expect(releaseGateHookSource).toContain("Release gate recorded:");
    expect(releaseGateHookSource).toContain("outputSha256");
    expect(workspaceSource).not.toContain("Sign in with team management access before recording release gate reviews.");
    expect(workspaceSource).not.toContain("Add approver, role, environment, release version, notes, and verification evidence before recording a release gate review.");
    expect(workspaceSource).not.toContain("Release gate recorded:");
    expect(workspaceSource).not.toContain("Release gate review failed.");
    expect(releaseGateHook.runtimeExports).toMatchObject({
      useEnterpriseReleaseGateActions
    });
    expect(releaseGateHook.containerResponsibilities).toEqual([
      "own release-gate review submission and release-gate review export callbacks",
      "keep release-gate validation, verification hash binding, provisioning refresh, and release-gate status messages outside the main workspace container"
    ]);
  });

  it("keeps go-live callbacks in a focused runtime hook", () => {
    const goLiveHookPath = new URL("../../../components/sena/workspace/use-enterprise-go-live-actions.ts", import.meta.url);
    const goLiveHookSource = existsSync(goLiveHookPath) ? readFileSync(goLiveHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const goLiveHook = boundaryModule("use-enterprise-go-live-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(goLiveHookPath)).toBe(true);
    expect(goLiveHookSource).toContain("export function useEnterpriseGoLiveActions");
    expect(goLiveHookSource).toContain("applyEnterpriseGoLiveRehearsalDraft");
    expect(goLiveHookSource).toContain("submitEnterpriseGoLiveAttestation");
    expect(goLiveHookSource).toContain("exportEnterpriseGoLiveRehearsalJson");
    expect(goLiveHookSource).toContain("exportEnterpriseGoLiveRollbackDrillJson");
    expect(goLiveHookSource).toContain("exportEnterpriseGoLiveMonitorJson");
    expect(goLiveHookSource).toContain("exportEnterpriseGoLiveAttestationsJson");
    expect(goLiveHookSource).toContain("sena-enterprise-go-live-rehearsal.json");
    expect(goLiveHookSource).toContain("sena-enterprise-go-live-rollback-drill.json");
    expect(goLiveHookSource).toContain("sena-enterprise-go-live-monitor.json");
    expect(goLiveHookSource).toContain('artifact: "rollback-drill"');
    expect(goLiveHookSource).toContain('artifact: "post-cutover-monitor"');
    expect(goLiveHookSource).toContain("releaseGateDraftReviewed");
    expect(goLiveHookSource).toContain("Go-live attestation recorded:");
    expect(workspaceSource).not.toContain("sena-enterprise-go-live-rehearsal.json");
    expect(workspaceSource).not.toContain("sena-enterprise-go-live-rollback-drill.json");
    expect(workspaceSource).not.toContain("sena-enterprise-go-live-monitor.json");
    expect(workspaceSource).not.toContain('artifact: "rollback-drill"');
    expect(workspaceSource).not.toContain('artifact: "post-cutover-monitor"');
    expect(workspaceSource).not.toContain("Sign in before applying the go-live rehearsal draft.");
    expect(workspaceSource).not.toContain("Go-live release gate draft applied:");
    expect(workspaceSource).not.toContain("Sign in with team management access before recording go-live attestation.");
    expect(workspaceSource).not.toContain("Apply or complete release gate details before recording go-live attestation.");
    expect(workspaceSource).not.toContain("Go-live attestation recorded:");
    expect(workspaceSource).not.toContain("Go-live attestation failed.");
    expect(goLiveHook.runtimeExports).toMatchObject({
      useEnterpriseGoLiveActions
    });
    expect(goLiveHook.containerResponsibilities).toEqual([
      "own go-live rehearsal, rollback-drill, post-cutover monitor, and attestation export callbacks",
      "keep go-live route binding, artifact filenames, release-gate draft hydration, checklist binding, and go-live status messages outside the main workspace container"
    ]);
  });

  it("keeps governance and ops JSON export callbacks in a focused runtime hook", () => {
    const governanceExportHookPath = new URL("../../../components/sena/workspace/use-enterprise-governance-export-actions.ts", import.meta.url);
    const governanceExportHookSource = existsSync(governanceExportHookPath) ? readFileSync(governanceExportHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const governanceExportHook = boundaryModule("use-enterprise-governance-export-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(governanceExportHookPath)).toBe(true);
    expect(governanceExportHookSource).toContain("export function useEnterpriseGovernanceExportActions");
    expect(governanceExportHookSource).toContain("exportEnterpriseGovernanceHealthJson");
    expect(governanceExportHookSource).toContain("exportEnterpriseSecurityPostureJson");
    expect(governanceExportHookSource).toContain("exportEnterpriseOpsReadinessJson");
    expect(governanceExportHookSource).toContain("exportEnterpriseDeploymentPackageJson");
    expect(governanceExportHookSource).toContain("exportEnterpriseIdentityProductionEvidenceJson");
    expect(governanceExportHookSource).toContain("exportEnterpriseNativeAdapterCertificationJson");
    expect(governanceExportHookSource).toContain("exportEnterpriseSaasOperationsReadinessJson");
    expect(governanceExportHookSource).toContain("SENA_WORKSPACE_API_ROUTES.enterprise.opsReadiness");
    expect(governanceExportHookSource).toContain("SENA_WORKSPACE_API_ROUTES.enterprise.nativeAdapters");
    expect(governanceExportHookSource).toContain("sena-enterprise-governance-health.json");
    expect(governanceExportHookSource).toContain("sena-enterprise-deployment-readiness.json");
    expect(governanceExportHookSource).toContain("sena-enterprise-organization-deployment.json");
    expect(governanceExportHookSource).toContain("Enterprise SaaS operations readiness");
    expect(workspaceSource).not.toContain("sena-enterprise-governance-health.json");
    expect(workspaceSource).not.toContain("sena-enterprise-deployment-readiness.json");
    expect(workspaceSource).not.toContain("sena-enterprise-organization-deployment.json");
    expect(workspaceSource).not.toContain("SENA_WORKSPACE_API_ROUTES.enterprise.opsReadiness");
    expect(workspaceSource).not.toContain("SENA_WORKSPACE_API_ROUTES.enterprise.nativeAdapters");
    expect(governanceExportHook.runtimeExports).toMatchObject({
      useEnterpriseGovernanceExportActions
    });
    expect(governanceExportHook.containerResponsibilities).toEqual([
      "own enterprise governance, ops, deployment, capability, native-adapter, and SaaS readiness JSON export callbacks",
      "keep enterprise JSON export route binding, artifact filenames, and export labels outside the main workspace container"
    ]);
  });

  it("keeps ops alert callbacks in a focused runtime hook", () => {
    const opsAlertsHookPath = new URL("../../../components/sena/workspace/use-enterprise-ops-alerts-actions.ts", import.meta.url);
    const opsAlertsHookSource = existsSync(opsAlertsHookPath) ? readFileSync(opsAlertsHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const opsAlertsHook = boundaryModule("use-enterprise-ops-alerts-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(opsAlertsHookPath)).toBe(true);
    expect(opsAlertsHookSource).toContain("export function useEnterpriseOpsAlertsActions");
    expect(opsAlertsHookSource).toContain("exportEnterpriseOpsAlertsJson");
    expect(opsAlertsHookSource).toContain("deliverEnterpriseOpsAlertsFromWorkspace");
    expect(opsAlertsHookSource).toContain("SENA_WORKSPACE_API_ROUTES.enterprise.opsAlerts");
    expect(opsAlertsHookSource).toContain("deliverEnterpriseOpsAlertsAction");
    expect(opsAlertsHookSource).toContain("Ops alert delivery");
    expect(workspaceSource).not.toContain("Sign in before delivering enterprise ops alerts.");
    expect(workspaceSource).not.toContain("Ops alert delivery ${payload.status");
    expect(workspaceSource).not.toContain("Enterprise ops alert delivery failed.");
    expect(opsAlertsHook.runtimeExports).toMatchObject({
      useEnterpriseOpsAlertsActions
    });
    expect(opsAlertsHook.containerResponsibilities).toEqual([
      "own enterprise ops alert export and delivery callbacks",
      "keep ops alert action calls, export route binding, and delivery status messages outside the main workspace container"
    ]);
  });

  it("keeps audit and backup callbacks in a focused runtime hook", () => {
    const auditBackupHookPath = new URL("../../../components/sena/workspace/use-enterprise-audit-backup-actions.ts", import.meta.url);
    const auditBackupHookSource = existsSync(auditBackupHookPath) ? readFileSync(auditBackupHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const auditBackupHook = boundaryModule("use-enterprise-audit-backup-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(auditBackupHookPath)).toBe(true);
    expect(auditBackupHookSource).toContain("export function useEnterpriseAuditBackupActions");
    expect(auditBackupHookSource).toContain("exportEnterpriseAuditCsv");
    expect(auditBackupHookSource).toContain("exportEnterpriseBackupJson");
    expect(auditBackupHookSource).toContain("deliverEnterpriseAuditLogFromWorkspace");
    expect(auditBackupHookSource).toContain("deliverEnterpriseBackupFromWorkspace");
    expect(auditBackupHookSource).toContain("downloadText(\"sena-enterprise-audit-log.csv\"");
    expect(auditBackupHookSource).toContain("refreshEnterpriseTeamState");
    expect(auditBackupHookSource).toContain("deliverEnterpriseAuditLogAction");
    expect(auditBackupHookSource).toContain("deliverEnterpriseBackupAction");
    expect(workspaceSource).not.toContain("Enterprise audit CSV exported.");
    expect(workspaceSource).not.toContain("Enterprise audit CSV export failed.");
    expect(workspaceSource).not.toContain("Sign in before delivering enterprise audit events.");
    expect(workspaceSource).not.toContain("Audit delivery checked:");
    expect(workspaceSource).not.toContain("Enterprise audit delivery failed.");
    expect(workspaceSource).not.toContain("Sign in before delivering enterprise backup artifacts.");
    expect(workspaceSource).not.toContain("Backup delivery ${payload.status");
    expect(workspaceSource).not.toContain("Enterprise backup delivery failed.");
    expect(auditBackupHook.runtimeExports).toMatchObject({
      useEnterpriseAuditBackupActions
    });
    expect(auditBackupHook.containerResponsibilities).toEqual([
      "own enterprise audit CSV export, backup export, audit delivery, and backup delivery callbacks",
      "keep audit and backup action calls, CSV download binding, team refresh, and delivery status messages outside the main workspace container"
    ]);
  });

  it("keeps database sync callbacks in a focused runtime hook", () => {
    const databaseSyncHookPath = new URL("../../../components/sena/workspace/use-enterprise-database-sync-actions.ts", import.meta.url);
    const databaseSyncHookSource = existsSync(databaseSyncHookPath) ? readFileSync(databaseSyncHookPath, "utf8") : "";
    const workspaceSource = workspaceContainerSource();
    const databaseSyncHook = boundaryModule("use-enterprise-database-sync-actions" as SenaWorkspaceBoundaryModuleId);

    expect(existsSync(databaseSyncHookPath)).toBe(true);
    expect(databaseSyncHookSource).toContain("export function useEnterpriseDatabaseSyncActions");
    expect(databaseSyncHookSource).toContain("syncEnterpriseDatabaseFromWorkspace");
    expect(databaseSyncHookSource).toContain("syncEnterpriseDatabaseAction");
    expect(databaseSyncHookSource).toContain("refreshEnterpriseTeamState");
    expect(databaseSyncHookSource).toContain("Database sync ${payload.status");
    expect(workspaceSource).not.toContain("Sign in before running enterprise database sync.");
    expect(workspaceSource).not.toContain("Database sync ${payload.status");
    expect(workspaceSource).not.toContain("Enterprise database sync failed.");
    expect(databaseSyncHook.runtimeExports).toMatchObject({
      useEnterpriseDatabaseSyncActions
    });
    expect(databaseSyncHook.containerResponsibilities).toEqual([
      "own enterprise database sync callbacks",
      "keep database sync action calls, team refresh, and database sync status messages outside the main workspace container"
    ]);
  });

  it("keeps identity and team enterprise actions in a focused helper module", () => {
    const actions = boundaryModule("enterprise-actions");

    expect(actions.runtimeExports).toMatchObject({
      createTeamInvitationAction,
      deliverEnterpriseNotificationsAction,
      startEnterpriseMfaSetupAction
    });
    expect(actions.containerResponsibilities).toEqual([
      "call typed enterprise action helpers",
      "avoid inline identity/team request bodies"
    ]);
  });

  it("keeps report and export panel implementation in a focused module", () => {
    const reportGenerator = boundaryModule("report-generator");

    expect(reportGenerator.runtimeExports).toMatchObject({
      ReportGenerator
    });
    expect(reportGenerator.containerResponsibilities).toEqual([
      "render ReportGenerator with prepared audits and export callbacks",
      "avoid keeping report gate JSX in the main workspace container"
    ]);
  });

  it("extracts enterprise ops export controls from the main workspace container", () => {
    const opsExportsPath = new URL("../../../components/sena/workspace/enterprise-ops-exports.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");

    expect(existsSync(opsExportsPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseOpsExports");
    expect(workspaceSource).not.toContain('data-testid="enterprise-ops-exports" data-visual-role="enterprise-ops-artifact-exports"');
    expect(boundarySource).toContain('"enterprise-ops-exports"');
    expect(boundaryModule("enterprise-ops-exports").runtimeExports).toMatchObject({
      EnterpriseOpsExports
    });
  });

  it("extracts governance export and notification panels from the main workspace container", async () => {
    const governanceNotificationsPanelPath = new URL("../../../components/sena/workspace/enterprise-governance-notifications-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(governanceNotificationsPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-governance-notifications-panel")
      : null;

    expect(existsSync(governanceNotificationsPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseGovernanceNotificationsPanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-governance-exports" data-visual-role="enterprise-governance-artifact-exports"');
    expect(workspaceSource).not.toContain('data-testid="enterprise-notification-center" data-visual-role="enterprise-notification-center"');
    expect(boundarySource).toContain('"enterprise-governance-notifications-panel"');
    expect(boundaryModule("enterprise-governance-notifications-panel").runtimeExports).toMatchObject({
      EnterpriseGovernanceNotificationsPanel: panelModule?.EnterpriseGovernanceNotificationsPanel
    });
  });

  it("extracts upload storage controls from the main workspace container", async () => {
    const uploadStoragePanelPath = new URL("../../../components/sena/workspace/enterprise-upload-storage-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(uploadStoragePanelPath)
      ? await import("../../../components/sena/workspace/enterprise-upload-storage-panel")
      : null;

    expect(existsSync(uploadStoragePanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseUploadStoragePanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-upload-storage" data-visual-role="enterprise-upload-storage-registry"');
    expect(boundarySource).toContain('"enterprise-upload-storage-panel"');
    expect(boundaryModule("enterprise-upload-storage-panel").runtimeExports).toMatchObject({
      EnterpriseUploadStoragePanel: panelModule?.EnterpriseUploadStoragePanel
    });
  });

  it("extracts platform decision review from the main workspace container", async () => {
    const platformDecisionPanelPath = new URL("../../../components/sena/workspace/enterprise-platform-decision-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(platformDecisionPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-platform-decision-panel")
      : null;

    expect(existsSync(platformDecisionPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterprisePlatformDecisionPanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-platform-decision-review" data-visual-role="enterprise-platform-decision-review"');
    expect(boundarySource).toContain('"enterprise-platform-decision-panel"');
    expect(boundaryModule("enterprise-platform-decision-panel").runtimeExports).toMatchObject({
      EnterprisePlatformDecisionPanel: panelModule?.EnterprisePlatformDecisionPanel
    });
  });

  it("extracts collaboration pubsub and SSO preflight panels from the main workspace container", async () => {
    const collaborationSsoPanelPath = new URL("../../../components/sena/workspace/enterprise-collaboration-sso-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(collaborationSsoPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-collaboration-sso-panel")
      : null;

    expect(existsSync(collaborationSsoPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseCollaborationSsoPanel");
    expect(workspaceSource).not.toContain('data-visual-role="enterprise-collaboration-pubsub-bridge"');
    expect(workspaceSource).not.toContain('data-testid="enterprise-sso-preflight" data-visual-role="enterprise-sso-preflight"');
    expect(boundarySource).toContain('"enterprise-collaboration-sso-panel"');
    expect(boundaryModule("enterprise-collaboration-sso-panel").runtimeExports).toMatchObject({
      EnterpriseCollaborationSsoPanel: panelModule?.EnterpriseCollaborationSsoPanel
    });
  });

  it("extracts account security and session controls from the main workspace container", async () => {
    const accountSecurityPanelPath = new URL("../../../components/sena/workspace/enterprise-account-security-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(accountSecurityPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-account-security-panel")
      : null;

    expect(existsSync(accountSecurityPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseAccountSecurityPanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-account-security" data-visual-role="enterprise-auth-mfa-controls"');
    expect(boundarySource).toContain('"enterprise-account-security-panel"');
    expect(boundaryModule("enterprise-account-security-panel").runtimeExports).toMatchObject({
      EnterpriseAccountSecurityPanel: panelModule?.EnterpriseAccountSecurityPanel
    });
  });

  it("extracts provisioning and SCIM readiness from the main workspace container", async () => {
    const provisioningPanelPath = new URL("../../../components/sena/workspace/enterprise-provisioning-readiness-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(provisioningPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-provisioning-readiness-panel")
      : null;

    expect(existsSync(provisioningPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseProvisioningReadinessPanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-provisioning-readiness" data-visual-role="enterprise-provisioning-scim-readiness"');
    expect(boundarySource).toContain('"enterprise-provisioning-readiness-panel"');
    expect(boundaryModule("enterprise-provisioning-readiness-panel").runtimeExports).toMatchObject({
      EnterpriseProvisioningReadinessPanel: panelModule?.EnterpriseProvisioningReadinessPanel
    });
  });

  it("extracts team operations from the main workspace container", async () => {
    const teamOperationsPanelPath = new URL("../../../components/sena/workspace/enterprise-team-operations-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(teamOperationsPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-team-operations-panel")
      : null;

    expect(existsSync(teamOperationsPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseTeamOperationsPanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-team-operations" data-visual-role="enterprise-rbac-team-operations"');
    expect(boundarySource).toContain('"enterprise-team-operations-panel"');
    expect(boundaryModule("enterprise-team-operations-panel").runtimeExports).toMatchObject({
      EnterpriseTeamOperationsPanel: panelModule?.EnterpriseTeamOperationsPanel
    });
  });

  it("extracts collaboration project controls from the main workspace container", async () => {
    const collaborationProjectPanelPath = new URL("../../../components/sena/workspace/enterprise-collaboration-project-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(collaborationProjectPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-collaboration-project-panel")
      : null;

    expect(existsSync(collaborationProjectPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseCollaborationProjectPanel");
    expect(workspaceSource).not.toContain('<MetricCell label="Version" value={enterpriseCollaboration.project.currentVersion} />');
    expect(workspaceSource).not.toContain('data-testid="enterprise-claim-evidence-package-details"');
    expect(boundarySource).toContain('"enterprise-collaboration-project-panel"');
    expect(boundaryModule("enterprise-collaboration-project-panel").runtimeExports).toMatchObject({
      EnterpriseCollaborationProjectPanel: panelModule?.EnterpriseCollaborationProjectPanel
    });
  });

  it("extracts local validation controls from the main workspace container", async () => {
    const localValidationPanelPath = new URL("../../../components/sena/workspace/enterprise-local-validation-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(localValidationPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-local-validation-panel")
      : null;

    expect(existsSync(localValidationPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseLocalValidationPanel");
    expect(workspaceSource).not.toContain('data-testid="local-validation-controls" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2"');
    expect(workspaceSource).not.toContain('data-testid="local-validation-suite-summary"');
    expect(boundarySource).toContain('"enterprise-local-validation-panel"');
    expect(boundaryModule("enterprise-local-validation-panel").runtimeExports).toMatchObject({
      EnterpriseLocalValidationPanel: panelModule?.EnterpriseLocalValidationPanel
    });
  });

  it("extracts the enterprise runtime header from the main workspace container", async () => {
    const runtimeHeaderPanelPath = new URL("../../../components/sena/workspace/enterprise-runtime-header-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(runtimeHeaderPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-runtime-header-panel")
      : null;

    expect(existsSync(runtimeHeaderPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseRuntimeHeaderPanel");
    expect(workspaceSource).not.toContain('<div className="text-sm font-black text-foreground">Enterprise runtime</div>');
    expect(workspaceSource).not.toContain('data-testid="enterprise-validation-parity-evidence"');
    expect(boundarySource).toContain('"enterprise-runtime-header-panel"');
    expect(boundaryModule("enterprise-runtime-header-panel").runtimeExports).toMatchObject({
      EnterpriseRuntimeHeaderPanel: panelModule?.EnterpriseRuntimeHeaderPanel
    });
  });

  it("extracts enterprise server project controls from the main workspace container", async () => {
    const serverProjectControlsPanelPath = new URL("../../../components/sena/workspace/enterprise-server-project-controls-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(serverProjectControlsPanelPath)
      ? await import("../../../components/sena/workspace/enterprise-server-project-controls-panel")
      : null;

    expect(existsSync(serverProjectControlsPanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseServerProjectControlsPanel");
    expect(workspaceSource).not.toContain("<option value=\"\">Server projects ({enterpriseProjects.length})</option>");
    expect(workspaceSource).not.toContain('data-testid="enterprise-import-cleaning-manifest-export"');
    expect(boundarySource).toContain('"enterprise-server-project-controls-panel"');
    expect(boundaryModule("enterprise-server-project-controls-panel").runtimeExports).toMatchObject({
      EnterpriseServerProjectControlsPanel: panelModule?.EnterpriseServerProjectControlsPanel
    });
  });

  it("extracts enterprise runtime panel composition from the main workspace container", () => {
    const runtimePanelPath = new URL("../../../components/sena/workspace/enterprise-runtime-panel.tsx", import.meta.url);
    const runtimeSectionPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-section.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const reportDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const reportDeckSource = existsSync(reportDeckPath) ? readFileSync(reportDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const sectionSource = readFileSync(runtimeSectionPath, "utf8");

    expect(existsSync(runtimePanelPath)).toBe(true);
    expect(existsSync(runtimeSectionPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceEnterpriseRuntimeSection");
    expect(leftRailSource).not.toContain("<WorkspaceEnterpriseRuntimeSection");
    expect(reportDeckSource).toContain("<WorkspaceEnterpriseRuntimeSection");
    expect(workspaceSource).not.toContain("<EnterpriseRuntimePanel");
    expect(sectionSource).toContain("<EnterpriseRuntimePanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-runtime-panel" className="grid gap-3 rounded-lg border border-cyanGlow/30 bg-cyanGlow/10 p-3"');
    expect(workspaceSource).not.toContain("<EnterpriseRuntimeHeaderPanel");
    expect(boundarySource).toContain('"enterprise-runtime-panel"');
    expect(boundaryModule("enterprise-runtime-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toHaveProperty("EnterpriseRuntimePanel");
  });

  it("extracts enterprise runtime panel prop assembly from the main workspace container", async () => {
    const runtimeSectionPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-section.tsx", import.meta.url);
    const runtimePropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-prop-group.ts", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const reportDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const sectionSource = existsSync(runtimeSectionPath) ? readFileSync(runtimeSectionPath, "utf8") : "";
    const propGroupSource = existsSync(runtimePropGroupPath) ? readFileSync(runtimePropGroupPath, "utf8") : "";
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const reportDeckSource = existsSync(reportDeckPath) ? readFileSync(reportDeckPath, "utf8") : "";
    const sectionModule = existsSync(runtimeSectionPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-section")
      : null;
    const propGroupModule = existsSync(runtimePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-prop-group")
      : null;

    expect(existsSync(runtimeSectionPath)).toBe(true);
    expect(existsSync(runtimePropGroupPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).toContain("buildWorkspaceEnterpriseRuntimeProps({");
    expect(workspaceSource).toContain("enterpriseRuntimeProps: enterpriseRuntimeSectionProps");
    expect(workspaceSource).not.toContain('} satisfies WorkspaceEnterpriseRuntimeSectionProps["runtimeProps"]');
    expect(leftRailSource).not.toContain("<WorkspaceEnterpriseRuntimeSection");
    expect(reportDeckSource).toContain("<WorkspaceEnterpriseRuntimeSection runtimeProps={enterpriseRuntimeProps} />");
    expect(workspaceSource).not.toContain("<WorkspaceEnterpriseRuntimeSection\n                  busy=");
    expect(workspaceSource).not.toContain("<EnterpriseRuntimePanel");
    expect(propGroupSource).toContain("export function buildWorkspaceEnterpriseRuntimeProps");
    expect(propGroupSource).toContain("WorkspaceEnterpriseRuntimePropGroup");
    expect(sectionSource).toContain("<EnterpriseRuntimePanel");
    expect(sectionSource).toContain("runtimeProps: EnterpriseRuntimePanelProps");
    expect(sectionSource).toContain("satisfies EnterpriseRuntimePanelProps");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-prop-group"');
    expect(boundarySource).toContain('"workspace-enterprise-runtime-section"');
    expect(boundaryModule("workspace-enterprise-runtime-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeProps
    });
    expect(boundaryModule("workspace-enterprise-runtime-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceEnterpriseRuntimeSection: sectionModule?.WorkspaceEnterpriseRuntimeSection
    });
  });

  it("keeps enterprise runtime prop composition in a focused container builder", () => {
    const workspaceSource = workspaceContainerSource();
    const builderSource = readFileSync(new URL("../../../components/sena/workspace/workspace-enterprise-runtime-container-props.ts", import.meta.url), "utf8");

    expect(workspaceSource).toContain("const enterpriseRuntimeSectionProps = buildWorkspaceEnterpriseRuntimeContainerProps({");
    expect(workspaceSource).not.toContain("const enterpriseRuntimeValidationProps = buildWorkspaceEnterpriseRuntimeValidationProps({");
    expect(workspaceSource).not.toContain("const enterpriseRuntimeCollaborationProjectProps = buildWorkspaceEnterpriseRuntimeCollaborationProjectProps({");
    expect(builderSource).toContain("export function buildWorkspaceEnterpriseRuntimeContainerProps");
    expect(builderSource).toContain("const enterpriseRuntimeValidationProps = buildWorkspaceEnterpriseRuntimeValidationProps({");
    expect(builderSource).toContain("const enterpriseRuntimeCollaborationProjectProps = buildWorkspaceEnterpriseRuntimeCollaborationProjectProps({");
    expect(builderSource).toContain("return buildWorkspaceEnterpriseRuntimeProps({");
    expect(boundaryModule("workspace-enterprise-runtime-container-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeContainerProps
    });
  });

  it("extracts enterprise runtime validation props into a focused prop group", async () => {
    const validationPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-validation-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(validationPropGroupPath) ? readFileSync(validationPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(validationPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-validation-prop-group")
      : null;

    expect(existsSync(validationPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeValidationProps = buildWorkspaceEnterpriseRuntimeValidationProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeValidationProps,");
    expect(propGroupSource).toContain("validationGroupField");
    expect(propGroupSource).toContain("latestValidationPreregistrationPlan");
    expect(propGroupSource).toContain("onRunEnterpriseValidationComparison");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-validation-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-validation-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeValidationProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeValidationProps
    });
  });

  it("extracts enterprise runtime project props into a focused prop group", async () => {
    const projectPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-project-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(projectPropGroupPath) ? readFileSync(projectPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(projectPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-project-prop-group")
      : null;

    expect(existsSync(projectPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeProjectProps = buildWorkspaceEnterpriseRuntimeProjectProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeProjectProps,");
    expect(propGroupSource).toContain("activeEnterpriseProjectId");
    expect(propGroupSource).toContain("enterpriseProjects");
    expect(propGroupSource).toContain("onExportEnterpriseCleaningManifestJson");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-project-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-project-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeProjectProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeProjectProps
    });
  });

  it("extracts enterprise runtime governance props into a focused prop group", async () => {
    const governancePropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-governance-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governancePropGroupPath) ? readFileSync(governancePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governancePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-governance-prop-group")
      : null;

    expect(existsSync(governancePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeGovernanceProps = buildWorkspaceEnterpriseRuntimeGovernanceProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeGovernanceProps,");
    expect(propGroupSource).toContain("enterpriseTeamState");
    expect(propGroupSource).toContain("enterpriseNotifications");
    expect(propGroupSource).toContain("onExportGovernanceHealthJson");
    expect(propGroupSource).toContain("onDeliverNotifications");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-governance-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-governance-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeGovernanceProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeGovernanceProps
    });
  });

  it("extracts enterprise runtime ops props into a focused prop group", async () => {
    const opsPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-ops-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(opsPropGroupPath) ? readFileSync(opsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(opsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-ops-prop-group")
      : null;

    expect(existsSync(opsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeOpsProps = buildWorkspaceEnterpriseRuntimeOpsProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeOpsProps,");
    expect(propGroupSource).toContain("canSubmitAttestation");
    expect(propGroupSource).toContain("onExportDeploymentPackageJson");
    expect(propGroupSource).toContain("onExportGoLiveMonitorJson");
    expect(propGroupSource).toContain("onDeliverOpsAlerts");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-ops-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-ops-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeOpsProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeOpsProps
    });
  });

  it("extracts enterprise runtime upload props into a focused prop group", async () => {
    const uploadPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-upload-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(uploadPropGroupPath) ? readFileSync(uploadPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(uploadPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-upload-prop-group")
      : null;

    expect(existsSync(uploadPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeUploadProps = buildWorkspaceEnterpriseRuntimeUploadProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeUploadProps,");
    expect(propGroupSource).toContain("enterpriseUploadStorage");
    expect(propGroupSource).toContain("enterpriseUploadVerification");
    expect(propGroupSource).toContain("onDeliverUploadObjectStorage");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-upload-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-upload-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeUploadProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeUploadProps
    });
  });

  it("extracts enterprise runtime collaboration props into a focused prop group", async () => {
    const collaborationPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-collaboration-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(collaborationPropGroupPath) ? readFileSync(collaborationPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(collaborationPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-collaboration-prop-group")
      : null;

    expect(existsSync(collaborationPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeCollaborationProps = buildWorkspaceEnterpriseRuntimeCollaborationProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeCollaborationProps,");
    expect(propGroupSource).toContain("enterpriseCollaboration");
    expect(propGroupSource).toContain("enterpriseSsoPreflight");
    expect(propGroupSource).toContain("onDeliverCollaborationPubSub");
    expect(propGroupSource).toContain("onRunSsoPreflight");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-collaboration-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-collaboration-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeCollaborationProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeCollaborationProps
    });
  });

  it("extracts enterprise runtime provisioning props into a focused prop group", async () => {
    const provisioningPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-provisioning-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(provisioningPropGroupPath) ? readFileSync(provisioningPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(provisioningPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-provisioning-prop-group")
      : null;

    expect(existsSync(provisioningPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeProvisioningProps = buildWorkspaceEnterpriseRuntimeProvisioningProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeProvisioningProps,");
    expect(propGroupSource).toContain("enterpriseDeploymentPackage");
    expect(propGroupSource).toContain("identityProductionHandoff");
    expect(propGroupSource).toContain("provisioningServiceEndpoints");
    expect(propGroupSource).toContain("onApplyIdentityRequestToPlatformDecision");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-provisioning-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-provisioning-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeProvisioningProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeProvisioningProps
    });
  });

  it("extracts enterprise runtime account security props into a focused prop group", async () => {
    const accountSecurityPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-account-security-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(accountSecurityPropGroupPath) ? readFileSync(accountSecurityPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(accountSecurityPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-account-security-prop-group")
      : null;

    expect(existsSync(accountSecurityPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeAccountSecurityProps = buildWorkspaceEnterpriseRuntimeAccountSecurityProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeAccountSecurityProps,");
    expect(propGroupSource).toContain("enterpriseMfaStatus");
    expect(propGroupSource).toContain("enterpriseSessionList");
    expect(propGroupSource).toContain("onStartMfaSetup");
    expect(propGroupSource).toContain("onRevokeSession");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-account-security-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-account-security-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeAccountSecurityProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeAccountSecurityProps
    });
  });

  it("extracts enterprise runtime team operations props into a focused prop group", async () => {
    const teamOperationsPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-team-operations-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(teamOperationsPropGroupPath) ? readFileSync(teamOperationsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(teamOperationsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-team-operations-prop-group")
      : null;

    expect(existsSync(teamOperationsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeTeamOperationsProps = buildWorkspaceEnterpriseRuntimeTeamOperationsProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeTeamOperationsProps,");
    expect(propGroupSource).toContain("enterpriseTeamState");
    expect(propGroupSource).toContain("pendingEnterpriseInvitations");
    expect(propGroupSource).toContain("onCreateTeamInvitation");
    expect(propGroupSource).toContain("onRevokeTeamInvitation");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-team-operations-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-team-operations-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeTeamOperationsProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeTeamOperationsProps
    });
  });

  it("extracts enterprise runtime platform decision props into a focused prop group", async () => {
    const platformDecisionPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-platform-decision-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(platformDecisionPropGroupPath) ? readFileSync(platformDecisionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(platformDecisionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-platform-decision-prop-group")
      : null;

    expect(existsSync(platformDecisionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimePlatformDecisionProps = buildWorkspaceEnterpriseRuntimePlatformDecisionProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimePlatformDecisionProps,");
    expect(propGroupSource).toContain("enterprisePlatformDecisionState");
    expect(propGroupSource).toContain("platformDecisionProductionEvidenceIds");
    expect(propGroupSource).toContain("onExportNativeAdapterCertificationJson");
    expect(propGroupSource).toContain("onSubmitPlatformDecisionReview");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-platform-decision-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-platform-decision-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimePlatformDecisionProps: propGroupModule?.buildWorkspaceEnterpriseRuntimePlatformDecisionProps
    });
  });

  it("extracts enterprise runtime release gate props into a focused prop group", async () => {
    const releaseGatePropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-release-gate-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(releaseGatePropGroupPath) ? readFileSync(releaseGatePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(releaseGatePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-release-gate-prop-group")
      : null;

    expect(existsSync(releaseGatePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeReleaseGateProps = buildWorkspaceEnterpriseRuntimeReleaseGateProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeReleaseGateProps,");
    expect(propGroupSource).toContain("enterpriseReleaseGateState");
    expect(propGroupSource).toContain("latestReleaseGateIdentitySnapshot");
    expect(propGroupSource).toContain("onExportReleaseGateReviewsJson");
    expect(propGroupSource).toContain("onSubmitReleaseGateReview");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-release-gate-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-release-gate-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeReleaseGateProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeReleaseGateProps
    });
  });

  it("extracts enterprise runtime collaboration project props into a focused prop group", async () => {
    const collaborationProjectPropGroupPath = new URL("../../../components/sena/workspace/workspace-enterprise-runtime-collaboration-project-prop-group.ts", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(collaborationProjectPropGroupPath) ? readFileSync(collaborationProjectPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(collaborationProjectPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-enterprise-runtime-collaboration-project-prop-group")
      : null;

    expect(existsSync(collaborationProjectPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const enterpriseRuntimeCollaborationProjectProps = buildWorkspaceEnterpriseRuntimeCollaborationProjectProps({");
    expect(workspaceSource).toContain("...enterpriseRuntimeCollaborationProjectProps,");
    expect(propGroupSource).toContain("enterpriseClaimPackage");
    expect(propGroupSource).toContain("expertInterpretationValidity");
    expect(propGroupSource).toContain("onExportEnterpriseExpertReviewDossierJson");
    expect(propGroupSource).toContain("onAddEnterpriseAdjudication");
    expect(boundarySource).toContain('"workspace-enterprise-runtime-collaboration-project-prop-group"');
    expect(boundaryModule("workspace-enterprise-runtime-collaboration-project-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceEnterpriseRuntimeCollaborationProjectProps: propGroupModule?.buildWorkspaceEnterpriseRuntimeCollaborationProjectProps
    });
  });

  it("extracts the enterprise release gate panel from the main workspace container", () => {
    const releaseGatePanelPath = new URL("../../../components/sena/workspace/enterprise-release-gate-panel.tsx", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");

    expect(existsSync(releaseGatePanelPath)).toBe(true);
    expect(enterpriseRuntimePanelSource()).toContain("<EnterpriseReleaseGatePanel");
    expect(workspaceSource).not.toContain('data-testid="enterprise-release-gate-identity-snapshot" className="grid gap-2 border-t border-cardBorder/35 pt-3');
    expect(boundarySource).toContain('"enterprise-release-gate-panel"');
    expect(boundaryModule("enterprise-release-gate-panel").runtimeExports).toMatchObject({
      EnterpriseReleaseGatePanel
    });
  });

  it("extracts reusable workspace primitive controls from the main workspace container", async () => {
    const primitivesPath = new URL("../../../components/sena/workspace/workspace-primitives.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = enterpriseRuntimeCompositionSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const primitiveModule = existsSync(primitivesPath)
      ? await import("../../../components/sena/workspace/workspace-primitives")
      : null;

    expect(existsSync(primitivesPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("from \"./workspace/workspace-primitives\"");
    expect(reportAndStatsDeckSource).toContain("from \"./workspace-primitives\"");
    expect(workspaceSource).not.toContain("function Panel(");
    expect(workspaceSource).not.toContain("function MetricCell(");
    expect(workspaceSource).not.toContain("function Slider(");
    expect(workspaceSource).not.toContain("function IntegerControl(");
    expect(workspaceSource).not.toContain("function MappingSelect(");
    expect(boundarySource).toContain('"workspace-primitives"');
    expect(boundaryModule("workspace-primitives" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      Panel: primitiveModule?.Panel,
      MetricCell: primitiveModule?.MetricCell,
      Slider: primitiveModule?.Slider,
      IntegerControl: primitiveModule?.IntegerControl,
      MappingSelect: primitiveModule?.MappingSelect
    });
  });

  it("extracts workspace shell, rail, plot switcher, viewport, and zoom controls from the main workspace container", async () => {
    const shellPanelsPath = new URL("../../../components/sena/workspace/workspace-shell-panels.tsx", import.meta.url);
    const centralPlotDeckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const centralPlotDeckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const centralPlotDeckShellControlsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-shell-controls.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const centralPlotDeckSource = existsSync(centralPlotDeckPath) ? readFileSync(centralPlotDeckPath, "utf8") : "";
    const centralPlotDeckRenderSource = existsSync(centralPlotDeckRenderPath) ? readFileSync(centralPlotDeckRenderPath, "utf8") : "";
    const centralPlotDeckShellControlsSource = existsSync(centralPlotDeckShellControlsPath) ? readFileSync(centralPlotDeckShellControlsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const shellModule = existsSync(shellPanelsPath)
      ? await import("../../../components/sena/workspace/workspace-shell-panels")
      : null;

    expect(existsSync(shellPanelsPath)).toBe(true);
    expect(workspaceSource).toContain("<WorkspaceRail");
    expect(`${centralPlotDeckSource}\n${centralPlotDeckRenderSource}`).toContain("<WorkspaceShellPanel");
    expect(`${centralPlotDeckSource}\n${centralPlotDeckRenderSource}\n${centralPlotDeckShellControlsSource}`).toContain("<FusionPlotZoomControls");
    expect(workspaceSource).not.toContain("function WorkspaceRail(");
    expect(workspaceSource).not.toContain("function PlotSwitcher(");
    expect(workspaceSource).not.toContain("function ActivePlotViewToolbar(");
    expect(workspaceSource).not.toContain("function WorkspaceViewportPanel(");
    expect(workspaceSource).not.toContain("function WorkspaceShellPanel(");
    expect(workspaceSource).not.toContain("function FusionPlotZoomControls(");
    expect(workspaceSource).not.toContain('data-testid="workspace-plot-switcher"');
    expect(workspaceSource).not.toContain('data-testid={`fusion-plot-${testScope}-zoom-controls`}');
    expect(boundarySource).toContain('"workspace-shell-panels"');
    expect(boundaryModule("workspace-shell-panels" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceRail: shellModule?.WorkspaceRail,
      WorkspaceShellPanel: shellModule?.WorkspaceShellPanel,
      WorkspaceViewportPanel: shellModule?.WorkspaceViewportPanel,
      ActivePlotViewToolbar: shellModule?.ActivePlotViewToolbar,
      FusionPlotZoomControls: shellModule?.FusionPlotZoomControls
    });
  });

  it("extracts the workspace header from the main workspace container", async () => {
    const headerPath = new URL("../../../components/sena/workspace/workspace-header-section.tsx", import.meta.url);
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const headerSource = existsSync(headerPath) ? readFileSync(headerPath, "utf8") : "";
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const headerModule = existsSync(headerPath)
      ? await import("../../../components/sena/workspace/workspace-header-section")
      : null;

    expect(existsSync(headerPath)).toBe(true);
    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceHeaderSection");
    expect(mainShellSource).toContain("<WorkspaceHeaderSection");
    expect(workspaceSource).not.toContain("SENA Analysis Studio");
    expect(workspaceSource).not.toContain('data-testid="sena-upload-input"');
    expect(headerSource).toContain("SENA Analysis Studio");
    expect(headerSource).toContain('data-testid="sena-upload-input"');
    expect(boundarySource).toContain('"workspace-header-section"');
    expect(boundaryModule("workspace-header-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceHeaderSection: headerModule?.WorkspaceHeaderSection
    });
  });

  it("extracts pilot asset handoff links from the main workspace container", async () => {
    const pilotAssetsPanelPath = new URL("../../../components/sena/workspace/pilot-assets-panel.tsx", import.meta.url);
    const dataImportPanelPath = new URL("../../../components/sena/workspace/workspace-data-import-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const dataImportSource = existsSync(dataImportPanelPath) ? readFileSync(dataImportPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(pilotAssetsPanelPath)
      ? await import("../../../components/sena/workspace/pilot-assets-panel")
      : null;

    expect(existsSync(pilotAssetsPanelPath)).toBe(true);
    expect(dataImportSource).toContain("<PilotAssetsPanel");
    expect(workspaceSource).not.toContain("function PilotAssetsPanel(");
    expect(workspaceSource).not.toContain("senaPilotHandoffChecks.map");
    expect(workspaceSource).not.toContain("senaPilotTemplateAssets.map");
    expect(boundarySource).toContain('"pilot-assets-panel"');
    expect(boundaryModule("pilot-assets-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      PilotAssetsPanel: panelModule?.PilotAssetsPanel
    });
  });

  it("extracts workspace data import metrics and controls from the main workspace container", async () => {
    const dataImportPanelPath = new URL("../../../components/sena/workspace/workspace-data-import-panel.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(dataImportPanelPath)
      ? await import("../../../components/sena/workspace/workspace-data-import-panel")
      : null;

    expect(existsSync(dataImportPanelPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceDataImportPanel");
    expect(leftRailSource).toContain("<WorkspaceDataImportPanel");
    expect(workspaceSource).not.toContain('data-testid="sena-data-import-upload-input"');
    expect(workspaceSource).not.toContain("CSV/JSON/XLSX tables, LMS/forum exports");
    expect(boundarySource).toContain('"workspace-data-import-panel"');
    expect(boundaryModule("workspace-data-import-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceDataImportPanel: panelModule?.WorkspaceDataImportPanel
    });
  });

  it("extracts workspace data import feedback from the main workspace container", async () => {
    const dataImportFeedbackPath = new URL("../../../components/sena/workspace/workspace-data-import-feedback-section.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const feedbackSource = existsSync(dataImportFeedbackPath) ? readFileSync(dataImportFeedbackPath, "utf8") : "";
    const feedbackModule = existsSync(dataImportFeedbackPath)
      ? await import("../../../components/sena/workspace/workspace-data-import-feedback-section")
      : null;

    expect(existsSync(dataImportFeedbackPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceDataImportFeedbackSection");
    expect(leftRailSource).toContain("<WorkspaceDataImportFeedbackSection");
    expect(workspaceSource).not.toContain("<UploadedTableMapper");
    expect(workspaceSource).not.toContain("timelineModel.summary.warnings.slice(0, 12).map");
    expect(feedbackSource).toContain("<UploadedTableMapper");
    expect(feedbackSource).toContain("warnings.slice(0, 12).map");
    expect(boundarySource).toContain('"workspace-data-import-feedback-section"');
    expect(boundaryModule("workspace-data-import-feedback-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceDataImportFeedbackSection: feedbackModule?.WorkspaceDataImportFeedbackSection
    });
  });

  it("extracts model builder controls from the main workspace container", async () => {
    const modelBuilderPanelPath = new URL("../../../components/sena/workspace/model-builder-panel.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(modelBuilderPanelPath)
      ? await import("../../../components/sena/workspace/model-builder-panel")
      : null;

    expect(existsSync(modelBuilderPanelPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<ModelBuilderPanel");
    expect(leftRailSource).toContain("<ModelBuilderPanel");
    expect(workspaceSource).not.toContain('data-testid={`model-layer-${layer}-toggle`}');
    expect(workspaceSource).not.toContain('data-testid="alpha-slider"');
    expect(workspaceSource).not.toContain('data-testid="normalization-select"');
    expect(boundarySource).toContain('"model-builder-panel"');
    expect(boundaryModule("model-builder-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      ModelBuilderPanel: panelModule?.ModelBuilderPanel
    });
  });

  it("extracts plot tools controls from the main workspace container", async () => {
    const plotToolsPanelPath = new URL("../../../components/sena/workspace/plot-tools-panel.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(plotToolsPanelPath)
      ? await import("../../../components/sena/workspace/plot-tools-panel")
      : null;

    expect(existsSync(plotToolsPanelPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<PlotToolsPanel");
    expect(leftRailSource).toContain("<PlotToolsPanel");
    expect(workspaceSource).not.toContain("function WorkspaceToolSection(");
    expect(workspaceSource).not.toContain("function WorkspaceSecondaryDrawer(");
    expect(workspaceSource).not.toContain('data-testid="plot-tools-dimensions-section"');
    expect(workspaceSource).not.toContain('data-testid="plot-alpha-slider"');
    expect(boundarySource).toContain('"plot-tools-panel"');
    expect(boundaryModule("plot-tools-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      PlotToolsPanel: panelModule?.PlotToolsPanel
    });
  });

  it("extracts the left rail panel composition from the main workspace container", async () => {
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const leftRailModule = existsSync(leftRailPanelPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-section")
      : null;

    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceLeftRailPanelSection");
    expect(mainShellSource).toContain("<WorkspaceLeftRailPanelSection");
    expect(workspaceSource).not.toContain('data-testid="workspace-left-panel"');
    expect(workspaceSource).not.toContain("Research workflow");
    expect(leftRailSource).toContain('data-testid="workspace-left-panel"');
    expect(leftRailSource).toContain("<WorkflowRail");
    expect(leftRailSource).toContain("<WorkspaceStatsPanel");
    expect(boundarySource).toContain('"workspace-left-rail-panel-section"');
    expect(boundaryModule("workspace-left-rail-panel-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceLeftRailPanelSection: leftRailModule?.WorkspaceLeftRailPanelSection
    });
  });

  it("extracts uploaded table mapping controls from the main workspace container", async () => {
    const uploadedTableMapperPath = new URL("../../../components/sena/workspace/uploaded-table-mapper.tsx", import.meta.url);
    const dataImportFeedbackPath = new URL("../../../components/sena/workspace/workspace-data-import-feedback-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const feedbackSource = existsSync(dataImportFeedbackPath) ? readFileSync(dataImportFeedbackPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const mapperModule = existsSync(uploadedTableMapperPath)
      ? await import("../../../components/sena/workspace/uploaded-table-mapper")
      : null;

    expect(existsSync(uploadedTableMapperPath)).toBe(true);
    expect(existsSync(dataImportFeedbackPath)).toBe(true);
    expect(workspaceSource).not.toContain("<UploadedTableMapper");
    expect(feedbackSource).toContain("<UploadedTableMapper");
    expect(workspaceSource).not.toContain("function UploadedTableMapper(");
    expect(workspaceSource).not.toContain("missingRequiredSenaFields(table.table, table.mapping)");
    expect(workspaceSource).not.toContain("senaImportFields[table.table].map");
    expect(boundarySource).toContain('"uploaded-table-mapper"');
    expect(boundaryModule("uploaded-table-mapper" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      UploadedTableMapper: mapperModule?.UploadedTableMapper
    });
  });

  it("extracts compact matrix previews from the main workspace container", async () => {
    const matrixPreviewPath = new URL("../../../components/sena/workspace/matrix-preview.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const previewModule = existsSync(matrixPreviewPath)
      ? await import("../../../components/sena/workspace/matrix-preview")
      : null;

    expect(existsSync(matrixPreviewPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<MatrixPreview");
    expect(reportAndStatsDeckSource).toContain("<MatrixPreview");
    expect(workspaceSource).not.toContain("function MatrixPreview(");
    expect(workspaceSource).not.toContain("values.slice(0, 6)");
    expect(workspaceSource).not.toContain("columnLabels.slice(0, 6)");
    expect(boundarySource).toContain('"matrix-preview"');
    expect(boundaryModule("matrix-preview" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      MatrixPreview: previewModule?.MatrixPreview
    });
  });

  it("extracts the report section from the main workspace container", async () => {
    const reportSectionPath = new URL("../../../components/sena/workspace/workspace-report-section.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const reportSectionModule = existsSync(reportSectionPath)
      ? await import("../../../components/sena/workspace/workspace-report-section")
      : null;

    expect(existsSync(reportSectionPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceReportSection");
    expect(reportAndStatsDeckSource).toContain("<WorkspaceReportSection");
    expect(workspaceSource).not.toContain("<ReportGenerator");
    expect(boundarySource).toContain('"workspace-report-section"');
    expect(boundaryModule("workspace-report-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceReportSection: reportSectionModule?.WorkspaceReportSection
    });
  });

  it("extracts runtime provenance and handoff evidence panels from the main workspace container", async () => {
    const provenancePanelsPath = new URL("../../../components/sena/workspace/runtime-provenance-panels.tsx", import.meta.url);
    const statsPanelPath = new URL("../../../components/sena/workspace/workspace-stats-panel.tsx", import.meta.url);
    const centralFusionPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const statsPanelSource = existsSync(statsPanelPath) ? readFileSync(statsPanelPath, "utf8") : "";
    const centralFusionSource = existsSync(centralFusionPath) ? readFileSync(centralFusionPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(provenancePanelsPath)
      ? await import("../../../components/sena/workspace/runtime-provenance-panels")
      : null;

    expect(existsSync(provenancePanelsPath)).toBe(true);
    expect(centralFusionSource).toContain("<JointEmbeddingProvenanceStrip");
    expect(statsPanelSource).toContain("<MetricProvenanceSummary");
    expect(statsPanelSource).toContain("<JenaConceptHandoffPanel");
    expect(statsPanelSource).toContain("<JsnaSocialHandoffPanel");
    expect(statsPanelSource).toContain("<MethodProtocolHandoffPanel");
    expect(workspaceSource).not.toContain("function JointEmbeddingProvenanceStrip(");
    expect(workspaceSource).not.toContain("function MetricProvenanceSummary(");
    expect(workspaceSource).not.toContain("function JenaConceptHandoffPanel(");
    expect(workspaceSource).not.toContain("function JsnaSocialHandoffPanel(");
    expect(workspaceSource).not.toContain("function MethodProtocolHandoffPanel(");
    expect(workspaceSource).not.toContain('data-testid="stats-jena-concept-handoff"');
    expect(workspaceSource).not.toContain('data-testid="method-protocol-runtime-handoffs"');
    expect(boundarySource).toContain('"runtime-provenance-panels"');
    expect(boundaryModule("runtime-provenance-panels" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      JointEmbeddingProvenanceStrip: panelModule?.JointEmbeddingProvenanceStrip,
      MetricProvenanceSummary: panelModule?.MetricProvenanceSummary,
      JenaConceptHandoffPanel: panelModule?.JenaConceptHandoffPanel,
      JsnaSocialHandoffPanel: panelModule?.JsnaSocialHandoffPanel,
      MethodProtocolHandoffPanel: panelModule?.MethodProtocolHandoffPanel
    });
  });

  it("extracts central Fusion analysis scope from the main workspace container", async () => {
    const analysisScopePath = new URL("../../../components/sena/workspace/central-fusion-analysis-scope.tsx", import.meta.url);
    const centralPlotDeckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const centralPlotDeckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const centralPlotDeckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const centralPlotDeckSource = existsSync(centralPlotDeckPath) ? readFileSync(centralPlotDeckPath, "utf8") : "";
    const centralPlotDeckRenderSource = existsSync(centralPlotDeckRenderPath) ? readFileSync(centralPlotDeckRenderPath, "utf8") : "";
    const centralPlotDeckBodySource = existsSync(centralPlotDeckBodyPath) ? readFileSync(centralPlotDeckBodyPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const scopeModule = existsSync(analysisScopePath)
      ? await import("../../../components/sena/workspace/central-fusion-analysis-scope")
      : null;

    expect(existsSync(analysisScopePath)).toBe(true);
    expect(`${centralPlotDeckSource}\n${centralPlotDeckRenderSource}\n${centralPlotDeckBodySource}`).toContain("<CentralFusionAnalysisScope");
    expect(workspaceSource).not.toContain("function CentralFusionAnalysisScope(");
    expect(workspaceSource).not.toContain('data-testid="central-fusion-evidence-capsule"');
    expect(workspaceSource).not.toContain('data-testid="central-fusion-transition-delta"');
    expect(boundarySource).toContain('"central-fusion-analysis-scope"');
    expect(boundaryModule("central-fusion-analysis-scope" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralFusionAnalysisScope: scopeModule?.CentralFusionAnalysisScope
    });
  });

  it("extracts the central plot deck view switcher from the main workspace container", async () => {
    const centralPlotDeckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const deckModule = existsSync(centralPlotDeckPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck")
      : null;

    expect(existsSync(centralPlotDeckPath)).toBe(true);
    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceCentralPlotDeck");
    expect(mainShellSource).toContain("<WorkspaceCentralPlotDeck");
    expect(workspaceSource).not.toContain('data-testid="central-fusion-priority-plot"');
    expect(workspaceSource).not.toContain('data-testid="central-fusion-canvas-frame"');
    expect(workspaceSource).not.toContain("ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.");
    expect(boundarySource).toContain('"workspace-central-plot-deck"');
    expect(boundaryModule("workspace-central-plot-deck" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceCentralPlotDeck: deckModule?.WorkspaceCentralPlotDeck
    });
  });

  it("extracts central plot deck rendering into a focused render boundary", async () => {
    const centralPlotDeckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const deckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const deckSource = existsSync(centralPlotDeckPath) ? readFileSync(centralPlotDeckPath, "utf8") : "";
    const renderSource = existsSync(deckRenderPath) ? readFileSync(deckRenderPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const renderModule = existsSync(deckRenderPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-render")
      : null;

    expect(existsSync(deckRenderPath)).toBe(true);
    expect(deckSource).toContain("return renderWorkspaceCentralPlotDeck(props);");
    expect(deckSource).not.toContain("<WorkspaceShellPanel");
    expect(renderSource).toContain("export function WorkspaceCentralPlotDeckRender");
    expect(renderSource).toContain("<WorkspaceShellPanel");
    expect(renderSource).toContain("renderWorkspaceCentralPlotDeck");
    expect(boundarySource).toContain('"workspace-central-plot-deck-render"');
    expect(boundaryModule("workspace-central-plot-deck-render" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      renderWorkspaceCentralPlotDeck: renderModule?.renderWorkspaceCentralPlotDeck
    });
  });

  it("extracts central plot deck view panels into a focused render module", async () => {
    const deckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const deckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckFusionPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx", import.meta.url);
    const deckTemporalPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-temporal-panel.tsx", import.meta.url);
    const deckDualLensPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-dual-lens-panel.tsx", import.meta.url);
    const deckEnaSpacePanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-ena-space-panel.tsx", import.meta.url);
    const deckSnaMetricsPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-sna-metrics-panel.tsx", import.meta.url);
    const deckEvidenceLedgerPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-evidence-ledger-panel.tsx", import.meta.url);
    const deckMatrixPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-matrix-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const renderSource = existsSync(deckRenderPath) ? readFileSync(deckRenderPath, "utf8") : "";
    const bodySource = existsSync(deckBodyPath) ? readFileSync(deckBodyPath, "utf8") : "";
    const viewPanelBranchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const fusionPanelSource = existsSync(deckFusionPanelPath) ? readFileSync(deckFusionPanelPath, "utf8") : "";
    const temporalPanelSource = existsSync(deckTemporalPanelPath) ? readFileSync(deckTemporalPanelPath, "utf8") : "";
    const dualLensPanelSource = existsSync(deckDualLensPanelPath) ? readFileSync(deckDualLensPanelPath, "utf8") : "";
    const enaSpacePanelSource = existsSync(deckEnaSpacePanelPath) ? readFileSync(deckEnaSpacePanelPath, "utf8") : "";
    const snaMetricsPanelSource = existsSync(deckSnaMetricsPanelPath) ? readFileSync(deckSnaMetricsPanelPath, "utf8") : "";
    const evidenceLedgerPanelSource = existsSync(deckEvidenceLedgerPanelPath) ? readFileSync(deckEvidenceLedgerPanelPath, "utf8") : "";
    const matrixPanelSource = existsSync(deckMatrixPanelPath) ? readFileSync(deckMatrixPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");

    expect(existsSync(deckViewPanelsPath)).toBe(false);
    expect(bodySource).not.toContain("<CentralFusionPlotViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralFusionPlotViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralTemporalPlotViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralDualLensViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralEnaSpaceViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralSnaMetricsViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralEvidenceLedgerViewPanel");
    expect(viewPanelBranchesSource).toContain("<CentralMatrixViewPanel");
    expect(fusionPanelSource).toContain("export function CentralFusionPlotViewPanel");
    expect(temporalPanelSource).toContain("export function CentralTemporalPlotViewPanel");
    expect(dualLensPanelSource).toContain("export function CentralDualLensViewPanel");
    expect(enaSpacePanelSource).toContain("export function CentralEnaSpaceViewPanel");
    expect(snaMetricsPanelSource).toContain("export function CentralSnaMetricsViewPanel");
    expect(evidenceLedgerPanelSource).toContain("export function CentralEvidenceLedgerViewPanel");
    expect(matrixPanelSource).toContain("export function CentralMatrixViewPanel");
    expect(renderSource).not.toContain("ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.");
    expect(viewPanelsSource).not.toContain("export function CentralFusionPlotViewPanel");
    expect(viewPanelsSource).not.toContain("export function CentralTemporalPlotViewPanel");
    expect(viewPanelsSource).not.toContain("export function CentralDualLensViewPanel");
    expect(viewPanelsSource).not.toContain("export function CentralEnaSpaceViewPanel");
    expect(viewPanelsSource).not.toContain("export function CentralSnaMetricsViewPanel");
    expect(viewPanelsSource).not.toContain("export function CentralEvidenceLedgerViewPanel");
    expect(viewPanelsSource).not.toContain("export function CentralMatrixViewPanel");
    expect(boundarySource).not.toContain('"workspace-central-plot-deck-view-panels"');
  });

  it("extracts central Fusion plot panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckFusionPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const fusionPanelSource = existsSync(deckFusionPanelPath) ? readFileSync(deckFusionPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const fusionPanelModule = existsSync(deckFusionPanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel")
      : null;

    expect(existsSync(deckFusionPanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-fusion-panel"');
    expect(viewPanelsSource).not.toContain("<FusionLayerKey");
    expect(viewPanelsSource).not.toContain("<JointEmbeddingProvenanceStrip");
    expect(fusionPanelSource).toContain("export function CentralFusionPlotViewPanel");
    expect(fusionPanelSource).toContain("<FusionLayerKey");
    expect(fusionPanelSource).toContain("<JointEmbeddingProvenanceStrip");
    expect(boundarySource).toContain('"workspace-central-plot-deck-fusion-panel"');
    expect(boundaryModule("workspace-central-plot-deck-fusion-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralFusionPlotViewPanel: fusionPanelModule?.CentralFusionPlotViewPanel
    });
  });

  it("extracts central Temporal plot panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckTemporalPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-temporal-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const temporalPanelSource = existsSync(deckTemporalPanelPath) ? readFileSync(deckTemporalPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const temporalPanelModule = existsSync(deckTemporalPanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-temporal-panel")
      : null;

    expect(existsSync(deckTemporalPanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-temporal-panel"');
    expect(viewPanelsSource).not.toContain("<TemporalWindowBuilder");
    expect(temporalPanelSource).toContain("export function CentralTemporalPlotViewPanel");
    expect(temporalPanelSource).toContain("<TemporalWindowBuilder");
    expect(boundarySource).toContain('"workspace-central-plot-deck-temporal-panel"');
    expect(boundaryModule("workspace-central-plot-deck-temporal-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralTemporalPlotViewPanel: temporalPanelModule?.CentralTemporalPlotViewPanel
    });
  });

  it("extracts central Dual Lens plot panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckDualLensPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-dual-lens-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const dualLensPanelSource = existsSync(deckDualLensPanelPath) ? readFileSync(deckDualLensPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const dualLensPanelModule = existsSync(deckDualLensPanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-dual-lens-panel")
      : null;

    expect(existsSync(deckDualLensPanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-dual-lens-panel"');
    expect(viewPanelsSource).not.toContain("<DualLensDashboard");
    expect(dualLensPanelSource).toContain("export function CentralDualLensViewPanel");
    expect(dualLensPanelSource).toContain("<DualLensDashboard");
    expect(boundarySource).toContain('"workspace-central-plot-deck-dual-lens-panel"');
    expect(boundaryModule("workspace-central-plot-deck-dual-lens-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralDualLensViewPanel: dualLensPanelModule?.CentralDualLensViewPanel
    });
  });

  it("extracts central ENA Space panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckEnaSpacePanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-ena-space-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const enaSpacePanelSource = existsSync(deckEnaSpacePanelPath) ? readFileSync(deckEnaSpacePanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const enaSpacePanelModule = existsSync(deckEnaSpacePanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-ena-space-panel")
      : null;

    expect(existsSync(deckEnaSpacePanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-ena-space-panel"');
    expect(viewPanelsSource).not.toContain("ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.");
    expect(enaSpacePanelSource).toContain("export function CentralEnaSpaceViewPanel");
    expect(enaSpacePanelSource).toContain("ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.");
    expect(boundarySource).toContain('"workspace-central-plot-deck-ena-space-panel"');
    expect(boundaryModule("workspace-central-plot-deck-ena-space-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralEnaSpaceViewPanel: enaSpacePanelModule?.CentralEnaSpaceViewPanel
    });
  });

  it("extracts central SNA metrics panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckSnaMetricsPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-sna-metrics-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const snaMetricsPanelSource = existsSync(deckSnaMetricsPanelPath) ? readFileSync(deckSnaMetricsPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const snaMetricsPanelModule = existsSync(deckSnaMetricsPanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-sna-metrics-panel")
      : null;

    expect(existsSync(deckSnaMetricsPanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-sna-metrics-panel"');
    expect(viewPanelsSource).not.toContain("<SocialMetricsTable");
    expect(viewPanelsSource).not.toContain("<MetricCell");
    expect(snaMetricsPanelSource).toContain("export function CentralSnaMetricsViewPanel");
    expect(snaMetricsPanelSource).toContain("<SocialMetricsTable");
    expect(snaMetricsPanelSource).toContain("<MetricCell");
    expect(boundarySource).toContain('"workspace-central-plot-deck-sna-metrics-panel"');
    expect(boundaryModule("workspace-central-plot-deck-sna-metrics-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralSnaMetricsViewPanel: snaMetricsPanelModule?.CentralSnaMetricsViewPanel
    });
  });

  it("extracts central Evidence Ledger panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckEvidenceLedgerPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-evidence-ledger-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const evidenceLedgerPanelSource = existsSync(deckEvidenceLedgerPanelPath) ? readFileSync(deckEvidenceLedgerPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const evidenceLedgerPanelModule = existsSync(deckEvidenceLedgerPanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-evidence-ledger-panel")
      : null;

    expect(existsSync(deckEvidenceLedgerPanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-evidence-ledger-panel"');
    expect(viewPanelsSource).not.toContain("<EvidenceLedgerPanel");
    expect(evidenceLedgerPanelSource).toContain("export function CentralEvidenceLedgerViewPanel");
    expect(evidenceLedgerPanelSource).toContain("<EvidenceLedgerPanel");
    expect(boundarySource).toContain('"workspace-central-plot-deck-evidence-ledger-panel"');
    expect(boundaryModule("workspace-central-plot-deck-evidence-ledger-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralEvidenceLedgerViewPanel: evidenceLedgerPanelModule?.CentralEvidenceLedgerViewPanel
    });
  });

  it("extracts central Matrix panel into a focused branch render module", async () => {
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const deckMatrixPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-matrix-panel.tsx", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const matrixPanelSource = existsSync(deckMatrixPanelPath) ? readFileSync(deckMatrixPanelPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const matrixPanelModule = existsSync(deckMatrixPanelPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-matrix-panel")
      : null;

    expect(existsSync(deckMatrixPanelPath)).toBe(true);
    expect(branchesSource).toContain('from "./workspace-central-plot-deck-matrix-panel"');
    expect(viewPanelsSource).not.toContain("<MatrixPreview");
    expect(matrixPanelSource).toContain("export function CentralMatrixViewPanel");
    expect(matrixPanelSource).toContain("<MatrixPreview");
    expect(boundarySource).toContain('"workspace-central-plot-deck-matrix-panel"');
    expect(boundaryModule("workspace-central-plot-deck-matrix-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralMatrixViewPanel: matrixPanelModule?.CentralMatrixViewPanel
    });
  });

  it("extracts central plot deck shell controls into a focused controls module", async () => {
    const deckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const deckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const shellControlsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-shell-controls.tsx", import.meta.url);
    const renderSource = existsSync(deckRenderPath) ? readFileSync(deckRenderPath, "utf8") : "";
    const bodySource = existsSync(deckBodyPath) ? readFileSync(deckBodyPath, "utf8") : "";
    const controlsSource = existsSync(shellControlsPath) ? readFileSync(shellControlsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const controlsModule = existsSync(shellControlsPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-shell-controls")
      : null;

    expect(existsSync(shellControlsPath)).toBe(true);
    expect(renderSource).toContain("<CentralPlotDeckShellAction");
    expect(bodySource).toContain("<CentralPlotDeckActiveViewToolbar");
    expect(renderSource).not.toContain('data-testid="maximize-fusion-plot"');
    expect(controlsSource).toContain("export function CentralPlotDeckShellAction");
    expect(controlsSource).toContain("export function CentralPlotDeckActiveViewToolbar");
    expect(controlsSource).toContain('data-testid="maximize-fusion-plot"');
    expect(boundarySource).toContain('"workspace-central-plot-deck-shell-controls"');
    expect(boundaryModule("workspace-central-plot-deck-shell-controls" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralPlotDeckShellAction: controlsModule?.CentralPlotDeckShellAction,
      CentralPlotDeckActiveViewToolbar: controlsModule?.CentralPlotDeckActiveViewToolbar
    });
  });

  it("extracts central plot deck body into a focused body module", async () => {
    const deckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const deckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const renderSource = existsSync(deckRenderPath) ? readFileSync(deckRenderPath, "utf8") : "";
    const bodySource = existsSync(deckBodyPath) ? readFileSync(deckBodyPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const bodyModule = existsSync(deckBodyPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-body")
      : null;

    expect(existsSync(deckBodyPath)).toBe(true);
    expect(renderSource).toContain("<CentralPlotDeckBody");
    expect(renderSource).not.toContain("<CentralFusionAnalysisScope");
    expect(renderSource).not.toContain("<WorkspaceDataViewDrawer");
    expect(bodySource).toContain("export function CentralPlotDeckBody");
    expect(bodySource).toContain("<CentralFusionAnalysisScope");
    expect(bodySource).toContain("<WorkspaceDataViewDrawer");
    expect(boundarySource).toContain('"workspace-central-plot-deck-body"');
    expect(boundaryModule("workspace-central-plot-deck-body" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralPlotDeckBody: bodyModule?.CentralPlotDeckBody
    });
  });

  it("extracts central plot deck view panel branches into a focused dispatcher module", async () => {
    const deckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const deckViewPanelBranchesPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches.tsx", import.meta.url);
    const bodySource = existsSync(deckBodyPath) ? readFileSync(deckBodyPath, "utf8") : "";
    const branchesSource = existsSync(deckViewPanelBranchesPath) ? readFileSync(deckViewPanelBranchesPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const branchesModule = existsSync(deckViewPanelBranchesPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-branches")
      : null;

    expect(existsSync(deckViewPanelBranchesPath)).toBe(true);
    expect(bodySource).toContain("<CentralPlotDeckViewPanelBranches");
    expect(bodySource).not.toContain("<CentralTemporalPlotViewPanel");
    expect(branchesSource).toContain("export function CentralPlotDeckViewPanelBranches");
    expect(branchesSource).toContain('activePlotView === "fusion"');
    expect(branchesSource).toContain('activePlotView === "temporal"');
    expect(branchesSource).toContain("<CentralMatrixViewPanel {...viewPanelProps}");
    expect(boundarySource).toContain('"workspace-central-plot-deck-view-panel-branches"');
    expect(boundaryModule("workspace-central-plot-deck-view-panel-branches" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      CentralPlotDeckViewPanelBranches: branchesModule?.CentralPlotDeckViewPanelBranches
    });
  });

  it("extracts central plot deck render props into a focused type module", async () => {
    const deckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const deckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const deckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const deckBodyPropsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body-props.ts", import.meta.url);
    const deckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const deckRenderPropsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render-props.ts", import.meta.url);
    const deckSource = existsSync(deckPath) ? readFileSync(deckPath, "utf8") : "";
    const renderSource = existsSync(deckRenderPath) ? readFileSync(deckRenderPath, "utf8") : "";
    const bodySource = existsSync(deckBodyPath) ? readFileSync(deckBodyPath, "utf8") : "";
    const bodyPropsSource = existsSync(deckBodyPropsPath) ? readFileSync(deckBodyPropsPath, "utf8") : "";
    const viewPanelsSource = existsSync(deckViewPanelsPath) ? readFileSync(deckViewPanelsPath, "utf8") : "";
    const propsSource = existsSync(deckRenderPropsPath) ? readFileSync(deckRenderPropsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propsModule = existsSync(deckRenderPropsPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-render-props")
      : null;

    expect(existsSync(deckRenderPropsPath)).toBe(true);
    expect(renderSource).not.toContain("export type WorkspaceCentralPlotDeckRenderProps = {");
    expect(propsSource).toContain("export type WorkspaceCentralPlotDeckRenderProps = {");
    expect(deckSource).toContain('from "./workspace-central-plot-deck-render-props"');
    expect(renderSource).toContain('from "./workspace-central-plot-deck-render-props"');
    expect(bodySource).not.toContain('from "./workspace-central-plot-deck-render-props"');
    expect(bodyPropsSource).toContain('from "./workspace-central-plot-deck-render-props"');
    expect(viewPanelsSource).not.toContain('from "./workspace-central-plot-deck-render-props"');
    expect(boundarySource).toContain('"workspace-central-plot-deck-render-props"');
    expect(boundaryModule("workspace-central-plot-deck-render-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WORKSPACE_CENTRAL_PLOT_DECK_RENDER_PROPS_MODULE: propsModule?.WORKSPACE_CENTRAL_PLOT_DECK_RENDER_PROPS_MODULE
    });
  });

  it("extracts central plot deck body props into a focused prop module", async () => {
    const deckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const deckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const deckBodyPropsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body-props.ts", import.meta.url);
    const renderSource = existsSync(deckRenderPath) ? readFileSync(deckRenderPath, "utf8") : "";
    const bodySource = existsSync(deckBodyPath) ? readFileSync(deckBodyPath, "utf8") : "";
    const propsSource = existsSync(deckBodyPropsPath) ? readFileSync(deckBodyPropsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propsModule = existsSync(deckBodyPropsPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-body-props")
      : null;

    expect(existsSync(deckBodyPropsPath)).toBe(true);
    expect(renderSource).toContain("buildCentralPlotDeckBodyProps(props)");
    expect(bodySource).toContain('from "./workspace-central-plot-deck-body-props"');
    expect(bodySource).not.toContain('from "./workspace-central-plot-deck-render-props"');
    expect(bodySource).toContain("viewPanelProps");
    expect(bodySource).toContain("<CentralPlotDeckViewPanelBranches");
    expect(propsSource).toContain("export type CentralPlotDeckBodyProps = Pick<");
    expect(propsSource).toContain("export function buildCentralPlotDeckBodyProps");
    expect(boundarySource).toContain('"workspace-central-plot-deck-body-props"');
    expect(boundaryModule("workspace-central-plot-deck-body-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildCentralPlotDeckBodyProps: propsModule?.buildCentralPlotDeckBodyProps
    });
  });

  it("extracts central plot deck view panel props into a focused type module", async () => {
    const deckFusionPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx", import.meta.url);
    const deckTemporalPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-temporal-panel.tsx", import.meta.url);
    const deckDualLensPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-dual-lens-panel.tsx", import.meta.url);
    const deckEnaSpacePanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-ena-space-panel.tsx", import.meta.url);
    const deckSnaMetricsPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-sna-metrics-panel.tsx", import.meta.url);
    const deckEvidenceLedgerPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-evidence-ledger-panel.tsx", import.meta.url);
    const deckMatrixPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-matrix-panel.tsx", import.meta.url);
    const deckViewPanelPropsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-props.ts", import.meta.url);
    const viewPanelsSource = [
      deckFusionPanelPath,
      deckTemporalPanelPath,
      deckDualLensPanelPath,
      deckEnaSpacePanelPath,
      deckSnaMetricsPanelPath,
      deckEvidenceLedgerPanelPath,
      deckMatrixPanelPath
    ].map((path) => existsSync(path) ? readFileSync(path, "utf8") : "").join("\n");
    const propsSource = existsSync(deckViewPanelPropsPath) ? readFileSync(deckViewPanelPropsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propsModule = existsSync(deckViewPanelPropsPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-view-panel-props")
      : null;

    expect(existsSync(deckViewPanelPropsPath)).toBe(true);
    expect(viewPanelsSource).toContain('from "./workspace-central-plot-deck-view-panel-props"');
    expect(viewPanelsSource).not.toContain("WorkspaceCentralPlotDeckRenderProps");
    expect(propsSource).toContain("export type CentralFusionPlotViewPanelProps = Pick<");
    expect(propsSource).toContain("export type CentralTemporalPlotViewPanelProps = Pick<");
    expect(propsSource).toContain("export type CentralEvidenceLedgerViewPanelProps = Pick<");
    expect(boundarySource).toContain('"workspace-central-plot-deck-view-panel-props"');
    expect(boundaryModule("workspace-central-plot-deck-view-panel-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WORKSPACE_CENTRAL_PLOT_DECK_VIEW_PANEL_PROPS_MODULE: propsModule?.WORKSPACE_CENTRAL_PLOT_DECK_VIEW_PANEL_PROPS_MODULE
    });
  });

  it("extracts central plot deck props into a focused prop group", async () => {
    const centralPlotDeckPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(centralPlotDeckPropGroupPath) ? readFileSync(centralPlotDeckPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(centralPlotDeckPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-prop-group")
      : null;

    expect(existsSync(centralPlotDeckPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("return buildWorkspaceCentralPlotDeckProps({");
    expect(workspaceSource).toContain("centralPlotDeckProps: workspaceCentralPlotDeckProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["centralPlotDeckProps"]');
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDeckProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-deck-prop-group"');
    expect(boundaryModule("workspace-central-plot-deck-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDeckProps: propGroupModule?.buildWorkspaceCentralPlotDeckProps
    });
  });

  it("keeps central plot deck prop composition in a focused container builder", () => {
    const workspaceSource = workspaceContainerSource();
    const builderSource = readFileSync(new URL("../../../components/sena/workspace/workspace-central-plot-deck-container-props.ts", import.meta.url), "utf8");

    expect(workspaceSource).toContain("const workspaceCentralPlotDeckProps = buildWorkspaceCentralPlotDeckContainerProps({");
    expect(workspaceSource).not.toContain("const workspaceCentralPlotTemporalControlsFieldProps = buildWorkspaceCentralPlotTemporalControlsFieldProps({");
    expect(builderSource).toContain("export type WorkspaceCentralPlotDeckContainerPropsInput");
    expect(builderSource).toContain("export function buildWorkspaceCentralPlotDeckContainerProps");
    expect(builderSource).toContain("const workspaceCentralPlotTemporalControlsFieldProps = buildWorkspaceCentralPlotTemporalControlsFieldProps({");
    expect(builderSource).toContain("return buildWorkspaceCentralPlotDeckProps({");
    expect(boundaryModule("workspace-central-plot-deck-container-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDeckContainerProps
    });
  });

  it("extracts central plot temporal controls props into a focused prop group", async () => {
    const temporalControlsPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-temporal-controls-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(temporalControlsPropGroupPath) ? readFileSync(temporalControlsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(temporalControlsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-temporal-controls-prop-group")
      : null;

    expect(existsSync(temporalControlsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotTemporalControlsProps = buildWorkspaceCentralPlotTemporalControlsProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotTemporalControlsProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotTemporalControlsProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-temporal-controls-prop-group"');
    expect(boundaryModule("workspace-central-plot-temporal-controls-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotTemporalControlsProps: propGroupModule?.buildWorkspaceCentralPlotTemporalControlsProps
    });
  });

  it("extracts central plot temporal controls field props into a focused prop group", async () => {
    const temporalControlsFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-temporal-controls-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(temporalControlsFieldPropGroupPath) ? readFileSync(temporalControlsFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(temporalControlsFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-temporal-controls-field-prop-group")
      : null;

    expect(existsSync(temporalControlsFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotTemporalControlsFieldProps = buildWorkspaceCentralPlotTemporalControlsFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotTemporalControlsFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotTemporalControlsPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotTemporalControlsFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-temporal-controls-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-temporal-controls-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotTemporalControlsFieldProps: propGroupModule?.buildWorkspaceCentralPlotTemporalControlsFieldProps
    });
  });

  it("extracts central plot temporal controls composition field props into a focused prop group", async () => {
    const temporalControlsCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-temporal-controls-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(temporalControlsCompositionFieldPropGroupPath) ? readFileSync(temporalControlsCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(temporalControlsCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-temporal-controls-composition-field-prop-group")
      : null;

    expect(existsSync(temporalControlsCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotTemporalControlsCompositionFieldProps = buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotTemporalControlsCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotTemporalControlsPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-temporal-controls-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-temporal-controls-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps
    });
  });

  it("extracts central plot temporal controls composition props into a focused prop group", async () => {
    const temporalControlsCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-temporal-controls-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(temporalControlsCompositionPropGroupPath) ? readFileSync(temporalControlsCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(temporalControlsCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-temporal-controls-composition-prop-group")
      : null;

    expect(existsSync(temporalControlsCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotTemporalControlsCompositionProps = buildWorkspaceCentralPlotTemporalControlsCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotTemporalControlsCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotTemporalControlsCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-temporal-controls-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-temporal-controls-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotTemporalControlsCompositionProps: propGroupModule?.buildWorkspaceCentralPlotTemporalControlsCompositionProps
    });
  });

  it("extracts central plot temporal controls boundary composition field props into a focused prop group", async () => {
    const temporalControlsBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-temporal-controls-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(temporalControlsBoundaryCompositionFieldPropGroupPath) ? readFileSync(temporalControlsBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(temporalControlsBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-temporal-controls-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(temporalControlsBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps = buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotTemporalControlsCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-temporal-controls-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-temporal-controls-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot temporal controls boundary composition props into a focused prop group", async () => {
    const temporalControlsBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-temporal-controls-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(temporalControlsBoundaryCompositionPropGroupPath) ? readFileSync(temporalControlsBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(temporalControlsBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-temporal-controls-boundary-composition-prop-group")
      : null;

    expect(existsSync(temporalControlsBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotTemporalControlsBoundaryCompositionProps = buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotTemporalControlsBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-temporal-controls-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-temporal-controls-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps
    });
  });

  it("extracts central plot evidence props into a focused prop group", async () => {
    const evidencePropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-evidence-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidencePropGroupPath) ? readFileSync(evidencePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidencePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-evidence-prop-group")
      : null;

    expect(existsSync(evidencePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotEvidenceProps = buildWorkspaceCentralPlotEvidenceProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotEvidenceProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotEvidenceProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidencePropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-evidence-prop-group"');
    expect(boundaryModule("workspace-central-plot-evidence-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotEvidenceProps: propGroupModule?.buildWorkspaceCentralPlotEvidenceProps
    });
  });

  it("extracts central plot evidence field props into a focused prop group", async () => {
    const evidenceFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-evidence-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceFieldPropGroupPath) ? readFileSync(evidenceFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-evidence-field-prop-group")
      : null;

    expect(existsSync(evidenceFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotEvidenceFieldProps = buildWorkspaceCentralPlotEvidenceFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotEvidenceFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotEvidencePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotEvidenceFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-evidence-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-evidence-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotEvidenceFieldProps: propGroupModule?.buildWorkspaceCentralPlotEvidenceFieldProps
    });
  });

  it("extracts central plot evidence composition field props into a focused prop group", async () => {
    const evidenceCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-evidence-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceCompositionFieldPropGroupPath) ? readFileSync(evidenceCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-evidence-composition-field-prop-group")
      : null;

    expect(existsSync(evidenceCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotEvidenceCompositionFieldProps = buildWorkspaceCentralPlotEvidenceCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotEvidenceCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotEvidencePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotEvidenceCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-evidence-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-evidence-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotEvidenceCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotEvidenceCompositionFieldProps
    });
  });

  it("extracts central plot evidence composition props into a focused prop group", async () => {
    const evidenceCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-evidence-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceCompositionPropGroupPath) ? readFileSync(evidenceCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-evidence-composition-prop-group")
      : null;

    expect(existsSync(evidenceCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotEvidenceCompositionProps = buildWorkspaceCentralPlotEvidenceCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotEvidenceCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotEvidenceCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-evidence-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-evidence-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotEvidenceCompositionProps: propGroupModule?.buildWorkspaceCentralPlotEvidenceCompositionProps
    });
  });

  it("extracts central plot evidence boundary composition field props into a focused prop group", async () => {
    const evidenceBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-evidence-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceBoundaryCompositionFieldPropGroupPath) ? readFileSync(evidenceBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-evidence-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(evidenceBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotEvidenceBoundaryCompositionFieldProps = buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotEvidenceBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotEvidenceCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-evidence-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-evidence-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot evidence boundary composition props into a focused prop group", async () => {
    const evidenceBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-evidence-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceBoundaryCompositionPropGroupPath) ? readFileSync(evidenceBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-evidence-boundary-composition-prop-group")
      : null;

    expect(existsSync(evidenceBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotEvidenceBoundaryCompositionProps = buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotEvidenceBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidenceBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-evidence-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-evidence-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps
    });
  });

  it("extracts central plot data-view props into a focused prop group", async () => {
    const dataViewPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-data-view-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataViewPropGroupPath) ? readFileSync(dataViewPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataViewPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-data-view-prop-group")
      : null;

    expect(existsSync(dataViewPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDataViewProps = buildWorkspaceCentralPlotDataViewProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDataViewProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDataViewProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-data-view-prop-group"');
    expect(boundaryModule("workspace-central-plot-data-view-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDataViewProps: propGroupModule?.buildWorkspaceCentralPlotDataViewProps
    });
  });

  it("extracts central plot data-view field props into a focused prop group", async () => {
    const dataViewFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-data-view-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataViewFieldPropGroupPath) ? readFileSync(dataViewFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataViewFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-data-view-field-prop-group")
      : null;

    expect(existsSync(dataViewFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDataViewFieldProps = buildWorkspaceCentralPlotDataViewFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDataViewFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDataViewPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDataViewFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-data-view-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-data-view-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDataViewFieldProps: propGroupModule?.buildWorkspaceCentralPlotDataViewFieldProps
    });
  });

  it("extracts central plot data-view composition field props into a focused prop group", async () => {
    const dataViewCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-data-view-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataViewCompositionFieldPropGroupPath) ? readFileSync(dataViewCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataViewCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-data-view-composition-field-prop-group")
      : null;

    expect(existsSync(dataViewCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDataViewCompositionFieldProps = buildWorkspaceCentralPlotDataViewCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDataViewCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDataViewPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDataViewCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-data-view-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-data-view-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDataViewCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotDataViewCompositionFieldProps
    });
  });

  it("extracts central plot data-view composition props into a focused prop group", async () => {
    const dataViewCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-data-view-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataViewCompositionPropGroupPath) ? readFileSync(dataViewCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataViewCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-data-view-composition-prop-group")
      : null;

    expect(existsSync(dataViewCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDataViewCompositionProps = buildWorkspaceCentralPlotDataViewCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDataViewCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDataViewCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-data-view-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-data-view-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDataViewCompositionProps: propGroupModule?.buildWorkspaceCentralPlotDataViewCompositionProps
    });
  });

  it("extracts central plot data-view boundary composition field props into a focused prop group", async () => {
    const dataViewBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-data-view-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataViewBoundaryCompositionFieldPropGroupPath) ? readFileSync(dataViewBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataViewBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-data-view-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(dataViewBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDataViewBoundaryCompositionFieldProps = buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDataViewBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDataViewCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-data-view-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-data-view-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot data-view boundary composition props into a focused prop group", async () => {
    const dataViewBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-data-view-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataViewBoundaryCompositionPropGroupPath) ? readFileSync(dataViewBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataViewBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-data-view-boundary-composition-prop-group")
      : null;

    expect(existsSync(dataViewBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDataViewBoundaryCompositionProps = buildWorkspaceCentralPlotDataViewBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDataViewBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDataViewBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-data-view-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-data-view-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDataViewBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotDataViewBoundaryCompositionProps
    });
  });

  it("extracts central plot interaction props into a focused prop group", async () => {
    const interactionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-interaction-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(interactionPropGroupPath) ? readFileSync(interactionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(interactionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-interaction-prop-group")
      : null;

    expect(existsSync(interactionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotInteractionProps = buildWorkspaceCentralPlotInteractionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotInteractionProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotInteractionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-interaction-prop-group"');
    expect(boundaryModule("workspace-central-plot-interaction-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotInteractionProps: propGroupModule?.buildWorkspaceCentralPlotInteractionProps
    });
  });

  it("extracts central plot interaction field props into a focused prop group", async () => {
    const interactionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-interaction-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(interactionFieldPropGroupPath) ? readFileSync(interactionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(interactionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-interaction-field-prop-group")
      : null;

    expect(existsSync(interactionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotInteractionFieldProps = buildWorkspaceCentralPlotInteractionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotInteractionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotInteractionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotInteractionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-interaction-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-interaction-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotInteractionFieldProps: propGroupModule?.buildWorkspaceCentralPlotInteractionFieldProps
    });
  });

  it("extracts central plot interaction composition field props into a focused prop group", async () => {
    const interactionCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-interaction-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(interactionCompositionFieldPropGroupPath) ? readFileSync(interactionCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(interactionCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-interaction-composition-field-prop-group")
      : null;

    expect(existsSync(interactionCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotInteractionCompositionFieldProps = buildWorkspaceCentralPlotInteractionCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotInteractionCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotInteractionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotInteractionCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-interaction-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-interaction-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotInteractionCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotInteractionCompositionFieldProps
    });
  });

  it("extracts central plot interaction composition props into a focused prop group", async () => {
    const interactionCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-interaction-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(interactionCompositionPropGroupPath) ? readFileSync(interactionCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(interactionCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-interaction-composition-prop-group")
      : null;

    expect(existsSync(interactionCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotInteractionCompositionProps = buildWorkspaceCentralPlotInteractionCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotInteractionCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotInteractionCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-interaction-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-interaction-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotInteractionCompositionProps: propGroupModule?.buildWorkspaceCentralPlotInteractionCompositionProps
    });
  });

  it("extracts central plot interaction boundary composition field props into a focused prop group", async () => {
    const interactionBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-interaction-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(interactionBoundaryCompositionFieldPropGroupPath) ? readFileSync(interactionBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(interactionBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-interaction-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(interactionBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotInteractionBoundaryCompositionFieldProps = buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotInteractionBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotInteractionCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-interaction-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-interaction-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot interaction boundary composition props into a focused prop group", async () => {
    const interactionBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-interaction-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(interactionBoundaryCompositionPropGroupPath) ? readFileSync(interactionBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(interactionBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-interaction-boundary-composition-prop-group")
      : null;

    expect(existsSync(interactionBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotInteractionBoundaryCompositionProps = buildWorkspaceCentralPlotInteractionBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotInteractionBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotInteractionBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-interaction-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-interaction-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotInteractionBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotInteractionBoundaryCompositionProps
    });
  });

  it("extracts central plot model props into a focused prop group", async () => {
    const modelPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-model-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelPropGroupPath) ? readFileSync(modelPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-model-prop-group")
      : null;

    expect(existsSync(modelPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotModelProps = buildWorkspaceCentralPlotModelProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotModelProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotModelProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-model-prop-group"');
    expect(boundaryModule("workspace-central-plot-model-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotModelProps: propGroupModule?.buildWorkspaceCentralPlotModelProps
    });
  });

  it("extracts central plot model field props into a focused prop group", async () => {
    const modelFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-model-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelFieldPropGroupPath) ? readFileSync(modelFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-model-field-prop-group")
      : null;

    expect(existsSync(modelFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotModelFieldProps = buildWorkspaceCentralPlotModelFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotModelFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotModelFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-model-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-model-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotModelFieldProps: propGroupModule?.buildWorkspaceCentralPlotModelFieldProps
    });
  });

  it("extracts central plot model composition field props into a focused prop group", async () => {
    const modelCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-model-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelCompositionFieldPropGroupPath) ? readFileSync(modelCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-model-composition-field-prop-group")
      : null;

    expect(existsSync(modelCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotModelCompositionFieldProps = buildWorkspaceCentralPlotModelCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotModelCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotModelCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-model-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-model-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotModelCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotModelCompositionFieldProps
    });
  });

  it("extracts central plot model composition props into a focused prop group", async () => {
    const modelCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-model-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelCompositionPropGroupPath) ? readFileSync(modelCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-model-composition-prop-group")
      : null;

    expect(existsSync(modelCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotModelCompositionProps = buildWorkspaceCentralPlotModelCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotModelCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotModelCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-model-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-model-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotModelCompositionProps: propGroupModule?.buildWorkspaceCentralPlotModelCompositionProps
    });
  });

  it("extracts central plot model boundary composition field props into a focused prop group", async () => {
    const modelBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-model-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelBoundaryCompositionFieldPropGroupPath) ? readFileSync(modelBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-model-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(modelBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotModelBoundaryCompositionFieldProps = buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotModelBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotModelCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-model-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-model-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot model boundary composition props into a focused prop group", async () => {
    const modelBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-model-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelBoundaryCompositionPropGroupPath) ? readFileSync(modelBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-model-boundary-composition-prop-group")
      : null;

    expect(existsSync(modelBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotModelBoundaryCompositionProps = buildWorkspaceCentralPlotModelBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotModelBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotModelBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-model-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-model-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotModelBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotModelBoundaryCompositionProps
    });
  });

  it("extracts central plot view-state props into a focused prop group", async () => {
    const viewStatePropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-view-state-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(viewStatePropGroupPath) ? readFileSync(viewStatePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(viewStatePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-view-state-prop-group")
      : null;

    expect(existsSync(viewStatePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotViewStateProps = buildWorkspaceCentralPlotViewStateProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotViewStateProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotViewStateProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStatePropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-view-state-prop-group"');
    expect(boundaryModule("workspace-central-plot-view-state-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotViewStateProps: propGroupModule?.buildWorkspaceCentralPlotViewStateProps
    });
  });

  it("extracts central plot view-state field props into a focused prop group", async () => {
    const viewStateFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-view-state-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(viewStateFieldPropGroupPath) ? readFileSync(viewStateFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(viewStateFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-view-state-field-prop-group")
      : null;

    expect(existsSync(viewStateFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotViewStateFieldProps = buildWorkspaceCentralPlotViewStateFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotViewStateFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotViewStatePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotViewStateFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-view-state-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-view-state-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotViewStateFieldProps: propGroupModule?.buildWorkspaceCentralPlotViewStateFieldProps
    });
  });

  it("extracts central plot view-state composition field props into a focused prop group", async () => {
    const viewStateCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-view-state-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(viewStateCompositionFieldPropGroupPath) ? readFileSync(viewStateCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(viewStateCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-view-state-composition-field-prop-group")
      : null;

    expect(existsSync(viewStateCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotViewStateCompositionFieldProps = buildWorkspaceCentralPlotViewStateCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotViewStateCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotViewStatePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotViewStateCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-view-state-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-view-state-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotViewStateCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotViewStateCompositionFieldProps
    });
  });

  it("extracts central plot view-state composition props into a focused prop group", async () => {
    const viewStateCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-view-state-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(viewStateCompositionPropGroupPath) ? readFileSync(viewStateCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(viewStateCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-view-state-composition-prop-group")
      : null;

    expect(existsSync(viewStateCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotViewStateCompositionProps = buildWorkspaceCentralPlotViewStateCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotViewStateCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotViewStateCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-view-state-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-view-state-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotViewStateCompositionProps: propGroupModule?.buildWorkspaceCentralPlotViewStateCompositionProps
    });
  });

  it("extracts central plot view-state boundary composition field props into a focused prop group", async () => {
    const viewStateBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-view-state-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(viewStateBoundaryCompositionFieldPropGroupPath) ? readFileSync(viewStateBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(viewStateBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-view-state-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(viewStateBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotViewStateBoundaryCompositionFieldProps = buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotViewStateBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotViewStateCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-view-state-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-view-state-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot view-state boundary composition props into a focused prop group", async () => {
    const viewStateBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-view-state-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(viewStateBoundaryCompositionPropGroupPath) ? readFileSync(viewStateBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(viewStateBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-view-state-boundary-composition-prop-group")
      : null;

    expect(existsSync(viewStateBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotViewStateBoundaryCompositionProps = buildWorkspaceCentralPlotViewStateBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotViewStateBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotViewStateBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStateBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-view-state-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-view-state-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotViewStateBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotViewStateBoundaryCompositionProps
    });
  });

  it("extracts central plot deck composition props into a focused prop group", async () => {
    const deckCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(deckCompositionPropGroupPath) ? readFileSync(deckCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(deckCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-composition-prop-group")
      : null;

    expect(existsSync(deckCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDeckCompositionProps = buildWorkspaceCentralPlotDeckCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDeckCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDeckCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-deck-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-deck-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDeckCompositionProps: propGroupModule?.buildWorkspaceCentralPlotDeckCompositionProps
    });
  });

  it("extracts central plot deck composition field props into a focused prop group", async () => {
    const deckCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(deckCompositionFieldPropGroupPath) ? readFileSync(deckCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(deckCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-composition-field-prop-group")
      : null;

    expect(existsSync(deckCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDeckCompositionFieldProps = buildWorkspaceCentralPlotDeckCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDeckCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotModelPropGroup");
    expect(propGroupSource).toContain("WorkspaceCentralPlotInteractionPropGroup");
    expect(propGroupSource).toContain("WorkspaceCentralPlotViewStatePropGroup");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDataViewPropGroup");
    expect(propGroupSource).toContain("WorkspaceCentralPlotTemporalControlsPropGroup");
    expect(propGroupSource).toContain("WorkspaceCentralPlotEvidencePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDeckCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-deck-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-deck-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDeckCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotDeckCompositionFieldProps
    });
  });

  it("extracts central plot deck boundary composition field props into a focused prop group", async () => {
    const deckBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(deckBoundaryCompositionFieldPropGroupPath) ? readFileSync(deckBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(deckBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(deckBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDeckBoundaryCompositionFieldProps = buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDeckBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceCentralPlotDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-deck-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-central-plot-deck-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps
    });
  });

  it("extracts central plot deck boundary composition props into a focused prop group", async () => {
    const deckBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = centralPlotCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(deckBoundaryCompositionPropGroupPath) ? readFileSync(deckBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(deckBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-central-plot-deck-boundary-composition-prop-group")
      : null;

    expect(existsSync(deckBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceCentralPlotDeckBoundaryCompositionProps = buildWorkspaceCentralPlotDeckBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceCentralPlotDeckBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceCentralPlotDeckBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceCentralPlotDeckBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-central-plot-deck-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-central-plot-deck-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceCentralPlotDeckBoundaryCompositionProps: propGroupModule?.buildWorkspaceCentralPlotDeckBoundaryCompositionProps
    });
  });

  it("extracts secondary comparison lens from the main workspace container", async () => {
    const comparisonLensPath = new URL("../../../components/sena/workspace/workspace-secondary-comparison-lens.tsx", import.meta.url);
    const rightColumnPath = new URL("../../../components/sena/workspace/workspace-right-inspector-column.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const rightColumnSource = existsSync(rightColumnPath) ? readFileSync(rightColumnPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const lensModule = existsSync(comparisonLensPath)
      ? await import("../../../components/sena/workspace/workspace-secondary-comparison-lens")
      : null;

    expect(existsSync(comparisonLensPath)).toBe(true);
    expect(rightColumnSource).toContain("<WorkspaceSecondaryComparisonLens");
    expect(workspaceSource).not.toContain("function WorkspaceSecondaryComparisonLens(");
    expect(workspaceSource).not.toContain("function rankedWorkspaceEdges(");
    expect(workspaceSource).not.toContain("function buildGPairRankingContextRow(");
    expect(workspaceSource).not.toContain('data-testid="workspace-secondary-ranking-context"');
    expect(boundarySource).toContain('"workspace-secondary-comparison-lens"');
    expect(boundaryModule("workspace-secondary-comparison-lens" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceSecondaryComparisonLens: lensModule?.WorkspaceSecondaryComparisonLens
    });
  });

  it("extracts the right inspector column from the main workspace container", async () => {
    const rightColumnPath = new URL("../../../components/sena/workspace/workspace-right-inspector-column.tsx", import.meta.url);
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const rightColumnModule = existsSync(rightColumnPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-column")
      : null;

    expect(existsSync(rightColumnPath)).toBe(true);
    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceRightInspectorColumn");
    expect(mainShellSource).toContain("<WorkspaceRightInspectorColumn");
    expect(workspaceSource).not.toContain('testId="workspace-primary-plot"');
    expect(workspaceSource).not.toContain('visualRole="workspace-secondary-plot"');
    expect(workspaceSource).not.toContain("Interpretation guardrail");
    expect(workspaceSource).not.toContain("Feasibility Signal");
    expect(boundarySource).toContain('"workspace-right-inspector-column"');
    expect(boundaryModule("workspace-right-inspector-column" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceRightInspectorColumn: rightColumnModule?.WorkspaceRightInspectorColumn
    });
  });

  it("extracts right inspector props into a focused prop group", async () => {
    const rightInspectorPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(rightInspectorPropGroupPath) ? readFileSync(rightInspectorPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(rightInspectorPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-prop-group")
      : null;

    expect(existsSync(rightInspectorPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("return buildWorkspaceRightInspectorProps({");
    expect(workspaceSource).toContain("rightInspectorProps: workspaceRightInspectorProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["rightInspectorProps"]');
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-prop-group"');
    expect(boundaryModule("workspace-right-inspector-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorProps: propGroupModule?.buildWorkspaceRightInspectorProps
    });
  });

  it("keeps right inspector prop composition in a focused container builder", () => {
    const workspaceSource = workspaceContainerSource();
    const builderSource = readFileSync(new URL("../../../components/sena/workspace/workspace-right-inspector-container-props.ts", import.meta.url), "utf8");

    expect(workspaceSource).toContain("const workspaceRightInspectorProps = buildWorkspaceRightInspectorContainerProps({");
    expect(workspaceSource).not.toContain("const workspaceRightInspectorLayoutFieldProps = buildWorkspaceRightInspectorLayoutFieldProps({");
    expect(builderSource).toContain("export type WorkspaceRightInspectorContainerPropsInput");
    expect(builderSource).toContain("export function buildWorkspaceRightInspectorContainerProps");
    expect(builderSource).toContain("const workspaceRightInspectorLayoutFieldProps = buildWorkspaceRightInspectorLayoutFieldProps({");
    expect(builderSource).toContain("return buildWorkspaceRightInspectorProps({");
    expect(boundaryModule("workspace-right-inspector-container-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorContainerProps
    });
  });

  it("extracts right inspector layout props into a focused prop group", async () => {
    const layoutPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-layout-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(layoutPropGroupPath) ? readFileSync(layoutPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(layoutPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-layout-prop-group")
      : null;

    expect(existsSync(layoutPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorLayoutProps = buildWorkspaceRightInspectorLayoutProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorLayoutProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorLayoutProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-layout-prop-group"');
    expect(boundaryModule("workspace-right-inspector-layout-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorLayoutProps: propGroupModule?.buildWorkspaceRightInspectorLayoutProps
    });
  });

  it("extracts right inspector layout field props into a focused prop group", async () => {
    const layoutFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-layout-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(layoutFieldPropGroupPath) ? readFileSync(layoutFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(layoutFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-layout-field-prop-group")
      : null;

    expect(existsSync(layoutFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorLayoutFieldProps = buildWorkspaceRightInspectorLayoutFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorLayoutFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorLayoutPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorLayoutFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-layout-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-layout-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorLayoutFieldProps: propGroupModule?.buildWorkspaceRightInspectorLayoutFieldProps
    });
  });

  it("extracts right inspector layout composition field props into a focused prop group", async () => {
    const layoutCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-layout-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(layoutCompositionFieldPropGroupPath) ? readFileSync(layoutCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(layoutCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-layout-composition-field-prop-group")
      : null;

    expect(existsSync(layoutCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorLayoutCompositionFieldProps = buildWorkspaceRightInspectorLayoutCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorLayoutCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorLayoutPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorLayoutCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-layout-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-layout-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorLayoutCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorLayoutCompositionFieldProps
    });
  });

  it("extracts right inspector layout composition props into a focused prop group", async () => {
    const layoutCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-layout-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(layoutCompositionPropGroupPath) ? readFileSync(layoutCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(layoutCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-layout-composition-prop-group")
      : null;

    expect(existsSync(layoutCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorLayoutCompositionProps = buildWorkspaceRightInspectorLayoutCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorLayoutCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorLayoutCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-layout-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-layout-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorLayoutCompositionProps: propGroupModule?.buildWorkspaceRightInspectorLayoutCompositionProps
    });
  });

  it("extracts right inspector layout boundary composition field props into a focused prop group", async () => {
    const layoutBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-layout-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(layoutBoundaryCompositionFieldPropGroupPath) ? readFileSync(layoutBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(layoutBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-layout-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(layoutBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorLayoutBoundaryCompositionFieldProps = buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorLayoutBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-layout-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-layout-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps
    });
  });

  it("extracts right inspector layout boundary composition props into a focused prop group", async () => {
    const layoutBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-layout-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(layoutBoundaryCompositionPropGroupPath) ? readFileSync(layoutBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(layoutBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-layout-boundary-composition-prop-group")
      : null;

    expect(existsSync(layoutBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorLayoutBoundaryCompositionProps = buildWorkspaceRightInspectorLayoutBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorLayoutBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorLayoutBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorLayoutBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-layout-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-layout-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorLayoutBoundaryCompositionProps: propGroupModule?.buildWorkspaceRightInspectorLayoutBoundaryCompositionProps
    });
  });

  it("extracts right inspector evidence and export props into a focused prop group", async () => {
    const evidencePropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-evidence-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidencePropGroupPath) ? readFileSync(evidencePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidencePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-evidence-prop-group")
      : null;

    expect(existsSync(evidencePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorEvidenceProps = buildWorkspaceRightInspectorEvidenceProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorEvidenceProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorEvidenceProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidencePropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-evidence-prop-group"');
    expect(boundaryModule("workspace-right-inspector-evidence-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorEvidenceProps: propGroupModule?.buildWorkspaceRightInspectorEvidenceProps
    });
  });

  it("extracts right inspector evidence field props into a focused prop group", async () => {
    const evidenceFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-evidence-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceFieldPropGroupPath) ? readFileSync(evidenceFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-evidence-field-prop-group")
      : null;

    expect(existsSync(evidenceFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorEvidenceFieldProps = buildWorkspaceRightInspectorEvidenceFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorEvidenceFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorEvidencePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorEvidenceFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-evidence-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-evidence-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorEvidenceFieldProps: propGroupModule?.buildWorkspaceRightInspectorEvidenceFieldProps
    });
  });

  it("extracts right inspector evidence composition field props into a focused prop group", async () => {
    const evidenceCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-evidence-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceCompositionFieldPropGroupPath) ? readFileSync(evidenceCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-evidence-composition-field-prop-group")
      : null;

    expect(existsSync(evidenceCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorEvidenceCompositionFieldProps = buildWorkspaceRightInspectorEvidenceCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorEvidenceCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorEvidencePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorEvidenceCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-evidence-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-evidence-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorEvidenceCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorEvidenceCompositionFieldProps
    });
  });

  it("extracts right inspector evidence composition props into a focused prop group", async () => {
    const evidenceCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-evidence-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceCompositionPropGroupPath) ? readFileSync(evidenceCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-evidence-composition-prop-group")
      : null;

    expect(existsSync(evidenceCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorEvidenceCompositionProps = buildWorkspaceRightInspectorEvidenceCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorEvidenceCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorEvidenceCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-evidence-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-evidence-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorEvidenceCompositionProps: propGroupModule?.buildWorkspaceRightInspectorEvidenceCompositionProps
    });
  });

  it("extracts right inspector evidence boundary composition field props into a focused prop group", async () => {
    const evidenceBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-evidence-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceBoundaryCompositionFieldPropGroupPath) ? readFileSync(evidenceBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-evidence-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(evidenceBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorEvidenceBoundaryCompositionFieldProps = buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorEvidenceBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-evidence-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-evidence-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps
    });
  });

  it("extracts right inspector evidence boundary composition props into a focused prop group", async () => {
    const evidenceBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-evidence-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(evidenceBoundaryCompositionPropGroupPath) ? readFileSync(evidenceBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(evidenceBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-evidence-boundary-composition-prop-group")
      : null;

    expect(existsSync(evidenceBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorEvidenceBoundaryCompositionProps = buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorEvidenceBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorEvidenceBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-evidence-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-evidence-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps: propGroupModule?.buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps
    });
  });

  it("extracts right inspector model props into a focused prop group", async () => {
    const modelPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-model-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelPropGroupPath) ? readFileSync(modelPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-model-prop-group")
      : null;

    expect(existsSync(modelPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorModelProps = buildWorkspaceRightInspectorModelProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorModelProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorModelProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorModelPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-model-prop-group"');
    expect(boundaryModule("workspace-right-inspector-model-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorModelProps: propGroupModule?.buildWorkspaceRightInspectorModelProps
    });
  });

  it("extracts right inspector model field props into a focused prop group", async () => {
    const modelFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-model-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelFieldPropGroupPath) ? readFileSync(modelFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-model-field-prop-group")
      : null;

    expect(existsSync(modelFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorModelFieldProps = buildWorkspaceRightInspectorModelFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorModelFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorModelFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorModelFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-model-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-model-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorModelFieldProps: propGroupModule?.buildWorkspaceRightInspectorModelFieldProps
    });
  });

  it("extracts right inspector model boundary composition field props into a focused prop group", async () => {
    const modelBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-model-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelBoundaryCompositionFieldPropGroupPath) ? readFileSync(modelBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-model-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(modelBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorModelBoundaryCompositionFieldProps = buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorModelBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorModelFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorModelBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-model-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-model-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps
    });
  });

  it("extracts right inspector model boundary composition props into a focused prop group", async () => {
    const modelBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-model-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelBoundaryCompositionPropGroupPath) ? readFileSync(modelBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-model-boundary-composition-prop-group")
      : null;

    expect(existsSync(modelBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorModelBoundaryCompositionProps = buildWorkspaceRightInspectorModelBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorModelBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorModelBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorModelBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorModelBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-model-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-model-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorModelBoundaryCompositionProps: propGroupModule?.buildWorkspaceRightInspectorModelBoundaryCompositionProps
    });
  });

  it("extracts right inspector selection props into a focused prop group", async () => {
    const selectionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-selection-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(selectionPropGroupPath) ? readFileSync(selectionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(selectionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-selection-prop-group")
      : null;

    expect(existsSync(selectionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorSelectionProps = buildWorkspaceRightInspectorSelectionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorSelectionProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorSelectionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorSelectionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-selection-prop-group"');
    expect(boundaryModule("workspace-right-inspector-selection-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorSelectionProps: propGroupModule?.buildWorkspaceRightInspectorSelectionProps
    });
  });

  it("extracts right inspector selection field props into a focused prop group", async () => {
    const selectionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-selection-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(selectionFieldPropGroupPath) ? readFileSync(selectionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(selectionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-selection-field-prop-group")
      : null;

    expect(existsSync(selectionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorSelectionFieldProps = buildWorkspaceRightInspectorSelectionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorSelectionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorSelectionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorSelectionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorSelectionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-selection-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-selection-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorSelectionFieldProps: propGroupModule?.buildWorkspaceRightInspectorSelectionFieldProps
    });
  });

  it("extracts right inspector selection boundary composition field props into a focused prop group", async () => {
    const selectionBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-selection-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(selectionBoundaryCompositionFieldPropGroupPath) ? readFileSync(selectionBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(selectionBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-selection-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(selectionBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorSelectionBoundaryCompositionFieldProps = buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorSelectionBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorSelectionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorSelectionBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-selection-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-selection-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps
    });
  });

  it("extracts right inspector selection boundary composition props into a focused prop group", async () => {
    const selectionBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-selection-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(selectionBoundaryCompositionPropGroupPath) ? readFileSync(selectionBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(selectionBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-selection-boundary-composition-prop-group")
      : null;

    expect(existsSync(selectionBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorSelectionBoundaryCompositionProps = buildWorkspaceRightInspectorSelectionBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorSelectionBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorSelectionBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorSelectionBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorSelectionBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-selection-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-selection-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorSelectionBoundaryCompositionProps: propGroupModule?.buildWorkspaceRightInspectorSelectionBoundaryCompositionProps
    });
  });

  it("extracts right inspector composition props into a focused prop group", async () => {
    const compositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(compositionPropGroupPath) ? readFileSync(compositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(compositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-composition-prop-group")
      : null;

    expect(existsSync(compositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorCompositionProps = buildWorkspaceRightInspectorCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorCompositionPropGroup = WorkspaceRightInspectorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorCompositionProps: propGroupModule?.buildWorkspaceRightInspectorCompositionProps
    });
  });

  it("extracts right inspector composition field props into a focused prop group", async () => {
    const compositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(compositionFieldPropGroupPath) ? readFileSync(compositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(compositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-composition-field-prop-group")
      : null;

    expect(existsSync(compositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorCompositionFieldProps = buildWorkspaceRightInspectorCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorCompositionFieldProps
    });
  });

  it("extracts right inspector boundary composition field props into a focused prop group", async () => {
    const boundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(boundaryCompositionFieldPropGroupPath) ? readFileSync(boundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(boundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(boundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorBoundaryCompositionFieldProps = buildWorkspaceRightInspectorBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRightInspectorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-right-inspector-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceRightInspectorBoundaryCompositionFieldProps
    });
  });

  it("extracts right inspector boundary composition props into a focused prop group", async () => {
    const boundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-right-inspector-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = rightInspectorCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(boundaryCompositionPropGroupPath) ? readFileSync(boundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(boundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-right-inspector-boundary-composition-prop-group")
      : null;

    expect(existsSync(boundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRightInspectorBoundaryCompositionProps = buildWorkspaceRightInspectorBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRightInspectorBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRightInspectorBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRightInspectorBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRightInspectorBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-right-inspector-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-right-inspector-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRightInspectorBoundaryCompositionProps: propGroupModule?.buildWorkspaceRightInspectorBoundaryCompositionProps
    });
  });

  it("extracts report and stats deck props into a focused prop group", async () => {
    const reportAndStatsDeckPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckPropGroupPath) ? readFileSync(reportAndStatsDeckPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("return buildWorkspaceReportAndStatsDeckProps({");
    expect(workspaceSource).toContain("reportAndStatsDeckProps: workspaceReportAndStatsDeckProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["reportAndStatsDeckProps"]');
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckProps: propGroupModule?.buildWorkspaceReportAndStatsDeckProps
    });
  });

  it("keeps report and stats deck prop composition in a focused container builder", () => {
    const workspaceSource = workspaceContainerSource();
    const builderSource = readFileSync(new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-container-props.ts", import.meta.url), "utf8");

    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckProps = buildWorkspaceReportAndStatsDeckContainerProps({");
    expect(workspaceSource).not.toContain("const workspaceReportGeneratorGovernanceFieldProps = buildWorkspaceReportGeneratorGovernanceFieldProps({");
    expect(builderSource).toContain("export type WorkspaceReportAndStatsDeckContainerPropsInput");
    expect(builderSource).toContain("export function buildWorkspaceReportAndStatsDeckContainerProps");
    expect(builderSource).toContain("const workspaceReportGeneratorGovernanceFieldProps = buildWorkspaceReportGeneratorGovernanceFieldProps({");
    expect(builderSource).toContain("return buildWorkspaceReportAndStatsDeckProps({");
    expect(boundaryModule("workspace-report-and-stats-deck-container-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckContainerProps
    });
  });

  it("keeps fusion overlay, rail, and main shell prop composition in a focused container builder", () => {
    const workspaceSource = workspaceContainerSource();
    const builderSource = readFileSync(new URL("../../../components/sena/workspace/workspace-fusion-overlay-rail-main-shell-container-props.ts", import.meta.url), "utf8");

    expect(workspaceSource).toContain("const workspaceMainShellSectionProps = buildWorkspaceFusionOverlayRailMainShellContainerProps({");
    expect(workspaceSource).not.toContain("const workspaceFusionPlotOverlaySelectionFieldProps = buildWorkspaceFusionPlotOverlaySelectionFieldProps({");
    expect(workspaceSource).not.toContain("const workspaceRailModeHandlerProps = buildWorkspaceRailModeHandlerProps({");
    expect(builderSource).toContain("export type WorkspaceFusionOverlayRailMainShellContainerPropsInput");
    expect(builderSource).toContain("export function buildWorkspaceFusionOverlayRailMainShellContainerProps");
    expect(builderSource).toContain("const workspaceFusionPlotOverlaySelectionFieldProps = buildWorkspaceFusionPlotOverlaySelectionFieldProps({");
    expect(builderSource).toContain("const workspaceRailModeHandlerProps = buildWorkspaceRailModeHandlerProps({");
    expect(builderSource).toContain("const workspaceMainShellSectionProps = buildWorkspaceMainShellSectionProps({");
    expect(boundaryModule("workspace-fusion-overlay-rail-main-shell-container-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionOverlayRailMainShellContainerProps
    });
  });

  it("extracts main shell props into a focused prop group", async () => {
    const mainShellPropGroupPath = new URL("../../../components/sena/workspace/workspace-main-shell-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(mainShellPropGroupPath) ? readFileSync(mainShellPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(mainShellPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-main-shell-prop-group")
      : null;

    expect(existsSync(mainShellPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceMainShellSectionProps = buildWorkspaceMainShellSectionProps({");
    expect(workspaceSource).toContain("return renderWorkspaceMainShell(workspaceMainShellSectionProps);");
    expect(propGroupSource).toContain("WorkspaceMainShellSectionProps");
    expect(propGroupSource).toContain("buildWorkspaceMainShellSectionProps");
    expect(propGroupSource).toContain("WorkspaceMainShellPropGroup");
    expect(boundarySource).toContain('"workspace-main-shell-prop-group"');
    expect(boundaryModule("workspace-main-shell-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceMainShellSectionProps: propGroupModule?.buildWorkspaceMainShellSectionProps
    });
  });

  it("extracts main shell rendering into a focused render boundary", async () => {
    const mainShellRenderPath = new URL("../../../components/sena/workspace/workspace-main-shell-render.tsx", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const renderSource = existsSync(mainShellRenderPath) ? readFileSync(mainShellRenderPath, "utf8") : "";
    const renderModule = existsSync(mainShellRenderPath)
      ? await import("../../../components/sena/workspace/workspace-main-shell-render")
      : null;

    expect(existsSync(mainShellRenderPath)).toBe(true);
    expect(workspaceSource).toContain("return renderWorkspaceMainShell(workspaceMainShellSectionProps);");
    expect(workspaceSource).not.toContain("<WorkspaceMainShellSection {...workspaceMainShellSectionProps} />");
    expect(renderSource).toContain("<WorkspaceMainShellSection {...props} />");
    expect(renderSource).toContain("WorkspaceMainShellRenderProps");
    expect(renderSource).toContain("renderWorkspaceMainShell");
    expect(boundarySource).toContain('"workspace-main-shell-render"');
    expect(boundaryModule("workspace-main-shell-render" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      renderWorkspaceMainShell: renderModule?.renderWorkspaceMainShell
    });
  });

  it("extracts main shell boundary composition field props into a focused prop group", async () => {
    const mainShellBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-main-shell-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(mainShellBoundaryCompositionFieldPropGroupPath) ? readFileSync(mainShellBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(mainShellBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-main-shell-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(mainShellBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceMainShellBoundaryCompositionFieldProps = buildWorkspaceMainShellBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceMainShellBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceMainShellPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceMainShellBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceMainShellBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-main-shell-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-main-shell-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceMainShellBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceMainShellBoundaryCompositionFieldProps
    });
  });

  it("extracts main shell boundary composition props into a focused prop group", async () => {
    const mainShellBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-main-shell-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(mainShellBoundaryCompositionPropGroupPath) ? readFileSync(mainShellBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(mainShellBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-main-shell-boundary-composition-prop-group")
      : null;

    expect(existsSync(mainShellBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceMainShellBoundaryCompositionProps = buildWorkspaceMainShellBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceMainShellBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceMainShellBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceMainShellBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceMainShellBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-main-shell-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-main-shell-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceMainShellBoundaryCompositionProps: propGroupModule?.buildWorkspaceMainShellBoundaryCompositionProps
    });
  });

  it("extracts fusion plot maximized overlay props into a focused prop group", async () => {
    const overlayPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-maximized-overlay-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayPropGroupPath) ? readFileSync(overlayPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-maximized-overlay-prop-group")
      : null;

    expect(existsSync(overlayPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotMaximizedOverlayProps = buildWorkspaceFusionPlotMaximizedOverlayProps({");
    expect(workspaceSource).toContain("fusionPlotMaximizedOverlayProps: workspaceFusionPlotMaximizedOverlayProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["fusionPlotMaximizedOverlayProps"]');
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotMaximizedOverlayProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotMaximizedOverlayPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-maximized-overlay-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-maximized-overlay-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotMaximizedOverlayProps: propGroupModule?.buildWorkspaceFusionPlotMaximizedOverlayProps
    });
  });

  it("extracts fusion plot overlay selection props into a focused prop group", async () => {
    const overlaySelectionPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlaySelectionPropGroupPath) ? readFileSync(overlaySelectionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlaySelectionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-prop-group")
      : null;

    expect(existsSync(overlaySelectionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlaySelectionProps = buildWorkspaceFusionPlotOverlaySelectionProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlaySelectionProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlaySelectionProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-selection-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-selection-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlaySelectionProps: propGroupModule?.buildWorkspaceFusionPlotOverlaySelectionProps
    });
  });

  it("extracts fusion plot overlay selection field props into a focused prop group", async () => {
    const overlaySelectionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlaySelectionFieldPropGroupPath) ? readFileSync(overlaySelectionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlaySelectionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-field-prop-group")
      : null;

    expect(existsSync(overlaySelectionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlaySelectionFieldProps = buildWorkspaceFusionPlotOverlaySelectionFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlaySelectionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotOverlaySelectionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlaySelectionFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-selection-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-selection-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlaySelectionFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlaySelectionFieldProps
    });
  });

  it("extracts fusion plot overlay selection boundary composition field props into a focused prop group", async () => {
    const overlaySelectionBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlaySelectionBoundaryCompositionFieldPropGroupPath) ? readFileSync(overlaySelectionBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlaySelectionBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(overlaySelectionBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps
    });
  });

  it("extracts fusion plot overlay selection boundary composition props into a focused prop group", async () => {
    const overlaySelectionBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlaySelectionBoundaryCompositionPropGroupPath) ? readFileSync(overlaySelectionBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlaySelectionBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-selection-boundary-composition-prop-group")
      : null;

    expect(existsSync(overlaySelectionBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlaySelectionBoundaryCompositionProps = buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlaySelectionBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-selection-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-selection-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps: propGroupModule?.buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps
    });
  });

  it("extracts fusion plot overlay model props into a focused prop group", async () => {
    const overlayModelPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayModelPropGroupPath) ? readFileSync(overlayModelPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayModelPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-prop-group")
      : null;

    expect(existsSync(overlayModelPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayModelProps = buildWorkspaceFusionPlotOverlayModelProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayModelProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayModelProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-model-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-model-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayModelProps: propGroupModule?.buildWorkspaceFusionPlotOverlayModelProps
    });
  });

  it("extracts fusion plot overlay model field props into a focused prop group", async () => {
    const overlayModelFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayModelFieldPropGroupPath) ? readFileSync(overlayModelFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayModelFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-field-prop-group")
      : null;

    expect(existsSync(overlayModelFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayModelFieldProps = buildWorkspaceFusionPlotOverlayModelFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayModelFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotOverlayModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayModelFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-model-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-model-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayModelFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlayModelFieldProps
    });
  });

  it("extracts fusion plot overlay model boundary composition field props into a focused prop group", async () => {
    const overlayModelBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayModelBoundaryCompositionFieldPropGroupPath) ? readFileSync(overlayModelBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayModelBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(overlayModelBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayModelBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayModelBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps
    });
  });

  it("extracts fusion plot overlay model boundary composition props into a focused prop group", async () => {
    const overlayModelBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayModelBoundaryCompositionPropGroupPath) ? readFileSync(overlayModelBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayModelBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-model-boundary-composition-prop-group")
      : null;

    expect(existsSync(overlayModelBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayModelBoundaryCompositionProps = buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayModelBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-model-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-model-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps: propGroupModule?.buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps
    });
  });

  it("extracts fusion plot overlay zoom props into a focused prop group", async () => {
    const overlayZoomPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayZoomPropGroupPath) ? readFileSync(overlayZoomPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayZoomPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-prop-group")
      : null;

    expect(existsSync(overlayZoomPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayZoomProps = buildWorkspaceFusionPlotOverlayZoomProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayZoomProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayZoomProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-zoom-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-zoom-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayZoomProps: propGroupModule?.buildWorkspaceFusionPlotOverlayZoomProps
    });
  });

  it("extracts fusion plot overlay zoom field props into a focused prop group", async () => {
    const overlayZoomFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayZoomFieldPropGroupPath) ? readFileSync(overlayZoomFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayZoomFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-field-prop-group")
      : null;

    expect(existsSync(overlayZoomFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayZoomFieldProps = buildWorkspaceFusionPlotOverlayZoomFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayZoomFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotOverlayZoomPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayZoomFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-zoom-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-zoom-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayZoomFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlayZoomFieldProps
    });
  });

  it("extracts fusion plot overlay zoom boundary composition field props into a focused prop group", async () => {
    const overlayZoomBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayZoomBoundaryCompositionFieldPropGroupPath) ? readFileSync(overlayZoomBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayZoomBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(overlayZoomBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps
    });
  });

  it("extracts fusion plot overlay zoom boundary composition props into a focused prop group", async () => {
    const overlayZoomBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayZoomBoundaryCompositionPropGroupPath) ? readFileSync(overlayZoomBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayZoomBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group")
      : null;

    expect(existsSync(overlayZoomBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayZoomBoundaryCompositionProps = buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayZoomBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps: propGroupModule?.buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps
    });
  });

  it("extracts fusion plot overlay composition props into a focused prop group", async () => {
    const overlayCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayCompositionPropGroupPath) ? readFileSync(overlayCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-composition-prop-group")
      : null;

    expect(existsSync(overlayCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayCompositionProps = buildWorkspaceFusionPlotOverlayCompositionProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayCompositionProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-composition-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayCompositionProps: propGroupModule?.buildWorkspaceFusionPlotOverlayCompositionProps
    });
  });

  it("extracts fusion plot overlay composition field props into a focused prop group", async () => {
    const overlayCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayCompositionFieldPropGroupPath) ? readFileSync(overlayCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-composition-field-prop-group")
      : null;

    expect(existsSync(overlayCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayCompositionFieldProps = buildWorkspaceFusionPlotOverlayCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayModelPropGroup");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlaySelectionPropGroup");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayZoomPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-composition-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayCompositionFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlayCompositionFieldProps
    });
  });

  it("extracts fusion plot overlay boundary composition field props into a focused prop group", async () => {
    const overlayBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayBoundaryCompositionFieldPropGroupPath) ? readFileSync(overlayBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(overlayBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps
    });
  });

  it("extracts fusion plot overlay boundary composition props into a focused prop group", async () => {
    const overlayBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-fusion-plot-overlay-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(overlayBoundaryCompositionPropGroupPath) ? readFileSync(overlayBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(overlayBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-fusion-plot-overlay-boundary-composition-prop-group")
      : null;

    expect(existsSync(overlayBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceFusionPlotOverlayBoundaryCompositionProps = buildWorkspaceFusionPlotOverlayBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceFusionPlotOverlayBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceFusionPlotOverlayBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceFusionPlotOverlayBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-fusion-plot-overlay-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-fusion-plot-overlay-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceFusionPlotOverlayBoundaryCompositionProps: propGroupModule?.buildWorkspaceFusionPlotOverlayBoundaryCompositionProps
    });
  });

  it("extracts rail props into a focused prop group", async () => {
    const railPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railPropGroupPath) ? readFileSync(railPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-prop-group")
      : null;

    expect(existsSync(railPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRailProps = buildWorkspaceRailProps({");
    expect(workspaceSource).toContain("railProps: workspaceRailProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["railProps"]');
    expect(propGroupSource).toContain("buildWorkspaceRailProps");
    expect(propGroupSource).toContain("WorkspaceRailPropGroup");
    expect(boundarySource).toContain('"workspace-rail-prop-group"');
    expect(boundaryModule("workspace-rail-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailProps: propGroupModule?.buildWorkspaceRailProps
    });
  });

  it("extracts rail field props into a focused prop group", async () => {
    const railFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railFieldPropGroupPath) ? readFileSync(railFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-field-prop-group")
      : null;

    expect(existsSync(railFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRailFieldProps = buildWorkspaceRailFieldProps({");
    expect(workspaceSource).toContain("...workspaceRailFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRailFieldProps");
    expect(propGroupSource).toContain("WorkspaceRailFieldPropGroup");
    expect(boundarySource).toContain('"workspace-rail-field-prop-group"');
    expect(boundaryModule("workspace-rail-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailFieldProps: propGroupModule?.buildWorkspaceRailFieldProps
    });
  });

  it("extracts rail composition field props into a focused prop group", async () => {
    const railCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railCompositionFieldPropGroupPath) ? readFileSync(railCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-composition-field-prop-group")
      : null;

    expect(existsSync(railCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRailCompositionFieldProps = buildWorkspaceRailCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRailCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRailCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRailCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-rail-composition-field-prop-group"');
    expect(boundaryModule("workspace-rail-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailCompositionFieldProps: propGroupModule?.buildWorkspaceRailCompositionFieldProps
    });
  });

  it("extracts rail composition props into a focused prop group", async () => {
    const railCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railCompositionPropGroupPath) ? readFileSync(railCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-composition-prop-group")
      : null;

    expect(existsSync(railCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRailCompositionProps = buildWorkspaceRailCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRailCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRailCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRailCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRailCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-rail-composition-prop-group"');
    expect(boundaryModule("workspace-rail-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailCompositionProps: propGroupModule?.buildWorkspaceRailCompositionProps
    });
  });

  it("extracts rail boundary composition field props into a focused prop group", async () => {
    const railBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railBoundaryCompositionFieldPropGroupPath) ? readFileSync(railBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(railBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRailBoundaryCompositionFieldProps = buildWorkspaceRailBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceRailBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceRailCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRailBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceRailBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-rail-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-rail-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceRailBoundaryCompositionFieldProps
    });
  });

  it("extracts rail boundary composition props into a focused prop group", async () => {
    const railBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railBoundaryCompositionPropGroupPath) ? readFileSync(railBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-boundary-composition-prop-group")
      : null;

    expect(existsSync(railBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceRailBoundaryCompositionProps = buildWorkspaceRailBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceRailBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceRailBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRailBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceRailBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-rail-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-rail-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailBoundaryCompositionProps: propGroupModule?.buildWorkspaceRailBoundaryCompositionProps
    });
  });

  it("extracts rail mode change handling into a focused prop group", async () => {
    const railModeHandlerPropGroupPath = new URL("../../../components/sena/workspace/workspace-rail-mode-handler-prop-group.ts", import.meta.url);
    const workspaceSource = fusionOverlayRailMainShellCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(railModeHandlerPropGroupPath) ? readFileSync(railModeHandlerPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(railModeHandlerPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-rail-mode-handler-prop-group")
      : null;

    expect(existsSync(railModeHandlerPropGroupPath)).toBe(true);
    expect(workspaceSource).not.toContain("function handleWorkspaceRailChange");
    expect(workspaceSource).toContain("const workspaceRailModeHandlerProps = buildWorkspaceRailModeHandlerProps({");
    expect(workspaceSource).toContain("...workspaceRailModeHandlerProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceRailModeHandlerProps");
    expect(propGroupSource).toContain("WorkspaceRailModeHandlerPropGroup");
    expect(propGroupSource).toContain('mode === "stats"');
    expect(propGroupSource).toContain('mode === "plots"');
    expect(boundarySource).toContain('"workspace-rail-mode-handler-prop-group"');
    expect(boundaryModule("workspace-rail-mode-handler-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceRailModeHandlerProps: propGroupModule?.buildWorkspaceRailModeHandlerProps
    });
  });

  it("keeps header and left rail prop composition in a focused container builder", () => {
    const workspaceSource = workspaceContainerSource();
    const builderSource = readFileSync(new URL("../../../components/sena/workspace/workspace-header-left-rail-container-props.ts", import.meta.url), "utf8");

    expect(workspaceSource).toContain("} = buildWorkspaceHeaderLeftRailContainerProps({");
    expect(workspaceSource).not.toContain("const workspaceDataImportFieldProps = buildWorkspaceDataImportFieldProps({");
    expect(workspaceSource).not.toContain("const workspaceLeftRailPanelDataFieldProps = buildWorkspaceLeftRailPanelDataFieldProps({");
    expect(workspaceSource).not.toContain("const workspaceHeaderExportFieldProps = buildWorkspaceHeaderExportFieldProps({");
    expect(builderSource).toContain("export type WorkspaceHeaderLeftRailContainerPropsInput");
    expect(builderSource).toContain("export function buildWorkspaceHeaderLeftRailContainerProps");
    expect(builderSource).toContain("const workspaceDataImportFieldProps = buildWorkspaceDataImportFieldProps({");
    expect(builderSource).toContain("const workspaceLeftRailPanelDataFieldProps = buildWorkspaceLeftRailPanelDataFieldProps({");
    expect(builderSource).toContain("const workspaceHeaderProps = buildWorkspaceHeaderProps({");
    expect(boundaryModule("workspace-header-left-rail-container-props" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderLeftRailContainerProps
    });
  });

  it("extracts header props into a focused prop group", async () => {
    const headerPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerPropGroupPath) ? readFileSync(headerPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-prop-group")
      : null;

    expect(existsSync(headerPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderProps = buildWorkspaceHeaderProps({");
    expect(workspaceSource).toContain("headerProps: workspaceHeaderProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["headerProps"]');
    expect(propGroupSource).toContain("buildWorkspaceHeaderProps");
    expect(propGroupSource).toContain("WorkspaceHeaderPropGroup");
    expect(boundarySource).toContain('"workspace-header-prop-group"');
    expect(boundaryModule("workspace-header-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderProps: propGroupModule?.buildWorkspaceHeaderProps
    });
  });

  it("extracts header upload and export props into a focused prop group", async () => {
    const headerExportPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-export-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerExportPropGroupPath) ? readFileSync(headerExportPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerExportPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-export-prop-group")
      : null;

    expect(existsSync(headerExportPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderExportProps = buildWorkspaceHeaderExportProps({");
    expect(workspaceSource).toContain("...workspaceHeaderExportProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceHeaderPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderExportProps");
    expect(propGroupSource).toContain("WorkspaceHeaderExportPropGroup");
    expect(boundarySource).toContain('"workspace-header-export-prop-group"');
    expect(boundaryModule("workspace-header-export-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderExportProps: propGroupModule?.buildWorkspaceHeaderExportProps
    });
  });

  it("extracts header upload and export field props into a focused prop group", async () => {
    const headerExportFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-export-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerExportFieldPropGroupPath) ? readFileSync(headerExportFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerExportFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-export-field-prop-group")
      : null;

    expect(existsSync(headerExportFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderExportFieldProps = buildWorkspaceHeaderExportFieldProps({");
    expect(workspaceSource).toContain("...workspaceHeaderExportFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceHeaderExportPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderExportFieldProps");
    expect(propGroupSource).toContain("WorkspaceHeaderExportFieldPropGroup");
    expect(boundarySource).toContain('"workspace-header-export-field-prop-group"');
    expect(boundaryModule("workspace-header-export-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderExportFieldProps: propGroupModule?.buildWorkspaceHeaderExportFieldProps
    });
  });

  it("extracts header temporal summary props into a focused prop group", async () => {
    const headerTemporalSummaryPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-temporal-summary-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerTemporalSummaryPropGroupPath) ? readFileSync(headerTemporalSummaryPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerTemporalSummaryPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-temporal-summary-prop-group")
      : null;

    expect(existsSync(headerTemporalSummaryPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderTemporalSummaryProps = buildWorkspaceHeaderTemporalSummaryProps({");
    expect(workspaceSource).toContain("...workspaceHeaderTemporalSummaryProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceHeaderPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderTemporalSummaryProps");
    expect(propGroupSource).toContain("WorkspaceHeaderTemporalSummaryPropGroup");
    expect(boundarySource).toContain('"workspace-header-temporal-summary-prop-group"');
    expect(boundaryModule("workspace-header-temporal-summary-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderTemporalSummaryProps: propGroupModule?.buildWorkspaceHeaderTemporalSummaryProps
    });
  });

  it("extracts header temporal summary field props into a focused prop group", async () => {
    const headerTemporalSummaryFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-temporal-summary-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerTemporalSummaryFieldPropGroupPath) ? readFileSync(headerTemporalSummaryFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerTemporalSummaryFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-temporal-summary-field-prop-group")
      : null;

    expect(existsSync(headerTemporalSummaryFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderTemporalSummaryFieldProps = buildWorkspaceHeaderTemporalSummaryFieldProps({");
    expect(workspaceSource).toContain("...workspaceHeaderTemporalSummaryFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceHeaderTemporalSummaryPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderTemporalSummaryFieldProps");
    expect(propGroupSource).toContain("WorkspaceHeaderTemporalSummaryFieldPropGroup");
    expect(boundarySource).toContain('"workspace-header-temporal-summary-field-prop-group"');
    expect(boundaryModule("workspace-header-temporal-summary-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderTemporalSummaryFieldProps: propGroupModule?.buildWorkspaceHeaderTemporalSummaryFieldProps
    });
  });

  it("extracts header composition props into a focused prop group", async () => {
    const headerCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerCompositionPropGroupPath) ? readFileSync(headerCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-composition-prop-group")
      : null;

    expect(existsSync(headerCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderCompositionProps = buildWorkspaceHeaderCompositionProps({");
    expect(workspaceSource).toContain("...workspaceHeaderCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceHeaderCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderCompositionProps");
    expect(propGroupSource).toContain("WorkspaceHeaderCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-header-composition-prop-group"');
    expect(boundaryModule("workspace-header-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderCompositionProps: propGroupModule?.buildWorkspaceHeaderCompositionProps
    });
  });

  it("extracts header composition field props into a focused prop group", async () => {
    const headerCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerCompositionFieldPropGroupPath) ? readFileSync(headerCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-composition-field-prop-group")
      : null;

    expect(existsSync(headerCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderCompositionFieldProps = buildWorkspaceHeaderCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceHeaderCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceHeaderExportPropGroup");
    expect(propGroupSource).toContain("WorkspaceHeaderTemporalSummaryPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceHeaderCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-header-composition-field-prop-group"');
    expect(boundaryModule("workspace-header-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderCompositionFieldProps: propGroupModule?.buildWorkspaceHeaderCompositionFieldProps
    });
  });

  it("extracts header boundary composition field props into a focused prop group", async () => {
    const headerBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerBoundaryCompositionFieldPropGroupPath) ? readFileSync(headerBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(headerBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderBoundaryCompositionFieldProps = buildWorkspaceHeaderBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceHeaderBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceHeaderPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceHeaderBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-header-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-header-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceHeaderBoundaryCompositionFieldProps
    });
  });

  it("extracts header boundary composition props into a focused prop group", async () => {
    const headerBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-header-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(headerBoundaryCompositionPropGroupPath) ? readFileSync(headerBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(headerBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-header-boundary-composition-prop-group")
      : null;

    expect(existsSync(headerBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceHeaderBoundaryCompositionProps = buildWorkspaceHeaderBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceHeaderBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceHeaderBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceHeaderBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceHeaderBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-header-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-header-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceHeaderBoundaryCompositionProps: propGroupModule?.buildWorkspaceHeaderBoundaryCompositionProps
    });
  });

  it("extracts left rail props into a focused prop group", async () => {
    const leftRailPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPropGroupPath) ? readFileSync(leftRailPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-prop-group")
      : null;

    expect(existsSync(leftRailPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailProps = buildWorkspaceLeftRailProps({");
    expect(workspaceSource).toContain("leftRailProps: workspaceLeftRailProps,");
    expect(propGroupSource).toContain('WorkspaceMainShellSectionProps["leftRailProps"]');
    expect(propGroupSource).toContain("buildWorkspaceLeftRailProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-prop-group"');
    expect(boundaryModule("workspace-left-rail-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailProps: propGroupModule?.buildWorkspaceLeftRailProps
    });
  });

  it("extracts left rail composition props into a focused prop group", async () => {
    const leftRailCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailCompositionPropGroupPath) ? readFileSync(leftRailCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-composition-prop-group")
      : null;

    expect(existsSync(leftRailCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailCompositionProps = buildWorkspaceLeftRailCompositionProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceLeftRailCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailCompositionProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-composition-prop-group"');
    expect(boundaryModule("workspace-left-rail-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailCompositionProps: propGroupModule?.buildWorkspaceLeftRailCompositionProps
    });
  });

  it("extracts left rail composition field props into a focused prop group", async () => {
    const leftRailCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailCompositionFieldPropGroupPath) ? readFileSync(leftRailCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-composition-field-prop-group")
      : null;

    expect(existsSync(leftRailCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailCompositionFieldProps = buildWorkspaceLeftRailCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceLeftRailWorkflowBoundaryCompositionPropGroup");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelDataPropGroup");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-composition-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailCompositionFieldProps: propGroupModule?.buildWorkspaceLeftRailCompositionFieldProps
    });
  });

  it("extracts left rail boundary composition field props into a focused prop group", async () => {
    const leftRailBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailBoundaryCompositionFieldPropGroupPath) ? readFileSync(leftRailBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(leftRailBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailBoundaryCompositionFieldProps = buildWorkspaceLeftRailBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceLeftRailBoundaryCompositionFieldProps
    });
  });

  it("extracts left rail boundary composition props into a focused prop group", async () => {
    const leftRailBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailBoundaryCompositionPropGroupPath) ? readFileSync(leftRailBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-boundary-composition-prop-group")
      : null;

    expect(existsSync(leftRailBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailBoundaryCompositionProps = buildWorkspaceLeftRailBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceLeftRailBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-left-rail-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailBoundaryCompositionProps: propGroupModule?.buildWorkspaceLeftRailBoundaryCompositionProps
    });
  });

  it("extracts left rail data panel props into a focused prop group", async () => {
    const leftRailPanelDataPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-data-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelDataPropGroupPath) ? readFileSync(leftRailPanelDataPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelDataPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-data-prop-group")
      : null;

    expect(existsSync(leftRailPanelDataPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelDataProps = buildWorkspaceLeftRailPanelDataProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelDataProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelDataProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelDataPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-data-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-data-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelDataProps: propGroupModule?.buildWorkspaceLeftRailPanelDataProps
    });
  });

  it("extracts left rail data panel field props into a focused prop group", async () => {
    const leftRailPanelDataFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-data-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelDataFieldPropGroupPath) ? readFileSync(leftRailPanelDataFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelDataFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-data-field-prop-group")
      : null;

    expect(existsSync(leftRailPanelDataFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelDataFieldProps = buildWorkspaceLeftRailPanelDataFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelDataFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPanelDataPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelDataFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelDataFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-data-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-data-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelDataFieldProps: propGroupModule?.buildWorkspaceLeftRailPanelDataFieldProps
    });
  });

  it("extracts left rail data panel boundary composition field props into a focused prop group", async () => {
    const leftRailPanelDataBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-data-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelDataBoundaryCompositionFieldPropGroupPath) ? readFileSync(leftRailPanelDataBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelDataBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-data-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(leftRailPanelDataBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelDataBoundaryCompositionFieldProps = buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelDataBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPanelDataPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelDataBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-data-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-data-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps
    });
  });

  it("extracts left rail data panel boundary composition props into a focused prop group", async () => {
    const leftRailPanelDataBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-data-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelDataBoundaryCompositionPropGroupPath) ? readFileSync(leftRailPanelDataBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelDataBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-data-boundary-composition-prop-group")
      : null;

    expect(existsSync(leftRailPanelDataBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelDataBoundaryCompositionProps = buildWorkspaceLeftRailPanelDataBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelDataBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelDataBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelDataBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelDataBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-data-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-data-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelDataBoundaryCompositionProps: propGroupModule?.buildWorkspaceLeftRailPanelDataBoundaryCompositionProps
    });
  });

  it("extracts left rail model and analysis panel props into a focused prop group", async () => {
    const leftRailPanelModelPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-model-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelModelPropGroupPath) ? readFileSync(leftRailPanelModelPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelModelPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-model-prop-group")
      : null;

    expect(existsSync(leftRailPanelModelPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelModelProps = buildWorkspaceLeftRailPanelModelProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelModelProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelModelProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelModelPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-model-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-model-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelModelProps: propGroupModule?.buildWorkspaceLeftRailPanelModelProps
    });
  });

  it("extracts left rail model and analysis panel field props into a focused prop group", async () => {
    const leftRailPanelModelFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-model-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelModelFieldPropGroupPath) ? readFileSync(leftRailPanelModelFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelModelFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-model-field-prop-group")
      : null;

    expect(existsSync(leftRailPanelModelFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelModelFieldProps = buildWorkspaceLeftRailPanelModelFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelModelFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPanelModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelModelFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelModelFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-model-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-model-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelModelFieldProps: propGroupModule?.buildWorkspaceLeftRailPanelModelFieldProps
    });
  });

  it("extracts left rail model panel boundary composition field props into a focused prop group", async () => {
    const leftRailPanelModelBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-model-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelModelBoundaryCompositionFieldPropGroupPath) ? readFileSync(leftRailPanelModelBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelModelBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-model-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(leftRailPanelModelBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelModelBoundaryCompositionFieldProps = buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelModelBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPanelModelPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelModelBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-model-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-model-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps
    });
  });

  it("extracts left rail model panel boundary composition props into a focused prop group", async () => {
    const leftRailPanelModelBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-model-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailPanelModelBoundaryCompositionPropGroupPath) ? readFileSync(leftRailPanelModelBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailPanelModelBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-panel-model-boundary-composition-prop-group")
      : null;

    expect(existsSync(leftRailPanelModelBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailPanelModelBoundaryCompositionProps = buildWorkspaceLeftRailPanelModelBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailPanelModelBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelModelBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailPanelModelBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailPanelModelBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-panel-model-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-left-rail-panel-model-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailPanelModelBoundaryCompositionProps: propGroupModule?.buildWorkspaceLeftRailPanelModelBoundaryCompositionProps
    });
  });

  it("extracts left rail workflow props into a focused prop group", async () => {
    const leftRailWorkflowPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-workflow-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailWorkflowPropGroupPath) ? readFileSync(leftRailWorkflowPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailWorkflowPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-workflow-prop-group")
      : null;

    expect(existsSync(leftRailWorkflowPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailWorkflowProps = buildWorkspaceLeftRailWorkflowProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailWorkflowProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailWorkflowProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailWorkflowPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-workflow-prop-group"');
    expect(boundaryModule("workspace-left-rail-workflow-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailWorkflowProps: propGroupModule?.buildWorkspaceLeftRailWorkflowProps
    });
  });

  it("extracts left rail workflow boundary composition field props into a focused prop group", async () => {
    const leftRailWorkflowBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-workflow-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailWorkflowBoundaryCompositionFieldPropGroupPath) ? readFileSync(leftRailWorkflowBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailWorkflowBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-workflow-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(leftRailWorkflowBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailWorkflowBoundaryCompositionFieldProps = buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailWorkflowBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceLeftRailWorkflowPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailWorkflowBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-workflow-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-left-rail-workflow-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps
    });
  });

  it("extracts left rail workflow boundary composition props into a focused prop group", async () => {
    const leftRailWorkflowBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-left-rail-workflow-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(leftRailWorkflowBoundaryCompositionPropGroupPath) ? readFileSync(leftRailWorkflowBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(leftRailWorkflowBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-left-rail-workflow-boundary-composition-prop-group")
      : null;

    expect(existsSync(leftRailWorkflowBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceLeftRailWorkflowBoundaryCompositionProps = buildWorkspaceLeftRailWorkflowBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceLeftRailWorkflowBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceLeftRailWorkflowBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceLeftRailWorkflowBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceLeftRailWorkflowBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-left-rail-workflow-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-left-rail-workflow-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceLeftRailWorkflowBoundaryCompositionProps: propGroupModule?.buildWorkspaceLeftRailWorkflowBoundaryCompositionProps
    });
  });

  it("extracts report generator props into a focused prop group", async () => {
    const reportGeneratorPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportGeneratorPropGroupPath) ? readFileSync(reportGeneratorPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportGeneratorPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-prop-group")
      : null;

    expect(existsSync(reportGeneratorPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorProps = buildWorkspaceReportGeneratorProps({");
    expect(workspaceSource).toContain("reportProps: workspaceReportGeneratorProps,");
    expect(propGroupSource).toContain('WorkspaceReportAndStatsDeckSectionProps["reportProps"]');
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-prop-group"');
    expect(boundaryModule("workspace-report-generator-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorProps: propGroupModule?.buildWorkspaceReportGeneratorProps
    });
  });

  it("extracts report generator composition props into a focused prop group", async () => {
    const reportGeneratorCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportGeneratorCompositionPropGroupPath) ? readFileSync(reportGeneratorCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportGeneratorCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-composition-prop-group")
      : null;

    expect(existsSync(reportGeneratorCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorCompositionProps = buildWorkspaceReportGeneratorCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorCompositionProps
    });
  });

  it("extracts report generator composition field props into a focused prop group", async () => {
    const reportGeneratorCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportGeneratorCompositionFieldPropGroupPath) ? readFileSync(reportGeneratorCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportGeneratorCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-composition-field-prop-group")
      : null;

    expect(existsSync(reportGeneratorCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorCompositionFieldProps = buildWorkspaceReportGeneratorCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorCompositionFieldProps
    });
  });

  it("extracts report generator boundary composition field props into a focused prop group", async () => {
    const reportGeneratorBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportGeneratorBoundaryCompositionFieldPropGroupPath) ? readFileSync(reportGeneratorBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportGeneratorBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reportGeneratorBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorBoundaryCompositionFieldProps
    });
  });

  it("extracts report generator boundary composition props into a focused prop group", async () => {
    const reportGeneratorBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportGeneratorBoundaryCompositionPropGroupPath) ? readFileSync(reportGeneratorBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportGeneratorBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-boundary-composition-prop-group")
      : null;

    expect(existsSync(reportGeneratorBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorBoundaryCompositionProps = buildWorkspaceReportGeneratorBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorBoundaryCompositionProps
    });
  });

  it("extracts report generator report composition props into a focused prop group", async () => {
    const reportCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-report-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportCompositionPropGroupPath) ? readFileSync(reportCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-report-composition-prop-group")
      : null;

    expect(existsSync(reportCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReportCompositionProps = buildWorkspaceReportGeneratorReportCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReportCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReportCompositionFieldPropGroup");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReportCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReportCompositionProps");
    expect(boundarySource).toContain('"workspace-report-generator-report-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-report-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReportCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorReportCompositionProps
    });
  });

  it("extracts report generator report composition field props into a focused prop group", async () => {
    const reportCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-report-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportCompositionFieldPropGroupPath) ? readFileSync(reportCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-report-composition-field-prop-group")
      : null;

    expect(existsSync(reportCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReportCompositionFieldProps = buildWorkspaceReportGeneratorReportCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReportCompositionFieldProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryPropGroup");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataPropGroup");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernancePropGroup");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityPropGroup");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReportCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReportCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-report-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-report-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReportCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReportCompositionFieldProps
    });
  });

  it("extracts report generator report composition boundary field props into a focused prop group", async () => {
    const reportCompositionBoundaryFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-report-composition-boundary-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportCompositionBoundaryFieldPropGroupPath) ? readFileSync(reportCompositionBoundaryFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportCompositionBoundaryFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-report-composition-boundary-field-prop-group")
      : null;

    expect(existsSync(reportCompositionBoundaryFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReportCompositionBoundaryFieldProps = buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReportCompositionBoundaryFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReportCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReportCompositionBoundaryFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-report-composition-boundary-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-report-composition-boundary-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps
    });
  });

  it("extracts report generator report composition boundary props into a focused prop group", async () => {
    const reportCompositionBoundaryPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-report-composition-boundary-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportCompositionBoundaryPropGroupPath) ? readFileSync(reportCompositionBoundaryPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportCompositionBoundaryPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-report-composition-boundary-prop-group")
      : null;

    expect(existsSync(reportCompositionBoundaryPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReportCompositionBoundaryProps = buildWorkspaceReportGeneratorReportCompositionBoundaryProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReportCompositionBoundaryProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReportCompositionBoundaryFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReportCompositionBoundaryProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReportCompositionBoundaryPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-report-composition-boundary-prop-group"');
    expect(boundaryModule("workspace-report-generator-report-composition-boundary-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReportCompositionBoundaryProps: propGroupModule?.buildWorkspaceReportGeneratorReportCompositionBoundaryProps
    });
  });

  it("extracts report generator governance props into a focused prop group", async () => {
    const governancePropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-governance-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governancePropGroupPath) ? readFileSync(governancePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governancePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-governance-prop-group")
      : null;

    expect(existsSync(governancePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorGovernanceProps = buildWorkspaceReportGeneratorGovernanceProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorGovernanceProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorGovernanceProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernancePropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-governance-prop-group"');
    expect(boundaryModule("workspace-report-generator-governance-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorGovernanceProps: propGroupModule?.buildWorkspaceReportGeneratorGovernanceProps
    });
  });

  it("extracts report generator governance composition props into a focused prop group", async () => {
    const governanceCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-governance-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governanceCompositionPropGroupPath) ? readFileSync(governanceCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governanceCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-governance-composition-prop-group")
      : null;

    expect(existsSync(governanceCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorGovernanceCompositionProps = buildWorkspaceReportGeneratorGovernanceCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorGovernanceCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorGovernanceCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-governance-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-governance-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorGovernanceCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorGovernanceCompositionProps
    });
  });

  it("extracts report generator governance composition field props into a focused prop group", async () => {
    const governanceCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-governance-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governanceCompositionFieldPropGroupPath) ? readFileSync(governanceCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governanceCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-governance-composition-field-prop-group")
      : null;

    expect(existsSync(governanceCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorGovernanceCompositionFieldProps = buildWorkspaceReportGeneratorGovernanceCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorGovernanceCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorGovernancePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorGovernanceCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-governance-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-governance-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorGovernanceCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorGovernanceCompositionFieldProps
    });
  });

  it("extracts report generator governance boundary composition field props into a focused prop group", async () => {
    const governanceBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-governance-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governanceBoundaryCompositionFieldPropGroupPath) ? readFileSync(governanceBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governanceBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-governance-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(governanceBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorGovernanceBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorGovernanceBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorGovernanceCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-governance-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-governance-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps
    });
  });

  it("extracts report generator governance boundary composition props into a focused prop group", async () => {
    const governanceBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-governance-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governanceBoundaryCompositionPropGroupPath) ? readFileSync(governanceBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governanceBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-governance-boundary-composition-prop-group")
      : null;

    expect(existsSync(governanceBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorGovernanceBoundaryCompositionProps = buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorGovernanceBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-governance-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-governance-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps
    });
  });

  it("extracts report generator governance field props into a focused prop group", async () => {
    const governanceFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-governance-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(governanceFieldPropGroupPath) ? readFileSync(governanceFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(governanceFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-governance-field-prop-group")
      : null;

    expect(existsSync(governanceFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorGovernanceFieldProps = buildWorkspaceReportGeneratorGovernanceFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorGovernanceFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorGovernancePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorGovernanceFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorGovernanceFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-governance-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-governance-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorGovernanceFieldProps: propGroupModule?.buildWorkspaceReportGeneratorGovernanceFieldProps
    });
  });

  it("extracts report generator reliability props into a focused prop group", async () => {
    const reliabilityPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-reliability-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reliabilityPropGroupPath) ? readFileSync(reliabilityPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reliabilityPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-reliability-prop-group")
      : null;

    expect(existsSync(reliabilityPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReliabilityProps = buildWorkspaceReportGeneratorReliabilityProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReliabilityProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReliabilityProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-reliability-prop-group"');
    expect(boundaryModule("workspace-report-generator-reliability-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReliabilityProps: propGroupModule?.buildWorkspaceReportGeneratorReliabilityProps
    });
  });

  it("extracts report generator reliability composition props into a focused prop group", async () => {
    const reliabilityCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-reliability-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reliabilityCompositionPropGroupPath) ? readFileSync(reliabilityCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reliabilityCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-reliability-composition-prop-group")
      : null;

    expect(existsSync(reliabilityCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReliabilityCompositionProps = buildWorkspaceReportGeneratorReliabilityCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReliabilityCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReliabilityCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-reliability-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-reliability-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReliabilityCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorReliabilityCompositionProps
    });
  });

  it("extracts report generator reliability composition field props into a focused prop group", async () => {
    const reliabilityCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-reliability-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reliabilityCompositionFieldPropGroupPath) ? readFileSync(reliabilityCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reliabilityCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-reliability-composition-field-prop-group")
      : null;

    expect(existsSync(reliabilityCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReliabilityCompositionFieldProps = buildWorkspaceReportGeneratorReliabilityCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReliabilityCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReliabilityPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReliabilityCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-reliability-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-reliability-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReliabilityCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReliabilityCompositionFieldProps
    });
  });

  it("extracts report generator reliability boundary composition field props into a focused prop group", async () => {
    const reliabilityBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-reliability-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reliabilityBoundaryCompositionFieldPropGroupPath) ? readFileSync(reliabilityBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reliabilityBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-reliability-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reliabilityBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReliabilityBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReliabilityBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReliabilityCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-reliability-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-reliability-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps
    });
  });

  it("extracts report generator reliability boundary composition props into a focused prop group", async () => {
    const reliabilityBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-reliability-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reliabilityBoundaryCompositionPropGroupPath) ? readFileSync(reliabilityBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reliabilityBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-reliability-boundary-composition-prop-group")
      : null;

    expect(existsSync(reliabilityBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReliabilityBoundaryCompositionProps = buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReliabilityBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-reliability-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-reliability-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps
    });
  });

  it("extracts report generator reliability field props into a focused prop group", async () => {
    const reliabilityFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-reliability-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reliabilityFieldPropGroupPath) ? readFileSync(reliabilityFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reliabilityFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-reliability-field-prop-group")
      : null;

    expect(existsSync(reliabilityFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReliabilityFieldProps = buildWorkspaceReportGeneratorReliabilityFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReliabilityFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReliabilityPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReliabilityFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReliabilityFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-reliability-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-reliability-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReliabilityFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReliabilityFieldProps
    });
  });

  it("extracts report generator export props into a focused prop group", async () => {
    const exportPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-export-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(exportPropGroupPath) ? readFileSync(exportPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(exportPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-export-prop-group")
      : null;

    expect(existsSync(exportPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorExportProps = buildWorkspaceReportGeneratorExportProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorExportProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorExportProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-export-prop-group"');
    expect(boundaryModule("workspace-report-generator-export-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorExportProps: propGroupModule?.buildWorkspaceReportGeneratorExportProps
    });
  });

  it("extracts report generator export composition props into a focused prop group", async () => {
    const exportCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-export-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(exportCompositionPropGroupPath) ? readFileSync(exportCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(exportCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-export-composition-prop-group")
      : null;

    expect(existsSync(exportCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorExportCompositionProps = buildWorkspaceReportGeneratorExportCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorExportCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorExportCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-export-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-export-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorExportCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorExportCompositionProps
    });
  });

  it("extracts report generator export composition field props into a focused prop group", async () => {
    const exportCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-export-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(exportCompositionFieldPropGroupPath) ? readFileSync(exportCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(exportCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-export-composition-field-prop-group")
      : null;

    expect(existsSync(exportCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorExportCompositionFieldProps = buildWorkspaceReportGeneratorExportCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorExportCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorExportPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorExportCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-export-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-export-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorExportCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorExportCompositionFieldProps
    });
  });

  it("extracts report generator export boundary composition field props into a focused prop group", async () => {
    const exportBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-export-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(exportBoundaryCompositionFieldPropGroupPath) ? readFileSync(exportBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(exportBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-export-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(exportBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorExportBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorExportBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorExportCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-export-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-export-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps
    });
  });

  it("extracts report generator export boundary composition props into a focused prop group", async () => {
    const exportBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-export-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(exportBoundaryCompositionPropGroupPath) ? readFileSync(exportBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(exportBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-export-boundary-composition-prop-group")
      : null;

    expect(existsSync(exportBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorExportBoundaryCompositionProps = buildWorkspaceReportGeneratorExportBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorExportBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorExportBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-export-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-export-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorExportBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorExportBoundaryCompositionProps
    });
  });

  it("extracts report generator export callback props into a focused prop group", async () => {
    const exportCallbackPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-export-callback-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(exportCallbackPropGroupPath) ? readFileSync(exportCallbackPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(exportCallbackPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-export-callback-prop-group")
      : null;

    expect(existsSync(exportCallbackPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorExportCallbackProps = buildWorkspaceReportGeneratorExportCallbackProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorExportCallbackProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorExportPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorExportCallbackProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorExportCallbackPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-export-callback-prop-group"');
    expect(boundaryModule("workspace-report-generator-export-callback-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorExportCallbackProps: propGroupModule?.buildWorkspaceReportGeneratorExportCallbackProps
    });
  });

  it("extracts report generator review metadata props into a focused prop group", async () => {
    const reviewMetadataPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-metadata-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewMetadataPropGroupPath) ? readFileSync(reviewMetadataPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewMetadataPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-metadata-prop-group")
      : null;

    expect(existsSync(reviewMetadataPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewMetadataProps = buildWorkspaceReportGeneratorReviewMetadataProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewMetadataProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewMetadataProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-metadata-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-metadata-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewMetadataProps: propGroupModule?.buildWorkspaceReportGeneratorReviewMetadataProps
    });
  });

  it("extracts report generator review metadata composition props into a focused prop group", async () => {
    const reviewMetadataCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-metadata-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewMetadataCompositionPropGroupPath) ? readFileSync(reviewMetadataCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewMetadataCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-metadata-composition-prop-group")
      : null;

    expect(existsSync(reviewMetadataCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewMetadataCompositionProps = buildWorkspaceReportGeneratorReviewMetadataCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewMetadataCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewMetadataCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-metadata-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-metadata-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewMetadataCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorReviewMetadataCompositionProps
    });
  });

  it("extracts report generator review metadata composition field props into a focused prop group", async () => {
    const reviewMetadataCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-metadata-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewMetadataCompositionFieldPropGroupPath) ? readFileSync(reviewMetadataCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewMetadataCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-metadata-composition-field-prop-group")
      : null;

    expect(existsSync(reviewMetadataCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewMetadataCompositionFieldProps = buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewMetadataCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReviewMetadataPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-metadata-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-metadata-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps
    });
  });

  it("extracts report generator review metadata boundary composition field props into a focused prop group", async () => {
    const reviewMetadataBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-metadata-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewMetadataBoundaryCompositionFieldPropGroupPath) ? readFileSync(reviewMetadataBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewMetadataBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-metadata-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reviewMetadataBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReviewMetadataCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-metadata-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-metadata-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps
    });
  });

  it("extracts report generator review metadata boundary composition props into a focused prop group", async () => {
    const reviewMetadataBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-metadata-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewMetadataBoundaryCompositionPropGroupPath) ? readFileSync(reviewMetadataBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewMetadataBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-metadata-boundary-composition-prop-group")
      : null;

    expect(existsSync(reviewMetadataBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewMetadataBoundaryCompositionProps = buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewMetadataBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewMetadataBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-metadata-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-metadata-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps
    });
  });

  it("extracts report generator review status field props into a focused prop group", async () => {
    const reviewStatusFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-status-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewStatusFieldPropGroupPath) ? readFileSync(reviewStatusFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewStatusFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-status-field-prop-group")
      : null;

    expect(existsSync(reviewStatusFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewStatusFieldProps = buildWorkspaceReportGeneratorReviewStatusFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewStatusFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorReviewMetadataPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewStatusFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewStatusFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-status-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-status-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewStatusFieldProps: propGroupModule?.buildWorkspaceReportGeneratorReviewStatusFieldProps
    });
  });

  it("extracts report generator review status props into a focused prop group", async () => {
    const reviewStatusPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-review-status-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reviewStatusPropGroupPath) ? readFileSync(reviewStatusPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reviewStatusPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-review-status-prop-group")
      : null;

    expect(existsSync(reviewStatusPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorReviewStatusProps = buildWorkspaceReportGeneratorReviewStatusProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorReviewStatusProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewStatusFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorReviewStatusProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorReviewStatusPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-review-status-prop-group"');
    expect(boundaryModule("workspace-report-generator-review-status-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorReviewStatusProps: propGroupModule?.buildWorkspaceReportGeneratorReviewStatusProps
    });
  });

  it("extracts report generator audit summary props into a focused prop group", async () => {
    const auditSummaryPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-audit-summary-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(auditSummaryPropGroupPath) ? readFileSync(auditSummaryPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(auditSummaryPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-audit-summary-prop-group")
      : null;

    expect(existsSync(auditSummaryPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorAuditSummaryProps = buildWorkspaceReportGeneratorAuditSummaryProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorAuditSummaryProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorAuditSummaryProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-audit-summary-prop-group"');
    expect(boundaryModule("workspace-report-generator-audit-summary-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorAuditSummaryProps: propGroupModule?.buildWorkspaceReportGeneratorAuditSummaryProps
    });
  });

  it("extracts report generator audit summary composition props into a focused prop group", async () => {
    const auditSummaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-audit-summary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(auditSummaryCompositionPropGroupPath) ? readFileSync(auditSummaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(auditSummaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-audit-summary-composition-prop-group")
      : null;

    expect(existsSync(auditSummaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorAuditSummaryCompositionProps = buildWorkspaceReportGeneratorAuditSummaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorAuditSummaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorAuditSummaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-audit-summary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-audit-summary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorAuditSummaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorAuditSummaryCompositionProps
    });
  });

  it("extracts report generator audit summary composition field props into a focused prop group", async () => {
    const auditSummaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-audit-summary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(auditSummaryCompositionFieldPropGroupPath) ? readFileSync(auditSummaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(auditSummaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-audit-summary-composition-field-prop-group")
      : null;

    expect(existsSync(auditSummaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorAuditSummaryCompositionFieldProps = buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorAuditSummaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorAuditSummaryPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-audit-summary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-audit-summary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps
    });
  });

  it("extracts report generator audit summary boundary composition field props into a focused prop group", async () => {
    const auditSummaryBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-audit-summary-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(auditSummaryBoundaryCompositionFieldPropGroupPath) ? readFileSync(auditSummaryBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(auditSummaryBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-audit-summary-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(auditSummaryBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorAuditSummaryCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-audit-summary-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-audit-summary-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps
    });
  });

  it("extracts report generator audit summary boundary composition props into a focused prop group", async () => {
    const auditSummaryBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-audit-summary-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(auditSummaryBoundaryCompositionPropGroupPath) ? readFileSync(auditSummaryBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(auditSummaryBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-audit-summary-boundary-composition-prop-group")
      : null;

    expect(existsSync(auditSummaryBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorAuditSummaryBoundaryCompositionProps = buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorAuditSummaryBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-audit-summary-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-generator-audit-summary-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps
    });
  });

  it("extracts report generator audit summary field props into a focused prop group", async () => {
    const auditSummaryFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-generator-audit-summary-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(auditSummaryFieldPropGroupPath) ? readFileSync(auditSummaryFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(auditSummaryFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-generator-audit-summary-field-prop-group")
      : null;

    expect(existsSync(auditSummaryFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportGeneratorAuditSummaryFieldProps = buildWorkspaceReportGeneratorAuditSummaryFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportGeneratorAuditSummaryFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportGeneratorAuditSummaryPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportGeneratorAuditSummaryFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportGeneratorAuditSummaryFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-generator-audit-summary-field-prop-group"');
    expect(boundaryModule("workspace-report-generator-audit-summary-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportGeneratorAuditSummaryFieldProps: propGroupModule?.buildWorkspaceReportGeneratorAuditSummaryFieldProps
    });
  });

  it("extracts data import props into a focused prop group", async () => {
    const dataImportPropGroupPath = new URL("../../../components/sena/workspace/workspace-data-import-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataImportPropGroupPath) ? readFileSync(dataImportPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataImportPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-data-import-prop-group")
      : null;

    expect(existsSync(dataImportPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceDataImportProps = buildWorkspaceDataImportProps({");
    expect(workspaceSource).toContain("dataImportProps: workspaceDataImportProps,");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["dataImportProps"]');
    expect(propGroupSource).toContain("buildWorkspaceDataImportProps");
    expect(propGroupSource).toContain("WorkspaceDataImportPropGroup");
    expect(boundarySource).toContain('"workspace-data-import-prop-group"');
    expect(boundaryModule("workspace-data-import-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceDataImportProps: propGroupModule?.buildWorkspaceDataImportProps
    });
  });

  it("extracts data import field props into a focused prop group", async () => {
    const dataImportFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-data-import-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataImportFieldPropGroupPath) ? readFileSync(dataImportFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataImportFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-data-import-field-prop-group")
      : null;

    expect(existsSync(dataImportFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceDataImportFieldProps = buildWorkspaceDataImportFieldProps({");
    expect(workspaceSource).toContain("...workspaceDataImportFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceDataImportPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceDataImportFieldProps");
    expect(propGroupSource).toContain("WorkspaceDataImportFieldPropGroup");
    expect(boundarySource).toContain('"workspace-data-import-field-prop-group"');
    expect(boundaryModule("workspace-data-import-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceDataImportFieldProps: propGroupModule?.buildWorkspaceDataImportFieldProps
    });
  });

  it("extracts model builder props into a focused prop group", async () => {
    const modelBuilderPropGroupPath = new URL("../../../components/sena/workspace/workspace-model-builder-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelBuilderPropGroupPath) ? readFileSync(modelBuilderPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelBuilderPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-model-builder-prop-group")
      : null;

    expect(existsSync(modelBuilderPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceModelBuilderProps = buildWorkspaceModelBuilderProps({");
    expect(workspaceSource).toContain("modelBuilderProps: workspaceModelBuilderProps,");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["modelBuilderProps"]');
    expect(propGroupSource).toContain("buildWorkspaceModelBuilderProps");
    expect(propGroupSource).toContain("WorkspaceModelBuilderPropGroup");
    expect(boundarySource).toContain('"workspace-model-builder-prop-group"');
    expect(boundaryModule("workspace-model-builder-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceModelBuilderProps: propGroupModule?.buildWorkspaceModelBuilderProps
    });
  });

  it("extracts model builder field props into a focused prop group", async () => {
    const modelBuilderFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-model-builder-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(modelBuilderFieldPropGroupPath) ? readFileSync(modelBuilderFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(modelBuilderFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-model-builder-field-prop-group")
      : null;

    expect(existsSync(modelBuilderFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceModelBuilderFieldProps = buildWorkspaceModelBuilderFieldProps({");
    expect(workspaceSource).toContain("...workspaceModelBuilderFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceModelBuilderPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceModelBuilderFieldProps");
    expect(propGroupSource).toContain("WorkspaceModelBuilderFieldPropGroup");
    expect(boundarySource).toContain('"workspace-model-builder-field-prop-group"');
    expect(boundaryModule("workspace-model-builder-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceModelBuilderFieldProps: propGroupModule?.buildWorkspaceModelBuilderFieldProps
    });
  });

  it("extracts plot tools props into a focused prop group", async () => {
    const plotToolsPropGroupPath = new URL("../../../components/sena/workspace/workspace-plot-tools-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(plotToolsPropGroupPath) ? readFileSync(plotToolsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(plotToolsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-plot-tools-prop-group")
      : null;

    expect(existsSync(plotToolsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspacePlotToolsProps = buildWorkspacePlotToolsProps({");
    expect(workspaceSource).toContain("plotToolsProps: workspacePlotToolsProps,");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["plotToolsProps"]');
    expect(propGroupSource).toContain("buildWorkspacePlotToolsProps");
    expect(propGroupSource).toContain("WorkspacePlotToolsPropGroup");
    expect(boundarySource).toContain('"workspace-plot-tools-prop-group"');
    expect(boundaryModule("workspace-plot-tools-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspacePlotToolsProps: propGroupModule?.buildWorkspacePlotToolsProps
    });
  });

  it("extracts plot tools field props into a focused prop group", async () => {
    const plotToolsFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-plot-tools-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(plotToolsFieldPropGroupPath) ? readFileSync(plotToolsFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(plotToolsFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-plot-tools-field-prop-group")
      : null;

    expect(existsSync(plotToolsFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspacePlotToolsFieldProps = buildWorkspacePlotToolsFieldProps({");
    expect(workspaceSource).toContain("...workspacePlotToolsFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspacePlotToolsPropGroup");
    expect(propGroupSource).toContain("buildWorkspacePlotToolsFieldProps");
    expect(propGroupSource).toContain("WorkspacePlotToolsFieldPropGroup");
    expect(boundarySource).toContain('"workspace-plot-tools-field-prop-group"');
    expect(boundaryModule("workspace-plot-tools-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspacePlotToolsFieldProps: propGroupModule?.buildWorkspacePlotToolsFieldProps
    });
  });

  it("extracts stats props into a focused prop group", async () => {
    const statsPropGroupPath = new URL("../../../components/sena/workspace/workspace-stats-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(statsPropGroupPath) ? readFileSync(statsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(statsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-stats-prop-group")
      : null;

    expect(existsSync(statsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceStatsProps = buildWorkspaceStatsProps({");
    expect(workspaceSource).toContain("statsProps: workspaceStatsProps,");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["statsProps"]');
    expect(propGroupSource).toContain("buildWorkspaceStatsProps");
    expect(propGroupSource).toContain("WorkspaceStatsPropGroup");
    expect(boundarySource).toContain('"workspace-stats-prop-group"');
    expect(boundaryModule("workspace-stats-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceStatsProps: propGroupModule?.buildWorkspaceStatsProps
    });
  });

  it("extracts stats field props into a focused prop group", async () => {
    const statsFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-stats-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(statsFieldPropGroupPath) ? readFileSync(statsFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(statsFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-stats-field-prop-group")
      : null;

    expect(existsSync(statsFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceStatsFieldProps = buildWorkspaceStatsFieldProps({");
    expect(workspaceSource).toContain("...workspaceStatsFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceStatsPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceStatsFieldProps");
    expect(propGroupSource).toContain("WorkspaceStatsFieldPropGroup");
    expect(boundarySource).toContain('"workspace-stats-field-prop-group"');
    expect(boundaryModule("workspace-stats-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceStatsFieldProps: propGroupModule?.buildWorkspaceStatsFieldProps
    });
  });

  it("extracts data contract audit props into a focused prop group", async () => {
    const dataContractAuditPropGroupPath = new URL("../../../components/sena/workspace/workspace-data-contract-audit-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataContractAuditPropGroupPath) ? readFileSync(dataContractAuditPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataContractAuditPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-data-contract-audit-prop-group")
      : null;

    expect(existsSync(dataContractAuditPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceDataContractAuditProps = buildWorkspaceDataContractAuditProps({");
    expect(workspaceSource).toContain("dataContractAuditProps: workspaceDataContractAuditProps,");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["dataContractAuditProps"]');
    expect(propGroupSource).toContain("buildWorkspaceDataContractAuditProps");
    expect(propGroupSource).toContain("WorkspaceDataContractAuditPropGroup");
    expect(boundarySource).toContain('"workspace-data-contract-audit-prop-group"');
    expect(boundaryModule("workspace-data-contract-audit-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceDataContractAuditProps: propGroupModule?.buildWorkspaceDataContractAuditProps
    });
  });

  it("extracts data contract audit field props into a focused prop group", async () => {
    const dataContractAuditFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-data-contract-audit-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataContractAuditFieldPropGroupPath) ? readFileSync(dataContractAuditFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataContractAuditFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-data-contract-audit-field-prop-group")
      : null;

    expect(existsSync(dataContractAuditFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceDataContractAuditFieldProps = buildWorkspaceDataContractAuditFieldProps({");
    expect(workspaceSource).toContain("...workspaceDataContractAuditFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceDataContractAuditPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceDataContractAuditFieldProps");
    expect(propGroupSource).toContain("WorkspaceDataContractAuditFieldPropGroup");
    expect(boundarySource).toContain('"workspace-data-contract-audit-field-prop-group"');
    expect(boundaryModule("workspace-data-contract-audit-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceDataContractAuditFieldProps: propGroupModule?.buildWorkspaceDataContractAuditFieldProps
    });
  });

  it("extracts data import feedback props into a focused prop group", async () => {
    const dataImportFeedbackPropGroupPath = new URL("../../../components/sena/workspace/workspace-data-import-feedback-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataImportFeedbackPropGroupPath) ? readFileSync(dataImportFeedbackPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataImportFeedbackPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-data-import-feedback-prop-group")
      : null;

    expect(existsSync(dataImportFeedbackPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceDataImportFeedbackProps = buildWorkspaceDataImportFeedbackProps({");
    expect(workspaceSource).toContain("dataImportFeedbackProps: workspaceDataImportFeedbackProps,");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["dataImportFeedbackProps"]');
    expect(propGroupSource).toContain("buildWorkspaceDataImportFeedbackProps");
    expect(propGroupSource).toContain("WorkspaceDataImportFeedbackPropGroup");
    expect(boundarySource).toContain('"workspace-data-import-feedback-prop-group"');
    expect(boundaryModule("workspace-data-import-feedback-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceDataImportFeedbackProps: propGroupModule?.buildWorkspaceDataImportFeedbackProps
    });
  });

  it("extracts data import feedback field props into a focused prop group", async () => {
    const dataImportFeedbackFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-data-import-feedback-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(dataImportFeedbackFieldPropGroupPath) ? readFileSync(dataImportFeedbackFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(dataImportFeedbackFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-data-import-feedback-field-prop-group")
      : null;

    expect(existsSync(dataImportFeedbackFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceDataImportFeedbackFieldProps = buildWorkspaceDataImportFeedbackFieldProps({");
    expect(workspaceSource).toContain("...workspaceDataImportFeedbackFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceDataImportFeedbackPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceDataImportFeedbackFieldProps");
    expect(propGroupSource).toContain("WorkspaceDataImportFeedbackFieldPropGroup");
    expect(boundarySource).toContain('"workspace-data-import-feedback-field-prop-group"');
    expect(boundaryModule("workspace-data-import-feedback-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceDataImportFeedbackFieldProps: propGroupModule?.buildWorkspaceDataImportFeedbackFieldProps
    });
  });

  it("extracts workflow step props into a focused prop group", async () => {
    const workflowStepsPropGroupPath = new URL("../../../components/sena/workspace/workspace-workflow-steps-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(workflowStepsPropGroupPath) ? readFileSync(workflowStepsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(workflowStepsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-workflow-steps-prop-group")
      : null;

    expect(existsSync(workflowStepsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceWorkflowStepProps = buildWorkspaceWorkflowStepProps(workspaceWorkflowStepFieldProps);");
    expect(workspaceSource).toContain("workflowStepStates: workspaceWorkflowStepProps");
    expect(propGroupSource).toContain('WorkspaceLeftRailPanelSectionProps["workflowStepStates"]');
    expect(propGroupSource).toContain("buildWorkspaceWorkflowStepProps");
    expect(propGroupSource).toContain("WorkspaceWorkflowStepPropGroup");
    expect(boundarySource).toContain('"workspace-workflow-steps-prop-group"');
    expect(boundaryModule("workspace-workflow-steps-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceWorkflowStepProps: propGroupModule?.buildWorkspaceWorkflowStepProps
    });
  });

  it("extracts workflow step field props into a focused prop group", async () => {
    const workflowStepsFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-workflow-steps-field-prop-group.ts", import.meta.url);
    const workspaceSource = headerLeftRailCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(workflowStepsFieldPropGroupPath) ? readFileSync(workflowStepsFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(workflowStepsFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-workflow-steps-field-prop-group")
      : null;

    expect(existsSync(workflowStepsFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceWorkflowStepFieldProps = buildWorkspaceWorkflowStepFieldProps(workflowStepStates);");
    expect(workspaceSource).toContain("const workspaceWorkflowStepProps = buildWorkspaceWorkflowStepProps(workspaceWorkflowStepFieldProps);");
    expect(propGroupSource).toContain("WorkspaceWorkflowStepFieldPropGroup = WorkspaceWorkflowStepPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceWorkflowStepFieldProps");
    expect(boundarySource).toContain('"workspace-workflow-steps-field-prop-group"');
    expect(boundaryModule("workspace-workflow-steps-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceWorkflowStepFieldProps: propGroupModule?.buildWorkspaceWorkflowStepFieldProps
    });
  });

  it("extracts report and stats deck metrics props into a focused prop group", async () => {
    const reportAndStatsDeckMetricsPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckMetricsPropGroupPath) ? readFileSync(reportAndStatsDeckMetricsPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckMetricsPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckMetricsPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckMetricsProps = buildWorkspaceReportAndStatsDeckMetricsProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckMetricsProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckMetricsProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckMetricsPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-metrics-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-metrics-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckMetricsProps: propGroupModule?.buildWorkspaceReportAndStatsDeckMetricsProps
    });
  });

  it("extracts report and stats deck metrics field props into a focused prop group", async () => {
    const reportAndStatsDeckMetricsFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckMetricsFieldPropGroupPath) ? readFileSync(reportAndStatsDeckMetricsFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckMetricsFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckMetricsFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckMetricsFieldProps = buildWorkspaceReportAndStatsDeckMetricsFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckMetricsFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckMetricsPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckMetricsFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckMetricsFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-metrics-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-metrics-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckMetricsFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckMetricsFieldProps
    });
  });

  it("extracts report and stats deck metrics boundary composition field props into a focused prop group", async () => {
    const reportAndStatsDeckMetricsBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckMetricsBoundaryCompositionFieldPropGroupPath) ? readFileSync(reportAndStatsDeckMetricsBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckMetricsBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckMetricsBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckMetricsFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps
    });
  });

  it("extracts report and stats deck metrics boundary composition props into a focused prop group", async () => {
    const reportAndStatsDeckMetricsBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckMetricsBoundaryCompositionPropGroupPath) ? readFileSync(reportAndStatsDeckMetricsBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckMetricsBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-metrics-boundary-composition-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckMetricsBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckMetricsBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckMetricsBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckMetricsBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-metrics-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-metrics-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps
    });
  });

  it("extracts report and stats deck evidence props into a focused prop group", async () => {
    const reportAndStatsDeckEvidencePropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckEvidencePropGroupPath) ? readFileSync(reportAndStatsDeckEvidencePropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckEvidencePropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckEvidencePropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckEvidenceProps = buildWorkspaceReportAndStatsDeckEvidenceProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckEvidenceProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckEvidenceProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckEvidencePropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-evidence-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-evidence-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckEvidenceProps: propGroupModule?.buildWorkspaceReportAndStatsDeckEvidenceProps
    });
  });

  it("extracts report and stats deck evidence field props into a focused prop group", async () => {
    const reportAndStatsDeckEvidenceFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckEvidenceFieldPropGroupPath) ? readFileSync(reportAndStatsDeckEvidenceFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckEvidenceFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckEvidenceFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckEvidenceFieldProps = buildWorkspaceReportAndStatsDeckEvidenceFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckEvidenceFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckEvidencePropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckEvidenceFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckEvidenceFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-evidence-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-evidence-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckEvidenceFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckEvidenceFieldProps
    });
  });

  it("extracts report and stats deck evidence boundary composition field props into a focused prop group", async () => {
    const reportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroupPath) ? readFileSync(reportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckEvidenceFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps
    });
  });

  it("extracts report and stats deck evidence boundary composition props into a focused prop group", async () => {
    const reportAndStatsDeckEvidenceBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckEvidenceBoundaryCompositionPropGroupPath) ? readFileSync(reportAndStatsDeckEvidenceBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckEvidenceBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-evidence-boundary-composition-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckEvidenceBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckEvidenceBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckEvidenceBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckEvidenceBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-evidence-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-evidence-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps
    });
  });

  it("extracts report and stats deck report props into a focused prop group", async () => {
    const reportAndStatsDeckReportPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-report-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckReportPropGroupPath) ? readFileSync(reportAndStatsDeckReportPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckReportPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-report-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckReportPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckReportProps = buildWorkspaceReportAndStatsDeckReportProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckReportProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckReportProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckReportPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-report-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-report-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckReportProps: propGroupModule?.buildWorkspaceReportAndStatsDeckReportProps
    });
  });

  it("extracts report and stats deck report field props into a focused prop group", async () => {
    const reportAndStatsDeckReportFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-report-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckReportFieldPropGroupPath) ? readFileSync(reportAndStatsDeckReportFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckReportFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-report-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckReportFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckReportFieldProps = buildWorkspaceReportAndStatsDeckReportFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckReportFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckReportPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckReportFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckReportFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-report-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-report-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckReportFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckReportFieldProps
    });
  });

  it("extracts report and stats deck report boundary composition field props into a focused prop group", async () => {
    const reportAndStatsDeckReportBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-report-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckReportBoundaryCompositionFieldPropGroupPath) ? readFileSync(reportAndStatsDeckReportBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckReportBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-report-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckReportBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckReportBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckReportBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckReportFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckReportBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-report-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-report-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps
    });
  });

  it("extracts report and stats deck report boundary composition props into a focused prop group", async () => {
    const reportAndStatsDeckReportBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-report-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckReportBoundaryCompositionPropGroupPath) ? readFileSync(reportAndStatsDeckReportBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckReportBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-report-boundary-composition-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckReportBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckReportBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckReportBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckReportBoundaryCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckReportBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-report-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-report-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps
    });
  });

  it("extracts report and stats deck composition props into a focused prop group", async () => {
    const reportAndStatsDeckCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckCompositionPropGroupPath) ? readFileSync(reportAndStatsDeckCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckCompositionProps = buildWorkspaceReportAndStatsDeckCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckMetricsPropGroup");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckEvidencePropGroup");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckReportPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-composition-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckCompositionProps: propGroupModule?.buildWorkspaceReportAndStatsDeckCompositionProps
    });
  });

  it("extracts report and stats deck composition field props into a focused prop group", async () => {
    const reportAndStatsDeckCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckCompositionFieldPropGroupPath) ? readFileSync(reportAndStatsDeckCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckCompositionFieldProps = buildWorkspaceReportAndStatsDeckCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckCompositionFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckCompositionFieldProps
    });
  });

  it("extracts report and stats deck composition boundary field props into a focused prop group", async () => {
    const reportAndStatsDeckCompositionBoundaryFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-boundary-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckCompositionBoundaryFieldPropGroupPath) ? readFileSync(reportAndStatsDeckCompositionBoundaryFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckCompositionBoundaryFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-boundary-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckCompositionBoundaryFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckCompositionBoundaryFieldProps = buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckCompositionBoundaryFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckCompositionFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckCompositionBoundaryFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-composition-boundary-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-composition-boundary-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps
    });
  });

  it("extracts report and stats deck composition boundary props into a focused prop group", async () => {
    const reportAndStatsDeckCompositionBoundaryPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-boundary-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckCompositionBoundaryPropGroupPath) ? readFileSync(reportAndStatsDeckCompositionBoundaryPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckCompositionBoundaryPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-composition-boundary-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckCompositionBoundaryPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckCompositionBoundaryProps = buildWorkspaceReportAndStatsDeckCompositionBoundaryProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckCompositionBoundaryProps,");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckCompositionBoundaryFieldPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckCompositionBoundaryProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckCompositionBoundaryPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-composition-boundary-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-composition-boundary-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckCompositionBoundaryProps: propGroupModule?.buildWorkspaceReportAndStatsDeckCompositionBoundaryProps
    });
  });

  it("extracts report and stats deck boundary composition props into a focused prop group", async () => {
    const reportAndStatsDeckBoundaryCompositionPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-boundary-composition-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckBoundaryCompositionPropGroupPath) ? readFileSync(reportAndStatsDeckBoundaryCompositionPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckBoundaryCompositionPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-boundary-composition-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckBoundaryCompositionPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckBoundaryCompositionProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckBoundaryCompositionProps,");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckBoundaryCompositionProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckBoundaryCompositionPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-boundary-composition-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-boundary-composition-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckBoundaryCompositionProps: propGroupModule?.buildWorkspaceReportAndStatsDeckBoundaryCompositionProps
    });
  });

  it("extracts report and stats deck boundary composition field props into a focused prop group", async () => {
    const reportAndStatsDeckBoundaryCompositionFieldPropGroupPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-boundary-composition-field-prop-group.ts", import.meta.url);
    const workspaceSource = reportAndStatsCompositionSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const propGroupSource = existsSync(reportAndStatsDeckBoundaryCompositionFieldPropGroupPath) ? readFileSync(reportAndStatsDeckBoundaryCompositionFieldPropGroupPath, "utf8") : "";
    const propGroupModule = existsSync(reportAndStatsDeckBoundaryCompositionFieldPropGroupPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-boundary-composition-field-prop-group")
      : null;

    expect(existsSync(reportAndStatsDeckBoundaryCompositionFieldPropGroupPath)).toBe(true);
    expect(workspaceSource).toContain("const workspaceReportAndStatsDeckBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps({");
    expect(workspaceSource).toContain("...workspaceReportAndStatsDeckBoundaryCompositionFieldProps,");
    expect(propGroupSource).toContain("Pick<WorkspaceReportAndStatsDeckBoundaryCompositionPropGroup");
    expect(propGroupSource).toContain("buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps");
    expect(propGroupSource).toContain("WorkspaceReportAndStatsDeckBoundaryCompositionFieldPropGroup");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-boundary-composition-field-prop-group"');
    expect(boundaryModule("workspace-report-and-stats-deck-boundary-composition-field-prop-group" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps: propGroupModule?.buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps
    });
  });

  it("extracts the evidence ledger panel from the main workspace container", async () => {
    const evidenceLedgerPath = new URL("../../../components/sena/workspace/evidence-ledger-panel.tsx", import.meta.url);
    const inspectorPanelPath = new URL("../../../components/sena/workspace/inspector-panel.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const inspectorSource = existsSync(inspectorPanelPath) ? readFileSync(inspectorPanelPath, "utf8") : "";
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const ledgerModule = existsSync(evidenceLedgerPath)
      ? await import("../../../components/sena/workspace/evidence-ledger-panel")
      : null;

    expect(existsSync(evidenceLedgerPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<EvidenceLedgerPanel");
    expect(reportAndStatsDeckSource).toContain("<EvidenceLedgerPanel");
    expect(workspaceSource).not.toContain("<EvidenceLineageBadges");
    expect(inspectorSource).toContain("<EvidenceLineageBadges");
    expect(workspaceSource).not.toContain("function EvidenceLedgerPanel(");
    expect(workspaceSource).not.toContain("function EvidenceLineageBadges(");
    expect(workspaceSource).not.toContain('data-testid="evidence-ledger-source-filter"');
    expect(boundarySource).toContain('"evidence-ledger-panel"');
    expect(boundaryModule("evidence-ledger-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      EvidenceLedgerPanel: ledgerModule?.EvidenceLedgerPanel,
      EvidenceLineageBadges: ledgerModule?.EvidenceLineageBadges
    });
  });

  it("extracts the Dual Lens dashboard from the main workspace container", async () => {
    const dualLensDashboardPath = new URL("../../../components/sena/workspace/dual-lens-dashboard.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const dashboardModule = existsSync(dualLensDashboardPath)
      ? await import("../../../components/sena/workspace/dual-lens-dashboard")
      : null;

    expect(existsSync(dualLensDashboardPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<DualLensDashboard");
    expect(reportAndStatsDeckSource).toContain("<DualLensDashboard");
    expect(workspaceSource).not.toContain("function DualLensDashboard(");
    expect(workspaceSource).not.toContain('data-testid={surface === "central" ? "central-dual-lens-dashboard" : "dual-lens-dashboard"}');
    expect(workspaceSource).not.toContain('data-visual-role="dual-lens-runtime-handoff"');
    expect(boundarySource).toContain('"dual-lens-dashboard"');
    expect(boundaryModule("dual-lens-dashboard" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      DualLensDashboard: dashboardModule?.DualLensDashboard
    });
  });

  it("extracts the Fusion Canvas SVG and layout helpers from the main workspace container", async () => {
    const fusionCanvasPath = new URL("../../../components/sena/workspace/fusion-canvas.tsx", import.meta.url);
    const centralFusionPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx", import.meta.url);
    const rightColumnPath = new URL("../../../components/sena/workspace/workspace-right-inspector-column.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const centralFusionSource = existsSync(centralFusionPath) ? readFileSync(centralFusionPath, "utf8") : "";
    const rightColumnSource = existsSync(rightColumnPath) ? readFileSync(rightColumnPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const canvasModule = existsSync(fusionCanvasPath)
      ? await import("../../../components/sena/workspace/fusion-canvas")
      : null;

    expect(existsSync(fusionCanvasPath)).toBe(true);
    expect(centralFusionSource).toContain("<Canvas");
    expect(rightColumnSource).not.toContain("<Canvas");
    expect(workspaceSource).not.toContain("function Canvas(");
    expect(workspaceSource).not.toContain("function nodeRadius(");
    expect(workspaceSource).not.toContain("function socialArcPath(");
    expect(workspaceSource).not.toContain('data-testid="sena-fusion-center-guide"');
    expect(boundarySource).toContain('"fusion-canvas"');
    expect(boundaryModule("fusion-canvas" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      Canvas: canvasModule?.Canvas
    });
  });

  it("extracts the maximized Fusion Plot overlay from the main workspace container", async () => {
    const fusionPlotOverlayPath = new URL("../../../components/sena/workspace/fusion-plot-overlay.tsx", import.meta.url);
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const overlayModule = existsSync(fusionPlotOverlayPath)
      ? await import("../../../components/sena/workspace/fusion-plot-overlay")
      : null;

    expect(existsSync(fusionPlotOverlayPath)).toBe(true);
    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).not.toContain("<FusionPlotMaximizedOverlay");
    expect(mainShellSource).toContain("<FusionPlotMaximizedOverlay");
    expect(workspaceSource).not.toContain("function FusionPlotMaximizedOverlay(");
    expect(workspaceSource).not.toContain("function FusionPlotCompactKey(");
    expect(workspaceSource).not.toContain('data-testid="fusion-maximized-compact-key"');
    expect(workspaceSource).not.toContain('data-testid="restore-fusion-plot"');
    expect(boundarySource).toContain('"fusion-plot-overlay"');
    expect(boundaryModule("fusion-plot-overlay" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      FusionPlotCompactKey: overlayModule?.FusionPlotCompactKey,
      FusionPlotMaximizedOverlay: overlayModule?.FusionPlotMaximizedOverlay
    });
  });

  it("extracts Fusion layer legend and ranked lists from the main workspace container", async () => {
    const fusionLayerKeyPath = new URL("../../../components/sena/workspace/fusion-layer-key.tsx", import.meta.url);
    const inspectorPanelPath = new URL("../../../components/sena/workspace/inspector-panel.tsx", import.meta.url);
    const centralFusionPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx", import.meta.url);
    const rightColumnPath = new URL("../../../components/sena/workspace/workspace-right-inspector-column.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const inspectorSource = existsSync(inspectorPanelPath) ? readFileSync(inspectorPanelPath, "utf8") : "";
    const centralFusionSource = existsSync(centralFusionPath) ? readFileSync(centralFusionPath, "utf8") : "";
    const rightColumnSource = existsSync(rightColumnPath) ? readFileSync(rightColumnPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const keyModule = existsSync(fusionLayerKeyPath)
      ? await import("../../../components/sena/workspace/fusion-layer-key")
      : null;

    expect(existsSync(fusionLayerKeyPath)).toBe(true);
    expect(centralFusionSource).toContain("<FusionLayerKey");
    expect(rightColumnSource).not.toContain("<FusionLayerKey");
    expect(workspaceSource).not.toContain("<RankedList");
    expect(inspectorSource).toContain("<RankedList");
    expect(workspaceSource).not.toContain("function FusionLayerKey(");
    expect(workspaceSource).not.toContain("function RankedList(");
    expect(workspaceSource).not.toContain('data-testid="fusion-layer-key-threshold"');
    expect(boundarySource).toContain('"fusion-layer-key"');
    expect(boundaryModule("fusion-layer-key" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      FusionLayerKey: keyModule?.FusionLayerKey,
      RankedList: keyModule?.RankedList
    });
  });

  it("extracts the inspector and runtime handoff evidence panels from the main workspace container", async () => {
    const inspectorPanelPath = new URL("../../../components/sena/workspace/inspector-panel.tsx", import.meta.url);
    const rightColumnPath = new URL("../../../components/sena/workspace/workspace-right-inspector-column.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const rightColumnSource = existsSync(rightColumnPath) ? readFileSync(rightColumnPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const inspectorModule = existsSync(inspectorPanelPath)
      ? await import("../../../components/sena/workspace/inspector-panel")
      : null;

    expect(existsSync(inspectorPanelPath)).toBe(true);
    expect(rightColumnSource).toContain("<Inspector");
    expect(workspaceSource).not.toContain("function Inspector(");
    expect(workspaceSource).not.toContain("function JenaConceptPairEvidencePanel(");
    expect(workspaceSource).not.toContain("function JsnaSocialTieEvidencePanel(");
    expect(workspaceSource).not.toContain('data-testid="concept-edge-g-attribution"');
    expect(boundarySource).toContain('"inspector-panel"');
    expect(boundaryModule("inspector-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      Inspector: inspectorModule?.Inspector
    });
  });

  it("extracts the workspace Stats panel composition from the main workspace container", async () => {
    const statsPanelPath = new URL("../../../components/sena/workspace/workspace-stats-panel.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const statsModule = existsSync(statsPanelPath)
      ? await import("../../../components/sena/workspace/workspace-stats-panel")
      : null;

    expect(existsSync(statsPanelPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceStatsPanel");
    expect(leftRailSource).toContain("<WorkspaceStatsPanel");
    expect(workspaceSource).not.toContain('data-testid="stats-runtime-snapshot"');
    expect(workspaceSource).not.toContain('data-testid="stats-top-g-pair"');
    expect(workspaceSource).not.toContain('data-testid="export-stats-sna-report"');
    expect(boundarySource).toContain('"workspace-stats-panel"');
    expect(boundaryModule("workspace-stats-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceStatsPanel: statsModule?.WorkspaceStatsPanel
    });
  });

  it("extracts the temporal trace line chart from the main workspace container", async () => {
    const timelineTracePath = new URL("../../../components/sena/workspace/timeline-trace.tsx", import.meta.url);
    const temporalWindowBuilderPath = new URL("../../../components/sena/workspace/temporal-window-builder.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const builderSource = existsSync(temporalWindowBuilderPath) ? readFileSync(temporalWindowBuilderPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const timelineModule = existsSync(timelineTracePath)
      ? await import("../../../components/sena/workspace/timeline-trace")
      : null;

    expect(existsSync(timelineTracePath)).toBe(true);
    expect(builderSource).toContain("<TimelineTrace");
    expect(workspaceSource).not.toContain("function TimelineTrace(");
    expect(workspaceSource).not.toContain('data-visual-role="temporal-trace-g-pair-line"');
    expect(boundarySource).toContain('"timeline-trace"');
    expect(boundaryModule("timeline-trace" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      TimelineTrace: timelineModule?.TimelineTrace
    });
  });

  it("extracts temporal window controls from the main workspace container", async () => {
    const temporalWindowBuilderPath = new URL("../../../components/sena/workspace/temporal-window-builder.tsx", import.meta.url);
    const centralPlotDeckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const centralPlotDeckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const centralPlotDeckTemporalPanelPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-temporal-panel.tsx", import.meta.url);
    const centralPlotDeckViewPanelsPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-view-panels.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const centralPlotDeckSource = existsSync(centralPlotDeckPath) ? readFileSync(centralPlotDeckPath, "utf8") : "";
    const centralPlotDeckRenderSource = existsSync(centralPlotDeckRenderPath) ? readFileSync(centralPlotDeckRenderPath, "utf8") : "";
    const centralPlotDeckTemporalPanelSource = existsSync(centralPlotDeckTemporalPanelPath) ? readFileSync(centralPlotDeckTemporalPanelPath, "utf8") : "";
    const centralPlotDeckViewPanelsSource = existsSync(centralPlotDeckViewPanelsPath) ? readFileSync(centralPlotDeckViewPanelsPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const builderModule = existsSync(temporalWindowBuilderPath)
      ? await import("../../../components/sena/workspace/temporal-window-builder")
      : null;

    expect(existsSync(temporalWindowBuilderPath)).toBe(true);
    expect(`${centralPlotDeckSource}\n${centralPlotDeckRenderSource}\n${centralPlotDeckTemporalPanelSource}\n${centralPlotDeckViewPanelsSource}`).toContain("<TemporalWindowBuilder");
    expect(workspaceSource).not.toContain("function TemporalWindowBuilder(");
    expect(workspaceSource).not.toContain('data-testid="temporal-window-slider"');
    expect(workspaceSource).not.toContain('data-testid="temporal-transition-evidence"');
    expect(boundarySource).toContain('"temporal-window-builder"');
    expect(boundaryModule("temporal-window-builder" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      TemporalWindowBuilder: builderModule?.TemporalWindowBuilder
    });
  });

  it("extracts the workspace data view drawer from the main workspace container", async () => {
    const dataViewDrawerPath = new URL("../../../components/sena/workspace/workspace-data-view-drawer.tsx", import.meta.url);
    const centralPlotDeckPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck.tsx", import.meta.url);
    const centralPlotDeckRenderPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-render.tsx", import.meta.url);
    const centralPlotDeckBodyPath = new URL("../../../components/sena/workspace/workspace-central-plot-deck-body.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const centralPlotDeckSource = existsSync(centralPlotDeckPath) ? readFileSync(centralPlotDeckPath, "utf8") : "";
    const centralPlotDeckRenderSource = existsSync(centralPlotDeckRenderPath) ? readFileSync(centralPlotDeckRenderPath, "utf8") : "";
    const centralPlotDeckBodySource = existsSync(centralPlotDeckBodyPath) ? readFileSync(centralPlotDeckBodyPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const drawerModule = existsSync(dataViewDrawerPath)
      ? await import("../../../components/sena/workspace/workspace-data-view-drawer")
      : null;

    expect(existsSync(dataViewDrawerPath)).toBe(true);
    expect(`${centralPlotDeckSource}\n${centralPlotDeckRenderSource}\n${centralPlotDeckBodySource}`).toContain("<WorkspaceDataViewDrawer");
    expect(workspaceSource).not.toContain("function WorkspaceDataViewDrawer(");
    expect(workspaceSource).not.toContain('data-testid="workspace-data-view-utterances"');
    expect(workspaceSource).not.toContain('data-testid="workspace-data-view-interactions"');
    expect(boundarySource).toContain('"workspace-data-view-drawer"');
    expect(boundaryModule("workspace-data-view-drawer" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceDataViewDrawer: drawerModule?.WorkspaceDataViewDrawer
    });
  });

  it("extracts temporal runtime trace evidence from the main workspace container", async () => {
    const temporalRuntimeTracePanelPath = new URL("../../../components/sena/workspace/temporal-runtime-trace-panel.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(temporalRuntimeTracePanelPath)
      ? await import("../../../components/sena/workspace/temporal-runtime-trace-panel")
      : null;

    expect(existsSync(temporalRuntimeTracePanelPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<TemporalRuntimeTracePanel");
    expect(reportAndStatsDeckSource).toContain("<TemporalRuntimeTracePanel");
    expect(workspaceSource).not.toContain("function TemporalRuntimeTracePanel(");
    expect(workspaceSource).not.toContain('data-testid="temporal-transition-summary"');
    expect(workspaceSource).not.toContain('data-testid="temporal-window-fingerprint"');
    expect(boundarySource).toContain('"temporal-runtime-trace-panel"');
    expect(boundaryModule("temporal-runtime-trace-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      TemporalRuntimeTracePanel: panelModule?.TemporalRuntimeTracePanel
    });
  });

  it("extracts data contract audit evidence from the main workspace container", async () => {
    const dataContractAuditPanelPath = new URL("../../../components/sena/workspace/data-contract-audit-panel.tsx", import.meta.url);
    const leftRailPanelPath = new URL("../../../components/sena/workspace/workspace-left-rail-panel-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const leftRailSource = existsSync(leftRailPanelPath) ? readFileSync(leftRailPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(dataContractAuditPanelPath)
      ? await import("../../../components/sena/workspace/data-contract-audit-panel")
      : null;

    expect(existsSync(dataContractAuditPanelPath)).toBe(true);
    expect(existsSync(leftRailPanelPath)).toBe(true);
    expect(workspaceSource).not.toContain("<DataContractAuditPanel");
    expect(leftRailSource).toContain("<DataContractAuditPanel");
    expect(workspaceSource).not.toContain("function DataContractAuditPanel(");
    expect(workspaceSource).not.toContain("Data contract audit");
    expect(workspaceSource).not.toContain("Export data audit");
    expect(boundarySource).toContain('"data-contract-audit-panel"');
    expect(boundaryModule("data-contract-audit-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      DataContractAuditPanel: panelModule?.DataContractAuditPanel
    });
  });

  it("extracts reusable SNA and G contribution statistic tables from the main workspace container", async () => {
    const statsTablesPath = new URL("../../../components/sena/workspace/sena-stats-tables.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const statsTablesModule = existsSync(statsTablesPath)
      ? await import("../../../components/sena/workspace/sena-stats-tables")
      : null;

    expect(existsSync(statsTablesPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<SocialMetricsTable");
    expect(workspaceSource).not.toContain("<CommunityList");
    expect(workspaceSource).not.toContain("<PairContributionTable");
    expect(reportAndStatsDeckSource).toContain("<SocialMetricsTable");
    expect(reportAndStatsDeckSource).toContain("<CommunityList");
    expect(reportAndStatsDeckSource).toContain("<PairContributionTable");
    expect(workspaceSource).not.toContain("function SocialMetricsTable(");
    expect(workspaceSource).not.toContain("function CommunityList(");
    expect(workspaceSource).not.toContain("function PairContributionTable(");
    expect(workspaceSource).not.toContain("Upload interactions to calculate actor-level SNA metrics.");
    expect(boundarySource).toContain('"sena-stats-tables"');
    expect(boundaryModule("sena-stats-tables" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      SocialMetricsTable: statsTablesModule?.SocialMetricsTable,
      CommunityList: statsTablesModule?.CommunityList,
      PairContributionTable: statsTablesModule?.PairContributionTable
    });
  });

  it("extracts the report and stats deck from the main workspace container", async () => {
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const reportAndStatsDeckModule = existsSync(reportAndStatsDeckPath)
      ? await import("../../../components/sena/workspace/workspace-report-and-stats-deck-section")
      : null;

    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).not.toContain("<WorkspaceReportAndStatsDeckSection");
    expect(mainShellSource).toContain("<WorkspaceReportAndStatsDeckSection");
    expect(workspaceSource).not.toContain('id="sena-stats-deck"');
    expect(workspaceSource).not.toContain("<WorkspaceReportSection");
    expect(workspaceSource).not.toContain("Pair Contribution G");
    expect(reportAndStatsDeckSource).toContain('id="sena-stats-deck"');
    expect(reportAndStatsDeckSource).toContain("<WorkspaceReportSection");
    expect(reportAndStatsDeckSource).toContain("Pair Contribution G");
    expect(boundarySource).toContain('"workspace-report-and-stats-deck-section"');
    expect(boundaryModule("workspace-report-and-stats-deck-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceReportAndStatsDeckSection: reportAndStatsDeckModule?.WorkspaceReportAndStatsDeckSection
    });
  });

  it("extracts the main workspace shell layout from the main workspace container", async () => {
    const mainShellPath = new URL("../../../components/sena/workspace/workspace-main-shell-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const mainShellSource = existsSync(mainShellPath) ? readFileSync(mainShellPath, "utf8") : "";
    const mainShellModule = existsSync(mainShellPath)
      ? await import("../../../components/sena/workspace/workspace-main-shell-section")
      : null;

    expect(existsSync(mainShellPath)).toBe(true);
    expect(workspaceSource).toContain("renderWorkspaceMainShell(workspaceMainShellSectionProps)");
    expect(workspaceSource).not.toContain("xl:grid-cols-[4rem_19rem_minmax(0,1fr)_25rem]");
    expect(workspaceSource).not.toContain("<WorkspaceRail active=");
    expect(workspaceSource).not.toContain("<WorkspaceCentralPlotDeck");
    expect(workspaceSource).not.toContain("<WorkspaceRightInspectorColumn");
    expect(workspaceSource).not.toContain("<WorkspaceReportAndStatsDeckSection");
    expect(mainShellSource).toContain('data-theme="light"');
    expect(mainShellSource).toContain("xl:grid-cols-[4rem_minmax(0,1fr)]");
    expect(mainShellSource).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)]");
    expect(mainShellSource).toContain('data-testid="workspace-left-panel-overlay"');
    expect(mainShellSource).toContain('data-testid="workspace-mobile-figure-switcher"');
    expect(mainShellSource).toContain('data-testid="workspace-mobile-figure-fusion"');
    expect(mainShellSource).toContain('data-testid="workspace-mobile-figure-dual"');
    expect(mainShellSource).toContain("<FusionPlotMaximizedOverlay");
    expect(mainShellSource).toContain("<WorkspaceRail");
    expect(mainShellSource).toContain("<WorkspaceCentralPlotDeck");
    expect(mainShellSource).toContain("<WorkspaceRightInspectorColumn");
    expect(mainShellSource).toContain("<WorkspaceReportAndStatsDeckSection");
    expect(boundarySource).toContain('"workspace-main-shell-section"');
    expect(boundaryModule("workspace-main-shell-section" as SenaWorkspaceBoundaryModuleId).role)
      .toBe("Top-level responsive essential workspace shell for header, overlay task rail, Fusion, Dual Lens or selection context, and Research Details.");
    expect(boundaryModule("workspace-main-shell-section" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      WorkspaceMainShellSection: mainShellModule?.WorkspaceMainShellSection
    });
  });

  it("extracts fusion math audit evidence from the main workspace container", async () => {
    const fusionMathAuditPanelPath = new URL("../../../components/sena/workspace/fusion-math-audit-panel.tsx", import.meta.url);
    const methodFormulaPanelPath = new URL("../../../components/sena/workspace/method-formula-panel.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const methodFormulaSource = existsSync(methodFormulaPanelPath) ? readFileSync(methodFormulaPanelPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(fusionMathAuditPanelPath)
      ? await import("../../../components/sena/workspace/fusion-math-audit-panel")
      : null;

    expect(existsSync(fusionMathAuditPanelPath)).toBe(true);
    expect(methodFormulaSource).toContain("<FusionMathAuditPanel");
    expect(workspaceSource).not.toContain("function FusionMathAuditPanel(");
    expect(workspaceSource).not.toContain("Fusion math audit");
    expect(boundarySource).toContain('"fusion-math-audit-panel"');
    expect(boundaryModule("fusion-math-audit-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      FusionMathAuditPanel: panelModule?.FusionMathAuditPanel
    });
  });

  it("extracts SENA method formula and matrix ledger evidence from the main workspace container", async () => {
    const methodFormulaPanelPath = new URL("../../../components/sena/workspace/method-formula-panel.tsx", import.meta.url);
    const rightColumnPath = new URL("../../../components/sena/workspace/workspace-right-inspector-column.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const rightColumnSource = existsSync(rightColumnPath) ? readFileSync(rightColumnPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(methodFormulaPanelPath)
      ? await import("../../../components/sena/workspace/method-formula-panel")
      : null;

    expect(existsSync(methodFormulaPanelPath)).toBe(true);
    expect(rightColumnSource).toContain("<MethodFormulaPanel");
    expect(workspaceSource).not.toContain("function MethodFormulaPanel(");
    expect(workspaceSource).not.toContain('data-testid="live-matrix-ledger"');
    expect(workspaceSource).not.toContain('data-testid="matrix-fingerprint-ledger"');
    expect(boundarySource).toContain('"method-formula-panel"');
    expect(boundaryModule("method-formula-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      MethodFormulaPanel: panelModule?.MethodFormulaPanel
    });
  });

  it("extracts method validation diagnostics from the main workspace container", async () => {
    const methodValidationPanelPath = new URL("../../../components/sena/workspace/method-validation-panel.tsx", import.meta.url);
    const reportAndStatsDeckPath = new URL("../../../components/sena/workspace/workspace-report-and-stats-deck-section.tsx", import.meta.url);
    const workspaceSource = workspaceContainerSource();
    const reportAndStatsDeckSource = existsSync(reportAndStatsDeckPath) ? readFileSync(reportAndStatsDeckPath, "utf8") : "";
    const boundarySource = readFileSync(new URL("../../../components/sena/workspace/module-boundaries.ts", import.meta.url), "utf8");
    const panelModule = existsSync(methodValidationPanelPath)
      ? await import("../../../components/sena/workspace/method-validation-panel")
      : null;

    expect(existsSync(methodValidationPanelPath)).toBe(true);
    expect(existsSync(reportAndStatsDeckPath)).toBe(true);
    expect(workspaceSource).not.toContain("<MethodValidationPanel");
    expect(reportAndStatsDeckSource).toContain("<MethodValidationPanel");
    expect(workspaceSource).not.toContain("function MethodValidationPanel(");
    expect(workspaceSource).not.toContain('data-testid="metric-provenance-panel"');
    expect(workspaceSource).not.toContain("Permutation and Bootstrap Null Models");
    expect(boundarySource).toContain('"method-validation-panel"');
    expect(boundaryModule("method-validation-panel" as SenaWorkspaceBoundaryModuleId).runtimeExports).toMatchObject({
      MethodValidationPanel: panelModule?.MethodValidationPanel
    });
  });

  it("keeps the Temporal Fusion Arc view in a focused workspace module", () => {
    const temporalArc = boundaryModule("temporal-fusion-arc");

    expect(temporalArc.runtimeExports).toMatchObject({
      TemporalFusionArc
    });
    expect(temporalArc.testIds).toContain("temporal-fusion-arc");
    expect(temporalArc.storyPhases).toEqual(["Plan", "Teach", "Reflect"]);
  });
});
