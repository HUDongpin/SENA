import type { SenaBuildOptions } from "./types";

export type SenaInputValidationRule =
  | "finite-nonnegative"
  | "finite-probability"
  | "positive-finite"
  | "finite"
  | "finite-range"
  | "integer-range"
  | "supported-value"
  | "object"
  | "array"
  | "nonempty-array"
  | "array-range"
  | "nonempty-string"
  | "canonical-string"
  | "distinct-values"
  | "boolean"
  | "consistent-direction"
  | "matrix-shape"
  | "reference"
  | "count-match";

export type SenaInputValidationIssue = {
  path: string;
  rule: SenaInputValidationRule;
};

export const SENA_INPUT_VALIDATION_MAX_ISSUES = 1_000;

function appendSenaInputValidationIssue(
  issues: SenaInputValidationIssue[],
  issue: SenaInputValidationIssue
) {
  if (issues.length < SENA_INPUT_VALIDATION_MAX_ISSUES) issues.push(issue);
}

function appendSenaInputValidationIssues(
  issues: SenaInputValidationIssue[],
  candidates: readonly SenaInputValidationIssue[]
) {
  for (const issue of candidates) {
    if (issues.length >= SENA_INPUT_VALIDATION_MAX_ISSUES) return;
    appendSenaInputValidationIssue(issues, issue);
  }
}

export class SenaInputValidationError extends Error {
  readonly issues: SenaInputValidationIssue[];

  constructor(issues: SenaInputValidationIssue[], options: { messagePathPrefix?: string } = {}) {
    const boundedIssues = issues.slice(0, SENA_INPUT_VALIDATION_MAX_ISSUES);
    const displayIssue = (issue: SenaInputValidationIssue) => {
      const path = `${options.messagePathPrefix ?? ""}${issue.path}`;
      return issue.rule === "supported-value"
        ? `${path} is not supported (${issue.rule})`
        : `${path} (${issue.rule})`;
    };
    super(`Invalid SENA analytical inputs: ${boundedIssues.map(displayIssue).join(", ")}.`);
    this.name = "SenaInputValidationError";
    this.issues = boundedIssues.map((issue) => ({ ...issue }));
  }
}

export const SENA_CANONICAL_UINT32_MAX = 0xffffffff;

