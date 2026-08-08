import { describe, expect, it } from "vitest";
import { buildSenaEnaManifest, senaEnaRotationReference } from "../ena-manifest";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaDataset } from "../types";

// The manifest's projection options: rENA's means rotation, and jena-js's
// projectIn for a space shared across windows. Everything here is about a
// caller asking for something other than the default — the first test is the
// one that matters most, because every existing consumer, fixture, and gate
// reads the default and none of them asked for any of this.

/** The pilot with its four teachers split into two named groups. */
function twoGroupDataset(): SenaDataset {
  const groups = ["Cohort A", "Cohort A", "Cohort B", "Cohort B"];
  return {
    ...lessonStudySenaContract,
    people: lessonStudySenaContract.people.map((person, index) => ({
      ...person,
      group: groups[index] ?? "Cohort B"
    }))
  };
}

/** The pilot with one code dropped — a different adjacency key. */
function narrowerDataset(): SenaDataset {
  const dropped = lessonStudySenaContract.codebook[lessonStudySenaContract.codebook.length - 1].id;
  return {
    ...lessonStudySenaContract,
    codebook: lessonStudySenaContract.codebook.filter((code) => code.id !== dropped),
    coded_segments: lessonStudySenaContract.coded_segments.map((segment) => ({
      ...segment,
      codes: segment.codes.filter((code) => code !== dropped)
    }))
  };
}

describe("buildSenaEnaManifest defaults", () => {
  it("is byte-identical with and without an empty overrides argument", () => {
    // The whole options surface is additive; a caller who passes nothing must
    // get the manifest this module has always emitted.
    const bare = buildSenaEnaManifest(lessonStudySenaContract);
    const empty = buildSenaEnaManifest(lessonStudySenaContract, {});

    expect(JSON.stringify(empty)).toBe(JSON.stringify(bare));
    expect(bare.options).toEqual({
      model: "EndPoint",
      window: "MovingStanzaWindow",
      weightBy: "binary",
      windowSizeBack: 2,
      windowSizeForward: 0,
      dimensions: 2,
      nodePositionMethod: "undirected"
    });
    // The rotation payload is the one genuinely large addition; it stays off
    // unless it was asked for, so no fixture grows by a rotation matrix.
    expect(bare.outputs?.rotation).toBeUndefined();
    expect(bare.outputs?.dimensions).toEqual(["SVD1", "SVD2"]);
  });

  it("serializes the rotation on request, without changing the projection", () => {
    const plain = buildSenaEnaManifest(lessonStudySenaContract);
    const emitted = buildSenaEnaManifest(lessonStudySenaContract, { emitRotation: true });

    expect(emitted.outputs?.points).toEqual(plain.outputs?.points);
    expect(emitted.outputs?.rotation?.method).toBe("svd");
    expect(emitted.outputs?.rotation?.columns[0]).toBe("SVD1");
    // Square over every adjacency pair, not the two displayed columns: a
    // truncated matrix cannot project a second window.
    const pairs = emitted.outputs!.adjacencyKey.length;
    expect(emitted.outputs?.rotation?.matrix).toHaveLength(pairs);
    expect(emitted.outputs?.rotation?.matrix[0]).toHaveLength(pairs);
    expect(emitted.outputs?.rotation?.centerVector).toHaveLength(pairs);
    // Emitting it must not change the recorded model definition.
    expect(emitted.options).toEqual(plain.options);
  });
});

