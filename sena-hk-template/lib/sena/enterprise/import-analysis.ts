import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SenaAnalysisRunArtifact } from "../analysis-run";
import type { SenaEnterpriseImportCleaningManifest, SenaImportAdapterSource } from "../import-adapters";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataset } from "../types";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type { SenaEnterpriseProject } from "./team-project";
import {
  localWebhookSinkAttempt,
  objectStorageWebhookEndpointHash,
  objectStorageWebhookProvider,
  objectStorageWebhookSecret,
  objectStorageWebhookTimeoutMs,
  objectStorageWebhookUrl,
  webhookErrorHash,
  type SenaEnterpriseWebhookProviderMode
} from "./webhook-delivery";
import {
  appendAudit,
  recordEnterpriseAudit
} from "./ops-audit";
import {
  readEnterpriseDb,
  saveDb,
  writeEnterpriseDb
} from "./state";

export type SenaEnterpriseUploadScanStatus = "passed" | "review";

export type SenaEnterpriseUpload = {
  id: string;
  teamId: string;
  userId: string;
  originalName: string;
  storedName: string;
  contentType: string;
  size: number;
  sha256: string;
  importProfile?: string;
  warningCount: number;
  scanStatus: SenaEnterpriseUploadScanStatus;
  scanEngine: "sena-local-upload-scan/v1";
  scanFindings: string[];
  storagePath: string;
  createdAt: string;
};

export type SenaEnterpriseUploadStorageVerification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseUploadStorageVerification;
  generatedAt: string;
  status: "pass" | "review";
  scope: {
    mode: "all-accessible-teams" | "selected-team" | "system";
    teamIds: string[];
  };
  storage: {
    engine: "private-local-directory";
    rootHint: string;
  };
  summary: {
    registeredUploads: number;
    verifiedBlobs: number;
    missingBlobs: number;
    checksumMismatches: number;
    orphanBlobs: number;
    reviewedUploads: number;
    totalRegisteredBytes: number;
    totalVerifiedBytes: number;
  };
  missing: Array<{ uploadId: string; storagePath: string }>;
  corrupt: Array<{ uploadId: string; storagePath: string; expectedSha256: string; actualSha256: string }>;
  orphanBlobs: Array<{ teamId: string; storedName: string; storagePath: string; bytes: number }>;
};

export type SenaEnterpriseUploadObjectStorageDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageDelivery;
  generatedAt: string;
  status: "not-configured" | "completed" | "partial" | "failed";
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
    requestedUploadId?: string;
    limit: number;
    includeReview: boolean;
  };
  verification: SenaEnterpriseUploadStorageVerification;
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    skipped: number;
    pendingReview: number;
  };
  uploads: Array<{
    uploadId: string;
    teamId: string;
    originalName: string;
    size: number;
    sha256: string;
    objectKey: string;
    scanStatus: SenaEnterpriseUploadScanStatus;
    deliveryStatus: "delivered" | "failed" | "skipped";
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  }>;
};

export type SenaEnterpriseImportRun = {
  id: string;
  teamId: string;
  userId: string;
  status: "completed" | "completed-with-warnings";
  fileCount: number;
  uploadIds: string[];
  sources: Array<{
    name: string;
    profile: SenaImportAdapterSource["profile"];
    rows: number;
    warningCount: number;
  }>;
  warningCount: number;
  warningsPreview: string[];
  cleaningManifest?: SenaEnterpriseImportCleaningManifest;
  datasetCounts: {
    people: number;
    interactions: number;
    utterances: number;
    codedSegments: number;
    codes: number;
  };
  createdAt: string;
};

export type SenaEnterpriseAnalysisRun = {
  id: string;
  teamId: string;
  projectId?: string;
  persistedProjectId?: string;
  userId: string;
  sourceKind: SenaAnalysisRunArtifact["source"]["kind"];
  title: string;
  includeRuntimeBundle: boolean;
  datasetCounts: SenaAnalysisRunArtifact["source"]["datasetCounts"];
  analysisDatasetCounts: SenaAnalysisRunArtifact["source"]["analysisDatasetCounts"];
  activeTemporalWindow: SenaAnalysisRunArtifact["source"]["activeTemporalWindow"];
  summary: SenaAnalysisRunArtifact["summary"];
  artifactFingerprints: {
    reportSha256: string;
    projectSnapshotSha256: string;
    runtimeBundleSha256?: string;
  };
  createdAt: string;
};

