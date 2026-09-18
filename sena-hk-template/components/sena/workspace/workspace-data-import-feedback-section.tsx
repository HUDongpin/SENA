import { AlertTriangle } from "lucide-react";
import type { SenaImportTable } from "./analysis-runtime";
import {
  UploadedTableMapper,
  type UploadedSenaTable
} from "./uploaded-table-mapper";

export const RESEARCHER_FIVE_TABLE_RECOVERY =
  "Load the lesson-study sample, download the contract template, or upload the five SENA tables (people, interactions, utterances, coded_segments, codebook).";

export const RESEARCHER_IMPORT_RECOVERY =
  "Next: load the lesson-study sample, download the contract template, or upload the five SENA tables (people, interactions, utterances, coded_segments, codebook).";

const JSON_PARSE_FAILURE =
  "The JSON file could not be parsed. Use the contract template or load the lesson-study sample.";

const SOURCE_FILE_PREFIX = /^([^:]+\.(?:json|csv|xlsx|xls|txt|md|srt|vtt))\s*:\s*/i;
const QUOTED_CELL_VALUE = /"(?:\\.|[^"\\]){0,400}"/g;

function looksLikeJsonParseFailure(message: string) {
  return (
    /JSON could not be parsed/i.test(message) ||
    /Unexpected token/i.test(message) ||
    /Unexpected end of JSON input/i.test(message) ||
    /is not valid JSON/i.test(message) ||
    /in JSON at position \d+/i.test(message)
  );
}

/**
 * Researcher-facing import errors stay class-stable and never echo cell text,
 * parse snippets, or secret-like quoted fragments onto the rose error plate.
 */
export function formatResearcherImportError(error: unknown, fallback = "SENA import failed."): string {
  if (error instanceof SyntaxError) {
    return JSON_PARSE_FAILURE;
  }

  const raw = error instanceof Error
    ? error.message.trim()
    : typeof error === "string" ? error.trim() : "";
  if (!raw) return fallback;

  if (looksLikeJsonParseFailure(raw)) {
    const filePrefix = raw.match(SOURCE_FILE_PREFIX)?.[1];
    return filePrefix
      ? `${filePrefix}: JSON could not be parsed. Use the contract template or load the lesson-study sample.`
      : JSON_PARSE_FAILURE;
  }

  return raw.replace(QUOTED_CELL_VALUE, "a cell value");
}

export type WorkspaceDataImportFeedbackSectionProps = {
  importError: string | null;
  // Counts reported failures rather than describing one. The plate below renders
  // only the message; the shell reads this to tell a repeated failure apart from
  // the failure already on screen, which an identical message cannot do.
  importErrorAttempt: number;
  uploadedTables: UploadedSenaTable[];
  warnings: string[];
  onTableChange: (id: string, table: SenaImportTable) => void;
  onFieldChange: (id: string, field: string, column: string) => void;
};

export function WorkspaceDataImportFeedbackSection({
  importError,
  uploadedTables,
  warnings,
  onTableChange,
  onFieldChange
}: WorkspaceDataImportFeedbackSectionProps) {
  return (
    <>
      {importError && (
        <div
          data-testid="workspace-import-error"
          role="alert"
          aria-atomic="true"
          className="min-w-0 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-900 [overflow-wrap:anywhere]"
        >
          <div>{importError}</div>
          <div data-testid="workspace-import-error-recovery" className="mt-2 text-xs font-bold leading-5 text-rose-800">
            {RESEARCHER_IMPORT_RECOVERY}
          </div>
        </div>
      )}

      {uploadedTables.length > 0 && (
        <div className="grid max-h-[42rem] gap-3 overflow-auto pr-1">
          {uploadedTables.map((table) => (
            <UploadedTableMapper
              key={table.id}
              table={table}
              onTableChange={(nextTable) => onTableChange(table.id, nextTable)}
              onFieldChange={(field, column) => onFieldChange(table.id, field, column)}
            />
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="sena-warning-panel grid max-h-64 gap-2 overflow-auto rounded-lg p-3 text-xs font-semibold leading-5">
          {warnings.slice(0, 12).map((warning, index) => (
            <div key={`${warning}-${index}`} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
          {warnings.length > 12 && <div>{warnings.length - 12} more warnings.</div>}
        </div>
      )}
    </>
  );
}
