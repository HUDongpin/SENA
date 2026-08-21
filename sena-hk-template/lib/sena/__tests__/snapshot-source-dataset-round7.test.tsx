import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  useProjectSnapshotRestoreAction,
  type ProjectSnapshotRestoreActionOptions
} from "../../../components/sena/workspace/use-project-snapshot-restore-action";
import { SenaInputValidationError } from "../analytical-input-validation";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { importSenaProjectSnapshotFromHandoff } from "../project-handoff";
import { buildSenaPublicationExport } from "../publication-export";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import type { SenaProjectSnapshot } from "../types";

type SourceMutation = {
  label: string;
  path: string;
  rule: "finite-nonnegative" | "finite-probability";
  mutate: (snapshot: SenaProjectSnapshot) => void;
};

const sourceMutations: SourceMutation[] = [
  {
    label: "negative interaction weight",
    path: "source.sourceDataset.interactions[0].weight",
    rule: "finite-nonnegative",
    mutate: (snapshot) => { snapshot.source.sourceDataset!.interactions[0].weight = -7; }
  },
  {
    label: "non-finite interaction weight",
    path: "source.sourceDataset.interactions[0].weight",
    rule: "finite-nonnegative",
    mutate: (snapshot) => { snapshot.source.sourceDataset!.interactions[0].weight = Number.POSITIVE_INFINITY; }
  },
  {
    label: "invalid coded-segment confidence",
    path: "source.sourceDataset.coded_segments[0].confidence",
    rule: "finite-probability",
    mutate: (snapshot) => { snapshot.source.sourceDataset!.coded_segments[0].confidence = 1.5; }
  }
];

function validSnapshot() {
  return buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
}

function forgedSourceSnapshot(mutation: SourceMutation) {
  const snapshot = structuredClone(validSnapshot());
  snapshot.source.sourceDataset = structuredClone(snapshot.source.sourceDataset!);
  mutation.mutate(snapshot);
  expect(snapshot.dataset.interactions[0].weight).toBeGreaterThanOrEqual(0);
  return snapshot;
}

function expectTypedSourceIssue(action: () => unknown, mutation: SourceMutation) {
  try {
    action();
    throw new Error("expected sourceDataset validation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(SenaInputValidationError);
    expect((error as SenaInputValidationError).issues).toContainEqual({
      path: mutation.path,
      rule: mutation.rule
    });
    expect((error as SenaInputValidationError).issues.every((issue) => (
      Object.keys(issue).sort().join(",") === "path,rule"
    ))).toBe(true);
  }
}

function mountWorkspaceRestore(onDataset: () => void) {
  let restore: ((snapshot: SenaProjectSnapshot, fileName: string) => void) | undefined;
  const noop = () => undefined;
  const setters = new Proxy({}, {
    get: (_target, property) => property === "setDataset" ? onDataset : noop
  }) as ProjectSnapshotRestoreActionOptions;

  function Harness() {
    restore = useProjectSnapshotRestoreAction(setters).restoreProjectSnapshot;
    return null;
  }

  renderToStaticMarkup(<Harness />);
  if (!restore) throw new Error("workspace restore action was not mounted");
  return restore;
}

describe("SENA snapshot sourceDataset analytical validation", () => {
  it.each(sourceMutations)("rejects a $label on direct snapshot import", (mutation) => {
    expectTypedSourceIssue(() => importSenaProjectSnapshot(forgedSourceSnapshot(mutation)), mutation);
  });

  it("rejects a sourceDataset forgery at project handoff restore", () => {
    const mutation = sourceMutations[0];
    expectTypedSourceIssue(() => importSenaProjectSnapshotFromHandoff({
      snapshot: forgedSourceSnapshot(mutation)
    }), mutation);
  });

  it("rejects a sourceDataset forgery before publication export", async () => {
    const mutation = sourceMutations[2];
    await expect(buildSenaPublicationExport(forgedSourceSnapshot(mutation), "svg"))
      .rejects.toMatchObject({
        name: "SenaInputValidationError",
        issues: [{ path: mutation.path, rule: mutation.rule }]
      });
  });

  it("rejects a sourceDataset forgery before workspace state setters run", () => {
    const mutation = sourceMutations[0];
    let datasetSetterCalls = 0;
    const restore = mountWorkspaceRestore(() => { datasetSetterCalls += 1; });

    expectTypedSourceIssue(() => restore(forgedSourceSnapshot(mutation), "forged.sena.json"), mutation);
    expect(datasetSetterCalls).toBe(0);
  });
});
