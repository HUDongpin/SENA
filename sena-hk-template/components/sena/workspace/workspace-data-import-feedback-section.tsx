import { AlertTriangle } from "lucide-react";
import type { SenaImportTable } from "./analysis-runtime";
import {
  UploadedTableMapper,
  type UploadedSenaTable
} from "./uploaded-table-mapper";

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
        <div className="rounded-lg border border-rose-300/35 bg-rose-300/10 p-3 text-sm font-semibold leading-6 text-rose-100">
          {importError}
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
