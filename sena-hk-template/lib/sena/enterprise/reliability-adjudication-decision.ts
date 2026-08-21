import { SenaEnterpriseError } from "./errors";

export const senaReliabilityAdjudicationDecisions = ["include", "exclude", "revise"] as const;

export type SenaReliabilityAdjudicationDecision =
  typeof senaReliabilityAdjudicationDecisions[number];

export function parseSenaReliabilityAdjudicationDecision(
  value: unknown
): SenaReliabilityAdjudicationDecision {
  if (typeof value !== "string" ||
    !(senaReliabilityAdjudicationDecisions as readonly string[]).includes(value)) {
    throw new SenaEnterpriseError(
      "Reliability adjudication decision must be exactly include, exclude, or revise.",
      400,
      "invalid_reliability_adjudication_decision"
    );
  }
  return value as SenaReliabilityAdjudicationDecision;
}
