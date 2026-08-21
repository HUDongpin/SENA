import { describe, expect, it } from "vitest";
import { SenaInputValidationError } from "../analytical-input-validation";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { importSenaProjectSnapshotFromHandoff } from "../project-handoff";
import { buildSenaPublicationExport } from "../publication-export";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import type { SenaBuildOptions, SenaProjectSnapshot } from "../types";

type BuildOptionMutation = {
  label: string;
  path: string;
  mutate: (options: SenaBuildOptions) => void;
};

const invalidBuildOptions: BuildOptionMutation[] = [
  { label: "fractional seed", path: "buildOptions.seed", mutate: (options) => { options.seed = 1.5; } },
  { label: "negative seed", path: "buildOptions.seed", mutate: (options) => { options.seed = -1; } },
  { label: "overflow seed", path: "buildOptions.seed", mutate: (options) => { options.seed = 0x100000000; } },
  { label: "negative alpha", path: "buildOptions.alpha", mutate: (options) => { options.alpha = -1; } },
  { label: "fractional dimension", path: "buildOptions.d", mutate: (options) => { options.d = 1.5; } },
  {
    label: "fractional moving-window size",
    path: "buildOptions.temporal.movingWindowSize",
    mutate: (options) => { options.temporal!.movingWindowSize = 1.5; }
  },
  {
    label: "zero moving-window step",
    path: "buildOptions.temporal.movingWindowStep",
    mutate: (options) => { options.temporal!.movingWindowStep = 0; }
  },
  {
    label: "negative turn-window radius",
    path: "buildOptions.temporal.turnWindowRadius",
    mutate: (options) => { options.temporal!.turnWindowRadius = -1; }
  }
];

function validSnapshot() {
  return buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
}

function invalidSnapshot(mutation: BuildOptionMutation) {
  const snapshot = structuredClone(validSnapshot());
  mutation.mutate(snapshot.reproducibility.buildOptions);
  return snapshot;
}

function expectTypedIssue(action: () => unknown, path: string) {
  try {
    action();
    throw new Error("expected validation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(SenaInputValidationError);
    expect((error as SenaInputValidationError).issues).toContainEqual({
      path,
      rule: "integer-range"
    });
    expect((error as SenaInputValidationError).issues.every((issue) => Object.keys(issue).sort().join(",") === "path,rule"))
      .toBe(true);
  }
}

describe("unified SENA numeric boundaries", () => {
  it.each(invalidBuildOptions)("rejects $label at the direct model boundary", (mutation) => {
    const options = structuredClone(validSnapshot().reproducibility.buildOptions);
    mutation.mutate(options);
    if (mutation.path === "buildOptions.alpha") {
      expect(() => buildSenaModel(lessonStudySenaContract, options)).toThrowError(SenaInputValidationError);
      return;
    }
    expectTypedIssue(() => buildSenaModel(lessonStudySenaContract, options), mutation.path);
  });

  it.each(invalidBuildOptions)("rejects $label at direct snapshot restore with typed sanitized issues", (mutation) => {
    const snapshot = invalidSnapshot(mutation);
    if (mutation.path === "buildOptions.alpha") {
      try {
        importSenaProjectSnapshot(snapshot);
        throw new Error("expected validation to reject");
      } catch (error) {
        expect(error).toBeInstanceOf(SenaInputValidationError);
        expect((error as SenaInputValidationError).issues).toContainEqual({
          path: mutation.path,
          rule: "finite-nonnegative"
        });
      }
      return;
    }
    expectTypedIssue(() => importSenaProjectSnapshot(snapshot), mutation.path);
  });

  it("fails closed at project persistence and publication restore boundaries", async () => {
    const snapshot = invalidSnapshot(invalidBuildOptions[0]);
    expectTypedIssue(() => importSenaProjectSnapshotFromHandoff({ snapshot }), "buildOptions.seed");
    await expect(buildSenaPublicationExport(snapshot as SenaProjectSnapshot, "svg"))
      .rejects.toMatchObject({
        name: "SenaInputValidationError",
        issues: [{ path: "buildOptions.seed", rule: "integer-range" }]
      });
  });
});
