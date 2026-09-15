import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SENA_API_ENDPOINT_FACTS } from "../api-route-facts";

/**
 * T2 coverage for Ledger row FA22-01 — "GET /api/sena/docs and ?format=openapi
 * return valid JSON / OpenAPI 3.1 (public, no auth)".
 *
 * api-docs.test.ts already unit-tests buildSenaApiDocumentation and
 * buildSenaOpenApiDocument. Nothing had ever invoked the route handler that
 * serves them, so the row's actual claims — an HTTP 200, a parseable body, a
 * genuinely valid OpenAPI 3.1 document, and no credential requirement — were
 * unverified. Every assertion below goes through app/api/sena/docs/route.ts.
 */

const docsUrl = "https://sena.example.test/api/sena/docs";

type SenaApiDocumentation = {
  schemaVersion?: string;
  generatedAt?: string;
  baseUrl?: string;
  summary?: {
    endpointCount?: number;
    methodCount?: number;
    groupCount?: number;
    openApiPath?: string;
    coveragePolicy?: string;
    csrfPolicy?: string;
  };
  groups?: Array<{ id?: string; title?: string; description?: string; endpointCount?: number; methodCount?: number }>;
  surfaceMoratorium?: { schemaVersion?: string };
  endpoints?: Array<{ id?: string; path?: string; methods?: string[]; auth?: string; group?: string }>;
};

type OpenApiOperation = {
  tags?: string[];
  operationId?: string;
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{ name?: string; in?: string; required?: boolean; schema?: unknown }>;
  requestBody?: { required?: boolean; content?: Record<string, unknown> };
  responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
};

type OpenApiDocument = {
  openapi?: string;
  info?: { title?: string; version?: string; summary?: string };
  servers?: Array<{ url?: string }>;
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { securitySchemes?: Record<string, { type?: string; in?: string; name?: string; scheme?: string }> };
};

type DocsRoute = typeof import("../../../app/api/sena/docs/route");
type RouteManifest = typeof import("../api-route-manifest");

const httpMethodKeys = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/**
 * Same temp-state + aliased-module harness scim-route.test.ts uses. The docs
 * handler itself is pure, but observeSenaApiRoute records every request into
 * the enterprise observability store, so the route must not be allowed to write
 * into the developer's real SENA_ENTERPRISE_DB_DIR.
 */
async function withDocsRoute<T>(
  prefix: string,
  run: (context: { route: DocsRoute; manifest: RouteManifest }) => Promise<T>
) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_APP_URL = "https://sena.example.test";
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/api-docs", async () => await import("../api-docs"));

  try {
    return await run({
      route: await import("../../../app/api/sena/docs/route"),
      manifest: await import("../api-route-manifest")
    });
  } finally {
    vi.unstubAllEnvs();
    delete process.env.SENA_APP_URL;
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.resetModules();
  }
}

