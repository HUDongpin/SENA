import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSenaFullGitObjectId,
  senaBuildInputSha256,
  senaNextBuildIdSha256FromInputSha256,
  SENA_NEXT_BUILD_ID_GENERATOR
} from "../lib/sena/enterprise/performance-build-identity.mjs";
import {
  observeSenaLocalPerformanceBuildEvidence,
  validateSenaLocalPerformanceBuildEvidence
} from "../lib/sena/enterprise/performance-build-measurement.mjs";
import { validateSenaPerformanceBudgetSemantics } from "../lib/sena/enterprise/performance-budget-validation.mjs";
import { buildSenaGoLiveCloseoutCheck } from "../lib/sena/enterprise/go-live-closeout-check";
import { buildEnterpriseProductionEvidenceManifest } from "../lib/sena/enterprise/ops-production-evidence";
import { buildSenaEnterpriseProductionGoLiveGate } from "../lib/sena/enterprise/production-go-live-gate";
import { buildEnterpriseProductionRuntimeEnvPacket } from "../lib/sena/enterprise/production-runtime-env-packet";
import { SENA_SCHEMA_VERSIONS } from "../lib/sena/schema-registry";
import {
  sha256VerificationArtifact,
  serializeVerificationArtifact,
  writeVerificationArtifact
} from "./verification-artifact-output";

type ArchiveStatus = "ready" | "blocked";
type ArchiveItemStatus = "pass" | "review" | "skipped";

type ArchiveItem = {
  id: string;
  label: string;
  command: string;
  status: ArchiveItemStatus;
  requiredForProduction: boolean;
  exitCode?: number;
  outputFile?: string;
  sha256File?: string;
  artifactSha256?: string;
  artifactHashMatches?: boolean;
  artifactSchemaVersion?: string;
  artifactStatus?: string;
  artifactArchiveValidation?: string;
  skippedReason?: string;
  stdoutSha256?: string;
  stderrSha256?: string;
  evidence: string[];
  nextAction: string;
};

type ArchiveManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceArchive;
  generatedAt: string;
  status: ArchiveStatus;
  outputDir: string;
  summary: {
    totalItems: number;
    pass: number;
    review: number;
    skipped: number;
    productionBlockers: string[];
  };
  policy: {
    localFileStoreIsProductionBackend: false;
    requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability";
    longConferenceLoadRequiresExplicitIncludeLoad: true;
    secretValuesExcluded: true;
    terminalScrollbackNotEvidence: true;
  };
  items: ArchiveItem[];
  evidence: string[];
  nextActions: string[];
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
    childStdoutStderrExcludedFromManifest: true;
  };
};

type Options = {
  outputDir: string;
  includeLoad: boolean;
  advisory: boolean;
  skipVercelPreflight: boolean;
  vercelSkipHttp: boolean;
  cdnVerifyUrl: string;
  cdnTimeoutMs?: number;
  verifierBin: string;
  vercelScope?: string;
  artifactDir?: string;
};

type VerifierDefinition = {
  id: string;
  label: string;
  npmCommand: string;
  script: string;
  outputFile: string;
  requiredForProduction: boolean;
  nextAction: string;
};

const senaProjectRoot = fileURLToPath(new URL("../", import.meta.url));

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function verifierBinForEnv(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === "test" && env.SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN
    ? env.SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN
    : "./node_modules/.bin/vite-node";
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    outputDir: path.join("output", "production-evidence", timestampForPath()),
    includeLoad: false,
    advisory: false,
    skipVercelPreflight: false,
    vercelSkipHttp: false,
    cdnVerifyUrl: process.env.SENA_CDN_VERIFY_URL || "https://www.sena.hk",
    verifierBin: verifierBinForEnv(process.env)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--output-dir requires a directory path.");
      options.outputDir = value;
      index += 1;
    } else if (arg === "--include-load") {
      options.includeLoad = true;
    } else if (arg === "--advisory") {
      options.advisory = true;
    } else if (arg === "--skip-vercel-preflight") {
      options.skipVercelPreflight = true;
    } else if (arg === "--vercel-skip-http") {
      options.vercelSkipHttp = true;
    } else if (arg === "--vercel-scope") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--vercel-scope requires a team slug.");
      options.vercelScope = value;
      index += 1;
    } else if (arg === "--cdn-verify-url") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--cdn-verify-url requires a URL.");
      options.cdnVerifyUrl = value;
      index += 1;
    } else if (arg === "--cdn-timeout-ms") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--cdn-timeout-ms requires a millisecond value.");
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 1000) throw new Error("--cdn-timeout-ms must be at least 1000.");
      options.cdnTimeoutMs = Math.min(30_000, Math.trunc(parsed));
      index += 1;
    } else if (arg === "--artifact-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--artifact-dir requires a directory path.");
      options.artifactDir = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Archive SENA production evidence verifier artifacts.

Usage:
  npm run sena:production-evidence:archive -- [--output-dir <dir>] [--include-load] [--advisory] [--vercel-scope <team>] [--cdn-verify-url <url>]

Options:
  --output-dir <dir>       Directory for verifier artifacts and archive manifest.
  --include-load           Run the conference load verifier against --cdn-verify-url. Requires a deployed HTTPS production URL.
  --advisory               Do not force SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED=1 in child verifiers.
  --vercel-scope <team>    Vercel team scope for the production preflight.
  --vercel-skip-http       Skip the live HTTPS check inside the Vercel production preflight.
  --cdn-verify-url <url>   CDN URL for the live compression/static cache probe. Default: ${options.cdnVerifyUrl}
  --cdn-timeout-ms <ms>    CDN live probe timeout, clamped to 30000. Uses SENA_CDN_PROBE_TIMEOUT_MS when omitted.
  --artifact-dir <dir>     Reuse redacted verifier artifacts from this directory before running local verifiers.
  --skip-vercel-preflight  Skip the Vercel deployment preflight and keep it as a production blocker.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function productionLoadTargetProblem(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return "target-url-not-https";
    if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return "target-url-local";
    if (hostname.startsWith("127.") || hostname === "0.0.0.0") return "target-url-local";
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return "target-url-private-network";
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return "target-url-private-network";
    return undefined;
  } catch {
    return "target-url-invalid";
  }
}

function assertConferenceLoadTarget(options: Options) {
  if (!options.includeLoad) return;
  const problem = productionLoadTargetProblem(options.cdnVerifyUrl);
  if (!problem) return;
  console.error(
    `SENA production evidence archive refused --include-load: ${problem}. ` +
    "Set --cdn-verify-url to the deployed HTTPS production URL before running the 50-user, 30-minute rehearsal."
  );
  process.exit(1);
}

