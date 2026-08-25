import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SenaInputValidationError } from "../analytical-input-validation";
import {
  createEnterpriseProject,
  createEnterpriseProjectAsync,
  registerEnterpriseUser,
  restoreEnterpriseProjectRevision,
  restoreEnterpriseProjectRevisionAsync,
  updateEnterpriseProject,
  updateEnterpriseProjectAsync
} from "../enterprise";
import {
  createConfiguredFileEnterpriseStateStore,
  emptyEnterpriseDb,
  readEnterpriseDb,
  writeEnterpriseDb
} from "../enterprise/state";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaProjectSnapshot } from "../types";

let enterpriseDbDir = "";

beforeAll(() => {
  enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-project-canonical-round8-"));
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
});

beforeEach(() => {
  writeFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), JSON.stringify(emptyEnterpriseDb()));
});

afterAll(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  rmSync(enterpriseDbDir, { recursive: true, force: true });
});

function validSnapshot(): SenaProjectSnapshot {
  const dataset = structuredClone(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(dataset), {
    title: "Round8 canonical project",
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset
  });
}

function invalidSourceSnapshot(): SenaProjectSnapshot {
  const snapshot = validSnapshot();
  if (!snapshot.source.sourceDataset?.interactions[0]) throw new Error("fixture interaction missing");
  snapshot.source.sourceDataset = structuredClone(snapshot.source.sourceDataset);
  snapshot.source.sourceDataset.interactions[0].weight = -7;
  return snapshot;
}

type Round9InvalidSnapshotKind =
  | "null-person"
  | "out-of-range-confidence"
  | "missing-person-reference"
  | "count-mismatch"
  | "infinite-active-window"
  | "null-code";

function round9InvalidSnapshot(kind: Round9InvalidSnapshotKind): SenaProjectSnapshot {
  const snapshot = validSnapshot();
  if (kind === "null-person") snapshot.dataset.people[0] = null as never;
  if (kind === "out-of-range-confidence") snapshot.dataset.coded_segments[0].confidence = 2;
  if (kind === "missing-person-reference") snapshot.dataset.utterances[0].personId = "round9-missing-person";
  if (kind === "count-mismatch") snapshot.source.sourceDatasetCounts.people += 1;
  if (kind === "infinite-active-window") {
    snapshot.source.activeTemporalWindow = structuredClone(snapshot.analysis.temporal.windows[0]);
    if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active temporal window missing");
    snapshot.source.activeTemporalWindow.startTurn = JSON.parse("1e309") as number;
  }
  if (kind === "null-code") snapshot.dataset.codebook[0] = null as never;
  return snapshot;
}

function registeredOwner() {
  return registerEnterpriseUser({
    name: "Round8 Project Owner",
    email: `round8-project-${Math.random()}@example.edu`,
    password: "sena-secure-123",
    organization: "Round8 Project Lab",
    plan: "lab"
  });
}

function assertSanitizedInputError(error: unknown) {
  expect(error).toBeInstanceOf(SenaInputValidationError);
  const validationError = error as SenaInputValidationError;
  expect(validationError.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: expect.stringContaining("source.sourceDataset.interactions") })
  ]));
  expect(JSON.stringify(validationError)).not.toContain("-7");
}

function assertRound9SanitizedInputError(error: unknown, issue: { path: string; rule: string }) {
  expect(error).toBeInstanceOf(SenaInputValidationError);
  const validationError = error as SenaInputValidationError;
  expect(validationError.issues).toContainEqual(issue);
  expect(JSON.stringify(validationError)).not.toContain("round9-missing-person");
  expect(JSON.stringify(validationError)).not.toContain("Infinity");
  expect(JSON.stringify(validationError)).not.toContain("NaN");
}

function rawState() {
  return readFileSync(createConfiguredFileEnterpriseStateStore().paths.dbPath, "utf8");
}

