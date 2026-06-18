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
  schemaVersion: "sena-coding-reliability-dashboard/v1";
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

function readAlias(row: SenaImportRow, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = entries.find(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedAlias);
    if (found) return scalar(found[1]);
  }
  return "";
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return !["0", "false", "no", "n", "absent", "none"].includes(normalized);
}

function parseCodes(value: string) {
  return value.split(/[|;,]/).map((code) => code.trim()).filter(Boolean);
}

export function parseCoderAnnotationsFromRows(rows: SenaImportRow[]): { annotations: SenaCoderAnnotation[]; warnings: string[] } {
  const warnings: string[] = [];
  const annotations = rows.flatMap<SenaCoderAnnotation>((row, index) => {
    const coderId = readAlias(row, ["coder_id", "coder", "rater", "reviewer"]);
    const itemId = readAlias(row, ["item_id", "segment_id", "utterance_id", "unit_id", "stanza_id", "id"]);
    const codes = parseCodes(readAlias(row, ["code_id", "code", "codes", "label", "coding"]));
    const value = parseBoolean(readAlias(row, ["value", "applied", "present", "decision", "score"]));

    if (!coderId || !itemId || codes.length === 0) {
      warnings.push(`coder annotation row ${index + 1} is missing coder, item, or code and was skipped.`);
      return [];
    }

    return codes.map((codeId) => ({ coderId, itemId, codeId, value }));
  });

  return { annotations, warnings };
}

export function parseCoderAnnotationsCsv(text: string) {
  return parseCoderAnnotationsFromRows(parseSenaCsv(text).rows);
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
  let observedPairs = 0;
  let observedDisagreements = 0;
  const categoryCounts = new Map<string, number>();

  for (const unit of valuesByUnit) {
    const values = coders.map((coder) => unit[coder]).filter((value): value is boolean => typeof value === "boolean");
    values.forEach((value) => categoryCounts.set(String(value), (categoryCounts.get(String(value)) ?? 0) + 1));
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        observedPairs += 1;
        if (values[i] !== values[j]) observedDisagreements += 1;
      }
    }
  }

  if (observedPairs === 0) return 0;
  const observed = observedDisagreements / observedPairs;
  const total = Array.from(categoryCounts.values()).reduce((sum, count) => sum + count, 0);
  if (total <= 1) return 1;
  const expected = 1 - Array.from(categoryCounts.values()).reduce((sum, count) => {
    const probability = count / total;
    return sum + probability * probability;
  }, 0);
  return expected === 0 ? 1 : 1 - observed / expected;
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
    schemaVersion: "sena-coding-reliability-dashboard/v1",
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
