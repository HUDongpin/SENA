import {
  SENA_API_ENDPOINT_FACTS,
  type SenaApiAuthMode,
  type SenaApiMethod
} from "./api-route-facts";

export type SenaApiMutationProtection = "not-required" | "csrf-or-ops-mutation-access";

export type SenaImplementedApiRoute = {
  id: string;
  path: string;
  methods: SenaApiMethod[];
  auth: SenaApiAuthMode;
  sourceFile: string;
  mutationProtection: SenaApiMutationProtection;
  sessionCookie?: {
    name: "sena_session";
    maxAgeSource: "session.expiresAt";
    optionsHelper: "sessionCookieOptions";
    maxAgeHelper: "sessionCookieMaxAgeSeconds";
  };
};

function routeSourceFile(apiPath: string) {
  const nextPath = apiPath
    .replace(/^\//, "")
    .replace(/\{([^}]+)\}/g, "[$1]");
  return `app/${nextPath}/route.ts`;
}

function mutationProtection(auth: SenaApiAuthMode, methods: SenaApiMethod[]): SenaApiMutationProtection {
  const mutates = methods.some((method) => method !== "GET");
  if (!mutates) return "not-required";
  return auth === "session" || auth === "session-or-ops-bearer"
    ? "csrf-or-ops-mutation-access"
    : "not-required";
}

function sessionCookieContract(endpointId: string): SenaImplementedApiRoute["sessionCookie"] {
  if (!new Set(["auth-login", "auth-register", "auth-sso", "auth-sso-callback"]).has(endpointId)) {
    return undefined;
  }
  return {
    name: "sena_session",
    maxAgeSource: "session.expiresAt",
    optionsHelper: "sessionCookieOptions",
    maxAgeHelper: "sessionCookieMaxAgeSeconds"
  };
}

export const SENA_IMPLEMENTED_API_ROUTES: SenaImplementedApiRoute[] = SENA_API_ENDPOINT_FACTS.map((endpoint) => ({
  id: endpoint.id,
  path: endpoint.path,
  methods: endpoint.methods,
  auth: endpoint.auth,
  sourceFile: routeSourceFile(endpoint.path),
  mutationProtection: mutationProtection(endpoint.auth, endpoint.methods),
  sessionCookie: sessionCookieContract(endpoint.id)
}));