export type SenaFusionAdjacencyValidationInput = {
  S: unknown;
  W: unknown;
  B: unknown;
  Bcp?: unknown;
  alpha: unknown;
  beta: unknown;
  gamma: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneOf(value: unknown, values: readonly unknown[]) {
  return values.includes(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSenaDatasetContractIssues(
  value: unknown,
  path: string,
  issues: SenaInputValidationIssue[]
) {
  const add = (issuePath: string, rule: SenaInputValidationRule) => {
    appendSenaInputValidationIssue(issues, { path: issuePath, rule });
  };
  if (!isRecord(value)) {
    add(path, "object");
    return;
  }

  const table = (name: "people" | "interactions" | "utterances" | "coded_segments" | "codebook") => {
    const candidate = value[name];
    if (!Array.isArray(candidate)) {
      add(`${path}.${name}`, "array");
      return [] as unknown[];
    }
    return candidate;
  };
  const people = table("people");
  const interactions = table("interactions");
  const utterances = table("utterances");
  const codedSegments = table("coded_segments");
  const codebook = table("codebook");

  const requiredString = (record: Record<string, unknown>, field: string, rowPath: string) => {
    if (!isNonemptyString(record[field])) add(`${rowPath}.${field}`, "nonempty-string");
  };
  const optionalString = (record: Record<string, unknown>, field: string, rowPath: string) => {
    if (record[field] !== undefined && !isNonemptyString(record[field])) add(`${rowPath}.${field}`, "nonempty-string");
  };
  const canonicalString = (value: unknown, valuePath: string) => {
    if (isNonemptyString(value) && value !== value.trim()) add(valuePath, "canonical-string");
  };
  const canonicalField = (record: Record<string, unknown>, field: string, rowPath: string) => {
    canonicalString(record[field], `${rowPath}.${field}`);
  };
  const integer = (record: Record<string, unknown>, field: string, rowPath: string, optional = false) => {
    if (optional && record[field] === undefined) return;
    if (!Number.isSafeInteger(record[field]) || (record[field] as number) < 0) {
      add(`${rowPath}.${field}`, "integer-range");
    }
  };
  const registerId = (
    record: Record<string, unknown>,
    field: string,
    rowPath: string,
    seen: Set<string>
  ) => {
    requiredString(record, field, rowPath);
    if (!isNonemptyString(record[field])) return;
    canonicalField(record, field, rowPath);
    const id = (record[field] as string).trim();
    if (seen.has(id)) add(`${rowPath}.${field}`, "distinct-values");
    seen.add(id);
  };

  const personIds = new Set<string>();
  people.forEach((row, index) => {
    const rowPath = `${path}.people[${index}]`;
    if (!isRecord(row)) {
      add(rowPath, "object");
      return;
    }
    registerId(row, "id", rowPath, personIds);
    for (const field of ["label", "role", "group"]) requiredString(row, field, rowPath);
    optionalString(row, "initials", rowPath);
    if (row.actorType !== undefined && !isOneOf(row.actorType, ["human", "ai_agent"])) {
      add(`${rowPath}.actorType`, "supported-value");
    }
  });

  const codeIds = new Set<string>();
  codebook.forEach((row, index) => {
    const rowPath = `${path}.codebook[${index}]`;
    if (!isRecord(row)) {
      add(rowPath, "object");
      return;
    }
    registerId(row, "id", rowPath, codeIds);
    for (const field of ["label", "family", "description", "color"]) requiredString(row, field, rowPath);
  });

  const utteranceIds = new Set<string>();
  utterances.forEach((row, index) => {
    const rowPath = `${path}.utterances[${index}]`;
    if (!isRecord(row)) {
      add(rowPath, "object");
      return;
    }
    registerId(row, "id", rowPath, utteranceIds);
    for (const field of ["personId", "unitId", "stanzaId", "stage", "text"]) requiredString(row, field, rowPath);
    optionalString(row, "timestamp", rowPath);
    integer(row, "turnIndex", rowPath);
  });

  const segmentIds = new Set<string>();
  codedSegments.forEach((row, index) => {
    const rowPath = `${path}.coded_segments[${index}]`;
    if (!isRecord(row)) {
      add(rowPath, "object");
      return;
    }
    registerId(row, "segmentId", rowPath, segmentIds);
    if (isNonemptyString(row.segmentId) && utteranceIds.has(row.segmentId.trim())) {
      add(`${rowPath}.segmentId`, "distinct-values");
    }
    for (const field of ["utteranceId", "personId", "unitId", "stanzaId", "stage", "text"]) {
      requiredString(row, field, rowPath);
    }
    integer(row, "turnIndex", rowPath);
    if (!Array.isArray(row.codes)) {
      add(`${rowPath}.codes`, "array");
    } else {
      if (row.codes.length === 0) add(`${rowPath}.codes`, "nonempty-array");
      const seenCodes = new Set<string>();
      row.codes.forEach((code, codeIndex) => {
        const codePath = `${rowPath}.codes[${codeIndex}]`;
        if (!isNonemptyString(code)) {
          add(codePath, "nonempty-string");
          return;
        }
        canonicalString(code, codePath);
        const codeId = code.trim();
        if (seenCodes.has(codeId)) add(codePath, "distinct-values");
        seenCodes.add(codeId);
      });
    }
    if (row.targetPersonIds !== undefined) {
      if (!Array.isArray(row.targetPersonIds)) {
        add(`${rowPath}.targetPersonIds`, "array");
      } else {
        const seenTargets = new Set<string>();
        row.targetPersonIds.forEach((target, targetIndex) => {
          const targetPath = `${rowPath}.targetPersonIds[${targetIndex}]`;
          if (!isNonemptyString(target)) {
            add(targetPath, "nonempty-string");
            return;
          }
          canonicalString(target, targetPath);
          const targetId = target.trim();
          if (seenTargets.has(targetId)) add(targetPath, "distinct-values");
          seenTargets.add(targetId);
        });
      }
    }
    if (row.confidence !== undefined &&
      (!isFiniteNumber(row.confidence) || row.confidence < 0 || row.confidence > 1)) {
      add(`${rowPath}.confidence`, "finite-probability");
    }
  });

  interactions.forEach((row, index) => {
    const rowPath = `${path}.interactions[${index}]`;
    if (!isRecord(row)) {
      add(rowPath, "object");
      return;
    }
    for (const field of ["source", "target", "channel", "stage", "evidence"]) requiredString(row, field, rowPath);
    for (const field of ["source", "target"]) canonicalField(row, field, rowPath);
    integer(row, "turnIndex", rowPath, true);
    if (row.weight !== undefined && (!isFiniteNumber(row.weight) || row.weight < 0)) {
      add(`${rowPath}.weight`, "finite-nonnegative");
    }
  });

  interactions.forEach((row, index) => {
    if (!isRecord(row)) return;
    // ADR-0010: a source is contribution-shaped and must resolve to the
    // authoritative roster; a target is a claim about an actor. Import keeps a
    // dangling target so it can disclose the excluded tie, while the runtime
    // drops it from S. Persisted snapshots must preserve that evidence instead
    // of becoming impossible to restore.
    if (isNonemptyString(row.source) && !personIds.has(row.source.trim())) {
      add(`${path}.interactions[${index}].source`, "reference");
    }
  });
  utterances.forEach((row, index) => {
    if (isRecord(row)) canonicalField(row, "personId", `${path}.utterances[${index}]`);
    if (isRecord(row) && isNonemptyString(row.personId) && !personIds.has(row.personId.trim())) {
      add(`${path}.utterances[${index}].personId`, "reference");
    }
  });
  codedSegments.forEach((row, index) => {
    if (!isRecord(row)) return;
    const rowPath = `${path}.coded_segments[${index}]`;
    for (const field of ["utteranceId", "personId"]) canonicalField(row, field, rowPath);
    if (isNonemptyString(row.utteranceId) && !utteranceIds.has(row.utteranceId.trim())) {
      add(`${rowPath}.utteranceId`, "reference");
    }
    if (isNonemptyString(row.personId) && !personIds.has(row.personId.trim())) {
      add(`${rowPath}.personId`, "reference");
    }
    if (Array.isArray(row.targetPersonIds)) {
      row.targetPersonIds.forEach((target, targetIndex) => {
        canonicalString(target, `${rowPath}.targetPersonIds[${targetIndex}]`);
      });
    }
    if (Array.isArray(row.codes)) {
      row.codes.forEach((code, codeIndex) => {
        canonicalString(code, `${rowPath}.codes[${codeIndex}]`);
        if (isNonemptyString(code) && !codeIds.has(code.trim())) {
          add(`${rowPath}.codes[${codeIndex}]`, "reference");
        }
      });
    }
  });

  if (value.warnings !== undefined) {
    if (!Array.isArray(value.warnings)) {
      add(`${path}.warnings`, "array");
    } else {
      value.warnings.forEach((warning, index) => {
        if (!isNonemptyString(warning)) add(`${path}.warnings[${index}]`, "nonempty-string");
      });
    }
  }
}

function collectSenaSnapshotSourceIssues(
  sourceValue: unknown,
  authoritativeDatasetValue: unknown,
  issues: SenaInputValidationIssue[]
) {
  const add = (path: string, rule: SenaInputValidationRule) => {
    appendSenaInputValidationIssue(issues, { path, rule });
  };
  if (!isRecord(sourceValue)) {
    add("source", "object");
    return;
  }
  const dataset = isRecord(authoritativeDatasetValue) ? authoritativeDatasetValue : undefined;
  const counts = sourceValue.sourceDatasetCounts;
  const countFields = [
    ["people", "people"],
    ["interactions", "interactions"],
    ["utterances", "utterances"],
    ["codedSegments", "coded_segments"],
    ["codes", "codebook"]
  ] as const;
  if (!isRecord(counts)) {
    add("source.sourceDatasetCounts", "object");
  } else {
    for (const [countField, tableField] of countFields) {
      const count = counts[countField];
      const countPath = `source.sourceDatasetCounts.${countField}`;
      if (!Number.isSafeInteger(count) || (count as number) < 0) {
        add(countPath, "integer-range");
      } else if (dataset && Array.isArray(dataset[tableField]) && count !== dataset[tableField].length) {
        add(countPath, "count-match");
      }
    }
  }

  const window = sourceValue.activeTemporalWindow;
  if (window === null) return;
  if (!isRecord(window)) {
    add("source.activeTemporalWindow", "object");
    return;
  }
  for (const field of ["id", "label"]) {
    if (!isNonemptyString(window[field])) add(`source.activeTemporalWindow.${field}`, "nonempty-string");
  }
  if (!isOneOf(window.mode, ["stage", "moving-window", "turn-window"])) {
    add("source.activeTemporalWindow.mode", "supported-value");
  }
  for (const field of ["index", "startTurn", "endTurn", "interactionCount", "segmentCount"]) {
    if (!Number.isSafeInteger(window[field]) || (window[field] as number) < 0) {
      add(`source.activeTemporalWindow.${field}`, "integer-range");
    }
  }
  if (window.centerTurn !== undefined &&
    (!Number.isSafeInteger(window.centerTurn) || (window.centerTurn as number) < 0)) {
    add("source.activeTemporalWindow.centerTurn", "integer-range");
  }
  if (Number.isSafeInteger(window.startTurn) && Number.isSafeInteger(window.endTurn) &&
    (window.startTurn as number) > (window.endTurn as number)) {
    add("source.activeTemporalWindow.endTurn", "finite-range");
  }
  if (Number.isSafeInteger(window.centerTurn) && Number.isSafeInteger(window.startTurn) &&
    Number.isSafeInteger(window.endTurn) &&
    ((window.centerTurn as number) < (window.startTurn as number) ||
      (window.centerTurn as number) > (window.endTurn as number))) {
    add("source.activeTemporalWindow.centerTurn", "finite-range");
  }

  const referenceIds = {
    utteranceIds: new Set(
      Array.isArray(dataset?.utterances)
        ? dataset.utterances.flatMap((row) => isRecord(row) && isNonemptyString(row.id) ? [row.id.trim()] : [])
        : []
    ),
    segmentIds: new Set(
      Array.isArray(dataset?.coded_segments)
        ? dataset.coded_segments.flatMap((row) => isRecord(row) && isNonemptyString(row.segmentId) ? [row.segmentId.trim()] : [])
        : []
    )
  };
  for (const field of ["stages", "utteranceIds", "segmentIds"] as const) {
    if (!Array.isArray(window[field])) {
      add(`source.activeTemporalWindow.${field}`, "array");
      continue;
    }
    const seen = new Set<string>();
    window[field].forEach((entry, index) => {
      const entryPath = `source.activeTemporalWindow.${field}[${index}]`;
      if (!isNonemptyString(entry)) {
        add(entryPath, "nonempty-string");
        return;
      }
      if (entry !== entry.trim()) add(entryPath, "canonical-string");
      const id = entry.trim();
      if (seen.has(id)) add(entryPath, "distinct-values");
      seen.add(id);
      if (field !== "stages" && !referenceIds[field].has(id)) add(entryPath, "reference");
    });
  }
  if (Array.isArray(window.segmentIds) && Number.isSafeInteger(window.segmentCount) &&
    window.segmentCount !== window.segmentIds.length) {
    add("source.activeTemporalWindow.segmentCount", "count-match");
  }

  for (const field of ["rawSocialConnectivity", "rawConceptConnectivity", "rawBridgeIntegration"]) {
    if (!isFiniteNumber(window[field]) || (window[field] as number) < 0) {
      add(`source.activeTemporalWindow.${field}`, "finite-nonnegative");
    }
  }
  for (const field of ["socialConnectivity", "conceptConnectivity", "bridgeIntegration"]) {
    if (!isFiniteNumber(window[field]) || (window[field] as number) < 0 || (window[field] as number) > 1) {
      add(`source.activeTemporalWindow.${field}`, "finite-range");
    }
  }
  if (!Array.isArray(window.evidence)) add("source.activeTemporalWindow.evidence", "array");
  if (!Array.isArray(window.topCodes)) {
    add("source.activeTemporalWindow.topCodes", "array");
  } else {
    window.topCodes.forEach((entry, index) => {
      const entryPath = `source.activeTemporalWindow.topCodes[${index}]`;
      if (!isRecord(entry)) {
        add(entryPath, "object");
        return;
      }
      for (const field of ["id", "label"]) {
        if (!isNonemptyString(entry[field])) add(`${entryPath}.${field}`, "nonempty-string");
      }
      if (!isFiniteNumber(entry.weight) || entry.weight < 0) add(`${entryPath}.weight`, "finite-nonnegative");
    });
  }
}

function deduplicatedIssues(issues: SenaInputValidationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Strict project-snapshot input boundary. Contribution-shaped references must
 * resolve, while target-shaped claims remain restorable when ADR-0006/0010
 * import semantics deliberately preserve them for disclosure and let the
 * runtime exclude them from S/B_CP. Canonical strings prevent trim-dependent
 * runtime scoping from changing the represented window.
 */
export function validateSenaProjectSnapshotCanonicalInputs(input: {
  dataset: unknown;
  source: unknown;
  buildOptions: unknown;
}): void {
  const issues: SenaInputValidationIssue[] = [];
  try {
    validateSenaAnalyticalInputs({ dataset: input.dataset, buildOptions: input.buildOptions });
  } catch (error) {
    if (!(error instanceof SenaInputValidationError)) throw error;
    appendSenaInputValidationIssues(issues, error.issues);
  }
  collectSenaDatasetContractIssues(input.dataset, "dataset", issues);

  const source = isRecord(input.source) ? input.source : undefined;
  const authoritativeDataset = source?.sourceDataset ?? input.dataset;
  if (source?.sourceDataset !== undefined) {
    try {
      validateSenaAnalyticalInputs({ dataset: source.sourceDataset, buildOptions: input.buildOptions });
    } catch (error) {
      if (!(error instanceof SenaInputValidationError)) throw error;
      for (const issue of error.issues) {
        if (issues.length >= SENA_INPUT_VALIDATION_MAX_ISSUES) break;
        appendSenaInputValidationIssue(issues, {
          ...issue,
          path: issue.path.startsWith("dataset")
            ? `source.sourceDataset${issue.path.slice("dataset".length)}`
            : issue.path
        });
      }
    }
    collectSenaDatasetContractIssues(source.sourceDataset, "source.sourceDataset", issues);
  }
  collectSenaSnapshotSourceIssues(input.source, authoritativeDataset, issues);
  const deduplicated = deduplicatedIssues(issues);
  if (deduplicated.length > 0) {
    throw new SenaInputValidationError(deduplicated, { messagePathPrefix: "project snapshot." });
  }
}

function collectFiniteNonnegativeMatrixIssues(
  value: unknown,
  path: "S" | "W" | "B_PC" | "B_CP",
  rows: number,
  columns: number,
  issues: SenaInputValidationIssue[]
) {
  if (
    !Array.isArray(value) ||
    value.length !== rows ||
    value.some((row) => !Array.isArray(row) || row.length !== columns)
  ) {
    appendSenaInputValidationIssue(issues, { path, rule: "matrix-shape" });
  }
  if (!Array.isArray(value)) return;
  value.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, columnIndex) => {
      if (!isFiniteNumber(cell) || cell < 0) {
        appendSenaInputValidationIssue(issues, {
          path: `${path}[${rowIndex}][${columnIndex}]`,
          rule: "finite-nonnegative"
        });
      }
    });
  });
}

