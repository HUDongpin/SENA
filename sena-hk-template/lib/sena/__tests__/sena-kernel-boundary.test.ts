import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  buildSenaAnalysisRun,
  buildSenaFusionAdjacency,
  buildSenaModel,
  normalizeSenaMatrix,
  SENA_KERNEL_PACKAGE,
  senaCommuteTimeEmbeddingDiagnostics,
  senaSchoenbergMdsDiagnostics
} from "@sena/kernel";
import { exampleSenaContract } from "../sample-data";

describe("SENA analytics kernel boundary", () => {
  it("exposes a versioned private kernel package for analytical M2-M8 functions", () => {
    const root = process.cwd();
    const packageJsonPath = join(root, "packages/sena-kernel/package.json");
    const readmePath = join(root, "packages/sena-kernel/README.md");
    const routeSource = readFileSync(join(root, "app/api/sena/analyze/route.ts"), "utf8");
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name: string; version: string };

    expect(existsSync(readmePath)).toBe(true);
    expect(packageJson.name).toBe("@sena/kernel");
    expect(packageJson.version).toBe(SENA_KERNEL_PACKAGE.version);
    expect(SENA_KERNEL_PACKAGE.moduleMap).toEqual([
      "M2 data contract",
      "M3 layer construction",
      "M4 fusion assembly",
      "M5 graph operators",
      "M6 embedding diagnostics",
      "M7 temporal runtime",
      "M8 provenance envelope"
    ]);
    expect(typeof buildSenaModel).toBe("function");
    expect(typeof buildSenaFusionAdjacency).toBe("function");
    expect(typeof normalizeSenaMatrix).toBe("function");
    expect(typeof senaSchoenbergMdsDiagnostics).toBe("function");
    expect(typeof senaCommuteTimeEmbeddingDiagnostics).toBe("function");
    expect(typeof buildSenaAnalysisRun).toBe("function");
    expect(tsconfig.compilerOptions?.paths?.["@sena/kernel"]).toEqual(["./packages/sena-kernel/index.ts"]);
    expect(routeSource).toContain('from "@sena/kernel"');
    expect(routeSource).not.toContain('from "@/packages/sena-kernel"');
  });

  it("keeps the server analysis path executable through the kernel boundary", () => {
    const run = buildSenaAnalysisRun({
      dataset: exampleSenaContract,
      title: "Kernel boundary smoke"
    });

    expect(run.summary.title).toBe("Kernel boundary smoke");
    expect(run.provenanceEnvelope.schemaVersion).toBe("sena-analysis-provenance-envelope/v1");
    expect(run.report.modelCard.schemaVersion).toBe("sena-model-card/v2");
  });
});
