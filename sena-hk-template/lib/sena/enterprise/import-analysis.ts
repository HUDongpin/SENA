import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SenaAnalysisRunArtifact } from "../analysis-run";
import type { SenaEnterpriseImportCleaningManifest, SenaImportAdapterSource } from "../import-adapters";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataset } from "../types";
import {
  createEnterprisePostgresAnalysisRunAdapterFromEnv,
  createEnterprisePostgresImportRunAdapterFromEnv,
  createEnterprisePostgresUploadAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
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
  enterpriseObjectStorageNativeProvider,
  putEnterpriseObjectStorageObject,
  type SenaEnterpriseObjectStorageNativeMode
} from "./object-storage-adapter";
import {
  appendAudit,
  recordEnterpriseAudit
} from "./ops-audit";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  writeEnterpriseState,
  writeEnterpriseDb
} from "./state";

export type SenaEnterpriseUploadScanStatus = "passed" | "review";

export type SenaEnterpriseUploadObjectStorageCustody = {
  status: "pending" | "delivered" | "failed" | "skipped";
  providerMode?: SenaEnterpriseWebhookProviderMode | SenaEnterpriseObjectStorageNativeMode;
  objectKeyHash?: string;
  endpointHash?: string;
  bucketHash?: string;
  objectVersion?: string;
  etagHash?: string;
  httpStatus?: number;
  errorCode?: string;
  errorHash?: string;
  lastAttemptedAt?: string;
  deliveredAt?: string;
};

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
  // Unset until a parser has actually reported for this file: 0 asserts
  // "parsed, clean", absence asserts nothing (2026-08-01 report H10). Queued
  // uploads stay unset until the external worker reports.
  warningCount?: number;
  scanStatus: SenaEnterpriseUploadScanStatus;
  scanEngine: "sena-local-upload-scan/v1";
  scanFindings: string[];
  storagePath: string;
  storageEncoding?: "raw" | "sena-upload-aes-256-gcm-envelope/v1";
  storageKeySource?: "env" | "pilot-local-derived";
  objectStorageCustody?: SenaEnterpriseUploadObjectStorageCustody;
  createdAt: string;
};