describe("means rotation", () => {
  it("names the first axis MR1 and records how it was rotated", () => {
    const manifest = buildSenaEnaManifest(twoGroupDataset(), { rotation: "mean" });

    expect(manifest.status).toBe("computed");
    expect(manifest.outputs?.dimensions[0]).toBe("MR1");
    expect(manifest.options?.rotation).toBe("mean");
    expect(manifest.options?.groupColumn).toBe("group");
    // A rotation defined by two named groups is worth reusing, so it is
    // serialized without anyone having to ask.
    expect(manifest.outputs?.rotation?.method).toBe("mean");
    expect(manifest.outputs?.rotation?.columns[0]).toBe("MR1");
  });

  it("separates the two group means along MR1, which is what the axis is", () => {
    const manifest = buildSenaEnaManifest(twoGroupDataset(), { rotation: "mean" });
    const scores = new Map<string, number[]>();
    for (const row of manifest.outputs!.points) {
      const group = String(row.group ?? "");
      scores.set(group, [...(scores.get(group) ?? []), Number(row.MR1)]);
    }
    const meanOf = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const a = meanOf(scores.get("Cohort A")!);
    const b = meanOf(scores.get("Cohort B")!);

    // The axis IS the direction between the group means, so the two means
    // cannot sit on the same side of the origin on it.
    expect(Math.sign(a)).not.toBe(Math.sign(b));
    expect(Math.abs(a - b)).toBeGreaterThan(0);
  });

  it("splits on any metadata column it is pointed at", () => {
    // The pilot gives every teacher a distinct role, so "role" has four groups
    // and cannot rotate; two roles can.
    const paired = {
      ...lessonStudySenaContract,
      people: lessonStudySenaContract.people.map((person, index) => ({
        ...person,
        role: index < 2 ? "Teacher" : "Mentor"
      }))
    };
    const manifest = buildSenaEnaManifest(paired, { rotation: "mean", groupColumn: "role" });

    expect(manifest.outputs?.dimensions[0]).toBe("MR1");
    expect(manifest.options?.groupColumn).toBe("role");
  });

  it("falls back to SVD, with a warning, when the column has not exactly two groups", () => {
    // The bundled pilot puts everyone in one group; rENA's means rotation has
    // one direction to give and no way to give it to one group or to four.
    const one = buildSenaEnaManifest(lessonStudySenaContract, { rotation: "mean" });
    expect(one.outputs?.dimensions).toEqual(["SVD1", "SVD2"]);
    expect(one.options?.rotation).toBeUndefined();
    expect(one.warnings.some((warning) => warning.includes("exactly two groups"))).toBe(true);

    const four = buildSenaEnaManifest(lessonStudySenaContract, {
      rotation: "mean",
      groupColumn: "role"
    });
    expect(four.outputs?.dimensions).toEqual(["SVD1", "SVD2"]);
    expect(four.warnings.some((warning) => warning.includes("exactly two groups"))).toBe(true);
  });

  it("leaves the model definition alone — the space rotates, the data does not", () => {
    const plain = buildSenaEnaManifest(twoGroupDataset());
    const rotated = buildSenaEnaManifest(twoGroupDataset(), { rotation: "mean" });

    expect(rotated.datasetCounts).toEqual(plain.datasetCounts);
    expect(rotated.outputs?.lineWeights).toEqual(plain.outputs?.lineWeights);
    expect(rotated.outputs?.adjacencyKey).toEqual(plain.outputs?.adjacencyKey);
  });
});

describe("projectIn — one space across two windows", () => {
  const source = buildSenaEnaManifest(lessonStudySenaContract, { emitRotation: true });
  const reference = senaEnaRotationReference(source)!;

  it("hands back a reference only for a manifest that carries a rotation", () => {
    expect(reference).not.toBeNull();
    expect(reference.adjacencyKey).toEqual(source.outputs!.adjacencyKey);
    expect(reference.codes).toEqual(source.source.codeColumns);
    expect(senaEnaRotationReference(buildSenaEnaManifest(lessonStudySenaContract))).toBeNull();
  });

  it("reproduces the source window exactly when projected into its own rotation", () => {
    // The identity case is the one that can be checked against a known answer:
    // projecting a window into its own space has to leave every point where it
    // already was, or the shared space is not the same space.
    const projected = buildSenaEnaManifest(lessonStudySenaContract, { projectInto: reference });

    expect(projected.status).toBe("computed");
    expect(projected.outputs?.dimensions).toEqual(source.outputs?.dimensions);
    expect(projected.outputs?.points).toEqual(source.outputs?.points);
    expect(projected.outputs?.nodePositions).toEqual(source.outputs?.nodePositions);
    expect(projected.options?.projectedIn).toBe(true);
    expect(projected.options?.rotation).toBe("svd");
  });

  it("carries the borrowed rotation forward so a third window can join", () => {
    const projected = buildSenaEnaManifest(lessonStudySenaContract, { projectInto: reference });
    expect(projected.outputs?.rotation?.matrix).toEqual(reference.matrix);
    expect(projected.outputs?.rotation?.centerVector).toEqual(reference.centerVector);
  });

  it("projects a different window into the shared space rather than its own", () => {
    // A scoped window: the same people over the first half of the discussion.
    const half = Math.ceil(lessonStudySenaContract.coded_segments.length / 2);
    const window: SenaDataset = {
      ...lessonStudySenaContract,
      coded_segments: lessonStudySenaContract.coded_segments.slice(0, half)
    };
    const own = buildSenaEnaManifest(window);
    const shared = buildSenaEnaManifest(window, { projectInto: reference });

    expect(shared.status).toBe("computed");
    // Same window, two spaces: the shared one is the source's, so its points
    // are not the ones this window's own SVD would have produced.
    expect(JSON.stringify(shared.outputs?.points)).not.toBe(JSON.stringify(own.outputs?.points));
    expect(shared.outputs?.rotation?.matrix).toEqual(reference.matrix);
  });

  it("refuses a rotation from a model with a different adjacency key", () => {
    // jena-js throws rather than projecting into a space whose axes mean
    // something else; the manifest reports that as a skip with the reason,
    // which is the failure mode every other manifest error already uses.
    const skipped = buildSenaEnaManifest(narrowerDataset(), { projectInto: reference });

    expect(skipped.status).toBe("skipped");
    expect(skipped.outputs).toBeUndefined();
    expect(skipped.warnings.some((warning) => warning.includes("adjacency"))).toBe(true);
  });
});
