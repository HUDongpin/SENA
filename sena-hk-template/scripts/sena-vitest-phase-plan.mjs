export const SENA_VITEST_SERIAL_TEST_FILES = Object.freeze([
  "lib/sena/__tests__/analysis-route.test.ts",
  "lib/sena/__tests__/snapshot-restore-route-round21.test.ts",
  "lib/sena/__tests__/enterprise-go-live.test.ts",
  "lib/sena/__tests__/enterprise.test.ts",
  "lib/sena/__tests__/publication-reliability-evidence-route-round14.test.ts"
]);

const SENA_VITEST_MAX_PARALLEL_WORKERS = 4;

export function buildSenaVitestPhaseArgs(requestedArgs, availableCpuCount) {
  if (!Array.isArray(requestedArgs) || requestedArgs.some((argument) => typeof argument !== "string")) {
    throw new TypeError("Vitest arguments must be an array of strings.");
  }
  if (requestedArgs.length > 0) return [[...requestedArgs]];
  if (!Number.isSafeInteger(availableCpuCount) || availableCpuCount < 1) {
    throw new TypeError("Available CPU count must be a positive integer.");
  }

  // Several end-to-end files spawn process-heavy recovery and evidence probes.
  // Keep the broad suite parallel with bounded host contention, then run the
  // five known long files once in an explicitly serial phase.
  const parallelTestWorkers = Math.min(SENA_VITEST_MAX_PARALLEL_WORKERS, availableCpuCount);
  return [
    [
      "--maxWorkers",
      String(parallelTestWorkers),
      ...SENA_VITEST_SERIAL_TEST_FILES.flatMap((testFile) => ["--exclude", testFile])
    ],
    ["--no-file-parallelism", ...SENA_VITEST_SERIAL_TEST_FILES]
  ];
}