const dbDir = process.env.SENA_ENTERPRISE_DB_DIR || ".sena-enterprise";
const dbPath = path.join(dbDir, "enterprise-db.json");
const uploadScanEngine = "sena-local-upload-scan/v1" as const;
const maxUploadBytes = Number(process.env.SENA_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const allowedUploadExtensions = new Set([".csv", ".json", ".xlsx", ".txt", ".md", ".srt", ".vtt"]);

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function safeUploadName(name: string) {
  const basename = path.basename(name || "upload.bin");
  return basename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload.bin";
}

function uploadExtension(name: string) {
  return path.extname(name).toLowerCase();
}

function scanEnterpriseUploadFile(file: { name: string; contentType?: string; bytes: Buffer }) {
  const originalName = safeUploadName(file.name);
  const extension = uploadExtension(originalName);
  const bytes = Buffer.from(file.bytes);
  const findings: string[] = [];

  if (bytes.byteLength === 0) {
    throw new SenaEnterpriseError("Empty upload files are not accepted.", 400, "upload_empty");
  }
  if (bytes.byteLength > maxUploadBytes) {
    throw new SenaEnterpriseError("Upload exceeds the configured SENA_UPLOAD_MAX_BYTES limit.", 413, "upload_too_large");
  }
  if (!allowedUploadExtensions.has(extension)) {
    throw new SenaEnterpriseError("Upload file type is not allowed for SENA enterprise imports.", 400, "upload_extension_blocked");
  }

  const magic = bytes.subarray(0, 4).toString("hex");
  const executableMagic = magic.startsWith("4d5a") || magic === "7f454c46" || magic === "cafebabe";
  if (executableMagic) {
    throw new SenaEnterpriseError("Upload appears to be executable content and was blocked.", 400, "upload_executable_blocked");
  }
  if (extension === ".csv" || extension === ".json" || extension === ".txt" || extension === ".md" || extension === ".srt" || extension === ".vtt") {
    const preview = bytes.subarray(0, Math.min(bytes.byteLength, 256_000)).toString("utf8");
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(preview)) {
      findings.push("possible-email-addresses");
    }
    if (/\b(?:\+?\d[\d\s().-]{7,}\d)\b/.test(preview)) {
      findings.push("possible-phone-numbers");
    }
    if (/(<script\b|javascript:|powershell|cmd\.exe|\/bin\/sh)/i.test(preview)) {
      findings.push("script-like-text-review");
    }
  }

  return {
    originalName,
    bytes,
    scanStatus: findings.length > 0 ? "review" as const : "passed" as const,
    scanFindings: findings
  };
}

function uploadBlobAbsolutePath(upload: SenaEnterpriseUpload) {
  const expectedPrefix = path.join("uploads", upload.teamId);
  const normalized = path.normalize(upload.storagePath);
  const insideExpectedPrefix = normalized === expectedPrefix || normalized.startsWith(`${expectedPrefix}${path.sep}`);
  if (path.isAbsolute(normalized) || normalized.startsWith("..") || !insideExpectedPrefix) {
    throw new SenaEnterpriseError("Upload storage path is outside the enterprise upload directory.", 500, "upload_storage_path_invalid");
  }
  return path.join(dbDir, normalized);
}

function listStoredUploadBlobs(teamIds: Set<string>) {
  const blobs: Array<{ teamId: string; storedName: string; storagePath: string; bytes: number }> = [];
  const uploadsRoot = path.join(dbDir, "uploads");
  if (!existsSync(uploadsRoot)) return blobs;
  for (const teamId of teamIds) {
    const teamDir = path.join(uploadsRoot, teamId);
    if (!existsSync(teamDir)) continue;
    for (const storedName of readdirSync(teamDir)) {
      const absolute = path.join(teamDir, storedName);
      const stat = statSync(absolute);
      if (!stat.isFile()) continue;
      blobs.push({
        teamId,
        storedName,
        storagePath: path.join("uploads", teamId, storedName),
        bytes: stat.size
      });
    }
  }
  return blobs;
}