function sha256Text(value: string) {
  return sha256VerificationArtifact(value);
}

function validSha256(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

const productionRuntimeHeaderValues = new Set(["enterprise-neon", "enterprise-postgres"]);

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isProductionEvidenceManifestArtifact(value: unknown): value is ReturnType<typeof buildEnterpriseProductionEvidenceManifest> {
  const artifact = recordValue(value);
  const summary = recordValue(artifact?.summary);
  return artifact?.schemaVersion === SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest &&
    (artifact.status === "ready" || artifact.status === "review" || artifact.status === "blocked") &&
    Number.isFinite(summary?.evidenceItems) &&
    Array.isArray(artifact.items) &&
    Array.isArray(artifact.advisoryItems);
}

function isProductionRuntimeEnvPacketArtifact(value: unknown): value is ReturnType<typeof buildEnterpriseProductionRuntimeEnvPacket> {
  const artifact = recordValue(value);
  const summary = recordValue(artifact?.summary);
  return artifact?.schemaVersion === SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket &&
    (artifact.status === "ready" || artifact.status === "blocked") &&
    Number.isFinite(summary?.readyProviderGroups) &&
    Number.isFinite(summary?.requiredProviderGroups) &&
    Array.isArray(summary?.blockerIds);
}

export function validateSenaPerformanceBudgetArtifactForArchive(artifact: {
  summary?: { totalStaticJsFiles?: number };
  buildIdentity?: Record<string, unknown>;
  sourceCustody?: Record<string, unknown>;
}, localEvidence: ReturnType<typeof observeSenaLocalPerformanceBuildEvidence>) {
  const semanticProblem = validateSenaPerformanceBudgetSemantics(artifact);
  if (semanticProblem) return semanticProblem;
  const identity = artifact.buildIdentity;
  const sourceCustody = artifact.sourceCustody;
  if (!identity || identity.values !== "hashes-and-commit-only") {
    return "performance-build-identity-missing";
  }
  if (identity.nextBuildIdGenerator !== SENA_NEXT_BUILD_ID_GENERATOR ||
    typeof identity.nextBuildMatchesCurrentSource !== "boolean" ||
    !validSha256(identity.buildInputSha256) ||
    !validSha256(identity.currentExpectedBuildInputSha256) ||
    typeof identity.buildObservationStable !== "boolean" ||
    typeof identity.measuredArtifactSetStable !== "boolean" ||
    identity.buildInputEnvironmentScope !== "not-bound-use-measured-artifact-set-sha256" ||
    !validSha256(identity.measuredArtifactSetSha256) ||
    !nonNegativeInteger(identity.measuredArtifactFileCount) ||
    identity.measuredArtifactFileCount <= 0) {
    return "performance-build-provenance-missing";
  }
  const totalStaticJsFiles = artifact.summary?.totalStaticJsFiles;
  if (identity.nextBuildMatchesCurrentSource !== true ||
    identity.buildObservationStable !== true ||
    identity.measuredArtifactSetStable !== true ||
    identity.buildInputSha256 !== identity.currentExpectedBuildInputSha256 ||
    !nonNegativeInteger(totalStaticJsFiles) ||
    identity.measuredArtifactFileCount !== totalStaticJsFiles + 1) {
    return "performance-build-provenance-mismatch";
  }
  if (!validSha256(identity.nextBuildIdSha256) ||
    !validSha256(identity.packageLockSha256) ||
    !validSha256(identity.gitStatusSha256) ||
    !validSha256(identity.sourceTreeSha256) ||
    !validSha256(identity.sourceFileListSha256) ||
    !validSha256(identity.sourceReadErrorSha256) ||
    !nonNegativeInteger(identity.gitDirtyFileCount) ||
    !nonNegativeInteger(identity.sourceFileCount) ||
    identity.sourceFileCount <= 0 ||
    !nonNegativeInteger(identity.sourceReadErrorCount) ||
    identity.sourceReadErrorCount !== 0 ||
    identity.sourceReadErrorSha256 !== createHash("sha256").update("").digest("hex")) {
    return "performance-build-identity-hash-missing";
  }
  if (!isSenaFullGitObjectId(identity.gitCommit)) {
    return "performance-build-git-commit-missing";
  }
  const cleanGitStatusSha256 = createHash("sha256").update("").digest("hex");
  const coherentGitDirtyIdentity = identity.gitDirty === false
    ? identity.gitDirtyFileCount === 0 && identity.gitStatusSha256 === cleanGitStatusSha256
    : identity.gitDirty === true && (identity.gitDirtyFileCount as number) > 0;
  if (!coherentGitDirtyIdentity) {
    return "performance-build-git-identity-invalid";
  }
  const expectedBuildInputSha256 = senaBuildInputSha256({
    gitCommit: identity.gitCommit as string,
    gitDirty: identity.gitDirty as boolean,
    gitStatusSha256: identity.gitStatusSha256 as string,
    gitDirtyFileCount: identity.gitDirtyFileCount as number,
    packageLockSha256: identity.packageLockSha256 as string,
    sourceTreeSha256: identity.sourceTreeSha256 as string,
    sourceFileListSha256: identity.sourceFileListSha256 as string,
    sourceFileCount: identity.sourceFileCount as number,
    sourceReadErrorCount: identity.sourceReadErrorCount as number,
    sourceReadErrorSha256: identity.sourceReadErrorSha256 as string
  });
  if (identity.buildInputSha256 !== expectedBuildInputSha256 ||
    identity.nextBuildIdSha256 !== senaNextBuildIdSha256FromInputSha256(expectedBuildInputSha256)) {
    return "performance-build-provenance-mismatch";
  }
  if (identity.gitDirty !== false) return "performance-build-git-dirty";
  if (!sourceCustody) return "performance-source-custody-missing";
  if (sourceCustody.values !== "hashes-and-counts-only") {
    return "performance-source-custody-missing";
  }
  if (sourceCustody.reviewedClean !== true) {
    return "performance-source-custody-not-clean";
  }
  if (sourceCustody.mode !== "git-clean-worktree" ||
    sourceCustody.baseGitCommit !== identity.gitCommit ||
    sourceCustody.rootGitDirty !== false ||
    sourceCustody.rootGitDirtyFileCount !== 0 ||
    sourceCustody.rootGitStatusSha256 !== identity.gitStatusSha256) {
    return "performance-source-custody-invalid";
  }
  return validateSenaLocalPerformanceBuildEvidence(artifact, localEvidence);
}

function performanceArchiveValidation(artifact: {
  summary?: { totalStaticJsFiles?: number };
  buildIdentity?: Record<string, unknown>;
  sourceCustody?: Record<string, unknown>;
}) {
  return validateSenaPerformanceBudgetArtifactForArchive(
    artifact,
    observeSenaLocalPerformanceBuildEvidence(senaProjectRoot)
  );
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function httpStatusSuccess(value: unknown) {
  const status = numericValue(value);
  return status !== undefined && status >= 200 && status < 400;
}

function expectedHostHash(value: string) {
  try {
    return sha256Text(new URL(value).host);
  } catch {
    return undefined;
  }
}

function hostHashFromDomainValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return sha256Text(new URL(value).host);
  } catch {
    try {
      return sha256Text(new URL(`https://${value}`).host);
    } catch {
      return undefined;
    }
  }
}