export function validateSenaFusionAdjacencyInputs(input: SenaFusionAdjacencyValidationInput): void {
  const issues: SenaInputValidationIssue[] = [];
  const peopleCount = Array.isArray(input.S) ? input.S.length : 0;
  const codeCount = Array.isArray(input.W) ? input.W.length : 0;
  collectFiniteNonnegativeMatrixIssues(input.S, "S", peopleCount, peopleCount, issues);
  collectFiniteNonnegativeMatrixIssues(input.W, "W", codeCount, codeCount, issues);
  collectFiniteNonnegativeMatrixIssues(input.B, "B_PC", peopleCount, codeCount, issues);
  if (input.Bcp !== undefined) {
    collectFiniteNonnegativeMatrixIssues(input.Bcp, "B_CP", codeCount, peopleCount, issues);
  }
  for (const field of ["alpha", "beta", "gamma"] as const) {
    const value = input[field];
    if (!isFiniteNumber(value) || value < 0) {
      appendSenaInputValidationIssue(issues, { path: field, rule: "finite-nonnegative" });
    }
  }
  if (issues.length > 0) throw new SenaInputValidationError(issues);
}

export const SENA_GROUP_COMPARISON_METRICS = [
  "bridgeScore",
  "epistemicContribution",
  "epistemicDiversity",
  "socialStrength",
  "socialDegree",
  "conceptBrokerage",
  "alignment"
] as const;

