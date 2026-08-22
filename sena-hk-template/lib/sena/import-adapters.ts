import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaAnalysisRunInput } from "./analysis-run";
import { buildSenaStableContentHash } from "./data-contract-audit";
import { SenaInputValidationError } from "./analytical-input-validation";
import { readXlsxWorkbookRows } from "./excel-workbook";
import {
  buildSenaDatasetFromTables,
  importSenaJsonContract,
  looksLikeSenaContractJson,
  inferSenaColumnMapping,
  inferSenaTableFromName,
  isDerivedPlaceholderPerson,
  parseSenaCsv,
  senaDatasetMetadataFromJson,
  type SenaImportRow,
  type SenaMappedTable
} from "./import";
import type { SenaCode, SenaDataset, SenaDatasetMetadata } from "./types";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits
} from "./reliability";

export type SenaImportAdapterSource = {
  name: string;
  profile: "sena-contract" | "csv-table" | "excel-workbook" | "lms-forum-json" | "lms-forum-export" | "cleaned-transcript" | "dataset-metadata";
  rows: number;
  warnings: string[];
};

export type SenaEnterpriseImportCleaningManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.importCleaningManifest;
  summary: {
    fileCount: number;
    totalSourceRows: number;
    adapterProfiles: string[];
    warningCount: number;
    derivedPlaceholderCount: number;
    skippedRowCount: number;
    duplicateRowCount: number;
    missingTableWarningCount: number;
    transcriptNoCodeMarkerCount: number;
  };
  sources: Array<{
    name: string;
    profile: SenaImportAdapterSource["profile"];
    rows: number;
    warningCount: number;
    transformations: string[];
  }>;
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "review";
    evidence: string[];
    nextAction: string;
  }>;
  recommendedNextActions: string[];
};

export type SenaEnterpriseImportResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseImport;
  dataset: SenaDataset;
  warnings: string[];
  sources: SenaImportAdapterSource[];
  cleaningManifest: SenaEnterpriseImportCleaningManifest;
};

