import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Locate a file *inside an installed dependency* without assuming a node_modules
 * directory sits immediately beside the importing file.
 *
 * A git worktree has no install of its own. The worktrees this repo creates live
 * under `sena-hk-template/.claude/worktrees/<name>/`, so the clone's node_modules
 * is an ancestor directory — and Node's module search path already walks
 * ancestors. `require.resolve.paths()` hands us exactly that list of candidate
 * roots, so searching it finds the clone's install and a bare worktree can run
 * the suite without anyone symlinking packages in by hand.
 *
 * `require.resolve()` itself cannot be used for these files: vitest, jena-js and
 * sna.js all declare an "exports" map that does not expose the subpaths we need,
 * so resolving them throws ERR_PACKAGE_PATH_NOT_EXPORTED. Searching the candidate
 * roots on disk sidesteps the exports gate, which is legitimate here because the
 * callers want a file path to spawn or read, not a module to import.
 *
 * Pass `import.meta.url` as `fromUrl` so the walk starts at the calling file.
 */
export function resolveInstalledPackageFile(packageName: string, relativePath: string, fromUrl: string): string {
  const requireFrom = createRequire(fromUrl);
  for (const root of requireFrom.resolve.paths(packageName) ?? []) {
    const candidate = path.join(root, packageName, relativePath);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Cannot find ${packageName}/${relativePath} from any node_modules above ${fromUrl}. ` +
      `Run "npm ci" in sena-hk-template (or in the clone this worktree hangs from).`
  );
}
