import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * An unauthenticated caller could read the deployment's internal database
 * hostname out of the ops routes.
 *
 * `resolveOpsAccess` (lib/sena/ops-api.ts) called `opsSessionAccess` from two
 * places and guarded only one of them: the "no ops token configured" branch
 * returned early, outside the try/catch that normalises unrecognised throws.
 * The session lookup on that branch reaches readEnterpriseState, and on a
 * Postgres primary `normalizePostgresStateError`
 * (lib/sena/enterprise/state.ts:502) re-throws anything without a numeric
 * `status` verbatim — which a plain `pg` connection error is. That reached
 * `enterpriseErrorResponse`, which published `error.message` with a 500:
 *
 *   {"error":"getaddrinfo ENOTFOUND db-internal.sena.invalid","code":"unexpected_error"}
 *
 * No credential was presented. The cookie below is fabricated — the failure
 * happens during the session lookup itself, so no valid session is needed, and
 * repeating the request against different deployments enumerates internal
 * infrastructure names.
 *
 * Two layers are pinned here, because either one alone leaves a hole:
 *
 *   ops-api.ts  — one session call site, normalisation inside it, so no branch
 *                 can reach the session path unwrapped again. The duplicated
 *                 guard is how this arose, so the single call site is asserted
 *                 structurally as well as behaviourally.
 *   errors.ts   — `enterpriseErrorResponse` published the raw `Error.message`
 *                 of ANY unrecognised throw, on every route that uses it. The
 *                 ops fix closes one caller; this closes the shared helper.
 */

const unreachableHost = "db-internal.sena.invalid";
const backendPassword = "super-secret-backend-password";
const opsToken = "sena-redaction-ops-token";
/** A value any anonymous caller can invent: it is never looked up successfully. */
const fabricatedCookie = "any-cookie-value-an-anonymous-caller-can-invent";

const postgresPrimaryEnv = {
  SENA_ENTERPRISE_DB_ADAPTER: "postgres",
  SENA_ENTERPRISE_STATE_STORE: "postgres",
  SENA_ENTERPRISE_POSTGRES_URL: `postgres://sena_user:${backendPassword}@${unreachableHost}/senadb?sslmode=require`
};

/**
 * Anything that could name (or silently repair) a live backend. A developer
 * with DATABASE_URL exported, or CI with VERCEL_* injected, would otherwise
 * configure the very backend this suite needs to be broken.
 */
function namesALiveService(key: string) {
  return /^SENA_/.test(key)
    || /^NEXT_PUBLIC_SENA/.test(key)
    || /^(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|POSTGRES_URL_NON_POOLING|NEON_DATABASE_URL|PGHOST|PGUSER|PGPASSWORD|PGDATABASE|PGPORT)$/.test(key)
    || /^(R2_|CLOUDFLARE_|BLOB_|VERCEL_|AWS_|GCS_|GOOGLE_|OTEL_|DATADOG_|DD_)/.test(key);
}

type BrokenBackendHarness = {
  enterpriseDbDir: string;
  opsApi: () => Promise<typeof import("../ops-api")>;
  errors: () => Promise<typeof import("../enterprise/errors")>;
  /** Drives the real exported GET of a deployment-wide ops route. */
  get: (init?: RequestInit) => Promise<Response>;
};

let releaseHarness: (() => void) | undefined;

afterEach(() => {
  releaseHarness?.();
  releaseHarness = undefined;
  vi.restoreAllMocks();
});

/**
 * A deployment whose Postgres primary is configured and unreachable — the state
 * of a half-provisioned deployment, and the one that produced the leak.
 */