type UploadLike = {
  name: string;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const transcriptCodeColors = ["#2563eb", "#14b8a6", "#a855f7", "#f97316", "#ec4899", "#22c55e"];

/**
 * Forum/LMS tag lists split on any of "|", ";", ",". Source-format tolerance
 * like this lives in the adapters; the five-table contract itself splits
 * multi-value cells on "|" only (ADR-0007 D2), so adapters emit "|"-joined
 * cells.
 */
function legacyCodeList(value: string) {
  return value.split(/[|;,]/).map((code) => code.trim()).filter(Boolean);
}

function scalar(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("|");
  return String(value).trim();
}

function rowsToTable(name: string, rows: SenaImportRow[], tableOverride?: SenaMappedTable["table"]): SenaMappedTable {
  const table = tableOverride ?? inferSenaTableFromName(name);
  const columns = columnsFromRows(rows);

  return {
    name,
    table,
    columns,
    rows,
    mapping: inferSenaColumnMapping(table, columns)
  };
}

function columnsFromRows(rows: SenaImportRow[]) {
  return Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
}

function datasetToTables(dataset: SenaDataset, name: string): SenaMappedTable[] {
  // A per-file dataset build is validation scaffolding: the placeholders
  // addDerivedContractRows mints are reconstruction artifacts, not declarations,
  // and must not round-trip into the merged pass as declared roster rows — that
  // would seat a pass-1-minted interaction target on the roster (bypassing the
  // ADR-0010 gate, since a roster-less file legitimately derives its targets in
  // isolation) and shadow a real declared row of the same id from another file.
  // The merged pass re-derives contribution-shaped placeholders identically;
  // only the roster verdict changes.
  //
  // Which rows are placeholders is asked of the minting code, never inferred
  // from the row's contents. The old group:"Derived"-and-label===id convention
  // matched an analyst-declared `{"person_id":"P3","group":"Derived"}` just as
  // well (normalizePeople defaults label to id), so a declared isolate — or one
  // reachable only as an interaction target — was dropped here with no warning,
  // and this route reported a smaller N than the browser/JSON route for the
  // same contract. A declared row survives whatever its group and label.
  const declaredPeople = dataset.people.filter((person) => !isDerivedPlaceholderPerson(person));
  // A file contributes only the tables it actually has rows for. Synthesizing an
  // empty one made buildSenaDatasetFromTables demand its required fields of a
  // table the analyst never uploaded — zero rows means zero columns, so the
  // inferred mapping cannot name any field — and inflated
  // missingTableWarningCount with each phantom. Omitting the table lets the
  // merged pass emit its "<table> is not uploaded" note instead, the same
  // disclosure the browser/JSON route gives the same contract.
  //
  // The check is not relaxed for zero-row tables generally, and this is the only
  // place it can be dropped safely: a table reconstructed from a finished
  // dataset cannot have been header-only, because the columns are recomputed
  // from the rows. A header-only people.csv/interactions.csv the analyst *did*
  // upload keeps its real parsed columns on the CSV route and still has its
  // required fields verified.
  const uploadedTable = (table: SenaMappedTable["table"], rows: SenaImportRow[]) =>
    rows.length > 0 ? [rowsToTable(`${name}-${table}`, rows, table)] : [];
  return [
    ...uploadedTable("people", declaredPeople as unknown as SenaImportRow[]),
    ...uploadedTable("interactions", dataset.interactions as unknown as SenaImportRow[]),
    ...uploadedTable("utterances", dataset.utterances as unknown as SenaImportRow[]),
    ...uploadedTable("coded_segments", dataset.coded_segments as unknown as SenaImportRow[]),
    ...uploadedTable("codebook", dataset.codebook as unknown as SenaImportRow[])
  ];
}

function extractCodes(text: string) {
  const hashCodes = Array.from(text.matchAll(/#([A-Za-z][\w-]+)/g)).map((match) => match[1]);
  const bracketCodes = Array.from(text.matchAll(/\{\{([^}]+)\}\}/g)).map((match) => match[1]);
  return Array.from(new Set([...hashCodes, ...bracketCodes].map((code) => code.trim()).filter(Boolean)));
}

function normalizeSubtitleTranscriptText(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n");
  const normalized: string[] = [];
  let block: string[] = [];

  function flushBlock() {
    const compact = block.map((line) => line.trim()).filter(Boolean);
    block = [];
    if (compact[0]?.toUpperCase().startsWith("WEBVTT")) return;
    if (/^\d+$/.test(compact[0] ?? "")) compact.shift();
    const timestampIndex = compact.findIndex((line) => line.includes("-->"));
    if (timestampIndex < 0) return;
    const [start] = compact[timestampIndex].split("-->");
    const cueText = compact.slice(timestampIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!cueText) return;
    normalized.push(`[${start.trim()}] ${cueText}`);
  }

  for (const line of lines) {
    if (line.trim() === "") {
      flushBlock();
    } else {
      block.push(line);
    }
  }
  flushBlock();
  return normalized.join("\n");
}

function cleanTranscriptText(text: string, name: string): { dataset: SenaDataset; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Stage thirds must divide by the number of PARSED speaker turns, not the raw
  // non-empty line count: unparseable lines (headers, lone timestamps, dividers)
  // are skipped, and dividing by all lines would push every real turn into
  // "Plan" and leave "Reflect" empty whenever a transcript carries noise lines.
  const speakerLinePattern = /^(?:\[([^\]]+)\]\s*)?([^:：]{1,80})[:：]\s*(.+)$/;
  const parsedTurnCount = lines.filter((line) => speakerLinePattern.test(line)).length;

  const speakerIds = new Map<string, string>();
  const utterances: SenaDataset["utterances"] = [];
  const coded_segments: SenaDataset["coded_segments"] = [];
  const interactions: SenaDataset["interactions"] = [];
  const codes = new Map<string, SenaCode>();
  let previousSpeaker: string | null = null;

  lines.forEach((line, index) => {
    const match = line.match(speakerLinePattern);
    if (!match) {
      warnings.push(`Transcript line ${index + 1} did not match "Speaker: text" and was skipped.`);
      return;
    }
    const speaker = match[2].trim();
    const personId = speakerIds.get(speaker) ?? `p-${speakerIds.size + 1}`;
    speakerIds.set(speaker, personId);
    const turnIndex = utterances.length + 1;
    const utteranceId = `u-${turnIndex}`;
    const rawText = match[3].trim();
    const lineCodes = extractCodes(rawText);
    const stage = turnIndex <= Math.ceil(parsedTurnCount / 3)
      ? "Plan"
      : turnIndex <= Math.ceil((parsedTurnCount * 2) / 3)
        ? "Teach"
        : "Reflect";

    utterances.push({
      id: utteranceId,
      personId,
      unitId: name.replace(/\W+/g, "-").toLowerCase() || "transcript",
      stanzaId: `stanza-${Math.ceil(turnIndex / 3)}`,
      stage,
      turnIndex,
      text: rawText,
      timestamp: match[1] || undefined
    });

    if (previousSpeaker && previousSpeaker !== personId) {
      interactions.push({
        source: previousSpeaker,
        target: personId,
        weight: 1,
        channel: "transcript-adjacency",
        stage,
        turnIndex,
        evidence: rawText
      });
    }
    previousSpeaker = personId;

    if (lineCodes.length > 0) {
      coded_segments.push({
        segmentId: `cs-${turnIndex}`,
        utteranceId,
        personId,
        unitId: name.replace(/\W+/g, "-").toLowerCase() || "transcript",
        stanzaId: `stanza-${Math.ceil(turnIndex / 3)}`,
        stage,
        turnIndex,
        text: rawText,
        codes: lineCodes,
        confidence: 1
      });
      lineCodes.forEach((code) => {
        if (!codes.has(code)) {
          codes.set(code, {
            id: code,
            label: code,
            family: "Transcript tag",
            description: "Derived from transcript hashtag or {{code}} marker.",
            color: transcriptCodeColors[codes.size % transcriptCodeColors.length]
          });
        }
      });
    }
  });

  if (coded_segments.length === 0) {
    warnings.push("Transcript was cleaned into utterances and adjacency interactions, but no #code or {{code}} markers were found.");
  }

  const people = Array.from(speakerIds.entries()).map(([label, id]) => ({
    id,
    label,
    role: "Participant",
    group: "Transcript",
    initials: label.slice(0, 2).toUpperCase()
  }));

  return {
    dataset: {
      people,
      interactions,
      utterances,
      coded_segments,
      codebook: Array.from(codes.values()),
      warnings
    },
    warnings
  };
}

function firstString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const found = scalar(value[key]);
    if (found) return found;
  }
  return "";
}

