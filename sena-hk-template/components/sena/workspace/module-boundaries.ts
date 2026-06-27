import {
  buildSenaModel,
  buildSenaReport,
  importSenaJsonContract
} from "./analysis-runtime";
import {
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import {
  createTeamInvitationAction,
  deliverEnterpriseNotificationsAction,
  startEnterpriseMfaSetupAction
} from "./enterprise-actions";
import {
  exportEnterpriseJsonArtifactAction,
  submitEnterpriseReleaseGateReviewAction
} from "./enterprise-ops-actions";
import { ReportGenerator } from "./report-generator";
import type {
  EnterpriseContext,
  EnterpriseCsrfToken,
  EnterprisePlatformDecisionState,
  EnterpriseReleaseGateState,
  EnterpriseTeamState
} from "./enterprise-contracts";
import {
  enterprisePlatformDecisionOptions,
  enterpriseSsoProviderOptions,
  enterpriseValidationMetrics
} from "./enterprise-options";
import { TemporalFusionArc } from "./temporal-fusion-arc";
import { useEnterpriseWorkspaceApi } from "./use-enterprise-runtime";

type EnterpriseWorkspaceContractTypeExports = {
  EnterpriseContext: EnterpriseContext;
  EnterpriseCsrfToken: EnterpriseCsrfToken;
  EnterprisePlatformDecisionState: EnterprisePlatformDecisionState;
  EnterpriseReleaseGateState: EnterpriseReleaseGateState;
  EnterpriseTeamState: EnterpriseTeamState;
};

type SenaWorkspaceRefreshContractState =
  | "EnterpriseTeamState"
  | "EnterprisePlatformDecisionState"
  | "EnterpriseReleaseGateState";

export type SenaWorkspaceBoundaryModuleId =
  | "analysis-runtime"
  | "enterprise-contracts"
  | "enterprise-options"
  | "api-client"
  | "use-enterprise-runtime"
  | "enterprise-actions"
  | "enterprise-ops-actions"
  | "report-generator"
  | "temporal-fusion-arc";

export type SenaWorkspaceBoundaryModule = {
  id: SenaWorkspaceBoundaryModuleId;
  path: `./${string}`;
  role: string;
  containerResponsibilities: readonly string[];
  runtimeExports?: Readonly<Record<string, unknown>>;
  typeExports?: readonly (keyof EnterpriseWorkspaceContractTypeExports)[];
  ownedState?: readonly (keyof EnterpriseWorkspaceContractTypeExports)[];
  testIds?: readonly string[];
  storyPhases?: readonly string[];
};

export type SenaWorkspaceModuleBoundaryManifest = {
  container: {
    id: "SenaFusionWorkspace";
    delegatedModules: readonly SenaWorkspaceBoundaryModuleId[];
    directFetchPolicy: "forbidden";
    requestTokenState: "delegated-to-runtime-hook";
    sizeBudget: {
      observedLines: number;
      maxLinesBeforeNextExtraction: number;
      nextExtractionTarget: string;
      nextExtractionCandidates: readonly string[];
    };
    refreshContracts: readonly {
      state: SenaWorkspaceRefreshContractState;
      route: string;
      transport: "requestSenaWorkspaceJson";
    }[];
  };
  modules: readonly SenaWorkspaceBoundaryModule[];
};

const enterpriseContractTypeExports = [
  "EnterpriseContext",
  "EnterprisePlatformDecisionState",
  "EnterpriseReleaseGateState",
  "EnterpriseTeamState"
] as const satisfies ReadonlyArray<keyof EnterpriseWorkspaceContractTypeExports>;

export const SENA_WORKSPACE_MODULE_BOUNDARIES = {
  container: {
    id: "SenaFusionWorkspace",
    delegatedModules: [
      "enterprise-contracts",
      "enterprise-options",
      "analysis-runtime",
      "api-client",
      "use-enterprise-runtime",
      "enterprise-actions",
      "enterprise-ops-actions",
      "report-generator",
      "temporal-fusion-arc"
    ],
    directFetchPolicy: "forbidden",
    requestTokenState: "delegated-to-runtime-hook",
    sizeBudget: {
      observedLines: 10860,
      maxLinesBeforeNextExtraction: 11000,
      nextExtractionTarget: "enterprise-ops-and-go-live-panel",
      nextExtractionCandidates: [
        "enterprise ops export controls",
        "go-live rehearsal and attestation panel",
        "governance and notification panels",
        "import/upload storage controls"
      ]
    },
    refreshContracts: [
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
    ]
  },
  modules: [
    {
      id: "enterprise-contracts",
      path: "./enterprise-contracts",
      role: "Typed enterprise response contracts consumed by the workspace container.",
      typeExports: enterpriseContractTypeExports,
      containerResponsibilities: [
        "consume imported enterprise response types",
        "avoid redeclaring enterprise response contracts inline"
      ]
    },
    {
      id: "enterprise-options",
      path: "./enterprise-options",
      role: "Enterprise select-list and metric option collections.",
      runtimeExports: {
        enterprisePlatformDecisionOptions,
        enterpriseSsoProviderOptions,
        enterpriseValidationMetrics
      },
      containerResponsibilities: [
        "render imported option collections",
        "avoid declaring enterprise option arrays inline"
      ]
    },
    {
      id: "analysis-runtime",
      path: "./analysis-runtime",
      role: "Client-safe SENA runtime adapter that imports concrete analysis modules instead of the lib/sena barrel.",
      runtimeExports: {
        buildSenaModel,
        buildSenaReport,
        importSenaJsonContract
      },
      containerResponsibilities: [
        "call imported runtime adapter functions",
        "avoid importing from the lib/sena barrel in client workspace modules"
      ]
    },
    {
      id: "api-client",
      path: "./api-client",
      role: "Centralized workspace route literals, URL builders, and JSON transport.",
      runtimeExports: {
        requestSenaWorkspaceJson,
        SENA_WORKSPACE_API_ROUTES
      },
      containerResponsibilities: [
        "call requestSenaWorkspaceJson for refresh reads",
        "avoid direct fetch calls in the main container"
      ]
    },
    {
      id: "use-enterprise-runtime",
      path: "./use-enterprise-runtime",
      role: "Client hook that owns enterprise CSRF token state and secure request headers.",
      runtimeExports: {
        useEnterpriseWorkspaceApi
      },
      ownedState: ["EnterpriseCsrfToken"],
      containerResponsibilities: [
        "call useEnterpriseWorkspaceApi",
        "reset CSRF state through resetEnterpriseCsrfToken"
      ]
    },
    {
      id: "enterprise-actions",
      path: "./enterprise-actions",
      role: "Typed identity, team, upload, project, reliability, and validation action helpers.",
      runtimeExports: {
        createTeamInvitationAction,
        deliverEnterpriseNotificationsAction,
        startEnterpriseMfaSetupAction
      },
      containerResponsibilities: [
        "call typed enterprise action helpers",
        "avoid inline identity/team request bodies"
      ]
    },
    {
      id: "enterprise-ops-actions",
      path: "./enterprise-ops-actions",
      role: "Typed governance, deployment, backup, audit, and release-gate action helpers.",
      runtimeExports: {
        exportEnterpriseJsonArtifactAction,
        submitEnterpriseReleaseGateReviewAction
      },
      containerResponsibilities: [
        "call typed enterprise ops action helpers",
        "avoid inline governance/deployment request bodies"
      ]
    },
    {
      id: "report-generator",
      path: "./report-generator",
      role: "Report, readiness, reliability, and publication export panel implementation.",
      runtimeExports: {
        ReportGenerator
      },
      containerResponsibilities: [
        "render ReportGenerator with prepared audits and export callbacks",
        "avoid keeping report gate JSX in the main workspace container"
      ]
    },
    {
      id: "temporal-fusion-arc",
      path: "./temporal-fusion-arc",
      role: "Temporal Fusion Arc visualization component for Plan, Teach, Reflect traces.",
      runtimeExports: {
        TemporalFusionArc
      },
      testIds: ["temporal-fusion-arc"],
      storyPhases: ["Plan", "Teach", "Reflect"],
      containerResponsibilities: [
        "render imported TemporalFusionArc",
        "keep temporal story-view implementation out of the main container"
      ]
    }
  ]
} as const satisfies SenaWorkspaceModuleBoundaryManifest;
