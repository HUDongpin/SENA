import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  isValidSenaReliabilityProjectBinding,
  normalizeSenaReliabilityDashboard,
  type SenaCoderAnnotation,
  type SenaSkippedCoderCell
} from "../reliability";
import { buildSenaProjectSnapshot } from "../snapshot";

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function bindingHash(value: unknown) {
  const text = stableValue(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

describe("Round12 NUL-safe reliability tuples", () => {
  it("round-trips distinct coder/item/code tuples that collide under NUL concatenation", () => {
    const annotations: SenaCoderAnnotation[] = [
      { coderId: "coder\u0000left", itemId: "item", codeId: "code", value: true },
      { coderId: "coder", itemId: "left\u0000item", codeId: "code", value: false },
      { coderId: "coder-x", itemId: "item\u0000code", codeId: "tail", value: true },
      { coderId: "coder-x", itemId: "item", codeId: "code\u0000tail", value: false }
    ];

    const dashboard = buildSenaReliabilityDashboard(annotations);

    expect(dashboard.derivationEvidence?.annotations).toHaveLength(4);
    expect(normalizeSenaReliabilityDashboard(dashboard)).toEqual(dashboard);
  });

  it("keeps skipped code arrays structured, deterministic, and non-colliding", () => {
    const annotations: SenaCoderAnnotation[] = [
      { coderId: "coder-a", itemId: "u1", codeId: "a", value: true },
      { coderId: "coder-b", itemId: "u1", codeId: "b", value: false }
    ];
    const skippedCells: SenaSkippedCoderCell[] = [
      { coderId: "coder-a", itemId: "u1", codeIds: ["a\u0000b"] },
      { coderId: "coder-a", itemId: "u1", codeIds: ["a", "b"] }
    ];
    const forward = buildSenaReliabilityDashboard(annotations, { skippedCells });
    const reverse = buildSenaReliabilityDashboard(annotations, { skippedCells: [...skippedCells].reverse() });

    expect(forward.derivationEvidence?.skippedCells).toEqual(reverse.derivationEvidence?.skippedCells);
    expect(forward.derivationEvidence?.skippedCellCoverageHash).toBe(
      reverse.derivationEvidence?.skippedCellCoverageHash
    );
    expect(forward.derivationEvidence?.skippedCells[0].codeIds).toEqual(["a", "b"]);
    expect(forward.derivationEvidence?.skippedCells[1].codeIds).toEqual(["a\u0000b"]);
    expect(normalizeSenaReliabilityDashboard(forward)).toEqual(forward);
  });

  it("rejects a binding whose NUL-colliding skipped arrays were reordered with a coordinated hash", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    dataset.codebook.push(
      { id: "a", label: "A", family: "NUL", color: "#111111", description: "A" },
      { id: "b", label: "B", family: "NUL", color: "#222222", description: "B" },
      { id: "a\u0000b", label: "A NUL B", family: "NUL", color: "#333333", description: "A NUL B" }
    );
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: dataset
    });
    const skippedCells: SenaSkippedCoderCell[] = [
      { coderId: "coder-a", itemId: "u1", codeIds: ["a\u0000b"] },
      { coderId: "coder-a", itemId: "u1", codeIds: ["a", "b"] }
    ];
    const { binding } = bindSenaReliabilityAnnotationsToProject([
      { coderId: "coder-a", itemId: "u1", codeId: "a", value: true },
      { coderId: "coder-b", itemId: "u1", codeId: "b", value: false }
    ], {
      projectId: "project-nul-tuples",
      projectVersion: 1,
      snapshot,
      skippedCells
    });
    expect(isValidSenaReliabilityProjectBinding(binding)).toBe(true);

    const tampered = structuredClone(binding);
    tampered.skippedCellCoverage.reverse();
    tampered.skippedCellCoverageHash = bindingHash(tampered.skippedCellCoverage);

    expect(isValidSenaReliabilityProjectBinding(tampered)).toBe(false);
  });
});
