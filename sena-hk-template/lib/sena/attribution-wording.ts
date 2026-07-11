export type SenaAttributionWordingCopy = {
  mode: "contribution-supported" | "association-exposure-only";
  reportNotes: string[];
  fusionClaim: string;
};

export function buildSenaAttributionWordingCopy(contributionWordingAllowed: boolean): SenaAttributionWordingCopy {
  if (contributionWordingAllowed) {
    return {
      mode: "contribution-supported",
      reportNotes: [
        "G is a person-code-pair layer with person-specific coded evidence registered for this analysis.",
        "Use original evidence snippets, coding reliability, and human review before turning pair associations into contribution claims."
      ],
      fusionClaim: "The bridge layer links people with concepts, and G traces who has person-specific coded evidence in code-pair windows."
    };
  }

  return {
    mode: "association-exposure-only",
    reportNotes: [
      "G is a person-code-pair association/exposure layer for explaining who was present in windows containing ENA-style code links.",
      "Use original evidence snippets, coding reliability, and human review before making stronger individual-role claims."
    ],
    fusionClaim: "The bridge layer shows who is associated with concepts, and G shows who is associated with code-pair windows."
  };
}
