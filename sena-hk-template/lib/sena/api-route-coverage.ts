/**
 * Routes that exist on disk under `app/api` but are deliberately absent from
 * SENA_API_ENDPOINT_FACTS, and therefore from SENA_IMPLEMENTED_API_ROUTES, the
 * generated OpenAPI document, and the /api/sena/docs output.
 *
 * This list exists so that the disk-vs-manifest reconciliation in
 * `api-route-reconciliation.test.ts` can be exhaustive without either lying
 * about the documented surface or silently tolerating a gap. Every route file
 * on disk must be EITHER declared in the facts manifest OR named here with a
 * reason and an owner — there is no third state.
 *
 * The reconciliation test enforces three anti-rot properties against this list,
 * because an exclusion list is exactly the mechanism that could silence the
 * escape class it was built to catch:
 *   1. every entry still exists on disk (a deleted route may not linger here);
 *   2. no entry is also declared in the facts manifest (once a route is
 *      documented, its entry here must be removed, not left to rot);
 *   3. the list stays small — growth is the signal that the documented surface
 *      is drifting from the shipped one.
 */

export type SenaUndocumentedApiRoute = {
  /** Route URL as Next.js serves it. */
  path: string;
  /** Repo-relative path to the route file, as the reconciliation walker reports it. */
  sourceFile: string;
  /** Why this route is not part of the documented API surface. */
  reason: string;
  /** Who owns resolving it: a TL-row id, a Peter-decision number, or "permanent". */
  owner: string;
};

export const SENA_UNDOCUMENTED_API_ROUTES: readonly SenaUndocumentedApiRoute[] = [
  {
    path: "/api/sena/ops/jobs/worker",
    sourceFile: "app/api/sena/ops/jobs/worker/route.ts",
    reason:
      "Internal worker callback: authenticated by an HMAC over the request body using " +
      "SENA_JOB_QUEUE_SECRET, not by any of the five SenaApiAuthMode values, so it cannot be " +
      "declared in SENA_API_ENDPOINT_FACTS without widening that union. Its three cluster " +
      "siblings (jobs, worker-contract, worker-heartbeat) and jobs/probe ARE declared, so the " +
      "omission reads as an oversight rather than a policy — but publishing an internal " +
      "queue callback in the documented surface is a product decision, not a test fix. " +
      "Found by the TL-B1 reconciliation check on first run; recorded as Q8.",
    owner: "Peter decision 12 (document it, or affirm it as permanently internal)"
  }
] as const;
