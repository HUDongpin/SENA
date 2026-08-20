import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { parseSenaCsv, type SenaImportRow } from "./import";
import type {
  SenaCodingReliabilityReview,
  SenaReliabilityClaimEligibility,
  SenaReliabilityEstimationStatus
} from "./types";

export type { SenaReliabilityClaimEligibility, SenaReliabilityEstimationStatus } from "./types";

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
  status: SenaReliabilityEstimationStatus;
  observedAgreement: number | null;
  expectedAgreement: number | null;
  kappa: number | null;
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
  sourceSchemaVersion: typeof SENA_SCHEMA_VERSIONS.codingReliabilityDashboard | typeof SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard;
  status: SenaReliabilityEstimationStatus;
  coderCount: number;
  itemCount: number;
  codeCount: number;
  binaryUnitCount: number;
  pairwiseCohenKappa: SenaPairwiseKappa[];
  codeDiagnostics: SenaCodeReliabilityDiagnostic[];
  meanPairwiseKappaStatus: SenaReliabilityEstimationStatus;
  meanPairwiseKappa: number | null;
  krippendorffAlphaNominalStatus: SenaReliabilityEstimationStatus;
  krippendorffAlphaNominal: number | null;
  claimEligibility: SenaReliabilityClaimEligibility;
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

// An explicitly skipped cell: the coder's row existed but its value cell was
// empty, so the coder recorded no decision for these item-code units. The
// dashboard treats these cells as missing data (excluded from pairable units),
// per Peter's 2026-08-02 delegation of the §4.1 estimator decision.
export type SenaSkippedCoderCell = {
  coderId: string;
  itemId: string;
  codeIds: string[];
};

