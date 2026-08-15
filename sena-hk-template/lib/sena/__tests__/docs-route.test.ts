import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

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
          // `responses` is REQUIRED on an Operation Object in 3.1, and each
          // response needs a description.
          expect([where, Object.keys(operation.responses ?? {})]).toEqual([where, ["200"]]);
          expect([where, typeof operation.responses?.["200"]?.description]).toEqual([where, "string"]);
          expect([where, Object.keys(operation.responses?.["200"]?.content ?? {})])
            .toEqual([where, ["application/json"]]);
          operationIds.push(String(operation.operationId));
        }
      }
      // operationId MUST be unique across the document — codegen names methods from it.
      expect(operationIds.length).toBe(new Set(operationIds).size);

      // Every tag an operation references is declared at the root, and every
      // security scheme an operation names exists in components.
      const declaredTags = new Set((document.tags ?? []).map((tag) => tag.name));
      const declaredSchemes = new Set(Object.keys(document.components?.securitySchemes ?? {}));
      expect(declaredSchemes).toEqual(new Set(["sessionCookie", "opsBearer", "provisioningBearer", "scimBearer"]));
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

  it("documents the docs endpoint itself as requiring no security", async () => {
    await withDocsRoute("sena-docs-route-selfdoc-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const self = document.paths?.["/api/sena/docs"]?.get;

      // The row's "public, no auth" claim has to survive into the contract SENA
      // publishes, or an integrator generates a client that sends credentials
      // the endpoint never wanted.
      expect(Object.keys(document.paths?.["/api/sena/docs"] ?? {})).toEqual(["get"]);
      expect(self?.security).toEqual([]);
      expect(self?.parameters).toBeUndefined();

      // A session-authenticated mutation is the contrast case: it does carry a
      // security requirement and the CSRF header parameter.
      const projectPut = document.paths?.["/api/sena/projects/{projectId}"]?.put;
      expect(projectPut?.security).toEqual([{ sessionCookie: [] }]);
      expect(projectPut?.parameters).toEqual([
        expect.objectContaining({ name: "x-sena-csrf-token", in: "header", required: true })
      ]);
    });
  });

  it("DEFECT (unfixed): templated paths declare no `in: \"path\"` parameter", async () => {
    await withDocsRoute("sena-docs-route-pathparams-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const paths = document.paths ?? {};

      const templated = Object.keys(paths).filter((key) => key.includes("{"));
      // Guard against a vacuous pass: if the surface ever stops having
      // templated paths, this case must fail loudly rather than pretend the
      // defect went away.
      expect(templated.sort()).toEqual([
        "/api/sena/projects/{projectId}",
        "/api/sena/projects/{projectId}/collaboration",
        "/api/sena/projects/{projectId}/collaboration/stream",
        "/api/sena/scim/v2/Groups/{resourceId}",
        "/api/sena/scim/v2/Users/{resourceId}"
      ]);

      // OpenAPI 3.1 §4.8.9.1: "Each template expression in the path MUST
      // correspond to a path parameter that is included in the Path Item itself
      // and/or in each of the Path Item's Operations", and such a parameter MUST
      // have `required: true`. buildSenaOpenApiDocument emits none, so this
      // document is NOT a valid OpenAPI 3.1 document and linters/codegen
      // (Spectral, Redocly, openapi-generator) reject or mis-generate it.
      //
      // This block PINS THE DEFECT — it documents what ships today, it does not
      // bless it. The fix belongs in lib/sena/api-docs.ts
      // (buildSenaOpenApiDocument), which is outside this change's blast radius.
      // When that lands, invert these three expectations.
      const missing: string[] = [];
      for (const pathKey of templated) {
        const expressions = [...pathKey.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
        const itemLevel = (paths[pathKey] as { parameters?: Array<{ in?: string; name?: string }> }).parameters ?? [];
        for (const [method, operation] of Object.entries(paths[pathKey])) {
          if (!httpMethodKeys.includes(method)) continue;
          const declared = new Set([...itemLevel, ...(operation.parameters ?? [])]
            .filter((parameter) => parameter.in === "path")
            .map((parameter) => parameter.name));
          for (const expression of expressions) {
            if (!declared.has(expression)) missing.push(`${method.toUpperCase()} ${pathKey} -> {${expression}}`);
          }
        }
      }
      expect(missing).toContain("GET /api/sena/projects/{projectId} -> {projectId}");
      // Every method of every templated path is affected, not just one:
      // 4 on the project resource, 2 + 1 on collaboration, 4 + 4 on SCIM.
      expect(missing).toHaveLength(15);
    });
  });

  it("DEFECT (unfixed): GET operations are documented with a request body", async () => {
    await withDocsRoute("sena-docs-route-getbody-", async ({ route }) => {
      const document = await (await route.GET(new Request(`${docsUrl}?format=openapi`))).json() as OpenApiDocument;
      const paths = document.paths ?? {};

      const getsWithBody = Object.entries(paths)
        .filter(([, item]) => item.get?.requestBody !== undefined)
        .map(([pathKey]) => pathKey)
        .sort();

      // OpenAPI 3.1: requestBody "has no defined semantics" for GET, and tools
      // that honour it generate clients that attach a body to a GET. The
      // generator attaches one to every endpoint that has an evidence note,
      // including this very docs endpoint — whose note describes a *query
      // string*, not a body.
      //
      // PINS THE DEFECT. The evidence note belongs in `parameters` (in: query)
      // for GET, not in `requestBody`. Fix lives in lib/sena/api-docs.ts.
      expect(getsWithBody).toContain("/api/sena/docs");
      expect(paths["/api/sena/docs"]?.get?.requestBody).toEqual(expect.objectContaining({
        required: false,
        content: expect.objectContaining({
          "application/json": expect.objectContaining({
            schema: expect.objectContaining({ description: "Query { format?: openapi }" })
          }),
          // A GET documented as accepting multipart/form-data is the same bug,
          // one step louder.
          "multipart/form-data": expect.anything()
        })
      }));
      expect(getsWithBody.length).toBeGreaterThan(1);
    });
  });
});
