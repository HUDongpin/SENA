export const SENA_VITEST_SERIAL_TEST_FILES: readonly string[];

export function buildSenaVitestPhaseArgs(
  requestedArgs: readonly string[],
  availableCpuCount: number
): string[][];