export function parseCoderAnnotationsFromRows(rows: SenaImportRow[]): {
  annotations: SenaCoderAnnotation[];
  warnings: string[];
  skippedCells: SenaSkippedCoderCell[];
} {
  const warnings: string[] = [];
  const skippedCells: SenaSkippedCoderCell[] = [];
  const annotations = rows.flatMap<SenaCoderAnnotation>((row, index) => {
    const coderId = readAlias(row, ["coder_id", "coder", "rater", "reviewer"]);
    const itemId = readAlias(row, ["item_id", "segment_id", "utterance_id", "unit_id", "stanza_id", "id"]);
    const codes = parseCodes(readAlias(row, ["code_id", "code", "codes", "label", "coding"]));
    const valueEntry = readAliasEntry(row, ["value", "applied", "present", "decision", "score"]);

    if (!coderId || !itemId || codes.length === 0) {
      warnings.push(`coder annotation row ${index + 1} is missing coder, item, or code and was skipped.`);
      return [];
    }

    // A file with no value column is a presence-style export: each row means
    // the coder applied the code. An empty cell in an existing value column —
    // including a ragged row padded by parseSenaCsv — records no decision at
    // all, so it is missing data: never "applied" (the pre-2026-08-01 bug) and
    // never "not applied" (which would fabricate a disagreement). The dashboard
    // excludes these cells from pairable kappa/alpha units.
    if (valueEntry.present && valueEntry.value === "") {
      skippedCells.push({ coderId, itemId, codeIds: codes });
      warnings.push(`coder annotation row ${index + 1} has an empty value cell; it is treated as missing data and excluded from pairable reliability units.`);
      return [];
    }
    const value = valueEntry.present ? parseBoolean(valueEntry.value) : true;

    return codes.map((codeId) => ({ coderId, itemId, codeId, value }));
  });

  return { annotations, warnings, skippedCells };
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

function roundNullable(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function cohenKappa(a: Array<boolean | undefined>, b: Array<boolean | undefined>): Omit<SenaPairwiseKappa, "coderA" | "coderB"> {
  const length = Math.min(a.length, b.length);
  let units = 0;
  let agree = 0;
  let aYes = 0;
  let bYes = 0;

  for (let index = 0; index < length; index += 1) {
    const valueA = a[index];
    const valueB = b[index];
    // Missing cells (explicit empty-value skips) are not pairable: the unit is
    // excluded for this pair rather than scored as a fabricated (dis)agreement.
    if (typeof valueA !== "boolean" || typeof valueB !== "boolean") continue;
    units += 1;
    if (valueA === valueB) agree += 1;
    if (valueA) aYes += 1;
    if (valueB) bYes += 1;
  }

  if (units < 2) {
    return {
      units,
      status: "insufficient-pairable-units",
      observedAgreement: null,
      expectedAgreement: null,
      kappa: null
    };
  }
  const observedAgreement = agree / units;
  const aNo = units - aYes;
  const bNo = units - bYes;
  const expectedAgreement = ((aYes / units) * (bYes / units)) + ((aNo / units) * (bNo / units));
  const denominator = 1 - expectedAgreement;
  if (denominator === 0) {
    return {
      units,
      status: "single-observed-category",
      observedAgreement,
      expectedAgreement,
      kappa: null
    };
  }
  return {
    units,
    status: "estimable",
    observedAgreement,
    expectedAgreement,
    kappa: (observedAgreement - expectedAgreement) / denominator
  };
}

function krippendorffAlphaNominal(
  valuesByUnit: Array<Record<string, boolean>>,
  coders: string[]
): { status: SenaReliabilityEstimationStatus; value: number | null } {
  if (coders.length < 2) return { status: "insufficient-coders", value: null };
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

  let pairableUnits = 0;
  for (const unit of valuesByUnit) {
    const values = coders
      .map((coder) => unit[coder])
      .filter((value): value is boolean => typeof value === "boolean")
      .map(String);
    const m = values.length;
    if (m < 2) continue;
    pairableUnits += 1;
    const weight = 1 / (m - 1);
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < m; j += 1) {
        if (i !== j) addCoincidence(values[i], values[j], weight);
      }
    }
  }

  if (pairableUnits < 2) return { status: "insufficient-pairable-units", value: null };

  const cats = Array.from(categories);
  const marginals = new Map<string, number>();
  let pairableTotal = 0;
  for (const category of cats) {
    const rowSum = cats.reduce((sum, other) => sum + (coincidence.get(category)?.get(other) ?? 0), 0);
    marginals.set(category, rowSum);
    pairableTotal += rowSum;
  }

  if (pairableTotal < 2) return { status: "insufficient-pairable-units", value: null };

  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  for (const category of cats) {
    for (const other of cats) {
      if (category === other) continue;
      observedDisagreement += coincidence.get(category)?.get(other) ?? 0;
      expectedDisagreement += (marginals.get(category) ?? 0) * (marginals.get(other) ?? 0);
    }
  }

  if (expectedDisagreement === 0) return { status: "single-observed-category", value: null };
  return {
    status: "estimable",
    value: 1 - ((pairableTotal - 1) * observedDisagreement) / expectedDisagreement
  };
}

function agreementRate(valuesByUnit: Array<Record<string, boolean>>, coders: string[]) {
  let pairs = 0;
  let agreements = 0;
  for (const unit of valuesByUnit) {
    for (let i = 0; i < coders.length; i += 1) {
      for (let j = i + 1; j < coders.length; j += 1) {
        const valueA = unit[coders[i]];
        const valueB = unit[coders[j]];
        // Missing cells are excluded from the pair universe, mirroring kappa.
        if (typeof valueA !== "boolean" || typeof valueB !== "boolean") continue;
        pairs += 1;
        if (valueA === valueB) agreements += 1;
      }
    }
  }
  return pairs === 0 ? 0 : agreements / pairs;
}

