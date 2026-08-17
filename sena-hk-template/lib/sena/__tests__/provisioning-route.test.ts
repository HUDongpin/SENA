import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * FA22-03 — /api/sena/provisioning POST + GET.
 *
 * The handlers in app/api/sena/provisioning/route.ts had never been invoked by
 * any test: commit 3f5632a moved the POST onto the async primary-state path
 * with only lib-level coverage behind it. These cases call the real exported
 * handlers and assert status AND body shape, plus the state each call did (or
 * must not have) left behind.
 */

const provisioningEndpoint = "https://sena.example.test/api/sena/provisioning";
const provisioningToken = "sena-test-provisioning-token";

type ProvisioningResultBody = {
  schemaVersion?: string;
  generatedAt?: string;
  dryRun?: boolean;
  source?: string;
  organization?: string;
  summary?: {
    teamsCreated?: number;
    teamsUpdated?: number;
    usersCreated?: number;
    usersUpdated?: number;
    membershipsCreated?: number;
    membershipsUpdated?: number;
  };
  teams?: Array<{ id?: string; externalId?: string; name?: string; status?: string; archival?: string }>;
  users?: Array<{ id?: string; externalId?: string; emailHash?: string; emailDomain?: string; status?: string }>;
  memberships?: Array<{ id?: string; teamId?: string; userId?: string; role?: string; status?: string; change?: string }>;
  error?: string;
  code?: string;
};

type ProvisioningStatusBody = {
  schemaVersion?: string;
  configured?: boolean;
  auth?: string;
  endpoint?: string;
  supports?: string[];
  error?: string;
  code?: string;
};

type ProvisioningRoutes = {
  route: typeof import("../../../app/api/sena/provisioning/route");
  provisioning: typeof import("../enterprise/provisioning");
  state: typeof import("../enterprise/state");
};

/**
 * Same temp-dir + stubbed-token + aliased-module harness the SCIM route suites
 * use: the route imports `@/lib/sena/*`, so those aliases have to resolve to the
 * very module instances this test reads state back through, or "nothing was
 * persisted" would be asserted against a different store than the one the
 * handler wrote to.
 *
 * `token: null` drives the SENA_PROVISIONING_TOKEN-unset branch.
 */