function vercelPreflightArchiveValidation(artifact: {
  target?: Record<string, unknown>;
  deployment?: Record<string, unknown>;
  domain?: Record<string, unknown>;
  http?: Record<string, unknown>;
  redaction?: Record<string, unknown>;
}, options: Options) {
  const targetProblem = productionLoadTargetProblem(options.cdnVerifyUrl);
  if (targetProblem) return `vercel-preflight-${targetProblem}`;
  const expectedTargetHash = expectedHostHash(options.cdnVerifyUrl);
  const artifactTargetHash = hostHashFromDomainValue(artifact.target?.domain);
  if (!artifactTargetHash) {
    return "vercel-preflight-target-host-missing";
  }
  if (expectedTargetHash && artifactTargetHash !== expectedTargetHash) {
    return "vercel-preflight-target-host-mismatch";
  }
  if (artifact.deployment?.status !== "pass" || !validSha256(artifact.deployment?.deploymentUrlHash)) {
    return "vercel-preflight-deployment-evidence-missing";
  }
  if (artifact.domain?.status !== "pass") {
    return "vercel-preflight-domain-evidence-missing";
  }
  if (artifact.http?.status !== "pass" || artifact.http?.runtimeStatus !== "pass") {
    return "vercel-preflight-runtime-header-not-pass";
  }
  if (!httpStatusSuccess(artifact.http?.httpStatus)) {
    return "vercel-preflight-http-status-missing";
  }
  if (!productionRuntimeHeaderValues.has(String(artifact.http?.xSenaRuntime ?? ""))) {
    return "vercel-preflight-runtime-header-missing";
  }
  if (artifact.redaction?.secretValuesExcluded !== true ||
    artifact.redaction?.envValuesExcluded !== true ||
    artifact.redaction?.endpointValuesHashed !== true) {
    return "vercel-preflight-redaction-missing";
  }
  return undefined;
}

function cdnArchiveValidation(artifact: {
  target?: Record<string, unknown>;
}, options: Options) {
  const targetProblem = productionLoadTargetProblem(options.cdnVerifyUrl);
  if (targetProblem) return `cdn-${targetProblem}`;
  const expectedTargetHash = expectedHostHash(options.cdnVerifyUrl);
  if (!validSha256(artifact.target?.hostHash)) {
    return "cdn-target-host-hash-missing";
  }
  if (expectedTargetHash && artifact.target?.hostHash !== expectedTargetHash) {
    return "cdn-target-host-hash-mismatch";
  }
  return undefined;
}

function conferenceLoadArchiveValidation(artifact: {
  target?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}, options: Options) {
  if (artifact.target?.requireProductionTarget !== true) {
    return "conference-load-production-target-not-required";
  }
  if (artifact.target?.productionOriginSatisfied !== true) {
    return "conference-load-production-origin-not-satisfied";
  }
  const expectedOriginHash = expectedHostHash(options.cdnVerifyUrl);
  if (!validSha256(artifact.origin?.originHash)) {
    return "conference-load-origin-hash-missing";
  }
  if (expectedOriginHash && artifact.origin?.originHash !== expectedOriginHash) {
    return "conference-load-origin-hash-mismatch";
  }
  if (artifact.target?.productionTargetSatisfied !== true) {
    return "conference-load-production-target-not-satisfied";
  }
  const users = numericValue(artifact.target?.configuredUsers);
  if (users === undefined || users < 50) {
    return "conference-load-target-users-insufficient";
  }
  const durationSeconds = numericValue(artifact.target?.configuredDurationSeconds);
  if (durationSeconds === undefined || durationSeconds < 1800) {
    return "conference-load-target-duration-insufficient";
  }
  const p95Ms = numericValue(artifact.summary?.p95Ms);
  if (p95Ms === undefined || p95Ms < 0) {
    return "conference-load-p95-missing";
  }
  const errorRatePercent = numericValue(artifact.summary?.errorRatePercent);
  if (errorRatePercent === undefined || errorRatePercent < 0 || errorRatePercent > 100) {
    return "conference-load-error-rate-missing";
  }
  return undefined;
}

function artifactArchiveValidationReason(definition: VerifierDefinition, artifact: {
  buildIdentity?: Record<string, unknown>;
  target?: Record<string, unknown>;
  deployment?: Record<string, unknown>;
  domain?: Record<string, unknown>;
  http?: Record<string, unknown>;
  redaction?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}, options: Options) {
  if (definition.id === "vercel-production-preflight") {
    return vercelPreflightArchiveValidation(artifact, options);
  }
  if (definition.id === "cdn-live-probe") {
    return cdnArchiveValidation(artifact, options);
  }
  if (definition.id === "performance-budget-artifact") {
    return performanceArchiveValidation(artifact);
  }
  if (definition.id === "conference-load-rehearsal") {
    return conferenceLoadArchiveValidation(artifact, options);
  }
  return undefined;
}

function applyConferenceLoadEnv(env: NodeJS.ProcessEnv, options: Options) {
  env.SENA_LOAD_REQUIRE_PRODUCTION_TARGET = "1";
  env.SENA_LOAD_TARGET_URL = options.cdnVerifyUrl;
  env.SENA_LOAD_TARGET_USERS = "50";
  env.SENA_LOAD_CONCURRENCY = "50";
  env.SENA_LOAD_RAMP_SECONDS = "120";
  env.SENA_LOAD_DURATION_SECONDS = "1800";
  env.SENA_LOAD_THINK_TIME_MS = "1000";
}

function redactedChildEnv(options: Options, definition?: Pick<VerifierDefinition, "id">) {
  const env = { ...process.env };
  if (!options.advisory) env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED = "1";
  env.SENA_CDN_VERIFY_URL = options.cdnVerifyUrl;
  if (options.cdnTimeoutMs !== undefined) {
    env.SENA_CDN_PROBE_TIMEOUT_MS = String(options.cdnTimeoutMs);
  }
  if (definition?.id === "conference-load-rehearsal") {
    applyConferenceLoadEnv(env, options);
  }
  return env;
}