function datasetCountsFromDataset(dataset: SenaDataset): SenaEnterpriseImportRun["datasetCounts"] {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createEnterpriseUploads(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  files: Array<{
    name: string;
    contentType?: string;
    bytes: Buffer;
    importProfile?: string;
    warningCount?: number;
  }>;
}) {
  requireEnterprisePermission(context, input.teamId, "upload:create");
  if (input.files.length === 0) return [];
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  const uploadDir = path.join(dbDir, "uploads", input.teamId);
  mkdirSync(uploadDir, { recursive: true });
  const timestamp = now();
  const auditDetails: Array<Record<string, string | number | boolean | null>> = [];
  const uploads = input.files.map((file) => {
    const uploadId = id("upload");
    const scan = scanEnterpriseUploadFile(file);
    const originalName = scan.originalName;
    const storedName = `${uploadId}-${originalName}`;
    const bytes = scan.bytes;
    const storagePath = path.join("uploads", input.teamId, storedName);
    writeFileSync(path.join(uploadDir, storedName), bytes);
    const upload: SenaEnterpriseUpload = {
      id: uploadId,
      teamId: input.teamId,
      userId: context.user.id,
      originalName,
      storedName,
      contentType: file.contentType?.trim() || "application/octet-stream",
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      importProfile: file.importProfile,
      warningCount: file.warningCount ?? 0,
      scanStatus: scan.scanStatus,
      scanEngine: uploadScanEngine,
      scanFindings: scan.scanFindings,
      storagePath,
      createdAt: timestamp
    };
    db.uploads.push(upload);
    auditDetails.push({
      uploadId,
      originalName,
      size: upload.size,
      sha256: upload.sha256,
      importProfile: upload.importProfile ?? null,
      scanStatus: upload.scanStatus,
      scanFindings: upload.scanFindings.join("|") || null
    });
    return upload;
  });
  writeEnterpriseDb(db);
  for (const detail of auditDetails) {
    recordEnterpriseAudit({
      event: "upload.create",
      userId: context.user.id,
      teamId: input.teamId,
      detail
    });
  }
  return uploads;
}

export function listEnterpriseUploads(context: SenaEnterpriseSessionContext, teamId?: string) {
  const db = readEnterpriseDb();
  const readableTeamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("upload:read"))
    .map((membership) => membership.teamId));
  if (teamId) {
    requireEnterprisePermission(context, teamId, "upload:read");
  }
  return db.uploads
    .filter((upload) => (teamId ? upload.teamId === teamId : readableTeamIds.has(upload.teamId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function verifyEnterpriseUploadStorage(context?: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): SenaEnterpriseUploadStorageVerification {
  const db = readEnterpriseDb();
  let teamIds: Set<string>;
  let mode: SenaEnterpriseUploadStorageVerification["scope"]["mode"] = "system";
  if (context) {
    teamIds = new Set(context.memberships
      .filter((membership) => rolePermissions[membership.role].includes("upload:read"))
      .map((membership) => membership.teamId));
    mode = "all-accessible-teams";
    if (input.teamId) {
      requireEnterprisePermission(context, input.teamId, "upload:read");
      teamIds = new Set([input.teamId]);
      mode = "selected-team";
    }
  } else {
    teamIds = new Set(db.teams.map((team) => team.id));
  }
  const uploads = db.uploads.filter((upload) => teamIds.has(upload.teamId));
  const missing: SenaEnterpriseUploadStorageVerification["missing"] = [];
  const corrupt: SenaEnterpriseUploadStorageVerification["corrupt"] = [];
  let verifiedBlobs = 0;
  let totalVerifiedBytes = 0;
  let totalRegisteredBytes = 0;
  const registeredBlobKeys = new Set<string>();

  for (const upload of uploads) {
    totalRegisteredBytes += upload.size;
    registeredBlobKeys.add(`${upload.teamId}/${upload.storedName}`);
    const absolutePath = uploadBlobAbsolutePath(upload);
    if (!existsSync(absolutePath)) {
      missing.push({ uploadId: upload.id, storagePath: upload.storagePath });
      continue;
    }
    const bytes = readFileSync(absolutePath);
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== upload.sha256) {
      corrupt.push({ uploadId: upload.id, storagePath: upload.storagePath, expectedSha256: upload.sha256, actualSha256 });
      continue;
    }
    verifiedBlobs += 1;
    totalVerifiedBytes += bytes.byteLength;
  }

  const orphanBlobs = listStoredUploadBlobs(teamIds)
    .filter((blob) => !registeredBlobKeys.has(`${blob.teamId}/${blob.storedName}`));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadStorageVerification,
    generatedAt: now(),
    status: missing.length === 0 && corrupt.length === 0 && orphanBlobs.length === 0 ? "pass" : "review",
    scope: {
      mode,
      teamIds: Array.from(teamIds).sort()
    },
    storage: {
      engine: "private-local-directory",
      rootHint: path.basename(dbDir)
    },
    summary: {
      registeredUploads: uploads.length,
      verifiedBlobs,
      missingBlobs: missing.length,
      checksumMismatches: corrupt.length,
      orphanBlobs: orphanBlobs.length,
      reviewedUploads: uploads.filter((upload) => upload.scanStatus === "review").length,
      totalRegisteredBytes,
      totalVerifiedBytes
    },
    missing: missing.slice(0, 100),
    corrupt: corrupt.slice(0, 100),
    orphanBlobs: orphanBlobs.slice(0, 100)
  };
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function enterpriseDeploymentMode(): "institution-managed" | "self-managed" {
  const mode = (envValue("SENA_ENTERPRISE_DEPLOYMENT_MODE") ?? envValue("SENA_ENTERPRISE_MODE") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (mode === "self-managed" || envValue("SENA_SELF_MANAGED_ENTERPRISE") === "1") return "self-managed";
  return "institution-managed";
}

function isSelfManagedEnterpriseMode() {
  return enterpriseDeploymentMode() === "self-managed";
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && rolePermissions[membership.role].includes("team:manage"))
    .map((membership) => membership.teamId);
}

function objectStorageTeamScope(context: SenaEnterpriseSessionContext, input: { teamId?: string; uploadId?: string }) {
  const db = readEnterpriseDb();
  if (input.uploadId) {
    const upload = db.uploads.find((candidate) => candidate.id === input.uploadId);
    if (!upload) throw new SenaEnterpriseError("Upload was not found.", 404, "upload_not_found");
    if (input.teamId && input.teamId !== upload.teamId) {
      throw new SenaEnterpriseError("Upload does not belong to the requested team.", 400, "upload_team_mismatch");
    }
    requireEnterprisePermission(context, upload.teamId, "team:manage");
    return [upload.teamId];
  }
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
    return [input.teamId];
  }
  const teamIds = manageableTeamIds(context);
  if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for object storage delivery.", 403, "object_storage_permission_denied");
  }
  return teamIds;
}