async function withProvisioningRoute<T>(
  prefix: string,
  options: { token?: string | null },
  run: (routes: ProvisioningRoutes) => Promise<T>
) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  vi.resetModules();
  if (options.token === null) {
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "");
  } else {
    vi.stubEnv("SENA_PROVISIONING_TOKEN", options.token ?? provisioningToken);
  }
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_APP_URL = "https://sena.example.test";
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/enterprise/errors", async () => await import("../enterprise/errors"));
  vi.doMock("@/lib/sena/enterprise/provisioning", async () => await import("../enterprise/provisioning"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
  vi.doMock("@/lib/sena/schema-registry", async () => await import("../schema-registry"));

  try {
    return await run({
      route: await import("../../../app/api/sena/provisioning/route"),
      provisioning: await import("../enterprise/provisioning"),
      state: await import("../enterprise/state")
    });
  } finally {
    vi.unstubAllEnvs();
    delete process.env.SENA_APP_URL;
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.resetModules();
  }
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const postRequest = (body: unknown, headers: Record<string, string> = bearer(provisioningToken)) =>
  new Request(provisioningEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

const getRequest = (headers: Record<string, string> = bearer(provisioningToken)) =>
  new Request(provisioningEndpoint, { headers });

const cohortBody = (organization: string) => ({
  source: "api" as const,
  organization,
  teams: [{ externalId: "idp-group-cohort", name: "Provisioning Cohort", plan: "enterprise" as const }],
  users: [
    {
      externalId: "idp-user-pi",
      email: "provisioning-pi@example.edu",
      name: "Provisioning PI",
      sso: { provider: "institution" as const, subject: "idp-user-pi" },
      memberships: [{ teamExternalId: "idp-group-cohort", role: "pi" as const }]
    },
    {
      externalId: "idp-user-coder",
      email: "provisioning-coder@example.edu",
      name: "Provisioning Coder",
      memberships: [{ teamExternalId: "idp-group-cohort", role: "coder" as const }]
    }
  ]
});

/** What the primary store holds right now, read through the same modules the route wrote through. */
async function primarySnapshot(state: ProvisioningRoutes["state"]) {
  const read = await state.readEnterpriseState();
  return {
    users: read.db.users.map((user) => user.email).sort(),
    teams: read.db.teams.map((team) => team.name).sort(),
    memberships: read.db.memberships.map((membership) => `${membership.teamId}:${membership.userId}:${membership.role}`).sort(),
    provisioningAudits: read.db.auditLog.filter((entry) => entry.event === "provisioning.sync").length
  };
}

describe("SENA provisioning route POST", () => {
  it("answers a dry run with the full provisioning result and persists nothing", async () => {
    await withProvisioningRoute("sena-provisioning-route-dry-run-", {}, async ({ route, provisioning, state }) => {
      const before = await primarySnapshot(state);
      expect(before).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });

      const response = await route.POST(postRequest({ ...cohortBody("SENA Dry Run Org"), dryRun: true }));
      const body = await response.json() as ProvisioningResultBody;

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-provisioning");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");

      // The answer is the real provisioning result, not a stub: an operator
      // reads these counts to decide whether to run the sync for real.
      expect(body.schemaVersion).toBe("sena-enterprise-provisioning/v1");
      expect(body.dryRun).toBe(true);
      expect(body.source).toBe("api");
      expect(body.organization).toBe("SENA Dry Run Org");
      expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.summary).toEqual({
        teamsCreated: 1,
        teamsUpdated: 0,
        usersCreated: 2,
        usersUpdated: 0,
        membershipsCreated: 2,
        membershipsUpdated: 0
      });
      expect(body.teams).toEqual([
        expect.objectContaining({ externalId: "idp-group-cohort", name: "Provisioning Cohort", status: "created" })
      ]);
      expect(body.users?.map((user) => user.externalId)).toEqual(["idp-user-pi", "idp-user-coder"]);
      expect(body.users?.every((user) => user.status === "created")).toBe(true);
      // The result is hashed rather than raw: a provisioning response that
      // echoed addresses back would put PII in every IdP's request log.
      expect(body.users?.every((user) => /^[a-f0-9]{64}$/.test(String(user.emailHash)))).toBe(true);
      expect(body.users?.map((user) => user.emailDomain)).toEqual(["example.edu", "example.edu"]);
      expect(JSON.stringify(body)).not.toContain("provisioning-pi@example.edu");
      expect(body.memberships?.map((membership) => membership.role).sort()).toEqual(["coder", "pi"]);
      expect(body.memberships?.every((membership) => membership.change === "created" && membership.status === "active")).toBe(true);

      // The whole point of a dry run: the primary is exactly as it was, and no
      // audit entry claims a sync happened.
      expect(await primarySnapshot(state)).toEqual(before);
      const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("api");
      expect(directory.users).toEqual([]);
      expect(directory.teams).toEqual([]);
    });
  });

  it("provisions teams, users, and memberships for real and lands them in the primary", async () => {
    await withProvisioningRoute("sena-provisioning-route-commit-", {}, async ({ route, provisioning, state }) => {
      const response = await route.POST(postRequest(cohortBody("SENA Commit Org")));
      const body = await response.json() as ProvisioningResultBody;

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-provisioning");
      expect(body.schemaVersion).toBe("sena-enterprise-provisioning/v1");
      expect(body.dryRun).toBe(false);
      expect(body.summary).toEqual({
        teamsCreated: 1,
        teamsUpdated: 0,
        usersCreated: 2,
        usersUpdated: 0,
        membershipsCreated: 2,
        membershipsUpdated: 0
      });

      const teamId = String(body.teams?.[0]?.id);
      const userIds = body.users?.map((user) => String(user.id)) ?? [];
      expect(teamId).toMatch(/^team_[a-f0-9]{24}$/);
      expect(userIds.every((id) => /^user_[a-f0-9]{24}$/.test(id))).toBe(true);
      expect(body.memberships?.map((membership) => membership.teamId)).toEqual([teamId, teamId]);
      expect(body.memberships?.map((membership) => membership.userId)).toEqual(userIds);

      // The ids in the 200 have to name rows that exist, or an IdP that stores
      // them is holding dangling references.
      const after = await primarySnapshot(state);
      expect(after.users).toEqual(["provisioning-coder@example.edu", "provisioning-pi@example.edu"]);
      expect(after.teams).toEqual(["Provisioning Cohort"]);
      expect(after.memberships).toEqual([
        `${teamId}:${userIds[1]}:coder`,
        `${teamId}:${userIds[0]}:pi`
      ].sort());
      expect(after.provisioningAudits).toBe(1);

      const read = await state.readEnterpriseState();
      const storedTeam = read.db.teams.find((team) => team.id === teamId);
      expect(storedTeam?.provisioning).toEqual(expect.objectContaining({ source: "api", externalId: "idp-group-cohort" }));
      expect(read.db.users.find((user) => user.id === userIds[0])?.ssoIdentities)
        .toEqual([expect.objectContaining({ provider: "institution", subject: "idp-user-pi" })]);

      const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("api");
      expect(directory.users.map((user) => user.email).sort())
        .toEqual(["provisioning-coder@example.edu", "provisioning-pi@example.edu"]);
      expect(directory.teams.map((team) => team.name)).toEqual(["Provisioning Cohort"]);

      // A re-sync of the same payload is an update, not a duplicate org.
      const resync = await route.POST(postRequest(cohortBody("SENA Commit Org")));
      const resyncBody = await resync.json() as ProvisioningResultBody;
      expect(resync.status).toBe(200);
      expect(resyncBody.summary).toEqual({
        teamsCreated: 0,
        teamsUpdated: 1,
        usersCreated: 0,
        usersUpdated: 2,
        membershipsCreated: 0,
        membershipsUpdated: 2
      });
      const afterResync = await primarySnapshot(state);
      expect(afterResync.users).toEqual(after.users);
      expect(afterResync.teams).toEqual(after.teams);
      expect(afterResync.memberships).toEqual(after.memberships);
    });
  });

  it("refuses a domain-invalid provisioning body with a 400 and writes nothing", async () => {
    await withProvisioningRoute("sena-provisioning-route-invalid-", {}, async ({ route, state }) => {
      const refusals = [
        { label: "blank organization", body: { organization: "   " }, code: "invalid_provisioning_organization" },
        {
          label: "unsupported plan",
          body: { organization: "SENA Invalid Org", teams: [{ name: "Bad Plan", plan: "platinum" }] },
          code: "invalid_provisioning_plan"
        },
        {
          label: "email without @",
          body: { organization: "SENA Invalid Org", users: [{ email: "not-an-email" }] },
          code: "invalid_provisioning_email"
        },
        {
          label: "membership role SENA does not define",
          body: {
            organization: "SENA Invalid Org",
            teams: [{ name: "Role Cohort" }],
            users: [{ email: "role@example.edu", memberships: [{ teamName: "Role Cohort", role: "superuser" }] }]
          },
          code: "invalid_provisioning_role"
        },
        {
          label: "team with no active manager",
          body: {
            organization: "SENA Invalid Org",
            teams: [{ name: "Manager Cohort" }],
            users: [{ email: "coder@example.edu", memberships: [{ teamName: "Manager Cohort", role: "coder" }] }]
          },
          code: "provisioning_team_manager_required"
        }
      ];

      for (const { label, body, code } of refusals) {
        const response = await route.POST(postRequest(body));
        const parsed = await response.json() as ProvisioningResultBody;
        expect([label, response.status]).toEqual([label, 400]);
        expect([label, parsed.code]).toEqual([label, code]);
        expect([label, typeof parsed.error]).toEqual([label, "string"]);
        expect([label, response.headers.get("x-sena-observed-status-class")]).toEqual([label, "4xx"]);
      }

      // A refused sync must not half-apply: the "team with no active manager"
      // case in particular is refused only at the end, after the team and user
      // rows have already been mutated in the in-memory db.
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });
    });
  });

  it("refuses a malformed or structurally-invalid body with a 400 and writes nothing", async () => {
    await withProvisioningRoute("sena-provisioning-route-body-shape-", {}, async ({ route, state }) => {
      // Every one of these is a caller error and belongs in the 4xx family. The
      // status is the whole defect: every standard IdP/webhook retry policy
      // treats a 5xx as retryable, so a permanently-broken body was retried on
      // backoff forever, never surfaced the misconfiguration to the
      // integration's operator, and filed a 5xx sample against the provisioning
      // error budget on every attempt.
      //
      // The organization rows also close an incoherence: a *blank* organization
      // was already refused with 400 invalid_provisioning_organization
      // (asserted above) while an absent or non-string one on the very same
      // field fell through to a 5xx.
      const bad = [
        { label: "unparseable JSON", body: "{not json", code: "invalid_provisioning_body" },
        { label: "empty body", body: "", code: "invalid_provisioning_body" },
        { label: "JSON null", body: "null", code: "invalid_provisioning_body" },
        { label: "JSON array", body: "[]", code: "invalid_provisioning_body" },
        { label: "JSON scalar", body: "42", code: "invalid_provisioning_body" },
        { label: "object with no organization", body: {}, code: "invalid_provisioning_organization" },
        { label: "organization present but not a string", body: { organization: 123 }, code: "invalid_provisioning_organization" },
        { label: "well-formed teams with no organization", body: { teams: [{ name: "Orphan Cohort" }] }, code: "invalid_provisioning_organization" },
        // The reported case: an IdP whose template misnames the organization
        // field posts a body of unknown keys only.
        { label: "nothing but unknown keys", body: { orgnisation: "SENA Typo Org", sync: true }, code: "invalid_provisioning_organization" },
        {
          label: "teams that is not an array",
          body: { organization: "SENA Shape Org", teams: "Cohort" },
          code: "invalid_provisioning_body"
        },
        {
          label: "team entry that is not an object",
          body: { organization: "SENA Shape Org", teams: ["Cohort"] },
          code: "invalid_provisioning_body"
        },
        {
          label: "team with no name",
          body: { organization: "SENA Shape Org", teams: [{ externalId: "idp-group-cohort" }] },
          code: "invalid_provisioning_team"
        },
        {
          label: "team name that is not a string",
          body: { organization: "SENA Shape Org", teams: [{ name: 7 }] },
          code: "invalid_provisioning_team"
        },
        {
          // Same coercion class as dryRun: `archived` is read as === true /
          // === false, so a stringly-typed flag silently retired nothing while
          // the caller was answered 200.
          label: "team archived that is not a boolean",
          body: { organization: "SENA Shape Org", teams: [{ name: "Archive Cohort", archived: "true" }] },
          code: "invalid_provisioning_team"
        },
        {
          label: "users that is not an array",
          body: { organization: "SENA Shape Org", users: { email: "solo@example.edu" } },
          code: "invalid_provisioning_body"
        },
        {
          label: "user with no email",
          body: { organization: "SENA Shape Org", users: [{ name: "No Email" }] },
          code: "invalid_provisioning_email"
        },
        {
          label: "user email that is not a string",
          body: { organization: "SENA Shape Org", users: [{ email: 42 }] },
          code: "invalid_provisioning_email"
        },
        {
          label: "user name that is not a string",
          body: { organization: "SENA Shape Org", users: [{ email: "shape@example.edu", name: 42 }] },
          code: "invalid_provisioning_user"
        },
        {
          label: "memberships that is not an array",
          body: { organization: "SENA Shape Org", users: [{ email: "shape@example.edu", memberships: "pi" }] },
          code: "invalid_provisioning_body"
        },
        {
          label: "membership teamName that is not a string",
          body: {
            organization: "SENA Shape Org",
            users: [{ email: "shape@example.edu", memberships: [{ teamName: 9, role: "pi" }] }]
          },
          code: "invalid_provisioning_membership"
        },
        {
          label: "sso subject that is not a string",
          body: {
            organization: "SENA Shape Org",
            users: [{ email: "shape@example.edu", sso: { provider: "institution", subject: 9 } }]
          },
          code: "invalid_provisioning_sso_subject"
        }
      ];

      for (const { label, body, code } of bad) {
        const response = await route.POST(postRequest(body));
        const parsed = await response.json() as ProvisioningResultBody;
        expect([label, response.status]).toEqual([label, 400]);
        expect([label, parsed.code]).toEqual([label, code]);
        expect([label, typeof parsed.error]).toEqual([label, "string"]);
        // 4xx is what tells an IdP's retry policy to stop and alert its
        // operator instead of retrying a body that can never succeed.
        expect([label, response.headers.get("x-sena-observed-status-class")]).toEqual([label, "4xx"]);
      }

      // The refusal carries SENA's own wording. The 500 it replaces forwarded
      // the raw JavaScript TypeError ("input.organization.trim is not a
      // function"), handing an internal source expression to the caller;
      // lib/sena/enterprise/errors.ts has since redacted whatever still reaches
      // that exit, and a refusal SENA authored never goes near it.
      const refused = await route.POST(postRequest({ organization: 123 }));
      const refusedBody = await refused.json() as ProvisioningResultBody;
      expect(refusedBody.error).toBe("Provisioning requires an organization name.");
      expect(String(refusedBody.error)).not.toMatch(/is not a function|TypeError|SyntaxError|input\./);

      // Refused before anything is touched: nothing half-applied.
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });

      // ...and a well-formed body on the same harness still provisions, so the
      // refusals above are the validation's doing and not a broken fixture.
      const accepted = await route.POST(postRequest(cohortBody("SENA Shape Org")));
      expect(accepted.status).toBe(200);
      expect((await accepted.json() as ProvisioningResultBody).summary?.usersCreated).toBe(2);
    });
  });

  it("refuses a non-boolean dryRun with a 400 instead of reading it as truthiness", async () => {
    await withProvisioningRoute("sena-provisioning-route-dryrun-shape-", {}, async ({ route, state }) => {
      // `Boolean(input.dryRun)` read every non-empty string as "dry run". A
      // caller that spells the flag out — a shell/curl template, a form-encoded
      // proxy, a config value read as text — asks explicitly for a real sync,
      // and was answered 200 with full "created" counts while nothing was
      // written, so an integration gating on status filed the sync as complete.
      // Every other unsupported value on this surface (plan, role, membership
      // status, user status, SSO provider) already earns an explicit 400.
      const refusals: Array<[string, unknown]> = [
        ["string false", "false"],
        ["string true", "true"],
        ["string no", "no"],
        ["empty string", ""],
        ["zero", 0],
        ["one", 1],
        ["null", null],
        ["empty array", []],
        ["empty object", {}]
      ];

      for (const [label, dryRun] of refusals) {
        const response = await route.POST(postRequest({ ...cohortBody("SENA Coercion Org"), dryRun }));
        const parsed = await response.json() as ProvisioningResultBody;
        expect([label, response.status]).toEqual([label, 400]);
        expect([label, parsed.code]).toEqual([label, "invalid_provisioning_dry_run"]);
        expect([label, response.headers.get("x-sena-observed-status-class")]).toEqual([label, "4xx"]);
        // No provisioning result at all — in particular no created-counts
        // summary an integration could read as a completed sync.
        expect([label, parsed.dryRun]).toEqual([label, undefined]);
        expect([label, parsed.summary]).toEqual([label, undefined]);
      }
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });

      // The real booleans keep their meaning on both sides.
      const dryRun = await route.POST(postRequest({ ...cohortBody("SENA Coercion Org"), dryRun: true }));
      expect(dryRun.status).toBe(200);
      expect((await dryRun.json() as ProvisioningResultBody).dryRun).toBe(true);
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });

      const committed = await route.POST(postRequest({ ...cohortBody("SENA Coercion Org"), dryRun: false }));
      expect(committed.status).toBe(200);
      expect((await committed.json() as ProvisioningResultBody).dryRun).toBe(false);
      expect((await primarySnapshot(state)).users).toHaveLength(2);
    });
  });

  it("refuses an unrecognised source with a 400 while an absent one still defaults to \"api\"", async () => {
    await withProvisioningRoute("sena-provisioning-route-source-shape-", {}, async ({ route, provisioning, state }) => {
      // `source` decides which directory owns the rows, and
      // listEnterpriseProvisioningDirectory filters on it. Rewriting "scim-v2"
      // to "api" answered 200 while the SCIM directory the integration reads
      // back stayed empty, so its next correctly-spelled sync matched nothing
      // and created the same teams, users and memberships a second time under
      // the other tag.
      for (const [label, source] of [
        ["misspelled scim", "scim-v2"],
        ["case-shifted", "SCIM"],
        ["padded", " api "],
        ["null", null],
        ["numeric", 7]
      ] as Array<[string, unknown]>) {
        const response = await route.POST(postRequest({ ...cohortBody("SENA Source Org"), source }));
        const parsed = await response.json() as ProvisioningResultBody;
        expect([label, response.status]).toEqual([label, 400]);
        expect([label, parsed.code]).toEqual([label, "invalid_provisioning_source"]);
        expect([label, response.headers.get("x-sena-observed-status-class")]).toEqual([label, "4xx"]);
        expect([label, parsed.source]).toEqual([label, undefined]);
      }

      // Nothing landed under either tag, so there is nothing for the corrected
      // sync to duplicate.
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });
      expect((await provisioning.listEnterpriseProvisioningDirectoryAsync("scim")).users).toEqual([]);
      expect((await provisioning.listEnterpriseProvisioningDirectoryAsync("api")).users).toEqual([]);

      // An absent source is not an invalid one: a POST that never names a
      // source keeps the documented "api" default. (The SCIM bridge in
      // lib/sena/scim.ts always passes one explicitly, so nothing depends on
      // this default meaning "scim".)
      const { source, ...withoutSource } = cohortBody("SENA Source Org");
      expect(source).toBe("api");
      const defaulted = await route.POST(postRequest(withoutSource));
      const defaultedBody = await defaulted.json() as ProvisioningResultBody;
      expect(defaulted.status).toBe(200);
      expect(defaultedBody.source).toBe("api");
      expect((await provisioning.listEnterpriseProvisioningDirectoryAsync("api")).users.map((user) => user.email).sort())
        .toEqual(["provisioning-coder@example.edu", "provisioning-pi@example.edu"]);
    });
  });

  it("keeps an explicitly requested scim source on the rows it provisions", async () => {
    await withProvisioningRoute("sena-provisioning-route-source-scim-", {}, async ({ route, provisioning }) => {
      // The other half of the source contract: a source spelled right is
      // honoured, so the directory the integration reads back is the one it
      // just wrote to.
      const response = await route.POST(postRequest({ ...cohortBody("SENA Scim Source Org"), source: "scim" }));
      expect(response.status).toBe(200);
      expect((await response.json() as ProvisioningResultBody).source).toBe("scim");

      const scimDirectory = await provisioning.listEnterpriseProvisioningDirectoryAsync("scim");
      expect(scimDirectory.teams.map((team) => team.name)).toEqual(["Provisioning Cohort"]);
      expect(scimDirectory.users.map((user) => user.email).sort())
        .toEqual(["provisioning-coder@example.edu", "provisioning-pi@example.edu"]);
      expect((await provisioning.listEnterpriseProvisioningDirectoryAsync("api")).teams).toEqual([]);
    });
  });
});

