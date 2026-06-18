import { createHash, timingSafeEqual } from "node:crypto";
import { SenaEnterpriseError } from "./enterprise";

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest();
}

function configuredProvisioningToken() {
  const token = process.env.SENA_PROVISIONING_TOKEN?.trim();
  return token || undefined;
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

export function requireProvisioningBearerToken(request: Request) {
  const configured = configuredProvisioningToken();
  if (!configured) {
    throw new SenaEnterpriseError("SENA provisioning token is not configured.", 503, "provisioning_not_configured");
  }
  const provided = bearerToken(request);
  if (!provided) {
    throw new SenaEnterpriseError("Provisioning bearer token is required.", 401, "provisioning_token_required");
  }
  const expectedHash = tokenHash(configured);
  const providedHash = tokenHash(provided);
  if (!timingSafeEqual(expectedHash, providedHash)) {
    throw new SenaEnterpriseError("Provisioning bearer token is invalid.", 401, "provisioning_token_invalid");
  }
}
