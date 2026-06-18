import type { SenaDataset } from "./types";

export const exampleSenaContract: SenaDataset = {
  people: [
    { id: "A", label: "Ava", role: "Facilitator", group: "Team Blue", initials: "A" },
    { id: "B", label: "Ben", role: "Evidence builder", group: "Team Blue", initials: "B" },
    { id: "C", label: "Chen", role: "Concept broker", group: "Team Blue", initials: "C" },
    { id: "D", label: "Daria", role: "Reflective critic", group: "Team Blue", initials: "D" },
    { id: "E", label: "Eli", role: "Coordinator", group: "Team Blue", initials: "E" },
    { id: "F", label: "Farah", role: "Emerging contributor", group: "Team Blue", initials: "F" }
  ],
  codebook: [
    {
      id: "question",
      label: "Question",
      family: "Inquiry",
      description: "Problem framing, uncertainty, and inquiry prompts.",
      color: "#7c3aed"
    },
    {
      id: "hypothesis",
      label: "Hypothesis",
      family: "Inquiry",
      description: "Tentative claims, predictions, and possible explanations.",
      color: "#8b5cf6"
    },
    {
      id: "evidence",
      label: "Evidence",
      family: "Reasoning",
      description: "Data, observations, citations, or worked examples used to support claims.",
      color: "#2563eb"
    },
    {
      id: "explanation",
      label: "Explanation",
      family: "Reasoning",
      description: "Causal or conceptual accounts that connect evidence to claims.",
      color: "#d946ef"
    },
    {
      id: "reflection",
      label: "Reflection",
      family: "Metacognition",
      description: "Reviewing progress, evaluating quality, or planning improvement.",
      color: "#ec4899"
    },
    {
      id: "coordination",
      label: "Coordination",
      family: "Collaboration",
      description: "Task planning, turn allocation, consensus building, or relation maintenance.",
      color: "#14b8a6"
    },
    {
      id: "critique",
      label: "Critique",
      family: "Reasoning",
      description: "Challenging assumptions, identifying limits, or revising weak claims.",
      color: "#f97316"
    }
  ],
  interactions: [
    {
      source: "A",
      target: "B",
      weight: 4,
      channel: "reply",
      stage: "Brainstorming",
      evidence: "A asks B to explain which data point should anchor the group claim."
    },
    {
      source: "B",
      target: "C",
      weight: 5,
      channel: "reply",
      stage: "Evidence Building",
      evidence: "B builds on C's suggestion and adds a supporting observation."
    },
    {
      source: "C",
      target: "A",
      weight: 4,
      channel: "mention",
      stage: "Evidence Building",
      evidence: "C links Ava's question to the evidence-explanation pair."
    },
    {
      source: "C",
      target: "D",
      weight: 4,
      channel: "reply",
      stage: "Reflection",
      evidence: "C invites Daria to critique the group's explanation."
    },
    {
      source: "D",
      target: "E",
      weight: 3,
      channel: "reply",
      stage: "Reflection",
      evidence: "D replies to Eli with a revision and next-step reflection."
    },
    {
      source: "E",
      target: "A",
      weight: 3,
      channel: "coordination",
      stage: "Brainstorming",
      evidence: "Eli coordinates the opening task with Ava and allocates turns."
    },
    {
      source: "A",
      target: "D",
      weight: 2,
      channel: "reply",
      stage: "Reflection",
      evidence: "A asks Daria to connect the critique back to evidence."
    },
    {
      source: "B",
      target: "E",
      weight: 2,
      channel: "reply",
      stage: "Evidence Building",
      evidence: "B responds to Eli's plan with a data-based example."
    },
    {
      source: "F",
      target: "C",
      weight: 2,
      channel: "reply",
      stage: "Reflection",
      evidence: "Farah responds to Chen by turning a summary into a reflective next step."
    },
    {
      source: "E",
      target: "F",
      weight: 1,
      channel: "mention",
      stage: "Brainstorming",
      evidence: "Eli invites Farah to add one question before the group moves on."
    }
  ],
  utterances: [
    {
      id: "u1",
      personId: "A",
      unitId: "team-blue",
      stanzaId: "stanza-1",
      stage: "Brainstorming",
      turnIndex: 1,
      text: "What problem are we trying to solve, and what would count as a good explanation?"
    },
    {
      id: "u2",
      personId: "E",
      unitId: "team-blue",
      stanzaId: "stanza-1",
      stage: "Brainstorming",
      turnIndex: 2,
      text: "Let's split the task first: one person checks evidence, one person drafts the hypothesis."
    },
    {
      id: "u3",
      personId: "F",
      unitId: "team-blue",
      stanzaId: "stanza-1",
      stage: "Brainstorming",
      turnIndex: 3,
      text: "Could the trend be different for the low-temperature trials?"
    },
    {
      id: "u4",
      personId: "B",
      unitId: "team-blue",
      stanzaId: "stanza-2",
      stage: "Evidence Building",
      turnIndex: 4,
      text: "The table shows the object sank faster when mass increased, so we should use that as evidence."
    },
    {
      id: "u5",
      personId: "C",
      unitId: "team-blue",
      stanzaId: "stanza-2",
      stage: "Evidence Building",
      turnIndex: 5,
      text: "That supports Ben's claim, but it also changes our hypothesis about surface area."
    },
    {
      id: "u6",
      personId: "A",
      unitId: "team-blue",
      stanzaId: "stanza-2",
      stage: "Evidence Building",
      turnIndex: 6,
      text: "Can we explain why the evidence supports one mechanism and not the other?"
    },
    {
      id: "u7",
      personId: "B",
      unitId: "team-blue",
      stanzaId: "stanza-3",
      stage: "Evidence Building",
      turnIndex: 7,
      text: "The second observation is weaker, so I will mark it as supporting evidence but not the main reason."
    },
    {
      id: "u8",
      personId: "C",
      unitId: "team-blue",
      stanzaId: "stanza-3",
      stage: "Evidence Building",
      turnIndex: 8,
      text: "If we connect those two pieces, the explanation becomes that density, not size, is the key variable."
    },
    {
      id: "u9",
      personId: "E",
      unitId: "team-blue",
      stanzaId: "stanza-3",
      stage: "Evidence Building",
      turnIndex: 9,
      text: "Let's keep that as our shared explanation and ask Daria to challenge it."
    },
    {
      id: "u10",
      personId: "D",
      unitId: "team-blue",
      stanzaId: "stanza-4",
      stage: "Reflection",
      turnIndex: 10,
      text: "The explanation is stronger now, but we need to say what evidence would disconfirm it."
    },
    {
      id: "u11",
      personId: "C",
      unitId: "team-blue",
      stanzaId: "stanza-4",
      stage: "Reflection",
      turnIndex: 11,
      text: "That critique helps us revise the hypothesis instead of just defending the first answer."
    },
    {
      id: "u12",
      personId: "A",
      unitId: "team-blue",
      stanzaId: "stanza-4",
      stage: "Reflection",
      turnIndex: 12,
      text: "So our final summary should link the question, evidence, explanation, and what we still need to test."
    },
    {
      id: "u13",
      personId: "F",
      unitId: "team-blue",
      stanzaId: "stanza-5",
      stage: "Reflection",
      turnIndex: 13,
      text: "I can write the next-step reflection because we still have one unanswered question."
    },
    {
      id: "u14",
      personId: "D",
      unitId: "team-blue",
      stanzaId: "stanza-5",
      stage: "Reflection",
      turnIndex: 14,
      text: "Add that the evidence is useful only if we compare it against the alternative explanation."
    },
    {
      id: "u15",
      personId: "E",
      unitId: "team-blue",
      stanzaId: "stanza-5",
      stage: "Reflection",
      turnIndex: 15,
      text: "I'll coordinate the report so each claim has evidence and a short reflection."
    }
  ],
  coded_segments: [
    {
      segmentId: "s1",
      utteranceId: "u1",
      personId: "A",
      unitId: "team-blue",
      stanzaId: "stanza-1",
      stage: "Brainstorming",
      turnIndex: 1,
      text: "What problem are we trying to solve, and what would count as a good explanation?",
      codes: ["question", "explanation"]
    },
    {
      segmentId: "s2",
      utteranceId: "u2",
      personId: "E",
      unitId: "team-blue",
      stanzaId: "stanza-1",
      stage: "Brainstorming",
      turnIndex: 2,
      text: "Let's split the task first: one person checks evidence, one person drafts the hypothesis.",
      codes: ["coordination", "hypothesis", "evidence"]
    },
    {
      segmentId: "s3",
      utteranceId: "u3",
      personId: "F",
      unitId: "team-blue",
      stanzaId: "stanza-1",
      stage: "Brainstorming",
      turnIndex: 3,
      text: "Could the trend be different for the low-temperature trials?",
      codes: ["question", "hypothesis"]
    },
    {
      segmentId: "s4",
      utteranceId: "u4",
      personId: "B",
      unitId: "team-blue",
      stanzaId: "stanza-2",
      stage: "Evidence Building",
      turnIndex: 4,
      text: "The table shows the object sank faster when mass increased, so we should use that as evidence.",
      codes: ["evidence", "explanation"]
    },
    {
      segmentId: "s5",
      utteranceId: "u5",
      personId: "C",
      unitId: "team-blue",
      stanzaId: "stanza-2",
      stage: "Evidence Building",
      turnIndex: 5,
      text: "That supports Ben's claim, but it also changes our hypothesis about surface area.",
      codes: ["evidence", "hypothesis", "critique"]
    },
    {
      segmentId: "s6",
      utteranceId: "u6",
      personId: "A",
      unitId: "team-blue",
      stanzaId: "stanza-2",
      stage: "Evidence Building",
      turnIndex: 6,
      text: "Can we explain why the evidence supports one mechanism and not the other?",
      codes: ["question", "evidence", "explanation"]
    },
    {
      segmentId: "s7",
      utteranceId: "u7",
      personId: "B",
      unitId: "team-blue",
      stanzaId: "stanza-3",
      stage: "Evidence Building",
      turnIndex: 7,
      text: "The second observation is weaker, so I will mark it as supporting evidence but not the main reason.",
      codes: ["evidence", "critique"]
    },
    {
      segmentId: "s8",
      utteranceId: "u8",
      personId: "C",
      unitId: "team-blue",
      stanzaId: "stanza-3",
      stage: "Evidence Building",
      turnIndex: 8,
      text: "If we connect those two pieces, the explanation becomes that density, not size, is the key variable.",
      codes: ["evidence", "explanation", "hypothesis"]
    },
    {
      segmentId: "s9",
      utteranceId: "u9",
      personId: "E",
      unitId: "team-blue",
      stanzaId: "stanza-3",
      stage: "Evidence Building",
      turnIndex: 9,
      text: "Let's keep that as our shared explanation and ask Daria to challenge it.",
      codes: ["coordination", "explanation", "critique"]
    },
    {
      segmentId: "s10",
      utteranceId: "u10",
      personId: "D",
      unitId: "team-blue",
      stanzaId: "stanza-4",
      stage: "Reflection",
      turnIndex: 10,
      text: "The explanation is stronger now, but we need to say what evidence would disconfirm it.",
      codes: ["reflection", "critique", "evidence", "explanation"]
    },
    {
      segmentId: "s11",
      utteranceId: "u11",
      personId: "C",
      unitId: "team-blue",
      stanzaId: "stanza-4",
      stage: "Reflection",
      turnIndex: 11,
      text: "That critique helps us revise the hypothesis instead of just defending the first answer.",
      codes: ["critique", "hypothesis", "reflection"]
    },
    {
      segmentId: "s12",
      utteranceId: "u12",
      personId: "A",
      unitId: "team-blue",
      stanzaId: "stanza-4",
      stage: "Reflection",
      turnIndex: 12,
      text: "So our final summary should link the question, evidence, explanation, and what we still need to test.",
      codes: ["question", "evidence", "explanation", "reflection"]
    },
    {
      segmentId: "s13",
      utteranceId: "u13",
      personId: "F",
      unitId: "team-blue",
      stanzaId: "stanza-5",
      stage: "Reflection",
      turnIndex: 13,
      text: "I can write the next-step reflection because we still have one unanswered question.",
      codes: ["reflection", "question", "coordination"]
    },
    {
      segmentId: "s14",
      utteranceId: "u14",
      personId: "D",
      unitId: "team-blue",
      stanzaId: "stanza-5",
      stage: "Reflection",
      turnIndex: 14,
      text: "Add that the evidence is useful only if we compare it against the alternative explanation.",
      codes: ["evidence", "explanation", "critique"]
    },
    {
      segmentId: "s15",
      utteranceId: "u15",
      personId: "E",
      unitId: "team-blue",
      stanzaId: "stanza-5",
      stage: "Reflection",
      turnIndex: 15,
      text: "I'll coordinate the report so each claim has evidence and a short reflection.",
      codes: ["coordination", "evidence", "reflection"]
    }
  ]
};