function normalizedColumnSet(columns: string[]) {
  return new Set(columns.map((column) => column.toLowerCase().replace(/[^a-z0-9]/g, "")));
}

function hasColumn(columns: Set<string>, aliases: string[]) {
  return aliases.some((alias) => columns.has(alias.toLowerCase().replace(/[^a-z0-9]/g, "")));
}

function looksLikeForumExport(columns: string[]) {
  const normalized = normalizedColumnSet(columns);
  const hasThreadContext = hasColumn(normalized, ["discussion_id", "thread_id", "topic_id", "forum_id", "conversation_id"]);
  const hasPostIdentity = hasColumn(normalized, ["post_id", "message_id", "entry_id", "id"]);
  const hasAuthorIdentity = hasColumn(normalized, [
    "author_id",
    "author",
    "author_name",
    "author_email",
    "user_id",
    "user_name",
    "person_id",
    "display_name"
  ]);
  const hasPostText = hasColumn(normalized, ["message", "content", "body", "text", "raw"]);
  const hasForumSignal = hasColumn(normalized, [
    "parent_post_id",
    "reply_to_post_id",
    "reply_to_person_id",
    "parent_author_id",
    "discussion_id",
    "thread_id",
    "topic_id",
    "tags"
  ]);
  return hasThreadContext && hasPostIdentity && hasAuthorIdentity && hasPostText && hasForumSignal;
}

function normalizeForumRows(rows: unknown[]): SenaImportRow[] {
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row))
    .map((row, index) => {
      const author = row.author && typeof row.author === "object" && !Array.isArray(row.author)
        ? row.author as Record<string, unknown>
        : row.user && typeof row.user === "object" && !Array.isArray(row.user)
          ? row.user as Record<string, unknown>
          : row;
      const authorId = firstString(author, [
        "id",
        "author_id",
        "user_id",
        "person_id",
        "email",
        "author_email",
        "name",
        "display_name",
        "user_name",
        "username"
      ]) || `author-${index + 1}`;
      const authorName = firstString(author, [
        "author_name",
        "name",
        "display_name",
        "label",
        "email",
        "author_email",
        "user_name",
        "username"
      ]) || authorId;
      const text = firstString(row, ["text", "message", "content", "body", "raw"]) || "";
      const postId = firstString(row, ["id", "post_id", "message_id", "entry_id"]) || `post-${index + 1}`;
      const replyTo = firstString(row, [
        "reply_to_person_id",
        "reply_to_author_id",
        "reply_to_author",
        "parent_author_id",
        "parent_user_id",
        "reply_to_user_id",
        "target"
      ]);
      const parentPostId = firstString(row, [
        "parent_post_id",
        "parent_id",
        "reply_to_post_id",
        "reply_to_id",
        "in_reply_to_id",
        "parent_message_id"
      ]);
      const explicitCodes = Array.isArray(row.tags)
        ? row.tags.map(scalar).filter(Boolean).join("|")
        : firstString(row, ["codes", "tags", "tag", "labels", "category", "hashtags"]);
      const codes = explicitCodes || extractCodes(text).join("|");
      return {
        post_id: postId,
        person_id: authorId,
        label: authorName,
        text,
        timestamp: firstString(row, ["created_at", "timestamp", "date", "posted_at", "created", "time"]),
        turn_index: scalar(row.turn_index) || String(index + 1),
        thread_id: firstString(row, ["thread_id", "discussion_id", "conversation_id", "topic_id", "forum_id"]) || "forum-thread",
        parent_post_id: parentPostId,
        reply_to_person_id: replyTo,
        codes,
        stage: firstString(row, ["stage", "phase", "session", "activity"]) || "Forum"
      };
    });
}

function forumPostsFromJson(value: unknown): SenaImportRow[] {
  const root = value as Record<string, unknown>;
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(root.posts)
      ? root.posts
      : Array.isArray(root.messages)
        ? root.messages
        : Array.isArray(root.discussions)
          ? root.discussions
          : [];

  return normalizeForumRows(candidates);
}

