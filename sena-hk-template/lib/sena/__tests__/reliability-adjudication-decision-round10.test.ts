import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  lessonStudySenaContract,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation
} from "../index";

const round10TimeoutMs = 30_000;

const disagreementAnnotations: SenaCoderAnnotation[] = [
  { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
  { coderId: "c2", itemId: "u1", codeId: "evidence", value: false }
];

function adjudicationSnapshot() {
  const model = buildSenaModel(lessonStudySenaContract);
  return buildSenaProjectSnapshot(model, {
    title: "Strict adjudication decision fixture",
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
}

let fixtureSerial = 0;

async function createAdjudicationFixture() {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-adjudication-decision-round10-"));
  let sessionToken = "";
  fixtureSerial += 1;
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

  const enterprise = await import("../enterprise");
  const reliabilityRuns = await import("../enterprise/reliability-runs");
  const registered = enterprise.registerEnterpriseUser({
    name: "Strict Decision Reviewer",
    email: `strict-decision-${fixtureSerial}@example.edu`,
    password: "sena-secure-123",
    organization: "Strict Decision Lab",
    plan: "lab"
  });
  sessionToken = registered.token;
  const project = enterprise.createEnterpriseProject(registered.context, {
    teamId: registered.context.teams[0].id,
    title: "Strict adjudication decision fixture",
    snapshot: adjudicationSnapshot()
  });
  const dashboard = buildSenaReliabilityDashboard(disagreementAnnotations);
  const run = enterprise.createEnterpriseReliabilityRun(registered.context, {
    teamId: project.teamId,
    projectId: project.id,
    reviewer: registered.context.user.name,
    fileCount: 1,
    annotationCount: disagreementAnnotations.length,
    annotations: disagreementAnnotations,
    inputFiles: [{ name: "strict-decision.json", size: 1, sha256: "a".repeat(64) }],
    dashboard,
    reviewPatch: reliabilityDashboardToReview(dashboard, registered.context.user.name)
  });
  const disagreement = run.dashboard.adjudicationQueue[0];
  if (!disagreement) throw new Error("Round10 fixture requires one canonical disagreement.");

  return {
    enterpriseDbDir,
    enterprise,
    reliabilityRuns,
    registered,
    project,
    run,
    disagreement,
    stateBytes: () => JSON.stringify(enterprise.readEnterpriseDb()),
    cleanup: () => {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  };
}

afterEach(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  vi.resetModules();
});

describe("strict reliability adjudication decisions", () => {
  it("rejects a missing collaboration-route decision before any state side effect", async () => {
    const fixture = await createAdjudicationFixture();
    try {
      const route = await import("../../../app/api/sena/projects/[projectId]/collaboration/route");
      const before = fixture.stateBytes();
      const csrf = fixture.enterprise.createEnterpriseCsrfToken(fixture.registered.context);
      const response = await route.POST(new Request(
        `https://sena.example.test/api/sena/projects/${fixture.project.id}/collaboration`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrf.token
          },
          body: JSON.stringify({
            action: "adjudication",
            reliabilityRunId: fixture.run.id,
            itemId: fixture.disagreement.itemId,
            codeId: fixture.disagreement.codeId,
            coderValues: fixture.disagreement.values
          })
        }
      ), { params: Promise.resolve({ projectId: fixture.project.id }) });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Reliability adjudication decision must be exactly include, exclude, or revise.",
        code: "invalid_reliability_adjudication_decision"
      });
      expect(fixture.stateBytes()).toBe(before);
    } finally {
      fixture.cleanup();
    }
  }, round10TimeoutMs);

  it("rejects a typo through the reliability adjudicate route before any state side effect", async () => {
    const fixture = await createAdjudicationFixture();
    try {
      const route = await import("../../../app/api/sena/reliability/route");
      const before = fixture.stateBytes();
      const csrf = fixture.enterprise.createEnterpriseCsrfToken(fixture.registered.context);
      const response = await route.PATCH(new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          action: "adjudicate",
          runId: fixture.run.id,
          decision: "incldue"
        })
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Reliability adjudication decision must be exactly include, exclude, or revise.",
        code: "invalid_reliability_adjudication_decision"
      });
      expect(fixture.stateBytes()).toBe(before);
    } finally {
      fixture.cleanup();
    }
  }, round10TimeoutMs);

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["case variant", "Include"],
    ["unknown", "approve"],
    ["number", 1],
    ["object", { secret: "must-not-be-reflected" }],
    ["array", ["include"]]
  ])("rejects a %s decision at the direct reliability service boundary without mutation", async (_label, decision) => {
    const fixture = await createAdjudicationFixture();
    try {
      const before = fixture.stateBytes();
      let thrown: unknown;
      try {
        fixture.enterprise.createEnterpriseReliabilityAdjudications(
          fixture.registered.context,
          fixture.run.id,
          { decision } as never
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({
        status: 400,
        code: "invalid_reliability_adjudication_decision",
        message: "Reliability adjudication decision must be exactly include, exclude, or revise."
      });
      expect(String((thrown as Error | undefined)?.message)).not.toContain("must-not-be-reflected");
      expect(fixture.stateBytes()).toBe(before);
    } finally {
      fixture.cleanup();
    }
  }, round10TimeoutMs);

  it.each(["include", "exclude", "revise"] as const)(
    "preserves canonical binding validation for the legal %s decision",
    async (decision) => {
      const fixture = await createAdjudicationFixture();
      try {
        const response = fixture.reliabilityRuns.buildEnterpriseReliabilityAdjudicationResponse(
          fixture.registered.context,
          { runId: fixture.run.id, decision }
        );
        expect(response.status).toBe(201);
        expect(response.body.adjudication.decision).toBe(decision);
        expect(response.body.adjudication.adjudications).toHaveLength(1);
        expect(response.body.adjudication.adjudications[0]).toEqual(expect.objectContaining({
          reliabilityRunId: fixture.run.id,
          itemId: fixture.disagreement.itemId,
          codeId: fixture.disagreement.codeId,
          decision,
          coderValues: fixture.disagreement.values
        }));
      } finally {
        fixture.cleanup();
      }
    },
    round10TimeoutMs
  );
});