// One row per item-code unit; a coder's key is OMITTED (not false) when their
// only evidence for the unit is an explicitly skipped empty-value cell. A
// recorded decision always beats a skip; an absent row keeps the historical
// not-applied reading (presence semantics for the unit universe).
function buildUnitRows(
  unitKeys: string[],
  coders: string[],
  annotations: SenaCoderAnnotation[],
  missingCells: ReadonlySet<string>
): Array<Record<string, boolean>> {
  return unitKeys.map((key) => {
    const [itemId, codeId] = key.split("::");
    const row: Record<string, boolean> = {};
    for (const coder of coders) {
      let recorded = false;
      let positive = false;
      for (const annotation of annotations) {
        if (annotation.coderId !== coder || annotation.itemId !== itemId || annotation.codeId !== codeId) continue;
        recorded = true;
        if (annotation.value) {
          positive = true;
          break;
        }
      }
      if (!recorded && missingCells.has(`${coder}::${itemId}::${codeId}`)) continue;
      row[coder] = positive;
    }
    return row;
  });
}

function buildMissingCellLookup(skippedCells: SenaSkippedCoderCell[]): Set<string> {
  const lookup = new Set<string>();
  for (const cell of skippedCells) {
    for (const codeId of cell.codeIds) {
      lookup.add(`${cell.coderId}::${cell.itemId}::${codeId}`);
    }
  }
  return lookup;
}