function adaptForumRows(rows: unknown[], name: string): { dataset: SenaDataset; warnings: string[] } {
  const warnings: string[] = [];
  const posts = normalizeForumRows(rows).flatMap((post, index) => {
    if (!scalar(post.text)) {
      warnings.push(`Forum row ${index + 1} is missing message text and was skipped.`);
      return [];
    }
    if (!scalar(post.person_id)) {
      warnings.push(`Forum row ${index + 1} is missing author identity and was skipped.`);
      return [];
    }
    return [post];
  });
  if (posts.length === 0) throw new Error("Forum/LMS export did not contain importable posts or messages.");
  const authorByPost = new Map(posts.map((post) => [scalar(post.post_id), scalar(post.person_id)]));
  // Reply-to fields can reference an author by a different representation than
  // the one that became the canonical person_id (e.g. author display name vs.
  // author id). Map both the id form (post.person_id) and the name form
  // (post.label) back to the canonical id so reply ties are not silently
  // dropped as "unknown person" by the social-matrix builder. Ids are indexed
  // first so they win over any colliding label.
  const personIdentityIndex = new Map<string, string>();
  for (const post of posts) {
    const personId = scalar(post.person_id);
    if (personId) personIdentityIndex.set(personId, personId);
  }
  for (const post of posts) {
    const personId = scalar(post.person_id);
    const label = scalar(post.label);
    if (personId && label && !personIdentityIndex.has(label)) personIdentityIndex.set(label, personId);
  }
  const resolvePersonIdentity = (value: string) => (value ? personIdentityIndex.get(value) ?? value : "");
  // Stricter resolver for directed B_CP evidence (ADR-0006 D1): only a target that
  // resolves to a *known* author may be declared, and it must survive the
  // multi-value coded_segments field, which since ADR-0007 D2 splits on "|"
  // only. A display-name roster keyed "Last, First" (the standard LMS export
  // form, bug G1) therefore round-trips verbatim and IS declared — the loss
  // path is closed. Only an id carrying "|" itself remains inexpressible; it is
  // reported and left empty, which preserves the B_PC transpose fallback and
  // never invents a target.
  const segmentTargetDelimiter = /[|]/;
  const resolveDeclaredTarget = (value: string, postId: string) => {
    if (!value) return "";
    const resolved = personIdentityIndex.get(value);
    if (!resolved) {
      warnings.push(`Forum post ${postId} replies to "${value}", which does not match any author in this export; no directed code-to-person evidence was recorded for it.`);
      return "";
    }
    if (segmentTargetDelimiter.test(resolved)) {
      warnings.push(`Forum post ${postId} replies to author id "${resolved}", which contains "|" — the multi-value separator — and cannot be recorded as directed code-to-person evidence; the reply still contributes to the social layer.`);
      return "";
    }
    return resolved;
  };
  const utteranceTable = rowsToTable(`${name}-utterances`, posts);
  utteranceTable.table = "utterances";
  utteranceTable.mapping = inferSenaColumnMapping("utterances", utteranceTable.columns);

  const peopleRows = Array.from(new Map(posts.map((post) => [
    scalar(post.person_id),
    { id: post.person_id, label: post.label, role: "Participant", group: "LMS/forum" }
  ])).values()) as SenaImportRow[];
  const peopleTable = rowsToTable(`${name}-people`, peopleRows);
  peopleTable.table = "people";
  peopleTable.mapping = inferSenaColumnMapping("people", peopleTable.columns);

  const interactionRows = posts.flatMap<SenaImportRow>((post, index) => {
    const target = resolvePersonIdentity(
      scalar(post.reply_to_person_id) || authorByPost.get(scalar(post.parent_post_id)) || ""
    );
    if (!target) return [];
    return [{
      source: scalar(post.person_id),
      target,
      weight: 1,
      channel: "reply",
      stage: scalar(post.stage) || "Forum",
      turn_index: scalar(post.turn_index) || String(index + 1),
      evidence: scalar(post.text)
    }];
  });
  const interactionTable = rowsToTable(`${name}-interactions`, interactionRows);
  interactionTable.table = "interactions";
  interactionTable.mapping = inferSenaColumnMapping("interactions", interactionTable.columns);

  const segmentRows = posts
    .filter((post) => scalar(post.codes))
    .map((post, index) => {
      // ADR-0006 D1: a reply's coded contribution is *addressed to* the parent
      // author, so record it as directed B_CP (code -> person) evidence rather
      // than leaving forum imports on the B_PC transpose fallback. Resolve the
      // target through the same identity index as the S-layer reply interaction,
      // but strictly: an unresolved or separator-bearing id is reported and left
      // empty (transpose fallback preserved) rather than passed through, which
      // would fabricate people downstream. This is addressed-to, not uptake —
      // reports must not read it as adoption of the parent's ideas.
      const replyTarget = resolveDeclaredTarget(
        scalar(post.reply_to_person_id) || authorByPost.get(scalar(post.parent_post_id)) || "",
        scalar(post.post_id) || `#${index + 1}`
      );
      const directedTarget = replyTarget && replyTarget !== scalar(post.person_id) ? replyTarget : "";
      return {
        segment_id: `cs-${post.post_id || index + 1}`,
        utterance_id: post.post_id,
        person_id: post.person_id,
        target_person_ids: directedTarget,
        unit_id: post.thread_id,
        stanza_id: post.thread_id,
        stage: post.stage || "Forum",
        turn_index: post.turn_index,
        text: post.text,
        // Forum tag columns are researcher-authored lists where ","/";" are
        // common separators. That tolerance belongs here, at the adapter
        // boundary: normalize to the contract's canonical "|" join so the
        // pipe-only splitter (ADR-0007 D2) reads the same code list the old
        // any-delimiter splitter did.
        codes: legacyCodeList(scalar(post.codes)).join("|"),
        confidence: 1
      };
    }) as SenaImportRow[];
  const segmentTable = rowsToTable(`${name}-coded_segments`, segmentRows);
  segmentTable.table = "coded_segments";
  segmentTable.mapping = inferSenaColumnMapping("coded_segments", segmentTable.columns);

  const codeRows = Array.from(new Set(segmentRows.flatMap((row) => legacyCodeList(scalar(row.codes)))))
    .map((code, index) => ({
      id: code,
      label: code,
      family: "LMS/forum tag",
      description: "Derived from LMS/forum tag or hashtag.",
      color: transcriptCodeColors[index % transcriptCodeColors.length]
    })) as SenaImportRow[];
  const codebookTable = rowsToTable(`${name}-codebook`, codeRows);
  codebookTable.table = "codebook";
  codebookTable.mapping = inferSenaColumnMapping("codebook", codebookTable.columns);

  if (segmentRows.length === 0) {
    warnings.push("Forum/LMS export was cleaned into utterances and reply interactions, but no tags, codes, or hashtag markers were found.");
  }

  // Same rule as datasetToTables, at the other place this module synthesizes the
  // five-table contract: a thread with no replies and no tags produces empty
  // interaction/segment/codebook tables, and passing those on reported their
  // required fields missing — a mapping fault the analyst cannot act on and did
  // not commit. buildSenaDatasetFromTables discloses the absent tables instead.
  const result = buildSenaDatasetFromTables(
    [peopleTable, interactionTable, utteranceTable, segmentTable, codebookTable]
      .filter((table) => table.rows.length > 0)
  );
  return { dataset: result.dataset, warnings: [...warnings, ...result.warnings] };
}