function uploadObjectStorageKey(upload: SenaEnterpriseUpload) {
  return `teams/${upload.teamId}/uploads/${upload.id}/${upload.storedName}`;
}

function uploadObjectStorageWebhookPayload(
  upload: SenaEnterpriseUpload,
  bytes: Buffer,
  objectKey: string,
  endpointHash: string,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageWebhook,
    generatedAt,
    upload: {
      id: upload.id,
      teamId: upload.teamId,
      userId: upload.userId,
      originalName: upload.originalName,
      storedName: upload.storedName,
      contentType: upload.contentType,
      size: upload.size,
      sha256: upload.sha256,
      importProfile: upload.importProfile,
      warningCount: upload.warningCount,
      scanStatus: upload.scanStatus,
      scanEngine: upload.scanEngine,
      scanFindings: upload.scanFindings,
      storagePath: upload.storagePath,
      createdAt: upload.createdAt
    },
    object: {
      key: objectKey,
      encoding: "base64",
      bytesBase64: bytes.toString("base64"),
      sha256: upload.sha256,
      size: bytes.byteLength
    },
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(objectStorageWebhookSecret())
    }
  };
}

async function postUploadObjectStorageWebhook(upload: SenaEnterpriseUpload, bytes: Buffer, objectKey: string) {
  const webhookUrl = objectStorageWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Object storage webhook delivery is not configured.", 503, "object_storage_webhook_not_configured");
  }
  const endpointHash = objectStorageWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(uploadObjectStorageWebhookPayload(upload, bytes, objectKey, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "upload.object_storage.deliver",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-upload-id": upload.id,
    "x-sena-upload-sha256": upload.sha256,
    "x-sena-object-key": objectKey
  };
  const secret = objectStorageWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), objectStorageWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function uploadObjectStorageDeliveryStatus(summary: SenaEnterpriseUploadObjectStorageDeliveryResult["summary"]): SenaEnterpriseUploadObjectStorageDeliveryResult["status"] {
  if (summary.failed > 0 && summary.delivered > 0) return "partial";
  if (summary.failed > 0) return "failed";
  return "completed";
}