function verifierDefinitions(options: Options): VerifierDefinition[] {
  const definitions: VerifierDefinition[] = [
    {
      id: "vercel-production-preflight",
      label: "Vercel production deployment preflight",
      npmCommand: "npm run sena:vercel:preflight",
      script: "scripts/verify-sena-vercel-production.ts",
      outputFile: "vercel-production-preflight.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:vercel:preflight with --output and fix any Vercel deployment, domain, HTTP, or production env-name blockers."
    },
    {
      id: "postgres-schema-contract",
      label: "Managed Postgres schema contract",
      npmCommand: "npm run sena:postgres:schema-contract",
      script: "scripts/verify-sena-postgres-schema-contract.ts",
      outputFile: "postgres-schema-contract.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:postgres:schema-contract with --output and archive the redacted table/index DDL contract before live Postgres probe evidence is claimed."
    },
    {
      id: "postgres-live-probe",
      label: "Managed Postgres live probe",
      npmCommand: "npm run sena:postgres:verify",
      script: "scripts/verify-sena-postgres-runtime.ts",
      outputFile: "postgres-probe.json",
      requiredForProduction: true,
      nextAction: "Configure Neon/Postgres and run npm run sena:postgres:verify with --output."
    },
    {
      id: "object-storage-contract",
      label: "Managed object storage contract",
      npmCommand: "npm run sena:object-storage:contract",
      script: "scripts/verify-sena-object-storage-contract.ts",
      outputFile: "object-storage-contract.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:object-storage:contract with --output and archive the redacted namespace/custody contract before live object-storage probe evidence is claimed."
    },
    {
      id: "object-storage-live-probe",
      label: "Managed object storage live probe",
      npmCommand: "npm run sena:object-storage:verify",
      script: "scripts/verify-sena-object-storage-runtime.ts",
      outputFile: "object-storage-probe.json",
      requiredForProduction: true,
      nextAction: "Configure native object storage and run npm run sena:object-storage:verify with --output."
    },
    {
      id: "cdn-contract",
      label: "CDN compression and immutable-cache contract",
      npmCommand: "npm run sena:cdn:contract",
      script: "scripts/verify-sena-cdn-contract.ts",
      outputFile: "cdn-contract.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:cdn:contract with --output and archive the redacted compression/cache contract before live CDN probe evidence is claimed."
    },
    {
      id: "cdn-live-probe",
      label: "CDN compression and static asset cache probe",
      npmCommand: "npm run sena:cdn:verify",
      script: "scripts/verify-sena-cdn-runtime.ts",
      outputFile: "cdn-probe.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:cdn:verify with --output against the deployed CDN URL."
    },
    {
      id: "server-job-queue-contract",
      label: "Managed server job queue dispatch and custody contract",
      npmCommand: "npm run sena:jobs:queue-contract",
      script: "scripts/verify-sena-job-queue-contract.ts",
      outputFile: "server-job-queue-contract.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:jobs:queue-contract with --output and archive the redacted dispatch/custody contract before live queue probe evidence is claimed."
    },
    {
      id: "server-job-queue-live-probe",
      label: "Managed server job queue live probe",
      npmCommand: "npm run sena:jobs:queue-verify",
      script: "scripts/verify-sena-job-queue-runtime.ts",
      outputFile: "server-job-queue-probe.json",
      requiredForProduction: true,
      nextAction: "Configure the managed queue and run npm run sena:jobs:queue-verify with --output."
    },
    {
      id: "server-job-worker-contract",
      label: "External worker contract evidence",
      npmCommand: "npm run sena:jobs:worker-contract",
      script: "scripts/verify-sena-job-worker-contract.ts",
      outputFile: "server-job-worker-contract.json",
      requiredForProduction: true,
      nextAction: "Implement and verify a nonce-bound managed-queue to external-worker authenticated callback receipt; the same-process status-store self-test is insufficient."
    },
    {
      id: "observability-contract",
      label: "Observability SLI, alerting, and exporter contract",
      npmCommand: "npm run sena:observability:contract",
      script: "scripts/verify-sena-observability-contract.ts",
      outputFile: "observability-contract.json",
      requiredForProduction: true,
      nextAction: "Run npm run sena:observability:contract with --output and archive the redacted SLI/alerting/exporter contract before live observability probe evidence is claimed."
    },
    {
      id: "observability-live-probe",
      label: "Observability exporter live probe",
      npmCommand: "npm run sena:observability:verify",
      script: "scripts/verify-sena-observability-runtime.ts",
      outputFile: "observability-probe.json",
      requiredForProduction: true,
      nextAction: "Configure observability exporter, dashboard, runbook, owner, and run npm run sena:observability:verify with --output."
    },
    {
      id: "performance-budget-artifact",
      label: "Production performance budget artifact",
      npmCommand: "npm run sena:performance:check",
      script: "scripts/verify-sena-performance-path.ts",
      outputFile: "performance-budget.json",
      requiredForProduction: true,
      nextAction: "Run npm run build and npm run sena:performance:check with --output for the current build."
    }
  ];
  if (options.includeLoad) {
    definitions.push({
      id: "conference-load-rehearsal",
      label: "Conference load rehearsal",
      npmCommand: "npm run sena:conference:load-check",
      script: "scripts/verify-sena-conference-load.ts",
      outputFile: "conference-load-rehearsal.json",
      requiredForProduction: true,
      nextAction: "Run the 50-user, 30-minute rehearsal against the deployed URL and archive the emitted artifact."
    });
  }
  definitions.push({
    id: "production-evidence-manifest",
    label: "Production evidence manifest",
    npmCommand: "npm run sena:production-evidence:check",
    script: "scripts/verify-sena-production-evidence-manifest.ts",
    outputFile: "production-evidence-manifest.json",
    requiredForProduction: true,
    nextAction: "Set every required artifact hash and verified-at env var, then rerun this archive."
  });
  return definitions;
}

function readArtifact(outputPath: string) {
  const text = readFileSync(outputPath, "utf8");
  const sha = sha256Text(text);
  const shaPath = `${outputPath}.sha256`;
  const shaText = existsSync(shaPath) ? readFileSync(shaPath, "utf8").trim() : "";
  const parsed = JSON.parse(text) as {
    schemaVersion?: string;
    status?: string;
    productionReady?: boolean;
    buildIdentity?: Record<string, unknown>;
  };
  return {
    parsed,
    sha,
    shaPath,
    shaMatches: shaText === `${sha}  ${path.basename(outputPath)}`
  };
}

