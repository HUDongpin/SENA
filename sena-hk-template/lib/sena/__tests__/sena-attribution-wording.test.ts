import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { buildSenaPairContributionReportArtifact } from "../report";
import type { SenaDataset } from "../types";

const noPersonSpecificAttributionDataset: SenaDataset = {
  people: [
    { id: "p1", label: "P1", role: "teacher", group: "A" },
    { id: "p2", label: "P2", role: "student", group: "A" }
  ],
  interactions: [],
  utterances: [],
  coded_segments: [],
  codebook: [
    { id: "c1", label: "Evidence", family: "reasoning", description: "Evidence code.", color: "#2563eb" },
    { id: "c2", label: "Explanation", family: "reasoning", description: "Explanation code.", color: "#7c3aed" }
  ]
};

describe("SENA attribution wording gate", () => {
  it("S6 keeps G export notes in association/exposure wording when contribution wording is not allowed", () => {
    const model = buildSenaModel(noPersonSpecificAttributionDataset);
    const artifact = buildSenaPairContributionReportArtifact(model, {
      generatedAt: "2026-07-07T00:00:00.000Z"
    });
    const humanFacingNotes = artifact.notes.join("\n");

    expect(model.operatorDiagnostics.attribution.contributionWordingAllowed).toBe(false);
    expect(humanFacingNotes).toContain("association/exposure");
    expect(humanFacingNotes).not.toMatch(/\bcontribut(?:e|es|ed|ing|ion|ions|or|ors)\b/i);
  });

  it("S6 keeps workspace fusion claim copy out of stronger contribution wording", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts"),
      "utf8"
    );
    const reportAndStatsDeckSource = readFileSync(
      join(process.cwd(), "components/sena/workspace/workspace-report-and-stats-deck-section.tsx"),
      "utf8"
    );
    const workspaceCopySurface = `${workspaceSource}\n${reportAndStatsDeckSource}`;

    expect(workspaceCopySurface).not.toContain("who contributed");
    expect(workspaceCopySurface).not.toContain("helped activate");
    expect(reportAndStatsDeckSource).toContain("associated with concepts");
    expect(reportAndStatsDeckSource).toContain("associated with code-pair windows");
  });
});
