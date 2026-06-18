import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFileEnterpriseStateStore } from "../enterprise";
import {
  createEnterpriseStateStore,
  type SenaEnterpriseStateStore
} from "../enterprise/state";
import {
  loginEnterpriseUser,
  registerEnterpriseUser,
  senaSessionCookieName
} from "../enterprise/identity-auth";
import {
  createEnterpriseProject,
  listEnterpriseProjects
} from "../enterprise/team-project";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseGoLiveRehearsal
} from "../enterprise/ops-governance";
import type { SenaEnterpriseDb } from "../enterprise";

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return collectRouteFiles(absolute);
    return entry === "route.ts" ? [absolute] : [];
  });
}

function emptyEnterpriseDb(): SenaEnterpriseDb {
  return {
    schemaVersion: "sena-enterprise-db/v1",
    users: [],
    teams: [],
    memberships: [],
    invitations: [],
    sessions: [],
    ssoStates: [],
    authLockouts: [],
    apiRateLimits: [],
    mfaFactors: [],
    mfaSetups: [],
    mfaChallenges: [],
    passwordResetRequests: [],
    uploads: [],
    importRuns: [],
    analysisRuns: [],
    projects: [],
    projectRevisions: [],
    projectComments: [],
    projectPresence: [],
    adjudications: [],
    collaborationEvents: [],
    reliabilityRuns: [],
    validationRuns: [],
    expertReviews: [],
    platformDecisionAcceptances: [],
    releaseGateReviews: [],
    postCutoverObservations: [],
    goLiveAttestations: [],
    notifications: [],
    emailDeliveries: [],
    auditLog: []
  };
}

describe("SENA enterprise module boundaries", () => {
  it("exposes domain modules for identity, project, and ops callers", () => {
    expect(senaSessionCookieName).toBe("sena_session");
    expect(registerEnterpriseUser).toBeTypeOf("function");
    expect(loginEnterpriseUser).toBeTypeOf("function");
    expect(createEnterpriseProject).toBeTypeOf("function");
    expect(listEnterpriseProjects).toBeTypeOf("function");
    expect(getEnterpriseDeploymentReadiness).toBeTypeOf("function");
    expect(getEnterpriseGoLiveRehearsal).toBeTypeOf("function");
    expect(createFileEnterpriseStateStore).toBeTypeOf("function");
  });

  it("keeps API routes off the monolithic enterprise facade", () => {
    const routeFiles = collectRouteFiles(path.join(process.cwd(), "app", "api"));
    const facadeImports = routeFiles.filter((file) => (
      /from\s+"@\/lib\/sena\/enterprise";/.test(readFileSync(file, "utf8"))
    ));

    expect(facadeImports).toEqual([]);
  });

  it("wraps enterprise persistence behind an explicit state store seam", () => {
    let current = emptyEnterpriseDb();
    const writes: string[] = [];
    const saves: string[] = [];
    const store: SenaEnterpriseStateStore = createEnterpriseStateStore({
      read: () => current,
      write: (next) => {
        writes.push(next.schemaVersion);
        current = next;
      },
      save: (next) => {
        saves.push(next.schemaVersion);
        current = next;
      }
    });

    const first = store.read();
    store.write({ ...first, teams: [{ id: "team_1" } as never] });
    store.save({ ...store.read(), users: [{ id: "user_1" } as never] });

    expect(store.kind).toBe("synchronous-enterprise-state-store");
    expect(current.teams).toHaveLength(1);
    expect(current.users).toHaveLength(1);
    expect(writes).toEqual(["sena-enterprise-db/v1"]);
    expect(saves).toEqual(["sena-enterprise-db/v1"]);
  });
});
