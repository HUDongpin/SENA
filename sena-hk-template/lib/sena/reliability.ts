import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { parseSenaCsv, type SenaImportRow } from "./import";
import type { SenaCodingReliabilityReview } from "./types";

export type SenaCoderAnnotation = {
  coderId: string;
  itemId: string;
  codeId: string;
  value: boolean;
};

export type SenaPairwiseKappa = {
  coderA: string;
  coderB: string;
  units: number;
  observedAgreement: number;
  expectedAgreement: number;
  kappa: number;
};

export type SenaReliabilityDisagreement = {
  itemId: string;
  codeId: string;
  values: Record<string, boolean>;
};

export type SenaCodeReliabilityDiagnostic = {
  codeId: string;
  unitCount: number;
  positiveAssignments: number;
  disagreementCount: number;
  agreementRate: number;
  coderPositiveRates: Record<string, number>;
  pairwiseCohenKappa: SenaPairwiseKappa[];
};

export type SenaReliabilityDashboard = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.codingReliabilityDashboard;
  coderCount: number;
  itemCount: number;
  codeCount: number;
  binaryUnitCount: number;
  pairwiseCohenKappa: SenaPairwiseKappa[];
  codeDiagnostics: SenaCodeReliabilityDiagnostic[];
  meanPairwiseKappa: number;
  krippendorffAlphaNominal: number;
  disagreementCount: number;
  adjudicationQueue: SenaReliabilityDisagreement[];
  interpretation: string;
  warnings: string[];
};

function scalar(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readAliasEntry(row: SenaImportRow, aliases: string[]): { present: boolean; value: string } {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = entries.find(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedAlias);
    if (found) return { present: true, value: scalar(found[1]) };
  }
  return { present: false, value: "" };
}

function readAlias(row: SenaImportRow, aliases: string[]) {
  return readAliasEntry(row, aliases).value;
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return !["0", "false", "no", "n", "absent", "none"].includes(normalized);
}

// Coder-annotation files are external exports, so any-delimiter tolerance is
// the right call here, at the adapter boundary. The five-table contract itself
// splits multi-value cells on "|" only (ADR-0007 D2) — do not "align" this
// splitter with lib/sena/import.ts without deciding how comma-bearing code ids
// in coder files should then be expressed.
function parseCodes(value: string) {
  return value.split(/[|;,]/).map((code) => code.trim()).filter(Boolean);
}

export function parseCoderAnnotationsFromRows(rows: SenaImportRow[]): { annotations: SenaCoderAnnotation[]; warnings: string[] } {
  const warnings: string[] = [];
  const annotations = rows.flatMap<SenaCoderAnnotation>((row, index) => {
    const coderId = readAlias(row, ["coder_id", "coder", "rater", "reviewer"]);
    const itemId = readAlias(row, ["item_id", "segment_id", "utterance_id", "unit_id", "stanza_id", "id"]);
    const codes = parseCodes(readAlias(row, ["code_id", "code", "codes", "label", "coding"]));
    const valueEntry = readAliasEntry(row, ["value", "applied", "present", "decision", "score"]);

    if (!coderId || !itemId || codes.length === 0) {
      warnings.push(`coder annotation row ${index + 1} is missing coder, item, or code and was skipped.`);
      return [];
    }

    // A file with no value column is a presence-style export: each row means the
    // coder applied the code. An empty cell in an existing value column records
    // nothing — including a ragged row padded by parseSenaCsv — so it becomes a
    // skipped annotation (2026-08-01 report §4.1), never an applied code. In the
    // dashboard's binary-unit model a skipped row then reads exactly like an
    // absent row: the coder scores not-applied on units other coders created,
    // which can only deflate agreement (conservative), not inflate it. Whether
    // an explicit empty cell should instead be missing-data-excluded from
    // pairable units is an estimator-semantics decision reserved for Peter.
    if (valueEntry.present && valueEntry.value === "") {
      warnings.push(`coder annotation row ${index + 1} has an empty value cell and was skipped rather than read as applied.`);
      return [];
    }
    const value = valueEntry.present ? parseBoolean(valueEntry.value) : true;

    return codes.map((codeId) => ({ coderId, itemId, codeId, value }));
  });

  return { annotations, warnings };
}

export function parseCoderAnnotationsCsv(text: string) {
  const parsed = parseSenaCsv(text);
  const annotations = parseCoderAnnotationsFromRows(parsed.rows);
  // Ragged-row repairs are additive on the existing shape: a row truncated
  // before its value cell is padded here, then skipped (with disclosure) by the
  // empty-value guard above instead of being read as an applied code.
  return { ...annotations, warnings: [...parsed.warnings, ...annotations.warnings] };
}

