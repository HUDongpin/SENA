import { SENA_API_EVIDENCE_NOTES } from "./api-evidence-notes";
import {
  SENA_API_ENDPOINT_FACTS,
  SENA_API_GROUPS,
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
  if (auth === "provisioning-bearer") return [{ provisioningBearer: [] }];
  if (auth === "scim-bearer") return [{ scimBearer: [] }];
  if (auth === "session-or-ops-bearer") return [{ sessionCookie: [] }, { opsBearer: [] }];
  return [{ sessionCookie: [] }];
}

function csrfRequiredForMethod(endpoint: SenaApiEndpoint, method: SenaApiMethod) {
  return method !== "GET" && (endpoint.auth === "session" || endpoint.auth === "session-or-ops-bearer");
}

export function buildSenaOpenApiDocument(input: { serverUrl?: string } = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of SENA_API_ENDPOINTS) {
    paths[endpoint.path] ??= {};
    for (const method of endpoint.methods) {
      paths[endpoint.path][method.toLowerCase()] = {
        tags: [SENA_API_GROUPS.find((group) => group.id === endpoint.group)?.title ?? endpoint.group],
        operationId: `${endpoint.id}-${method.toLowerCase()}`,
        summary: endpoint.summary,
        security: securityFor(endpoint.auth),
        ...(csrfRequiredForMethod(endpoint, method) ? {
          parameters: [
            {
              name: "x-sena-csrf-token",
              in: "header",
              required: endpoint.auth === "session",
              schema: { type: "string" },
              description: "Token returned by GET /api/auth/csrf for cookie-auth browser mutations. Bearer-token ops calls may omit it."
            }
          ]
        } : {}),
        ...(endpoint.request ? {
          requestBody: {
            required: !["GET", "DELETE"].includes(method),
            content: {
              "application/json": { schema: { type: "object", description: endpoint.request } },
              "multipart/form-data": { schema: { type: "object", description: endpoint.request } }
            }
          }
        } : {}),
        responses: {
          "200": {
            description: endpoint.responses.join("; "),
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: endpoint.responses.join("; ")
                }
              }
            }
          }
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