function startBrokenBackendOps(options: {
  /** Set only by the A/B half that configures an ops credential. */
  opsToken?: string;
  /** Undefined models a request carrying no SENA session cookie at all. */
  sessionCookie?: string;
} = {}): BrokenBackendHarness {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-redaction-"));
  const savedEnv = new Map<string, string | undefined>();
  for (const key of Object.keys(process.env)) {
    if (!namesALiveService(key)) continue;
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }

  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  for (const [key, value] of Object.entries(postgresPrimaryEnv)) process.env[key] = value;
  if (options.opsToken) process.env.SENA_OPS_TOKEN = options.opsToken;

  // A pg driver that resolves nothing: the connection error carries the
  // internal hostname, exactly as the real driver's does.
  vi.doMock("pg", () => ({
    Pool: class UnreachablePool {
      async query() {
        throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${unreachableHost}`), { code: "ENOTFOUND" });
      }

      async end() {
        return undefined;
      }
    }
  }));
  // next/headers throws "called outside a request scope" under Vitest, which
  // would make every case assert a harness artifact instead of the handler.
  vi.doMock("next/headers", () => ({
    cookies: async () => ({
      get: (name: string) => (
        name === "sena_session" && options.sessionCookie
          ? { name, value: options.sessionCookie }
          : undefined
      )
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

  releaseHarness = () => {
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    delete process.env.SENA_OPS_TOKEN;
    for (const key of Object.keys(postgresPrimaryEnv)) delete process.env[key];
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.doUnmock("pg");
    vi.doUnmock("next/headers");
    vi.resetModules();
  };

  return {
    enterpriseDbDir,
    opsApi: async () => await import("../ops-api"),
    errors: async () => await import("../enterprise/errors"),
    get: async (init) => {
      const route = await import("../../../app/api/sena/ops/status/route") as {
        GET: (request: Request) => Promise<Response>;
      };
      return await route.GET(new Request("https://sena.example.test/api/sena/ops/status", init));
    }
  };
}

/** Nothing about the backend may cross the wire, in any field, at any status. */
function expectNoBackendDetail(text: string, harness: BrokenBackendHarness) {
  expect(text).not.toContain(unreachableHost);
  expect(text).not.toContain("ENOTFOUND");
  expect(text).not.toContain("getaddrinfo");
  expect(text).not.toContain(backendPassword);
  expect(text).not.toContain("sena_user");
  expect(text).not.toContain(harness.enterpriseDbDir);
  expect(text).not.toMatch(/\n\s+at\s+\S+\s+\(/);
}

describe("SENA ops access with an unreachable backend", () => {
  it("refuses an unauthenticated caller without publishing the backend failure when no ops token is configured", async () => {
    const harness = startBrokenBackendOps({ sessionCookie: fabricatedCookie });

    const { requireOpsAccess } = await harness.opsApi();
    const rejection = await requireOpsAccess(
      new Request("https://sena.example.test/api/sena/ops/status")
    ).then(() => undefined, (error: unknown) => error);

    // The unguarded early return let a plain driver Error out of here with no
    // status at all, which is what became a 500 downstream.
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).toMatchObject({ status: 401, code: "ops_session_unverified" });
    expectNoBackendDetail(String((rejection as Error).message), harness);

    // ...and the route answers the same refusal, with a body an anonymous
    // caller learns nothing from.
    const response = await harness.get();
    const text = await response.text();
    const body = JSON.parse(text) as { error?: string; code?: string; access?: unknown };

    expect(response.status, text).toBe(401);
    expect(body.code).toBe("ops_session_unverified");
    expect(body.error).toBe("SENA ops access could not be verified.");
    expect(body.access).toBeUndefined();
    expectNoBackendDetail(text, harness);
  });

  it("answers the identical request identically when an ops token IS configured (the isolating A/B)", async () => {
    // Same broken backend, same fabricated cookie, no bearer presented: this
    // half took the guarded branch and never leaked. It is the control, and it
    // must keep answering exactly what it answered before.
    const harness = startBrokenBackendOps({ opsToken, sessionCookie: fabricatedCookie });

    const { requireOpsAccess } = await harness.opsApi();
    await expect(requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status")))
      .rejects.toMatchObject({ status: 401, code: "ops_token_required" });

    const response = await harness.get();
    const text = await response.text();
    const body = JSON.parse(text) as { error?: string; code?: string };

    expect(response.status, text).toBe(401);
    expect(body.code).toBe("ops_token_required");
    expectNoBackendDetail(text, harness);
  });

  it("keeps a genuine SenaEnterpriseError surfacing its own message and code through the same routes", async () => {
    // The case the errors.ts change must not break: a refusal the product
    // authored is meant to be read by the caller. Here the caller sends no
    // cookie at all, so the session layer refuses before the backend is
    // consulted, and that refusal is the answer.
    const harness = startBrokenBackendOps();

    const response = await harness.get();
    const text = await response.text();
    const body = JSON.parse(text) as { error?: string; code?: string };

    expect(response.status, text).toBe(401);
    expect(body.code).toBe("auth_required");
    expect(body.error).toBe("Sign in is required.");
    expectNoBackendDetail(text, harness);

    const { enterpriseErrorResponse, SenaEnterpriseError } = await harness.errors();
    // Every status class, so the redaction cannot be implemented as "sanitize
    // 5xx" and quietly swallow an authored 500 the product does mean to send.
    for (const authored of [
      new SenaEnterpriseError("Deployment-wide SENA ops access requires an operator.", 403, "ops_operator_required"),
      new SenaEnterpriseError("Ops bearer token is invalid.", 401, "ops_token_invalid"),
      new SenaEnterpriseError("SENA enterprise Postgres state is unavailable.", 503, "enterprise_state_unavailable"),
      new SenaEnterpriseError("SENA enterprise state write failed.", 500, "enterprise_state_write_failed")
    ]) {
      expect(enterpriseErrorResponse(authored)).toEqual({
        body: { error: authored.message, code: authored.code },
        status: authored.status
      });
    }
  });

  it("keeps the raw message of an unrecognised throw out of the body and in the server log", async () => {
    const harness = startBrokenBackendOps();
    const { enterpriseErrorResponse } = await harness.errors();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const driverError = Object.assign(
      new Error(`getaddrinfo ENOTFOUND ${unreachableHost}`),
      { code: "ENOTFOUND" }
    );
    const response = enterpriseErrorResponse(driverError);

    // Generic body, unchanged code: `unexpected_error` is what observability
    // books the sample under (api-helpers.ts passes body.code to
    // recordEnterpriseObservedRequest), so the code has to survive.
    expect(response).toEqual({
      body: { error: "Unexpected SENA enterprise error.", code: "unexpected_error" },
      status: 500
    });
    expectNoBackendDetail(JSON.stringify(response.body), harness);

    // The real failure is not discarded — observeSenaApiRoute records only the
    // route, method, status, duration and code, never a message, so the only
    // place the operator can still read it is the server log.
    expect(logged).toHaveBeenCalled();
    expect(logged.mock.calls.flat().map((entry) => String(entry)).join(" ")).toContain(unreachableHost);

    // A non-Error throw gets the same treatment rather than "[object Object]".
    logged.mockClear();
    expect(enterpriseErrorResponse({ secret: backendPassword })).toEqual({
      body: { error: "Unexpected SENA enterprise error.", code: "unexpected_error" },
      status: 500
    });
    expect(logged).toHaveBeenCalled();
  });

  it("keeps exactly one session call site in resolveOpsAccess", async () => {
    // Structural, because the defect was not a wrong guard but a SECOND,
    // unguarded call to the same helper. A behavioural test can only cover the
    // branches that exist today; this fails the moment a third branch reaches
    // the session path around the normalisation again.
    const source = readFileSync(path.join(process.cwd(), "lib", "sena", "ops-api.ts"), "utf8");
    const invocations = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .filter((line) => /\bopsSessionAccess\(/.test(line))
      .filter((line) => !/function\s+opsSessionAccess\(/.test(line));

    expect(invocations).toHaveLength(1);
  });
});
