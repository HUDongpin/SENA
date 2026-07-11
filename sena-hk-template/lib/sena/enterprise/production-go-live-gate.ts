import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseProductionEvidenceManifest } from "./ops-production-evidence";
import type { SenaEnterpriseProductionRuntimeEnvPacket } from "./production-runtime-env-packet";
import type { SenaGoLiveCloseoutCheck } from "./go-live-closeout-check";

export type SenaEnterpriseProductionGoLiveGateStatus = "ready" | "blocked";

export type SenaEnterpriseProductionGoLiveGateCheck = {
  id: "production-evidence-manifest" | "production-runtime-env-packet" | "go-live-closeout";
  label: string;
  status: "pass" | "blocked";
  sourceStatus: string;
  blockers: string[];
  command: string;
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseProductionGoLiveGate = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate;
  generatedAt: string;
  status: SenaEnterpriseProductionGoLiveGateStatus;
  summary: {
    productionReadyClaimAllowed: boolean;
    localPilotGateIsProductionGate: false;
    checks: number;
    passed: number;
    blockers: string[];
    evidenceManifestStatus: SenaEnterpriseProductionEvidenceManifest["status"];
    runtimeEnvPacketStatus: SenaEnterpriseProductionRuntimeEnvPacket["status"];
    goLiveCloseoutStatus: SenaGoLiveCloseoutCheck["status"];
  };
  checks: SenaEnterpriseProductionGoLiveGateCheck[];
  gateCommands: {
    localPilotHandoff: "npm run sena:pilot:verify";
    productionEvidence: "npm run sena:production-evidence:check";
    runtimeEnvPacket: "npm run sena:production-env:packet";
    enterpriseGoLiveCloseout: "npm run sena:go-live:check";
    finalProductionGate: "npm run sena:production:gate";
  };
  policy: {
    researchPilotCandidateUntilGateReady: true;
    localFileStoreIsProductionBackend: false;
    requirePostgresObjectStorageCdnQueueObservability: true;
    requireFiftyUserConferenceLoadRehearsal: true;
    localPilotGateSeparateFromEnterpriseGoLive: true;
    secretValuesExcluded: true;
    endpointValuesExcluded: true;
  };
  evidence: string[];
  nextActions: string[];
  redaction: {
    secretValuesExcluded: true;
    envValuesExcluded: true;
    endpointValuesExcluded: true;
    childArtifactsValuesExcluded: true;
  };
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sourceBlocker(prefix: string, value: string) {
  return `${prefix}:${value}`;
}

function manifestBlockers(manifest: SenaEnterpriseProductionEvidenceManifest) {
  return [
    ...manifest.items
      .filter((item) => !item.confirmed)
      .map((item) => sourceBlocker("evidence", item.id)),
    ...manifest.advisoryItems
      .filter((item) => item.id !== "production-go-live-gate" && !item.confirmed)
      .map((item) => sourceBlocker("advisory", item.id))
  ];
}

function packetBlockers(packet: SenaEnterpriseProductionRuntimeEnvPacket) {
  return packet.summary.blockerIds.map((blocker) => sourceBlocker("runtime-env", blocker));
}

function goLiveBlockers(closeout: SenaGoLiveCloseoutCheck) {
  return closeout.checks
    .filter((check) => !check.pass)
    .flatMap((check) => check.blockers.map((blocker) => sourceBlocker(check.id, blocker)));
}

function check(input: {
  id: SenaEnterpriseProductionGoLiveGateCheck["id"];
  label: string;
  pass: boolean;
  sourceStatus: string;
  blockers: string[];
  command: SenaEnterpriseProductionGoLiveGateCheck["command"];
  evidence: string[];
  nextAction: string;
}): SenaEnterpriseProductionGoLiveGateCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.pass ? "pass" : "blocked",
    sourceStatus: input.sourceStatus,
    blockers: input.pass ? [] : input.blockers,
    command: input.command,
    evidence: input.evidence,
    nextAction: input.pass ? "Keep this gate evidence attached to the production release handoff." : input.nextAction
  };
}

