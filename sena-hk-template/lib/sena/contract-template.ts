import { senaImportFields, senaImportTables, type SenaImportTable } from "./import";

/**
 * Example values for the fields an analyst must supply. Keyed by the canonical
 * field name in `senaImportFields`, so a renamed field loses its example rather
 * than silently documenting a name the importer no longer accepts.
 */
const TEMPLATE_EXAMPLES: Record<string, string> = {
  id: "P1",
  label: "Ada",
  role: "student",
  group: "Team A",
  initials: "AL",
  actorType: "human",
  source: "P1",
  target: "P2",
  weight: "1",
  channel: "discussion",
  stage: "Teach",
  turnIndex: "1",
  evidence: "quoted excerpt",
  personId: "P1",
  utteranceId: "U1",
  unitId: "Team A",
  stanzaId: "S1",
  text: "example utterance text",
  timestamp: "2026-01-01T09:00:00Z",
  segmentId: "CS1",
  codes: "CODE_A|CODE_B",
  targetPersonIds: "P2",
  confidence: "0.9",
  family: "epistemic",
  description: "what this code means",
  color: "#2451CC"
};

const TABLE_EXAMPLE_OVERRIDES: Partial<Record<SenaImportTable, Record<string, string>>> = {
  codebook: { id: "CODE_A", label: "Claim" },
  utterances: { id: "U1" },
  interactions: { target: "P2" }
};

function exampleValue(table: SenaImportTable, field: string): string {
  return TABLE_EXAMPLE_OVERRIDES[table]?.[field] ?? TEMPLATE_EXAMPLES[field] ?? "";
}

/**
 * Second rows that make the example internally consistent. Without them the
 * template imports with warnings — the P1→P2 tie would be dropped as a dangling
 * target under ADR-0010, and CODE_B would be derived as a placeholder — which is
 * a poor thing for a reference contract to demonstrate.
 */
/** Keyed by canonical *field* name, resolved to column names the same way the first row is. */
const TEMPLATE_EXTRA_ROWS: Partial<Record<SenaImportTable, Record<string, string>>> = {
  people: { id: "P2", label: "Ben", role: "student", group: "Team A", initials: "BN", actorType: "human" },
  codebook: { id: "CODE_B", label: "Evidence", family: "epistemic", description: "what this code means", color: "#A06BF5" }
};

function columnName(table: SenaImportTable, field: string): string {
  const definition = senaImportFields[table].find((candidate) => candidate.field === field);
  return definition?.aliases[0] ?? field;
}

function templateRows(table: SenaImportTable): Array<Record<string, string>> {
  const row: Record<string, string> = {};
  for (const definition of senaImportFields[table]) {
    row[definition.aliases[0] ?? definition.field] = exampleValue(table, definition.field);
  }
  const extra = TEMPLATE_EXTRA_ROWS[table];
  if (!extra) return [row];
  // Keep the column set identical across rows so the table reads as a table.
  const second: Record<string, string> = Object.fromEntries(Object.keys(row).map((key) => [key, ""]));
  for (const [field, value] of Object.entries(extra)) {
    second[columnName(table, field)] = value;
  }
  return [row, second];
}

function requiredColumns(table: SenaImportTable): string[] {
  return senaImportFields[table]
    .filter((definition) => definition.required)
    .map((definition) => definition.aliases[0] ?? definition.field);
}

/**
 * A contract template is only useful if it names the fields the importer
 * enforces, and only usable if it is itself a valid contract — the browser smoke
 * uploads this file straight back in. So the five tables stay plain arrays of
 * example rows (`importSenaJsonContract` ignores the `_` keys), rather than
 * being wrapped in a documentation object that would no longer import.
 *
 * Deriving the rows from `senaImportFields` keeps the template and the validator
 * from drifting apart; multi-value cells use the ADR-0007 "|" separator.
 */
export function buildSenaContractTemplate(): Record<string, unknown> {
  const template: Record<string, unknown> = {
    _README: [
      "One example row per table. Replace the values; keep the field names.",
      "This file is itself a valid SENA contract: upload it as-is to check the shape.",
      "Fields listed in _required must be present on every row of that table.",
      "Multi-value cells (codes, target_person_ids) separate entries with \"|\".",
      "Optional fields may be dropped entirely if you have no data for them.",
      "Delete the _README and _required keys if you prefer; the importer ignores them."
    ],
    _required: Object.fromEntries(
      senaImportTables.map(({ value: table }) => [table, requiredColumns(table)])
    )
  };

  for (const { value: table } of senaImportTables) {
    template[table] = templateRows(table);
  }

  return template;
}

export function buildSenaContractTemplateJson(): string {
  return JSON.stringify(buildSenaContractTemplate(), null, 2);
}
