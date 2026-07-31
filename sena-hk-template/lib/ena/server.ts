import { ena } from "jena-js";
import { buildEnaRunResult } from "./results";
import type { EnaRunRequest, EnaRuntime } from "./types";
import { prepareEnaRun } from "./validation";

export function runEnaRequest(request: EnaRunRequest, runtime: EnaRuntime = "api") {
  const startedAt = performance.now();
  const prepared = prepareEnaRun(request);
  const set = ena(prepared.options);
  const elapsedMs = Math.round(performance.now() - startedAt);

  return buildEnaRunResult(set, request.rows.length, runtime, elapsedMs, prepared.warnings, request.composition);
}