function mean(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length === 0 ? 0 : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function round(value: number, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function cohenKappa(a: boolean[], b: boolean[]): Omit<SenaPairwiseKappa, "coderA" | "coderB"> {
  const units = Math.min(a.length, b.length);
  if (units === 0) return { units: 0, observedAgreement: 0, expectedAgreement: 0, kappa: 0 };
  let agree = 0;
  let aYes = 0;
  let bYes = 0;

  for (let index = 0; index < units; index += 1) {
    if (a[index] === b[index]) agree += 1;
    if (a[index]) aYes += 1;
    if (b[index]) bYes += 1;
  }

  const observedAgreement = agree / units;
  const aNo = units - aYes;
  const bNo = units - bYes;
  const expectedAgreement = ((aYes / units) * (bYes / units)) + ((aNo / units) * (bNo / units));
  const denominator = 1 - expectedAgreement;
  return {
    units,
    observedAgreement,
    expectedAgreement,
    kappa: denominator === 0 ? 1 : (observedAgreement - expectedAgreement) / denominator
  };
}

function krippendorffAlphaNominal(valuesByUnit: Array<Record<string, boolean>>, coders: string[]) {
  // Canonical Krippendorff nominal alpha via the coincidence matrix. Each unit
  // with m>=2 codings contributes its m*(m-1) ordered rating pairs weighted by
  // 1/(m-1); the marginals then drive the sampling-without-replacement expected
  // disagreement (the n(n-1) correction), rather than a plain population p^2
  // approximation. With n = total pairable ratings:
  //   alpha = 1 - (n-1) * sum_{c!=k} o_ck / sum_{c!=k} n_c * n_k
  const coincidence = new Map<string, Map<string, number>>();
  const categories = new Set<string>();
  const addCoincidence = (a: string, b: string, weight: number) => {
    categories.add(a);
    categories.add(b);
    const row = coincidence.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + weight);
    coincidence.set(a, row);
  };

  for (const unit of valuesByUnit) {
    const values = coders
      .map((coder) => unit[coder])
      .filter((value): value is boolean => typeof value === "boolean")
      .map(String);
    const m = values.length;
    if (m < 2) continue;
    const weight = 1 / (m - 1);
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < m; j += 1) {
        if (i !== j) addCoincidence(values[i], values[j], weight);
      }
    }
  }

  const cats = Array.from(categories);
  const marginals = new Map<string, number>();
  let pairableTotal = 0;
  for (const category of cats) {
    const rowSum = cats.reduce((sum, other) => sum + (coincidence.get(category)?.get(other) ?? 0), 0);
    marginals.set(category, rowSum);
    pairableTotal += rowSum;
  }

  // No unit had two or more codings: reliability is undefined, report 0 (no
  // evidence) rather than a spurious perfect score for the claim-readiness gate.
  if (pairableTotal < 2) return 0;

  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  for (const category of cats) {
    for (const other of cats) {
      if (category === other) continue;
      observedDisagreement += coincidence.get(category)?.get(other) ?? 0;
      expectedDisagreement += (marginals.get(category) ?? 0) * (marginals.get(other) ?? 0);
    }
  }

  // Only one category observed: no disagreement is possible, treat as perfect.
  if (expectedDisagreement === 0) return 1;
  return 1 - ((pairableTotal - 1) * observedDisagreement) / expectedDisagreement;
}

function agreementRate(valuesByUnit: Array<Record<string, boolean>>, coders: string[]) {
  let pairs = 0;
  let agreements = 0;
  for (const unit of valuesByUnit) {
    for (let i = 0; i < coders.length; i += 1) {
      for (let j = i + 1; j < coders.length; j += 1) {
        pairs += 1;
        if (unit[coders[i]] === unit[coders[j]]) agreements += 1;
      }
    }
  }
  return pairs === 0 ? 0 : agreements / pairs;
}

function buildCodeDiagnostics(
  items: string[],
  codes: string[],
  coders: string[],
  annotations: SenaCoderAnnotation[]
): SenaCodeReliabilityDiagnostic[] {
  return codes.map((codeId) => {
    const codeUnits = items.map((itemId) => {
      const row: Record<string, boolean> = {};
      for (const coder of coders) {
        row[coder] = annotations.some((annotation) => (
          annotation.coderId === coder &&
          annotation.itemId === itemId &&
          annotation.codeId === codeId &&
          annotation.value
        ));
      }
      return row;
    });
    const disagreementCount = codeUnits.filter((unit) => new Set(Object.values(unit)).size > 1).length;
    const positiveAssignments = codeUnits.reduce((total, unit) => (
      total + Object.values(unit).filter(Boolean).length
    ), 0);
    const coderPositiveRates = Object.fromEntries(coders.map((coder) => [
      coder,
      round(mean(codeUnits.map((unit) => unit[coder] ? 1 : 0)))
    ]));
    const pairwiseCohenKappa: SenaPairwiseKappa[] = [];
    for (let i = 0; i < coders.length; i += 1) {
      for (let j = i + 1; j < coders.length; j += 1) {
        const coderA = coders[i];
        const coderB = coders[j];
        const stats = cohenKappa(codeUnits.map((unit) => unit[coderA]), codeUnits.map((unit) => unit[coderB]));
        pairwiseCohenKappa.push({
          coderA,
          coderB,
          units: stats.units,
          observedAgreement: round(stats.observedAgreement),
          expectedAgreement: round(stats.expectedAgreement),
          kappa: round(stats.kappa)
        });
      }
    }
    return {
      codeId,
      unitCount: codeUnits.length,
      positiveAssignments,
      disagreementCount,
      agreementRate: round(agreementRate(codeUnits, coders)),
      coderPositiveRates,
      pairwiseCohenKappa
    };
  }).sort((a, b) => (
    b.disagreementCount - a.disagreementCount ||
    a.agreementRate - b.agreementRate ||
    a.codeId.localeCompare(b.codeId)
  ));
}