function adaptForumJson(value: unknown, name: string): { dataset: SenaDataset; warnings: string[] } {
  const posts = forumPostsFromJson(value);
  if (posts.length === 0) throw new Error("Forum/LMS JSON did not contain posts, messages, or discussions.");
  return adaptForumRows(posts, name);
}

async function readExcelImport(buffer: ArrayBuffer, name: string): Promise<{
  tables: SenaMappedTable[];
  profile: SenaImportAdapterSource["profile"];
  rows: number;
  warnings: string[];
}> {
  const workbook = await readXlsxWorkbookRows(buffer);
  const tables: SenaMappedTable[] = [];
  const warnings: string[] = [];
  let forumRows = 0;
  let tableRows = 0;

  workbook.forEach(({ name: sheetName, rows }) => {
    if (rows.length === 0) return;
    if (looksLikeForumExport(columnsFromRows(rows))) {
      const adapted = adaptForumRows(rows, `${name}:${sheetName}`);
      tables.push(...datasetToTables(adapted.dataset, `${name}:${sheetName}`));
      warnings.push(...adapted.warnings);
      forumRows += adapted.dataset.utterances.length;
      return;
    }
    tables.push(rowsToTable(`${name}:${sheetName}`, rows));
    tableRows += rows.length;
  });

  return {
    tables,
    profile: forumRows > 0 && tableRows === 0 ? "lms-forum-export" : "excel-workbook",
    rows: forumRows + tableRows,
    warnings
  };
}

function transformationsForProfile(profile: SenaImportAdapterSource["profile"]) {
  if (profile === "dataset-metadata") {
    return [
      "dataset governance metadata attachment",
      "consent/retention/pseudonymization declaration",
      "codebook version binding"
    ];
  }
  if (profile === "cleaned-transcript") {
    return [
      "subtitle cue normalization",
      "speaker-turn parsing",
      "hashtag/{{code}} marker extraction",
      "adjacent-speaker interaction derivation",
      "Plan/Teach/Reflect stage heuristic"
    ];
  }
  if (profile === "lms-forum-json") {
    return [
      "post/message normalization",
      "author identity mapping",
      "reply-to interaction derivation",
      "reply-target directed B_CP evidence",
      "tag/hashtag code extraction"
    ];
  }
  if (profile === "lms-forum-export") {
    return [
      "thread/post table normalization",
      "author identity mapping",
      "parent-post reply derivation",
      "reply-target directed B_CP evidence",
      "tag/hashtag code extraction"
    ];
  }
  if (profile === "excel-workbook") return ["worksheet table inference", "column alias mapping"];
  if (profile === "csv-table") return ["filename table inference", "column alias mapping"];
  return ["SENA contract validation", "contract table expansion"];
}

function countWarnings(warnings: string[], pattern: RegExp) {
  return warnings.filter((warning) => pattern.test(warning)).length;
}

