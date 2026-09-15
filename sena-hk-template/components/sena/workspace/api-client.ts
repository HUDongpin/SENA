import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import type { SenaSnapshotRestoreResult } from "@/lib/sena/snapshot-restore";

export const SENA_WORKSPACE_API_ROUTES = {
  auth: {
    csrf: "/api/auth/csrf",
    me: "/api/auth/me",
    logout: "/api/auth/logout",
    mfa: "/api/auth/mfa",
    sessions: "/api/auth/sessions",
    ssoPreflight: "/api/auth/sso?status=1&preflight=1"
  },
  enterprise: {
    analyze: "/api/sena/analyze",
    audit: "/api/sena/governance/audit",
    backup: "/api/sena/governance/backup",
    capabilityAudit: "/api/sena/ops/capability-audit",
    collaboration: (projectId: string) => `/api/sena/projects/${encodeURIComponent(projectId)}/collaboration`,
    collaborationStream: (projectId: string) => `/api/sena/projects/${encodeURIComponent(projectId)}/collaboration/stream`,
    deployment: "/api/sena/ops/deployment",
    expertReview: "/api/sena/validation/expert-review",
    goLiveRehearsal: "/api/sena/ops/go-live-rehearsal",
    health: "/api/sena/governance/health",
    identityProductionEvidence: "/api/sena/ops/identity-production-evidence",
    import: "/api/sena/import",
    invitations: "/api/sena/team/invitations",
    memberships: "/api/sena/team/memberships",
    nativeAdapters: "/api/sena/ops/native-adapters",
    notifications: "/api/sena/notifications",
    opsAlerts: "/api/sena/ops/alerts",
    opsReadiness: "/api/sena/ops/readiness",
    opsStatus: "/api/sena/ops/status",
    platformDecisions: "/api/sena/ops/platform-decisions",
    provisioning: "/api/sena/provisioning",
    project: (projectId: string) => `/api/sena/projects/${encodeURIComponent(projectId)}`,
    projects: "/api/sena/projects",
    releaseGate: "/api/sena/ops/release-gate",
    reliability: "/api/sena/reliability",
    saasOperations: "/api/sena/ops/saas-operations",
    security: "/api/sena/governance/security",
    team: "/api/sena/team",
    uploads: "/api/sena/uploads",
    validationClaimPackage: "/api/sena/validation/claim-package",
    validationGroupComparison: "/api/sena/validation/group-comparison",
    scimUsers: "/api/sena/scim/v2/Users"
  },
  publicationExport: "/api/sena/exports/publication",
  workflows: {
    definitions: "/api/sena/workflows/definitions",
    runs: "/api/sena/workflows/runs",
    run: (runId: string) => `/api/sena/workflows/runs/${encodeURIComponent(runId)}`,
    events: (runId: string) => `/api/sena/workflows/runs/${encodeURIComponent(runId)}/events`,
    actions: (runId: string) => `/api/sena/workflows/runs/${encodeURIComponent(runId)}/actions`,
    closeout: (runId: string) => `/api/sena/workflows/runs/${encodeURIComponent(runId)}/closeout`
  },
  snapshotRestore: "/api/sena/snapshot/restore",
  pilotSample: "/sena-pilot/sample/lesson-study-sena-contract.json"
} as const;

export type SenaWorkspaceApiRoute = string;
export type SenaWorkspaceApiQueryValue = string | number | boolean | null | undefined;
export type SenaWorkspaceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class SenaWorkspaceApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly payload: unknown;

  constructor(message: string, input: { status: number; statusText: string; url: string; payload: unknown }) {
    super(message);
    this.name = "SenaWorkspaceApiError";
    this.status = input.status;
    this.statusText = input.statusText;
    this.url = input.url;
    this.payload = input.payload;
  }
}

export function buildEnterpriseTeamQuery(teamId?: string, prefix = "?") {
  return teamId ? `${prefix}teamId=${encodeURIComponent(teamId)}` : "";
}

export function buildEnterpriseExpertReviewQuery(input: { teamId?: string; projectId?: string }) {
  const params = new URLSearchParams();
  if (input.teamId) params.set("teamId", input.teamId);
  if (input.projectId) params.set("projectId", input.projectId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function buildSenaWorkspaceApiUrl(
  route: SenaWorkspaceApiRoute,
  query: Record<string, SenaWorkspaceApiQueryValue> = {}
) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const queryString = params.toString();
  if (!queryString) return route;
  return `${route}${route.includes("?") ? "&" : "?"}${queryString}`;
}

async function readSenaWorkspaceResponseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getSenaWorkspaceErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return fallback;
}

export async function requestSenaWorkspaceJson<T>(
  url: string,
  init?: RequestInit,
  options: { errorMessage?: string; fetchImpl?: SenaWorkspaceFetch } = {}
): Promise<T> {
  const response = await (options.fetchImpl ?? fetch)(url, init);
  const payload = await readSenaWorkspaceResponseJson(response);
  if (!response.ok) {
    throw new SenaWorkspaceApiError(
      getSenaWorkspaceErrorMessage(payload, options.errorMessage ?? `SENA workspace API request failed with ${response.status}.`),
      {
        status: response.status,
        statusText: response.statusText,
        url,
        payload
      }
    );
  }
  return payload as T;
}

export async function requestSenaSnapshotRestore(
  source: unknown,
  options: { fetchImpl?: SenaWorkspaceFetch } = {}
) {
  return requestSenaWorkspaceJson<SenaSnapshotRestoreResult>(SENA_WORKSPACE_API_ROUTES.snapshotRestore, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreRequest,
      source
    })
  }, {
    fetchImpl: options.fetchImpl,
    errorMessage: "SENA snapshot restore validation failed."
  });
}
