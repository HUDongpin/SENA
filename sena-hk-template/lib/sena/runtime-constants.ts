import type { SenaNumericalRuntime, SenaRuntimeProvenance } from "./types";

export const SENA_DETERMINISTIC_NUMERICAL_RUNTIME: SenaNumericalRuntime = "sena-deterministic-v1";

/** Validate before any early return or recoverable analytical failure. */
export function assertSenaNumericalRuntime(value: unknown): asserts value is SenaNumericalRuntime | undefined {
  if (value !== undefined && value !== SENA_DETERMINISTIC_NUMERICAL_RUNTIME) {
    throw new Error("SENA numericalRuntime is not supported.");
  }
}

export const senaMatrixFormula: SenaRuntimeProvenance["senaModel"]["matrixFormula"] = "A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]";

// Exact published versions of the local JavaScript analysis runtimes. Both
// are pinned exactly in package.json (jena-js from the npm registry; sna.js
// as an npm alias of @peterhudongpin/sna.js). Every value below is a literal:
// importing package.json or the R parity fixtures here would inline them into
// the client workspace chunk. The provenance test in
// lib/sena/__tests__/sena.test.ts re-derives each value from the real
// package.json, the installed node_modules manifests, and the fixture files,
// so the reproducibility record cannot drift from the running code.
export const jenaRuntimeVersion = "0.6.2";

export const snaRuntimeVersion = "0.4.0";

export const snaRuntimePackageName = "@peterhudongpin/sna.js";

export const jenaRuntimeExpectedDependencySpec = jenaRuntimeVersion;

export const snaRuntimeExpectedDependencySpec = `npm:${snaRuntimePackageName}@${snaRuntimeVersion}`;

export const jenaRuntimeDependencySpec = jenaRuntimeExpectedDependencySpec;

export const snaRuntimeDependencySpec = snaRuntimeExpectedDependencySpec;

export const senaRuntimeProvenance: SenaRuntimeProvenance = {
  parityEvidence: [
    {
      id: "jena-rena-sample-parity",
      referenceRuntime: "rENA",
      fixturePath: "lib/ena/__fixtures__/r-ena-sample-parity.json",
      generatedBy: "scripts/generate-ena-r-parity-fixture.R",
      status: "covered",
      coverage: [
        "lineWeights",
        "connectionCounts",
        "variance",
        "unitPoints",
        "nodePositions"
      ],
      sample: {
        units: 6,
        codes: 7,
        dimensions: 2,
        lineWeightRows: 6,
        lineWeightColumns: 21,
        connectionCountRows: 6,
        connectionCountColumns: 21
      },
      interpretation: "Development-time rENA fixture parity for the local jENA engine; the SENA website still runs local JavaScript and does not require a live R runtime."
    },
    {
      id: "jsna-r-sna-social-parity",
      referenceRuntime: "R sna + igraph",
      fixturePath: "lib/sena/__fixtures__/r-sna-social-parity.json",
      generatedBy: "scripts/generate-sena-sna-r-parity-fixture.R",
      status: "covered",
      coverage: [
        "degree",
        "weightedDegree",
        "betweenness",
        "closeness",
        "reachable",
        "reciprocity",
        "averagePathLength",
        "components",
        "communities"
      ],
      sample: {
        graphFamilies: 5
      },
      interpretation: "Development-time R sna and igraph fixture parity for local jSNA/sna.js social metrics; the SENA website still runs local JavaScript and does not require a live R runtime."
    }
  ],
  senaModel: {
    engine: "sena-js",
    implementation: "lib/sena/model.ts",
    matrixFormula: senaMatrixFormula
  },
  enaRuntime: {
    engine: "jena-js",
    version: jenaRuntimeVersion,
    packageName: "jena-js",
    dependencySpec: jenaRuntimeDependencySpec,
    packagePath: "node_modules/jena-js/package.json",
    runtimeRole: "browser-and-node-javascript-ena-engine",
    apiSurface: ["ena()"]
  },
  snaRuntime: {
    engine: "sna.js",
    version: snaRuntimeVersion,
    packageName: snaRuntimePackageName,
    dependencySpec: snaRuntimeDependencySpec,
    packagePath: "node_modules/sna.js/package.json",
    runtimeRole: "browser-and-node-javascript-sna-engine",
    apiSurface: [
      "gden()",
      "nties()",
      "degree()",
      "betweenness()",
      "reachability()",
      "averagePathLength()",
      "labelPropagation()",
      "components()",
      "isConnected()",
      "geodist()",
      "grecip()"
    ]
  },
  notes: [
    "SENA runs local JavaScript analysis packages in the website runtime; it does not require a live R process.",
    "R-derived fixtures are used for development-time parity checks where available.",
    "Report readers should treat jENA and sna.js versions as part of the reproducibility record."
  ]
};

/** Preserve the native record exactly; an explicit profile declares its adapter. */
export function senaRuntimeProvenanceFor(numericalRuntime?: SenaNumericalRuntime): SenaRuntimeProvenance {
  assertSenaNumericalRuntime(numericalRuntime);
  if (numericalRuntime === undefined) return senaRuntimeProvenance;
  return {
    ...senaRuntimeProvenance,
    numericalRuntime,
    senaModel: { ...senaRuntimeProvenance.senaModel, numericalRuntime },
    enaRuntime: {
      ...senaRuntimeProvenance.enaRuntime,
      apiSurface: ["buildSenaDeterministicEnaSet()", "accumulateData()", "makeSet()", "projectIn()", "senaDeterministicEnaCorrelations()"],
      numericalAdapter: {
        profile: numericalRuntime,
        implementation: "lib/sena/deterministic-ena.ts",
        basis: "SENA algebraic cyclic Jacobi SVD with complete full basis; ordered mean direction with Householder completion and residual SVD",
        primitives: ["log", "log1p", "atanh", "tanh"],
        primitiveImplementation: "lib/sena/deterministic-numerics.ts"
      }
    },
    parityEvidence: senaRuntimeProvenance.parityEvidence.map((entry) => entry.id === "jena-rena-sample-parity" ? {
      ...entry,
      interpretation: "The rENA fixture covers the pinned native jENA engine; separate deterministic adapter tests reuse this fixture for connection counts, line weights, sign-aligned unit and node positions, and conditional 2D variance within their declared tolerances. Complete-basis variance is checked separately. Native parity does not establish universal adapter parity or exact cross-engine replay; adapter replay is tested separately."
    } : entry),
    notes: [
      ...senaRuntimeProvenance.notes,
      "The explicit SENA numerical adapter replaces ENA basis estimation and default Fisher interval primitives; published jena-js 0.6.2 still performs accumulation, normalization, projection, node placement and full-basis variance.",
      "SENA model log normalization and epistemic entropy use fixed primitives for this profile. jSNA metrics and public jENA square-root and linear-algebra operations remain native."
    ]
  };
}
