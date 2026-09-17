/// <reference types="vitest/globals" />

declare namespace NodeJS {
  interface ProcessEnv {
    // Next.js types NODE_ENV as required + readonly (`development` | `production` |
    // `test`). Test helpers construct partial env bags (`cleanEnv({})`) and
    // assign/unset NODE_ENV. Keep the Next union; allow omission so those bags
    // typecheck without scattered `Partial<>` / `as Record<...>` casts.
    NODE_ENV?: "development" | "production" | "test";
  }
}

/**
 * Writable env bag for Vitest helpers. `process.env.NODE_ENV` stays readonly
 * via Next.js; tests should assign through this type or `vi.stubEnv`.
 */
type SenaTestProcessEnv = {
  -readonly [K in keyof NodeJS.ProcessEnv]?: NodeJS.ProcessEnv[K];
};
