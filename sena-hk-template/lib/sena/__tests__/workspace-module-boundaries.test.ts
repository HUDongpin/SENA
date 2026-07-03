import { readFileSync } from "node:fs";
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
import {
  SENA_WORKSPACE_MODULE_BOUNDARIES,
  type SenaWorkspaceBoundaryModule,
  type SenaWorkspaceBoundaryModuleId
} from "../../../components/sena/workspace/module-boundaries";
import { SenaFusionWorkspaceLoader } from "../../../components/sena/SenaFusionWorkspaceLoader";
import { ReportGenerator } from "../../../components/sena/workspace/report-generator";
import { TemporalFusionArc } from "../../../components/sena/workspace/temporal-fusion-arc";
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

describe("SENA workspace module boundaries", () => {
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
      "use-enterprise-runtime",
      "enterprise-actions",
      "enterprise-ops-actions",
      "report-generator",
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

  it("keeps the main workspace container under an explicit extraction budget", () => {
    const workspaceSource = readFileSync(new URL("../../../components/sena/SenaFusionWorkspace.tsx", import.meta.url), "utf8");
    const lineCount = workspaceSource.split(/\r?\n/).length;
    const budget = SENA_WORKSPACE_MODULE_BOUNDARIES.container.sizeBudget;

    expect(lineCount).toBeLessThanOrEqual(budget.maxLinesBeforeNextExtraction);
    expect(budget.observedLines).toBeGreaterThanOrEqual(10000);
    expect(budget.nextExtractionTarget).toBe("enterprise-ops-and-go-live-panel");
    expect(budget.nextExtractionCandidates).toContain("go-live rehearsal and attestation panel");
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

  it("keeps the Temporal Fusion Arc view in a focused workspace module", () => {
    const temporalArc = boundaryModule("temporal-fusion-arc");

    expect(temporalArc.runtimeExports).toMatchObject({
      TemporalFusionArc
    });
    expect(temporalArc.testIds).toContain("temporal-fusion-arc");
    expect(temporalArc.storyPhases).toEqual(["Plan", "Teach", "Reflect"]);
  });
});
