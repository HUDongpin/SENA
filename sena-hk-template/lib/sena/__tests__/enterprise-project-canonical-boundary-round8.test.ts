import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  writeEnterpriseDb(emptyEnterpriseDb());
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
});