export type SenaEnterpriseUploadObjectStorageCustodySummary = {
  source:
    | "file-json"
    | "file-primary-state"
    | "postgres-primary-state"
    | "postgres-table"
    | "file-json-fallback"
    | "file-primary-state-fallback"
    | "postgres-primary-state-fallback";
  totalUploads: number;
  delivered: number;
  pending: number;
  failed: number;
  skipped: number;
  pendingReview: number;
  eligibleForDelivery: number;
  eligibleDelivered: number;
  eligibleUndelivered: number;
  ready: boolean;
  evidence: string[];
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
    encryption: {
      atRest: "sena-upload-aes-256-gcm-envelope/v1";
      keySource: "env" | "pilot-local-derived";
      encryptedBlobs: number;
      legacyRawBlobs: number;
    };
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
    mode: SenaEnterpriseWebhookProviderMode | SenaEnterpriseObjectStorageNativeMode;
    configured: boolean;
    endpointHash?: string;
    bucketHash?: string;
    region?: string;
    prefix?: string;
    secretConfigured: boolean;
    accessKeyConfigured?: boolean;
    nativeConfigured?: boolean;
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
    objectVersion?: string;
    etagHash?: string;
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

const uploadEncryptionEncoding = "sena-upload-aes-256-gcm-envelope/v1" as const;
const uploadEncryptionKeyFileName = "upload-encryption.key";

function configuredUploadEncryptionKey() {
  const configuredKey = envValue("SENA_UPLOAD_ENCRYPTION_KEY");
  return configuredKey ? createHash("sha256").update(configuredKey).digest() : null;
}

// Older builds derived the pilot fallback key from the absolute dbPath, which
// orphaned every encrypted blob after a directory move or backup restore; the
// derivation is kept only as a decrypt fallback for blobs written by those builds.
function legacyPathDerivedUploadKey() {
  return createHash("sha256").update(`sena-upload-pilot-local:${dbPath}`).digest();
}

function uploadEncryptionKeyFilePath() {
  return path.join(dbDir, uploadEncryptionKeyFileName);
}

// The pilot fallback key is persisted beside the enterprise store so that
// backups, restores, and directory moves keep encrypted upload blobs readable.
function pilotLocalUploadKey() {
  const keyPath = uploadEncryptionKeyFilePath();
  if (!existsSync(keyPath)) {
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    try {
      writeFileSync(keyPath, randomBytes(32).toString("hex"), { flag: "wx" });
    } catch {
      // Another writer created the key file first; read the winner below.
    }
  }
  return createHash("sha256").update(readFileSync(keyPath, "utf8").trim()).digest();
}

function uploadEncryptionKeyMaterial() {
  const configuredKey = configuredUploadEncryptionKey();
  if (configuredKey) {
    return { key: configuredKey, source: "env" as const };
  }
  return { key: pilotLocalUploadKey(), source: "pilot-local-derived" as const };
}

// Reporting helper for read-only verification paths: never materializes the
// key file as a side effect of a GET.
function uploadEncryptionKeySource() {
  return envValue("SENA_UPLOAD_ENCRYPTION_KEY") ? "env" as const : "pilot-local-derived" as const;
}

function uploadDecryptionKeyCandidates() {
  const candidates: Buffer[] = [];
  const configuredKey = configuredUploadEncryptionKey();
  if (configuredKey) candidates.push(configuredKey);
  if (existsSync(uploadEncryptionKeyFilePath())) {
    candidates.push(createHash("sha256").update(readFileSync(uploadEncryptionKeyFilePath(), "utf8").trim()).digest());
  }
  candidates.push(legacyPathDerivedUploadKey());
  return candidates;
}

function encryptUploadBlob(bytes: Buffer) {
  const { key, source } = uploadEncryptionKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    bytes: Buffer.from(JSON.stringify({
      schemaVersion: uploadEncryptionEncoding,
      algorithm: "aes-256-gcm",
      keySource: source,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertextBase64: ciphertext.toString("base64")
    }), "utf8"),
    encoding: uploadEncryptionEncoding,
    keySource: source
  };
}

function decryptUploadEnvelope(storedBytes: Buffer) {
  let parsed: {
    schemaVersion?: string;
    iv?: string;
    authTag?: string;
    ciphertextBase64?: string;
  };
  try {
    parsed = JSON.parse(storedBytes.toString("utf8"));
  } catch {
    throw new SenaEnterpriseError("Encrypted upload blob is not a valid envelope.", 500, "upload_blob_envelope_invalid");
  }
  if (parsed.schemaVersion !== uploadEncryptionEncoding || !parsed.iv || !parsed.authTag || !parsed.ciphertextBase64) {
    throw new SenaEnterpriseError("Encrypted upload blob envelope is incomplete.", 500, "upload_blob_envelope_invalid");
  }
  for (const key of uploadDecryptionKeyCandidates()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
      decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertextBase64, "base64")),
        decipher.final()
      ]);
    } catch {
      // GCM auth failed for this candidate; try the next key generation.
    }
  }
  throw new SenaEnterpriseError("Encrypted upload blob could not be decrypted.", 500, "upload_blob_decrypt_failed");
}

function readUploadBlobBytes(upload: SenaEnterpriseUpload) {
  const storedBytes = readFileSync(uploadBlobAbsolutePath(upload));
  if (upload.storageEncoding === uploadEncryptionEncoding) {
    return decryptUploadEnvelope(storedBytes);
  }
  if (upload.storageEncoding === "raw") {
    return storedBytes;
  }
  if (storedBytes.subarray(0, 1).toString("utf8") === "{") {
    try {
      const parsed = JSON.parse(storedBytes.toString("utf8")) as { schemaVersion?: string };
      if (parsed.schemaVersion === uploadEncryptionEncoding) return decryptUploadEnvelope(storedBytes);
    } catch {
      return storedBytes;
    }
  }
  return storedBytes;
}

