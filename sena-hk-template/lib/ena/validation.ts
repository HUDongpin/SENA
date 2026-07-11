import type { EnaMapping, EnaPreparedOptions, EnaPreparedRun, EnaRow, EnaRunOptions, EnaRunRequest } from "./types";
import { EnaInputError } from "./types";

export const defaultEnaOptions: Required<EnaRunOptions> = {
  model: "EndPoint",
  window: "MovingStanzaWindow",
  weightBy: "binary",
  windowSizeBack: 1,
  windowSizeForward: 0,
  dimensions: 2,
  nodePositionMethod: "undirected"
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function rowColumns(rows: EnaRow[]) {
  return Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
}

function isNumericLike(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim().length === 0 || Number.isFinite(Number(value));
  return false;
}

function toCodeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 0;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function findColumn(headers: string[], patterns: RegExp[], fallbackIndex: number, excluded = new Set<string>()) {
  const byPattern = headers.find((header) => !excluded.has(header) && patterns.some((pattern) => pattern.test(header)));
  if (byPattern) return byPattern;
  return headers.find((header, index) => index >= fallbackIndex && !excluded.has(header)) ?? headers.find((header) => !excluded.has(header));
}

export function inferEnaMapping(headers: string[], rows: EnaRow[]): EnaMapping {
  const excluded = new Set<string>();
  const unit = findColumn(headers, [/unit/i, /participant/i, /actor/i, /speaker/i, /student/i, /user/i], 0, excluded);
  if (unit) excluded.add(unit);

  const conversation = findColumn(headers, [/conversation/i, /^conv$/i, /thread/i, /session/i, /episode/i, /lesson/i, /stanza/i], 1, excluded);
  if (conversation) excluded.add(conversation);

  const metadataHints = [/turn/i, /time/i, /timestamp/i, /stage/i, /phase/i, /group/i, /condition/i, /role/i, /outcome/i];
  const codes = headers.filter((header) => {
    if (excluded.has(header)) return false;
    if (metadataHints.some((pattern) => pattern.test(header))) return false;
    const values = rows.map((row) => row[header]);
    return values.some((value) => value !== null && value !== undefined && String(value).trim() !== "") && values.every(isNumericLike);
  });

  const selected = new Set([...excluded, ...codes]);
  const metadata = headers.filter((header) => !selected.has(header));

  return {
    units: unit ? [unit] : [],
    conversation: conversation ? [conversation] : [],
    codes,
    metadata
  };
}

export function sanitizeMapping(mapping: EnaMapping, headers: string[]) {
  const valid = new Set(headers);
  const units = unique(mapping.units).filter((column) => valid.has(column));
  const conversation = unique(mapping.conversation).filter((column) => valid.has(column) && !units.includes(column));
  const codes = unique(mapping.codes).filter((column) => valid.has(column) && !units.includes(column) && !conversation.includes(column));
  const metadata = unique(mapping.metadata ?? []).filter((column) => valid.has(column) && !units.includes(column) && !conversation.includes(column) && !codes.includes(column));
  return { units, conversation, codes, metadata };
}

function validateMapping(rows: EnaRow[], mapping: EnaMapping) {
  const issues: string[] = [];
  const columns = rowColumns(rows);
  const columnSet = new Set(columns);
  const sanitized = sanitizeMapping(mapping, columns);

  if (sanitized.units.length === 0) issues.push("Select at least one unit column.");
  if (sanitized.conversation.length === 0) issues.push("Select at least one conversation column.");
  if (sanitized.codes.length < 2) issues.push("Select at least two numeric code columns.");

  for (const column of [...sanitized.units, ...sanitized.conversation, ...sanitized.codes, ...(sanitized.metadata ?? [])]) {
    if (!columnSet.has(column)) issues.push(`Column "${column}" does not exist in the data.`);
  }

  if (issues.length > 0) throw new EnaInputError(issues);
  return sanitized;
}

function normalizeOptions(options?: EnaRunOptions) {
  const normalized = { ...defaultEnaOptions, ...(options ?? {}) };
  const issues: string[] = [];

  if (!Number.isInteger(normalized.windowSizeBack) || normalized.windowSizeBack < 1) {
    issues.push("Window size back must be an integer of at least 1.");
  }
  if (!Number.isInteger(normalized.windowSizeForward) || normalized.windowSizeForward < 0) {
    issues.push("Window size forward must be a non-negative integer.");
  }
  if (!Number.isInteger(normalized.dimensions) || normalized.dimensions < 1) {
    issues.push("Dimensions must be a positive integer.");
  }
  if (normalized.weightBy !== "binary" && normalized.weightBy !== "sum") {
    issues.push("Weighting must be either binary or sum.");
  }

  if (issues.length > 0) throw new EnaInputError(issues);
  return normalized;
}

export function prepareEnaRun(request: EnaRunRequest): EnaPreparedRun {
  if (!Array.isArray(request.rows) || request.rows.length === 0) {
    throw new EnaInputError("Provide at least one data row.");
  }

  const mapping = validateMapping(request.rows, request.mapping);
  const runOptions = normalizeOptions(request.options);
  const warnings: string[] = [];
  let emptyCodeCells = 0;
  let nonBinaryCodeCells = 0;

  const rows = request.rows.map((row, rowIndex) => {
    const next: EnaRow = { ...row };

    for (const column of [...mapping.units, ...mapping.conversation]) {
      if (row[column] === null || row[column] === undefined || String(row[column]).trim() === "") {
        throw new EnaInputError(`Row ${rowIndex + 1} is missing a value for "${column}".`);
      }
      next[column] = String(row[column]);
    }

    for (const code of mapping.codes) {
      const value = row[code];
      if (value === null || value === undefined || value === "") emptyCodeCells += 1;
      const numeric = toCodeNumber(value);
      if (numeric === null) {
        throw new EnaInputError(`Row ${rowIndex + 1} has a non-numeric value in code column "${code}".`);
      }
      if (runOptions.weightBy === "binary" && numeric !== 0 && numeric !== 1) nonBinaryCodeCells += 1;
      next[code] = numeric;
    }

    return next;
  });

  if (emptyCodeCells > 0) warnings.push(`${emptyCodeCells} empty code cells were treated as 0.`);
  if (nonBinaryCodeCells > 0) warnings.push(`${nonBinaryCodeCells} non-binary code values will be interpreted as present/absent by binary weighting.`);

  const options: EnaPreparedOptions = {
    rows,
    units: mapping.units,
    conversation: mapping.conversation,
    codes: mapping.codes,
    metadata: mapping.metadata ?? [],
    model: runOptions.model,
    window: runOptions.window,
    weightBy: runOptions.weightBy,
    windowSizeBack: runOptions.windowSizeBack,
    windowSizeForward: runOptions.windowSizeForward,
    dimensions: runOptions.dimensions,
    nodePositionMethod: runOptions.nodePositionMethod,
    includeMeta: true
  };

  return { options, warnings };
}
