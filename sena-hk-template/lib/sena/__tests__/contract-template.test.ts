import { describe, expect, it } from "vitest";
import { buildSenaContractTemplate, buildSenaContractTemplateJson } from "../contract-template";
import { buildSenaDatasetFromTables, senaImportFields, senaImportTables } from "../import";

type TemplateTable = { _required: string[]; rows: Array<Record<string, string>> };

describe("sena data contract template", () => {
  const template = buildSenaContractTemplate();

  it("emits one example row per contract table", () => {
    for (const { value: table } of senaImportTables) {
      const entry = template[table] as TemplateTable | undefined;
      expect(entry, `missing table ${table}`).toBeDefined();
      expect(entry?.rows).toHaveLength(1);
    }
  });

  // The old template shipped five empty arrays, so an analyst learned the table
  // names and none of the fields the importer enforces.
  it("names every field the importer accepts, and marks the required ones", () => {
    for (const { value: table } of senaImportTables) {
      const entry = template[table] as TemplateTable;
      const row = entry.rows[0];
      for (const definition of senaImportFields[table]) {
        const columnName = definition.aliases[0] ?? definition.field;
        expect(Object.keys(row), `${table}.${columnName} missing from template row`).toContain(columnName);
        if (definition.required) {
          expect(entry._required, `${table}.${columnName} not marked required`).toContain(columnName);
          expect(row[columnName], `${table}.${columnName} has no example value`).not.toBe("");
        }
      }
    }
  });

  it("carries no required field with a blank example, so the template can be filled in by editing", () => {
    for (const { value: table } of senaImportTables) {
      const entry = template[table] as TemplateTable;
      for (const required of entry._required) {
        expect(entry.rows[0][required]).toBeTruthy();
      }
    }
  });

  it("uses the ADR-0007 multi-value separator for multi-value cells", () => {
    const codedSegments = template.coded_segments as TemplateTable;
    expect(codedSegments.rows[0].codes).toContain("|");
    expect(codedSegments.rows[0].target_person_ids).toContain("|");
  });

  it("serializes to parseable JSON", () => {
    expect(() => JSON.parse(buildSenaContractTemplateJson())).not.toThrow();
  });

  // The point of the template is that filling it in produces a dataset the
  // importer accepts: a template whose example row trips the required-field
  // validator would send every analyst straight into warnings.
  it("produces no missing-required-field warnings when imported as-is", () => {
    const tables = senaImportTables.map(({ value }) => {
      const entry = template[value] as TemplateTable;
      const columns = Object.keys(entry.rows[0]);
      return {
        table: value,
        name: `${value}.csv`,
        columns,
        rows: entry.rows,
        mapping: Object.fromEntries(
          senaImportFields[value].map((definition) => [definition.field, definition.aliases[0] ?? definition.field])
        )
      };
    });

    const result = buildSenaDatasetFromTables(tables as never);
    const missingRequired = result.warnings.filter((warning) => warning.includes("missing required field"));
    expect(missingRequired).toEqual([]);
  });
});
