import { createHash } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  now,
  productionEvidenceMaxAgeHours,
  productionEvidenceTimestampStatus
} from "./ops-runtime";

export type SenaEnterpriseConferenceRehearsalPlanStatus =
  "blocked" |
  "ready-for-rehearsal" |
  "ready-for-conference";

export type SenaEnterpriseConferenceRehearsalPlanItemStatus = "pass" | "review" | "blocked";

export type SenaEnterpriseConferenceRehearsalPlanItemId =
  "vercel-preflight" |
  "runtime-header" |
  "postgres-primary-state" |
  "postgres-live-probe" |
  "object-storage-live-probe" |
  "cdn-live-probe" |
  "server-job-queue-live-probe" |
  "server-job-worker-contract" |
  "observability-live-probe" |
  "performance-budget-artifact" |
  "quick-smoke-command" |
  "full-rehearsal-command" |
  "conference-load-rehearsal" |
  "production-evidence-archive";

export type SenaEnterpriseConferenceRehearsalPlanItem = {
  id: SenaEnterpriseConferenceRehearsalPlanItemId;
  label: string;
  status: SenaEnterpriseConferenceRehearsalPlanItemStatus;
  requiredBeforeFullRehearsal: boolean;
  command?: string;
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseConferenceRehearsalPlan = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseConferenceRehearsalPlan;
  generatedAt: string;
  status: SenaEnterpriseConferenceRehearsalPlanStatus;
  target: {
    conferenceTarget: "50-users-30-minutes";
    targetUsers: 50;
    targetDurationSeconds: 1800;
    targetUrlConfigured: boolean;
    targetHostHash?: string;
    targetUrlValueExcluded: true;
    targetPathAndQueryExcluded: true;
    scopeConfigured: boolean;
    scopeValueExcluded: true;
  };
  summary: {
    totalItems: number;
    pass: number;
    review: number;
    blocked: number;
    hardBlockers: SenaEnterpriseConferenceRehearsalPlanItemId[];
    evidenceGaps: SenaEnterpriseConferenceRehearsalPlanItemId[];
  };
  policy: {
    shortSmokeIsNotProductionEvidence: true;
    fullRehearsalRequires50UsersAnd1800Seconds: true;
    localFileStoreIsProductionBackend: false;
    terminalScrollbackNotEvidence: true;
    secretValuesExcluded: true;
  };
  items: SenaEnterpriseConferenceRehearsalPlanItem[];
  commandTemplates: Array<{
    id: string;
    label: string;
    command: string;
    outputArtifact?: string;
    purpose: string;
  }>;
  evidence: string[];
  nextActions: string[];
  redaction: {
    targetUrlValueExcluded: true;
    scopeValueExcluded: true;
    secretValuesExcluded: true;
    artifactValuesExcluded: true;
  };
};

type BuildConferenceRehearsalPlanInput = {
  targetUrl?: string;
  vercelScope?: string;
  preflightArtifact?: unknown;
  archiveArtifact?: unknown;
  generatedAt?: string;
};

type ArtifactItemStatus = "pass" | "review" | "skipped" | undefined;

