import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSenaDatasetContentHash,
  buildSenaDatasetFromTables,
  buildSenaModel,
  inferSenaColumnMapping,
  inferSenaTableFromName,
  importSenaJsonContract,
  isSenaProvenanceUnavailable,
  parseSenaCsv,
  senaAdditiveImportTables,
  senaImportTables,
  senaRecognizedImportTables
} from "../index";
import { exampleSenaContract } from "../sample-data";
import {
  SenaInputValidationError,
  validateSenaProjectSnapshotCanonicalInputs
} from "../analytical-input-validation";

function mappedCsv(name: "people" | "ai_agent_runs", csv: string) {
  const parsed = parseSenaCsv(csv);
  return {
    name,
    table: name,
    columns: parsed.columns,
    rows: parsed.rows,
    mapping: inferSenaColumnMapping(name, parsed.columns)
  };
}

describe("ADR-0013 ai_agent_runs provenance", () => {
  it("documents the sidecar fields and §8 guardrails in ADR-0013", () => {
    const adr = readFileSync(new URL("../../../../docs/adr/0013-ai-agent-runs-provenance.md", import.meta.url), "utf8");
    expect(adr).toContain("# ADR 0013: `ai_agent_runs` Provenance for Typed AI Actors");
    expect(adr).toContain("ADR-0006");
    expect(adr).toContain("provider");
    expect(adr).toContain("model_family");
    expect(adr).toContain("model_snapshot");
    expect(adr).toContain("deployment_id");
    expect(adr).toContain("api_version");
    expect(adr).toContain("agent_config_version");
    expect(adr).toContain("system_prompt_hash");
    expect(adr).toContain("temperature");
    expect(adr).toContain("top_p");
    expect(adr).toContain("seed");
    expect(adr).toContain("started_at");
    expect(adr).toContain("ended_at");
    expect(adr).toContain("unknown");
    expect(adr).toContain("not_exposed");
    expect(adr).toContain("Model Cards");
    expect(adr).toContain("NIST AI RMF");
    expect(adr).toContain("Never claim Human–AI SENA merely by putting an AI row in `people`");
    expect(adr).toContain("Never treat missing run provenance as optional when AI actors are present");
    expect(adr).toContain("No event ledger");
    expect(adr).toContain("C-P1");
  });

  it("keeps ai_agent_runs off the required five-table import list", () => {
    expect(senaImportTables.map((table) => table.value)).toEqual([
      "people",
      "interactions",
      "utterances",
      "coded_segments",
      "codebook"
    ]);
    expect(senaAdditiveImportTables.map((table) => table.value)).toEqual(["ai_agent_runs"]);
    expect(senaRecognizedImportTables.map((table) => table.value)).toContain("ai_agent_runs");
    expect(inferSenaTableFromName("ai_agent_runs.csv")).toBe("ai_agent_runs");
    expect(inferSenaTableFromName("people.csv")).toBe("people");
  });

  it("ignores an absent sidecar and does not warn that ai_agent_runs is missing", () => {
    const people = parseSenaCsv("person_id,label\nA,Ada\n");
    const fiveTable = buildSenaDatasetFromTables([
      {
        name: "people.csv",
        table: "people",
        columns: people.columns,
        rows: people.rows,
        mapping: inferSenaColumnMapping("people", people.columns)
      }
    ]);
    expect(Object.keys(fiveTable.dataset)).not.toContain("ai_agent_runs");
    expect(fiveTable.warnings.some((warning) => warning.includes("ai_agent_runs"))).toBe(false);

    const json = importSenaJsonContract({
      people: [{ person_id: "A", label: "Ada" }],
      interactions: [],
      utterances: [],
      coded_segments: [],
      codebook: []
    });
    expect(Object.keys(json.dataset)).not.toContain("ai_agent_runs");
    expect(json.warnings.some((warning) => warning.includes("ai_agent_runs"))).toBe(false);
  });

  it("parses run provenance, stores unknown/not_exposed, and covers AI actors", () => {
    const result = buildSenaDatasetFromTables([
      mappedCsv("people", "person_id,actor_type\nT1,ai_agent\nA,human\n"),
      mappedCsv(
        "ai_agent_runs",
        [
          "agent_run_id,actor_id,actor_instance_id,context_id,provider,model_family,model_snapshot,deployment_id,api_version,agent_config_version,system_prompt_hash,temperature,top_p,seed,started_at,ended_at",
          "run-1,T1,inst-1,,openai,gpt,gpt-4.1-2025-04-14,not_exposed,unknown,cfg-1,abc123,0.2,not_exposed,7,2026-09-18T00:00:00Z,",
          "run-skip,,"
        ].join("\n")
      )
    ]);

    expect(result.dataset.ai_agent_runs).toHaveLength(1);
    const run = result.dataset.ai_agent_runs?.[0];
    expect(run?.agentRunId).toBe("run-1");
    expect(run?.actorId).toBe("T1");
    expect(run?.actorInstanceId).toBe("inst-1");
    expect(run?.contextId).toBeUndefined();
    expect(run?.provider).toBe("openai");
    expect(run?.modelFamily).toBe("gpt");
    expect(run?.modelSnapshot).toBe("gpt-4.1-2025-04-14");
    expect(run?.deploymentId).toBe("not_exposed");
    expect(run?.apiVersion).toBe("unknown");
    expect(run?.agentConfigVersion).toBe("cfg-1");
    expect(run?.systemPromptHash).toBe("abc123");
    expect(run?.temperature).toBe(0.2);
    expect(run?.topP).toBe("not_exposed");
    expect(run?.seed).toBe(7);
    expect(run?.startedAt).toBe("2026-09-18T00:00:00Z");
    expect(run?.endedAt).toBe("unknown");
    expect(isSenaProvenanceUnavailable(run?.deploymentId)).toBe(true);
    expect(isSenaProvenanceUnavailable(run?.topP)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("missing agent_run_id or actor_id"))).toBe(true);
    expect(result.warnings).toContain(
      "people declares an AI actor (T1). Actor typing is roster semantics only (ADR-0006 D2); putting an AI row in people does not make a Human-AI SENA claim. ADR-0013 coverage: matching ai_agent_runs rows cover AI actor (T1). ADR-0013 gap: none for these roster ids. Human-AI findings remain exploratory until the remaining research-grade gates pass."
    );
  });

  it("treats missing run provenance as required when AI actors are present", () => {
    const result = buildSenaDatasetFromTables([
      mappedCsv("people", "person_id,actor_type\nT1,ai_agent\n")
    ]);
    expect(Object.keys(result.dataset)).not.toContain("ai_agent_runs");
    expect(result.warnings).toContain(
      "people declares an AI actor (T1). Actor typing is roster semantics only (ADR-0006 D2); putting an AI row in people does not make a Human-AI SENA claim. ADR-0013 coverage: none. ADR-0013 gap: AI actor (T1) is present without a matching ai_agent_runs row; missing model/config/version provenance is not optional when AI actors are present in research claims, so Human-AI findings remain exploratory."
    );
  });

  it("names ADR-0013 coverage and the unmatched ai_agent gap in one disclosure", () => {
    const result = buildSenaDatasetFromTables([
      mappedCsv("people", "person_id,actor_type\nT1,ai_agent\nA,human\nT2,ai_agent\n"),
      mappedCsv(
        "ai_agent_runs",
        "agent_run_id,actor_id,provider\nrun-1,T1,openai\nrun-other,NotOnRoster,openai\n"
      )
    ]);
    expect(result.warnings).toContain(
      "people declares 2 AI actors (T1, T2). Actor typing is roster semantics only (ADR-0006 D2); putting an AI row in people does not make a Human-AI SENA claim. ADR-0013 coverage: matching ai_agent_runs rows cover AI actor (T1). ADR-0013 gap: AI actor (T2) is present without a matching ai_agent_runs row; missing model/config/version provenance is not optional when AI actors are present in research claims, so Human-AI findings remain exploratory."
    );
    expect(result.warnings.some((warning) => warning.includes('actor_id "NotOnRoster"'))).toBe(true);
  });

  it("accepts JSON camelCase/snake_case runs without changing fusion matrices", () => {
    const withoutRuns = importSenaJsonContract({
      people: [
        { person_id: "Ada", actor_type: "human" },
        { person_id: "Tutor", actor_type: "ai_agent" }
      ],
      utterances: [{ utterance_id: "u1", person_id: "Tutor", stanza_id: "s1", turn_index: 1, text: "Hint" }],
      coded_segments: [{ segment_id: "s1", utterance_id: "u1", person_id: "Tutor", codes: "question" }],
      codebook: [{ code_id: "question" }]
    });
    const withRuns = importSenaJsonContract({
      people: [
        { person_id: "Ada", actor_type: "human" },
        { person_id: "Tutor", actor_type: "ai_agent" }
      ],
      utterances: [{ utterance_id: "u1", person_id: "Tutor", stanza_id: "s1", turn_index: 1, text: "Hint" }],
      coded_segments: [{ segment_id: "s1", utterance_id: "u1", person_id: "Tutor", codes: "question" }],
      codebook: [{ code_id: "question" }],
      ai_agent_runs: [
        {
          agentRunId: "run-json",
          actor_id: "Tutor",
          provider: "unknown",
          model_family: "not_exposed",
          temperature: 0
        }
      ]
    });

    expect(withRuns.dataset.ai_agent_runs?.[0]?.agentRunId).toBe("run-json");
    expect(withRuns.dataset.ai_agent_runs?.[0]?.actorId).toBe("Tutor");
    expect(withRuns.dataset.ai_agent_runs?.[0]?.temperature).toBe(0);
    expect(withRuns.dataset.ai_agent_runs?.[0]?.modelFamily).toBe("not_exposed");
    const baseline = buildSenaModel(withoutRuns.dataset);
    const treated = buildSenaModel(withRuns.dataset);
    expect(treated.matrices.S.raw).toEqual(baseline.matrices.S.raw);
    expect(treated.matrices.W.raw).toEqual(baseline.matrices.W.raw);
    expect(treated.matrices.B.raw).toEqual(baseline.matrices.B.raw);
    expect(treated.matrices.B_CP.raw).toEqual(baseline.matrices.B_CP.raw);
    expect(treated.matrices.G.raw).toEqual(baseline.matrices.G.raw);
    expect(treated.matrices.fusion.values).toEqual(baseline.matrices.fusion.values);
    expect(buildSenaDatasetContentHash(withoutRuns.dataset)).not.toBe(buildSenaDatasetContentHash(withRuns.dataset));
    expect(buildSenaDatasetContentHash(exampleSenaContract)).toBe(
      buildSenaDatasetContentHash({ ...exampleSenaContract })
    );
  });

  it("validates present run rows and still accepts datasets that omit the sidecar", () => {
    expect(() => validateSenaProjectSnapshotCanonicalInputs({
      dataset: exampleSenaContract,
      source: { sourceDatasetCounts: {
        people: exampleSenaContract.people.length,
        interactions: exampleSenaContract.interactions.length,
        utterances: exampleSenaContract.utterances.length,
        codedSegments: exampleSenaContract.coded_segments.length,
        codes: exampleSenaContract.codebook.length
      }, activeTemporalWindow: null },
      buildOptions: {}
    })).not.toThrow();

    expect(() => validateSenaProjectSnapshotCanonicalInputs({
      dataset: {
        ...exampleSenaContract,
        ai_agent_runs: [{
          agentRunId: "run-1",
          actorId: "missing",
          provider: "unknown",
          modelFamily: "unknown",
          modelSnapshot: "unknown",
          deploymentId: "not_exposed",
          apiVersion: "unknown",
          agentConfigVersion: "unknown",
          systemPromptHash: "unknown",
          temperature: "not_exposed",
          topP: "unknown",
          seed: "unknown",
          startedAt: "unknown",
          endedAt: "unknown"
        }]
      },
      source: { sourceDatasetCounts: {
        people: exampleSenaContract.people.length,
        interactions: exampleSenaContract.interactions.length,
        utterances: exampleSenaContract.utterances.length,
        codedSegments: exampleSenaContract.coded_segments.length,
        codes: exampleSenaContract.codebook.length
      }, activeTemporalWindow: null },
      buildOptions: {}
    })).not.toThrow();

    expect(() => validateSenaProjectSnapshotCanonicalInputs({
      dataset: {
        ...exampleSenaContract,
        ai_agent_runs: [{ agentRunId: "run-1" }]
      },
      source: { sourceDatasetCounts: {
        people: exampleSenaContract.people.length,
        interactions: exampleSenaContract.interactions.length,
        utterances: exampleSenaContract.utterances.length,
        codedSegments: exampleSenaContract.coded_segments.length,
        codes: exampleSenaContract.codebook.length
      }, activeTemporalWindow: null },
      buildOptions: {}
    })).toThrow(SenaInputValidationError);
  });

  it("exposes the blank ai_agent_runs template header", () => {
    const header = readFileSync(new URL("../../../public/sena-pilot/templates/ai_agent_runs.csv", import.meta.url), "utf8")
      .split(/\r?\n/)[0];
    for (const column of [
      "agent_run_id",
      "actor_id",
      "actor_instance_id",
      "context_id",
      "provider",
      "model_family",
      "model_snapshot",
      "deployment_id",
      "api_version",
      "agent_config_version",
      "system_prompt_hash",
      "temperature",
      "top_p",
      "seed",
      "started_at",
      "ended_at"
    ]) {
      expect(header.split(",")).toContain(column);
    }
  });
});
