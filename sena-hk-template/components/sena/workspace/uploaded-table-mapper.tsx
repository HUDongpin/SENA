import {
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import type {
  SenaImportTable,
  SenaMappedTable
} from "./analysis-runtime";
import {
  missingRequiredSenaFields,
  senaImportFields,
  senaImportTables
} from "./analysis-runtime";
import { MappingSelect } from "./workspace-primitives";

export type UploadedSenaTable = SenaMappedTable & { id: string };

export type UploadedTableMapperProps = {
  table: UploadedSenaTable;
  onTableChange: (table: SenaImportTable) => void;
  onFieldChange: (field: string, column: string) => void;
};

export function UploadedTableMapper({
  table,
  onTableChange,
  onFieldChange
}: UploadedTableMapperProps) {
  const missing = missingRequiredSenaFields(table.table, table.mapping);

  return (
    <div className="rounded-lg border border-cardBorder/45 bg-background/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-foreground">{table.name}</div>
          <div className="mt-1 text-xs font-semibold text-muted">{table.rows.length} rows, {table.columns.length} columns</div>
        </div>
        {missing.length === 0 ? (
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyanGlow" />
        ) : (
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
        )}
      </div>

      <label className="mt-3 grid gap-1 text-xs font-bold text-muted">
        Contract table
        <select
          value={table.table}
          onChange={(event) => onTableChange(event.currentTarget.value as SenaImportTable)}
          className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
        >
          {senaImportTables.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>

      {missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-xs font-semibold leading-5 text-amber-100">
          Missing {missing.map((field) => field.label).join(", ")}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {senaImportFields[table.table].map((field) => (
          <MappingSelect
            key={field.field}
            label={field.label}
            required={field.required}
            value={table.mapping[field.field] ?? ""}
            columns={table.columns}
            onChange={(column) => onFieldChange(field.field, column)}
          />
        ))}
      </div>
    </div>
  );
}