export async function deliverEnterpriseUploadBlobs(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; uploadId?: string; limit?: number; includeReview?: boolean } = {}
): Promise<SenaEnterpriseUploadObjectStorageDeliveryResult> {
  const provider = objectStorageWebhookProvider(dbPath, isSelfManagedEnterpriseMode());
  const teamIds = objectStorageTeamScope(context, input);
  const teamIdSet = new Set(teamIds);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const includeReview = Boolean(input.includeReview);
  const verification = verifyEnterpriseUploadStorage(context, { teamId: input.teamId ?? (teamIds.length === 1 ? teamIds[0] : undefined) });
  const result: SenaEnterpriseUploadObjectStorageDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageDelivery,
    generatedAt: now(),
    status: provider.configured ? "completed" : "not-configured",
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      requestedUploadId: input.uploadId,
      limit,
      includeReview
    },
    verification,
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      pendingReview: 0
    },
    uploads: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const candidates = db.uploads
    .filter((upload) => teamIdSet.has(upload.teamId))
    .filter((upload) => !input.uploadId || upload.id === input.uploadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const targets = candidates.slice(0, limit);
  result.summary.skipped += candidates.length - targets.length;

  for (const upload of targets) {
    const objectKey = uploadObjectStorageKey(upload);
    const baseResult = {
      uploadId: upload.id,
      teamId: upload.teamId,
      originalName: upload.originalName,
      size: upload.size,
      sha256: upload.sha256,
      objectKey,
      scanStatus: upload.scanStatus
    };

    if (upload.scanStatus === "review" && !includeReview) {
      result.summary.skipped += 1;
      result.summary.pendingReview += 1;
      result.uploads.push({
        ...baseResult,
        deliveryStatus: "skipped",
        errorCode: "scan_review_required"
      });
      continue;
    }

    let bytes: Buffer | undefined;
    let localErrorCode: string | undefined;
    let actualSha256: string | undefined;
    try {
      const absolutePath = uploadBlobAbsolutePath(upload);
      if (!existsSync(absolutePath)) {
        localErrorCode = "upload_blob_missing";
      } else {
        bytes = readFileSync(absolutePath);
        actualSha256 = createHash("sha256").update(bytes).digest("hex");
        if (actualSha256 !== upload.sha256) {
          localErrorCode = "upload_checksum_mismatch";
          bytes = undefined;
        }
      }
    } catch (error) {
      localErrorCode = error instanceof SenaEnterpriseError ? error.code : "upload_blob_read_error";
    }

    if (!bytes || localErrorCode) {
      result.summary.failed += 1;
      result.uploads.push({
        ...baseResult,
        deliveryStatus: "failed",
        errorCode: localErrorCode
      });
      appendAudit(db, {
        event: "upload.object_storage.fail",
        userId: context.user.id,
        teamId: upload.teamId,
        detail: {
          uploadId: upload.id,
          objectKey,
          sha256: upload.sha256,
          actualSha256: actualSha256 ?? null,
          errorCode: localErrorCode ?? null,
          endpointHash: provider.endpointHash ?? null
        }
      });
      continue;
    }

    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(provider.endpointHash!)
      : await postUploadObjectStorageWebhook(upload, bytes, objectKey);
    result.summary.attempted += 1;
    if (attemptResult.ok) {
      result.summary.delivered += 1;
    } else {
      result.summary.failed += 1;
    }
    result.uploads.push({
      ...baseResult,
      deliveryStatus: attemptResult.ok ? "delivered" : "failed",
      httpStatus: attemptResult.httpStatus,
      errorCode: attemptResult.errorCode,
      errorHash: attemptResult.errorHash
    });
    appendAudit(db, {
      event: attemptResult.ok ? "upload.object_storage.deliver" : "upload.object_storage.fail",
      userId: context.user.id,
      teamId: upload.teamId,
      detail: {
        uploadId: upload.id,
        objectKey,
        size: upload.size,
        sha256: upload.sha256,
        endpointHash: attemptResult.endpointHash ?? "none",
        httpStatus: attemptResult.httpStatus ?? null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null,
        scanStatus: upload.scanStatus
      }
    });
  }

  result.status = uploadObjectStorageDeliveryStatus(result.summary);
  saveDb(db);
  return result;
}

