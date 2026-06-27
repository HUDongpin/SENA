import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type {
  SenaDataContractAudit,
  SenaDataContractAuditArtifact,
  SenaDataContractAuditItem,
  SenaDataset,
  SenaModel,
  SenaTemporalWindow
} from "./types";

export type SenaDataContractAuditOptions = {
  modelWarnings?: string[];
};

export type SenaDataContractAuditArtifactOptions = SenaDataContractAuditOptions & {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
};

function asArray<T>(root: Record<string, unknown>, key: string): T[] {
  const value = root[key];
  return Array.isArray(value) ? value as T[] : [];
}

function isArrayField(root: Record<string, unknown>, key: string) {
  return Array.isArray(root[key]);
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueWarnings(warnings: Array<string | undefined>) {
  return Array.from(new Set(warnings.filter((warning): warning is string => Boolean(warning?.trim()))));
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

function datasetCounts(dataset: SenaDataset) {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

function item(
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
  detail: string[]
): SenaDataContractAuditItem {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    expected,
    actual,
    detail
  };
}

export function buildSenaDataContractAudit(
  dataset: SenaDataset,
  options: SenaDataContractAuditOptions = {}
): SenaDataContractAudit {
  const root = dataset as unknown as Record<string, unknown>;
  const people = asArray<SenaDataset["people"][number]>(root, "people");
  const interactions = asArray<SenaDataset["interactions"][number]>(root, "interactions");
  const utterances = asArray<SenaDataset["utterances"][number]>(root, "utterances");
  const codedSegments = asArray<SenaDataset["coded_segments"][number]>(root, "coded_segments");
  const codebook = asArray<SenaDataset["codebook"][number]>(root, "codebook");
  const counts = datasetCounts({
    people,
    interactions,
    utterances,
    coded_segments: codedSegments,
    codebook,
    warnings: dataset.warnings
  });
  const warnings = uniqueWarnings([...(dataset.warnings ?? []), ...(options.modelWarnings ?? [])]);

  const personIds = people.map((person) => person.id).filter(nonEmpty);
  const personIdSet = new Set(personIds);
  const duplicatePersonIds = duplicateValues(personIds);
  const blankPersonIds = people.length - personIds.length;
  const blankPersonLabels = people.filter((person) => !nonEmpty(person.label)).length;
  const derivedPeople = people.filter((person) => person.group === "Derived" || dataset.warnings?.some((warning) => warning.includes(`"${person.id}"`) && warning.includes("placeholder person"))).length;

  const codeIds = codebook.map((code) => code.id).filter(nonEmpty);
  const codeIdSet = new Set(codeIds);
  const duplicateCodeIds = duplicateValues(codeIds);
  const blankCodeIds = codebook.length - codeIds.length;
  const blankCodeLabels = codebook.filter((code) => !nonEmpty(code.label)).length;
  const derivedCodes = codebook.filter((code) => code.family === "Derived" || dataset.warnings?.some((warning) => warning.includes(`"${code.id}"`) && warning.includes("placeholder code"))).length;

  const utteranceIds = utterances.map((utterance) => utterance.id).filter(nonEmpty);
  const utteranceIdSet = new Set(utteranceIds);
  const utteranceById = new Map(utterances.filter((utterance) => nonEmpty(utterance.id)).map((utterance) => [utterance.id, utterance]));
  const duplicateUtteranceIds = duplicateValues(utteranceIds);
  const utteranceMissingPeople = utterances.filter((utterance) => !personIdSet.has(utterance.personId));
  const utteranceBadTurns = utterances.filter((utterance) => !Number.isFinite(utterance.turnIndex));

  const segmentIds = codedSegments.map((segment) => segment.segmentId).filter(nonEmpty);
  const duplicateSegmentIds = duplicateValues(segmentIds);
  const blankSegmentIds = codedSegments.length - segmentIds.length;
  const segmentMissingUtterances = codedSegments.filter((segment) => !utteranceIdSet.has(segment.utteranceId));
  const segmentMissingPeople = codedSegments.filter((segment) => !personIdSet.has(segment.personId));
  const segmentMissingCodes = codedSegments.flatMap((segment) => segment.codes.filter((code) => !codeIdSet.has(code)).map((code) => `${segment.segmentId}:${code}`));
  const segmentEmptyCodes = codedSegments.filter((segment) => segment.codes.length === 0);
  const segmentBadTurns = codedSegments.filter((segment) => !Number.isFinite(segment.turnIndex));
  const segmentBadConfidence = codedSegments.filter((segment) => segment.confidence !== undefined && !Number.isFinite(segment.confidence));
  const segmentAlignmentIssues = codedSegments.flatMap((segment) => {
    const utterance = utteranceById.get(segment.utteranceId);
    if (!utterance) return [];
    const issues: string[] = [];
    if (nonEmpty(segment.personId) && segment.personId !== utterance.personId) issues.push("person");
    if (nonEmpty(segment.stage) && segment.stage !== utterance.stage) issues.push("stage");
    if (nonEmpty(segment.stanzaId) && segment.stanzaId !== utterance.stanzaId) issues.push("stanza");
    if (Number.isFinite(segment.turnIndex) && segment.turnIndex !== utterance.turnIndex) issues.push("turn");
    return issues.length > 0 ? [`${segment.segmentId}:${issues.join("+")}`] : [];
  });

  const interactionMissingPeople = interactions.filter((interaction) => !personIdSet.has(interaction.source) || !personIdSet.has(interaction.target));
  const interactionBadWeights = interactions.filter((interaction) => interaction.weight !== undefined && (!Number.isFinite(interaction.weight) || interaction.weight < 0));
  const interactionBadTurns = interactions.filter((interaction) => interaction.turnIndex !== undefined && !Number.isFinite(interaction.turnIndex));

  const stageValues = new Set([
    ...utterances.map((utterance) => utterance.stage),
    ...codedSegments.map((segment) => segment.stage),
    ...interactions.map((interaction) => interaction.stage)
  ].filter((stage) => nonEmpty(stage) && stage !== "Unstaged"));
  const stanzaValues = new Set([
    ...utterances.map((utterance) => utterance.stanzaId),
    ...codedSegments.map((segment) => segment.stanzaId)
  ].filter(nonEmpty));

  const items = [
    item(
      "five-table-shape",
      "Five-table contract shape",
      ["people", "interactions", "utterances", "coded_segments", "codebook"].every((key) => isArrayField(root, key)) &&
        counts.people > 0 &&
        counts.interactions > 0 &&
        counts.utterances > 0 &&
        counts.codedSegments > 0 &&
        counts.codes >= 2,
      "people, interactions, utterances, coded_segments, and codebook arrays with pilot-ready row counts",
      `${counts.people} people, ${counts.interactions} interactions, ${counts.utterances} utterances, ${counts.codedSegments} coded segments, ${counts.codes} codes`,
      [
        `people array=${isArrayField(root, "people")}`,
        `interactions array=${isArrayField(root, "interactions")}`,
        `utterances array=${isArrayField(root, "utterances")}`,
        `coded_segments array=${isArrayField(root, "coded_segments")}`,
        `codebook array=${isArrayField(root, "codebook")}`
      ]
    ),
    item(
      "people-table",
      "People identifiers",
      people.length > 0 && blankPersonIds === 0 && duplicatePersonIds.length === 0 && blankPersonLabels === 0,
      "Every person has a unique id and display label",
      `${people.length} people; ${blankPersonIds} blank ids; ${duplicatePersonIds.length} duplicate ids; ${blankPersonLabels} blank labels`,
      [
        `derivedPlaceholders=${derivedPeople}`,
        duplicatePersonIds.length > 0 ? `duplicates=${duplicatePersonIds.join(", ")}` : "duplicates=none"
      ]
    ),
    item(
      "codebook-table",
      "Codebook identifiers",
      codebook.length >= 2 && blankCodeIds === 0 && duplicateCodeIds.length === 0 && blankCodeLabels === 0,
      "At least two unique code ids with labels for ENA code-pair construction",
      `${codebook.length} codes; ${blankCodeIds} blank ids; ${duplicateCodeIds.length} duplicate ids; ${blankCodeLabels} blank labels`,
      [
        `derivedPlaceholders=${derivedCodes}`,
        duplicateCodeIds.length > 0 ? `duplicates=${duplicateCodeIds.join(", ")}` : "duplicates=none"
      ]
    ),
    item(
      "utterances-table",
      "Utterance references",
      utterances.length > 0 && duplicateUtteranceIds.length === 0 && utteranceMissingPeople.length === 0 && utteranceBadTurns.length === 0,
      "Every utterance has a unique id, valid personId, and finite turnIndex",
      `${utterances.length} utterances; ${utteranceMissingPeople.length} person reference issues; ${utteranceBadTurns.length} turn issues`,
      [
        duplicateUtteranceIds.length > 0 ? `duplicates=${duplicateUtteranceIds.join(", ")}` : "duplicates=none",
        utteranceMissingPeople.slice(0, 5).map((utterance) => `${utterance.id}->${utterance.personId}`).join(", ") || "missingPeople=none"
      ]
    ),
    item(
      "coded-segments-table",
      "Coded-segment references",
      codedSegments.length > 0 &&
        blankSegmentIds === 0 &&
        duplicateSegmentIds.length === 0 &&
        segmentMissingUtterances.length === 0 &&
        segmentMissingPeople.length === 0 &&
        segmentMissingCodes.length === 0 &&
        segmentEmptyCodes.length === 0 &&
        segmentBadTurns.length === 0 &&
        segmentBadConfidence.length === 0 &&
        segmentAlignmentIssues.length === 0,
      "Every coded segment links to an utterance, person, and codebook code with aligned temporal fields",
      `${codedSegments.length} segments; ${segmentMissingUtterances.length} utterance issues; ${segmentMissingPeople.length} person issues; ${segmentMissingCodes.length} code issues`,
      [
        duplicateSegmentIds.length > 0 ? `duplicates=${duplicateSegmentIds.join(", ")}` : "duplicates=none",
        segmentMissingCodes.slice(0, 8).join(", ") || "missingCodes=none",
        segmentAlignmentIssues.slice(0, 8).join(", ") || "alignmentIssues=none"
      ]
    ),
    item(
      "interactions-table",
      "Interaction references",
      interactions.length > 0 && interactionMissingPeople.length === 0 && interactionBadWeights.length === 0 && interactionBadTurns.length === 0,
      "Every interaction references valid people and has finite nonnegative weight/turn fields when present",
      `${interactions.length} interactions; ${interactionMissingPeople.length} person reference issues; ${interactionBadWeights.length} weight issues; ${interactionBadTurns.length} turn issues`,
      [
        interactionMissingPeople.slice(0, 5).map((interaction) => `${interaction.source}->${interaction.target}`).join(", ") || "missingPeople=none",
        interactionBadWeights.slice(0, 5).map((interaction) => `${interaction.source}->${interaction.target}:${interaction.weight}`).join(", ") || "badWeights=none"
      ]
    ),
    item(
      "temporal-fields",
      "Temporal readiness",
      stageValues.size > 0 && stanzaValues.size > 0 && utteranceBadTurns.length === 0 && segmentBadTurns.length === 0,
      "Stage/stanza labels and finite turn indices are available for temporal windows",
      `${stageValues.size} stages, ${stanzaValues.size} stanzas, ${utteranceBadTurns.length + segmentBadTurns.length} turn issues`,
      [
        `stages=${Array.from(stageValues).join(", ") || "none"}`,
        `stanzas=${stanzaValues.size}`,
        `utteranceTurns=${utterances.length - utteranceBadTurns.length}/${utterances.length}`,
        `segmentTurns=${codedSegments.length - segmentBadTurns.length}/${codedSegments.length}`
      ]
    ),
    item(
      "import-and-model-warnings",
      "Import/model warnings",
      warnings.length === 0,
      "No import-derived placeholders or model reference warnings",
      `${warnings.length} warnings`,
      warnings.slice(0, 10).length > 0 ? warnings.slice(0, 10) : ["warnings=none"]
    )
  ];

  const passed = items.filter((entry) => entry.status === "pass").length;
  const reviewNeeded = items.length - passed;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.dataContractAudit,
    status: reviewNeeded === 0 ? "valid" : "needs-review",
    passed,
    reviewNeeded,
    items,
    notes: [
      "The data-contract audit checks the five-table SENA contract before mathematical interpretation.",
      "A valid contract means references and temporal fields are internally consistent; it does not certify coding reliability or substantive claims."
    ]
  };
}

export function buildSenaDataContractAuditArtifact(
  model: SenaModel,
  options: SenaDataContractAuditArtifactOptions = {}
): SenaDataContractAuditArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const warnings = uniqueWarnings([...(model.dataset.warnings ?? []), ...model.summary.warnings, ...(options.modelWarnings ?? [])]);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.dataContractAuditArtifact,
    title: options.title?.trim() || "SENA Data Contract Audit",
    generatedAt,
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      buildOptions: model.options,
      datasetCounts: datasetCounts(model.dataset),
      warnings
    },
    dataContractAudit: buildSenaDataContractAudit(model.dataset, { modelWarnings: warnings }),
    notes: [
      "Standalone artifact for checking people, interactions, utterances, coded_segments, and codebook integrity.",
      "Use this artifact before reporting S/W/B/G matrices, jENA outputs, jSNA metrics, or human-reviewed interpretations."
    ]
  };
}
