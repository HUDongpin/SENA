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
  it("keeps committed zh/en/anchors in sync with deliveryCandidate.demoScript", () => {
    const generated = renderSenaResearcherWalkthroughMarkdown(SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT);
    const committed = readFileSync(committedWalkthroughPath, "utf8");

    expect(SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT).toHaveLength(5);
    expect(committed).toBe(generated);

    for (const step of SENA_DELIVERY_CANDIDATE_DEMO_SCRIPT) {
      expect(committed).toContain(`en: ${step.en}`);
      expect(committed).toContain(`zh: ${step.zh}`);
      expect(committed).toContain(`(\`${step.anchor}\`)`);
      expect(committed).toContain(`${step.step}. ${step.label}`);
    }
  });
});
