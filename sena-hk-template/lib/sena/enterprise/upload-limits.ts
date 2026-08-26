import { SENA_RELIABILITY_UNIVERSE_LIMITS } from "../reliability";

export const SENA_DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export function senaEnterpriseUploadMaxBytes() {
  const configured = process.env.SENA_UPLOAD_MAX_BYTES;
  if (configured === undefined || configured.trim() === "") return SENA_DEFAULT_UPLOAD_MAX_BYTES;
  const parsed = Number(configured);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : SENA_DEFAULT_UPLOAD_MAX_BYTES;
}

/** One server-side per-source boundary shared by reliability admission and the
 * enterprise upload scanner. The stricter configured value always wins. */
export function senaReliabilityServerSourceByteLimit() {
  return Math.min(
    SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes,
    senaEnterpriseUploadMaxBytes()
  );
}