describe("GET /api/sena/docs (default JSON contract)", () => {
  it("answers an unauthenticated GET with a parseable sena-api-documentation/v1 body", async () => {
    await withDocsRoute("sena-docs-route-json-", async ({ route, manifest }) => {
      // No Authorization header, no Cookie header, no session: the row's
      // "public, no auth" conjunct is exactly this call succeeding.
      const response = await route.GET(new Request(docsUrl));
      const raw = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/application\/json/);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-docs");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");

      // Parse from raw text rather than response.json(): "returns valid JSON"
      // is a claim about the bytes on the wire, and JSON.parse throwing here is
      // the failure the row cares about.
      const body = JSON.parse(raw) as SenaApiDocumentation;

      expect(body.schemaVersion).toBe("sena-api-documentation/v1");
      expect(body.baseUrl).toBe("https://sena.example.test");
      expect(Number.isFinite(Date.parse(String(body.generatedAt)))).toBe(true);

      // Top-level shape: every key the contract promises, and nothing that is
      // merely truthy — the counts have to agree with the arrays beside them.
      expect(Object.keys(body).sort()).toEqual([
        "baseUrl",
        "endpoints",
        "generatedAt",
        "groups",
        "schemaVersion",
        "summary",
        "surfaceMoratorium"
      ]);
      expect(body.summary).toEqual(expect.objectContaining({
        openApiPath: "/api/sena/docs?format=openapi",
        coveragePolicy: expect.any(String),
        csrfPolicy: expect.stringContaining("x-sena-csrf-token")
      }));
      expect(body.endpoints?.length).toBeGreaterThanOrEqual(50);
      expect(body.summary?.endpointCount).toBe(body.endpoints?.length);
      expect(body.summary?.groupCount).toBe(body.groups?.length);
      expect(body.summary?.methodCount).toBe(
        body.endpoints?.reduce((total, endpoint) => total + (endpoint.methods?.length ?? 0), 0)
      );
      expect(body.surfaceMoratorium?.schemaVersion).toBe("sena-api-surface-moratorium/v1");

      // Group cards carry counts, not just labels.
      for (const group of body.groups ?? []) {
        expect([group.id, typeof group.title, typeof group.endpointCount, typeof group.methodCount])
          .toEqual([group.id, "string", "number", "number"]);
        const owned = body.endpoints?.filter((endpoint) => endpoint.group === group.id) ?? [];
        expect([group.id, group.endpointCount]).toEqual([group.id, owned.length]);
      }

      // The served body is the whole implemented surface, not a subset.
      const served = (body.endpoints ?? [])
        .flatMap((endpoint) => (endpoint.methods ?? []).map((method) => `${method} ${endpoint.path}`))
        .sort();
      const implemented = manifest.SENA_IMPLEMENTED_API_ROUTES
        .flatMap((entry) => entry.methods.map((method) => `${method} ${entry.path}`))
        .sort();
      expect(served).toEqual(implemented);
      expect(body.endpoints?.find((endpoint) => endpoint.id === "sena-docs")).toEqual(
        expect.objectContaining({ path: "/api/sena/docs", methods: ["GET"], auth: "public" })
      );
    });
  });

  it("stays public: no credential of any kind is required, accepted, or echoed", async () => {
    await withDocsRoute("sena-docs-route-public-", async ({ route }) => {
      vi.stubEnv("SENA_OPS_TOKEN", "sena-secret-ops-token-must-not-leak");
      vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-secret-provisioning-token-must-not-leak");

      // A bare GET, the same GET with a garbage bearer token, and the same GET
      // with a bogus session cookie must all be the same 200. A route that had
      // quietly grown an auth check would fail the first; a route that had grown
      // a *rejection* of unknown credentials would fail the other two.
      const probes: Array<[string, Request]> = [
        ["no headers", new Request(docsUrl)],
        ["garbage bearer", new Request(docsUrl, { headers: { authorization: "Bearer not-a-real-token" } })],
        ["bogus session cookie", new Request(docsUrl, { headers: { cookie: "sena_session=not-a-real-session" } })]
      ];

      const bodies: string[] = [];
      for (const [label, request] of probes) {
        const response = await route.GET(request);
        const raw = await response.text();
        expect([label, response.status]).toEqual([label, 200]);
        expect([label, (JSON.parse(raw) as SenaApiDocumentation).schemaVersion])
          .toEqual([label, "sena-api-documentation/v1"]);
        bodies.push(raw);
      }

      // An unauthenticated public document must not carry deployment secrets.
      for (const raw of bodies) {
        expect(raw).not.toContain("sena-secret-ops-token-must-not-leak");
        expect(raw).not.toContain("sena-secret-provisioning-token-must-not-leak");
      }

      // The openapi variant is public on the same terms.
      const openapi = await route.GET(new Request(`${docsUrl}?format=openapi`));
      expect(openapi.status).toBe(200);
      const openapiRaw = await openapi.text();
      expect(openapiRaw).not.toContain("sena-secret-ops-token-must-not-leak");
      expect(openapiRaw).not.toContain("sena-secret-provisioning-token-must-not-leak");
    });
  });

  it("serves the JSON contract for any format the document does not itself advertise", async () => {
    await withDocsRoute("sena-docs-route-format-", async ({ route }) => {
      // The manifest advertises exactly one alternate format. Everything else —
      // absent, empty, unknown, or the advertised value in the wrong case —
      // falls back to the JSON contract rather than erroring.
      for (const query of ["", "?format=", "?format=json", "?format=OPENAPI", "?format=yaml"]) {
        const response = await route.GET(new Request(`${docsUrl}${query}`));
        const body = await response.json() as SenaApiDocumentation & OpenApiDocument;
        expect([query, response.status]).toEqual([query, 200]);
        expect([query, body.schemaVersion]).toEqual([query, "sena-api-documentation/v1"]);
        expect([query, body.openapi]).toEqual([query, undefined]);
      }
    });
  });

  it("honours the openApiPath the JSON contract advertises", async () => {
    await withDocsRoute("sena-docs-route-selfref-", async ({ route }) => {
      const contract = await (await route.GET(new Request(docsUrl))).json() as SenaApiDocumentation;
      const advertised = new URL(String(contract.summary?.openApiPath), "https://sena.example.test");

      // Following the endpoint's own advertised link must produce the OpenAPI
      // document, not a second copy of the JSON contract.
      const response = await route.GET(new Request(advertised.toString()));
      const body = await response.json() as OpenApiDocument;
      expect(response.status).toBe(200);
      expect(body.openapi).toMatch(/^3\.1/);
    });
  });
});