export function buildSenaEnterpriseProductionGoLiveGate(input: {
  manifest: SenaEnterpriseProductionEvidenceManifest;
  runtimeEnvPacket: SenaEnterpriseProductionRuntimeEnvPacket;
  goLiveCloseout: SenaGoLiveCloseoutCheck;
  generatedAt?: string;
}): SenaEnterpriseProductionGoLiveGate {
  const manifestReady = input.manifest.status === "ready";
  const packetReady = input.runtimeEnvPacket.status === "ready";
  const goLiveReady = input.goLiveCloseout.status === "ready";
  const checks = [
    check({
      id: "production-evidence-manifest",
      label: "Production evidence manifest",
      pass: manifestReady,
      sourceStatus: input.manifest.status,
      blockers: manifestBlockers(input.manifest),
      command: "npm run sena:production-evidence:check",
      evidence: [
        `manifestStatus=${input.manifest.status}`,
        `manifestEvidenceItems=${input.manifest.summary.evidenceItems}`,
        `manifestConfirmed=${input.manifest.summary.confirmed}`,
        `manifestMissing=${input.manifest.summary.missing}`,
        `manifestAdvisoryConfirmed=${input.manifest.summary.advisoryConfirmed}`,
        `manifestProductionRuntimeEnvPacketConfirmed=${input.manifest.summary.productionRuntimeEnvPacketConfirmed}`
      ],
      nextAction: "Archive and bind every Postgres, object storage, CDN, server job queue, observability, performance, conference-load, and runtime-env packet evidence item before claiming production readiness."
    }),
    check({
      id: "production-runtime-env-packet",
      label: "Production runtime env packet",
      pass: packetReady,
      sourceStatus: input.runtimeEnvPacket.status,
      blockers: packetBlockers(input.runtimeEnvPacket),
      command: "npm run sena:production-env:packet",
      evidence: [
        `runtimeEnvPacketStatus=${input.runtimeEnvPacket.status}`,
        `runtimeEnvReadyProviderGroups=${input.runtimeEnvPacket.summary.readyProviderGroups}`,
        `runtimeEnvRequiredProviderGroups=${input.runtimeEnvPacket.summary.requiredProviderGroups}`,
        `runtimeEnvBlockers=${input.runtimeEnvPacket.summary.blockerIds.join("|") || "none"}`
      ],
      nextAction: "Resolve every provider group in the runtime env packet, then regenerate it from the current preflight and production evidence archive."
    }),
    check({
      id: "go-live-closeout",
      label: "Enterprise go-live closeout",
      pass: goLiveReady,
      sourceStatus: input.goLiveCloseout.status,
      blockers: goLiveBlockers(input.goLiveCloseout),
      command: "npm run sena:go-live:check",
      evidence: [
        `goLiveCloseoutStatus=${input.goLiveCloseout.status}`,
        `goLiveStorageEngine=${input.goLiveCloseout.environment.storageEngine}`,
        `goLiveCapabilityStatus=${input.goLiveCloseout.capability.goLiveStatus}`,
        `goLiveObservationLatestStatus=${input.goLiveCloseout.observation.latestStatus}`,
        `goLiveChecks=${input.goLiveCloseout.checks.map((entry) => `${entry.id}:${entry.status}`).join("|")}`
      ],
      nextAction: "Complete deployment readiness, rehearsal, rollback, post-cutover monitor, and capability-audit closeout before changing SENA from research-pilot candidate to production ready."
    })
  ];
  const blockers = unique(checks.flatMap((entry) => entry.blockers));
  const status = blockers.length === 0 ? "ready" : "blocked";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status,
    summary: {
      productionReadyClaimAllowed: status === "ready",
      localPilotGateIsProductionGate: false,
      checks: checks.length,
      passed: checks.filter((entry) => entry.status === "pass").length,
      blockers,
      evidenceManifestStatus: input.manifest.status,
      runtimeEnvPacketStatus: input.runtimeEnvPacket.status,
      goLiveCloseoutStatus: input.goLiveCloseout.status
    },
    checks,
    gateCommands: {
      localPilotHandoff: "npm run sena:pilot:verify",
      productionEvidence: "npm run sena:production-evidence:check",
      runtimeEnvPacket: "npm run sena:production-env:packet",
      enterpriseGoLiveCloseout: "npm run sena:go-live:check",
      finalProductionGate: "npm run sena:production:gate"
    },
    policy: {
      researchPilotCandidateUntilGateReady: true,
      localFileStoreIsProductionBackend: false,
      requirePostgresObjectStorageCdnQueueObservability: true,
      requireFiftyUserConferenceLoadRehearsal: true,
      localPilotGateSeparateFromEnterpriseGoLive: true,
      secretValuesExcluded: true,
      endpointValuesExcluded: true
    },
    evidence: [
      `productionReadyClaimAllowed=${status === "ready"}`,
      `pilotGateSeparate=npm run sena:pilot:verify`,
      `enterpriseGoLiveGate=npm run sena:go-live:check`,
      `productionEvidenceGate=npm run sena:production-evidence:check`,
      `runtimeEnvPacketGate=npm run sena:production-env:packet`,
      `requiredProviderGroups=${input.runtimeEnvPacket.summary.requiredProviderGroups}`,
      `readyProviderGroups=${input.runtimeEnvPacket.summary.readyProviderGroups}`,
      "researchPilotCandidate=true-until-all-production-gates-ready",
      "localFileStoreProductionBackend=false",
      "secretValues=excluded",
      "endpointValues=excluded"
    ],
    nextActions: checks
      .filter((entry) => entry.status !== "pass")
      .map((entry) => entry.nextAction),
    redaction: {
      secretValuesExcluded: true,
      envValuesExcluded: true,
      endpointValuesExcluded: true,
      childArtifactsValuesExcluded: true
    }
  };
}