function artifactReadyForArchive(definition: Pick<VerifierDefinition, "id">, artifactStatus: string) {
  if (definition.id === "production-runtime-env-packet") {
    return artifactStatus === "blocked" || artifactStatus === "ready";
  }
  if (definition.id === "production-go-live-gate") {
    return artifactStatus === "blocked" || artifactStatus === "ready";
  }
  return artifactStatus === "pass" || artifactStatus === "ready";
}

function archiveItemNextAction(input: {
  definition: VerifierDefinition;
  exitCode: number;
  artifactHashMatches: boolean;
  artifactReady: boolean;
  artifactArchiveValidation?: string;
}) {
  if (input.exitCode === 0 && input.artifactHashMatches && input.artifactReady && !input.artifactArchiveValidation) {
    return "Keep this artifact in the release evidence bundle.";
  }
  if (!input.artifactHashMatches) {
    return `Fix ${input.definition.npmCommand} so the emitted .sha256 custody file matches the artifact JSON.`;
  }
  if (!input.artifactReady) {
    return `Fix ${input.definition.npmCommand} so the emitted artifact status is pass or ready before archive binding.`;
  }
  if (input.artifactArchiveValidation) {
    return `Fix ${input.definition.npmCommand} so the emitted artifact is bindable before archive binding (${input.artifactArchiveValidation}).`;
  }
  return input.definition.nextAction;
}

function maybeReuseArtifactPath(definition: VerifierDefinition, options: Options) {
  if (!options.artifactDir) return undefined;
  const artifactPath = path.resolve(options.artifactDir, definition.outputFile);
  return existsSync(artifactPath) ? artifactPath : undefined;
}

function copyArtifactForArchive(sourcePath: string, outputPath: string) {
  if (path.resolve(sourcePath) !== path.resolve(outputPath)) {
    copyFileSync(sourcePath, outputPath);
  }
  const sourceShaPath = `${sourcePath}.sha256`;
  const outputShaPath = `${outputPath}.sha256`;
  if (existsSync(sourceShaPath) && path.resolve(sourceShaPath) !== path.resolve(outputShaPath)) {
    copyFileSync(sourceShaPath, outputShaPath);
  }
}

function archiveExistingArtifact(
  definition: VerifierDefinition,
  outputPath: string,
  sourcePath: string,
  options: Options
): ArchiveItem {
  copyArtifactForArchive(sourcePath, outputPath);
  const artifact = readArtifact(outputPath);
  const artifactStatus = artifact.parsed.status ?? (artifact.parsed.productionReady ? "pass" : "review");
  const artifactReady = artifactReadyForArchive(definition, artifactStatus);
  const artifactArchiveValidation = artifactArchiveValidationReason(definition, artifact.parsed, options);
  const artifactBindableForArchive = !artifactArchiveValidation;
  const itemPassed = artifact.shaMatches && artifactReady && artifactBindableForArchive;
  return {
    id: definition.id,
    label: definition.label,
    command: replayCommand(definition, outputPath, options),
    status: itemPassed ? "pass" : "review",
    requiredForProduction: definition.requiredForProduction,
    exitCode: 0,
    outputFile: path.relative(process.cwd(), outputPath),
    sha256File: path.relative(process.cwd(), artifact.shaPath),
    artifactSha256: artifact.sha,
    artifactHashMatches: artifact.shaMatches,
    artifactSchemaVersion: artifact.parsed.schemaVersion,
    artifactStatus,
    artifactArchiveValidation,
    stdoutSha256: sha256Text(""),
    stderrSha256: sha256Text(""),
    evidence: [
      "artifactSource=artifact-dir",
      `artifactSourceFile=${path.basename(sourcePath)}`,
      "localVerifierRun=false",
      "exitCode=0",
      "artifactWritten=true",
      `artifactHashMatches=${artifact.shaMatches}`,
      `artifactStatus=${artifactStatus}`,
      `artifactReadyForArchive=${artifactReady}`,
      `artifactBindableForArchive=${artifactBindableForArchive}`,
      `artifactArchiveValidation=${artifactArchiveValidation ?? "pass"}`,
      "childStdoutStderr=not-run"
    ],
    nextAction: archiveItemNextAction({
      definition,
      exitCode: 0,
      artifactHashMatches: artifact.shaMatches,
      artifactReady,
      artifactArchiveValidation
    })
  };
}

function replayCommand(definition: VerifierDefinition, outputPath: string, options: Options) {
  const args = [`--output ${path.relative(process.cwd(), outputPath)}`];
  if (definition.id === "vercel-production-preflight" && options.vercelScope) {
    args.push(`--scope ${options.vercelScope}`);
  }
  if (definition.id === "vercel-production-preflight" && options.vercelSkipHttp) {
    args.push("--skip-http");
  }
  const command = `${definition.npmCommand} -- ${args.join(" ")}`;
  if (definition.id === "cdn-live-probe") {
    return `SENA_CDN_VERIFY_URL=<configured> ${command}`;
  }
  if (definition.id === "conference-load-rehearsal") {
    return `SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 SENA_LOAD_TARGET_URL=<configured> SENA_LOAD_TARGET_USERS=50 SENA_LOAD_CONCURRENCY=50 SENA_LOAD_RAMP_SECONDS=120 SENA_LOAD_DURATION_SECONDS=1800 SENA_LOAD_THINK_TIME_MS=1000 ${command}`;
  }
  return command;
}

