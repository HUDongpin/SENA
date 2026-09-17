/**
 * Single writable view of `process.env` for tests. Next.js keeps
 * `process.env.NODE_ENV` required+readonly; do not scatter `as Record` casts.
 */
export function senaTestProcessEnv(): SenaTestProcessEnv {
  return process.env as SenaTestProcessEnv;
}
