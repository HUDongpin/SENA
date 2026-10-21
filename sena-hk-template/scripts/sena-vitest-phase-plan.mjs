export const SENA_VITEST_SERIAL_TEST_FILES = Object.freeze([
  "lib/sena/__tests__/snapshot-restore-route-round21.test.ts",
  "lib/sena/__tests__/publication-reliability-evidence-route-round14.test.ts",
  "lib/sena/__tests__/production-evidence-bind-script.test.ts"
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

  // A few end-to-end files still spawn process-heavy recovery and evidence probes.
  // Keep the broad suite parallel with bounded host contention, then run those
  // files once in an explicitly serial phase. The former analysis, enterprise,
  // and go-live files are split into parallel-safe cases.
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