export function buildSenaReliabilityDashboard(annotations: SenaCoderAnnotation[]): SenaReliabilityDashboard {
  const warnings: string[] = [];
  const coders = Array.from(new Set(annotations.map((annotation) => annotation.coderId))).sort();
  const items = Array.from(new Set(annotations.map((annotation) => annotation.itemId))).sort();
  const codes = Array.from(new Set(annotations.map((annotation) => annotation.codeId))).sort();
  const unitKeys = items.flatMap((itemId) => codes.map((codeId) => `${itemId}::${codeId}`));

  if (coders.length < 2) warnings.push("At least two coders are required for reliability statistics.");
  if (items.length === 0 || codes.length === 0) warnings.push("No codable item-code units were available.");

  const valuesByUnit = unitKeys.map((key) => {
    const [itemId, codeId] = key.split("::");
    const row: Record<string, boolean> = {};
    for (const coder of coders) {
      row[coder] = annotations.some((annotation) => (
        annotation.coderId === coder &&
        annotation.itemId === itemId &&
        annotation.codeId === codeId &&
        annotation.value
      ));
    }
    return row;
  });

  const pairwiseCohenKappa: SenaPairwiseKappa[] = [];
  for (let i = 0; i < coders.length; i += 1) {
    for (let j = i + 1; j < coders.length; j += 1) {
      const coderA = coders[i];
      const coderB = coders[j];
      const stats = cohenKappa(valuesByUnit.map((unit) => unit[coderA]), valuesByUnit.map((unit) => unit[coderB]));
      pairwiseCohenKappa.push({
        coderA,
        coderB,
        units: stats.units,
        observedAgreement: round(stats.observedAgreement),
        expectedAgreement: round(stats.expectedAgreement),
        kappa: round(stats.kappa)
      });
    }
  }

  const adjudicationQueue: SenaReliabilityDisagreement[] = [];
  unitKeys.forEach((key, index) => {
    const values = valuesByUnit[index];
    const decisions = new Set(Object.values(values));
    if (decisions.size <= 1) return;
    const [itemId, codeId] = key.split("::");
    adjudicationQueue.push({ itemId, codeId, values });
  });

  const meanPairwiseKappa = round(mean(pairwiseCohenKappa.map((entry) => entry.kappa)));
  const alpha = round(krippendorffAlphaNominal(valuesByUnit, coders));
  const codeDiagnostics = buildCodeDiagnostics(items, codes, coders, annotations);
  const interpretation = coders.length < 2
    ? "Reliability cannot be interpreted until at least two coders are uploaded."
    : meanPairwiseKappa >= 0.8 && alpha >= 0.8
      ? "Reliability evidence is strong enough for the local SENA claim-readiness gate, subject to study-specific review."
      : meanPairwiseKappa >= 0.6 && alpha >= 0.6
        ? "Reliability evidence is moderate; adjudicate disagreements before publication-facing claims."
        : "Reliability evidence needs review before SENA graph patterns are treated as research claims.";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    coderCount: coders.length,
    itemCount: items.length,
    codeCount: codes.length,
    binaryUnitCount: unitKeys.length,
    pairwiseCohenKappa,
    codeDiagnostics,
    meanPairwiseKappa,
    krippendorffAlphaNominal: alpha,
    disagreementCount: adjudicationQueue.length,
    adjudicationQueue: adjudicationQueue.slice(0, 200),
    interpretation,
    warnings
  };
}

export function reliabilityDashboardToReview(
  dashboard: SenaReliabilityDashboard,
  reviewer = "SENA reliability workflow"
): Partial<SenaCodingReliabilityReview> {
  return {
    status: dashboard.coderCount >= 2 && dashboard.binaryUnitCount > 0 ? "documented" : "not-documented",
    reviewer,
    codingScheme: "Uploaded multi-coder annotation file",
    unitOfCoding: "item-code binary units",
    coderCount: dashboard.coderCount,
    agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
    agreementValue: `kappa=${dashboard.meanPairwiseKappa}; alpha=${dashboard.krippendorffAlphaNominal}`,
    adjudicationNotes: `${dashboard.disagreementCount} item-code disagreements require or document adjudication.`,
    limitations: dashboard.interpretation
  };
}
