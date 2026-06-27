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

export async function requireOpsAccess(request: Request) {
  const configured = process.env.SENA_OPS_TOKEN?.trim();
  if (!configured) {
    await requireApiSession();
    return { mode: "session" as const };
  }
  const provided = bearerToken(request);
  if (!provided) {
    throw new SenaEnterpriseError("Ops bearer token is required.", 401, "ops_token_required");
  }
  if (!timingSafeEqual(hashToken(configured), hashToken(provided))) {
    throw new SenaEnterpriseError("Ops bearer token is invalid.", 401, "ops_token_invalid");
  }
  return { mode: "bearer" as const };
}

export async function requireOpsMutationAccess(request: Request) {
  const configured = process.env.SENA_OPS_TOKEN?.trim();
  if (!configured) {
    const context = await requireApiSession();
    requireApiCsrf(request, context);
    return { mode: "session" as const };
  }
  return await requireOpsAccess(request);
}