function runVerifier(
  definition: VerifierDefinition,
  options: Options
): ArchiveItem {
  const outputPath = path.join(options.outputDir, definition.outputFile);
  const reuseArtifactPath = maybeReuseArtifactPath(definition, options);
  if (reuseArtifactPath) {
    return archiveExistingArtifact(definition, outputPath, reuseArtifactPath, options);
  }
  const args = [
    definition.script,
    "--output",
    outputPath
  ];
  if (definition.id === "vercel-production-preflight" && options.vercelScope) {
    args.push("--scope", options.vercelScope);
  }
  if (definition.id === "vercel-production-preflight" && options.vercelSkipHttp) {
    args.push("--skip-http");
  }
  const result = spawnSync(options.verifierBin, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: redactedChildEnv(options, definition)
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? 1;
  if (existsSync(outputPath)) {
    const artifact = readArtifact(outputPath);
    const artifactStatus = artifact.parsed.status ?? (artifact.parsed.productionReady ? "pass" : "review");
    const artifactReady = artifactReadyForArchive(definition, artifactStatus);
    const artifactArchiveValidation = artifactArchiveValidationReason(definition, artifact.parsed, options);
    const artifactBindableForArchive = !artifactArchiveValidation;
    const itemPassed = exitCode === 0 && artifact.shaMatches && artifactReady && artifactBindableForArchive;
    return {
      id: definition.id,
      label: definition.label,
      command: replayCommand(definition, outputPath, options),
      status: itemPassed ? "pass" : "review",
      requiredForProduction: definition.requiredForProduction,
      exitCode,
      outputFile: path.relative(process.cwd(), outputPath),
      sha256File: path.relative(process.cwd(), artifact.shaPath),
      artifactSha256: artifact.sha,
      artifactHashMatches: artifact.shaMatches,
      artifactSchemaVersion: artifact.parsed.schemaVersion,
      artifactStatus,
      artifactArchiveValidation,
      stdoutSha256: sha256Text(stdout),
      stderrSha256: sha256Text(stderr),
      evidence: [
        `exitCode=${exitCode}`,
        `artifactWritten=true`,
        `artifactHashMatches=${artifact.shaMatches}`,
        `artifactStatus=${artifactStatus}`,
        `artifactReadyForArchive=${artifactReady}`,
        `artifactBindableForArchive=${artifactBindableForArchive}`,
        `artifactArchiveValidation=${artifactArchiveValidation ?? "pass"}`,
        "childStdoutStderr=excluded"
      ],
      nextAction: archiveItemNextAction({
        definition,
        exitCode,
        artifactHashMatches: artifact.shaMatches,
        artifactReady,
        artifactArchiveValidation
      })
    };
  }
  return {
    id: definition.id,
    label: definition.label,
    command: replayCommand(definition, outputPath, options),
    status: "review",
    requiredForProduction: definition.requiredForProduction,
    exitCode,
    stdoutSha256: sha256Text(stdout),
    stderrSha256: sha256Text(stderr),
    evidence: [
      `exitCode=${exitCode}`,
      "artifactWritten=false",
      "childStdoutStderr=excluded"
    ],
    nextAction: `Fix ${definition.npmCommand} so it emits a redacted artifact with --output.`
  };
}

function runtimeEnvPacketArchiveValidation(artifact: {
  schemaVersion?: string;
  status?: string;
  policy?: Record<string, unknown>;
  redaction?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  providerGroups?: unknown;
}) {
  if (artifact.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket) {
    return "runtime-env-packet-schema-invalid";
  }
  if (artifact.status !== "blocked" && artifact.status !== "ready") {
    return "runtime-env-packet-status-invalid";
  }
  if (artifact.policy?.localFileStoreIsProductionBackend !== false) {
    return "runtime-env-packet-policy-missing";
  }
  if (artifact.redaction?.secretValuesExcluded !== true ||
    artifact.redaction?.endpointValuesExcluded !== true ||
    artifact.redaction?.placeholdersOnly !== true) {
    return "runtime-env-packet-redaction-missing";
  }
  const readyProviderGroups = artifact.summary?.readyProviderGroups;
  const requiredProviderGroups = artifact.summary?.requiredProviderGroups;
  const blockerIds = artifact.summary?.blockerIds;
  const providerGroups = artifact.providerGroups;
  if (!nonNegativeInteger(readyProviderGroups) ||
    !nonNegativeInteger(requiredProviderGroups) ||
    readyProviderGroups > requiredProviderGroups) {
    return "runtime-env-packet-provider-summary-missing";
  }
  if (!stringArray(blockerIds)) {
    return "runtime-env-packet-blocker-summary-missing";
  }
  if (!Array.isArray(providerGroups) ||
    providerGroups.length !== requiredProviderGroups ||
    !providerGroups.every((group) => recordValue(group) && (recordValue(group)?.status === "pass" || recordValue(group)?.status === "blocked"))) {
    return "runtime-env-packet-provider-groups-missing";
  }
  const blockedProviderGroups = providerGroups.filter((group) => recordValue(group)?.status !== "pass");
  if (artifact.status === "ready" &&
    (readyProviderGroups !== requiredProviderGroups || blockerIds.length > 0 || blockedProviderGroups.length > 0)) {
    return "runtime-env-packet-ready-summary-mismatch";
  }
  if (artifact.status === "blocked" &&
    readyProviderGroups === requiredProviderGroups &&
    blockerIds.length === 0 &&
    blockedProviderGroups.length === 0) {
    return "runtime-env-packet-blocked-summary-mismatch";
  }
  return undefined;
}

function productionGoLiveGateArchiveValidation(artifact: {
  schemaVersion?: string;
  status?: string;
  policy?: Record<string, unknown>;
  redaction?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}) {
  if (artifact.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate) {
    return "production-go-live-gate-schema-invalid";
  }
  if (artifact.status !== "blocked" && artifact.status !== "ready") {
    return "production-go-live-gate-status-invalid";
  }
  if (artifact.policy?.localFileStoreIsProductionBackend !== false ||
    artifact.policy?.localPilotGateSeparateFromEnterpriseGoLive !== true ||
    artifact.policy?.requirePostgresObjectStorageCdnQueueObservability !== true ||
    artifact.policy?.requireFiftyUserConferenceLoadRehearsal !== true) {
    return "production-go-live-gate-policy-missing";
  }
  if (artifact.redaction?.secretValuesExcluded !== true ||
    artifact.redaction?.envValuesExcluded !== true ||
    artifact.redaction?.endpointValuesExcluded !== true) {
    return "production-go-live-gate-redaction-missing";
  }
  const productionReadyClaimAllowed = artifact.summary?.productionReadyClaimAllowed;
  const checks = artifact.summary?.checks;
  const passed = artifact.summary?.passed;
  const blockers = artifact.summary?.blockers;
  if (typeof productionReadyClaimAllowed !== "boolean" ||
    artifact.summary?.localPilotGateIsProductionGate !== false ||
    !nonNegativeInteger(checks) ||
    !nonNegativeInteger(passed) ||
    passed > checks) {
    return "production-go-live-gate-summary-missing";
  }
  if (!stringArray(blockers)) {
    return "production-go-live-gate-blocker-summary-missing";
  }
  if (artifact.status === "ready" && productionReadyClaimAllowed !== true) {
    return "production-go-live-gate-ready-claim-mismatch";
  }
  if (artifact.status === "blocked" && productionReadyClaimAllowed !== false) {
    return "production-go-live-gate-blocked-claim-mismatch";
  }
  if (artifact.status === "ready" && (passed !== checks || blockers.length > 0)) {
    return "production-go-live-gate-ready-summary-mismatch";
  }
  if (artifact.status === "blocked" && passed === checks && blockers.length === 0) {
    return "production-go-live-gate-blocked-summary-mismatch";
  }
  return undefined;
}

function productionRuntimeEnvPacketItem(options: Options, archiveItems: ArchiveItem[]): ArchiveItem {
  const outputPath = path.join(options.outputDir, "production-runtime-env-packet.json");
  const preflightPath = path.join(options.outputDir, "vercel-production-preflight.json");
  const preflightArtifact = existsSync(preflightPath) ? readArtifact(preflightPath) : undefined;
  const archiveSummary = buildArchiveManifest(options, archiveItems);
  const packet = buildEnterpriseProductionRuntimeEnvPacket({
    domain: options.cdnVerifyUrl,
    vercelScope: options.vercelScope,
    preflightArtifact: preflightArtifact?.parsed,
    preflightPath: preflightArtifact ? path.relative(process.cwd(), preflightPath) : undefined,
    preflightArtifactSha256: preflightArtifact?.sha,
    archiveArtifact: archiveSummary,
    generatedAt: archiveSummary.generatedAt
  });
  const serialized = serializeVerificationArtifact(packet);
  const artifactSha256 = sha256VerificationArtifact(serialized);
  const writtenPath = writeVerificationArtifact(outputPath, serialized, artifactSha256);
  const artifact = readArtifact(writtenPath);
  const artifactStatus = artifact.parsed.status ?? "blocked";
  const artifactArchiveValidation = runtimeEnvPacketArchiveValidation(artifact.parsed);
  const artifactBindableForArchive = !artifactArchiveValidation;
  const itemPassed = artifact.shaMatches && artifactBindableForArchive;
  return {
    id: "production-runtime-env-packet",
    label: "Production runtime env packet",
    command: `npm run sena:production-env:packet -- --preflight ${path.relative(process.cwd(), preflightPath)} --archive ${path.relative(process.cwd(), path.join(options.outputDir, "sena-production-evidence-archive.json"))} --output ${path.relative(process.cwd(), outputPath)}`,
    status: itemPassed ? "pass" : "review",
    requiredForProduction: false,
    exitCode: 0,
    outputFile: path.relative(process.cwd(), outputPath),
    sha256File: path.relative(process.cwd(), artifact.shaPath),
    artifactSha256: artifact.sha,
    artifactHashMatches: artifact.shaMatches,
    artifactSchemaVersion: artifact.parsed.schemaVersion,
    artifactStatus,
    artifactArchiveValidation,
    evidence: [
      "advisory=true",
      "replacesLiveProbes=false",
      "archiveSummarySource=in-memory-pre-packet-items",
      `artifactWritten=true`,
      `artifactHashMatches=${artifact.shaMatches}`,
      `artifactStatus=${artifactStatus}`,
      `artifactReadyForArchive=${artifactReadyForArchive({ id: "production-runtime-env-packet" }, artifactStatus)}`,
      `artifactBindableForArchive=${artifactBindableForArchive}`,
      `artifactArchiveValidation=${artifactArchiveValidation ?? "pass"}`,
      `readyProviderGroups=${packet.summary.readyProviderGroups}`,
      `requiredProviderGroups=${packet.summary.requiredProviderGroups}`,
      "childStdoutStderr=not-applicable"
    ],
    nextAction: itemPassed
      ? "Bind this advisory packet if the release handoff needs Vercel env custody for provider-readiness status; it does not replace live probe evidence."
      : "Regenerate the production runtime env packet so it is bindable before release handoff."
  };
}

async function productionGoLiveGateItem(options: Options, archiveItems: ArchiveItem[]): Promise<ArchiveItem> {
  const outputPath = path.join(options.outputDir, "production-go-live-gate.json");
  const preflightPath = path.join(options.outputDir, "vercel-production-preflight.json");
  const manifestPath = path.join(options.outputDir, "production-evidence-manifest.json");
  const packetPath = path.join(options.outputDir, "production-runtime-env-packet.json");
  const manifestArtifact = existsSync(manifestPath)
    ? readArtifact(manifestPath).parsed
    : undefined;
  const packetArtifact = existsSync(packetPath)
    ? readArtifact(packetPath).parsed
    : undefined;
  const manifest = isProductionEvidenceManifestArtifact(manifestArtifact)
    ? manifestArtifact
    : buildEnterpriseProductionEvidenceManifest();
  const packet = isProductionRuntimeEnvPacketArtifact(packetArtifact)
    ? packetArtifact
    : buildEnterpriseProductionRuntimeEnvPacket({
      domain: options.cdnVerifyUrl,
      vercelScope: options.vercelScope,
      preflightArtifact: existsSync(preflightPath) ? readArtifact(preflightPath).parsed : undefined,
      preflightPath: existsSync(preflightPath) ? path.relative(process.cwd(), preflightPath) : undefined,
      archiveArtifact: buildArchiveManifest(options, archiveItems),
      generatedAt: new Date().toISOString()
    });
  const goLiveCloseout = await buildSenaGoLiveCloseoutCheck();
  const gate = buildSenaEnterpriseProductionGoLiveGate({
    manifest,
    runtimeEnvPacket: packet,
    goLiveCloseout,
    generatedAt: goLiveCloseout.generatedAt
  });
  const serialized = serializeVerificationArtifact(gate);
  const artifactSha256 = sha256VerificationArtifact(serialized);
  const writtenPath = writeVerificationArtifact(outputPath, serialized, artifactSha256);
  const artifact = readArtifact(writtenPath);
  const artifactStatus = artifact.parsed.status ?? "blocked";
  const artifactReady = artifactReadyForArchive({ id: "production-go-live-gate" }, artifactStatus);
  const artifactArchiveValidation = productionGoLiveGateArchiveValidation(artifact.parsed);
  const artifactBindableForArchive = !artifactArchiveValidation;
  const itemPassed = artifact.shaMatches && artifactReady && artifactBindableForArchive;

  return {
    id: "production-go-live-gate",
    label: "Production go-live gate",
    command: `npm run sena:production:gate -- --manifest ${path.relative(process.cwd(), manifestPath)} --preflight ${path.relative(process.cwd(), preflightPath)} --archive ${path.relative(process.cwd(), path.join(options.outputDir, "sena-production-evidence-archive.json"))} --output ${path.relative(process.cwd(), outputPath)}`,
    status: itemPassed ? "pass" : "review",
    requiredForProduction: false,
    exitCode: gate.status === "ready" ? 0 : 1,
    outputFile: path.relative(process.cwd(), outputPath),
    sha256File: path.relative(process.cwd(), artifact.shaPath),
    artifactSha256: artifact.sha,
    artifactHashMatches: artifact.shaMatches,
    artifactSchemaVersion: artifact.parsed.schemaVersion,
    artifactStatus,
    artifactArchiveValidation,
    evidence: [
      "advisory=true",
      "replacesProductionGate=false",
      "archiveSummarySource=in-memory-with-runtime-env-packet",
      `artifactWritten=true`,
      `artifactHashMatches=${artifact.shaMatches}`,
      `artifactStatus=${artifactStatus}`,
      `artifactReadyForArchive=${artifactReady}`,
      `artifactBindableForArchive=${artifactBindableForArchive}`,
      `artifactArchiveValidation=${artifactArchiveValidation ?? "pass"}`,
      `productionReadyClaimAllowed=${gate.summary.productionReadyClaimAllowed}`,
      `gatePassedChecks=${gate.summary.passed}`,
      `gateTotalChecks=${gate.summary.checks}`,
      `gateBlockers=${gate.summary.blockers.join("|") || "none"}`,
      `manifestArtifactComplete=${isProductionEvidenceManifestArtifact(manifestArtifact)}`,
      `runtimeEnvPacketArtifactComplete=${isProductionRuntimeEnvPacketArtifact(packetArtifact)}`,
      "childStdoutStderr=not-applicable"
    ],
    nextAction: gate.status === "ready"
      ? "Keep this final gate preview attached to the production handoff and rerun npm run sena:production:gate immediately before cutover."
      : "Use this final gate preview to resolve production evidence, runtime env packet, and go-live closeout blockers; rerun npm run sena:production:gate immediately before any production-ready claim."
  };
}

function skippedVercelPreflightItem(): ArchiveItem {
  return {
    id: "vercel-production-preflight",
    label: "Vercel production deployment preflight",
    command: "npm run sena:vercel:preflight -- --output <dir>/vercel-production-preflight.json",
    status: "skipped",
    requiredForProduction: true,
    skippedReason: "--skip-vercel-preflight was provided",
    evidence: [
      "vercelPreflightSkipped=true",
      "deploymentShellEvidenceRequired=true",
      "target=www.sena.hk"
    ],
    nextAction: "Run the archive without --skip-vercel-preflight, or run npm run sena:vercel:preflight with --output, before production handoff."
  };
}

function skippedLoadItem(): ArchiveItem {
  return {
    id: "conference-load-rehearsal",
    label: "Conference load rehearsal",
    command: "npm run sena:conference:load-check -- --output <dir>/conference-load-rehearsal.json",
    status: "skipped",
    requiredForProduction: true,
    skippedReason: "--include-load was not provided",
    evidence: [
      "conferenceLoadSkipped=true",
      "longLoadRequiresExplicitIncludeLoad=true",
      "target=50-users-30-minutes"
    ],
    nextAction: "Run this archive with --include-load only when the deployed URL is ready for the 50-user, 30-minute rehearsal."
  };
}

function buildArchiveManifest(options: Options, items: ArchiveItem[]): ArchiveManifest {
  const productionBlockers = items
    .filter((item) => item.requiredForProduction && item.status !== "pass")
    .map((item) => item.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceArchive,
    generatedAt: new Date().toISOString(),
    status: productionBlockers.length ? "blocked" : "ready",
    outputDir: path.relative(process.cwd(), options.outputDir),
    summary: {
      totalItems: items.length,
      pass: items.filter((item) => item.status === "pass").length,
      review: items.filter((item) => item.status === "review").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      productionBlockers
    },
    policy: {
      localFileStoreIsProductionBackend: false,
      requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability",
      longConferenceLoadRequiresExplicitIncludeLoad: true,
      secretValuesExcluded: true,
      terminalScrollbackNotEvidence: true
    },
    items,
    evidence: [
      `includeLoad=${options.includeLoad}`,
      `advisory=${options.advisory}`,
      `skipVercelPreflight=${options.skipVercelPreflight}`,
      `vercelSkipHttp=${options.vercelSkipHttp}`,
      `cdnVerifyUrlConfigured=${Boolean(options.cdnVerifyUrl)}`,
      `cdnProbeTimeoutMs=${options.cdnTimeoutMs ?? process.env.SENA_CDN_PROBE_TIMEOUT_MS ?? "default"}`,
      "cdnVerifyUrlValue=excluded",
      `productionBlockers=${productionBlockers.join("|") || "none"}`,
      "localFileStoreProductionBackend=false",
      "secretValues=excluded",
      "childStdoutStderr=excluded"
    ],
    nextActions: items
      .filter((item) => item.status !== "pass")
      .map((item) => item.nextAction),
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      childStdoutStderrExcludedFromManifest: true
    }
  };
}