function buildCodeDiagnostics(
  items: string[],
  codes: string[],
  coders: string[],
  annotations: SenaCoderAnnotation[],
  missingCells: ReadonlySet<string>
): SenaCodeReliabilityDiagnostic[] {
  return codes.map((codeId) => {
    const codeUnits = buildUnitRows(items.map((itemId) => `${itemId}::${codeId}`), coders, annotations, missingCells);
    const disagreementCount = codeUnits.filter((unit) => new Set(Object.values(unit)).size > 1).length;
    const positiveAssignments = codeUnits.reduce((total, unit) => (
      total + Object.values(unit).filter(Boolean).length
    ), 0);
    const coderPositiveRates = Object.fromEntries(coders.map((coder) => [
      coder,
      // Positive rate over the coder's recorded cells only; missing cells drop
      // out via mean()'s finite filter instead of deflating the rate as 0s.
      round(mean(codeUnits.map((unit) => typeof unit[coder] === "boolean" ? (unit[coder] ? 1 : 0) : Number.NaN)))
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
          status: stats.status,
          observedAgreement: roundNullable(stats.observedAgreement),
          expectedAgreement: roundNullable(stats.expectedAgreement),
          kappa: roundNullable(stats.kappa)
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

export function buildSenaReliabilityClaimEligibility(input: {
  coderCount: number;
  pairwiseStatuses: SenaReliabilityEstimationStatus[];
  meanPairwiseKappa: number | null;
  krippendorffAlphaNominal: number | null;
  krippendorffAlphaNominalStatus: SenaReliabilityEstimationStatus;
}): SenaReliabilityClaimEligibility {
  const checks = {
    minimumCoders: input.coderCount >= 2,
    allPairwiseKappaEstimable: input.pairwiseStatuses.length > 0 && input.pairwiseStatuses.every((status) => status === "estimable"),
    krippendorffAlphaEstimable: input.krippendorffAlphaNominalStatus === "estimable",
    meanPairwiseKappaAtThreshold: input.meanPairwiseKappa !== null && input.meanPairwiseKappa >= 0.8,
    krippendorffAlphaAtThreshold: input.krippendorffAlphaNominal !== null && input.krippendorffAlphaNominal >= 0.8
  };
  const blockers = [
    checks.minimumCoders ? null : "minimum-two-coders",
    checks.allPairwiseKappaEstimable ? null : "all-pairwise-kappa-estimable",
    checks.krippendorffAlphaEstimable ? null : "krippendorff-alpha-estimable",
    checks.meanPairwiseKappaAtThreshold ? null : "mean-pairwise-kappa-at-least-0.80",
    checks.krippendorffAlphaAtThreshold ? null : "krippendorff-alpha-at-least-0.80"
  ].filter((blocker): blocker is string => blocker !== null);

  return {
    eligible: blockers.length === 0,
    threshold: {
      minimumCoders: 2,
      meanPairwiseKappa: 0.8,
      krippendorffAlphaNominal: 0.8
    },
    checks,
    blockers,
    adjudication: {
      status: "external-not-evaluated",
      disclosure: "Machine eligibility evaluates estimability and score thresholds only; human adjudication coverage and sign-off are external evidence and are not inferred here."
    }
  };
}

function aggregateReliabilityStatus(
  coderCount: number,
  pairwiseStatuses: SenaReliabilityEstimationStatus[],
  alphaStatus: SenaReliabilityEstimationStatus
): SenaReliabilityEstimationStatus {
  if (coderCount < 2) return "insufficient-coders";
  const statuses = [...pairwiseStatuses, alphaStatus];
  if (statuses.some((status) => status === "legacy-ambiguous")) return "legacy-ambiguous";
  if (statuses.some((status) => status === "insufficient-pairable-units")) return "insufficient-pairable-units";
  if (statuses.some((status) => status === "single-observed-category")) return "single-observed-category";
  return statuses.length > 1 && statuses.every((status) => status === "estimable")
    ? "estimable"
    : "insufficient-pairable-units";
}

export function buildSenaReliabilityDashboard(
  annotations: SenaCoderAnnotation[],
  options: { skippedCells?: SenaSkippedCoderCell[] } = {}
): SenaReliabilityDashboard {
  const warnings: string[] = [];
  const skippedCells = options.skippedCells ?? [];
  const missingCells = buildMissingCellLookup(skippedCells);
  const coders = Array.from(new Set(annotations.map((annotation) => annotation.coderId))).sort();
  const items = Array.from(new Set(annotations.map((annotation) => annotation.itemId))).sort();
  const codes = Array.from(new Set(annotations.map((annotation) => annotation.codeId))).sort();
  const unitKeys = items.flatMap((itemId) => codes.map((codeId) => `${itemId}::${codeId}`));

  if (coders.length < 2) warnings.push("At least two coders are required for reliability statistics.");
  if (items.length === 0 || codes.length === 0) warnings.push("No codable item-code units were available.");
  // Count only cells actually excluded: a recorded decision beats a skip, and
  // a skipped cell whose item or code never entered the unit universe excludes
  // nothing. Distinct cells; the per-row warnings disclose each skipped row.
  const recordedCellKeys = new Set(annotations.map((annotation) => `${annotation.coderId}::${annotation.itemId}::${annotation.codeId}`));
  const itemSet = new Set(items);
  const codeSet = new Set(codes);
  const excludedCellCount = Array.from(missingCells).filter((key) => {
    const [, itemId, codeId] = key.split("::");
    return !recordedCellKeys.has(key) && itemSet.has(itemId) && codeSet.has(codeId);
  }).length;
  if (excludedCellCount > 0) {
    warnings.push(`${excludedCellCount} distinct coder cell(s) with an empty value were treated as missing data and excluded from pairable reliability units.`);
  }

  const valuesByUnit = buildUnitRows(unitKeys, coders, annotations, missingCells);

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
        status: stats.status,
        observedAgreement: roundNullable(stats.observedAgreement),
        expectedAgreement: roundNullable(stats.expectedAgreement),
        kappa: roundNullable(stats.kappa)
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

  const unestimablePairCount = pairwiseCohenKappa.filter((entry) => entry.status !== "estimable").length;
  if (unestimablePairCount > 0) {
    warnings.push(`${unestimablePairCount} coder pair(s) were not estimable; their agreement estimates are reported as null with a stable status.`);
  }

  const pairwiseStatuses = pairwiseCohenKappa.map((entry) => entry.status);
  const meanPairwiseKappaStatus: SenaReliabilityEstimationStatus = coders.length < 2
    ? "insufficient-coders"
    : pairwiseStatuses.length === 0 || pairwiseStatuses.some((status) => status === "insufficient-pairable-units")
      ? "insufficient-pairable-units"
      : pairwiseStatuses.some((status) => status === "single-observed-category")
        ? "single-observed-category"
        : pairwiseStatuses.every((status) => status === "estimable")
          ? "estimable"
          : "legacy-ambiguous";
  const estimablePairwiseKappas = pairwiseCohenKappa
    .map((entry) => entry.kappa)
    .filter((value): value is number => value !== null);
  const meanPairwiseKappa = meanPairwiseKappaStatus === "estimable"
    ? round(mean(estimablePairwiseKappas))
    : null;
  const alphaEstimate = krippendorffAlphaNominal(valuesByUnit, coders);
  const alpha = roundNullable(alphaEstimate.value);
  if (alphaEstimate.status !== "estimable") {
    warnings.push(`Krippendorff alpha was not estimable (${alphaEstimate.status}); the score is reported as null.`);
  }
  const claimEligibility = buildSenaReliabilityClaimEligibility({
    coderCount: coders.length,
    pairwiseStatuses,
    meanPairwiseKappa,
    krippendorffAlphaNominal: alpha,
    krippendorffAlphaNominalStatus: alphaEstimate.status
  });
  const status = aggregateReliabilityStatus(coders.length, pairwiseStatuses, alphaEstimate.status);
  const codeDiagnostics = buildCodeDiagnostics(items, codes, coders, annotations, missingCells);
  const interpretation = coders.length < 2
    ? "Reliability cannot be interpreted until at least two coders are uploaded."
    : claimEligibility.eligible
      ? "The machine reliability thresholds are met; human adjudication coverage and study-specific sign-off remain external evidence."
      : meanPairwiseKappa !== null && alpha !== null && meanPairwiseKappa >= 0.6 && alpha >= 0.6
        ? "Reliability evidence is moderate; adjudicate disagreements before publication-facing claims."
        : status === "estimable"
          ? "Reliability evidence needs review before SENA graph patterns are treated as research claims."
          : `Reliability is not estimable (${status}); do not substitute a zero or perfect score.`;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    sourceSchemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    status,
    coderCount: coders.length,
    itemCount: items.length,
    codeCount: codes.length,
    binaryUnitCount: unitKeys.length,
    pairwiseCohenKappa,
    codeDiagnostics,
    meanPairwiseKappaStatus,
    meanPairwiseKappa,
    krippendorffAlphaNominalStatus: alphaEstimate.status,
    krippendorffAlphaNominal: alpha,
    claimEligibility,
    disagreementCount: adjudicationQueue.length,
    adjudicationQueue: adjudicationQueue.slice(0, 200),
    interpretation,
    warnings
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLegacyPairwiseKappa(value: unknown): SenaPairwiseKappa {
  const pair = isRecord(value) ? value : {};
  return {
    coderA: typeof pair.coderA === "string" ? pair.coderA : "unknown-coder-a",
    coderB: typeof pair.coderB === "string" ? pair.coderB : "unknown-coder-b",
    units: typeof pair.units === "number" && Number.isFinite(pair.units) ? Math.max(0, Math.trunc(pair.units)) : 0,
    status: "legacy-ambiguous",
    observedAgreement: finiteOrNull(pair.observedAgreement),
    expectedAgreement: finiteOrNull(pair.expectedAgreement),
    kappa: finiteOrNull(pair.kappa)
  };
}

export function isCurrentSenaReliabilityDashboard(value: unknown): value is SenaReliabilityDashboard {
  return isRecord(value) && value.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard;
}

export function normalizeSenaReliabilityDashboard(value: unknown): SenaReliabilityDashboard {
  if (!isRecord(value)) throw new Error("SENA reliability dashboard must be an object.");
  if (isCurrentSenaReliabilityDashboard(value)) {
    return {
      ...value,
      sourceSchemaVersion: value.sourceSchemaVersion ?? SENA_SCHEMA_VERSIONS.codingReliabilityDashboard
    };
  }
  if (value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard) {
    throw new Error("SENA reliability dashboard uses an unsupported schemaVersion.");
  }

  const legacy = value as unknown as SenaReliabilityDashboard;
  const pairwiseCohenKappa = Array.isArray(value.pairwiseCohenKappa)
    ? value.pairwiseCohenKappa.map(normalizeLegacyPairwiseKappa)
    : [];
  const codeDiagnostics = Array.isArray(value.codeDiagnostics)
    ? value.codeDiagnostics.filter(isRecord).map((diagnostic) => ({
      ...diagnostic,
      pairwiseCohenKappa: Array.isArray(diagnostic.pairwiseCohenKappa)
        ? diagnostic.pairwiseCohenKappa.map(normalizeLegacyPairwiseKappa)
        : []
    })) as SenaCodeReliabilityDiagnostic[]
    : [];
  const meanPairwiseKappa = finiteOrNull(value.meanPairwiseKappa);
  const alpha = finiteOrNull(value.krippendorffAlphaNominal);
  const legacyEligibility = buildSenaReliabilityClaimEligibility({
    coderCount: typeof value.coderCount === "number" ? value.coderCount : 0,
    pairwiseStatuses: pairwiseCohenKappa.map(() => "legacy-ambiguous"),
    meanPairwiseKappa,
    krippendorffAlphaNominal: alpha,
    krippendorffAlphaNominalStatus: "legacy-ambiguous"
  });

  return {
    ...legacy,
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    sourceSchemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard,
    status: "legacy-ambiguous",
    pairwiseCohenKappa,
    codeDiagnostics,
    meanPairwiseKappaStatus: "legacy-ambiguous",
    meanPairwiseKappa,
    krippendorffAlphaNominalStatus: "legacy-ambiguous",
    krippendorffAlphaNominal: alpha,
    claimEligibility: {
      ...legacyEligibility,
      eligible: false,
      blockers: Array.from(new Set(["current-v2-estimates-required", ...legacyEligibility.blockers]))
    },
    warnings: [
      ...(Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string") : []),
      "Legacy v1 reliability scores use ambiguous degenerate-case conventions and are not eligible under the v2 machine gate."
    ]
  };
}

export function reliabilityDashboardToReview(
  dashboard: SenaReliabilityDashboard,
  reviewer = "SENA reliability workflow"
): Partial<SenaCodingReliabilityReview> {
  const formatEstimate = (value: number | null, status: SenaReliabilityEstimationStatus) => (
    value === null ? `not estimable (${status})` : String(value)
  );
  return {
    status: dashboard.coderCount >= 2 && dashboard.binaryUnitCount > 0 ? "documented" : "not-documented",
    reviewer,
    codingScheme: "Uploaded multi-coder annotation file",
    unitOfCoding: "item-code binary units",
    coderCount: dashboard.coderCount,
    agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
    agreementValue: `kappa=${formatEstimate(dashboard.meanPairwiseKappa, dashboard.meanPairwiseKappaStatus)}; alpha=${formatEstimate(dashboard.krippendorffAlphaNominal, dashboard.krippendorffAlphaNominalStatus)}`,
    adjudicationNotes: `${dashboard.disagreementCount} item-code disagreements require or document adjudication.`,
    limitations: dashboard.interpretation,
    machineEvidence: {
      dashboardSchemaVersion: dashboard.schemaVersion,
      sourceSchemaVersion: dashboard.sourceSchemaVersion,
      status: dashboard.status,
      meanPairwiseKappaStatus: dashboard.meanPairwiseKappaStatus,
      meanPairwiseKappa: dashboard.meanPairwiseKappa,
      krippendorffAlphaNominalStatus: dashboard.krippendorffAlphaNominalStatus,
      krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
      allPairwiseKappaEstimable: dashboard.pairwiseCohenKappa.length > 0 && dashboard.pairwiseCohenKappa.every((pair) => pair.status === "estimable"),
      claimEligibility: dashboard.claimEligibility
    }
  };
}
