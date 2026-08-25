import { SENA_API_EVIDENCE_NOTES } from "./api-evidence-notes";
import {
  SENA_API_ENDPOINT_FACTS,
  SENA_API_GROUPS,
  senaApiNormalResponsesFor,
  type SenaApiAuthMode,
  type SenaApiEndpointFact,
  type SenaApiMethod
} from "./api-route-facts";
import { SENA_API_SURFACE_MORATORIUM } from "./api-surface-moratorium";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";

export type { SenaApiAuthMode, SenaApiGroupId, SenaApiMethod } from "./api-route-facts";
export { SENA_API_GROUPS } from "./api-route-facts";

export type SenaApiEndpoint = Omit<SenaApiEndpointFact, "evidenceNoteId"> & {
  request?: string;
};

export const SENA_API_ENDPOINTS: SenaApiEndpoint[] = SENA_API_ENDPOINT_FACTS.map(({ evidenceNoteId, ...endpoint }) => (
  evidenceNoteId
    ? { ...endpoint, request: SENA_API_EVIDENCE_NOTES[evidenceNoteId] }
    : endpoint
));

function methodCount(endpoints = SENA_API_ENDPOINTS) {
  return endpoints.reduce((total, endpoint) => total + endpoint.methods.length, 0);
}

function groupedEndpointCounts() {
  return SENA_API_GROUPS.map((group) => {
    const endpoints = SENA_API_ENDPOINTS.filter((endpoint) => endpoint.group === group.id);
    return {
      ...group,
      endpointCount: endpoints.length,
      methodCount: methodCount(endpoints)
    };
  });
}

export function buildSenaApiDocumentation(input: { baseUrl?: string } = {}) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.apiDocumentation,
    generatedAt: new Date().toISOString(),
    baseUrl: input.baseUrl ?? "",
    summary: {
      endpointCount: SENA_API_ENDPOINTS.length,
      methodCount: methodCount(),
      groupCount: SENA_API_GROUPS.length,
      openApiPath: "/api/sena/docs?format=openapi",
      coveragePolicy: "Every Next route method under app/api must be represented by this manifest.",
      csrfPolicy: "Session-authenticated POST, PUT, PATCH, and DELETE requests require x-sena-csrf-token from /api/auth/csrf. Bearer-token service APIs do not use CSRF."
    },
    groups: groupedEndpointCounts(),
    surfaceMoratorium: SENA_API_SURFACE_MORATORIUM,
    endpoints: SENA_API_ENDPOINTS
  };
}
function securityFor(auth: SenaApiAuthMode) {
  if (auth === "public") return [];
  if (auth === "job-worker-hmac") return [{ jobWorkerHmac: [] }];
  if (auth === "provisioning-bearer") return [{ provisioningBearer: [] }];
  if (auth === "scim-bearer") return [{ scimBearer: [] }];
  if (auth === "session-or-ops-bearer") return [{ sessionCookie: [] }, { opsBearer: [] }];
  return [{ sessionCookie: [] }];
}

function csrfRequiredForMethod(endpoint: SenaApiEndpoint, method: SenaApiMethod) {
  return method !== "GET" && (endpoint.auth === "session" || endpoint.auth === "session-or-ops-bearer");
}

type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  schema: Record<string, unknown>;
  description: string;
};

const PATH_PARAMETER_DESCRIPTIONS: Record<string, string> = {
  projectId: "Identifier of the durable SENA project, as returned by GET /api/sena/projects.",
  resourceId: "SCIM 2.0 resource identifier (the resource's `id`) of the user or group."
};

/**
 * OpenAPI 3.1 §4.8.9.1: every template expression in a path MUST correspond to
 * a path parameter declared on the Path Item and/or on each of its Operations,
 * and that parameter MUST be `required: true`. Without these, linters error and
 * generated clients request the literal `%7BprojectId%7D`.
 */
function pathParametersFor(path: string): OpenApiParameter[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
    name,
    in: "path" as const,
    required: true,
    schema: { type: "string" },
    description: PATH_PARAMETER_DESCRIPTIONS[name] ?? `Value bound to the {${name}} path segment.`
  }));
}

function queryParametersFor(endpoint: SenaApiEndpoint, method: SenaApiMethod): OpenApiParameter[] {
  return (endpoint.queryParameters ?? [])
    .filter((parameter) => !parameter.methods || parameter.methods.includes(method))
    .map((parameter) => ({
      name: parameter.name,
      in: "query" as const,
      required: parameter.required ?? false,
      schema: {
        type: "string",
        ...(parameter.allowedValues ? { enum: parameter.allowedValues } : {}),
        ...(parameter.defaultValue ? { default: parameter.defaultValue } : {})
      },
      description: parameter.description
    }));
}

function headerParametersFor(endpoint: SenaApiEndpoint, method: SenaApiMethod): OpenApiParameter[] {
  return (endpoint.headerParameters ?? [])
    .filter((parameter) => !parameter.methods || parameter.methods.includes(method))
    .map((parameter) => ({
      name: parameter.name,
      in: "header" as const,
      required: parameter.required ?? false,
      schema: {
        type: "string",
        ...(parameter.allowedValues ? { enum: parameter.allowedValues } : {})
      },
      description: parameter.description
    }));
}

