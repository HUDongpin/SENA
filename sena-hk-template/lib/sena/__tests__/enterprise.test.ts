import { describe, expect, it } from "vitest";
import {
  buildSenaDataContractAudit,
  buildSenaDatasetFromTables,
  buildSenaModel,
  importSenaJsonContract,
  inferSenaColumnMapping,
  inferSenaTableFromName,
  parseSenaCsv
} from "../index";
import { buildXlsxWorkbookBuffer } from "../excel-workbook";
import { importSenaEnterpriseFiles } from "../import-adapters";
import type { SenaDataset } from "../types";

function uploadLike(name: string, bytes: Buffer | Uint8Array | string) {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return {
    name,
    text: async () => buffer.toString("utf8"),
    arrayBuffer: async () => {
      const arrayBuffer = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(arrayBuffer).set(buffer);
      return arrayBuffer;
    }
  };
}


describe("SENA enterprise runtime", () => {
  it("adapts LMS forum CSV exports into SENA analysis tables", async () => {
    const forumCsv = [
      "discussion_id,post_id,parent_post_id,parent_author_id,author_id,author_name,posted_at,message,tags",
      "thread-a,post-1,, ,teacher-1,Ada,2026-06-01T09:00:00Z,\"How can we test the explanation? #Question\",Question",
      "thread-a,post-2,post-1,teacher-1,student-1,Ben,2026-06-01T09:04:00Z,\"The graph gives evidence for the claim.\",Evidence|Claim",
      "thread-a,post-3,post-2,student-1,teacher-1,Ada,2026-06-01T09:07:00Z,\"Let's reflect on the evidence. #Reflection\",Reflection"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("canvas-discussion-export.csv", forumCsv)
    ]);

    expect(imported.sources).toEqual([
      expect.objectContaining({
        name: "canvas-discussion-export.csv",
        profile: "lms-forum-export",
        rows: 3
      })
    ]);
    expect(imported.dataset.people.map((person) => person.id)).toEqual(expect.arrayContaining(["teacher-1", "student-1"]));
    expect(imported.dataset.utterances.map((utterance) => utterance.id)).toEqual(["post-1", "post-2", "post-3"]);
    expect(imported.dataset.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "student-1", target: "teacher-1", channel: "reply" }),
      expect.objectContaining({ source: "teacher-1", target: "student-1", channel: "reply" })
    ]));
    expect(imported.dataset.coded_segments.map((segment) => segment.codes.join("|"))).toEqual([
      "Question",
      "Evidence|Claim",
      "Reflection"
    ]);
    expect(imported.dataset.codebook.map((code) => code.id)).toEqual(expect.arrayContaining(["Question", "Evidence", "Claim", "Reflection"]));
    expect(imported.cleaningManifest.summary.adapterProfiles).toContain("lms-forum-export");
    expect(imported.cleaningManifest.sources.find((source) => source.profile === "lms-forum-export")?.transformations)
      .toContain("thread/post table normalization");
    expect(imported.cleaningManifest.checks.find((check) => check.id === "analysis-table-readiness")?.status).toBe("pass");
  });

  it("derives independent B_CP evidence from forum reply targets (ADR-0006 D1)", async () => {
    // A reply's coded contribution is addressed to the parent author, so forum
    // imports now emit directed B_CP (code -> person) evidence instead of the
    // B_PC transpose fallback. The target resolves through the same identity index
    // as the S-layer reply interaction; the root post keeps no target.
    const forumCsv = [
      "discussion_id,post_id,parent_post_id,parent_author_id,author_id,author_name,posted_at,message,tags",
      "thread-a,post-1,, ,teacher-1,Ada,2026-06-01T09:00:00Z,\"How can we test the explanation? #Question\",Question",
      "thread-a,post-2,post-1,teacher-1,student-1,Ben,2026-06-01T09:04:00Z,\"The graph gives evidence for the claim.\",Evidence|Claim",
      "thread-a,post-3,post-2,student-1,teacher-1,Ada,2026-06-01T09:07:00Z,\"Let's reflect on the evidence. #Reflection\",Reflection"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("canvas-discussion-export.csv", forumCsv)
    ]);

    const segmentByUtterance = (id: string) =>
      imported.dataset.coded_segments.find((segment) => segment.utteranceId === id);
    // The reply segments carry the resolved parent author as directed target evidence.
    expect(segmentByUtterance("post-2")?.targetPersonIds).toEqual(["teacher-1"]);
    expect(segmentByUtterance("post-3")?.targetPersonIds).toEqual(["student-1"]);
    // The root post (no reply target) stays undirected — transpose fallback preserved.
    expect(segmentByUtterance("post-1")?.targetPersonIds).toBeUndefined();

    // The fused model is now directed with independently estimated B_CP.
    const model = buildSenaModel(imported.dataset);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-cp-independent");
    expect(model.operatorDiagnostics.direction.independentBridgeMatrices).toBe(true);

    // The change is disclosed in the cleaning manifest.
    expect(imported.cleaningManifest.sources.find((source) => source.profile === "lms-forum-export")?.transformations)
      .toContain("reply-target directed B_CP evidence");
  });

  it("declares a comma-bearing forum reply target verbatim, without fabrication (G1 → ADR-0007 D2)", async () => {
    // Authors are keyed by display name in the standard LMS "Last, First" form, so
    // the canonical person id itself contains a comma. Under the pre-ADR-0007
    // splitter this id could not be declared (it would shred into fragments and
    // fabricate people — bug G1), so the evidence was dropped with a warning:
    // loss instead of invention. Since ADR-0007 D2 multi-value cells split on
    // "|" only, so the id round-trips verbatim and the reply IS recorded as
    // directed B_CP evidence — the disclosed, deliberate correction the ADR's
    // consequences section describes.
    const forumCsv = [
      "thread_id,post_id,parent_post_id,reply_to_author,display_name,message,tags",
      "thread-a,post-1,,,\"Wong, Ka Yee\",\"How can we test the explanation? #Question\",Question",
      "thread-a,post-2,post-1,\"Wong, Ka Yee\",\"Chan, Tai Man\",\"The graph gives evidence for the claim.\",Evidence"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("forum-lastname-firstname.csv", forumCsv)
    ]);

    // Exactly the two real authors — no "Wong" / "Ka Yee" fragments.
    expect(imported.dataset.people.map((person) => person.id).sort())
      .toEqual(["Chan, Tai Man", "Wong, Ka Yee"]);
    expect(imported.dataset.people.some((person) => person.group === "Derived")).toBe(false);

    // The comma-bearing target now survives the multi-value field verbatim, so
    // the reply's coded contribution is directed evidence, not lost evidence.
    const replySegment = imported.dataset.coded_segments.find((segment) => segment.utteranceId === "post-2");
    expect(replySegment?.targetPersonIds).toEqual(["Wong, Ka Yee"]);
    const model = buildSenaModel(imported.dataset);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-cp-independent");
    expect(model.operatorDiagnostics.direction.independentBridgeMatrices).toBe(true);

    // The social layer is unaffected: the reply tie still resolves to a known person.
    expect(imported.dataset.interactions).toEqual([
      expect.objectContaining({ source: "Chan, Tai Man", target: "Wong, Ka Yee", channel: "reply" })
    ]);
    expect(model.summary.warnings.some((warning) => /unknown person/i.test(warning))).toBe(false);
    expect(model.summary.socialEdges).toBe(1);

    // ADR-0007 D1: the delimiter-bearing ids are disclosed, once per table.
    expect(imported.warnings.some((warning) =>
      /^people: \d+ id\(s\) contain/.test(warning) && warning.includes('"Wong, Ka Yee"')
    )).toBe(true);
    // And no evidence was suppressed — the old loss warning is gone.
    expect(imported.warnings.some((warning) => /cannot be recorded as directed code-to-person evidence/i.test(warning)))
      .toBe(false);
  });

  it("reports an unresolvable forum reply target instead of passing it through (G1)", async () => {
    // reply_to_author names somebody who never posted in this export. ADR-0006 D1
    // requires the segment target to stay empty (transpose fallback preserved) with
    // a manifest warning, never to invent the actor.
    const forumCsv = [
      "thread_id,post_id,parent_post_id,reply_to_author,author_id,author_name,message,tags",
      "thread-a,post-1,,,u1,Ada,\"How can we test the explanation? #Question\",Question",
      "thread-a,post-2,,Ghost,u2,Ben,\"The graph gives evidence for the claim.\",Evidence"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("forum-missing-target.csv", forumCsv)
    ]);

    // No directed evidence is declared for the unresolvable target.
    const replySegment = imported.dataset.coded_segments.find((segment) => segment.utteranceId === "post-2");
    expect(replySegment?.targetPersonIds).toBeUndefined();

    const model = buildSenaModel(imported.dataset);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-transpose-fallback");
    expect(model.operatorDiagnostics.direction.independentBridgeMatrices).toBe(false);
    expect(imported.warnings.some((warning) => /does not match any author in this export/i.test(warning)))
      .toBe(true);

    // "Ghost" does not enter the roster through the *social* layer either: the
    // adapter still passes the unresolved reply-to through to the interaction
    // (its warning above carries the forum context), and the import's roster
    // gate — the single enforcement point for every producer — refuses to mint
    // it (ADR-0010, Q9). The dangling tie is disclosed and excluded from S.
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["u1", "u2"]);
    // Exactly one copy: the enterprise route's per-file pass also detects the
    // dangling target, but only the merged pass's verdict may reach the manifest.
    expect(imported.warnings.filter((warning) =>
      warning.includes('declared people roster does not include "Ghost"')
    )).toHaveLength(1);
    expect(imported.warnings.some((warning) => /derived a placeholder person from coded_segments/i.test(warning)))
      .toBe(false);
  });

  it("does not derive placeholder people from coded_segments target_person_ids (G1)", async () => {
    // A declared target is a claim about an existing actor, not a declaration of one.
    // An unknown target must be reported by the bridge builder and ignored — not
    // turned into a roster member, which would also flip B_CP to independent mode.
    const contract = {
      people: [
        { person_id: "P1", label: "Ada" },
        { person_id: "P2", label: "Ben" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" },
        { utterance_id: "u2", person_id: "P2", unit_id: "unit-1", stanza_id: "st-1", turn_index: 2, text: "Reply" }
      ],
      coded_segments: [
        {
          segment_id: "cs-2",
          utterance_id: "u2",
          person_id: "P2",
          unit_id: "unit-1",
          stanza_id: "st-1",
          target_person_ids: "P9",
          codes: "Evidence"
        }
      ]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));

    // P9 is not invented into the roster.
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P2"]);
    expect(imported.warnings.some((warning) => /derived a placeholder person from coded_segments/i.test(warning)))
      .toBe(false);
    // The declared target is preserved on the segment; the model is what rejects it.
    expect(imported.dataset.coded_segments[0]?.targetPersonIds).toEqual(["P9"]);

    const model = buildSenaModel(imported.dataset);
    expect(model.summary.warnings.some((warning) => /unknown target person "P9"/i.test(warning))).toBe(true);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-transpose-fallback");
    expect(model.operatorDiagnostics.direction.independentBridgeMatrices).toBe(false);
  });

  it("does not derive placeholder people from interaction targets under a declared roster (Q9)", () => {
    // The interactions sibling of the G1 chains: an interaction's target is the
    // same kind of claim as a segment's target_person_ids — who someone replied
    // to — so under a declared roster an unmatched target stays dangling instead
    // of becoming a Derived roster member (ADR-0010, Peter decision 13). The
    // social-matrix builder then drops the tie as "unknown person"; the import
    // discloses the exclusion here, where the dangling id is still known.
    const contract = {
      people: [
        { person_id: "P1", label: "Ada" },
        { person_id: "P2", label: "Ben" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" },
        { utterance_id: "u2", person_id: "P2", unit_id: "unit-1", stanza_id: "st-1", turn_index: 2, text: "Reply" }
      ],
      coded_segments: [
        {
          segment_id: "cs-1",
          utterance_id: "u2",
          person_id: "P2",
          unit_id: "unit-1",
          stanza_id: "st-1",
          codes: "Evidence"
        }
      ],
      interactions: [
        { source: "P1", target: "Ghost", weight: 1 },
        { source: "P2", target: "Ghost", weight: 2 }
      ]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));

    // Ghost is not invented into the roster: the declared count stands.
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P2"]);
    expect(imported.warnings.some((warning) => /derived a placeholder person from interactions/i.test(warning)))
      .toBe(false);
    // The exclusion is disclosed, aggregated per dangling id with a tie count.
    expect(imported.warnings.some((warning) =>
      warning.includes('declared people roster does not include "Ghost"; 2 interactions targeting it were excluded from the social layer')
    )).toBe(true);

    // The social layer rejects the dangling ties instead of resizing S around a
    // fabricated person.
    const model = buildSenaModel(imported.dataset);
    expect(model.summary.warnings.some((warning) => /references an unknown person/i.test(warning))).toBe(true);
  });

  it("gates interaction targets across files on the enterprise route (single enforcement point)", async () => {
    // A roster-less contract file legitimately derives its people in isolation
    // (pass 1), but those placeholders are reconstruction artifacts, not
    // declarations: they must not round-trip into the merged pass as declared
    // roster rows, or a pass-1-minted target gets a declared seat and the
    // ADR-0010 gate never fires — while the analyst's real declared row is
    // discarded as a duplicate of the placeholder.
    const contractJson = JSON.stringify({
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" }
      ],
      interactions: [{ source: "P1", target: "Ghost", weight: 1 }]
    });
    const peopleCsv = "person_id,label,role,group\nP1,Ada,Participant,Learners";

    const imported = await importSenaEnterpriseFiles([
      uploadLike("contract.json", contractJson),
      uploadLike("people.csv", peopleCsv)
    ]);

    // The declared row wins — right metadata, no Derived shadow — and Ghost
    // stays off the roster.
    expect(imported.dataset.people.map((person) => person.id)).toEqual(["P1"]);
    expect(imported.dataset.people[0]?.label).toBe("Ada");
    expect(imported.dataset.people[0]?.group).toBe("Learners");
    // The exclusion is disclosed exactly once: the merged pass is the one
    // authoritative verdict; per-file copies stay on sources only.
    expect(imported.warnings.filter((warning) =>
      warning.includes('declared people roster does not include "Ghost"')
    )).toHaveLength(1);
  });

  it("keeps an analyst-declared roster row that looks like a reconstruction placeholder (A6)", async () => {
    // The round-trip filter used to *infer* "machine placeholder" from
    // group:"Derived" && label === id. An analyst who genuinely declares
    // {"person_id":"P3","group":"Derived"} with no label mints exactly that
    // signature — normalizePeople defaults label to id — so the enterprise route
    // dropped the row before the merged pass ever saw it. Nothing re-derives an
    // isolate (P3) or a target-only id (P4), so N and the S dimension each fell
    // silently: the inverse of the failure ADR-0010 exists to prevent. Declared
    // rows now survive whatever their group and label; only rows the import
    // itself minted carry the sentinel the filter reads.
    const contractJson = JSON.stringify({
      people: [
        { person_id: "P1", label: "Ada" },
        { person_id: "P2", label: "Ben" },
        { person_id: "P3", group: "Derived" },
        { person_id: "P4", group: "Derived" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" },
        { utterance_id: "u2", person_id: "P2", unit_id: "unit-1", stanza_id: "st-1", turn_index: 2, text: "Reply" }
      ],
      interactions: [{ source: "P1", target: "P4", weight: 1 }]
    });

    const imported = await importSenaEnterpriseFiles([uploadLike("contract.json", contractJson)]);

    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P2", "P3", "P4"]);
    // The declared metadata survives too — the row is the analyst's, verbatim.
    expect(imported.dataset.people.find((person) => person.id === "P3")?.group).toBe("Derived");
    expect(imported.dataset.people.find((person) => person.id === "P3")?.label).toBe("P3");
    // N and the S dimension follow the declared roster, so P4 is a seated actor
    // and its tie is not censored as a dangling target.
    const model = buildSenaModel(imported.dataset);
    expect(model.summary.people).toBe(4);
    expect(model.matrices.S.labels).toHaveLength(4);
    expect(model.matrices.S.raw).toHaveLength(4);
    expect(imported.warnings.some((warning) => /roster does not include "P4"/.test(warning))).toBe(false);
    // The sentinel is internal scaffolding, not contract data: it must not reach
    // the roster rows the analyst reads back.
    for (const person of imported.dataset.people) {
      expect(Object.keys(person).sort()).toEqual(["group", "id", "initials", "label", "role"]);
    }
    expect(JSON.stringify(imported.dataset.people)).not.toMatch(/placeholder|derivedBy|sentinel/i);
  });

  it("agrees with the JSON contract route on N for the same contract (A6)", async () => {
    // Two import routes, one contract: the enterprise multi-file route round-trips
    // its per-file dataset back through buildSenaDatasetFromTables, and that
    // round trip must be roster-preserving. Any row the browser/JSON route seats
    // the enterprise route must seat too, or the same upload reports two
    // different node sets — and every count normalized by N with it.
    const contract = {
      people: [
        { person_id: "P1", label: "Ada", group: "Learners" },
        { person_id: "P2", group: "Derived" },
        { person_id: "P3", label: "P3", group: "Derived" },
        { person_id: "P4", label: "Dee", group: "Derived" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" }
      ],
      coded_segments: [
        { segment_id: "cs-1", utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", codes: "Evidence" }
      ],
      interactions: [{ source: "P1", target: "P2", weight: 1 }]
    };

    const browser = importSenaJsonContract(JSON.stringify(contract));
    const enterprise = await importSenaEnterpriseFiles([uploadLike("contract.json", JSON.stringify(contract))]);

    expect(enterprise.dataset.people.map((person) => person.id).sort())
      .toEqual(browser.dataset.people.map((person) => person.id).sort());
    expect(buildSenaModel(enterprise.dataset).summary.people)
      .toBe(buildSenaModel(browser.dataset).summary.people);
    expect(buildSenaModel(enterprise.dataset).matrices.S.labels)
      .toEqual(buildSenaModel(browser.dataset).matrices.S.labels);
  });

  it("does not warn about a People table the analyst never uploaded (A6)", async () => {
    // datasetToTables used to emit a `<file>-people` table unconditionally. For a
    // roster-less contract that table has zero rows and no columns, so its
    // mapping cannot carry the id field and buildSenaDatasetFromTables demanded
    // "Person ID" from a table nobody uploaded — a phantom that also inflated
    // the cleaning manifest's missingTableWarningCount.
    const contractJson = JSON.stringify({
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" }
      ],
      coded_segments: [
        { segment_id: "cs-1", utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", codes: "Evidence" }
      ]
    });

    const rosterLess = await importSenaEnterpriseFiles([uploadLike("contract.json", contractJson)]);

    expect(rosterLess.warnings.some((warning) =>
      /is mapped as people but is missing required field/i.test(warning)
    )).toBe(false);
    // The honest disclosure stands in its place, exactly as the browser/JSON
    // route words it for the same contract — the F6 rule, not a mapping fault.
    expect(importSenaJsonContract(contractJson).warnings.some((warning) =>
      /people table is not uploaded/i.test(warning)
    )).toBe(true);
    // And exactly once: the merged pass is the authoritative roster verdict, so
    // the per-file copy is superseded rather than stacked on top of it.
    expect(rosterLess.warnings.filter((warning) =>
      /^people table is not uploaded/.test(warning)
    )).toHaveLength(1);
    // Roster-less derivation is untouched: the contributor is still recovered.
    expect(rosterLess.dataset.people.map((person) => person.id)).toEqual(["P1"]);

    // A people table the analyst *did* upload still has its required field
    // checked — including a header-only one, which is why the zero-row escape
    // hatch was rejected in favour of not synthesizing the table at all.
    const badHeaders = await importSenaEnterpriseFiles([
      uploadLike("people.csv", "name,role\nAda,Participant"),
      uploadLike("utterances.csv", "utterance_id,person_id,text\nu1,P1,Opening")
    ]);
    expect(badHeaders.warnings.some((warning) =>
      warning === 'people.csv is mapped as people but is missing required field "Person ID".'
    )).toBe(true);

    const emptyButDeclared = await importSenaEnterpriseFiles([
      uploadLike("people.csv", "name,role"),
      uploadLike("utterances.csv", "utterance_id,person_id,text\nu1,P1,Opening")
    ]);
    expect(emptyButDeclared.warnings.some((warning) =>
      warning === 'people.csv is mapped as people but is missing required field "Person ID".'
    )).toBe(true);

    // A per-file "no people table" verdict is a per-file fact, not the import's:
    // another file can supply the roster, and the merged pass is what decides.
    const rosterFromAnotherFile = await importSenaEnterpriseFiles([
      uploadLike("contract.json", contractJson),
      uploadLike("people.csv", "person_id,label,role,group\nP1,Ada,Participant,Learners")
    ]);
    expect(rosterFromAnotherFile.warnings.some((warning) =>
      /^people table is not uploaded/.test(warning)
    )).toBe(false);
    expect(rosterFromAnotherFile.dataset.people.map((person) => person.label)).toEqual(["Ada"]);
  });

  it("does not warn about the other four tables the analyst never uploaded (A6 sibling)", async () => {
    // The People fix left its four siblings synthesizing unconditionally, so a
    // contract that legitimately carries only a roster and a transcript was
    // accused of six mapping faults about tables nobody uploaded — the same
    // phantom, one table over.
    const contractJson = JSON.stringify({
      people: [
        { person_id: "P1", label: "Ada" },
        { person_id: "P2", label: "Ben" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" },
        { utterance_id: "u2", person_id: "P2", unit_id: "unit-1", stanza_id: "st-1", turn_index: 2, text: "Reply" }
      ]
    });

    const imported = await importSenaEnterpriseFiles([uploadLike("contract.json", contractJson)]);

    expect(imported.warnings.filter((warning) =>
      /is mapped as (?:interactions|utterances|coded segments|codebook) but is missing required field/.test(warning)
    )).toEqual([]);
    // The honest disclosure replaces it, once per absent table — the merged pass
    // is the one verdict, exactly as it is for people.
    for (const table of ["interactions", "coded_segments", "codebook"]) {
      expect(imported.warnings.filter((warning) =>
        warning === `${table} table is not uploaded; validation may derive placeholders where possible.`
      )).toHaveLength(1);
    }
    expect(new Set(imported.warnings).size).toBe(imported.warnings.length);
    // The browser/JSON route words it the same way for the same contract.
    const browser = importSenaJsonContract(contractJson);
    expect(browser.warnings.filter((warning) => /table is not uploaded/.test(warning)).sort())
      .toEqual(imported.warnings.filter((warning) => /table is not uploaded/.test(warning)).sort());
    // Nothing about the data changed.
    expect(imported.dataset.people.map((person) => person.id)).toEqual(["P1", "P2"]);
    expect(imported.dataset.utterances).toHaveLength(2);

    // A per-file "not uploaded" verdict is a per-file fact: a sibling file can
    // supply the table, and the merged pass is what decides. This is why the
    // per-file copies are superseded rather than stacked.
    const suppliedElsewhere = await importSenaEnterpriseFiles([
      uploadLike("contract.json", contractJson),
      uploadLike("interactions.csv", "source,target,weight\nP1,P2,1")
    ]);
    expect(suppliedElsewhere.warnings.some((warning) => /^interactions table is not uploaded/.test(warning))).toBe(false);
    expect(suppliedElsewhere.warnings.filter((warning) => /^coded_segments table is not uploaded/.test(warning))).toHaveLength(1);
    expect(suppliedElsewhere.dataset.interactions).toHaveLength(1);
  });

  it("rejects an upload whose every file yielded no rows, instead of importing nothing (A6 sibling)", async () => {
    // Consequence of contributing only non-empty tables: a file that produced no
    // rows at all contributes nothing, so an upload made entirely of such files
    // now fails the "no supported tables" check instead of returning an empty
    // dataset dressed in five phantom mapping faults. This matches what the CSV
    // and forum adapters already do with unusable input ("CSV is empty.", "did
    // not contain importable posts"); the transcript path was the odd one out.
    await expect(importSenaEnterpriseFiles([
      uploadLike("notes.txt", "Session notes\n----\nno speaker lines here")
    ])).rejects.toThrow(/No supported SENA import tables were found/);

    // One usable file is enough: the junk file no longer decides the import.
    const withRealData = await importSenaEnterpriseFiles([
      uploadLike("notes.txt", "Session notes\n----\nno speaker lines here"),
      uploadLike("people.csv", "person_id,label\nP1,Ada")
    ]);
    expect(withRealData.dataset.people.map((person) => person.id)).toEqual(["P1"]);
  });

  it("still warns about header-only and malformed tables the analyst did upload (A6 sibling)", async () => {
    // Never-uploaded and uploaded-but-empty are different facts and only the
    // first may go quiet. A header-only CSV has real columns, so the analyst
    // *did* declare a table shape and it stays verified; the tables the fix
    // silences have no columns at all because nobody uploaded them.
    const headerOnly = await importSenaEnterpriseFiles([
      uploadLike("people.csv", "person_id,label\nP1,Ada"),
      uploadLike("utterances.csv", "utterance_id,person_id,text\nu1,P1,Opening"),
      uploadLike("interactions.csv", "source,target,weight")
    ]);
    // Uploaded, so it is not reported as absent...
    expect(headerOnly.warnings.some((warning) => /^interactions table is not uploaded/.test(warning))).toBe(false);
    // ...and its declared columns satisfy the required fields, so no fault either.
    expect(headerOnly.warnings.some((warning) => /interactions\.csv is mapped as interactions/.test(warning))).toBe(false);

    const headerOnlyWrongColumns = await importSenaEnterpriseFiles([
      uploadLike("people.csv", "person_id,label\nP1,Ada"),
      uploadLike("utterances.csv", "utterance_id,person_id,text\nu1,P1,Opening"),
      uploadLike("interactions.csv", "note,comment")
    ]);
    expect(headerOnlyWrongColumns.warnings).toContain(
      'interactions.csv is mapped as interactions but is missing required field "Source person".'
    );
    expect(headerOnlyWrongColumns.warnings).toContain(
      'interactions.csv is mapped as interactions but is missing required field "Target person".'
    );

    const malformed = await importSenaEnterpriseFiles([
      uploadLike("people.csv", "person_id,label\nP1,Ada"),
      uploadLike("utterances.csv", "utterance_id,person_id,text\nu1,P1,Opening"),
      uploadLike("codebook.csv", "name,notes\nEvidence,cites data"),
      uploadLike("coded_segments.csv", "seg,utt,tags\ncs-1,u1,Evidence")
    ]);
    expect(malformed.warnings).toContain(
      'codebook.csv is mapped as codebook but is missing required field "Code ID".'
    );
    expect(malformed.warnings).toContain(
      'coded_segments.csv is mapped as coded segments but is missing required field "Segment ID".'
    );
    expect(malformed.warnings).toContain(
      'coded_segments.csv is mapped as coded segments but is missing required field "Codes".'
    );
  });

  it("does not accuse a forum export of mapping faults for ties and tags it never had (A6 sibling)", async () => {
    // The forum adapter synthesizes the same five tables, so a thread with no
    // replies and no tags was accused of the identical phantom fault — twice,
    // once per file and once from the merged pass, with byte-identical text.
    const forumCsv = [
      "post_id,thread_id,author_id,author_name,message",
      "1,t1,a1,Ada,Hello there",
      "2,t1,a2,Ben,Hi back"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([uploadLike("forum.csv", forumCsv)]);

    expect(imported.warnings.filter((warning) => /is mapped as .* but is missing required field/.test(warning))).toEqual([]);
    expect(new Set(imported.warnings).size).toBe(imported.warnings.length);
    // The adapter's own cleaning note is what tells the analyst what happened.
    expect(imported.warnings.some((warning) => /no tags, codes, or hashtag markers were found/.test(warning))).toBe(true);
    expect(imported.dataset.utterances).toHaveLength(2);
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["a1", "a2"]);
  });

  it("counts only import-minted placeholders as derived people in the audit (A6)", () => {
    // The audit inferred "machine placeholder" from group === "Derived", the
    // same contents-sniffing the WeakSet sentinel replaced in the import — so an
    // analyst who genuinely declares group:"Derived" was disclosed as a person
    // the import invented.
    const derivedPlaceholders = (dataset: SenaDataset) =>
      buildSenaDataContractAudit(dataset).items.find((entry) => entry.id === "people-table")?.detail[0];

    const minted = importSenaJsonContract(JSON.stringify({
      people: [{ person_id: "P1", label: "Ada" }],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" },
        { utterance_id: "u2", person_id: "P9", unit_id: "unit-1", stanza_id: "st-1", turn_index: 2, text: "Reply" }
      ]
    }));
    expect(minted.dataset.people.map((person) => person.id)).toEqual(["P1", "P9"]);
    expect(derivedPlaceholders(minted.dataset)).toBe("derivedPlaceholders=1");

    // The WeakSet dies with the in-memory objects, and the audit runs over a
    // dataset that crossed the enterprise import route's JSON response. A count
    // that silently drops to zero on that path is worse than an over-count, so
    // the disclosure must survive a round trip.
    const roundTripped = JSON.parse(JSON.stringify(minted.dataset)) as SenaDataset;
    expect(derivedPlaceholders(roundTripped)).toBe("derivedPlaceholders=1");

    // The sentinel covers the mirror-image loss: consumers rebuild the dataset
    // with their own warning list (the import route folds run warnings in, the
    // enterprise route filters per-file verdicts out), and the rows they carry
    // over are still the ones this process minted.
    expect(derivedPlaceholders({ ...minted.dataset, warnings: [] })).toBe("derivedPlaceholders=1");

    const declared = importSenaJsonContract(JSON.stringify({
      people: [
        { person_id: "P1", label: "Ada" },
        { person_id: "P3", group: "Derived" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" }
      ]
    }));
    expect(declared.dataset.people.map((person) => person.id)).toEqual(["P1", "P3"]);
    expect(derivedPlaceholders(declared.dataset)).toBe("derivedPlaceholders=0");
    expect(derivedPlaceholders(JSON.parse(JSON.stringify(declared.dataset)) as SenaDataset)).toBe("derivedPlaceholders=0");
    expect(derivedPlaceholders({ ...declared.dataset, warnings: [] })).toBe("derivedPlaceholders=0");
  });

  it("still derives placeholder people from interaction sources under a declared roster", () => {
    // A source is a contribution, not a claim: the person demonstrably acted, so
    // a roster omission there is recovered the same way as an unknown utterance
    // author. The roster gate is target-only (ADR-0010).
    const contract = {
      people: [{ person_id: "P1", label: "Ada" }],
      interactions: [{ source: "P9", target: "P1", weight: 1 }]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P9"]);
    expect(imported.warnings.some((warning) => /did not include "P9"; derived a placeholder person from interactions/i.test(warning)))
      .toBe(true);
  });

  it("still derives interaction targets into the roster when no roster was declared", () => {
    // Roster-less uploads keep the F6-style rule: with no people table the data
    // tables ARE the roster, so a target legitimately introduces the person it
    // names.
    const contract = {
      interactions: [{ source: "P1", target: "P2", weight: 1 }]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P2"]);
    expect(imported.warnings.some((warning) => /roster does not include/i.test(warning))).toBe(false);
  });

  it("keeps deriving targets when people exist only from earlier derivation (no declared roster)", () => {
    // Kills the live-check mutant: hasDeclaredRoster is captured from the
    // uploaded people table before any derivation runs. Re-reading
    // dataset.people.length at gate time would see the utterance-minted P1 and
    // wrongly treat the roster as declared, gating P2.
    const contract = {
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "st-1", turn_index: 1, text: "Opening" }
      ],
      interactions: [{ source: "P1", target: "P2", weight: 1 }]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P2"]);
    expect(imported.warnings.some((warning) => /roster does not include/i.test(warning))).toBe(false);
  });

  it("still derives placeholder people from the coded_segments contributor (F6 regression)", async () => {
    // The F6 safety net must survive the G1 fix: a segments-only upload still
    // recovers its contributing people, it just no longer invents targets.
    const contract = {
      coded_segments: [
        {
          segment_id: "cs-1",
          utterance_id: "u1",
          person_id: "P1",
          unit_id: "unit-1",
          stanza_id: "st-1",
          codes: "Evidence"
        }
      ]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));
    expect(imported.dataset.people.map((person) => person.id)).toEqual(["P1"]);
    const model = buildSenaModel(imported.dataset);
    expect(model.summary.warnings.some((warning) => /unknown person/i.test(warning))).toBe(false);
    // Nobody was derived from a target here, so the target-only disclosure stays quiet.
    expect(imported.warnings.some((warning) => /derived solely from target_person_ids/i.test(warning))).toBe(false);
  });

  it("discloses people derived only from target_person_ids in a roster-less upload", () => {
    // The F6 rule is intentional: with no people table, coded_segments IS the
    // roster, so a target legitimately introduces the person it names. But that
    // person never contributed anything, and once on the roster it resolves in
    // personIndex and can carry directed B_CP evidence — flipping the bridge to
    // pc-cp-independent on people the import invented from a claim. The
    // derivation is by design; the silence about it was the defect.
    const contract = {
      coded_segments: [
        {
          segment_id: "cs-1",
          utterance_id: "u1",
          person_id: "P1",
          unit_id: "unit-1",
          stanza_id: "st-1",
          target_person_ids: "P9",
          codes: "Evidence"
        }
      ]
    };

    const imported = importSenaJsonContract(JSON.stringify(contract));
    expect(imported.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P9"]);

    const disclosure = imported.warnings.filter((warning) => /derived solely from target_person_ids/i.test(warning));
    expect(disclosure).toHaveLength(1);
    expect(disclosure[0]).toContain('"P9"');
    expect(disclosure[0]).not.toContain('"P1"');
    expect(disclosure[0]).toMatch(/directed B_CP evidence/i);

    // The disclosure describes a real consequence: B_CP is independent here.
    const model = buildSenaModel(imported.dataset);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-cp-independent");

    // A declared roster suppresses both the derivation (G1) and the disclosure.
    const declared = importSenaJsonContract(JSON.stringify({
      people: [{ person_id: "P1" }],
      coded_segments: contract.coded_segments
    }));
    expect(declared.dataset.people.map((person) => person.id)).toEqual(["P1"]);
    expect(declared.warnings.some((warning) => /derived solely from target_person_ids/i.test(warning))).toBe(false);
  });

  it("reports ragged CSV rows through parseSenaCsv warnings (G2)", () => {
    // Short rows are still padded rather than aborting a multi-file upload, but the
    // repair is now recorded instead of silently becoming empty fields.
    const short = parseSenaCsv([
      "segment_id,utterance_id,person_id,unit_id,stanza_id,codes",
      "cs1,u1,P1,unit1,st1,Evidence|Claim",
      "cs2,u2,P1,unit1,st1"
    ].join("\n"));
    expect(short.rows[1].codes).toBe("");
    expect(short.warnings).toEqual([
      expect.stringContaining("CSV row 3 has 5 cells but the header has 6; padded empty values for: codes.")
    ]);

    // A stray trailing delimiter is still tolerated, and also recorded.
    const trailing = parseSenaCsv([
      "person_id,label",
      "P1,Ada,"
    ].join("\n"));
    expect(trailing.rows).toEqual([{ person_id: "P1", label: "Ada" }]);
    expect(trailing.warnings).toEqual([
      expect.stringContaining("CSV row 2 had 1 trailing empty cell(s)")
    ]);

    // A well-formed CSV reports nothing.
    expect(parseSenaCsv("person_id,label\nP1,Ada").warnings).toEqual([]);

    // Genuinely over-long rows still fail loudly.
    expect(() => parseSenaCsv("person_id,label\nP1,Ada,extra")).toThrow(/has 3 cells but the header has 2/);
  });

  it("surfaces ragged CSV repairs in the cleaning manifest (G2)", async () => {
    const csv = [
      "person_id,label,role",
      "P1,Ada,Teacher",
      "P2,Ben"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([uploadLike("people.csv", csv)]);
    expect(imported.warnings.some((warning) => /people\.csv: CSV row 3 .* padded empty values for: role\./.test(warning)))
      .toBe(true);
  });

  it("gates the data-contract audit identically on the enterprise and browser import routes (F13)", async () => {
    // buildSenaDataContractAudit reads dataset.warnings (plus model warnings) and
    // nothing else, so where a cleaning disclosure is *stored* decides the audit.
    // The browser route folds each file's parse warnings into dataset.warnings;
    // the enterprise route used to keep the identical strings in its own warnings
    // list and the cleaning manifest only, so the same five CSVs audited "review"
    // through one route and "pass" through the other.
    const files = [
      // The ragged row: three header columns, two cells.
      ["people.csv", "person_id,label,role\nP1,Ada,Teacher\nP2,Ben"],
      ["interactions.csv", "from,to\nP1,P2"],
      ["utterances.csv", "utterance_id,person_id,stanza_id,turn_index,text\nu1,P1,st1,1,Question\nu2,P2,st1,2,Evidence"],
      ["coded_segments.csv", "segment_id,utterance_id,person_id,codes\ncs1,u1,P1,Question\ncs2,u2,P2,Evidence"],
      ["codebook.csv", "code_id\nQuestion\nEvidence"]
    ] as const;
    const raggedWarning = "people.csv: CSV row 3 has 2 cells but the header has 3; padded empty values for: role.";

    const enterprise = await importSenaEnterpriseFiles(files.map(([name, text]) => uploadLike(name, text)));

    // The browser route: uploaded tables carry their own parse warnings, and
    // applyMappedTables prepends them to the rebuilt dataset's warnings. That
    // fold is pinned by the workspace suite; it is mirrored here so the two
    // routes can be compared on one input.
    const browserTables = files.map(([name, text]) => {
      const parsed = parseSenaCsv(text);
      const table = inferSenaTableFromName(name);
      return {
        name,
        table,
        columns: parsed.columns,
        rows: parsed.rows,
        mapping: inferSenaColumnMapping(table, parsed.columns),
        warnings: parsed.warnings.map((warning) => `${name}: ${warning}`)
      };
    });
    const browserResult = buildSenaDatasetFromTables(browserTables);
    const browserSourceWarnings = browserTables.flatMap((table) => table.warnings ?? []);
    const browserDataset = {
      ...browserResult.dataset,
      warnings: [...browserSourceWarnings, ...(browserResult.dataset.warnings ?? [])]
    };

    const warningsItem = (dataset: SenaDataset) => {
      const model = buildSenaModel(dataset);
      const audit = buildSenaDataContractAudit(dataset, { modelWarnings: model.summary.warnings });
      return audit.items.find((entry) => entry.id === "import-and-model-warnings");
    };

    // Both routes see the repair, so both send the researcher to review it.
    expect(enterprise.dataset.warnings).toContain(raggedWarning);
    expect(browserDataset.warnings).toContain(raggedWarning);
    expect(warningsItem(enterprise.dataset)?.status).toBe("review");
    expect(warningsItem(enterprise.dataset)?.status).toBe(warningsItem(browserDataset)?.status);

    // Source warnings lead, matching applyMappedTables' ordering.
    expect(enterprise.dataset.warnings?.[0]).toBe(raggedWarning);
    // The adapter-level list and the cleaning manifest still report the same set.
    expect(enterprise.warnings).toEqual(enterprise.dataset.warnings);
    expect(enterprise.cleaningManifest.checks.find((check) => check.id === "cleaning-warning-review")?.status)
      .toBe("review");
  });

  it("adapts LMS forum Excel exports into SENA analysis tables", async () => {
    const workbookBuffer = await buildXlsxWorkbookBuffer([
      {
        name: "discussion",
        rows: [
          {
            discussion_id: "thread-b",
            post_id: "post-a",
            author_id: "coach-1",
            author_name: "Coach Lee",
            posted_at: "2026-06-02T10:00:00Z",
            message: "What evidence supports the design? #Evidence",
            tags: "Evidence"
          },
          {
            discussion_id: "thread-b",
            post_id: "post-b",
            parent_post_id: "post-a",
            author_id: "teacher-2",
            author_name: "Teacher Ng",
            posted_at: "2026-06-02T10:05:00Z",
            message: "The student response supports the explanation.",
            tags: "Explanation"
          }
        ]
      }
    ]);

    const imported = await importSenaEnterpriseFiles([
      uploadLike("moodle-discussion.xlsx", workbookBuffer)
    ]);

    expect(imported.sources).toEqual([
      expect.objectContaining({
        name: "moodle-discussion.xlsx",
        profile: "lms-forum-export",
        rows: 2
      })
    ]);
    expect(imported.dataset.people.map((person) => person.id)).toEqual(expect.arrayContaining(["coach-1", "teacher-2"]));
    expect(imported.dataset.utterances.map((utterance) => utterance.id)).toEqual(["post-a", "post-b"]);
    expect(imported.dataset.interactions).toEqual([
      expect.objectContaining({ source: "teacher-2", target: "coach-1", channel: "reply" })
    ]);
    expect(imported.cleaningManifest.summary.adapterProfiles).toContain("lms-forum-export");
    expect(imported.cleaningManifest.checks.find((check) => check.id === "analysis-table-readiness")?.status).toBe("pass");
  });

  it("adapts SRT transcript exports into cleaned SENA transcript tables", async () => {
    const srtTranscript = [
      "1",
      "00:00:01,000 --> 00:00:04,000",
      "Teacher Lee: What evidence supports the lesson design? #Question",
      "",
      "2",
      "00:00:04,500 --> 00:00:08,000",
      "Teacher Ng: The student response gives {{Evidence}} for the explanation.",
      "",
      "3",
      "00:00:09,000 --> 00:00:12,000",
      "Teacher Lee: Then we should reflect on the next task. #Reflection"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("lesson-study-transcript.srt", srtTranscript)
    ]);

    expect(imported.sources).toEqual([
      expect.objectContaining({
        name: "lesson-study-transcript.srt",
        profile: "cleaned-transcript",
        rows: 3
      })
    ]);
    expect(imported.dataset.people.map((person) => person.label)).toEqual(["Teacher Lee", "Teacher Ng"]);
    expect(imported.dataset.utterances.map((utterance) => utterance.timestamp)).toEqual([
      "00:00:01,000",
      "00:00:04,500",
      "00:00:09,000"
    ]);
    expect(imported.dataset.interactions).toEqual([
      expect.objectContaining({ source: "p-1", target: "p-2", channel: "transcript-adjacency" }),
      expect.objectContaining({ source: "p-2", target: "p-1", channel: "transcript-adjacency" })
    ]);
    expect(imported.dataset.coded_segments.map((segment) => segment.codes.join("|"))).toEqual([
      "Question",
      "Evidence",
      "Reflection"
    ]);
    expect(imported.dataset.codebook.map((code) => code.id)).toEqual(["Question", "Evidence", "Reflection"]);
    expect(imported.cleaningManifest.sources[0].transformations).toContain("subtitle cue normalization");
    expect(imported.cleaningManifest.checks.find((check) => check.id === "analysis-table-readiness")?.status).toBe("pass");
  });

  it("splits transcript stages by parsed turns even when noise lines are skipped", async () => {
    // Two skipped noise lines followed by six speaker turns. Stage thirds must be
    // taken over the six PARSED turns (Plan/Teach/Reflect = 2 turns each), not the
    // eight non-empty lines, otherwise every real turn would land in Plan and no
    // utterance would reach Reflect.
    const transcript = [
      "# Lesson study session",
      "===== segment divider =====",
      "Ada: What should we investigate first?",
      "Ben: Let us gather the baseline data.",
      "Ada: The trend looks clear in the chart.",
      "Ben: That supports the working explanation.",
      "Ada: Looking back, our reasoning held up.",
      "Ben: Next time we should reflect earlier."
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("lesson-study-notes.txt", transcript)
    ]);

    const stages = imported.dataset.utterances.map((utterance) => utterance.stage);
    expect(imported.dataset.utterances).toHaveLength(6);
    expect(stages).toEqual(["Plan", "Plan", "Teach", "Teach", "Reflect", "Reflect"]);
  });

  it("resolves forum reply targets that reference the author display name", async () => {
    // Authors are keyed by display name (no id column), while replies reference
    // the parent author by that same name. The reply tie must survive rather than
    // being dropped as an "unknown person".
    const forumCsv = [
      "thread_id,post_id,parent_post_id,reply_to_author,author_name,message,tags",
      "thread-a,post-1,,,Ada,\"How can we test the explanation? #Question\",Question",
      "thread-a,post-2,post-1,Ada,Ben,\"The graph gives evidence for the claim.\",Evidence"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("forum-by-name.csv", forumCsv)
    ]);

    const benId = imported.dataset.people.find((person) => person.label === "Ben")?.id;
    const adaId = imported.dataset.people.find((person) => person.label === "Ada")?.id;
    expect(benId).toBeTruthy();
    expect(adaId).toBeTruthy();
    // The reply target is resolved back to Ada's canonical person id instead of
    // the raw display name, so the tie references a known person and the social
    // model does not drop it as unknown.
    expect(imported.dataset.interactions).toEqual([
      expect.objectContaining({ source: benId, target: adaId, channel: "reply" })
    ]);
    const model = buildSenaModel(imported.dataset);
    expect(model.summary.warnings.some((warning) => /unknown person/i.test(warning))).toBe(false);
    expect(model.summary.socialEdges).toBe(1);
  });

  it("resolves forum reply ties across an author-id vs display-name scheme mismatch", async () => {
    // Authors carry an explicit id column (the canonical person id / node id), but
    // replies reference the parent author by display name — a different identifier
    // scheme. The reply tie must resolve name -> id and survive instead of being
    // dropped as an unknown person.
    const forumCsv = [
      "thread_id,post_id,parent_post_id,author_id,author_name,reply_to_author,message,tags",
      "thread-a,post-1,,u1,Ada,,\"How can we test the explanation? #Question\",Question",
      "thread-a,post-2,post-1,u2,Ben,Ada,\"The graph gives evidence for the claim.\",Evidence"
    ].join("\n");

    const imported = await importSenaEnterpriseFiles([
      uploadLike("forum-id-authors.csv", forumCsv)
    ]);

    const ada = imported.dataset.people.find((person) => person.label === "Ada");
    const ben = imported.dataset.people.find((person) => person.label === "Ben");
    expect(ada?.id).toBe("u1");
    expect(ben?.id).toBe("u2");
    // The reply is keyed by the name "Ada" but resolves to the author's id "u1".
    expect(imported.dataset.interactions).toEqual([
      expect.objectContaining({ source: "u2", target: "u1", channel: "reply" })
    ]);
    const model = buildSenaModel(imported.dataset);
    expect(model.summary.warnings.some((warning) => /unknown person/i.test(warning))).toBe(false);
    expect(model.summary.socialEdges).toBe(1);
  });

});