function buildCleaningManifest(
  sources: SenaImportAdapterSource[],
  warnings: string[],
  dataset: SenaDataset
): SenaEnterpriseImportCleaningManifest {
  const adapterProfiles = Array.from(new Set(sources.map((source) => source.profile))).sort();
  const derivedPlaceholderCount = countWarnings(warnings, /derived (?:a placeholder|utterances)/i);
  const skippedRowCount = countWarnings(warnings, /was skipped/i);
  const duplicateRowCount = countWarnings(warnings, /duplicate/i);
  const missingTableWarningCount = countWarnings(warnings, /missing|not uploaded/i);
  const transcriptNoCodeMarkerCount = countWarnings(warnings, /no #code|no .*code.*markers/i);
  const checks: SenaEnterpriseImportCleaningManifest["checks"] = [
    {
      id: "adapter-profile-coverage",
      label: "Adapter profile coverage",
      status: sources.length > 0 ? "pass" : "review",
      evidence: [
        `files=${sources.length}`,
        `profiles=${adapterProfiles.join("|") || "none"}`,
        `rows=${sources.reduce((total, source) => total + source.rows, 0)}`
      ],
      nextAction: sources.length > 0
        ? "Review inferred adapter profiles before treating imported data as analysis-ready."
        : "Upload at least one supported SENA source file."
    },
    {
      id: "cleaning-warning-review",
      label: "Cleaning warning review",
      status: warnings.length === 0 ? "pass" : "review",
      evidence: [
        `warnings=${warnings.length}`,
        `derivedPlaceholders=${derivedPlaceholderCount}`,
        `skippedRows=${skippedRowCount}`,
        `duplicates=${duplicateRowCount}`,
        `missingTables=${missingTableWarningCount}`
      ],
      nextAction: warnings.length === 0
        ? "Keep this manifest with the import run for data lineage."
        : "Review warnings and rerun import after fixing skipped rows, duplicates, missing tables, or placeholders."
    },
    {
      id: "analysis-table-readiness",
      label: "Analysis table readiness",
      status: dataset.people.length > 0 && dataset.utterances.length > 0 && dataset.codebook.length > 0 ? "pass" : "review",
      evidence: [
        `people=${dataset.people.length}`,
        `interactions=${dataset.interactions.length}`,
        `utterances=${dataset.utterances.length}`,
        `codedSegments=${dataset.coded_segments.length}`,
        `codes=${dataset.codebook.length}`
      ],
      nextAction: dataset.people.length > 0 && dataset.utterances.length > 0 && dataset.codebook.length > 0
        ? "Proceed to model checks, coding reliability, and human review."
        : "Provide people, utterances, and codebook evidence before interpreting SENA outputs."
    }
  ];

  const recommendedNextActions = [
    ...(warnings.length > 0 ? ["Resolve cleaning warnings before publication-facing analysis."] : []),
    ...(transcriptNoCodeMarkerCount > 0 ? ["Add explicit #code or {{code}} markers, or upload coded_segments, before claiming coded discourse evidence."] : []),
    ...(derivedPlaceholderCount > 0 ? ["Replace derived placeholder people/codes with reviewed metadata."] : []),
    "Archive this cleaning manifest with the project, import run, and review packet."
  ];

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.importCleaningManifest,
    summary: {
      fileCount: sources.length,
      totalSourceRows: sources.reduce((total, source) => total + source.rows, 0),
      adapterProfiles,
      warningCount: warnings.length,
      derivedPlaceholderCount,
      skippedRowCount,
      duplicateRowCount,
      missingTableWarningCount,
      transcriptNoCodeMarkerCount
    },
    sources: sources.map((source) => ({
      name: source.name,
      profile: source.profile,
      rows: source.rows,
      warningCount: source.warnings.length,
      transformations: transformationsForProfile(source.profile)
    })),
    checks,
    recommendedNextActions
  };
}

