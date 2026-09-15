import { fileURLToPath } from "node:url";
import { generateSenaNextBuildId } from "./lib/sena/enterprise/performance-build-identity.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const schemaRegistryPath = fileURLToPath(new URL("./lib/sena/schema-registry.ts", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => generateSenaNextBuildId(projectRoot),
  webpack(config, { dev, isServer }) {
    if (dev || isServer) return config;
    const splitChunks = config.optimization?.splitChunks;
    if (!splitChunks || typeof splitChunks !== "object") {
      throw new Error("Schema registry sharing requires existing production client splitChunks.");
    }
    splitChunks.cacheGroups = {
      ...splitChunks.cacheGroups,
      senaSchemaRegistry: {
        test: (module) => module.nameForCondition?.() === schemaRegistryPath,
        name: "sena-schema-registry",
        chunks: "all",
        enforce: true,
        reuseExistingChunk: true,
        priority: 20
      }
    };
    return config;
  },
  turbopack: {
    root: projectRoot
  }
};

export default nextConfig;
