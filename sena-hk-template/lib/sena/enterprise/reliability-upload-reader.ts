import { readSenaReliabilityUploadRows } from "../import-adapters";
import { parseCoderAnnotationsFromRows } from "../reliability";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  readEnterpriseUploadContentsAsync,
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
  const contents = await readEnterpriseUploadContentsAsync(context, input);
  const parsedFiles = await Promise.all(contents.map((content) => (
    readSenaReliabilityUploadRows(reliabilityUploadFile(content))
  )));
  const parsed = parseCoderAnnotationsFromRows(parsedFiles.flatMap((file) => file.rows));
  return {
    contents,
    parsedFiles,
    parsed,
    fileWarnings: parsedFiles.flatMap((file) => file.warnings)
  };
}
