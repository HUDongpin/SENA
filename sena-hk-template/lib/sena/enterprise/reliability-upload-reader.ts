import { readSenaReliabilityUploadRows } from "../import-adapters";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  parseCoderAnnotationsFromRows
} from "../reliability";
import type { SenaEnterpriseSessionContext } from "./auth-session";
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

/**
 * Resolves tenant-scoped, checksum-verified upload pointers and parses their
 * combined annotation universe. The caller must run semantic/project preflight
 * on `parsed` before performing any mutation.
 */
export async function readEnterpriseReliabilityUploadPointers(
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
  const parsedFiles = await Promise.all(contents.map((content) => (
    readSenaReliabilityUploadRows(reliabilityUploadFile(content))
  )));
  assertSenaReliabilityCombinedRawRowsWithinLimits(
    parsedFiles.map((file) => ({ length: file.rawRowCount }))
  );
  const parsed = parseCoderAnnotationsFromRows(parsedFiles.flatMap((file) => file.rows));
  return {
    contents,
    parsedFiles,
    parsed,
    fileWarnings: parsedFiles.flatMap((file) => file.warnings)
  };
}