describe("GET /api/sena/docs?format=openapi (OpenAPI 3.1 document)", () => {
  it("keeps method-specific normal-response facts internally valid", () => {
    for (const endpoint of SENA_API_ENDPOINT_FACTS) {
      for (const [method, responses] of Object.entries(endpoint.normalResponsesByMethod ?? {})) {
        expect(endpoint.methods).toContain(method);
        expect(responses?.length).toBeGreaterThan(0);
        expect(new Set(responses?.map((response) => response.status)).size)
          .toBe(responses?.length);
        for (const response of responses ?? []) {
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(400);
          expect(new Set(response.contentTypes).size).toBe(response.contentTypes.length);
          expect(response.contentTypes.every((contentType) => contentType.trim().length > 0)).toBe(true);
          if (response.status === 204 || response.status === 307) {
            expect(response.contentTypes).toEqual([]);
          } else {
            expect(response.contentTypes.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("returns an OpenAPI 3.1 document whose paths carry exactly the manifest's methods", async () => {
    await withDocsRoute("sena-docs-route-openapi-", async ({ route, manifest }) => {
      const response = await route.GET(new Request(`${docsUrl}?format=openapi`));
      const raw = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/application\/json/);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-docs");

      const document = JSON.parse(raw) as OpenApiDocument;

      // OpenAPI 3.1 required root fields: `openapi` and `info` (with title and
      // version). `servers[].url` is required whenever `servers` is present.
      expect(document.openapi).toMatch(/^3\.1(\.\d+)?$/);
      expect(document.info?.title).toBe("SENA Enterprise API");
      expect(document.info?.version).toEqual(expect.any(String));
      expect(String(document.info?.version).length).toBeGreaterThan(0);
      expect(document.servers).toEqual([{ url: "https://sena.example.test" }]);

      const paths = document.paths ?? {};
      const pathKeys = Object.keys(paths);
      expect(pathKeys.length).toBeGreaterThan(0);
      expect(pathKeys.every((key) => key.startsWith("/"))).toBe(true);

      // Every implemented route appears, under exactly the methods the manifest
      // declares — nothing missing, nothing extra. Compared as one sorted list
      // so a failure names the offending method, not just a count.
      const documented = pathKeys
        .flatMap((pathKey) => Object.keys(paths[pathKey])
          .filter((field) => httpMethodKeys.includes(field))
          .map((method) => `${method.toUpperCase()} ${pathKey}`))
        .sort();
      const implemented = manifest.SENA_IMPLEMENTED_API_ROUTES
        .flatMap((entry) => entry.methods.map((method) => `${method} ${entry.path}`))
        .sort();
      expect(documented).toEqual(implemented);
      expect(pathKeys.length).toBe(new Set(manifest.SENA_IMPLEMENTED_API_ROUTES.map((entry) => entry.path)).size);

      // No key inside a Path Item that is neither an HTTP method nor a field
      // OpenAPI defines there: an unrecognised verb would silently disappear
      // from the comparison above.
      const pathItemFields = new Set([...httpMethodKeys, "summary", "description", "servers", "parameters", "$ref"]);
      for (const key of pathKeys) {
        for (const field of Object.keys(paths[key])) {
          expect([key, field, pathItemFields.has(field)]).toEqual([key, field, true]);
        }
      }

      // Each operation is a usable Operation Object, not an empty stub.
      const operationIds: string[] = [];
      for (const [pathKey, item] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(item)) {
          const where = `${method.toUpperCase()} ${pathKey}`;
          expect([where, typeof operation.operationId]).toEqual([where, "string"]);
          expect([where, typeof operation.summary]).toEqual([where, "string"]);
          expect([where, operation.tags?.length]).toEqual([where, 1]);
          // `responses` is REQUIRED on an Operation Object in 3.1. Exact
          // non-default success contracts are asserted below against an
          // independently maintained route ledger rather than inferred from
          // the generator's own facts.
          const responses = operation.responses ?? {};
          expect([where, Object.keys(responses).length > 0]).toEqual([where, true]);
          const normalResponses = Object.keys(responses).filter((status) => {
            const numericStatus = Number(status);
            return numericStatus >= 200 && numericStatus < 400;
          });
          expect([where, normalResponses.length > 0]).toEqual([where, true]);
          for (const [status, response] of Object.entries(responses)) {
            expect([where, status, typeof response.description]).toEqual([where, status, "string"]);
          }
          operationIds.push(String(operation.operationId));
        }
      }
      // operationId MUST be unique across the document — codegen names methods from it.
      expect(operationIds.length).toBe(new Set(operationIds).size);

      // Every tag an operation references is declared at the root, and every
      // security scheme an operation names exists in components.
      const declaredTags = new Set((document.tags ?? []).map((tag) => tag.name));
      const declaredSchemes = new Set(Object.keys(document.components?.securitySchemes ?? {}));
      expect(declaredSchemes).toEqual(new Set(["sessionCookie", "opsBearer", "jobWorkerHmac", "provisioningBearer", "scimBearer"]));
      for (const [pathKey, item] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(item)) {
          const where = `${method.toUpperCase()} ${pathKey}`;
          for (const tag of operation.tags ?? []) {
            expect([where, tag, declaredTags.has(tag)]).toEqual([where, tag, true]);
          }
          for (const requirement of operation.security ?? []) {
            for (const scheme of Object.keys(requirement)) {
              expect([where, scheme, declaredSchemes.has(scheme)]).toEqual([where, scheme, true]);
            }
          }
        }
      }
    });
  });

  it("documents the independently audited non-default success-response ledger", async () => {
    await withDocsRoute("sena-docs-route-success-ledger-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const expected = [
        ["POST", "/api/auth/login", "200", ["application/json"]],
        ["POST", "/api/auth/login", "202", ["application/json"]],
        ["POST", "/api/auth/register", "201", ["application/json"]],
        ["POST", "/api/auth/mfa", "200", ["application/json"]],
        ["POST", "/api/auth/mfa", "201", ["application/json"]],
        ["POST", "/api/auth/password-reset", "200", ["application/json"]],
        ["POST", "/api/auth/password-reset", "202", ["application/json"]],
        ["GET", "/api/auth/sso", "200", ["application/json"]],
        ["GET", "/api/auth/sso", "307", []],
        ["GET", "/api/auth/sso/callback", "307", []],
        ["POST", "/api/sena/projects", "201", ["application/json"]],
        ["POST", "/api/sena/projects/{projectId}/collaboration", "200", ["application/json"]],
        ["POST", "/api/sena/projects/{projectId}/collaboration", "201", ["application/json"]],
        ["GET", "/api/sena/projects/{projectId}/collaboration/stream", "200", ["text/event-stream"]],
        ["GET", "/api/sena/workflows/runs/{runId}/events", "200", ["text/event-stream"]],
        ["POST", "/api/sena/team/invitations", "201", ["application/json"]],
        ["POST", "/api/sena/analyze", "200", ["application/json"]],
        ["POST", "/api/sena/analyze", "202", ["application/json"]],
        ["POST", "/api/sena/uploads", "200", ["application/json"]],
        ["POST", "/api/sena/uploads", "201", ["application/json"]],
        ["POST", "/api/sena/import", "200", ["application/json"]],
        ["POST", "/api/sena/import", "201", ["application/json"]],
        ["POST", "/api/sena/import", "202", ["application/json"]],
        ["POST", "/api/sena/reliability", "200", ["application/json"]],
        ["POST", "/api/sena/reliability", "202", ["application/json"]],
        ["PATCH", "/api/sena/reliability", "200", ["application/json"]],
        ["PATCH", "/api/sena/reliability", "201", ["application/json"]],
        ["POST", "/api/sena/validation/group-comparison", "200", ["application/json"]],
        ["POST", "/api/sena/validation/group-comparison", "202", ["application/json"]],
        ["GET", "/api/sena/governance/audit", "200", ["application/json", "text/csv"]],
        ["POST", "/api/sena/exports/publication", "200", [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.sena.publication-package+json",
          "image/png",
          "image/svg+xml",
          "text/html"
        ]],
        ["POST", "/api/sena/exports/publication", "202", ["application/json"]],
        ["POST", "/api/sena/workflows/runs", "202", ["application/json"]],
        ["POST", "/api/sena/workflows/runs/{runId}/actions", "202", ["application/json"]],
        ["POST", "/api/sena/ops/jobs", "200", ["application/json"]],
        ["POST", "/api/sena/ops/jobs", "202", ["application/json"]],
        ["POST", "/api/sena/ops/jobs/worker", "202", ["application/json"]],
        ["GET", "/api/sena/ops/metrics", "200", ["text/plain; version=0.0.4"]],
        ["POST", "/api/sena/ops/go-live-rehearsal", "200", ["application/json"]],
        ["POST", "/api/sena/ops/go-live-rehearsal", "201", ["application/json"]],
        ["POST", "/api/sena/ops/platform-decisions", "201", ["application/json"]],
        ["POST", "/api/sena/ops/release-gate", "201", ["application/json"]],
        ["POST", "/api/sena/scim/v2/Users", "200", ["application/json"]],
        ["POST", "/api/sena/scim/v2/Users", "201", ["application/json"]],
        ["DELETE", "/api/sena/scim/v2/Users/{resourceId}", "204", []],
        ["POST", "/api/sena/scim/v2/Groups", "200", ["application/json"]],
        ["POST", "/api/sena/scim/v2/Groups", "201", ["application/json"]],
        ["DELETE", "/api/sena/scim/v2/Groups/{resourceId}", "204", []]
      ] as const;

      for (const [method, pathKey, status, contentTypes] of expected) {
        const operation = document.paths?.[pathKey]?.[method.toLowerCase()];
        const response = operation?.responses?.[status];
        expect([method, pathKey, status, Boolean(response)]).toEqual([method, pathKey, status, true]);
        expect([method, pathKey, status, Object.keys(response?.content ?? {}).sort()])
          .toEqual([method, pathKey, status, [...contentTypes].sort()]);
      }

      const actualSpecial: Array<[string, string, string, string[]]> = [];
      for (const [pathKey, pathItem] of Object.entries(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem)) {
          const normal = Object.entries(operation.responses ?? {})
            .filter(([status]) => Number(status) >= 200 && Number(status) < 400)
            .map(([status, response]) => [
              method.toUpperCase(),
              pathKey,
              status,
              Object.keys(response.content ?? {}).sort()
            ] as [string, string, string, string[]]);
          const defaultOnly = normal.length === 1 && normal[0][2] === "200" &&
            normal[0][3].length === 1 && normal[0][3][0] === "application/json";
          if (!defaultOnly) actualSpecial.push(...normal);
        }
      }
      const stable = (entry: readonly unknown[]) => JSON.stringify(entry);
      expect(actualSpecial.sort((left, right) => stable(left).localeCompare(stable(right))))
        .toEqual(expected.map(([method, pathKey, status, contentTypes]) => (
          [method, pathKey, status, [...contentTypes].sort()]
        )).sort((left, right) => stable(left).localeCompare(stable(right))));
    });
  });

  it("documents the docs endpoint itself as requiring no security", async () => {
    await withDocsRoute("sena-docs-route-selfdoc-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const self = document.paths?.["/api/sena/docs"]?.get;

      // The row's "public, no auth" claim has to survive into the contract SENA
      // publishes, or an integrator generates a client that sends credentials
      // the endpoint never wanted.
      expect(Object.keys(document.paths?.["/api/sena/docs"] ?? {})).toEqual(["get"]);
      expect(self?.security).toEqual([]);
      // The endpoint's only parameter is the `format` query switch: no
      // credential-bearing header, no CSRF token, nothing in `in: "cookie"`.
      expect((self?.parameters ?? []).map((parameter) => `${parameter.in}:${parameter.name}`))
        .toEqual(["query:format"]);

      // A session-authenticated mutation is the contrast case: it carries a
      // security requirement, the CSRF header parameter, AND the path parameter
      // its template expression requires. Both must survive together — a fix
      // that spread one parameter list over the other would silently drop one.
      const projectPut = document.paths?.["/api/sena/projects/{projectId}"]?.put;
      expect(projectPut?.security).toEqual([{ sessionCookie: [] }]);
      expect(projectPut?.parameters).toEqual([
        expect.objectContaining({ name: "projectId", in: "path", required: true }),
        expect.objectContaining({ name: "x-sena-csrf-token", in: "header", required: true })
      ]);
    });
  });

  it("declares a required `in: \"path\"` parameter for every template expression", async () => {
    await withDocsRoute("sena-docs-route-pathparams-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const paths = document.paths ?? {};

      const templated = Object.keys(paths).filter((key) => key.includes("{"));
      // Guard against a vacuous pass: if the surface ever stops having
      // templated paths, this case must fail loudly rather than pretend it
      // proved something.
      expect(templated.sort()).toEqual([
        "/api/sena/projects/{projectId}",
        "/api/sena/projects/{projectId}/collaboration",
        "/api/sena/projects/{projectId}/collaboration/stream",
        "/api/sena/scim/v2/Groups/{resourceId}",
        "/api/sena/scim/v2/Users/{resourceId}",
        "/api/sena/workflows/runs/{runId}",
        "/api/sena/workflows/runs/{runId}/actions",
        "/api/sena/workflows/runs/{runId}/closeout",
        "/api/sena/workflows/runs/{runId}/events"
      ]);

      // OpenAPI 3.1 §4.8.9.1: "Each template expression in the path MUST
      // correspond to a path parameter that is included in the Path Item itself
      // and/or in each of the Path Item's Operations", and such a parameter MUST
      // have `required: true`. Without them Spectral errors, openapi-generator
      // emits a client method with no id argument that requests the literal
      // `%7BprojectId%7D`, and Swagger UI renders no ID box.
      //
      // This block previously PINNED the defect (15 operations, zero path
      // parameters). It is now the regression that keeps them there.
      const missing: string[] = [];
      const notRequired: string[] = [];
      const unschemad: string[] = [];
      let checked = 0;
      for (const pathKey of templated) {
        const expressions = [...pathKey.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
        const itemLevel = (paths[pathKey] as {
          parameters?: Array<{ in?: string; name?: string; required?: boolean; schema?: unknown }>;
        }).parameters ?? [];
        for (const [method, operation] of Object.entries(paths[pathKey])) {
          if (!httpMethodKeys.includes(method)) continue;
          const declared = new Map([...itemLevel, ...(operation.parameters ?? [])]
            .filter((parameter) => parameter.in === "path")
            .map((parameter) => [parameter.name, parameter] as const));
          for (const expression of expressions) {
            checked += 1;
            const where = `${method.toUpperCase()} ${pathKey} -> {${expression}}`;
            const parameter = declared.get(expression);
            if (!parameter) {
              missing.push(where);
              continue;
            }
            // `required: true` is not merely conventional here — 3.1 makes it
            // mandatory for `in: "path"`, and a generator that sees `false`
            // emits an optional argument.
            if (parameter.required !== true) notRequired.push(where);
            if (!parameter.schema) unschemad.push(where);
          }
        }
      }
      expect(missing).toEqual([]);
      expect(notRequired).toEqual([]);
      expect(unschemad).toEqual([]);
      // Every method of every templated path is covered, not just one:
      // 4 on the project resource, 2 + 1 on collaboration, 4 + 4 on SCIM,
      // and one operation on each of the four run-scoped EvidenceFlow paths.
      expect(checked).toBe(19);

      // The operations that need BOTH a path parameter and the CSRF header are
      // where a naive fix breaks: `parameters` was built by a single object
      // spread, so adding a second one would overwrite or be overwritten.
      // Exactly five operations sit in that intersection.
      const both: string[] = [];
      for (const [pathKey, item] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(item)) {
          if (!httpMethodKeys.includes(method)) continue;
          const kinds = new Set((operation.parameters ?? []).map((parameter) => parameter.in));
          const csrf = (operation.parameters ?? []).some((parameter) => parameter.name === "x-sena-csrf-token");
          if (kinds.has("path") && csrf) both.push(`${method.toUpperCase()} ${pathKey}`);
        }
      }
      expect(both.sort()).toEqual([
        "DELETE /api/sena/projects/{projectId}",
        "PATCH /api/sena/projects/{projectId}",
        "POST /api/sena/projects/{projectId}/collaboration",
        "POST /api/sena/workflows/runs/{runId}/actions",
        "PUT /api/sena/projects/{projectId}"
      ]);
    });
  });

  it("documents query parameters instead of hanging a request body on a GET", async () => {
    await withDocsRoute("sena-docs-route-getbody-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const paths = document.paths ?? {};

      // OpenAPI 3.1: requestBody "has no defined semantics" for GET, and tools
      // that honour it generate clients that attach a body to a GET. The
      // generator used to attach one to every endpoint with an evidence note,
      // including this very docs endpoint — whose note describes a *query
      // string*, not a body.
      const getsWithBody = Object.entries(paths)
        .filter(([, item]) => item.get?.requestBody !== undefined)
        .map(([pathKey]) => pathKey)
        .sort();
      expect(getsWithBody).toEqual([]);

      // The docs endpoint's own `format` switch is now a real query parameter
      // with its allowed values, not prose buried in a body schema description.
      const self = paths["/api/sena/docs"]?.get;
      expect(self?.requestBody).toBeUndefined();
      const format = (self?.parameters ?? []).find((parameter) => parameter.name === "format");
      expect(format).toEqual(expect.objectContaining({ name: "format", in: "query", required: false }));
      expect((format?.schema as { type?: string; enum?: string[]; default?: string } | undefined))
        .toEqual(expect.objectContaining({ type: "string", enum: ["json", "openapi"], default: "json" }));
      expect(String((format as { description?: string } | undefined)?.description)).toContain("openapi");

      const projectId = (paths["/api/sena/validation/claim-package"]?.get?.parameters ?? [])
        .find((parameter) => parameter.name === "projectId");
      expect(projectId).toEqual(expect.objectContaining({
        name: "projectId",
        in: "query",
        required: true
      }));

      // A DELETE whose handler reads no body must not be documented with one
      // either — every templated resource DELETE is in that group.
      for (const pathKey of [
        "/api/sena/projects/{projectId}",
        "/api/sena/scim/v2/Users/{resourceId}",
        "/api/sena/scim/v2/Groups/{resourceId}"
      ]) {
        expect([pathKey, paths[pathKey]?.delete?.requestBody]).toEqual([pathKey, undefined]);
      }
      // ...but a DELETE that really does read one keeps it, and keeps it
      // optional: DELETE /api/auth/sessions parses JSON to pick the scope.
      expect(paths["/api/auth/sessions"]?.delete?.requestBody)
        .toEqual(expect.objectContaining({ required: false }));

      // POST/PUT/PATCH still carry a required body wherever the manifest has
      // evidence for one — the GET guard must not have eaten those.
      expect(paths["/api/sena/projects"]?.post?.requestBody)
        .toEqual(expect.objectContaining({ required: true }));
      expect(paths["/api/sena/projects/{projectId}"]?.put?.requestBody)
        .toEqual(expect.objectContaining({ required: true }));
    });
  });
});