describe("SENA provisioning route bearer auth", () => {
  it("refuses every unauthenticated POST shape with 401 and no side effect on state", async () => {
    await withProvisioningRoute("sena-provisioning-route-auth-post-", {}, async ({ route, state }) => {
      const refusals: Array<{ label: string; headers: Record<string, string>; code: string }> = [
        { label: "no Authorization header", headers: {}, code: "provisioning_token_required" },
        { label: "empty Authorization header", headers: { authorization: "" }, code: "provisioning_token_required" },
        { label: "non-bearer scheme", headers: { authorization: `Token ${provisioningToken}` }, code: "provisioning_token_required" },
        { label: "bearer with no credential", headers: { authorization: "Bearer" }, code: "provisioning_token_required" },
        { label: "bearer with blank credential", headers: { authorization: "Bearer    " }, code: "provisioning_token_required" },
        { label: "basic credentials", headers: { authorization: "Basic c2VuYTpzZW5h" }, code: "provisioning_token_required" },
        { label: "wrong token", headers: { authorization: "Bearer wrong-token" }, code: "provisioning_token_invalid" },
        { label: "token prefix only", headers: { authorization: "Bearer sena-test" }, code: "provisioning_token_invalid" },
        { label: "token with trailing junk", headers: { authorization: `Bearer ${provisioningToken}x` }, code: "provisioning_token_invalid" },
        { label: "case-shifted token", headers: { authorization: `Bearer ${provisioningToken.toUpperCase()}` }, code: "provisioning_token_invalid" }
      ];

      for (const { label, headers, code } of refusals) {
        const response = await route.POST(postRequest(cohortBody("SENA Unauthorized Org"), headers));
        const body = await response.json() as ProvisioningResultBody;
        expect([label, response.status]).toEqual([label, 401]);
        expect([label, body.code]).toEqual([label, code]);
        expect([label, typeof body.error]).toEqual([label, "string"]);
        // The refusal must not leak whether the token even exists beyond its
        // own code, and must never echo the configured secret.
        expect([label, JSON.stringify(body).includes(provisioningToken)]).toEqual([label, false]);
        expect([label, response.headers.get("x-sena-observed-route")]).toEqual([label, "sena-provisioning"]);
        expect([label, response.headers.get("x-sena-observed-status-class")]).toEqual([label, "4xx"]);
      }

      // Auth is checked before the body is even read, so a rejected caller
      // provisions nothing.
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });

      // ...and the same payload with the right token still works, so the
      // refusals above are the token's doing and not a broken fixture.
      const authorized = await route.POST(postRequest(cohortBody("SENA Unauthorized Org")));
      expect(authorized.status).toBe(200);
      expect((await authorized.json() as ProvisioningResultBody).summary?.usersCreated).toBe(2);
    });
  });

  it("refuses an unauthenticated GET with 401 while still naming the status schema", async () => {
    await withProvisioningRoute("sena-provisioning-route-auth-get-", {}, async ({ route }) => {
      for (const [label, headers] of [
        ["no Authorization header", {}],
        ["non-bearer scheme", { authorization: `Token ${provisioningToken}` }]
      ] as Array<[string, Record<string, string>]>) {
        const response = await route.GET(getRequest(headers));
        const body = await response.json() as ProvisioningStatusBody;
        expect([label, response.status]).toEqual([label, 401]);
        expect([label, body.code]).toEqual([label, "provisioning_token_required"]);
        // A 401 says the endpoint IS configured — the caller's credential is
        // the problem, not the deployment — and still carries the status
        // schemaVersion so a client can parse one shape for both outcomes.
        expect([label, body.configured]).toEqual([label, true]);
        expect([label, body.schemaVersion]).toEqual([label, "sena-enterprise-provisioning-status/v1"]);
        // A refusal must not hand out the surface description.
        expect([label, body.supports]).toEqual([label, undefined]);
        expect([label, JSON.stringify(body).includes(provisioningToken)]).toEqual([label, false]);
      }

      const wrongToken = await route.GET(getRequest(bearer("wrong-token")));
      const wrongTokenBody = await wrongToken.json() as ProvisioningStatusBody;
      expect(wrongToken.status).toBe(401);
      expect(wrongTokenBody.code).toBe("provisioning_token_invalid");
      expect(wrongTokenBody.configured).toBe(true);
    });
  });

  it("reports the SENA_PROVISIONING_TOKEN-unset deployment as 503 provisioning_not_configured", async () => {
    await withProvisioningRoute("sena-provisioning-route-unconfigured-", { token: null }, async ({ route, state }) => {
      // An unset (or whitespace-only) token is a deployment gap, not a caller
      // error: 503 tells an IdP to stop and alert instead of rotating its
      // credential.
      const status = await route.GET(getRequest());
      const statusBody = await status.json() as ProvisioningStatusBody;
      expect(status.status).toBe(503);
      expect(statusBody.schemaVersion).toBe("sena-enterprise-provisioning-status/v1");
      expect(statusBody.configured).toBe(false);
      expect(statusBody.code).toBe("provisioning_not_configured");
      expect(typeof statusBody.error).toBe("string");
      expect(statusBody.supports).toBeUndefined();
      expect(statusBody.auth).toBeUndefined();
      expect(status.headers.get("x-sena-observed-route")).toBe("sena-provisioning");
      expect(status.headers.get("x-sena-observed-status-class")).toBe("5xx");

      // The unset branch does not depend on the caller's credential: a request
      // carrying a plausible bearer token is refused identically, so an
      // unconfigured deployment can never be talked into provisioning.
      const withToken = await route.GET(getRequest(bearer(provisioningToken)));
      expect(withToken.status).toBe(503);
      expect((await withToken.json() as ProvisioningStatusBody).code).toBe("provisioning_not_configured");

      const write = await route.POST(postRequest(cohortBody("SENA Unconfigured Org")));
      const writeBody = await write.json() as ProvisioningResultBody;
      expect(write.status).toBe(503);
      expect(writeBody.code).toBe("provisioning_not_configured");
      expect(writeBody.schemaVersion).toBeUndefined();
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });
    });
  });
});

