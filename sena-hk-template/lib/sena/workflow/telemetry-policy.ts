const tracingEnvironmentKeys = [
  "LANGSMITH_TRACING",
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_TRACING_V2"
] as const;

function enablesTracing(value: string | undefined) {
  return new Set(["1", "true", "yes", "on"]).has(value?.trim().toLowerCase() ?? "");
}

export function enforceSenaWorkflowTelemetryPolicy(
  env: Record<string, string | undefined> = process.env
) {
  if (tracingEnvironmentKeys.some((key) => enablesTracing(env[key]))) {
    throw new Error("SENA EvidenceFlow refuses to start while LangSmith/LangChain tracing is enabled.");
  }
  for (const key of tracingEnvironmentKeys) env[key] = "false";
  return {
    tracing: "disabled" as const,
    externalTelemetry: "prohibited" as const,
    environmentKeysForcedFalse: [...tracingEnvironmentKeys]
  };
}
