import { describe, expect, it } from "vitest";
import {
  buildEnterpriseConferenceRehearsalPlan
} from "../enterprise/conference-rehearsal-plan";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const generatedAt = "2026-07-01T00:00:00.000Z";

function passingPreflight() {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight,
    generatedAt,
    status: "pass",
    env: {
      requirements: [
        { id: "neon-postgres-env", present: true },
        { id: "object-storage-env", present: true },
        { id: "server-job-queue-env", present: true },
        { id: "observability-env", present: true },
        { id: "cdn-evidence-env", present: true }
      ]
    },
    http: {
      runtimeStatus: "pass",
      xSenaRuntime: "enterprise-neon"
    },
    summary: {
      blockers: []
    }
  };
}

function archiveWith(items: Array<{ id: string; status: string; artifactStatus?: string }>, status = "blocked") {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceArchive,
    generatedAt,
    status,
    items
  };
}

const prerequisiteArchiveItems = [
  { id: "postgres-live-probe", status: "pass", artifactStatus: "pass" },
  { id: "object-storage-live-probe", status: "pass", artifactStatus: "pass" },
  { id: "cdn-live-probe", status: "pass", artifactStatus: "pass" },
  { id: "server-job-queue-live-probe", status: "pass", artifactStatus: "pass" },
  { id: "server-job-worker-contract", status: "pass", artifactStatus: "ready" },
  { id: "observability-live-probe", status: "pass", artifactStatus: "pass" },
  { id: "performance-budget-artifact", status: "pass", artifactStatus: "pass" }
];

describe("SENA conference rehearsal plan artifact", () => {
  it("redacts target URL and scope values while surfacing hard blockers", () => {
    const artifact = buildEnterpriseConferenceRehearsalPlan({
      targetUrl: "https://www.sena.hk/workspace/sena?token=secret",
      vercelScope: "private-team-scope",
      generatedAt,
      preflightArtifact: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight,
        status: "review",
        env: {
          requirements: [
            { id: "neon-postgres-env", present: false }
          ]
        },
        http: {
          runtimeStatus: "review",
          xSenaRuntime: "enterprise-local"
        },
        summary: {
          blockers: ["runtime-header", "neon-postgres-env"]
        }
      }
    });
    const serialized = JSON.stringify(artifact);

    expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseConferenceRehearsalPlan);
    expect(artifact.status).toBe("blocked");
    expect(artifact.summary.hardBlockers).toEqual(expect.arrayContaining([
      "vercel-preflight",
      "runtime-header",
      "postgres-primary-state",
      "postgres-live-probe"
    ]));
    expect(artifact.target.targetHostHash).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain("www.sena.hk");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("private-team-scope");
    expect(serialized).toContain("<target-url>");
    expect(serialized).toContain("<vercel-team-slug>");
  });

  it("marks the plan ready for the full rehearsal when production prerequisites pass", () => {
    const artifact = buildEnterpriseConferenceRehearsalPlan({
      targetUrl: "https://www.sena.hk",
      generatedAt,
      preflightArtifact: passingPreflight(),
      archiveArtifact: archiveWith([
        ...prerequisiteArchiveItems,
        { id: "conference-load-rehearsal", status: "skipped", artifactStatus: "missing" }
      ])
    });

    expect(artifact.status).toBe("ready-for-rehearsal");
    expect(artifact.summary.hardBlockers).toEqual([]);
    expect(artifact.summary.evidenceGaps).toEqual(expect.arrayContaining([
      "conference-load-rehearsal",
      "production-evidence-archive"
    ]));
    expect(artifact.items.find((entry) => entry.id === "full-rehearsal-command")).toEqual(expect.objectContaining({
      status: "pass",
      command: expect.stringContaining("SENA_LOAD_TARGET_USERS=50")
    }));
    expect(artifact.commandTemplates.find((entry) => entry.id === "quick-smoke-load")?.command)
      .toContain("SENA_LOAD_RAMP_SECONDS=10");
    expect(artifact.commandTemplates.find((entry) => entry.id === "full-conference-load")?.command)
      .toContain("SENA_LOAD_RAMP_SECONDS=120");
  });

  it("blocks the full rehearsal when otherwise passing preflight or archive evidence is stale", () => {
    const artifact = buildEnterpriseConferenceRehearsalPlan({
      targetUrl: "https://www.sena.hk",
      generatedAt: "2026-07-10T00:00:00.000Z",
      preflightArtifact: passingPreflight(),
      archiveArtifact: archiveWith([
        ...prerequisiteArchiveItems,
        { id: "conference-load-rehearsal", status: "skipped", artifactStatus: "missing" }
      ])
    });

    expect(artifact.status).toBe("blocked");
    expect(artifact.summary.hardBlockers).toEqual(expect.arrayContaining([
      "vercel-preflight",
      "postgres-live-probe",
      "object-storage-live-probe",
      "server-job-queue-live-probe",
      "observability-live-probe",
      "performance-budget-artifact"
    ]));
    expect(artifact.items.find((entry) => entry.id === "vercel-preflight")?.evidence)
      .toEqual(expect.arrayContaining(["generatedAtStatus=stale", "maxAgeHours=168"]));
    expect(artifact.items.find((entry) => entry.id === "postgres-live-probe")?.evidence)
      .toEqual(expect.arrayContaining(["archiveGeneratedAtStatus=stale", "maxAgeHours=168"]));
    expect(artifact.nextActions).toEqual(expect.arrayContaining([
      "Rerun the Vercel production preflight so the rehearsal plan uses fresh deployment, domain, env-name, HTTPS, and runtime-header evidence.",
      "Rerun the production evidence archive so the conference rehearsal uses fresh probe and artifact custody evidence."
    ]));
  });

  it("marks the plan ready for the conference only after load and archive evidence pass", () => {
    const artifact = buildEnterpriseConferenceRehearsalPlan({
      targetUrl: "https://www.sena.hk",
      generatedAt,
      preflightArtifact: passingPreflight(),
      archiveArtifact: archiveWith([
        ...prerequisiteArchiveItems,
        { id: "conference-load-rehearsal", status: "pass", artifactStatus: "pass" }
      ], "ready")
    });

    expect(artifact.status).toBe("ready-for-conference");
    expect(artifact.summary.hardBlockers).toEqual([]);
    expect(artifact.summary.evidenceGaps).toEqual([]);
  });
});
