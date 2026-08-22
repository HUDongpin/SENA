import { readSenaReliabilityUploadRows } from "../import-adapters";
import {
  buildSenaReliabilityJsonQueueSources,
  prepareSenaReliabilityJsonRequest,
  type SenaPreparedReliabilityRunInput,
  type SenaReliabilityJsonQueueSourceKind,
  type SenaReliabilityJsonRequest
} from "../reliability-api";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  parseCoderAnnotationsFromRows
} from "../reliability";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import { senaReliabilityServerSourceByteLimit } from "./upload-limits";
import {
  readEnterpriseUploadContentsAsync,
  readEnterpriseUploadMetadataAsync,
  type SenaEnterpriseUploadContent
} from "./import-analysis";

/**
 * Presents verified enterprise upload plaintext to the reliability row reader.
 * Keeping this adapter shared by enqueue preflight and worker execution ensures
 * both paths dispatch on the same persisted original filename and exact bytes.
 */
function reliabilityUploadFile(content: SenaEnterpriseUploadContent) {
  return { name: content.upload.originalName, bytes: content.bytes };
}

export const SENA_RELIABILITY_JSON_QUEUE_UPLOAD_PROFILES = Object.freeze({
  file: "sena-reliability-json-file-source/v1",
  annotations: "sena-reliability-json-annotations-source/v1",
  rows: "sena-reliability-json-rows-source/v1",
  data: "sena-reliability-json-data-source/v1"
} satisfies Record<SenaReliabilityJsonQueueSourceKind, string>);

const queueJsonKindByProfile = new Map<string, SenaReliabilityJsonQueueSourceKind>(
  Object.entries(SENA_RELIABILITY_JSON_QUEUE_UPLOAD_PROFILES)
    .map(([kind, profile]) => [profile, kind as SenaReliabilityJsonQueueSourceKind])
);

export function buildEnterpriseReliabilityJsonQueueUploads(payload: SenaReliabilityJsonRequest) {
  const sourceBytes = senaReliabilityServerSourceByteLimit();
  return buildSenaReliabilityJsonQueueSources(payload, { sourceBytes }).map((source, index) => ({
    name: `queued-reliability-json-${source.kind}-${index + 1}.json`,
    contentType: "application/json",
    bytes: source.bytes,
    importProfile: SENA_RELIABILITY_JSON_QUEUE_UPLOAD_PROFILES[source.kind]
  }));
}

function queueJsonSourceEnvelope(content: SenaEnterpriseUploadContent) {
  const kind = content.upload.importProfile
    ? queueJsonKindByProfile.get(content.upload.importProfile)
    : undefined;
  if (!kind) return undefined;
  try {
    const value = JSON.parse(content.bytes.toString("utf8")) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schemaVersion !== SENA_SCHEMA_VERSIONS.reliabilityJsonSource ||
      typeof value.name !== "string" || !Object.prototype.hasOwnProperty.call(value, "rows")) {
      throw new Error("invalid queue source envelope");
    }
    return { kind, name: value.name, value: value.rows };
  } catch {
    throw new SenaEnterpriseError(
      "Queued reliability JSON source evidence is invalid.",
      400,
      "server_job_worker_reliability_source_invalid"
    );
  }
}

export function prepareEnterpriseReliabilityQueuedJsonUploads(
  contents: SenaEnterpriseUploadContent[],
  defaultReviewer: string
): SenaPreparedReliabilityRunInput | undefined {
  const envelopes = contents.map(queueJsonSourceEnvelope);
  if (envelopes.every((envelope) => envelope === undefined)) return undefined;
  if (envelopes.some((envelope) => envelope === undefined)) {
    throw new SenaEnterpriseError(
      "Queued reliability JSON sources cannot be mixed with file upload sources.",
      400,
      "server_job_worker_reliability_source_invalid"
    );
  }

  const payload: SenaReliabilityJsonRequest = {};
  const files: unknown[] = [];
  const inlineSourceNames: string[] = [];
  for (const envelope of envelopes) {
    if (!envelope) continue;
    if (envelope.kind === "file") {
      files.push(envelope.value);
      continue;
    }
    if (payload[envelope.kind] !== undefined) {
      throw new SenaEnterpriseError(
        "Queued reliability JSON source evidence is ambiguous.",
        400,
        "server_job_worker_reliability_source_invalid"
      );
    }
    payload[envelope.kind] = envelope.value;
    inlineSourceNames.push(envelope.name);
  }
  if (files.length > 0) payload.files = files;
  // A caller-supplied sourceName is shared by every inline alias. Distinct
  // names mean the queue builder supplied the per-alias defaults, so omit the
  // global name and let the canonical semantic alias recover its own default.
  if (inlineSourceNames.length > 0 && new Set(inlineSourceNames).size === 1) {
    payload.sourceName = inlineSourceNames[0];
  }
  return prepareSenaReliabilityJsonRequest(payload, { defaultReviewer });
}

/**
 * Resolves tenant-scoped, checksum-verified upload pointers and parses their
 * combined annotation universe. The caller must run semantic/project preflight
 * on `parsed` before performing any mutation.
 */
export async function readEnterpriseReliabilityUploadPointerContents(
  context: SenaEnterpriseSessionContext,
  input: { teamId: string; uploadIds: string[] }
) {
  assertSenaReliabilitySourceCountWithinLimits(input.uploadIds.length, "uploadIds");
  const metadata = await readEnterpriseUploadMetadataAsync(context, input);
  const sourceBytes = senaReliabilityServerSourceByteLimit();
  assertSenaReliabilitySourceBytesWithinLimits(
    metadata.map((upload) => upload.size),
    "uploadIds",
    { sourceBytes }
  );
  const contents = await readEnterpriseUploadContentsAsync(context, input);
  assertSenaReliabilitySourceBytesWithinLimits(
    contents.map((content) => content.bytes.byteLength),
    "uploadIds",
    { sourceBytes }
  );
  return { contents };
}

export async function parseEnterpriseReliabilityUploadContents(
  contents: SenaEnterpriseUploadContent[]
) {
  const parsedFiles = await Promise.all(contents.map((content) => (
    readSenaReliabilityUploadRows(reliabilityUploadFile(content))
  )));
  assertSenaReliabilityCombinedRawRowsWithinLimits(
    parsedFiles.map((file) => ({ length: file.rawRowCount }))
  );
  const parsed = parseCoderAnnotationsFromRows(parsedFiles.flatMap((file) => file.rows));
  return {
    parsedFiles,
    parsed,
    fileWarnings: parsedFiles.flatMap((file) => file.warnings)
  };
}

export async function readEnterpriseReliabilityUploadPointers(
  context: SenaEnterpriseSessionContext,
  input: { teamId: string; uploadIds: string[] }
) {
  const { contents } = await readEnterpriseReliabilityUploadPointerContents(context, input);
  return {
    contents,
    ...await parseEnterpriseReliabilityUploadContents(contents)
  };
}
