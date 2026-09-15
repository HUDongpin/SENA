import { describe, expect, it } from "vitest";
import { enforceSenaWorkflowTelemetryPolicy } from "../workflow/telemetry-policy";

describe("SENA EvidenceFlow telemetry policy", () => {
  it("fails closed on every ambient tracing switch and forces all switches false otherwise", () => {
    for (const key of [
      "LANGSMITH_TRACING",
      "LANGSMITH_TRACING_V2",
      "LANGCHAIN_TRACING",
      "LANGCHAIN_TRACING_V2"
    ]) {
      expect(() => enforceSenaWorkflowTelemetryPolicy({ [key]: "true" })).toThrow(/refuses to start/i);
    }
    const env: Record<string, string | undefined> = {};
    expect(enforceSenaWorkflowTelemetryPolicy(env)).toMatchObject({
      tracing: "disabled",
      externalTelemetry: "prohibited"
    });
    expect(new Set(Object.values(env))).toEqual(new Set(["false"]));
  });
});