export const SENA_GROUP_COMPARISON_MIN_ITERATIONS = 100;
export const SENA_GROUP_COMPARISON_MAX_ITERATIONS = 10_000;
export const SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS = 40;

export type SenaValidatedGroupComparisonMetric = typeof SENA_GROUP_COMPARISON_METRICS[number];

function validateGroupComparisonControls(
  value: unknown,
  add: (path: string, rule: SenaInputValidationRule) => void
) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    add("groupComparison", "object");
    return;
  }
  const controls = value as Record<string, unknown>;
  const validateGroupField = (candidate: unknown, path: string) => {
    if (candidate !== undefined && !isOneOf(candidate, ["group", "role"])) add(path, "supported-value");
  };
  const validateMetric = (candidate: unknown, path: string) => {
    if (candidate !== undefined && !isOneOf(candidate, SENA_GROUP_COMPARISON_METRICS)) add(path, "supported-value");
  };
  const validateGroupPair = (record: Record<string, unknown>, prefix: string, required: boolean) => {
    if ((required || record.groupA !== undefined) && !isNonemptyString(record.groupA)) {
      add(`${prefix}groupA`, "nonempty-string");
    }
    if ((required || record.groupB !== undefined) && !isNonemptyString(record.groupB)) {
      add(`${prefix}groupB`, "nonempty-string");
    }
    if (
      isNonemptyString(record.groupA) &&
      isNonemptyString(record.groupB) &&
      record.groupA.trim() === record.groupB.trim()
    ) {
      add(`${prefix}groupB`, "distinct-values");
    }
  };
  const validateIntegerRange = (candidate: unknown, path: string, minimum: number, maximum: number) => {
    if (
      candidate !== undefined &&
      (!Number.isSafeInteger(candidate) || (candidate as number) < minimum || (candidate as number) > maximum)
    ) {
      add(path, "integer-range");
    }
  };

  validateGroupField(controls.groupField, "groupField");
  validateGroupField(controls.defaultGroupField, "defaultGroupField");
  validateMetric(controls.metric, "metric");
  validateMetric(controls.defaultMetric, "defaultMetric");
  if (controls.suite !== undefined && typeof controls.suite !== "boolean") add("suite", "boolean");

  if (controls.metrics !== undefined) {
    if (!Array.isArray(controls.metrics)) {
      add("metrics", "array");
    } else {
      if (controls.metrics.length === 0) add("metrics", "nonempty-array");
      controls.metrics.forEach((metric, index) => validateMetric(metric, `metrics[${index}]`));
    }
  }

  if (controls.comparisons === undefined) {
    validateGroupPair(controls, "", true);
  } else if (!Array.isArray(controls.comparisons)) {
    add("comparisons", "array");
  } else {
    if (controls.comparisons.length === 0) add("comparisons", "nonempty-array");
    if (controls.comparisons.length > SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS) {
      add("comparisons", "array-range");
    }
    controls.comparisons.forEach((comparison, index) => {
      const path = `comparisons[${index}]`;
      if (typeof comparison !== "object" || comparison === null || Array.isArray(comparison)) {
        add(path, "object");
        return;
      }
      const record = comparison as Record<string, unknown>;
      validateGroupPair(record, `${path}.`, true);
      validateGroupField(record.groupField, `${path}.groupField`);
      validateMetric(record.metric, `${path}.metric`);
    });
  }

  validateIntegerRange(
    controls.iterations,
    "iterations",
    SENA_GROUP_COMPARISON_MIN_ITERATIONS,
    SENA_GROUP_COMPARISON_MAX_ITERATIONS
  );
  validateIntegerRange(
    controls.bootstrapIterations,
    "bootstrapIterations",
    SENA_GROUP_COMPARISON_MIN_ITERATIONS,
    SENA_GROUP_COMPARISON_MAX_ITERATIONS
  );
  validateIntegerRange(controls.seed, "seed", 0, SENA_CANONICAL_UINT32_MAX);
  if (
    controls.alpha !== undefined &&
    (!isFiniteNumber(controls.alpha) || controls.alpha < 0.001 || controls.alpha > 0.5)
  ) {
    add("alpha", "finite-range");
  }
}

