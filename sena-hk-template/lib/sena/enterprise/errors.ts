import { SenaInputValidationError } from "../analytical-input-validation";
import { SenaReliabilityUniverseLimitError } from "../reliability";

export class SenaEnterpriseError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "sena_enterprise_error"
  ) {
    super(message);
  }
}

/**
 * The 500 body every SENA route emits for a throw nothing authored.
 *
 * A SenaEnterpriseError is a message the product wrote FOR the caller, so it is
 * published as-is. Anything else is an internal failure whose message was
 * written by a driver, a runtime, or a dependency, and publishing it hands the
 * caller whatever happens to be in it — the leak that motivated this was
 * `getaddrinfo ENOTFOUND db-internal.sena.invalid`, the deployment's internal
 * database hostname, returned to a caller who presented no credential. A
 * connection string, a filesystem path, a driver's view of a query, or a
 * TypeError naming an internal expression are all one unhandled throw away from
 * the same exit, on every route that funnels through this helper.
 *
 * So the body is fixed text and the real message is logged instead. It has to
 * be logged HERE: observeSenaApiRoute (lib/sena/api-helpers.ts) records only
 * routeId, method, statusCode, durationMs, requestId and this `code` into the
 * observability sample — there is no message field anywhere in that pipeline,
 * so without this the detail would be destroyed rather than relocated. `code`
 * is deliberately unchanged: it is what the sample is booked under and what
 * clients already switch on.
 */
const unexpectedEnterpriseErrorMessage = "Unexpected SENA enterprise error.";

function describeUnexpectedError(error: unknown) {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  try {
    return typeof error === "string" ? error : JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function enterpriseErrorResponse(error: unknown) {
  if (error instanceof SenaReliabilityUniverseLimitError) {
    return {
      body: {
        error: error.message,
        code: error.code,
        issues: error.issues.map(({ path, rule, actual, maximum }) => ({ path, rule, actual, maximum }))
      },
      status: error.status
    };
  }
  if (error instanceof SenaInputValidationError) {
    return {
      body: {
        error: "SENA analytical inputs violate the numeric domain.",
        code: "invalid_sena_numeric_domain",
        issues: error.issues.map(({ path, rule }) => ({ path, rule }))
      },
      status: 400
    };
  }
  if (error instanceof SenaEnterpriseError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status
    };
  }
  // Server-side only. Never added to the returned object: enterpriseErrorResponse
  // feeds response bodies directly (api-helpers.jsonError, observeSenaApiRoute,
  // app/api/sena/provisioning/route.ts), so a detail field on the result is one
  // spread away from being published again.
  console.error("[sena] unexpected enterprise error", describeUnexpectedError(error));
  return {
    body: { error: unexpectedEnterpriseErrorMessage, code: "unexpected_error" },
    status: 500
  };
}