describe("SENA provisioning route GET status", () => {
  it("describes the configured provisioning surface", async () => {
    await withProvisioningRoute("sena-provisioning-route-status-", {}, async ({ route, state }) => {
      const response = await route.GET(getRequest());
      const body = await response.json() as ProvisioningStatusBody;

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-provisioning");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body).toEqual({
        schemaVersion: "sena-enterprise-provisioning-status/v1",
        configured: true,
        auth: "bearer-token-hash-compare",
        endpoint: "/api/sena/provisioning",
        supports: ["teams", "users", "sso-identities", "memberships", "dry-run", "scim-v2-bridge"]
      });
      expect(JSON.stringify(body)).not.toContain(provisioningToken);

      // Every capability the status advertises has to be one the POST actually
      // honours, or the document is a promise nobody keeps. "dry-run" is the
      // one this endpoint owns end to end.
      expect(body.supports).toContain("dry-run");
      const dryRun = await route.POST(postRequest({ ...cohortBody("SENA Status Org"), dryRun: true }));
      expect(dryRun.status).toBe(200);
      expect((await dryRun.json() as ProvisioningResultBody).dryRun).toBe(true);
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });

      // A status read is a read: it must not create anything either.
      const afterStatus = await route.GET(getRequest());
      expect(afterStatus.status).toBe(200);
      expect(await primarySnapshot(state)).toEqual({ users: [], teams: [], memberships: [], provisioningAudits: 0 });
    });
  });
});
