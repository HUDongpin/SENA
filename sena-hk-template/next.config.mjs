import { fileURLToPath } from "node:url";
import { generateSenaNextBuildId } from "./lib/sena/enterprise/performance-build-identity.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => generateSenaNextBuildId(projectRoot),
  turbopack: {
    root: projectRoot
  }
};

export default nextConfig;