async function runSenaProductionEvidenceArchive(
  argv: string[]
) {
  const options = parseArgs(argv);
  assertConferenceLoadTarget(options);
  options.outputDir = path.resolve(options.outputDir);
  mkdirSync(options.outputDir, { recursive: true });
  const items = verifierDefinitions(options)
    .filter((definition) => !(options.skipVercelPreflight && definition.id === "vercel-production-preflight"))
    .map((definition) => runVerifier(definition, options));
  if (options.skipVercelPreflight) items.unshift(skippedVercelPreflightItem());
  if (!options.includeLoad) items.splice(items.length - 1, 0, skippedLoadItem());
  items.push(productionRuntimeEnvPacketItem(options, items));
  items.push(await productionGoLiveGateItem(options, items));
  const manifest = buildArchiveManifest(options, items);
  const serialized = serializeVerificationArtifact(manifest);
  const artifactSha256 = sha256VerificationArtifact(serialized);
  const manifestPath = writeVerificationArtifact(
    path.join(options.outputDir, "sena-production-evidence-archive.json"),
    serialized,
    artifactSha256
  );

  process.stdout.write(`productionEvidenceArchivePath=${manifestPath}\n`);
  process.stdout.write(`productionEvidenceArchiveSha256=${artifactSha256}\n`);
  process.stdout.write(`productionEvidenceArchiveStatus=${manifest.status}\n`);
  process.stdout.write(`productionEvidenceArchiveBlockers=${manifest.summary.productionBlockers.join("|") || "none"}\n`);

  if (manifest.status !== "ready") {
    console.error("SENA production evidence archive is blocked. Inspect the archive manifest and complete the required production evidence before handoff.");
    return 1;
  }

  console.log("SENA production evidence archive passed.");
  return 0;
}

const archiveInvokedDirectly = path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);

if (archiveInvokedDirectly) {
  process.exitCode = await runSenaProductionEvidenceArchive(process.argv.slice(2));
}