const conferenceTargetUsers = 50 as const;
const conferenceTargetDurationSeconds = 1800 as const;

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function nowMsFromGeneratedAt(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function artifactFreshness(input: unknown, nowMs: number) {
  const generatedAt = isRecord(input) ? stringValue(input.generatedAt) : undefined;
  const status = productionEvidenceTimestampStatus(generatedAt, process.env, nowMs);
  return {
    generatedAt,
    status,
    fresh: status === "fresh",
    maxAgeHours: productionEvidenceMaxAgeHours()
  };
}

function resolveTarget(input: BuildConferenceRehearsalPlanInput) {
  if (!input.targetUrl) {
    return {
      configured: false,
      hostHash: undefined
    };
  }

  try {
    const parsed = new URL(input.targetUrl);
    return {
      configured: parsed.protocol === "https:" || parsed.protocol === "http:",
      hostHash: sha256Text(parsed.host)
    };
  } catch {
    return {
      configured: false,
      hostHash: undefined
    };
  }
}

function readPreflightRequirement(input: unknown, requirementId: string) {
  if (!isRecord(input)) return undefined;
  const env = isRecord(input.env) ? input.env : undefined;
  const requirement = records(env?.requirements).find((entry) => entry.id === requirementId);
  if (!requirement) return undefined;
  return requirement.present === true;
}

function readPreflightRuntimeStatus(input: unknown) {
  if (!isRecord(input)) return undefined;
  const http = isRecord(input.http) ? input.http : undefined;
  return {
    runtimeStatus: stringValue(http?.runtimeStatus),
    xSenaRuntime: stringValue(http?.xSenaRuntime)
  };
}

function readPreflightBlockers(input: unknown) {
  if (!isRecord(input)) return [];
  const summary = isRecord(input.summary) ? input.summary : undefined;
  return Array.isArray(summary?.blockers)
    ? summary.blockers.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readArchiveItem(input: unknown, itemId: string) {
  if (!isRecord(input)) return undefined;
  const item = records(input.items).find((entry) => entry.id === itemId);
  if (!item) return undefined;
  const status = stringValue(item.status) as ArtifactItemStatus;
  return {
    status,
    artifactStatus: stringValue(item.artifactStatus)
  };
}

function item(input: {
  id: SenaEnterpriseConferenceRehearsalPlanItemId;
  label: string;
  status: SenaEnterpriseConferenceRehearsalPlanItemStatus;
  requiredBeforeFullRehearsal: boolean;
  evidence: string[];
  nextAction: string;
  command?: string;
}): SenaEnterpriseConferenceRehearsalPlanItem {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    requiredBeforeFullRehearsal: input.requiredBeforeFullRehearsal,
    command: input.command,
    evidence: input.evidence,
    nextAction: input.status === "pass"
      ? "Keep this evidence attached to the conference rehearsal handoff."
      : input.nextAction
  };
}

function preflightItem(input: unknown, command: string, nowMs: number): SenaEnterpriseConferenceRehearsalPlanItem {
  if (!input) {
    return item({
      id: "vercel-preflight",
      label: "Vercel production preflight artifact",
      status: "blocked",
      requiredBeforeFullRehearsal: true,
      command,
      evidence: [
        "preflightArtifact=missing",
        "requiredBeforeFullRehearsal=true"
      ],
      nextAction: "Run the Vercel preflight and pass the emitted artifact with --preflight before the 50-user rehearsal."
    });
  }
  const pass = isRecord(input) &&
    input.schemaVersion === SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight &&
    input.status === "pass";
  const freshness = artifactFreshness(input, nowMs);
  const blockers = readPreflightBlockers(input);
  return item({
    id: "vercel-preflight",
    label: "Vercel production preflight artifact",
    status: pass && freshness.fresh ? "pass" : "blocked",
    requiredBeforeFullRehearsal: true,
    command,
    evidence: [
      `schemaVersion=${isRecord(input) ? stringValue(input.schemaVersion) ?? "missing" : "invalid"}`,
      `status=${isRecord(input) ? stringValue(input.status) ?? "missing" : "invalid"}`,
      `generatedAtStatus=${freshness.status}`,
      `maxAgeHours=${freshness.maxAgeHours}`,
      `blockers=${blockers.join("|") || "none"}`
    ],
    nextAction: freshness.fresh
      ? "Fix the Vercel preflight blockers before inviting conference traffic to the production domain."
      : "Rerun the Vercel production preflight so the rehearsal plan uses fresh deployment, domain, env-name, HTTPS, and runtime-header evidence."
  });
}

function runtimeHeaderItem(preflightArtifact: unknown) {
  if (!preflightArtifact) {
    return item({
      id: "runtime-header",
      label: "Production runtime header",
      status: "blocked",
      requiredBeforeFullRehearsal: true,
      evidence: [
        "preflightArtifact=missing",
        "xSenaRuntime=unknown"
      ],
      nextAction: "Run the Vercel preflight and confirm x-sena-runtime is enterprise-neon or enterprise-postgres."
    });
  }
  const runtime = readPreflightRuntimeStatus(preflightArtifact);
  const pass = runtime?.runtimeStatus === "pass";
  return item({
    id: "runtime-header",
    label: "Production runtime header",
    status: pass ? "pass" : "blocked",
    requiredBeforeFullRehearsal: true,
    evidence: [
      `runtimeStatus=${runtime?.runtimeStatus ?? "missing"}`,
      `xSenaRuntime=${runtime?.xSenaRuntime ?? "missing"}`,
      "expectedRuntime=enterprise-neon|enterprise-postgres"
    ],
    nextAction: "Deploy after configuring Postgres primary state so x-sena-runtime reports enterprise-neon or enterprise-postgres."
  });
}

function preflightRequirementItem(input: {
  preflightArtifact: unknown;
  id: SenaEnterpriseConferenceRehearsalPlanItemId;
  label: string;
  requirementId: string;
  nextAction: string;
}) {
  const present = readPreflightRequirement(input.preflightArtifact, input.requirementId);
  return item({
    id: input.id,
    label: input.label,
    status: present === true ? "pass" : "blocked",
    requiredBeforeFullRehearsal: true,
    evidence: [
      `preflightRequirement=${input.requirementId}`,
      `present=${present === true}`,
      `preflightArtifact=${input.preflightArtifact ? "provided" : "missing"}`
    ],
    nextAction: input.nextAction
  });
}

function archiveItem(input: {
  archiveArtifact: unknown;
  id: SenaEnterpriseConferenceRehearsalPlanItemId;
  archiveItemId: string;
  label: string;
  requiredBeforeFullRehearsal: boolean;
  nextAction: string;
  nowMs: number;
}) {
  const archiveEntry = readArchiveItem(input.archiveArtifact, input.archiveItemId);
  const freshness = artifactFreshness(input.archiveArtifact, input.nowMs);
  const status = archiveEntry?.status === "pass" && freshness.fresh
    ? "pass"
    : input.requiredBeforeFullRehearsal ? "blocked" : "review";
  return item({
    id: input.id,
    label: input.label,
    status,
    requiredBeforeFullRehearsal: input.requiredBeforeFullRehearsal,
    evidence: [
      `archiveItem=${input.archiveItemId}`,
      `archiveItemStatus=${archiveEntry?.status ?? "missing"}`,
      `artifactStatus=${archiveEntry?.artifactStatus ?? "missing"}`,
      `archiveGeneratedAtStatus=${freshness.status}`,
      `maxAgeHours=${freshness.maxAgeHours}`,
      `archiveArtifact=${input.archiveArtifact ? "provided" : "missing"}`
    ],
    nextAction: input.archiveArtifact && !freshness.fresh
      ? "Rerun the production evidence archive so the conference rehearsal uses fresh probe and artifact custody evidence."
      : input.nextAction
  });
}

function buildCommands(scopeConfigured: boolean) {
  const scopeToken = scopeConfigured ? "<vercel-team-slug>" : "<vercel-team-slug>";
  return [
    {
      id: "vercel-preflight",
      label: "Archive Vercel production preflight",
      command: `npm run sena:vercel:preflight -- --scope ${scopeToken} --output output/production-evidence/vercel-production-preflight.json`,
      outputArtifact: "output/production-evidence/vercel-production-preflight.json",
      purpose: "Confirm Vercel deployment, domain, env-name contract, HTTPS response, and x-sena-runtime before load rehearsal."
    },
    {
      id: "quick-smoke-load",
      label: "Run 5-user one-minute smoke",
      command: "SENA_LOAD_TARGET_URL=<target-url> SENA_LOAD_TARGET_USERS=5 SENA_LOAD_CONCURRENCY=5 SENA_LOAD_RAMP_SECONDS=10 SENA_LOAD_DURATION_SECONDS=60 SENA_LOAD_MAX_REQUESTS=1000 npm run sena:conference:load-check -- --output output/production-evidence/conference-load-smoke.json",
      outputArtifact: "output/production-evidence/conference-load-smoke.json",
      purpose: "Catch obvious routing, CDN, timeout, and p95 regressions with a short ramp without pretending it is the 30-minute conference evidence."
    },
    {
      id: "full-conference-load",
      label: "Run 50-user 30-minute rehearsal",
      command: "SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 SENA_LOAD_TARGET_URL=<target-url> SENA_LOAD_TARGET_USERS=50 SENA_LOAD_CONCURRENCY=50 SENA_LOAD_RAMP_SECONDS=120 SENA_LOAD_DURATION_SECONDS=1800 npm run sena:conference:load-check -- --output output/production-evidence/conference-load-rehearsal.json",
      outputArtifact: "output/production-evidence/conference-load-rehearsal.json",
      purpose: "Generate the real conference-scale load artifact with a two-minute ramp and a 30-minute sustained 50-person meeting scenario."
    },
    {
      id: "bind-load-evidence",
      label: "Bind passed rehearsal artifact to Vercel evidence env",
      command: `npm run sena:production-evidence:bind -- --artifact output/production-evidence/conference-load-rehearsal.json --scope ${scopeToken} --yes`,
      outputArtifact: "Vercel production env evidence names only",
      purpose: "Record only matching artifact hashes, verified-at timestamps, and confirmed flags after the full rehearsal passes."
    },
    {
      id: "archive-production-evidence",
      label: "Archive complete production evidence bundle",
      command: `npm run sena:production-evidence:archive -- --include-load --output-dir output/production-evidence/<release-id> --vercel-scope ${scopeToken}`,
      outputArtifact: "output/production-evidence/<release-id>/sena-production-evidence-archive.json",
      purpose: "Bundle Vercel preflight, service probes, performance budget, conference load, and production manifest custody."
    }
  ];
}

export function buildEnterpriseConferenceRehearsalPlan(
  input: BuildConferenceRehearsalPlanInput = {}
): SenaEnterpriseConferenceRehearsalPlan {
  const generatedAt = input.generatedAt ?? now();
  const nowMs = nowMsFromGeneratedAt(generatedAt);
  const target = resolveTarget(input);
  const scopeConfigured = Boolean(input.vercelScope);
  const commandTemplates = buildCommands(scopeConfigured);
  const vercelPreflightCommand = commandTemplates.find((command) => command.id === "vercel-preflight")?.command ?? "";
  const quickSmokeCommand = commandTemplates.find((command) => command.id === "quick-smoke-load")?.command ?? "";
  const fullRehearsalCommand = commandTemplates.find((command) => command.id === "full-conference-load")?.command ?? "";
  const archiveStatus = isRecord(input.archiveArtifact) ? stringValue(input.archiveArtifact.status) : undefined;
  const archiveFreshness = artifactFreshness(input.archiveArtifact, nowMs);

  const items: SenaEnterpriseConferenceRehearsalPlanItem[] = [
    preflightItem(input.preflightArtifact, vercelPreflightCommand, nowMs),
    runtimeHeaderItem(input.preflightArtifact),
    preflightRequirementItem({
      preflightArtifact: input.preflightArtifact,
      id: "postgres-primary-state",
      label: "Neon/Postgres primary state env",
      requirementId: "neon-postgres-env",
      nextAction: "Configure Neon/Postgres in Vercel and redeploy before the 50-user rehearsal."
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "postgres-live-probe",
      archiveItemId: "postgres-live-probe",
      label: "Managed Postgres live probe",
      requiredBeforeFullRehearsal: true,
      nextAction: "Run and bind the Postgres live probe artifact before the full conference rehearsal.",
      nowMs
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "object-storage-live-probe",
      archiveItemId: "object-storage-live-probe",
      label: "Managed object storage live probe",
      requiredBeforeFullRehearsal: true,
      nextAction: "Run and bind the object-storage live probe artifact before the full conference rehearsal.",
      nowMs
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "cdn-live-probe",
      archiveItemId: "cdn-live-probe",
      label: "CDN live probe",
      requiredBeforeFullRehearsal: true,
      nextAction: "Run and bind the CDN probe artifact against the deployed production URL.",
      nowMs
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "server-job-queue-live-probe",
      archiveItemId: "server-job-queue-live-probe",
      label: "Managed server job queue live probe",
      requiredBeforeFullRehearsal: true,
      nextAction: "Run and bind the server job queue live probe artifact before heavy analysis/export traffic.",
      nowMs
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "server-job-worker-contract",
      archiveItemId: "server-job-worker-contract",
      label: "External worker contract",
      requiredBeforeFullRehearsal: true,
      nextAction: "Archive the external worker contract and heartbeat evidence before conference-scale traffic.",
      nowMs
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "observability-live-probe",
      archiveItemId: "observability-live-probe",
      label: "Observability live probe",
      requiredBeforeFullRehearsal: true,
      nextAction: "Run and bind the observability exporter probe before the full rehearsal.",
      nowMs
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "performance-budget-artifact",
      archiveItemId: "performance-budget-artifact",
      label: "Current-build performance budget artifact",
      requiredBeforeFullRehearsal: true,
      nextAction: "Run the performance budget verifier for the current production build before load rehearsal.",
      nowMs
    }),
    item({
      id: "quick-smoke-command",
      label: "Quick smoke load command",
      status: target.configured ? "pass" : "blocked",
      requiredBeforeFullRehearsal: false,
      command: quickSmokeCommand,
      evidence: [
        `targetUrlConfigured=${target.configured}`,
        "quickSmokeIsProductionEvidence=false",
        "targetUrlValue=excluded"
      ],
      nextAction: "Provide --target-url or SENA_LOAD_TARGET_URL before running the quick smoke command."
    }),
    item({
      id: "full-rehearsal-command",
      label: "Full conference rehearsal command",
      status: target.configured ? "pass" : "blocked",
      requiredBeforeFullRehearsal: true,
      command: fullRehearsalCommand,
      evidence: [
        `targetUrlConfigured=${target.configured}`,
        `targetUsers=${conferenceTargetUsers}`,
        `targetDurationSeconds=${conferenceTargetDurationSeconds}`,
        "targetUrlValue=excluded"
      ],
      nextAction: "Provide --target-url or SENA_LOAD_TARGET_URL before running the full conference rehearsal command."
    }),
    archiveItem({
      archiveArtifact: input.archiveArtifact,
      id: "conference-load-rehearsal",
      archiveItemId: "conference-load-rehearsal",
      label: "50-user 30-minute conference load artifact",
      requiredBeforeFullRehearsal: false,
      nextAction: "Run the full 50-user, 30-minute rehearsal and bind the passed artifact before the actual meeting.",
      nowMs
    }),
    item({
      id: "production-evidence-archive",
      label: "Production evidence archive",
      status: archiveStatus === "ready" && archiveFreshness.fresh ? "pass" : "review",
      requiredBeforeFullRehearsal: false,
      evidence: [
        `archiveStatus=${archiveStatus ?? "missing"}`,
        `archiveGeneratedAtStatus=${archiveFreshness.status}`,
        `maxAgeHours=${archiveFreshness.maxAgeHours}`,
        `archiveArtifact=${input.archiveArtifact ? "provided" : "missing"}`
      ],
      nextAction: input.archiveArtifact && !archiveFreshness.fresh
        ? "Rerun the production evidence archive with --include-load so the final conference handoff uses fresh release evidence."
        : "Run the production evidence archive with --include-load after all probes and the full load rehearsal pass."
    })
  ];

  const hardBlockers = items
    .filter((entry) => entry.requiredBeforeFullRehearsal && entry.status !== "pass")
    .map((entry) => entry.id);
  const evidenceGaps = items
    .filter((entry) => !entry.requiredBeforeFullRehearsal && entry.status !== "pass")
    .map((entry) => entry.id);
  const loadPassed = items.find((entry) => entry.id === "conference-load-rehearsal")?.status === "pass";
  const archiveReady = items.find((entry) => entry.id === "production-evidence-archive")?.status === "pass";
  const status: SenaEnterpriseConferenceRehearsalPlanStatus = hardBlockers.length
    ? "blocked"
    : loadPassed && archiveReady ? "ready-for-conference" : "ready-for-rehearsal";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseConferenceRehearsalPlan,
    generatedAt,
    status,
    target: {
      conferenceTarget: "50-users-30-minutes",
      targetUsers: conferenceTargetUsers,
      targetDurationSeconds: conferenceTargetDurationSeconds,
      targetUrlConfigured: target.configured,
      targetHostHash: target.hostHash,
      targetUrlValueExcluded: true,
      targetPathAndQueryExcluded: true,
      scopeConfigured,
      scopeValueExcluded: true
    },
    summary: {
      totalItems: items.length,
      pass: items.filter((entry) => entry.status === "pass").length,
      review: items.filter((entry) => entry.status === "review").length,
      blocked: items.filter((entry) => entry.status === "blocked").length,
      hardBlockers,
      evidenceGaps
    },
    policy: {
      shortSmokeIsNotProductionEvidence: true,
      fullRehearsalRequires50UsersAnd1800Seconds: true,
      localFileStoreIsProductionBackend: false,
      terminalScrollbackNotEvidence: true,
      secretValuesExcluded: true
    },
    items,
    commandTemplates,
    evidence: [
      `status=${status}`,
      `targetUrlConfigured=${target.configured}`,
      `scopeConfigured=${scopeConfigured}`,
      `productionEvidenceMaxAgeHours=${productionEvidenceMaxAgeHours()}`,
      `hardBlockers=${hardBlockers.join("|") || "none"}`,
      `evidenceGaps=${evidenceGaps.join("|") || "none"}`,
      "targetUrlValue=excluded",
      "scopeValue=excluded",
      "secretValues=excluded"
    ],
    nextActions: Array.from(new Set(items
      .filter((entry) => entry.status !== "pass")
      .map((entry) => entry.nextAction))),
    redaction: {
      targetUrlValueExcluded: true,
      scopeValueExcluded: true,
      secretValuesExcluded: true,
      artifactValuesExcluded: true
    }
  };
}
