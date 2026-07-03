import { createHash, timingSafeEqual } from "node:crypto";
import { requireApiCsrf, requireApiSession } from "./api-helpers";
import { SenaEnterpriseError } from "./enterprise";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest();
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

function configuredOpsTokens() {
  return [
    process.env.SENA_OPS_TOKEN?.trim(),
    process.env.SENA_OPS_AUTOMATION_TOKEN?.trim()
  ].filter((value): value is string => Boolean(value));
}

function opsTokenMatches(configuredTokens: string[], provided: string) {
  const providedHash = hashToken(provided);
  return configuredTokens.some((configured) => timingSafeEqual(hashToken(configured), providedHash));
}

export async function requireOpsAccess(request: Request) {
  const configuredTokens = configuredOpsTokens();
  if (configuredTokens.length === 0) {
    await requireApiSession();
    return { mode: "session" as const };
  }
  const provided = bearerToken(request);
  if (!provided) {
    throw new SenaEnterpriseError("Ops bearer token is required.", 401, "ops_token_required");
  }
  if (!opsTokenMatches(configuredTokens, provided)) {
    throw new SenaEnterpriseError("Ops bearer token is invalid.", 401, "ops_token_invalid");
  }
  return { mode: "bearer" as const };
}

export async function requireOpsMutationAccess(request: Request) {
  const configuredTokens = configuredOpsTokens();
  if (configuredTokens.length === 0) {
    const context = await requireApiSession();
    await requireApiCsrf(request, context);
    return { mode: "session" as const };
  }
  return await requireOpsAccess(request);
}