type CreateEnterpriseUploadsInput = {
  teamId: string;
  files: Array<{
    name: string;
    contentType?: string;
    bytes: Buffer;
    importProfile?: string;
    warningCount?: number;
  }>;
};

function createEnterpriseUploadsInDb(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseUploadsInput,
  db: ReturnType<typeof readEnterpriseDb>
) {
  requireEnterprisePermission(context, input.teamId, "upload:create");
  if (input.files.length === 0) return {
    uploads: [] as SenaEnterpriseUpload[],
    auditDetails: [] as Array<Record<string, string | number | boolean | null>>
  };
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
    const encrypted = encryptUploadBlob(bytes);
    const storagePath = path.join("uploads", input.teamId, storedName);
    writeFileSync(path.join(uploadDir, storedName), encrypted.bytes);
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
      warningCount: file.warningCount,
      scanStatus: scan.scanStatus,
      scanEngine: uploadScanEngine,
      scanFindings: scan.scanFindings,
      storagePath,
      storageEncoding: encrypted.encoding,
      storageKeySource: encrypted.keySource,
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
      storageEncoding: upload.storageEncoding ?? null,
      storageKeySource: upload.storageKeySource ?? null,
      scanFindings: upload.scanFindings.join("|") || null
    });
    return upload;
  });
  return { uploads, auditDetails };
}

function appendEnterpriseUploadAudits(
  db: ReturnType<typeof readEnterpriseDb>,
  context: SenaEnterpriseSessionContext,
  teamId: string,
  auditDetails: Array<Record<string, string | number | boolean | null>>
) {
  for (const detail of auditDetails) {
    appendAudit(db, {
      event: "upload.create",
      userId: context.user.id,
      teamId,
      detail
    });
  }
}

export function createEnterpriseUploads(context: SenaEnterpriseSessionContext, input: CreateEnterpriseUploadsInput) {
  const db = readEnterpriseDb();
  const { uploads, auditDetails } = createEnterpriseUploadsInDb(context, input, db);
  appendEnterpriseUploadAudits(db, context, input.teamId, auditDetails);
  writeEnterpriseDb(db);
  return uploads;
}

export async function createEnterpriseUploadsWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseUploadsInput
) {
  const uploads = createEnterpriseUploads(context, input);
  await upsertUploadsToPostgresIfConfigured(uploads);
  return uploads;
}

export async function createEnterpriseUploadsWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseUploadsInput
) {
  const state = await readEnterpriseState();
  const { uploads, auditDetails } = createEnterpriseUploadsInDb(context, input, state.db);
  appendEnterpriseUploadAudits(state.db, context, input.teamId, auditDetails);
  await writeEnterpriseState(state, state.db);
  await upsertUploadsToPostgresIfConfigured(uploads);
  return uploads;
}

export type SenaEnterpriseUploadWarningReport = {
  uploadId: string;
  warningCount: number;
};

// Worker-reported parse warnings arriving through the server-job status
// callback: performs the "until a parser reports" transition of the H10
// warningCount semantics for uploads the external worker actually parsed.
// System-level (ops-token callers); the job layer validates entries against
// the job's own uploadIds before calling this, and the teamId filter here is
// the tenant boundary — a queued uploadIds list that smuggled a foreign
// upload id (client-supplied ids are not existence-checked at enqueue) still
// cannot write another team's registry.
export async function recordEnterpriseUploadWarningCountsAsync(
  entries: SenaEnterpriseUploadWarningReport[],
  teamId: string
): Promise<SenaEnterpriseUpload[]> {
  if (entries.length === 0) return [];
  const state = await readEnterpriseState();
  const countByUploadId = new Map(entries.map((entry) => [entry.uploadId, entry.warningCount]));
  const updated: SenaEnterpriseUpload[] = [];
  for (const upload of state.db.uploads) {
    if (upload.teamId !== teamId) continue;
    const warningCount = countByUploadId.get(upload.id);
    if (warningCount === undefined) continue;
    upload.warningCount = warningCount;
    updated.push(upload);
  }
  if (updated.length === 0) return [];
  await writeEnterpriseState(state, state.db);
  await upsertUploadsToPostgresIfConfigured(updated);
  return updated;
}

