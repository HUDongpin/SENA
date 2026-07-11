import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sena/kernel": path.resolve(__dirname, "packages/sena-kernel/index.ts"),
      "@": path.resolve(__dirname)
    }
  }
});
