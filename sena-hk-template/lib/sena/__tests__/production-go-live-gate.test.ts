import { describe, expect, it } from "vitest";
import type { SenaGoLiveCloseoutCheck } from "../enterprise/go-live-closeout-check";
import type { SenaEnterpriseProductionEvidenceManifest } from "../enterprise/ops-production-evidence";
import { buildSenaEnterpriseProductionGoLiveGate } from "../enterprise/production-go-live-gate";
import type { SenaEnterpriseProductionRuntimeEnvPacket } from "../enterprise/production-runtime-env-packet";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const generatedAt = "2026-07-01T00:00:00.000Z";

function manifestFixture(status: "ready" | "review"): SenaEnterpriseProductionEvidenceManifest {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest,
    generatedAt,
    status,
    summary: {
      evidenceItems: 14,
      confirmed: status === "ready" ? 14 : 1,
      missing: status === "ready" ? 0 : 13,
      missingRequired: 0,
      missingAdvisory: status === "ready" ? 0 : 13,
      performanceBudgetConfirmed: status === "ready",
      conferenceLoadConfirmed: status === "ready",
      advisoryItems: 2,
      advisoryConfirmed: status === "ready" ? 1 : 0,
      productionRuntimeEnvPacketConfirmed: status === "ready",
      productionRuntimeEnvPacketStatus: status === "ready" ? "ready" : "blocked",
      productionRuntimeEnvPacketReadyProviderGroups: status === "ready" ? 8 : 2,
      productionRuntimeEnvPacketRequiredProviderGroups: 8,
      manifestRequired: false
    },
    policy: {
      localFileStoreIsProductionBackend: false,
      requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability",
      artifactCustody: "archive-redacted-probe-json-plus-sha256",
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    export: {
      api: "/api/sena/ops/production-evidence",
      filename: "sena-enterprise-production-evidence-manifest.json"
    },
    items: [
      { id: "cdn-contract", confirmed: true },
      { id: "postgres-live-probe", confirmed: status === "ready" },
      { id: "object-storage-live-probe", confirmed: status === "ready" },
      { id: "server-job-queue-live-probe", confirmed: status === "ready" },
      { id: "observability-live-probe", confirmed: status === "ready" },
      { id: "conference-load-rehearsal", confirmed: status === "ready" }
    ],
    advisoryItems: [
      { id: "production-runtime-env-packet", confirmed: status === "ready" },
      { id: "production-go-live-gate", confirmed: status === "ready" }
    ],
    evidence: [],
    nextActions: [],
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      rawProbePayloadValuesExcluded: true
    }
  } as SenaEnterpriseProductionEvidenceManifest;
}

function runtimeEnvPacketFixture(status: "ready" | "blocked"): SenaEnterpriseProductionRuntimeEnvPacket {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket,
    generatedAt,
    status,
    summary: {
      requiredProviderGroups: 8,
      readyProviderGroups: status === "ready" ? 8 : 2,
      blockerIds: status === "ready" ? [] : ["neon-postgres-env", "runtime-header", "server-job-queue-live-probe"]
    }
  } as SenaEnterpriseProductionRuntimeEnvPacket;
}

function goLiveCloseoutFixture(status: "ready" | "blocked"): SenaGoLiveCloseoutCheck {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveCloseoutCheck,
    generatedAt,
    status,
    redaction: {
      secretValuesExcluded: true,
      envValuesExcluded: true
    },
    environment: {
      nodeEnv: "production",
      storageEngine: status === "ready" ? "neon-postgres" : "file-backed-json",
      configuredDirectory: status === "ready" ? "env-configured" : "default-local",
      opsTokenConfigured: true,
      webhookBridgeCounts: {
        notification: true,
        email: true,
        collaborationPubSub: true,
        databaseSync: true,
        objectStorage: true,
        backup: true,
        alert: true,
        audit: true
      }
    },
    checks: [
      {
        id: "deployment-readiness",
        status,
        pass: status === "ready",
        blockers: status === "ready" ? ["none"] : ["production-postgres-state", "production-observability"]
      },
      {
        id: "go-live-rehearsal",
        status: status === "ready" ? "ready" : "blocked",
        pass: status === "ready",
        blockers: status === "ready" ? ["none"] : ["deployment-readiness-blocking-items"]
      }
    ],
    observation: {
      latestStatus: status,
      latestObservationId: status === "ready" ? "post-cutover-ready" : "post-cutover-blocked",
      ready: status === "ready" ? 1 : 0,
      active: 0,
      blocked: status === "ready" ? 0 : 1
    },
    capability: {
      goLiveStatus: status,
      remainingPlatformDecisions: ["none"]
    }
  };
}

describe("SENA production go-live gate", () => {
  it("blocks production-ready claims until evidence, runtime packet, and go-live closeout are all ready", () => {
    const gate = buildSenaEnterpriseProductionGoLiveGate({
      manifest: manifestFixture("review"),
      runtimeEnvPacket: runtimeEnvPacketFixture("blocked"),
      goLiveCloseout: goLiveCloseoutFixture("blocked"),
      generatedAt
    });

    expect(gate.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate);
    expect(gate.status).toBe("blocked");
    expect(gate.summary.productionReadyClaimAllowed).toBe(false);
    expect(gate.summary.localPilotGateIsProductionGate).toBe(false);
    expect(gate.summary.blockers).toEqual(expect.arrayContaining([
      "evidence:postgres-live-probe",
      "evidence:object-storage-live-probe",
      "advisory:production-runtime-env-packet",
      "runtime-env:neon-postgres-env",
      "runtime-env:server-job-queue-live-probe",
      "deployment-readiness:production-postgres-state",
      "go-live-rehearsal:deployment-readiness-blocking-items"
    ]));
    expect(gate.summary.blockers).not.toContain("advisory:production-go-live-gate");
    expect(gate.checks.map((check) => check.id)).toEqual([
      "production-evidence-manifest",
      "production-runtime-env-packet",
      "go-live-closeout"
    ]);
    expect(gate.gateCommands.localPilotHandoff).toBe("npm run sena:pilot:verify");
    expect(gate.gateCommands.enterpriseGoLiveCloseout).toBe("npm run sena:go-live:check");
    expect(gate.gateCommands.finalProductionGate).toBe("npm run sena:production:gate");
    expect(gate.policy.localPilotGateSeparateFromEnterpriseGoLive).toBe(true);
    expect(gate.policy.localFileStoreIsProductionBackend).toBe(false);
    expect(gate.nextActions).toHaveLength(3);
  });

  it("allows a production-ready claim only when all production gates pass together", () => {
    const gate = buildSenaEnterpriseProductionGoLiveGate({
      manifest: manifestFixture("ready"),
      runtimeEnvPacket: runtimeEnvPacketFixture("ready"),
      goLiveCloseout: goLiveCloseoutFixture("ready"),
      generatedAt
    });

    expect(gate.status).toBe("ready");
    expect(gate.summary.productionReadyClaimAllowed).toBe(true);
    expect(gate.summary.passed).toBe(3);
    expect(gate.summary.blockers).toEqual([]);
    expect(gate.nextActions).toEqual([]);
  });
});