export function listEnterpriseUploads(context: SenaEnterpriseSessionContext, teamId?: string) {
  const db = readEnterpriseDb();
  return listEnterpriseUploadsFromDb(context, db, teamId);
}

export async function listEnterpriseUploadsAsync(context: SenaEnterpriseSessionContext, teamId?: string) {
  const state = await readEnterpriseState();
  return listEnterpriseUploadsFromDb(context, state.db, teamId);
}

function listEnterpriseUploadsFromDb(
  context: SenaEnterpriseSessionContext,
  db: ReturnType<typeof readEnterpriseDb>,
  teamId?: string
) {
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
  return verifyEnterpriseUploadStorageFromDb(db, context, input);
}

export async function verifyEnterpriseUploadStorageAsync(
  context?: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): Promise<SenaEnterpriseUploadStorageVerification> {
  const state = await readEnterpriseState();
  return verifyEnterpriseUploadStorageFromDb(state.db, context, input);
}

function verifyEnterpriseUploadStorageFromDb(
  db: ReturnType<typeof readEnterpriseDb>,
  context?: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterpriseUploadStorageVerification {
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
  let encryptedBlobs = 0;
  let legacyRawBlobs = 0;
  const registeredBlobKeys = new Set<string>();

  for (const upload of uploads) {
    totalRegisteredBytes += upload.size;
    registeredBlobKeys.add(`${upload.teamId}/${upload.storedName}`);
    const absolutePath = uploadBlobAbsolutePath(upload);
    if (!existsSync(absolutePath)) {
      missing.push({ uploadId: upload.id, storagePath: upload.storagePath });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = readUploadBlobBytes(upload);
    } catch (error) {
      const errorCode = error instanceof SenaEnterpriseError ? error.code : "upload_blob_read_failed";
      const actualSha256 = `unreadable:${createHash("sha256").update(errorCode).digest("hex")}`;
      corrupt.push({ uploadId: upload.id, storagePath: upload.storagePath, expectedSha256: upload.sha256, actualSha256 });
      continue;
    }
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== upload.sha256) {
      corrupt.push({ uploadId: upload.id, storagePath: upload.storagePath, expectedSha256: upload.sha256, actualSha256 });
      continue;
    }
    if (upload.storageEncoding === uploadEncryptionEncoding) encryptedBlobs += 1;
    else legacyRawBlobs += 1;
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
      rootHint: path.basename(dbDir),
      encryption: {
        atRest: uploadEncryptionEncoding,
        keySource: uploadEncryptionKeySource(),
        encryptedBlobs,
        legacyRawBlobs
      }
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

function postgresUploadRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresUploadRegistryConfigured() {
  return postgresUploadRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

function postgresImportRunRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresImportRunRegistryConfigured() {
  return postgresImportRunRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

function postgresAnalysisRunRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresAnalysisRunRegistryConfigured() {
  return postgresAnalysisRunRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

export function enterpriseUploadRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresUploadRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_uploads",
    evidence: [
      `uploadRegistryStore=${activeStore}`,
      `uploadRegistryPostgresRequested=${requested}`,
      `uploadRegistryPostgresConfigured=${postgresConfig.configured}`,
      `uploadRegistryPostgresTable=sena_enterprise_uploads`,
      `uploadRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

export function enterpriseImportRunRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresImportRunRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_import_runs",
    evidence: [
      `importRunRegistryStore=${activeStore}`,
      `importRunRegistryPostgresRequested=${requested}`,
      `importRunRegistryPostgresConfigured=${postgresConfig.configured}`,
      `importRunRegistryPostgresTable=sena_enterprise_import_runs`,
      `importRunRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

export function enterpriseAnalysisRunRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresAnalysisRunRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_analysis_runs",
    evidence: [
      `analysisRunRegistryStore=${activeStore}`,
      `analysisRunRegistryPostgresRequested=${requested}`,
      `analysisRunRegistryPostgresConfigured=${postgresConfig.configured}`,
      `analysisRunRegistryPostgresTable=sena_enterprise_analysis_runs`,
      `analysisRunRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

async function upsertUploadsToPostgresIfConfigured(uploads: SenaEnterpriseUpload[]) {
  if (uploads.length === 0 || !postgresUploadRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresUploadAdapterFromEnv({});
  try {
    await adapter.upsertUploads(uploads);
  } finally {
    await pool.end?.();
  }
}

async function upsertImportRunsToPostgresIfConfigured(runs: SenaEnterpriseImportRun[]) {
  if (runs.length === 0 || !postgresImportRunRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresImportRunAdapterFromEnv({});
  try {
    await adapter.upsertImportRuns(runs);
  } finally {
    await pool.end?.();
  }
}

async function upsertAnalysisRunsToPostgresIfConfigured(runs: SenaEnterpriseAnalysisRun[]) {
  if (runs.length === 0 || !postgresAnalysisRunRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresAnalysisRunAdapterFromEnv({});
  try {
    await adapter.upsertAnalysisRuns(runs);
  } finally {
    await pool.end?.();
  }
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

function objectStorageTeamScopeFromDb(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; uploadId?: string },
  db: ReturnType<typeof readEnterpriseDb>
) {
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

function uploadObjectStorageKeyHash(upload: SenaEnterpriseUpload) {
  return createHash("sha256").update(uploadObjectStorageKey(upload)).digest("hex");
}

function uploadObjectStorageCustodyStatus(upload: SenaEnterpriseUpload) {
  return upload.objectStorageCustody?.status ?? "pending";
}

function summarizeUploadObjectStorageCustodyFromUploads(
  uploads: SenaEnterpriseUpload[],
  input: {
    source: SenaEnterpriseUploadObjectStorageCustodySummary["source"];
    evidence?: string[];
    forceReview?: boolean;
  }
): SenaEnterpriseUploadObjectStorageCustodySummary {
  const delivered = uploads.filter((upload) => uploadObjectStorageCustodyStatus(upload) === "delivered").length;
  const pending = uploads.filter((upload) => uploadObjectStorageCustodyStatus(upload) === "pending").length;
  const failed = uploads.filter((upload) => uploadObjectStorageCustodyStatus(upload) === "failed").length;
  const skipped = uploads.filter((upload) => uploadObjectStorageCustodyStatus(upload) === "skipped").length;
  const pendingReview = uploads.filter((upload) => upload.scanStatus === "review" && uploadObjectStorageCustodyStatus(upload) !== "delivered").length;
  const eligible = uploads.filter((upload) => upload.scanStatus === "passed");
  const eligibleDelivered = eligible.filter((upload) => uploadObjectStorageCustodyStatus(upload) === "delivered").length;
  const eligibleUndelivered = eligible.length - eligibleDelivered;
  return {
    totalUploads: uploads.length,
    delivered,
    pending,
    failed,
    skipped,
    pendingReview,
    eligibleForDelivery: eligible.length,
    eligibleDelivered,
    eligibleUndelivered,
    ready: !input.forceReview && eligibleUndelivered === 0 && failed === 0 && pendingReview === 0,
    source: input.source,
    evidence: [
      `uploadCustodySource=${input.source}`,
      ...(input.evidence ?? [])
    ]
  };
}

export function summarizeEnterpriseUploadObjectStorageCustody(input: { teamId?: string } = {}): SenaEnterpriseUploadObjectStorageCustodySummary {
  const db = readEnterpriseDb();
  const uploads = db.uploads.filter((upload) => !input.teamId || upload.teamId === input.teamId);
  return summarizeUploadObjectStorageCustodyFromUploads(uploads, {
    source: "file-json",
    evidence: [
      "uploadCustodyRead=pass",
      "uploadCustodyStore=file-json"
    ]
  });
}

export async function summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence(
  input: { teamId?: string } = {}
): Promise<SenaEnterpriseUploadObjectStorageCustodySummary> {
  if (!postgresUploadRegistryConfigured()) {
    const state = await readEnterpriseState();
    const uploads = state.db.uploads.filter((upload) => !input.teamId || upload.teamId === input.teamId);
    const source = state.runtime.activePrimary === "postgres" ? "postgres-primary-state" : "file-primary-state";
    return summarizeUploadObjectStorageCustodyFromUploads(uploads, {
      source,
      evidence: [
        "uploadCustodyRead=pass",
        `uploadCustodyStore=${source}`
      ]
    });
  }
  const runtime = enterpriseUploadRegistryRuntime();
  const { adapter, pool } = createEnterprisePostgresUploadAdapterFromEnv({});
  try {
    const uploads = await adapter.listUploads({
      teamId: input.teamId,
      limit: 5000
    });
    return summarizeUploadObjectStorageCustodyFromUploads(uploads, {
      source: "postgres-table",
      evidence: [
        ...runtime.evidence,
        "uploadCustodyRead=pass",
        "uploadCustodyStore=postgres-table",
        "uploadCustodyTable=sena_enterprise_uploads",
        "uploadCustodyLimit=5000"
      ]
    });
  } catch (error) {
    const state = await readEnterpriseState();
    const uploads = state.db.uploads.filter((upload) => !input.teamId || upload.teamId === input.teamId);
    const fallback = summarizeUploadObjectStorageCustodyFromUploads(uploads, {
      source: state.runtime.activePrimary === "postgres" ? "postgres-primary-state" : "file-primary-state",
      evidence: [
        "uploadCustodyRead=pass",
        `uploadCustodyStore=${state.runtime.activePrimary === "postgres" ? "postgres-primary-state" : "file-primary-state"}`
      ]
    });
    return {
      ...fallback,
      source: state.runtime.activePrimary === "postgres" ? "postgres-primary-state-fallback" : "file-primary-state-fallback",
      ready: false,
      evidence: [
        ...runtime.evidence,
        `uploadCustodyRead=fallback-${state.runtime.activePrimary === "postgres" ? "postgres-primary-state" : "file-primary-state"}`,
        `uploadCustodyStore=${state.runtime.activePrimary === "postgres" ? "postgres-primary-state-fallback" : "file-primary-state-fallback"}`,
        `uploadCustodyReadErrorHash=${webhookErrorHash(error)}`
      ]
    };
  } finally {
    await pool.end?.();
  }
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
  const db = readEnterpriseDb();
  const { result, targets } = await deliverEnterpriseUploadBlobsFromDb(context, input, db);
  if (result.provider.configured) {
    saveDb(db);
    await upsertUploadsToPostgresIfConfigured(targets);
  }
  return result;
}

export async function deliverEnterpriseUploadBlobsWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; uploadId?: string; limit?: number; includeReview?: boolean } = {}
): Promise<SenaEnterpriseUploadObjectStorageDeliveryResult> {
  const state = await readEnterpriseState();
  const { result, targets } = await deliverEnterpriseUploadBlobsFromDb(context, input, state.db);
  if (result.provider.configured) {
    await saveEnterpriseState(state, state.db);
    await upsertUploadsToPostgresIfConfigured(targets);
  }
  return result;
}

async function deliverEnterpriseUploadBlobsFromDb(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; uploadId?: string; limit?: number; includeReview?: boolean },
  db: ReturnType<typeof readEnterpriseDb>
): Promise<{ result: SenaEnterpriseUploadObjectStorageDeliveryResult; targets: SenaEnterpriseUpload[] }> {
  const nativeProvider = enterpriseObjectStorageNativeProvider();
  const webhookProvider = objectStorageWebhookProvider(dbPath, isSelfManagedEnterpriseMode());
  const provider = nativeProvider.configured ? nativeProvider : webhookProvider;
  const teamIds = objectStorageTeamScopeFromDb(context, input, db);
  const teamIdSet = new Set(teamIds);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const includeReview = Boolean(input.includeReview);
  const verification = verifyEnterpriseUploadStorageFromDb(db, context, {
    teamId: input.teamId ?? (teamIds.length === 1 ? teamIds[0] : undefined)
  });
  const result: SenaEnterpriseUploadObjectStorageDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseUploadObjectStorageDelivery,
    generatedAt: now(),
    status: provider.configured ? "completed" : "not-configured",
    provider: {
      mode: provider.mode,
      configured: provider.configured,
      endpointHash: provider.endpointHash,
      bucketHash: "bucketHash" in provider ? provider.bucketHash : undefined,
      region: "region" in provider ? provider.region : undefined,
      prefix: "prefix" in provider ? provider.prefix : undefined,
      secretConfigured: provider.secretConfigured,
      accessKeyConfigured: "accessKeyConfigured" in provider ? provider.accessKeyConfigured : undefined,
      nativeConfigured: "productionReady" in provider ? provider.productionReady : undefined,
      timeoutMs: provider.timeoutMs
    },
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
    return { result, targets: [] };
  }

  const candidates = db.uploads
    .filter((upload) => teamIdSet.has(upload.teamId))
    .filter((upload) => !input.uploadId || upload.id === input.uploadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const targets = candidates.slice(0, limit);
  result.summary.skipped += candidates.length - targets.length;

  for (const upload of targets) {
    const objectKey = uploadObjectStorageKey(upload);
    const objectKeyHash = uploadObjectStorageKeyHash(upload);
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
      const attemptedAt = now();
      upload.objectStorageCustody = {
        status: "skipped",
        providerMode: provider.mode,
        objectKeyHash,
        endpointHash: provider.endpointHash,
        bucketHash: "bucketHash" in provider ? provider.bucketHash : undefined,
        errorCode: "scan_review_required",
        lastAttemptedAt: attemptedAt
      };
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
        bytes = readUploadBlobBytes(upload);
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
      const attemptedAt = now();
      upload.objectStorageCustody = {
        status: "failed",
        providerMode: provider.mode,
        objectKeyHash,
        endpointHash: provider.endpointHash,
        bucketHash: "bucketHash" in provider ? provider.bucketHash : undefined,
        errorCode: localErrorCode,
        lastAttemptedAt: attemptedAt
      };
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
      : provider.mode === "webhook"
        ? await postUploadObjectStorageWebhook(upload, bytes, objectKey)
        : await putEnterpriseObjectStorageObject({
          key: objectKey,
          body: bytes,
          contentType: upload.contentType,
          sha256: upload.sha256
        });
    result.summary.attempted += 1;
    if (attemptResult.ok) {
      result.summary.delivered += 1;
    } else {
      result.summary.failed += 1;
    }
    const attemptedAt = now();
    upload.objectStorageCustody = {
      status: attemptResult.ok ? "delivered" : "failed",
      providerMode: provider.mode,
      objectKeyHash,
      endpointHash: attemptResult.endpointHash,
      bucketHash: "bucketHash" in attemptResult ? attemptResult.bucketHash : undefined,
      objectVersion: "objectVersion" in attemptResult ? attemptResult.objectVersion : undefined,
      etagHash: "etagHash" in attemptResult ? attemptResult.etagHash : undefined,
      httpStatus: attemptResult.httpStatus,
      errorCode: attemptResult.errorCode,
      errorHash: attemptResult.errorHash,
      lastAttemptedAt: attemptedAt,
      deliveredAt: attemptResult.ok ? attemptedAt : undefined
    };
    result.uploads.push({
      ...baseResult,
      deliveryStatus: attemptResult.ok ? "delivered" : "failed",
      httpStatus: attemptResult.httpStatus,
      objectVersion: "objectVersion" in attemptResult ? attemptResult.objectVersion : undefined,
      etagHash: "etagHash" in attemptResult ? attemptResult.etagHash : undefined,
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
        bucketHash: "bucketHash" in attemptResult ? attemptResult.bucketHash ?? null : null,
        deliveryMode: provider.mode,
        httpStatus: attemptResult.httpStatus ?? null,
        objectVersion: "objectVersion" in attemptResult ? attemptResult.objectVersion ?? null : null,
        etagHash: "etagHash" in attemptResult ? attemptResult.etagHash ?? null : null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null,
        scanStatus: upload.scanStatus
      }
    });
  }

  result.status = uploadObjectStorageDeliveryStatus(result.summary);
  return { result, targets };
}

type CreateEnterpriseImportRunInput = {
  teamId: string;
  uploadIds: string[];
  sources: SenaImportAdapterSource[];
  warnings: string[];
  dataset: SenaDataset;
  cleaningManifest?: SenaEnterpriseImportCleaningManifest;
};

function createEnterpriseImportRunInDb(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseImportRunInput,
  db: ReturnType<typeof readEnterpriseDb>
) {
  requireEnterprisePermission(context, input.teamId, "upload:create");
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
  appendAudit(db, {
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

export function createEnterpriseImportRun(context: SenaEnterpriseSessionContext, input: CreateEnterpriseImportRunInput) {
  const db = readEnterpriseDb();
  const run = createEnterpriseImportRunInDb(context, input, db);
  writeEnterpriseDb(db);
  return run;
}

export async function createEnterpriseImportRunWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseImportRunInput
) {
  const run = createEnterpriseImportRun(context, input);
  await upsertImportRunsToPostgresIfConfigured([run]);
  return run;
}

export async function createEnterpriseImportRunWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseImportRunInput
) {
  const state = await readEnterpriseState();
  const run = createEnterpriseImportRunInDb(context, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertImportRunsToPostgresIfConfigured([run]);
  return run;
}

export function listEnterpriseImportRuns(context: SenaEnterpriseSessionContext, teamId?: string) {
  const db = readEnterpriseDb();
  return listEnterpriseImportRunsFromDb(context, db, teamId);
}

export async function listEnterpriseImportRunsAsync(context: SenaEnterpriseSessionContext, teamId?: string) {
  const state = await readEnterpriseState();
  return listEnterpriseImportRunsFromDb(context, state.db, teamId);
}

function listEnterpriseImportRunsFromDb(
  context: SenaEnterpriseSessionContext,
  db: ReturnType<typeof readEnterpriseDb>,
  teamId?: string
) {
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

type CreateEnterpriseAnalysisRunInput = {
  teamId: string;
  projectId?: string;
  persistedProjectId?: string;
  run: SenaAnalysisRunArtifact;
};

function createEnterpriseAnalysisRunInDb(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseAnalysisRunInput,
  db: ReturnType<typeof readEnterpriseDb>
) {
  requireEnterprisePermission(context, input.teamId, "analysis:run");
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
  appendAudit(db, {
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

export function createEnterpriseAnalysisRun(context: SenaEnterpriseSessionContext, input: CreateEnterpriseAnalysisRunInput) {
  const db = readEnterpriseDb();
  const run = createEnterpriseAnalysisRunInDb(context, input, db);
  writeEnterpriseDb(db);
  return run;
}

export async function createEnterpriseAnalysisRunWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseAnalysisRunInput
) {
  const run = createEnterpriseAnalysisRun(context, input);
  await upsertAnalysisRunsToPostgresIfConfigured([run]);
  return run;
}

export async function createEnterpriseAnalysisRunWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseAnalysisRunInput
) {
  const state = await readEnterpriseState();
  const run = createEnterpriseAnalysisRunInDb(context, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertAnalysisRunsToPostgresIfConfigured([run]);
  return run;
}

export function listEnterpriseAnalysisRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  return listEnterpriseAnalysisRunsFromDb(context, db, input);
}

export async function listEnterpriseAnalysisRunsAsync(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const state = await readEnterpriseState();
  return listEnterpriseAnalysisRunsFromDb(context, state.db, input);
}

function listEnterpriseAnalysisRunsFromDb(context: SenaEnterpriseSessionContext, db: ReturnType<typeof readEnterpriseDb>, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
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