export async function importSenaEnterpriseFiles(files: UploadLike[]): Promise<SenaEnterpriseImportResult> {
  const tables: SenaMappedTable[] = [];
  const sources: SenaImportAdapterSource[] = [];
  const warnings: string[] = [];
  let datasetMetadata: SenaDatasetMetadata | undefined;

  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".xlsx")) {
      const excelImport = await readExcelImport(await file.arrayBuffer(), file.name);
      tables.push(...excelImport.tables);
      sources.push({ name: file.name, profile: excelImport.profile, rows: excelImport.rows, warnings: excelImport.warnings });
      warnings.push(...excelImport.warnings);
      continue;
    }
    if (lowerName.endsWith(".xls")) {
      throw new Error(`${file.name}: legacy .xls uploads are not accepted. Save the workbook as .xlsx, CSV, or JSON before importing.`);
    }

    const text = await file.text();
    if (lowerName.endsWith(".json")) {
      // A standalone governance metadata document lets five-CSV uploads carry
      // dataset.metadata (consent/retention/pseudonymization/codebook version)
      // that plain CSV tables cannot express.
      const standaloneMetadata = senaDatasetMetadataFromJson(text);
      if (standaloneMetadata) {
        datasetMetadata = standaloneMetadata;
        sources.push({ name: file.name, profile: "dataset-metadata", rows: 0, warnings: [] });
        continue;
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch (error) {
        throw new Error(`${file.name}: JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
      }
      // Route by shape instead of try-contract-catch-forum: a contract-shaped
      // payload that fails to import must surface the contract error, not the
      // forum adapter's unrelated "did not contain posts" message.
      if (looksLikeSenaContractJson(parsedJson)) {
        let contract: ReturnType<typeof importSenaJsonContract>;
        try {
          contract = importSenaJsonContract(parsedJson);
        } catch (error) {
          if (error instanceof SenaInputValidationError) throw error;
          throw new Error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (contract.dataset.metadata) datasetMetadata = contract.dataset.metadata;
        tables.push(...datasetToTables(contract.dataset, file.name));
        sources.push({ name: file.name, profile: "sena-contract", rows: contract.dataset.utterances.length, warnings: contract.warnings });
        warnings.push(...contract.warnings);
      } else {
        let adapted: ReturnType<typeof adaptForumJson>;
        try {
          adapted = adaptForumJson(parsedJson, file.name);
        } catch (error) {
          throw new Error(
            `${file.name}: ${error instanceof Error ? error.message : String(error)} ` +
            "If this file was meant to be a SENA JSON contract, its tables (people, interactions, utterances, coded_segments, codebook) must be top-level arrays."
          );
        }
        tables.push(...datasetToTables(adapted.dataset, file.name));
        sources.push({ name: file.name, profile: "lms-forum-json", rows: adapted.dataset.utterances.length, warnings: adapted.warnings });
        warnings.push(...adapted.warnings);
      }
      continue;
    }

    if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      const adapted = cleanTranscriptText(text, file.name);
      tables.push(...datasetToTables(adapted.dataset, file.name));
      sources.push({ name: file.name, profile: "cleaned-transcript", rows: adapted.dataset.utterances.length, warnings: adapted.warnings });
      warnings.push(...adapted.warnings);
      continue;
    }

    if (lowerName.endsWith(".srt") || lowerName.endsWith(".vtt")) {
      const adapted = cleanTranscriptText(normalizeSubtitleTranscriptText(text), file.name);
      tables.push(...datasetToTables(adapted.dataset, file.name));
      sources.push({ name: file.name, profile: "cleaned-transcript", rows: adapted.dataset.utterances.length, warnings: adapted.warnings });
      warnings.push(...adapted.warnings);
      continue;
    }

    const parsed = parseSenaCsv(text);
    // Ragged-row repairs are recorded per file so a truncated export shows up in the
    // cleaning manifest instead of silently becoming empty fields.
    const csvWarnings = parsed.warnings.map((warning) => `${file.name}: ${warning}`);
    if (looksLikeForumExport(parsed.columns)) {
      const adapted = adaptForumRows(parsed.rows, file.name);
      const forumWarnings = [...csvWarnings, ...adapted.warnings];
      tables.push(...datasetToTables(adapted.dataset, file.name));
      sources.push({ name: file.name, profile: "lms-forum-export", rows: adapted.dataset.utterances.length, warnings: forumWarnings });
      warnings.push(...forumWarnings);
      continue;
    }

    const table = rowsToTable(file.name, parsed.rows);
    table.columns = parsed.columns;
    table.mapping = inferSenaColumnMapping(table.table, parsed.columns);
    tables.push(table);
    sources.push({ name: file.name, profile: "csv-table", rows: parsed.rows.length, warnings: csvWarnings });
    warnings.push(...csvWarnings);
  }

  if (tables.length === 0) throw new Error("No supported SENA import tables were found.");
  const result = buildSenaDatasetFromTables(tables);
  if (datasetMetadata) result.dataset.metadata = datasetMetadata;
  // Adapter-level cleaning notes (ragged-row repairs, transcript/forum cleaning)
  // first, then the contract-level ones — the order applyMappedTables uses on the
  // browser route. They have to ride on the dataset, not just on this result:
  // buildSenaDataContractAudit reads dataset.warnings, so leaving them here alone
  // audited the same files "pass" through this route and "review" through the
  // browser one. Warnings are excluded from buildSenaDatasetContentHash, so
  // fingerprints are unaffected.
  // Per-file derivation verdicts are superseded by the merged pass: a person one
  // file derives can be declared by another, so only `result.warnings` carries
  // the authoritative placeholder/roster-gate disclosures (ADR-0010 D2). The
  // raw per-file copies stay on `sources` for provenance; dropping them here
  // keeps the combined manifest at exactly one copy of each.
  //
  // "<table> is not uploaded" is the same kind of per-file verdict, and it is
  // superseded the same way, for all five tables: no producer synthesizes an
  // empty table any more (neither datasetToTables nor the forum adapter), so
  // every file now reports the tables it lacks and the merged pass re-decides
  // each one — emitting it when no file supplied that table, and staying silent
  // when another file did. Keeping the per-file copies would either duplicate
  // the merged verdict or assert "not uploaded" about a table a sibling file
  // plainly uploaded. Files on the plain-CSV route never emit this verdict (one
  // table per file, no contract pass), so nothing is lost by filtering it.
  const perFileDerivationVerdicts = /derived a placeholder person from |derived solely from target_person_ids|declared people roster does not include|^(?:people|interactions|utterances|coded_segments|codebook) table is not uploaded/;
  const allWarnings = [...warnings.filter((warning) => !perFileDerivationVerdicts.test(warning)), ...result.warnings];
  result.dataset.warnings = allWarnings;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseImport,
    dataset: result.dataset,
    warnings: allWarnings,
    sources,
    cleaningManifest: buildCleaningManifest(sources, allWarnings, result.dataset)
  };
}

export type SenaImportDataGovernance = SenaAnalysisRunInput["dataGovernance"];

function hasOpaquePersonIds(dataset: SenaDataset) {
  return dataset.people.length > 0 && dataset.people.every((person) => /^p-\d+$/i.test(person.id));
}

/**
 * Derives dataset.metadata (consent, retention, pseudonymization, codebook) from
 * the governance block an enterprise import request carried.
 *
 * Both callers of importSenaEnterpriseFiles apply this before they build a
 * snapshot: the synchronous import route and the queued-job worker. It lives here
 * rather than beside either one because library code cannot import from a route
 * module — and while each held its own copy, the two could drift into persisting
 * different datasets, and so different projectSnapshotSha256 values, for the same
 * files and the same dataGovernance block.
 */
export function withSenaImportDatasetMetadata(
  dataset: SenaDataset,
  dataGovernance: SenaImportDataGovernance | undefined,
  generatedAt: string
): SenaDataset {
  if (dataset.metadata || !dataGovernance || !hasOpaquePersonIds(dataset)) return dataset;
  const consentScope = dataGovernance.consentScope?.trim();
  const retentionPolicy = dataGovernance.retentionPolicy?.trim();
  const irbApprovalId = dataGovernance.irbApprovalId?.trim();
  if (!consentScope || !retentionPolicy || !irbApprovalId) return dataset;

  return {
    ...dataset,
    metadata: {
      datasetVersion: `enterprise-import-${buildSenaStableContentHash({
        people: dataset.people.map((person) => person.id),
        utterances: dataset.utterances.map((utterance) => utterance.id),
        codedSegments: dataset.coded_segments.map((segment) => segment.segmentId),
        codebook: dataset.codebook.map((code) => code.id)
      })}`,
      consent: {
        instrument: irbApprovalId,
        date: dataGovernance.reviewedAt?.slice(0, 10) || generatedAt.slice(0, 10),
        scope: consentScope
      },
      retention: {
        policy: retentionPolicy
      },
      pseudonymization: {
        personIdPolicy: "opaque",
        rosterMapping: "not-stored"
      },
      codebook: {
        id: `enterprise-import-codebook-${buildSenaStableContentHash(dataset.codebook.map((code) => code.id))}`,
        version: "imported-v1",
        contentHash: buildSenaStableContentHash(dataset.codebook)
      }
    }
  };
}

export type SenaReliabilityUploadFile = {
  name: string;
  bytes: Buffer;
};

/**
 * Picks the parser for a reliability upload by extension.
 *
 * Shared by the synchronous reliability route and the queued-job worker for the
 * same reason as withSenaImportDatasetMetadata above: a queued run has to score
 * the same rows out of the same file the direct run would, and two copies of this
 * dispatch had already drifted — only one of them rejected legacy .xls, so a
 * queued .xls was read as CSV and scored as whatever its binary bytes happened to
 * parse into.
 */
export async function readSenaReliabilityUploadRows(
  file: SenaReliabilityUploadFile
): Promise<{ rows: SenaImportRow[]; warnings: string[]; rawRowCount: number }> {
  assertSenaReliabilitySourceBytesWithinLimits([file.bytes.byteLength], "files");
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const workbook = await readXlsxWorkbookRows(file.bytes);
    const rawRowCount = assertSenaReliabilityCombinedRawRowsWithinLimits(workbook.map((sheet) => sheet.rows));
    return { rows: workbook.flatMap((sheet) => sheet.rows), warnings: [], rawRowCount };
  }
  if (lower.endsWith(".xls")) {
    throw new Error(`${file.name}: legacy .xls reliability uploads are not accepted. Save the workbook as .xlsx, CSV, or JSON before uploading.`);
  }
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(file.bytes.toString("utf8"));
    const record = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
    const rawRowGroups = Array.isArray(parsed)
      ? [parsed]
      : [record?.annotations, record?.rows, record?.data].filter(Array.isArray);
    if (record && rawRowGroups.length === 0) rawRowGroups.push([record]);
    const rawRowCount = assertSenaReliabilityCombinedRawRowsWithinLimits(rawRowGroups);
    // Preserve one canonical semantic table while admission above counts every
    // supplied alias, including precedence-ignored arrays.
    const rawRows = rawRowGroups[0] ?? [];
    return {
      rows: rawRows.filter((row) => typeof row === "object" && row !== null && !Array.isArray(row)),
      warnings: [],
      rawRowCount
    };
  }
  const parsed = parseSenaCsv(file.bytes.toString("utf8"));
  const rawRowCount = assertSenaReliabilityCombinedRawRowsWithinLimits([parsed.rows]);
  // Ragged-row repairs are recorded per file; the padded empty value cell is
  // then skipped (with its own disclosure) by parseCoderAnnotationsFromRows
  // instead of being read as an applied code that moves kappa/alpha.
  return {
    rows: parsed.rows,
    warnings: parsed.warnings.map((warning) => `${file.name}: ${warning}`),
    rawRowCount
  };
}
