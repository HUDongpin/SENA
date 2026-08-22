import type { SenaActorType, SenaCode, SenaCodedSegment, SenaDataset, SenaDatasetMetadata, SenaInteraction, SenaPerson, SenaUtterance } from "./types";
import { validateSenaAnalyticalInputs } from "./analytical-input-validation";

export type SenaImportTable = "people" | "interactions" | "utterances" | "coded_segments" | "codebook";

export type SenaImportRow = Record<string, unknown>;

export type SenaColumnMapping = Record<string, string>;

export type SenaMappedTable = {
  id?: string;
  name: string;
  table: SenaImportTable;
  columns: string[];
  rows: SenaImportRow[];
  mapping: SenaColumnMapping;
};

export type SenaImportResult = {
  dataset: SenaDataset;
  warnings: string[];
};

type FieldDefinition = {
  field: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

export const senaImportTables: Array<{ value: SenaImportTable; label: string }> = [
  { value: "people", label: "people" },
  { value: "interactions", label: "interactions" },
  { value: "utterances", label: "utterances" },
  { value: "coded_segments", label: "coded_segments" },
  { value: "codebook", label: "codebook" }
];

export const senaImportFields: Record<SenaImportTable, FieldDefinition[]> = {
  people: [
    { field: "id", label: "Person ID", required: true, aliases: ["id", "person_id", "person", "participant_id", "actor_id", "student_id", "user_id"] },
    { field: "label", label: "Label", aliases: ["label", "name", "person_label", "display_name", "participant_name", "actor_name", "student_name"] },
    { field: "role", label: "Role", aliases: ["role", "position", "participant_role"] },
    { field: "group", label: "Group", aliases: ["group", "team", "class", "unit", "cohort"] },
    { field: "initials", label: "Initials", aliases: ["initials", "abbr", "short_label"] },
    { field: "actorType", label: "Actor type", aliases: ["actor_type", "agent_type", "actor_kind"] }
  ],
  interactions: [
    { field: "source", label: "Source person", required: true, aliases: ["source", "source_id", "from", "from_id", "sender", "sender_id", "ego"] },
    { field: "target", label: "Target person", required: true, aliases: ["target", "target_id", "to", "to_id", "receiver", "receiver_id", "alter", "reply_to_person_id", "mentioned_person_id"] },
    { field: "weight", label: "Weight", aliases: ["weight", "value", "count", "tie_weight", "frequency", "n"] },
    { field: "channel", label: "Channel", aliases: ["channel", "type", "interaction_type", "relation", "edge_type"] },
    { field: "stage", label: "Stage", aliases: ["stage", "phase", "session", "activity"] },
    { field: "turnIndex", label: "Turn index", aliases: ["turn_index", "turn", "turn_no", "order", "sequence", "line"] },
    { field: "evidence", label: "Evidence", aliases: ["evidence", "text", "excerpt", "note", "snippet"] }
  ],
  utterances: [
    { field: "id", label: "Utterance ID", required: true, aliases: ["id", "utterance_id", "message_id", "turn_id", "post_id"] },
    { field: "personId", label: "Person ID", required: true, aliases: ["person_id", "person", "speaker", "speaker_id", "author", "author_id", "user_id"] },
    { field: "unitId", label: "Unit ID", aliases: ["unit_id", "unit", "group_id", "team_id", "conversation_id", "case_id"] },
    { field: "stanzaId", label: "Stanza ID", aliases: ["stanza_id", "stanza", "window_id", "thread_id", "conversation_id"] },
    { field: "stage", label: "Stage", aliases: ["stage", "phase", "session", "activity"] },
    { field: "turnIndex", label: "Turn index", aliases: ["turn_index", "turn", "turn_no", "order", "sequence", "line"] },
    { field: "text", label: "Text", aliases: ["text", "utterance", "message", "content", "transcript"] },
    { field: "timestamp", label: "Timestamp", aliases: ["timestamp", "time", "created_at", "date"] }
  ],
  coded_segments: [
    { field: "segmentId", label: "Segment ID", required: true, aliases: ["segment_id", "id", "coded_segment_id", "segment"] },
    { field: "utteranceId", label: "Utterance ID", required: true, aliases: ["utterance_id", "message_id", "turn_id", "post_id"] },
    { field: "personId", label: "Person ID", aliases: ["person_id", "person", "speaker", "speaker_id", "author", "author_id", "user_id"] },
    { field: "unitId", label: "Unit ID", aliases: ["unit_id", "unit", "group_id", "team_id", "conversation_id", "case_id"] },
    { field: "stanzaId", label: "Stanza ID", aliases: ["stanza_id", "stanza", "window_id", "thread_id", "conversation_id"] },
    { field: "stage", label: "Stage", aliases: ["stage", "phase", "session", "activity"] },
    { field: "turnIndex", label: "Turn index", aliases: ["turn_index", "turn", "turn_no", "order", "sequence", "line"] },
    { field: "text", label: "Text", aliases: ["text", "utterance", "message", "content", "transcript"] },
    { field: "codes", label: "Codes", required: true, aliases: ["codes", "code", "code_id", "code_ids", "code_label", "coding", "codes_applied"] },
    { field: "targetPersonIds", label: "Target person IDs", aliases: ["target_person_ids", "target_actor_ids", "target_actor_id", "target_actors", "target_people", "target_persons", "target_person_id", "uptake_person_ids", "addressed_to", "receiver_ids", "to_person_ids"] },
    { field: "confidence", label: "Confidence", aliases: ["confidence", "score", "agreement", "probability"] }
  ],
  codebook: [
    { field: "id", label: "Code ID", required: true, aliases: ["id", "code", "code_id", "code_name", "code_key"] },
    { field: "label", label: "Label", aliases: ["label", "name", "code_label", "display_name"] },
    { field: "family", label: "Family", aliases: ["family", "category", "dimension", "group"] },
    { field: "description", label: "Description", aliases: ["description", "definition", "notes"] },
    { field: "color", label: "Color", aliases: ["color", "colour", "hex", "hex_color"] }
  ]
};

const fallbackColors = ["#2f73ff", "#a855f7", "#24dcee", "#14b8a6", "#ec4899", "#f97316", "#eab308", "#22c55e"];

export function createEmptySenaDataset(warnings: string[] = []): SenaDataset {
  return {
    people: [],
    interactions: [],
    utterances: [],
    coded_segments: [],
    codebook: [],
    warnings
  };
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function displayTable(table: SenaImportTable) {
  return table.replace("_", " ");
}

function scalar(value: unknown) {
  if (value === null || value === undefined) return "";
  // "|" is the one multi-value separator (ADR-0007 D2), so a JSON-contract
  // array round-trips through this join and the pipe-only split below — the
  // array form is how a delimiter-bearing id like "Wong, Ka Yee" is carried.
  if (Array.isArray(value)) return value.join("|");
  return String(value).trim();
}

function readField(row: SenaImportRow, mapping: SenaColumnMapping, field: string) {
  const column = mapping[field];
  return column ? scalar(row[column]) : "";
}

function parseNumber(value: string, fallback: number, warnings: string[], context: string) {
  if (value.length === 0) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  warnings.push(`${context} has non-numeric value "${value}"; using ${fallback}.`);
  return fallback;
}

function parseAnalyticalNumber(value: string, fallback: number) {
  return value.length === 0 ? fallback : Number(value);
}

/**
 * Multi-value cells (`codes`, `target_person_ids`) split on "|" only
 * (ADR-0007 D2). A value with no "|" is one value, taken verbatim — this is
 * what lets a person id like "Wong, Ka Yee" (the standard LMS "Last, First"
 * form, bug G1) survive the contract instead of shredding into fragments.
 * ","/";" inside a value are content, tolerated but warned about
 * (`warnDelimiterBearingIds`); "|" inside an id remains inexpressible.
 */
function parseMultiValue(value: string) {
  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function columnsFromRows(rows: SenaImportRow[]) {
  return Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
}

export function inferSenaTableFromName(name: string): SenaImportTable {
  const normalized = normalizeKey(name);
  if (normalized.includes("codedsegment") || normalized.includes("coding") || normalized.includes("segments")) return "coded_segments";
  if (normalized.includes("codebook") || normalized.includes("codes")) return "codebook";
  if (normalized.includes("interaction") || normalized.includes("ties") || normalized.includes("edges")) return "interactions";
  if (normalized.includes("utterance") || normalized.includes("transcript") || normalized.includes("message") || normalized.includes("turn")) return "utterances";
  return "people";
}

export function inferSenaColumnMapping(table: SenaImportTable, columns: string[]): SenaColumnMapping {
  const normalizedColumns = columns.map((column) => ({ column, normalized: normalizeKey(column) }));
  return Object.fromEntries(
    senaImportFields[table].flatMap((definition) => {
      const aliases = [definition.field, ...definition.aliases].map(normalizeKey);
      const exact = normalizedColumns.find((candidate) => aliases.includes(candidate.normalized));
      return exact ? [[definition.field, exact.column]] : [];
    })
  );
}

export function missingRequiredSenaFields(table: SenaImportTable, mapping: SenaColumnMapping) {
  return senaImportFields[table].filter((definition) => definition.required && !mapping[definition.field]);
}

export type SenaCsvParseOptions = {
  /**
   * Stops the lexical CSV scan before an over-budget data row is retained.
   * The header is not a data row and blank physical rows do not consume the
   * budget, matching the parser's existing semantic row selection.
   */
  maximumDataRows?: number;
  onDataRowLimitExceeded?: (actual: number, maximum: number) => never;
};

export function parseSenaCsv(
  text: string,
  options: SenaCsvParseOptions = {}
): { columns: string[]; rows: SenaImportRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const source = text.replace(/^\uFEFF/, "");
  const parsedRows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const maximumDataRows = options.maximumDataRows;
  if (maximumDataRows !== undefined && (!Number.isSafeInteger(maximumDataRows) || maximumDataRows < 0)) {
    throw new Error("CSV maximumDataRows must be a non-negative safe integer.");
  }

  const retainCompletedRow = () => {
    if (!row.some((value) => value.trim().length > 0)) return;
    const nextDataRowCount = parsedRows.length;
    if (maximumDataRows !== undefined && nextDataRowCount > maximumDataRows) {
      if (options.onDataRowLimitExceeded) {
        options.onDataRowLimitExceeded(nextDataRowCount, maximumDataRows);
      }
      throw new Error(`CSV data row count ${nextDataRowCount} exceeds the supported maximum of ${maximumDataRows}.`);
    }
    parsedRows.push(row);
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      if (cell.trim().length === 0) inQuotes = true;
      else cell += char;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      retainCompletedRow();
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") index += 1;
    } else {
      cell += char;
    }
  }

  if (inQuotes) throw new Error("CSV has an unterminated quoted value.");
  if (cell.length > 0 || row.length > 0 || source.endsWith(",")) {
    row.push(cell);
    retainCompletedRow();
  }

  if (parsedRows.length === 0) throw new Error("CSV is empty.");

  const columns = parsedRows[0]?.map((header) => header.trim()) ?? [];
  if (columns.length === 0 || columns.some((header) => header.length === 0)) {
    throw new Error("CSV header row must contain non-empty column names.");
  }

  const duplicateColumns = columns.filter((column, index) => columns.indexOf(column) !== index);
  if (duplicateColumns.length > 0) {
    throw new Error(`CSV header contains duplicate columns: ${[...new Set(duplicateColumns)].join(", ")}.`);
  }

  const rows = parsedRows.slice(1).map<SenaImportRow>((cells, rowIndex) => {
    let normalizedCells = cells;
    if (normalizedCells.length > columns.length) {
      // Drop trailing empty cells (a stray trailing delimiter or spreadsheet
      // padding) before deciding a row is genuinely misaligned.
      let end = normalizedCells.length;
      while (end > columns.length && (normalizedCells[end - 1] ?? "").trim().length === 0) end -= 1;
      if (end < normalizedCells.length) {
        warnings.push(`CSV row ${rowIndex + 2} had ${normalizedCells.length - end} trailing empty cell(s) beyond the ${columns.length} header columns; they were dropped.`);
      }
      normalizedCells = normalizedCells.slice(0, end);
    }
    if (normalizedCells.length > columns.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${cells.length} cells but the header has ${columns.length}.`);
    }
    // Short rows are padded with empty strings (via the ?? "" below) rather than
    // failing the whole import, matching the tolerant cleaning-manifest pipeline.
    // The padding is recorded so a truncated export cannot silently become empty
    // fields — required fields fail later with a confusing "missing X" message and
    // optional ones would otherwise take defaults with no trace at all.
    if (normalizedCells.length < columns.length) {
      const padded = columns.slice(normalizedCells.length);
      warnings.push(`CSV row ${rowIndex + 2} has ${normalizedCells.length} cells but the header has ${columns.length}; padded empty values for: ${padded.join(", ")}.`);
    }
    return Object.fromEntries(columns.map((column, columnIndex) => [column, normalizedCells[columnIndex]?.trim() ?? ""]));
  });

  return { columns, rows, warnings };
}

/**
 * ADR-0006 D2: an empty cell means "human" and stores nothing, so untyped
 * rosters keep their exact current shape. An unrecognized value is disclosed
 * and read as human rather than inventing an actor type.
 */
function parseActorType(value: string, rowNumber: number, warnings: string[]): SenaActorType | undefined {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  if (normalized === "human") return "human";
  if (normalized === "aiagent" || normalized === "ai") return "ai_agent";
  warnings.push(`people row ${rowNumber} actor_type "${value}" is not "human" or "ai_agent"; the row is read as human.`);
  return undefined;
}

function normalizePeople(rows: SenaImportRow[], mapping: SenaColumnMapping, warnings: string[]) {
  const people = rows.flatMap<SenaPerson>((row, index) => {
    const id = readField(row, mapping, "id");
    if (!id) {
      warnings.push(`people row ${index + 1} is missing Person ID and was skipped.`);
      return [];
    }
    const label = readField(row, mapping, "label") || id;
    const actorType = parseActorType(readField(row, mapping, "actorType"), index + 1, warnings);
    return [{
      id,
      label,
      role: readField(row, mapping, "role") || "Participant",
      group: readField(row, mapping, "group") || "Ungrouped",
      initials: readField(row, mapping, "initials") || label.slice(0, 2).toUpperCase(),
      ...(actorType ? { actorType } : {})
    }];
  });
  // Guardrail (Human-AI brief §8): typing a roster row ai_agent does not make
  // the dataset research-grade Human-AI SENA — no run provenance exists yet.
  const aiActorIds = people.filter((person) => person.actorType === "ai_agent").map((person) => person.id);
  if (aiActorIds.length > 0) {
    warnings.push(
      `people declares ${aiActorIds.length === 1 ? "an AI actor" : `${aiActorIds.length} AI actors`} (${aiActorIds.join(", ")}). Actor typing is roster semantics only (ADR-0006 D2): model/version/run provenance is not captured yet, so Human-AI findings remain exploratory.`
    );
  }
  return people;
}

function normalizeInteractions(rows: SenaImportRow[], mapping: SenaColumnMapping, warnings: string[]) {
  return rows.flatMap<SenaInteraction>((row, index) => {
    const source = readField(row, mapping, "source");
    const target = readField(row, mapping, "target");
    if (!source || !target) {
      warnings.push(`interactions row ${index + 1} is missing source or target and was skipped.`);
      return [];
    }
    const turnIndex = readField(row, mapping, "turnIndex");
    return [{
      source,
      target,
      weight: parseAnalyticalNumber(readField(row, mapping, "weight"), 1),
      channel: readField(row, mapping, "channel") || "interaction",
      stage: readField(row, mapping, "stage") || "Unstaged",
      turnIndex: turnIndex ? parseNumber(turnIndex, index + 1, warnings, `interactions row ${index + 1} turnIndex`) : undefined,
      evidence: readField(row, mapping, "evidence") || `${source} -> ${target}`
    }];
  });
}

function normalizeUtterances(rows: SenaImportRow[], mapping: SenaColumnMapping, warnings: string[]) {
  return rows.flatMap<SenaUtterance>((row, index) => {
    const id = readField(row, mapping, "id");
    const personId = readField(row, mapping, "personId");
    if (!id || !personId) {
      warnings.push(`utterances row ${index + 1} is missing utterance ID or person ID and was skipped.`);
      return [];
    }
    return [{
      id,
      personId,
      unitId: readField(row, mapping, "unitId") || "unit-1",
      stanzaId: readField(row, mapping, "stanzaId") || readField(row, mapping, "unitId") || "stanza-1",
      stage: readField(row, mapping, "stage") || "Unstaged",
      turnIndex: parseNumber(readField(row, mapping, "turnIndex"), index + 1, warnings, `utterances row ${index + 1} turnIndex`),
      text: readField(row, mapping, "text") || "",
      timestamp: readField(row, mapping, "timestamp") || undefined
    }];
  });
}

function normalizeCodebook(rows: SenaImportRow[], mapping: SenaColumnMapping, warnings: string[]) {
  return rows.flatMap<SenaCode>((row, index) => {
    const id = readField(row, mapping, "id");
    if (!id) {
      warnings.push(`codebook row ${index + 1} is missing Code ID and was skipped.`);
      return [];
    }
    return [{
      id,
      label: readField(row, mapping, "label") || id,
      family: readField(row, mapping, "family") || "Uncategorized",
      description: readField(row, mapping, "description") || "No description provided.",
      color: readField(row, mapping, "color") || fallbackColors[index % fallbackColors.length]
    }];
  });
}

/**
 * One value of a multi-value cell that carries a legacy ","/";" separator.
 * Whether it is ambiguous cannot be decided while the tables are being read —
 * it depends on the ids the finished dataset accepts — so candidates are
 * collected here and judged by `warnLegacyMultiValueCells` after derivation.
 */
type LegacyMultiValueCell = { field: "codes" | "target_person_ids"; value: string; rowNumber: number; source: string };

function normalizeSegments(
  rows: SenaImportRow[],
  mapping: SenaColumnMapping,
  utterancesById: Map<string, SenaUtterance>,
  warnings: string[],
  legacyCells: LegacyMultiValueCell[],
  source: string
) {
  // ADR-0007 D2 deprecation window: before pipe-only splitting, ","/";" also
  // separated multi-value cells, so a cell like "question,evidence" changed
  // meaning. A half-migrated cell ("question|evidence,claim") carries both
  // separators, so each pipe-separated value is judged on its own — the cell
  // having *a* "|" says nothing about the value that still has a ",". Candidates
  // are collected here; the finished dataset decides which are genuinely
  // ambiguous, and deduplicates them across the whole import.
  const legacySeparators = /[;,]/;
  const noteLegacyValues = (field: LegacyMultiValueCell["field"], values: string[], rowNumber: number) => {
    for (const value of values) {
      if (!legacySeparators.test(value)) continue;
      legacyCells.push({ field, value, rowNumber, source });
    }
  };

  return rows.flatMap<SenaCodedSegment>((row, index) => {
    const segmentId = readField(row, mapping, "segmentId");
    const utteranceId = readField(row, mapping, "utteranceId");
    const codesCell = readField(row, mapping, "codes");
    const targetsCell = readField(row, mapping, "targetPersonIds");
    const codes = parseMultiValue(codesCell);
    const targetPersonIds = parseMultiValue(targetsCell);
    if (!segmentId || !utteranceId || codes.length === 0) {
      warnings.push(`coded_segments row ${index + 1} is missing segment ID, utterance ID, or codes and was skipped.`);
      return [];
    }
    // Only rows that survive: advice about re-separating a cell in a row the
    // import just dropped is noise next to the "was skipped" warning.
    noteLegacyValues("codes", codes, index + 1);
    noteLegacyValues("target_person_ids", targetPersonIds, index + 1);

    const utterance = utterancesById.get(utteranceId);
    if (!utterance) warnings.push(`coded_segments row ${index + 1} references unknown utterance "${utteranceId}".`);

    return [{
      segmentId,
      utteranceId,
      personId: readField(row, mapping, "personId") || utterance?.personId || "unknown-person",
      unitId: readField(row, mapping, "unitId") || utterance?.unitId || "unit-1",
      stanzaId: readField(row, mapping, "stanzaId") || utterance?.stanzaId || "stanza-1",
      stage: readField(row, mapping, "stage") || utterance?.stage || "Unstaged",
      turnIndex: parseNumber(readField(row, mapping, "turnIndex"), utterance?.turnIndex ?? index + 1, warnings, `coded_segments row ${index + 1} turnIndex`),
      text: readField(row, mapping, "text") || utterance?.text || "",
      codes,
      targetPersonIds: targetPersonIds.length > 0 ? targetPersonIds : undefined,
      confidence: readField(row, mapping, "confidence")
        ? parseAnalyticalNumber(readField(row, mapping, "confidence"), 1)
        : undefined
    }];
  });
}

function uniqueBy<T>(items: T[], label: string, warnings: string[], idFor: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = idFor(item);
    if (seen.has(id)) {
      warnings.push(`Duplicate ${label} id "${id}" was ignored.`);
      return false;
    }
    seen.add(id);
    return true;
  });
}

function uniqueById<T extends { id: string }>(items: T[], label: string, warnings: string[]) {
  return uniqueBy(items, label, warnings, (item) => item.id);
}

/**
 * Reconstruction placeholders identify themselves here, by object identity, so
 * no consumer has to infer "machine-minted" from the row's contents. The old
 * convention (group:"Derived" with label === id) was unusable as a marker: an
 * analyst who declares `{"person_id":"P3","group":"Derived"}` with no label
 * produces exactly that shape, because `normalizePeople` defaults label to id.
 * The enterprise round trip read the convention literally and dropped such a
 * declared row — silently, since nothing re-derives an isolate or a
 * target-only id — shrinking N and the S dimension against the very roster
 * ADR-0010 makes authoritative.
 *
 * The marker lives in a WeakSet rather than in a field on SenaPerson because
 * person rows *are* the analyst-facing artifact: `datasetToTables` hands them
 * to `columnsFromRows` (Object.keys) as contract import rows, and buildSenaModel
 * and report.ts spread them into published payloads. Any own property would
 * surface there as a contract column and a serialized field. A WeakSet is
 * invisible to Object.keys, spreads, and JSON.stringify alike, so the marker
 * cannot leak, cannot move fingerprints, and dies with the in-memory dataset.
 */
const derivedPlaceholderPeople = new WeakSet<SenaPerson>();

/**
 * True only for rows this module minted as reconstruction scaffolding. A
 * declared roster row is never marked, whatever its group or label.
 */
export function isDerivedPlaceholderPerson(person: SenaPerson) {
  return derivedPlaceholderPeople.has(person);
}

function pushDerivedPlaceholderPerson(dataset: SenaDataset, personId: string): SenaPerson {
  const person: SenaPerson = {
    id: personId,
    label: personId,
    role: "Participant",
    group: "Derived",
    initials: personId.slice(0, 2).toUpperCase()
  };
  derivedPlaceholderPeople.add(person);
  dataset.people.push(person);
  return person;
}

function addDerivedContractRows(dataset: SenaDataset, warnings: string[]) {
  const peopleById = new Map(dataset.people.map((person) => [person.id, person]));
  // Whether the upload declared a people roster at all. A declared roster is
  // authoritative: an unmatched target is then a dangling reference, not a new
  // actor. Without one, the coded_segments table *is* the roster, so a declared
  // target legitimately introduces the person it names.
  const hasDeclaredRoster = dataset.people.length > 0;
  for (const utterance of dataset.utterances) {
    if (!peopleById.has(utterance.personId)) {
      peopleById.set(utterance.personId, pushDerivedPlaceholderPerson(dataset, utterance.personId));
      warnings.push(`people table did not include "${utterance.personId}"; derived a placeholder person from utterances.`);
    }
  }

  // A source is a contribution (the person demonstrably acted), so a roster
  // omission there is recovered like an unknown utterance author. A target is a
  // *claim about* an actor — who someone replied to — so under a declared roster
  // an unmatched target stays dangling, exactly as the coded_segments loop below
  // treats target_person_ids (ADR-0010; the interactions sibling of the G1
  // chains, Q9). Dangling targets are disclosed after every derivation loop has
  // run, since a later source or contributor can still legitimize the id.
  for (const interaction of dataset.interactions) {
    const derivable = hasDeclaredRoster ? [interaction.source] : [interaction.source, interaction.target];
    for (const personId of derivable) {
      if (!peopleById.has(personId)) {
        peopleById.set(personId, pushDerivedPlaceholderPerson(dataset, personId));
        warnings.push(`people table did not include "${personId}"; derived a placeholder person from interactions.`);
      }
    }
  }

  // coded_segments also reference the contributing person, so a segments-only
  // upload — or a segment naming a person absent from the people/utterances/
  // interactions tables — would otherwise leave that person undefined, collapsing
  // the social/bridge matrices and dropping the segment as "unknown person".
  //
  // targetPersonIds are only derived from when no people roster was declared.
  // A target is a *claim about* an actor, not a declaration of one, so once a
  // roster exists an unmatched target must stay dangling: deriving from it lets an
  // unresolvable or mis-split target (targetPersonIds is multi-valued, split on
  // "|" since ADR-0007 D2, so an id containing "|" is split into fragments)
  // fabricate participants, and — because those fabricated ids then resolve in
  // personIndex — flip buildBridgeMatrix into independent-B_CP mode on evidence
  // that does not exist.
  // ADR-0006 D1 requires the opposite: an unresolved target leaves the segment
  // target empty, preserving the B_PC transpose fallback, and never invents a
  // target. Unknown targets are reported by buildBridgeMatrix instead.
  const segmentAuthorIds = new Set(dataset.coded_segments.map((segment) => segment.personId));
  const derivedTargetOnlyIds: string[] = [];
  for (const segment of dataset.coded_segments) {
    const declared = hasDeclaredRoster ? [segment.personId] : [segment.personId, ...(segment.targetPersonIds ?? [])];
    for (const personId of declared) {
      if (personId && !peopleById.has(personId)) {
        peopleById.set(personId, pushDerivedPlaceholderPerson(dataset, personId));
        warnings.push(`people table did not include "${personId}"; derived a placeholder person from coded_segments.`);
        // Derived here and never an author of a segment (nor of an utterance or
        // an interaction — those loops ran first), so the only thing that put
        // this person on the roster is a target_person_ids claim. Because the
        // claim rides a coded segment, it is also directed B_CP evidence, which
        // is what can flip buildBridgeMatrix into independent mode.
        if (!segmentAuthorIds.has(personId)) derivedTargetOnlyIds.push(personId);
      }
    }
  }

  // Disclosure only (the derivation above is the F6 rule: with no declared
  // roster the coded_segments table IS the roster). What the researcher cannot
  // otherwise see is that directed code-to-person evidence may rest entirely on
  // people the import invented from a claim rather than from a contribution.
  if (derivedTargetOnlyIds.length > 0) {
    const examples = derivedTargetOnlyIds.slice(0, 3).map((id) => `"${id}"`).join(", ");
    warnings.push(
      `people table was not uploaded, so coded_segments is the roster: ${derivedTargetOnlyIds.length} person id(s) (${examples}${derivedTargetOnlyIds.length > 3 ? ", …" : ""}) ${derivedTargetOnlyIds.length === 1 ? "was" : "were"} derived solely from target_person_ids and never author a segment. Directed B_CP evidence includes these derived people, so verify they are real participants. This is reported whenever such a person is derived; it does not check the final bridge mode.`
    );
  }

  // Judged against the finished roster — every derivation loop above has run, so
  // an id minted later from a contribution (a source, an utterance author, a
  // segment contributor) is not misreported as dangling. buildSocialMatrix will
  // drop each of these ties as "unknown person"; this warning names the roster
  // gate as the reason while the dangling id is still known (ADR-0010).
  if (hasDeclaredRoster) {
    const danglingTargetCounts = new Map<string, number>();
    for (const interaction of dataset.interactions) {
      if (!peopleById.has(interaction.target)) {
        danglingTargetCounts.set(interaction.target, (danglingTargetCounts.get(interaction.target) ?? 0) + 1);
      }
    }
    for (const [personId, count] of danglingTargetCounts) {
      warnings.push(
        `declared people roster does not include "${personId}"; ${count === 1 ? "1 interaction targeting it was" : `${count} interactions targeting it were`} excluded from the social layer (a target is a claim about an actor, not a declaration of one).`
      );
    }
  }

  const codeById = new Map(dataset.codebook.map((code) => [code.id, code]));
  for (const codeId of Array.from(new Set(dataset.coded_segments.flatMap((segment) => segment.codes)))) {
    if (!codeById.has(codeId)) {
      const code: SenaCode = {
        id: codeId,
        label: codeId,
        family: "Derived",
        description: "Derived from coded_segments because codebook did not define this code.",
        color: fallbackColors[codeById.size % fallbackColors.length]
      };
      dataset.codebook.push(code);
      codeById.set(codeId, code);
      warnings.push(`codebook table did not include "${codeId}"; derived a placeholder code.`);
    }
  }

  if (dataset.utterances.length === 0 && dataset.coded_segments.length > 0) {
    dataset.utterances = uniqueById(dataset.coded_segments.map((segment) => ({
      id: segment.utteranceId,
      personId: segment.personId,
      unitId: segment.unitId,
      stanzaId: segment.stanzaId,
      stage: segment.stage,
      turnIndex: segment.turnIndex,
      text: segment.text
    })), "utterance", warnings);
    warnings.push("utterances table was missing; derived utterances from coded_segments.");
  }
}

/**
 * ADR-0007 D2 deprecation window, decided over the finished dataset rather than
 * the declared tables. A cell that IS an id the import accepts — declared or
 * derived — is not ambiguous: reading it as one value is exactly what the
 * upload meant, so a roster-less upload no longer flags the very ids it derives
 * moments later. What still warns is a cell that looks like a legacy list:
 * every ","/";" fragment is itself a known id, so the old splitter would have
 * produced real values and the meaning change is real.
 */
function warnLegacyMultiValueCells(dataset: SenaDataset, cells: LegacyMultiValueCell[], warnings: string[]) {
  const flagged = new Set<string>();
  if (cells.length === 0) return flagged;
  const knownIds = {
    codes: new Set(dataset.codebook.map((code) => code.id)),
    target_person_ids: new Set(dataset.people.map((person) => person.id))
  };
  // Once per distinct value across the whole import, not per uploaded table:
  // two coded_segments files carrying the same legacy cell describe one fact,
  // and the first occurrence carries the source name to open.
  const reported = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.field}::${cell.value}`;
    if (reported.has(key)) continue;
    const known = knownIds[cell.field];
    const fragments = cell.value.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
    const looksLikeLegacyList = fragments.length > 1 && fragments.every((fragment) => known.has(fragment));
    if (!looksLikeLegacyList && known.has(cell.value)) continue;
    reported.add(key);
    flagged.add(cell.value);
    warnings.push(
      `${cell.source} row ${cell.rowNumber} ${cell.field} value "${cell.value}" contains "," or ";" and is read as one value, not split (ADR-0007). Separate multiple values with "|".`
    );
  }
  return flagged;
}

/**
 * ADR-0007 D1: person and code ids must avoid the multi-value delimiters
 * "|", ";" and ",". Runs once over the finished dataset (after placeholder
 * derivation, so derived ids are covered too). A "|"-bearing id is actionable —
 * it cannot be referenced from a multi-value field at all — so it is reported
 * per id. A ","/";"-bearing id is legal and merely discouraged, and a
 * name-keyed roster carries hundreds of them, so those are aggregated into one
 * warning per table/field with a count and examples. Warn-and-continue, like
 * the rest of the cleaning pipeline: the id is always kept verbatim.
 *
 * Values `warnLegacyMultiValueCells` already flagged are left out entirely
 * (count included): that warning says the old splitter would have split the
 * value, and calling the same value "legal and kept verbatim" a few lines later
 * is contradictory advice about one id. The deprecation warning owns it.
 */
function warnDelimiterBearingIds(dataset: SenaDataset, warnings: string[], flaggedLegacyValues: Set<string>) {
  const reservedDelimiters = /[|;,]/;
  const seen = new Set<string>();
  const tolerated = new Map<string, string[]>();
  const record = (context: string, id: string) => {
    if (!reservedDelimiters.test(id) || flaggedLegacyValues.has(id)) return;
    const key = `${context}::${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (id.includes("|")) {
      warnings.push(`${context} id "${id}" contains "|", the multi-value separator; it cannot be referenced inside a multi-value field such as target_person_ids (ADR-0007).`);
      return;
    }
    const bucket = tolerated.get(context);
    if (bucket) bucket.push(id);
    else tolerated.set(context, [id]);
  };
  for (const person of dataset.people) record("people", person.id);
  for (const code of dataset.codebook) record("codebook", code.id);
  for (const segment of dataset.coded_segments) {
    for (const target of segment.targetPersonIds ?? []) record("coded_segments target_person_ids", target);
  }
  for (const [context, ids] of tolerated) {
    const examples = ids.slice(0, 3).map((id) => `"${id}"`).join(", ");
    warnings.push(
      `${context}: ${ids.length} id(s) contain "," or ";" (e.g. ${examples}${ids.length > 3 ? ", …" : ""}); they are legal and kept verbatim (multi-value cells split on "|" only), but delimiter-free ids are safer (ADR-0007).`
    );
  }
}

export function buildSenaDatasetFromTables(tables: SenaMappedTable[]): SenaImportResult {
  const warnings: string[] = [];
  const byTable = new Map<SenaImportTable, SenaMappedTable[]>();

  for (const table of tables) {
    byTable.set(table.table, [...(byTable.get(table.table) ?? []), table]);
    const missing = missingRequiredSenaFields(table.table, table.mapping);
    for (const field of missing) {
      warnings.push(`${table.name} is mapped as ${displayTable(table.table)} but is missing required field "${field.label}".`);
    }
  }

  for (const table of senaImportTables) {
    if (!byTable.has(table.value)) warnings.push(`${table.label} table is not uploaded; validation may derive placeholders where possible.`);
  }

  const people = uniqueById(
    (byTable.get("people") ?? []).flatMap((table) => normalizePeople(table.rows, table.mapping, warnings)),
    "person",
    warnings
  );
  const interactions = (byTable.get("interactions") ?? []).flatMap((table) => normalizeInteractions(table.rows, table.mapping, warnings));
  const utterances = uniqueById(
    (byTable.get("utterances") ?? []).flatMap((table) => normalizeUtterances(table.rows, table.mapping, warnings)),
    "utterance",
    warnings
  );
  const utterancesById = new Map(utterances.map((utterance) => [utterance.id, utterance]));
  const codebook = uniqueById(
    (byTable.get("codebook") ?? []).flatMap((table) => normalizeCodebook(table.rows, table.mapping, warnings)),
    "code",
    warnings
  );
  const legacyCells: LegacyMultiValueCell[] = [];
  const coded_segments = uniqueBy(
    (byTable.get("coded_segments") ?? []).flatMap((table) => normalizeSegments(table.rows, table.mapping, utterancesById, warnings, legacyCells, table.name || "coded_segments")),
    "segment",
    warnings,
    (segment) => segment.segmentId
  );

  const dataset = { people, interactions, utterances, coded_segments, codebook, warnings };
  addDerivedContractRows(dataset, warnings);
  const flaggedLegacyValues = warnLegacyMultiValueCells(dataset, legacyCells, warnings);
  warnDelimiterBearingIds(dataset, warnings, flaggedLegacyValues);
  validateSenaAnalyticalInputs({ dataset });
  return { dataset, warnings };
}

function tableFromJson(name: SenaImportTable, rows: unknown): SenaMappedTable | null {
  if (!Array.isArray(rows)) return null;
  const normalizedRows = rows.filter((row): row is SenaImportRow => typeof row === "object" && row !== null && !Array.isArray(row));
  const columns = columnsFromRows(normalizedRows);
  return {
    name,
    table: name,
    columns,
    rows: normalizedRows,
    mapping: inferSenaColumnMapping(name, columns)
  };
}

function metadataFromJson(value: unknown): SenaDatasetMetadata | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as SenaDatasetMetadata;
}

const contractTableKeys = ["people", "interactions", "utterances", "coded_segments", "codedSegments", "codebook", "codes"] as const;

function looksLikeMetadataShape(value: Record<string, unknown>) {
  return typeof value.consent === "object" && value.consent !== null &&
    typeof value.pseudonymization === "object" && value.pseudonymization !== null &&
    typeof value.codebook === "object" && value.codebook !== null && !Array.isArray(value.codebook);
}

/**
 * Recognizes a standalone dataset governance metadata document so five-CSV
 * uploads can attach `dataset.metadata` (consent, retention, pseudonymization,
 * codebook version) that plain CSV tables cannot carry. Accepts either the
 * metadata object itself or a `{ "metadata": { ... } }` wrapper, and never
 * matches a full SENA contract (which keeps its own metadata handling).
 */
export function senaDatasetMetadataFromJson(source: string | unknown): SenaDatasetMetadata | undefined {
  let value: unknown;
  try {
    value = typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const root = value as Record<string, unknown>;
  if (contractTableKeys.some((key) => Array.isArray(root[key]))) return undefined;
  if (looksLikeMetadataShape(root)) return metadataFromJson(root);
  const wrapped = root.metadata;
  if (typeof wrapped === "object" && wrapped !== null && !Array.isArray(wrapped) &&
    looksLikeMetadataShape(wrapped as Record<string, unknown>)) {
    return metadataFromJson(wrapped);
  }
  return undefined;
}

// Shares the metadata detector's predicate (any contract table key holding an
// array) so adapters can route contract-shaped JSON to importSenaJsonContract
// and let its real error surface instead of a misleading forum-adapter one.
export function looksLikeSenaContractJson(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  return contractTableKeys.some((key) => Array.isArray(root[key]));
}

export function importSenaJsonContract(source: string | unknown): SenaImportResult {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("JSON import must be an object with people, interactions, utterances, coded_segments, and codebook arrays.");
  }

  const root = value as Record<string, unknown>;
  const tables = [
    tableFromJson("people", root.people),
    tableFromJson("interactions", root.interactions),
    tableFromJson("utterances", root.utterances),
    tableFromJson("coded_segments", root.coded_segments ?? root.codedSegments),
    tableFromJson("codebook", root.codebook ?? root.codes)
  ].filter((table): table is SenaMappedTable => Boolean(table));

  if (tables.length === 0) {
    throw new Error("JSON import did not contain any recognized SENA contract tables.");
  }

  const result = buildSenaDatasetFromTables(tables);
  const metadata = metadataFromJson(root.metadata);
  if (metadata) result.dataset.metadata = metadata;
  return result;
}
