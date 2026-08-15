import { describe, expect, it } from "vitest";
import { buildSenaContractTemplate, buildSenaContractTemplateJson } from "../contract-template";
import { importSenaJsonContract, senaImportFields, senaImportTables } from "../import";

describe("sena data contract template", () => {
  const template = buildSenaContractTemplate();
  const required = template._required as Record<string, string[]>;

  it("emits at least one example row per contract table, as an array", () => {
    for (const { value: table } of senaImportTables) {
      const rows = template[table];
      expect(Array.isArray(rows), `${table} must be an array to remain a valid contract`).toBe(true);
      expect((rows as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it("keeps every row of a table on the same column set", () => {
    for (const { value: table } of senaImportTables) {
      const rows = template[table] as Array<Record<string, string>>;
      const columns = JSON.stringify(Object.keys(rows[0]));
      for (const row of rows) {
        expect(JSON.stringify(Object.keys(row)), `${table} rows disagree on columns`).toBe(columns);
      }
    }
  });

  // The old template shipped five empty arrays, so an analyst learned the table
  // names and none of the fields the importer enforces.
  it("names every field the importer accepts, and marks the required ones", () => {
    for (const { value: table } of senaImportTables) {
      const row = (template[table] as Array<Record<string, string>>)[0];
      for (const definition of senaImportFields[table]) {
        const columnName = definition.aliases[0] ?? definition.field;
        expect(Object.keys(row), `${table}.${columnName} missing from template row`).toContain(columnName);
        if (definition.required) {
          expect(required[table], `${table}.${columnName} not marked required`).toContain(columnName);
          expect(row[columnName], `${table}.${columnName} has no example value`).not.toBe("");
        }
      }
    }
  });

  it("uses the ADR-0007 multi-value separator for multi-value cells", () => {
    const codedSegments = (template.coded_segments as Array<Record<string, string>>)[0];
    expect(codedSegments.codes).toContain("|");
  });

  it("serializes to parseable JSON", () => {
    expect(() => JSON.parse(buildSenaContractTemplateJson())).not.toThrow();
  });

  /**
   * The template is uploaded straight back into the importer by the workspace
   * browser smoke, so it has to remain a valid contract. A template that
   * documents the fields but no longer imports would trade one defect for another.
   */
  /**
   * Internally consistent, not merely parseable: the example roster covers the
   * interaction's target and the codebook covers every code the segment cites.
   * A reference contract that imports with ADR-0010 dangling-target warnings
   * would be teaching the mistake it exists to prevent.
   */
  it("is itself importable and imports with no warnings at all", () => {
    const result = importSenaJsonContract(buildSenaContractTemplateJson());
    expect(result.warnings).toEqual([]);
    expect(result.dataset.people.map((person) => person.id)).toEqual(["P1", "P2"]);
    expect(result.dataset.codebook.map((code) => code.id)).toEqual(["CODE_A", "CODE_B"]);
    expect(result.dataset.coded_segments.length).toBeGreaterThan(0);
    expect(result.dataset.interactions.length).toBeGreaterThan(0);
  });

  it("keeps the documentation keys out of the contract tables", () => {
    expect(template._README).toBeDefined();
    for (const { value: table } of senaImportTables) {
      const row = (template[table] as Array<Record<string, string>>)[0];
      expect(Object.keys(row).some((key) => key.startsWith("_"))).toBe(false);
    }
  });
});
