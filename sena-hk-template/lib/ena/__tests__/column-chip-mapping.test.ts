import { describe, expect, it } from "vitest";
import { enaColumnChipRole, sanitizeMapping, toggleEnaColumnChip, toggleEnaColumnRole } from "../validation";
import type { EnaMapping } from "../types";

// FA13-05 (Functional Coverage Ledger). The row read "column chips cycle roles"
// for months. They do not, and writing the row as stated would have produced a
// false red. These checks pin what the control actually does so the row can be
// gated rather than argued about: the chip hands back the column's *current*
// role, so a click unmaps a mapped column and assigns "metadata" to an unmapped
// one — metadata being the only role a chip can ever assign.

const headers = ["speaker", "turn", "codeA", "codeB", "school"];

const baseline: EnaMapping = {
  units: ["speaker"],
  conversation: ["turn"],
  codes: ["codeA", "codeB"],
  metadata: ["school"]
};

/**
 * The real chip click. Deliberately not a local re-implementation: the chip's
 * "which role does a click act on" decision is the thing the ledger row got
 * wrong, so the test has to execute the production copy of it or a change there
 * would slip past every assertion below.
 */
const clickChip = (mapping: EnaMapping, column: string) => toggleEnaColumnChip(mapping, column, headers);

describe("ENA Model column chips (FA13-05)", () => {
  it("reports the role a column currently holds, and null when it holds none", () => {
    expect(enaColumnChipRole(baseline, "speaker")).toBe("units");
    expect(enaColumnChipRole(baseline, "turn")).toBe("conversation");
    expect(enaColumnChipRole(baseline, "codeA")).toBe("codes");
    expect(enaColumnChipRole(baseline, "school")).toBe("metadata");
    expect(enaColumnChipRole(baseline, "unmapped-column")).toBeNull();
  });

  it("assigns metadata — never another role — when clicking an unmapped column", () => {
    const mapping: EnaMapping = { units: ["speaker"], conversation: ["turn"], codes: ["codeA", "codeB"], metadata: [] };
    const next = clickChip(mapping, "school");
    expect(next.metadata).toContain("school");
    expect(next.units).not.toContain("school");
    expect(next.conversation).not.toContain("school");
    expect(next.codes).not.toContain("school");
  });

  it("unmaps a column when its own chip is clicked", () => {
    const next = clickChip(baseline, "speaker");
    expect(enaColumnChipRole(next, "speaker")).toBeNull();
    // The other roles are untouched: only the clicked column moves.
    expect(next.conversation).toEqual(["turn"]);
    expect(next.codes).toEqual(["codeA", "codeB"]);
    expect(next.metadata).toEqual(["school"]);
  });

  it("does NOT cycle roles: two clicks on a Units chip land the column in Metadata", () => {
    // The behaviour the ledger row denied for months. Pinned deliberately: a
    // reader who expects "cycle" would predict units -> conversation here, and a
    // future change that silently made that true must fail this check rather
    // than quietly redefine the control. Reaching Units again needs the Units
    // multi-select; the chip alone cannot do it.
    const once = clickChip(baseline, "speaker");
    expect(enaColumnChipRole(once, "speaker")).toBeNull();

    const twice = clickChip(once, "speaker");
    expect(enaColumnChipRole(twice, "speaker")).toBe("metadata");
    expect(twice.units).toEqual([]);

    const thrice = clickChip(twice, "speaker");
    expect(enaColumnChipRole(thrice, "speaker")).toBeNull();
  });

  it("never leaves a column holding two roles at once", () => {
    // The clear-from-every-role step is what guarantees this. Without it a
    // reassignment would leave the column in both its old and its new role, and
    // prepareEnaRun would receive a column that is simultaneously a unit and a code.
    const reassigned = toggleEnaColumnRole(baseline, "codes", "speaker", headers);
    expect(reassigned.codes).toContain("speaker");
    expect(reassigned.units).not.toContain("speaker");

    const roleCount = (["units", "conversation", "codes", "metadata"] as const).filter((role) =>
      reassigned[role].includes("speaker")
    );
    expect(roleCount).toEqual(["codes"]);
  });

  it("drops a column that is not a header of the loaded dataset", () => {
    const next = toggleEnaColumnRole(baseline, "metadata", "column-from-a-previous-csv", headers);
    expect(next.metadata).not.toContain("column-from-a-previous-csv");
  });

  it("moves a column between roles by precedence when a multi-select assigns it", () => {
    // The row's second clause. sanitizeMapping enforces units > conversation >
    // codes > metadata, so a lower-priority select cannot steal a column from a
    // higher-priority role...
    const stolenByCodes = sanitizeMapping(
      { units: ["speaker"], conversation: [], codes: ["speaker", "codeA"], metadata: [] },
      headers
    );
    expect(stolenByCodes.units).toEqual(["speaker"]);
    expect(stolenByCodes.codes).toEqual(["codeA"]);

    // ...while a higher-priority one does take it.
    const takenByUnits = sanitizeMapping(
      { units: ["codeA"], conversation: [], codes: ["codeA", "codeB"], metadata: [] },
      headers
    );
    expect(takenByUnits.units).toEqual(["codeA"]);
    expect(takenByUnits.codes).toEqual(["codeB"]);
  });

  it("does not mutate the mapping it is given", () => {
    const mapping: EnaMapping = { units: ["speaker"], conversation: ["turn"], codes: ["codeA", "codeB"], metadata: ["school"] };
    const snapshot = JSON.stringify(mapping);
    toggleEnaColumnRole(mapping, "units", "speaker", headers);
    expect(JSON.stringify(mapping)).toBe(snapshot);
  });
});
