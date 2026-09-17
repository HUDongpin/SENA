import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT,
  SENA_RESEARCHER_WALKTHROUGH_MARKDOWN_RELATIVE_PATH,
  renderSenaResearcherWalkthroughMarkdown
} from "../development-plan";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const committedWalkthroughPath = path.join(
  repoRoot,
  SENA_RESEARCHER_WALKTHROUGH_MARKDOWN_RELATIVE_PATH
);

describe("researcher walkthrough custody", () => {
  it("pins the committed bilingual markdown to deliveryCandidate.demoScript", () => {
    const generated = renderSenaResearcherWalkthroughMarkdown(SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT);
    const committed = readFileSync(committedWalkthroughPath, "utf8");

    expect(SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT).toHaveLength(5);
    expect(committed).toBe(generated);

    for (const step of SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT) {
      expect(committed).toContain(`## Step ${step.step} — ${step.label}`);
      expect(committed).toContain(`(\`${step.anchor}\`)`);
      expect(committed).toContain(step.zh);
      expect(committed).toContain(step.en);
      for (const artifact of step.exportArtifacts) {
        expect(committed).toContain(`\`${artifact}\``);
      }
    }
  });
});