export function createEnterpriseImportRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  uploadIds: string[];
  sources: SenaImportAdapterSource[];
  warnings: string[];
  dataset: SenaDataset;
  cleaningManifest?: SenaEnterpriseImportCleaningManifest;
}) {
  requireEnterprisePermission(context, input.teamId, "upload:create");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  const sourceProfiles = Array.from(new Set(input.sources.map((source) => source.profile)));
  const run: SenaEnterpriseImportRun = {
    id: id("import"),
    teamId: input.teamId,
    userId: context.user.id,
    status: input.warnings.length > 0 ? "completed-with-warnings" : "completed",
    fileCount: input.sources.length,
    uploadIds: input.uploadIds,
    sources: input.sources.map((source) => ({
      name: safeUploadName(source.name),
      profile: source.profile,
      rows: source.rows,
      warningCount: source.warnings.length
    })),
    warningCount: input.warnings.length,
    warningsPreview: input.warnings.slice(0, 10),
    cleaningManifest: input.cleaningManifest,
    datasetCounts: datasetCountsFromDataset(input.dataset),
    createdAt: now()
  };
  db.importRuns.unshift(run);
  db.importRuns = db.importRuns.slice(0, 1000);
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "import.run",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      importRunId: run.id,
      files: run.fileCount,
      people: run.datasetCounts.people,
      utterances: run.datasetCounts.utterances,
      codes: run.datasetCounts.codes,
      warnings: run.warningCount,
      profiles: sourceProfiles.join("|") || "unknown"
    }
  });
  return run;
}

export function listEnterpriseImportRuns(context: SenaEnterpriseSessionContext, teamId?: string) {
  const db = readEnterpriseDb();
  const readableTeamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("upload:read"))
    .map((membership) => membership.teamId));
  if (teamId) {
    requireEnterprisePermission(context, teamId, "upload:read");
  }
  return db.importRuns
    .filter((run) => (teamId ? run.teamId === teamId : readableTeamIds.has(run.teamId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createEnterpriseAnalysisRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  projectId?: string;
  persistedProjectId?: string;
  run: SenaAnalysisRunArtifact;
}) {
  requireEnterprisePermission(context, input.teamId, "analysis:run");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  for (const projectId of [input.projectId, input.persistedProjectId].filter(Boolean) as string[]) {
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Analysis run team does not match the project team.", 400, "analysis_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "analysis:run");
  }
  const run: SenaEnterpriseAnalysisRun = {
    id: id("analysis"),
    teamId: input.teamId,
    projectId: input.projectId,
    persistedProjectId: input.persistedProjectId,
    userId: context.user.id,
    sourceKind: input.run.source.kind,
    title: input.run.summary.title,
    includeRuntimeBundle: Boolean(input.run.runtimeBundle),
    datasetCounts: input.run.source.datasetCounts,
    analysisDatasetCounts: input.run.source.analysisDatasetCounts,
    activeTemporalWindow: input.run.source.activeTemporalWindow,
    summary: input.run.summary,
    artifactFingerprints: {
      reportSha256: artifactSha256(input.run.report),
      projectSnapshotSha256: artifactSha256(input.run.projectSnapshot),
      runtimeBundleSha256: input.run.runtimeBundle ? artifactSha256(input.run.runtimeBundle) : undefined
    },
    createdAt: input.run.generatedAt
  };
  db.analysisRuns.unshift(run);
  db.analysisRuns = db.analysisRuns.slice(0, 1000);
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "analysis.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.persistedProjectId ?? input.projectId,
    detail: {
      analysisRunId: run.id,
      source: run.sourceKind,
      persisted: Boolean(input.persistedProjectId),
      people: run.summary.people,
      codes: run.summary.concepts,
      claimUse: run.summary.claimUse,
      reportSha256: run.artifactFingerprints.reportSha256,
      projectSnapshotSha256: run.artifactFingerprints.projectSnapshotSha256,
      runtimeBundle: run.includeRuntimeBundle
    }
  });
  return run;
}

export function listEnterpriseAnalysisRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("analysis:run"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "analysis:run");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "analysis:run");
    teamIds = new Set([project.teamId]);
  }

  return db.analysisRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId || run.persistedProjectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
