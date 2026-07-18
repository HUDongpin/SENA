import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sena/kernel": path.resolve(__dirname, "packages/sena-kernel/index.ts"),
      "@": path.resolve(__dirname)
    }
  },
  test: {
    // Several enterprise suites (e.g. enterprise-capability-audit) reload the
    // full enterprise module graph per test under vi.resetModules(). That work
    // occasionally exceeds Vitest's 5s default on a loaded machine, producing a
    // spurious timeout. Raise the floor so those runs stay deterministic.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