export function validateSenaAnalyticalInputs(input: {
  dataset?: unknown;
  buildOptions?: Partial<SenaBuildOptions> | unknown;
  groupComparison?: unknown;
}): void {
  const issues: SenaInputValidationIssue[] = [];
  const add = (path: string, rule: SenaInputValidationRule) => {
    appendSenaInputValidationIssue(issues, { path, rule });
  };
  const options = typeof input.buildOptions === "object" && input.buildOptions !== null && !Array.isArray(input.buildOptions)
    ? input.buildOptions as Partial<SenaBuildOptions>
    : undefined;

  if (input.buildOptions !== undefined && options === undefined) {
    add("buildOptions", "object");
  }

  if (options) {
    for (const field of ["alpha", "beta", "gamma"] as const) {
      const value = options[field];
      if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
        add(`buildOptions.${field}`, "finite-nonnegative");
      }
    }

    if (options.normalization !== undefined && !isOneOf(options.normalization, ["max", "frobenius", "log1p-max", "log-max", "none"])) {
      add("buildOptions.normalization", "supported-value");
    }
    if (options.bridgeWeightRule !== undefined && !isOneOf(options.bridgeWeightRule, ["count", "confidence"])) {
      add("buildOptions.bridgeWeightRule", "supported-value");
    }
    if (options.direction !== undefined && !isOneOf(options.direction, ["directed", "undirected"])) {
      add("buildOptions.direction", "supported-value");
    }
    if (options.deg_convention !== undefined && options.deg_convention !== "row-sum") {
      add("buildOptions.deg_convention", "supported-value");
    }
    if (options.Phi !== undefined && options.Phi !== "classical_mds") {
      add("buildOptions.Phi", "supported-value");
    }
    if (options.delta !== undefined && options.delta !== "shortest_path_reciprocal_weight") {
      add("buildOptions.delta", "supported-value");
    }
    if (options.d !== undefined && (!Number.isSafeInteger(options.d) || options.d < 1)) {
      add("buildOptions.d", "integer-range");
    }
    if (
      options.seed !== undefined &&
      (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > SENA_CANONICAL_UINT32_MAX)
    ) {
      add("buildOptions.seed", "integer-range");
    }
    if (options.undirectedSocial !== undefined && typeof options.undirectedSocial !== "boolean") {
      add("buildOptions.undirectedSocial", "boolean");
    }
    if (
      typeof options.undirectedSocial === "boolean" &&
      isOneOf(options.direction, ["directed", "undirected"]) &&
      (options.undirectedSocial ? "undirected" : "directed") !== options.direction
    ) {
      add("buildOptions.direction", "consistent-direction");
    }

    const temporalValue = (options as Record<string, unknown>).temporal;
    const temporal = typeof temporalValue === "object" && temporalValue !== null && !Array.isArray(temporalValue)
      ? temporalValue as Partial<NonNullable<SenaBuildOptions["temporal"]>>
      : undefined;
    if (temporalValue !== undefined && temporal === undefined) {
      add("buildOptions.temporal", "object");
    }
    if (temporal) {
      if (temporal.mode !== undefined && !isOneOf(temporal.mode, ["stage", "moving-window", "turn-window"])) {
        add("buildOptions.temporal.mode", "supported-value");
      }
      if (temporal.movingWindowSize !== undefined && (!Number.isSafeInteger(temporal.movingWindowSize) || temporal.movingWindowSize < 1)) {
        add("buildOptions.temporal.movingWindowSize", "integer-range");
      }
      if (temporal.movingWindowStep !== undefined && (!Number.isSafeInteger(temporal.movingWindowStep) || temporal.movingWindowStep < 1)) {
        add("buildOptions.temporal.movingWindowStep", "integer-range");
      }
      if (temporal.turnWindowRadius !== undefined && (!Number.isSafeInteger(temporal.turnWindowRadius) || temporal.turnWindowRadius < 0)) {
        add("buildOptions.temporal.turnWindowRadius", "integer-range");
      }
    }
  }

  const dataset = typeof input.dataset === "object" && input.dataset !== null && !Array.isArray(input.dataset)
    ? input.dataset as Record<string, unknown>
    : undefined;
  const interactions = Array.isArray(dataset?.interactions) ? dataset.interactions : [];
  interactions.forEach((interaction, index) => {
    if (typeof interaction !== "object" || interaction === null || Array.isArray(interaction)) return;
    const weight = (interaction as Record<string, unknown>).weight;
    if (weight !== undefined && (!isFiniteNumber(weight) || weight < 0)) {
      add(`dataset.interactions[${index}].weight`, "finite-nonnegative");
    }
  });
  const codedSegments = Array.isArray(dataset?.coded_segments) ? dataset.coded_segments : [];
  codedSegments.forEach((segment, index) => {
    if (typeof segment !== "object" || segment === null || Array.isArray(segment)) return;
    const confidence = (segment as Record<string, unknown>).confidence;
    if (
      confidence !== undefined &&
      (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1)
    ) {
      add(`dataset.coded_segments[${index}].confidence`, "finite-probability");
    }
  });

  if (input.groupComparison !== undefined) {
    validateGroupComparisonControls(input.groupComparison, add);
  }

  if (issues.length > 0) throw new SenaInputValidationError(issues);
}