async function captureError(operation: () => unknown | Promise<unknown>) {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("enterprise project canonical snapshot boundaries", () => {
  it("validates sync create before project, revision, audit, or state side effects", async () => {
    const registered = registeredOwner();
    const before = rawState();

    const error = await captureError(() => createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Invalid sync create",
      snapshot: invalidSourceSnapshot()
    }));

    assertSanitizedInputError(error);
    expect(rawState()).toBe(before);
  });

  it("validates async create before project, revision, audit, or state side effects", async () => {
    const registered = registeredOwner();
    const before = rawState();

    const error = await captureError(() => createEnterpriseProjectAsync(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Invalid async create",
      snapshot: invalidSourceSnapshot()
    }));

    assertSanitizedInputError(error);
    expect(rawState()).toBe(before);
  });

  it("validates sync update before any metadata, revision, audit, or state mutation", async () => {
    const registered = registeredOwner();
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Valid sync project",
      snapshot: validSnapshot()
    });
    const before = rawState();

    const error = await captureError(() => updateEnterpriseProject(registered.context, project.id, {
      expectedVersion: project.currentVersion,
      title: "Must not persist",
      snapshot: invalidSourceSnapshot()
    }));

    assertSanitizedInputError(error);
    expect(rawState()).toBe(before);
  });

  it("validates async update before any metadata, revision, audit, or state mutation", async () => {
    const registered = registeredOwner();
    const project = await createEnterpriseProjectAsync(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Valid async project",
      snapshot: validSnapshot()
    });
    const before = rawState();

    const error = await captureError(() => updateEnterpriseProjectAsync(registered.context, project.id, {
      expectedVersion: project.currentVersion,
      title: "Must not persist",
      snapshot: invalidSourceSnapshot()
    }));

    assertSanitizedInputError(error);
    expect(rawState()).toBe(before);
  });

  it.each([
    ["sync", false],
    ["async", true]
  ] as const)("validates a corrupted %s revision before restore side effects", async (_label, asynchronous) => {
    const registered = registeredOwner();
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Revision source project",
      snapshot: validSnapshot()
    });
    updateEnterpriseProject(registered.context, project.id, {
      expectedVersion: 1,
      snapshot: validSnapshot()
    });
    const db = readEnterpriseDb();
    const target = db.projectRevisions.find((revision) => revision.projectId === project.id && revision.version === 1);
    if (!target) throw new Error("target revision missing");
    target.snapshot = invalidSourceSnapshot();
    writeEnterpriseDb(db);
    const before = rawState();

    const error = await captureError(() => asynchronous
      ? restoreEnterpriseProjectRevisionAsync(registered.context, project.id, { version: 1, expectedVersion: 2 })
      : restoreEnterpriseProjectRevision(registered.context, project.id, { version: 1, expectedVersion: 2 }));

    assertSanitizedInputError(error);
    expect(rawState()).toBe(before);
  });

  it("fails closed while normalizing corrupted file-backed project state", async () => {
    const registered = registeredOwner();
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Corrupted file state project",
      snapshot: validSnapshot()
    });
    const db = readEnterpriseDb();
    const stored = db.projects.find((candidate) => candidate.id === project.id);
    if (!stored) throw new Error("stored project missing");
    stored.snapshot = invalidSourceSnapshot();
    writeEnterpriseDb(db);

    const error = await captureError(() => readEnterpriseDb());

    assertSanitizedInputError(error);
  });

  it.each([
    ["sync", false, "null-person", { path: "dataset.people[0]", rule: "object" }],
    ["async", true, "out-of-range-confidence", { path: "dataset.coded_segments[0].confidence", rule: "finite-probability" }]
  ] as const)("Round 9 validates %s create before any state side effect", async (_label, asynchronous, kind, issue) => {
    const registered = registeredOwner();
    const before = rawState();
    const input = {
      teamId: registered.context.teams[0].id,
      title: "Round 9 invalid create",
      snapshot: round9InvalidSnapshot(kind)
    };

    const error = await captureError(() => asynchronous
      ? createEnterpriseProjectAsync(registered.context, input)
      : createEnterpriseProject(registered.context, input));

    assertRound9SanitizedInputError(error, issue);
    expect(rawState()).toBe(before);
  });

  it.each([
    ["sync", false, "missing-person-reference", { path: "dataset.utterances[0].personId", rule: "reference" }],
    ["async", true, "count-mismatch", { path: "source.sourceDatasetCounts.people", rule: "count-match" }]
  ] as const)("Round 9 validates %s update before metadata, revision, audit, or state mutation", async (_label, asynchronous, kind, issue) => {
    const registered = registeredOwner();
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Round 9 valid update source",
      snapshot: validSnapshot()
    });
    const before = rawState();
    const input = {
      expectedVersion: project.currentVersion,
      title: "Must not persist",
      snapshot: round9InvalidSnapshot(kind)
    };

    const error = await captureError(() => asynchronous
      ? updateEnterpriseProjectAsync(registered.context, project.id, input)
      : updateEnterpriseProject(registered.context, project.id, input));

    assertRound9SanitizedInputError(error, issue);
    expect(rawState()).toBe(before);
  });

  it.each([
    ["sync", false, "infinite-active-window", { path: "source.activeTemporalWindow.startTurn", rule: "integer-range" }],
    ["async", true, "null-code", { path: "dataset.codebook[0]", rule: "object" }]
  ] as const)("Round 9 validates a corrupted %s revision before restore mutation", async (_label, asynchronous, kind, issue) => {
    const registered = registeredOwner();
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Round 9 revision source",
      snapshot: validSnapshot()
    });
    updateEnterpriseProject(registered.context, project.id, {
      expectedVersion: 1,
      snapshot: validSnapshot()
    });
    const db = readEnterpriseDb();
    const target = db.projectRevisions.find((revision) => revision.projectId === project.id && revision.version === 1);
    if (!target) throw new Error("target revision missing");
    target.snapshot = round9InvalidSnapshot(kind);
    writeEnterpriseDb(db);
    const before = rawState();

    const error = await captureError(() => asynchronous
      ? restoreEnterpriseProjectRevisionAsync(registered.context, project.id, { version: 1, expectedVersion: 2 })
      : restoreEnterpriseProjectRevision(registered.context, project.id, { version: 1, expectedVersion: 2 }));

    assertRound9SanitizedInputError(error, issue);
    expect(rawState()).toBe(before);
  });

  it("Round 9 fails closed on a malformed row while normalizing file-backed state", async () => {
    const registered = registeredOwner();
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Round 9 file-state source",
      snapshot: validSnapshot()
    });
    const db = readEnterpriseDb();
    const stored = db.projects.find((candidate) => candidate.id === project.id);
    if (!stored) throw new Error("stored project missing");
    stored.snapshot = round9InvalidSnapshot("null-person");
    writeEnterpriseDb(db);
    const before = rawState();

    const error = await captureError(() => readEnterpriseDb());

    assertRound9SanitizedInputError(error, { path: "dataset.people[0]", rule: "object" });
    expect(rawState()).toBe(before);
  });
});