function csrfParametersFor(endpoint: SenaApiEndpoint, method: SenaApiMethod): OpenApiParameter[] {
  if (!csrfRequiredForMethod(endpoint, method)) return [];
  return [{
    name: "x-sena-csrf-token",
    in: "header" as const,
    required: endpoint.auth === "session",
    schema: { type: "string" },
    description: "Token returned by GET /api/auth/csrf for cookie-auth browser mutations. Bearer-token ops calls may omit it."
  }];
}

/**
 * One array, built by concatenation rather than by spreading two `parameters`
 * keys into the same operation object — four operations (PUT/PATCH/DELETE on
 * /api/sena/projects/{projectId} and POST on its collaboration child) need both
 * a path parameter and the CSRF header, and a second spread would drop one.
 */
function parametersFor(endpoint: SenaApiEndpoint, method: SenaApiMethod): OpenApiParameter[] {
  return [
    ...pathParametersFor(endpoint.path),
    ...queryParametersFor(endpoint, method),
    ...headerParametersFor(endpoint, method),
    ...csrfParametersFor(endpoint, method)
  ];
}

const DEFAULT_REQUEST_BODY_METHODS: SenaApiMethod[] = ["POST", "PUT", "PATCH"];

/**
 * OpenAPI 3.1 gives `requestBody` no defined semantics on GET, so a GET never
 * gets one; a DELETE only gets one when the fact says its handler reads a body.
 */
function requestBodyDocumented(endpoint: SenaApiEndpoint, method: SenaApiMethod) {
  if (!endpoint.request) return false;
  return (endpoint.requestBodyMethods ?? DEFAULT_REQUEST_BODY_METHODS).includes(method);
}

function openApiErrorResponses(endpoint: SenaApiEndpoint) {
  const grouped = new Map<number, NonNullable<SenaApiEndpoint["errorResponses"]>>();
  for (const error of endpoint.errorResponses ?? []) {
    grouped.set(error.status, [...(grouped.get(error.status) ?? []), error]);
  }
  return Object.fromEntries(Array.from(grouped, ([status, errors]) => [
    String(status),
    {
      description: errors.map((error) => `${error.code}: ${error.description}`).join("; "),
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["error", "code"],
            properties: {
              error: { type: "string" },
              code: {
                type: "string",
                enum: errors.map((error) => error.code)
              }
            }
          }
        }
      }
    }
  ]));
}

function openApiNormalResponseSchema(contentType: string) {
  if (contentType === "application/json" || contentType.endsWith("+json")) {
    return { type: "object" };
  }
  if (contentType.startsWith("text/") || contentType === "image/svg+xml") {
    return { type: "string" };
  }
  return { type: "string", format: "binary" };
}

function openApiNormalResponses(endpoint: SenaApiEndpoint, method: SenaApiMethod) {
  return Object.fromEntries(senaApiNormalResponsesFor(endpoint, method).map((response) => [
    String(response.status),
    {
      description: response.description ?? endpoint.responses.join("; "),
      ...(response.contentTypes.length > 0 ? {
        content: Object.fromEntries(response.contentTypes.map((contentType) => [
          contentType,
          {
            schema: {
              ...openApiNormalResponseSchema(contentType),
              description: endpoint.responses.join("; ")
            }
          }
        ]))
      } : {})
    }
  ]));
}

export function buildSenaOpenApiDocument(input: { serverUrl?: string } = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of SENA_API_ENDPOINTS) {
    paths[endpoint.path] ??= {};
    for (const method of endpoint.methods) {
      const parameters = parametersFor(endpoint, method);
      paths[endpoint.path][method.toLowerCase()] = {
        tags: [SENA_API_GROUPS.find((group) => group.id === endpoint.group)?.title ?? endpoint.group],
        operationId: `${endpoint.id}-${method.toLowerCase()}`,
        summary: endpoint.summary,
        security: securityFor(endpoint.auth),
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(requestBodyDocumented(endpoint, method) ? {
          requestBody: {
            required: method !== "DELETE",
            content: Object.fromEntries(
              (endpoint.requestBodyContentTypesByMethod?.[method] ?? ["application/json"])
                .map((contentType) => [contentType, { schema: { type: "object", description: endpoint.request } }])
            )
          }
        } : {}),
        responses: {
          ...openApiNormalResponses(endpoint, method),
          ...openApiErrorResponses(endpoint)
        }
      };
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "SENA Enterprise API",
      version: "1.0.0",
      summary: "Machine-readable contract for SENA auth, projects, analysis, imports, reliability, validation, exports, governance, ops, and provisioning APIs."
    },
    servers: [{ url: input.serverUrl ?? "" }],
    tags: SENA_API_GROUPS.map((group) => ({ name: group.title, description: group.description })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "sena_session"
        },
        opsBearer: {
          type: "http",
          scheme: "bearer",
          description: "Set SENA_OPS_TOKEN for deployment monitors."
        },
        jobWorkerHmac: {
          type: "apiKey",
          in: "header",
          name: "x-sena-webhook-signature",
          description: "HMAC-SHA256 over '<x-sena-webhook-timestamp>.<exact request body>' using SENA_JOB_QUEUE_SECRET; the payload SHA-256, timestamp, and event headers are also required."
        },
        provisioningBearer: {
          type: "http",
          scheme: "bearer",
          description: "Set SENA_PROVISIONING_TOKEN for provisioning and SCIM bridges."
        },
        scimBearer: {
          type: "http",
          scheme: "bearer",
          description: "Same bearer-token mechanism as the provisioning bridge."
        }
      }
    }
  };
}
