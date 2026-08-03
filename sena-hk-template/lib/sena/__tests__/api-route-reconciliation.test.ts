import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SENA_UNDOCUMENTED_API_ROUTES } from "../api-route-coverage";
import { SENA_IMPLEMENTED_API_ROUTES } from "../api-route-manifest";

/**
 * Reconciles the API route files on disk against SENA_IMPLEMENTED_API_ROUTES in
 * BOTH directions.
 *
 * Why this file exists (Ledger Q1): api-docs.test.ts's "documents every route"
 * check derives both of its sides from the hand-maintained api-route-facts.ts,
 * so a route file that was simply never declared cannot fail it. That check is
 * green today while `app/api/sena/ops/jobs/worker/route.ts` ships undeclared.
 * The fix is structural: one side of this check MUST come from the filesystem.
 *
 * Escape class EC-11 (page/route-import holes; broke main twice).
 */

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// Next.js resolves a route handler from any of these extensions. Matching only
// "route.ts" would let a route authored as route.tsx sit undeclared and
// invisible to this check — the precise hole this test exists to close.
const ROUTE_FILE_NAMES = new Set(
  ["ts", "tsx", "js", "jsx", "mjs"].map((extension) => `route.${extension}`)
);

const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "__tests__", ".claude", ".worktrees"]);

const appApiDirectory = path.join(process.cwd(), "app", "api");

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      return SKIP_DIRECTORIES.has(entry) ? [] : collectRouteFiles(absolute);
    }
    return ROUTE_FILE_NAMES.has(entry) ? [absolute] : [];
  });
}

/** `app/api/sena/projects/[projectId]/route.ts` -> `/api/sena/projects/{projectId}` */
function routeUrlFromFile(absolute: string) {
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
  return `/${relative
    .replace(/^app\//, "")
    .replace(/\/route\.(ts|tsx|js|jsx|mjs)$/, "")
    .replace(/\[([^\]]+)\]/g, "{$1}")}`;
}

function repoRelative(absolute: string) {
  return path.relative(process.cwd(), absolute).split(path.sep).join("/");
}

function exportedHttpMethods(absolute: string) {
  const source = readFileSync(absolute, "utf8");
  return HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`).test(source)
  );
}

const routeFiles = collectRouteFiles(appApiDirectory);
const onDiskRoutes = routeFiles.map((absolute) => ({
  path: routeUrlFromFile(absolute),
  sourceFile: repoRelative(absolute),
  methods: exportedHttpMethods(absolute)
}));

const declaredPaths = new Set(SENA_IMPLEMENTED_API_ROUTES.map((route) => route.path));
const undocumentedPaths = new Set(SENA_UNDOCUMENTED_API_ROUTES.map((route) => route.path));

describe("SENA API route reconciliation (disk <-> manifest)", () => {
  // Vacuity guard first (H13/H28/perf-T3 lesson): every assertion below is a
  // filter over `onDiskRoutes`, so all of them pass trivially if the walk
  // returns nothing. Prove the walk actually found the API tree before
  // asserting anything about it.
  it("actually walked the API route tree", () => {
    expect(existsSync(appApiDirectory)).toBe(true);
    expect(routeFiles.length).toBeGreaterThanOrEqual(60);
    expect(onDiskRoutes.map((route) => route.path)).toContain("/api/sena/ops/jobs");
    // A route file with no exported HTTP method would mean the method extractor
    // silently matched nothing, making the method assertion below vacuous too.
    const methodless = onDiskRoutes.filter((route) => route.methods.length === 0);
    expect(methodless.map((route) => route.sourceFile)).toEqual([]);
  });

  it("declares or explicitly excludes every route file on disk", () => {
    const offenders = onDiskRoutes
      .filter((route) => !declaredPaths.has(route.path) && !undocumentedPaths.has(route.path))
      .map((route) => `${route.sourceFile}: ${route.path} is in neither the facts manifest nor SENA_UNDOCUMENTED_API_ROUTES`);
    expect(offenders).toEqual([]);
  });

  it("resolves every manifest entry to a route file on disk", () => {
    const offenders = SENA_IMPLEMENTED_API_ROUTES.filter(
      (route) => !existsSync(path.join(process.cwd(), route.sourceFile))
    ).map((route) => `${route.id}: declared sourceFile ${route.sourceFile} does not exist`);
    expect(offenders).toEqual([]);
  });

  it("agrees with each route file about which HTTP methods it exports", () => {
    const byPath = new Map(onDiskRoutes.map((route) => [route.path, route]));
    const offenders = SENA_IMPLEMENTED_API_ROUTES.flatMap((route) => {
      const onDisk = byPath.get(route.path);
      if (!onDisk) return [];
      const declared = [...route.methods].sort();
      const actual = [...onDisk.methods].sort();
      return declared.join(",") === actual.join(",")
        ? []
        : [`${route.path}: manifest=[${declared.join(",")}] disk=[${actual.join(",")}]`];
    });
    expect(offenders).toEqual([]);
  });

  describe("undocumented-route exclusions cannot rot", () => {
    it("names only routes that still exist on disk", () => {
      const onDiskPaths = new Set(onDiskRoutes.map((route) => route.path));
      const offenders = SENA_UNDOCUMENTED_API_ROUTES.filter(
        (route) => !onDiskPaths.has(route.path) || !existsSync(path.join(process.cwd(), route.sourceFile))
      ).map((route) => `${route.path}: excluded but no longer on disk (${route.sourceFile})`);
      expect(offenders).toEqual([]);
    });

    it("names only routes that are still absent from the facts manifest", () => {
      const offenders = SENA_UNDOCUMENTED_API_ROUTES.filter((route) => declaredPaths.has(route.path)).map(
        (route) => `${route.path}: now documented — remove it from SENA_UNDOCUMENTED_API_ROUTES`
      );
      expect(offenders).toEqual([]);
    });

    it("carries a reason and an owner for each exclusion", () => {
      const offenders = SENA_UNDOCUMENTED_API_ROUTES.filter(
        (route) => route.reason.trim().length < 40 || route.owner.trim().length === 0
      ).map((route) => `${route.path}: exclusions need a substantive reason and a named owner`);
      expect(offenders).toEqual([]);
    });

    it("stays small enough that drift is visible", () => {
      // Not a style rule: a growing exclusion list is the signal that the
      // documented surface is drifting from the shipped one. Raising this bound
      // is a deliberate act that shows up in review.
      expect(SENA_UNDOCUMENTED_API_ROUTES.length).toBeLessThanOrEqual(3);
    });
  });
});
