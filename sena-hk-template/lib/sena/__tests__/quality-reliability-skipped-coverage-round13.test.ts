import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  isValidSenaReliabilityProjectBinding,
  normalizeSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
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

function tupleKey(parts: string[]) {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

function sortSkippedCells(cells: SenaSkippedCoderCell[]) {
  return cells.sort((left, right) => (
    left.coderId.localeCompare(right.coderId) ||
    left.itemId.localeCompare(right.itemId) ||
    tupleKey(left.codeIds).localeCompare(tupleKey(right.codeIds))
  ));
}

const annotations: SenaCoderAnnotation[] = [
  { coderId: "coder-a", itemId: "u1", codeId: "a", value: true },
  { coderId: "coder-b", itemId: "u1", codeId: "b", value: false }
];

describe("Round13 canonical duplicate skipped-cell coverage", () => {
  it("preserves per-row warnings but groups duplicate empty and whitespace cells for build/read", () => {
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "coder-a", item_id: "u1", code_id: "a", value: "1" },
      { coder_id: "coder-b", item_id: "u1", code_id: "b", value: "0" },
      { coder_id: "coder-c", item_id: "u1", code_id: "a|b", value: "" },
      { coder_id: "coder-c", item_id: "u1", code_id: "b|a", value: "   " }
    ]);

    expect(parsed.skippedCells).toHaveLength(2);
    expect(parsed.warnings.filter((warning) => warning.includes("empty value cell"))).toHaveLength(2);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });

    expect(dashboard.derivationEvidence?.skippedCells).toEqual([{
      coderId: "coder-c",
      itemId: "u1",
      codeIds: ["a", "b"]
    }]);
    expect(normalizeSenaReliabilityDashboard(structuredClone(dashboard))).toEqual(dashboard);
  });

  it("is row-order invariant, NUL-safe, and keeps cross-position tuples distinct", () => {
    const skippedCells: SenaSkippedCoderCell[] = [
      { coderId: "coder\u0000left", itemId: "item", codeIds: ["a\u0000b"] },
      { coderId: "coder\u0000left", itemId: "item", codeIds: ["a", "b"] },
      { coderId: "coder", itemId: "left\u0000item", codeIds: ["a"] },
      { coderId: "coder\u0000left", itemId: "item", codeIds: ["a"] }
    ];
    const forward = buildSenaReliabilityDashboard(annotations, { skippedCells });
    const reverse = buildSenaReliabilityDashboard(annotations, { skippedCells: [...skippedCells].reverse() });

    expect(forward.derivationEvidence?.skippedCells).toHaveLength(2);
    expect(forward.derivationEvidence?.skippedCells).toEqual(expect.arrayContaining([
      { coderId: "coder\u0000left", itemId: "item", codeIds: ["a", "a\u0000b", "b"] },
      { coderId: "coder", itemId: "left\u0000item", codeIds: ["a"] }
    ]));
    expect(forward.derivationEvidence?.skippedCells).toEqual(reverse.derivationEvidence?.skippedCells);
    expect(forward.derivationEvidence?.skippedCellCoverageHash).toBe(
      reverse.derivationEvidence?.skippedCellCoverageHash
    );
  });

  it("rejects coordinated duplicate-row substitution in derivation evidence", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations, {
      skippedCells: [{ coderId: "coder-c", itemId: "u1", codeIds: ["a", "b"] }]
    });
    const tampered = structuredClone(dashboard);
    tampered.derivationEvidence!.skippedCells = sortSkippedCells([
      ...tampered.derivationEvidence!.skippedCells,
      { coderId: "coder-c", itemId: "u1", codeIds: ["a"] }
    ]);
    tampered.derivationEvidence!.skippedCellCoverageHash = bindingHash(
      tampered.derivationEvidence!.skippedCells
    );

    expect(() => normalizeSenaReliabilityDashboard(tampered)).toThrow(/derivation|evidence|dashboard/i);
  });

  it("writes grouped project binding coverage and rejects a duplicate with a coordinated hash", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    dataset.codebook.push(
      { id: "a", label: "A", family: "Round13", color: "#111111", description: "A" },
      { id: "b", label: "B", family: "Round13", color: "#222222", description: "B" },
      { id: "a\u0000b", label: "A NUL B", family: "Round13", color: "#333333", description: "A NUL B" }
    );
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: dataset
    });
    const { binding } = bindSenaReliabilityAnnotationsToProject(annotations, {
      projectId: "round13-skipped-coverage",
      projectVersion: 1,
      snapshot,
      skippedCells: [
        { coderId: "coder-c", itemId: "u1", codeIds: ["a\u0000b"] },
        { coderId: "coder-c", itemId: "u1", codeIds: ["a", "b"] },
        { coderId: "coder-c", itemId: "u1", codeIds: ["a"] }
      ]
    });

    expect(binding.skippedCellCoverage).toEqual([{
      coderId: "coder-c",
      itemId: "u1",
      codeIds: ["a", "a\u0000b", "b"]
    }]);
    expect(isValidSenaReliabilityProjectBinding(binding)).toBe(true);

    const tampered = structuredClone(binding);
    tampered.skippedCellCoverage = sortSkippedCells([
      ...tampered.skippedCellCoverage,
      { coderId: "coder-c", itemId: "u1", codeIds: ["a"] }
    ]);
    tampered.skippedCellCoverageHash = bindingHash(tampered.skippedCellCoverage);
    expect(isValidSenaReliabilityProjectBinding(tampered)).toBe(false);
  });
});
