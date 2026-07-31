import { describe, expect, it } from "vitest";
import { nextFusionCanvasSelection } from "../../../components/sena/workspace/use-fusion-canvas-selection-state";

const graphNodeIds = new Set(["coordination", "question", "hypothesis"]);

describe("nextFusionCanvasSelection label toggle", () => {
  it("reveals a node label on the first click", () => {
    const next = nextFusionCanvasSelection(
      { selectedId: "", revealedNodeLabelIds: [] },
      "coordination",
      graphNodeIds
    );
    expect(next.selectedId).toBe("coordination");
    expect(next.revealedNodeLabelIds).toEqual(["coordination"]);
  });

  it("hides the label when the already-selected node is clicked again", () => {
    // First click reveals the label…
    const shown = nextFusionCanvasSelection(
      { selectedId: "", revealedNodeLabelIds: [] },
      "coordination",
      graphNodeIds
    );
    // …a second click on the same node toggles it back off. Because the canvas
    // shows a label while the node is `selected || revealed`, both must clear.
    const hidden = nextFusionCanvasSelection(shown, "coordination", graphNodeIds);
    expect(hidden.selectedId).toBe("");
    expect(hidden.revealedNodeLabelIds).toEqual([]);
  });

  it("keeps other pinned labels when one node is toggled off", () => {
    const withCo = nextFusionCanvasSelection(
      { selectedId: "", revealedNodeLabelIds: [] },
      "coordination",
      graphNodeIds
    );
    const withQuestion = nextFusionCanvasSelection(withCo, "question", graphNodeIds);
    expect(withQuestion.revealedNodeLabelIds).toEqual(["coordination", "question"]);

    // Toggling the active node (question) off leaves coordination pinned.
    const questionOff = nextFusionCanvasSelection(withQuestion, "question", graphNodeIds);
    expect(questionOff.selectedId).toBe("");
    expect(questionOff.revealedNodeLabelIds).toEqual(["coordination"]);
  });

  it("re-selects a pinned-but-unselected node without hiding its label", () => {
    const withCo = nextFusionCanvasSelection(
      { selectedId: "", revealedNodeLabelIds: [] },
      "coordination",
      graphNodeIds
    );
    const withQuestion = nextFusionCanvasSelection(withCo, "question", graphNodeIds);
    // coordination is revealed but no longer the selected node; clicking it
    // re-selects it (for the inspector) and keeps its label — it does not count
    // as the "second click" that hides.
    const reselectCo = nextFusionCanvasSelection(withQuestion, "coordination", graphNodeIds);
    expect(reselectCo.selectedId).toBe("coordination");
    expect(reselectCo.revealedNodeLabelIds).toEqual(["coordination", "question"]);
  });

  it("selects an edge without touching revealed node labels", () => {
    const next = nextFusionCanvasSelection(
      { selectedId: "", revealedNodeLabelIds: ["coordination"] },
      "edge-social-1",
      graphNodeIds
    );
    expect(next.selectedId).toBe("edge-social-1");
    expect(next.revealedNodeLabelIds).toEqual(["coordination"]);
  });

  it("returns the same revealed array reference when nothing changes", () => {
    const revealedNodeLabelIds = ["coordination"];
    // Selecting an edge leaves the revealed set untouched (referentially), so
    // React can bail out of a re-render.
    const next = nextFusionCanvasSelection({ selectedId: "", revealedNodeLabelIds }, "edge-x", graphNodeIds);
    expect(next.revealedNodeLabelIds).toBe(revealedNodeLabelIds);
  });
});
