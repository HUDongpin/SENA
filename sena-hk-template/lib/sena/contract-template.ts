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
  targetPersonIds: "P2|P3",
  confidence: "0.9",
  family: "epistemic",
  description: "what this code means",
  color: "#2451CC"
};

const TABLE_EXAMPLE_OVERRIDES: Partial<Record<SenaImportTable, Record<string, string>>> = {
  codebook: { id: "CODE_A", label: "Claim" },
  utterances: { id: "U1" }
};

function exampleValue(table: SenaImportTable, field: string): string {
  return TABLE_EXAMPLE_OVERRIDES[table]?.[field] ?? TEMPLATE_EXAMPLES[field] ?? "";
}

/**
 * A contract template is only useful if it names the fields the importer
 * enforces. Deriving the row from `senaImportFields` keeps the template and the
 * validator from drifting apart; multi-value cells use the ADR-0007 "|" separator.
 */
export function buildSenaContractTemplate(): Record<string, unknown> {
  const template: Record<string, unknown> = {
    _README: [
      "One example row per table. Replace the values; keep the field names.",
      "Fields marked required in the SENA data contract must be present on every row.",
      "Multi-value cells (codes, target_person_ids) separate entries with \"|\".",
      "Optional fields may be dropped entirely if you have no data for them."
    ]
  };

  for (const { value: table } of senaImportTables) {
    const required: string[] = [];
    const row: Record<string, string> = {};
    for (const definition of senaImportFields[table]) {
      const columnName = definition.aliases[0] ?? definition.field;
      row[columnName] = exampleValue(table, definition.field);
      if (definition.required) {
        required.push(columnName);
      }
    }
    template[table] = { _required: required, rows: [row] };
  }

  return template;
}

export function buildSenaContractTemplateJson(): string {
  return JSON.stringify(buildSenaContractTemplate(), null, 2);
}
