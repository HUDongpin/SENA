import { createHmac, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSenaAnalysisRun,
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  parseCoderAnnotationsFromRows,
  parseSenaCsv,
  reliabilityDashboardToReview
} from "../index";
import { buildXlsxWorkbookBuffer, readXlsxWorkbookRows } from "../excel-workbook";
import { importSenaEnterpriseFiles } from "../import-adapters";
import { buildSenaPublicationExport } from "../publication-export";

function uploadLike(name: string, bytes: Buffer | string) {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
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

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function signedRs256Jwt(payload: Record<string, unknown>, privateKey: KeyObject, kid = "sena-test-key") {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signingInput = `${header}.${body}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function publicJwks(publicKey: KeyObject, kid = "sena-test-key") {
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  return {
    keys: [{
      ...jwk,
      kid,
      alg: "RS256",
      use: "sig"
    }]
  };
}

function requireCompletedLogin<T extends { mfaRequired?: true } | { context: unknown }>(result: T): Extract<T, { context: unknown }> {
  if ("mfaRequired" in result) throw new Error("Expected completed enterprise login, received MFA challenge.");
  return result as Extract<T, { context: unknown }>;
}

function sampleSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Enterprise Test Snapshot",
    generatedAt: "2026-06-11T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Enterprise test",
      interpretation: "Enterprise test interpretation.",
      limitations: "Fixture only.",
      nextActions: "Continue validation."
    },
    codingReliability: {
      status: "documented",
      reviewer: "Enterprise test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Cohen kappa; Krippendorff alpha",
      agreementValue: "kappa=1; alpha=1",
      adjudicationNotes: "No disagreements in fixture.",
      limitations: "Fixture only."
    },
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic publication export fixture only.",
      retentionPolicy: "Delete generated fixture state after the test run.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Enterprise test"
    }
  });
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

  it("never fabricates people from a separator-bearing forum reply target (G1)", async () => {
    // Authors are keyed by display name in the standard LMS "Last, First" form, so
    // the canonical person id itself contains a comma. coded_segments.target_person_ids
    // is a multi-value field split on "|", ";" and ",", so declaring such an id would
    // shred it into fragments, and deriving people from those fragments would invent
    // participants and flip the bridge into independent-B_CP mode on evidence that
    // does not exist. The target must be reported and left empty instead.
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

    // No directed evidence was declared, so the transpose fallback is preserved.
    const replySegment = imported.dataset.coded_segments.find((segment) => segment.utteranceId === "post-2");
    expect(replySegment?.targetPersonIds).toBeUndefined();
    const model = buildSenaModel(imported.dataset);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-transpose-fallback");
    expect(model.operatorDiagnostics.direction.independentBridgeMatrices).toBe(false);

    // The social layer is unaffected: the reply tie still resolves to a known person.
    expect(imported.dataset.interactions).toEqual([
      expect.objectContaining({ source: "Chan, Tai Man", target: "Wong, Ka Yee", channel: "reply" })
    ]);
    expect(model.summary.warnings.some((warning) => /unknown person/i.test(warning))).toBe(false);
    expect(model.summary.socialEdges).toBe(1);

    // The skipped evidence is disclosed rather than silently dropped.
    expect(imported.warnings.some((warning) => /cannot be recorded as directed code-to-person evidence/i.test(warning)))
      .toBe(true);
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

    // "Ghost" may still enter the roster through the *social* layer — an unresolved
    // reply-to is a pre-existing S-layer behaviour and out of scope here. What must
    // not happen is a bridge-derived placeholder: nothing is derived from
    // coded_segments, so the code-to-person layer stays on the transpose fallback.
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

  it("runs auth, RBAC project persistence, imports, reliability, inference, and publication exports", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-test-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES = "3";
    process.env.SENA_AUTH_LOCKOUT_WINDOW_MINUTES = "15";
    process.env.SENA_AUTH_LOCKOUT_MINUTES = "15";
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    process.env.SENA_NOTIFICATION_WEBHOOK_URL = "https://notify.example.test/sena";
    process.env.SENA_NOTIFICATION_WEBHOOK_SECRET = "sena-notification-webhook-secret";
    process.env.SENA_NOTIFICATION_WEBHOOK_MAX_ATTEMPTS = "2";
    process.env.SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_EMAIL_WEBHOOK_URL = "https://mail.example.test/sena";
    process.env.SENA_EMAIL_WEBHOOK_SECRET = "sena-email-webhook-secret";
    process.env.SENA_EMAIL_WEBHOOK_MAX_ATTEMPTS = "2";
    process.env.SENA_EMAIL_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_BACKUP_WEBHOOK_URL = "https://backup.example.test/sena";
    process.env.SENA_BACKUP_WEBHOOK_SECRET = "sena-backup-webhook-secret";
    process.env.SENA_BACKUP_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_DATABASE_SYNC_WEBHOOK_URL = "https://database.example.test/sena/sync";
    process.env.SENA_DATABASE_SYNC_WEBHOOK_SECRET = "sena-database-sync-secret";
    process.env.SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_OBJECT_STORAGE_WEBHOOK_URL = "https://objects.example.test/sena/uploads";
    process.env.SENA_OBJECT_STORAGE_WEBHOOK_SECRET = "sena-object-storage-webhook-secret";
    process.env.SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_URL = "https://pubsub.example.test/sena/collaboration";
    process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET = "sena-collaboration-pubsub-secret";
    process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_MAX_ATTEMPTS = "2";
    process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_PROVISIONING_TOKEN = "sena_prov_2026_9f4c2a1d8e7b6c5a4f3e2d1c0b9a8765";
    process.env.SENA_OPS_TOKEN = "sena-ops-token";
    process.env.SENA_AUDIT_RETENTION_DAYS = "3650";
    process.env.SENA_AUDIT_WEBHOOK_URL = "https://siem.example.test/sena/audit";
    process.env.SENA_AUDIT_WEBHOOK_SECRET = "sena-audit-webhook-secret";
    process.env.SENA_AUDIT_WEBHOOK_MAX_ATTEMPTS = "2";
    process.env.SENA_AUDIT_WEBHOOK_TIMEOUT_MS = "1000";
    process.env.SENA_ALERTING_OWNER = "SENA platform rotation";
    process.env.SENA_ALERTING_CHANNEL = "deployment-monitor";
    process.env.SENA_ALERTING_RUNBOOK_URL = "https://ops.example.test/sena-runbook";
    process.env.SENA_ALERT_WEBHOOK_URL = "https://alerts.example.test/sena/ops";
    process.env.SENA_ALERT_WEBHOOK_SECRET = "sena-alert-webhook-secret";
    process.env.SENA_ALERT_WEBHOOK_TIMEOUT_MS = "1000";
    delete process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED;
    const enterprise = await import("../enterprise");
    const scim = await import("../scim");

    const registered = enterprise.registerEnterpriseUser({
      name: "Dr Enterprise",
      email: "enterprise@example.edu",
      password: "sena-secure-123",
      organization: "Enterprise Lab",
      plan: "lab"
    });
    expect(() => enterprise.registerEnterpriseUser({
      name: "Weak Password User",
      email: "weak-password@example.edu",
      password: "password123456",
      organization: "Enterprise Lab",
      plan: "lab"
    })).toThrow(/password policy/i);
    expect(registered.context.user.email).toBe("enterprise@example.edu");
    expect(enterprise.hasEnterprisePermission(registered.context, registered.context.teams[0].id, "project:create")).toBe(true);
    const standardLogin = requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "enterprise@example.edu",
      password: "sena-secure-123"
    }));
    const rememberedLogin = requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "enterprise@example.edu",
      password: "sena-secure-123",
      rememberSession: true
    }));
    const standardSessionDays = Math.round((Date.parse(standardLogin.context.session.expiresAt) - Date.parse(standardLogin.context.session.createdAt)) / 86_400_000);
    const rememberedSessionDays = Math.round((Date.parse(rememberedLogin.context.session.expiresAt) - Date.parse(rememberedLogin.context.session.createdAt)) / 86_400_000);
    expect(standardLogin.context.session.sessionProfile).toBe("standard");
    expect(rememberedLogin.context.session.sessionProfile).toBe("remembered");
    expect(standardSessionDays).toBe(7);
    expect(rememberedSessionDays).toBe(30);
    const rememberedSessionList = enterprise.listEnterpriseSessions(rememberedLogin.context);
    expect(rememberedSessionList.sessionPolicy).toEqual({
      standardDays: 7,
      rememberedDays: 30
    });
    expect(rememberedSessionList.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: rememberedLogin.context.session.id,
        sessionProfile: "remembered",
        ttlDays: 30
      }),
      expect.objectContaining({
        id: standardLogin.context.session.id,
        sessionProfile: "standard",
        ttlDays: 7
      })
    ]));

    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Saved Enterprise Project",
      snapshot: sampleSnapshot()
    });
    expect(project.datasetCounts.people).toBeGreaterThan(0);
    expect(project.currentVersion).toBe(1);
    expect(enterprise.listEnterpriseProjects(registered.context)).toHaveLength(1);
    expect(enterprise.getEnterpriseProject(registered.context, project.id).snapshot.schemaVersion).toBe("sena-project-snapshot/v1");
    const updatedProject = enterprise.updateEnterpriseProject(registered.context, project.id, {
      snapshot: sampleSnapshot(),
      description: "Updated with a second enterprise test revision."
    });
    expect(updatedProject.currentVersion).toBe(2);

    const provisioning = enterprise.provisionEnterpriseOrganization({
      source: "scim",
      organization: "Enterprise Lab",
      teams: [{ externalId: "cohort-a", name: "Provisioned Cohort A", plan: "enterprise" }],
      users: [
        {
          externalId: "pi-001",
          email: "provisioned-pi@example.edu",
          name: "Provisioned PI",
          sso: { provider: "institution", subject: "pi-001" },
          memberships: [{ teamExternalId: "cohort-a", role: "pi" }]
        },
        {
          externalId: "coder-001",
          email: "provisioned-coder@example.edu",
          name: "Provisioned Coder",
          sso: { provider: "institution", subject: "coder-001" },
          memberships: [{ teamExternalId: "cohort-a", role: "coder" }]
        }
      ]
    });
    expect(provisioning.schemaVersion).toBe("sena-enterprise-provisioning/v1");
    expect(provisioning.summary.teamsCreated).toBe(1);
    expect(provisioning.summary.usersCreated).toBe(2);
    expect(provisioning.summary.membershipsCreated).toBe(2);
    expect(provisioning.users[0].emailHash).toHaveLength(64);
    const provisionedPiLogin = enterprise.ssoEnterpriseUser({
      provider: "institution",
      email: "provisioned-pi@example.edu",
      subject: "pi-001"
    });
    expect(provisionedPiLogin.context.memberships[0].role).toBe("pi");
    expect(provisionedPiLogin.context.teams[0].provisioning?.externalId).toBe("cohort-a");
    const provisioningAudit = enterprise.listEnterpriseAuditLog(provisionedPiLogin.context, {
      teamId: provisioning.teams[0].id,
      event: "provisioning.sync",
      limit: 5
    });
    expect(provisioningAudit.events).toHaveLength(1);
    expect(provisioningAudit.events[0].detail.usersCreated).toBe(2);
    const provisioningGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(provisioningGovernance.checks.find((check: { id: string }) => check.id === "organization-provisioning")?.evidence)
      .toContain("token=redacted");
    expect(provisioningGovernance.checks.find((check: { id: string }) => check.id === "organization-provisioning")?.evidence)
      .toContain("provisioningToken=configured");
    expect(provisioningGovernance.checks.find((check: { id: string }) => check.id === "organization-provisioning")?.evidence)
      .toContain("provisioningTokenStrength=configured");
    expect(provisioningGovernance.checks.find((check: { id: string }) => check.id === "organization-provisioning")?.evidence)
      .toContain("provisionedUsers=2");

    const scimPi = scim.provisionEnterpriseScimUser({
      schemas: [scim.scimCoreUserSchema, scim.senaScimUserExtensionSchema],
      userName: "scim-pi@example.edu",
      externalId: "scim-pi-001",
      active: true,
      name: { formatted: "SCIM PI" },
      [scim.senaScimUserExtensionSchema]: {
        organization: "Enterprise Lab",
        ssoProvider: "institution",
        ssoSubject: "scim-pi-001",
        memberships: [{ teamExternalId: "scim-cohort", teamName: "SCIM Cohort", role: "pi" }]
      }
    });
    expect(scimPi.schemaVersion).toBe("sena-scim-provisioning-bridge/v1");
    expect(scimPi.provisioning.source).toBe("scim");
    expect(scimPi.provisioning.summary.teamsCreated).toBe(1);
    expect(scimPi.provisioning.summary.membershipsCreated).toBe(1);
    expect(scimPi.resource.schemas).toContain(scim.senaScimUserExtensionSchema);
    const scimCoder = scim.provisionEnterpriseScimUser({
      schemas: [scim.scimCoreUserSchema, scim.senaScimUserExtensionSchema],
      userName: "scim-coder@example.edu",
      externalId: "scim-coder-001",
      active: true,
      name: { formatted: "SCIM Coder" },
      [scim.senaScimUserExtensionSchema]: {
        organization: "Enterprise Lab",
        ssoSubject: "scim-coder-001",
        memberships: [{ teamExternalId: "scim-cohort", teamName: "SCIM Cohort", role: "coder" }]
      }
    });
    expect(scimCoder.provisioning.summary.usersCreated).toBe(1);
    const scimCoderLogin = enterprise.ssoEnterpriseUser({
      provider: "institution",
      email: "scim-coder@example.edu",
      subject: "scim-coder-001"
    });
    expect(scimCoderLogin.context.memberships[0].role).toBe("coder");
    expect(scimCoderLogin.context.teams[0].provisioning?.externalId).toBe("scim-cohort");
    const scimCoderSuspended = scim.patchEnterpriseScimUser(String(scimCoder.resource.id), {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "active", value: false }]
    });
    expect(scimCoderSuspended.provisioning.summary.membershipsUpdated).toBe(1);
    const suspendedScimCoderLogin = enterprise.ssoEnterpriseUser({
      provider: "institution",
      email: "scim-coder@example.edu",
      subject: "scim-coder-001"
    });
    expect(suspendedScimCoderLogin.context.memberships).toHaveLength(0);
    const scimGroup = scim.provisionEnterpriseScimGroup({
      schemas: [scim.scimCoreGroupSchema, scim.senaScimGroupExtensionSchema],
      displayName: "SCIM Review Group",
      externalId: "scim-review",
      [scim.senaScimGroupExtensionSchema]: {
        organization: "Enterprise Lab",
        plan: "enterprise"
      },
      members: [{
        value: "scim-review-pi-001",
        email: "scim-review-pi@example.edu",
        display: "SCIM Review PI",
        role: "pi"
      }]
    });
    expect(scimGroup.provisioning.summary.teamsCreated).toBe(1);
    expect(scimGroup.provisioning.summary.usersCreated).toBe(1);
    expect(scimGroup.resource.members).toEqual(expect.arrayContaining([expect.objectContaining({ type: "pi", active: true })]));
    const scimUsersList = scim.listEnterpriseScimUsers("https://sena.example.test/api/sena/scim/v2");
    expect(scimUsersList.schemaVersion).toBe("sena-scim-users-list/v1");
    expect(scimUsersList.totalResults).toBe(5);
    expect(scimUsersList.Resources.find((resource) => resource.userName === "scim-coder@example.edu")?.active).toBe(false);
    const scimGroupsList = scim.listEnterpriseScimGroups("https://sena.example.test/api/sena/scim/v2");
    expect(scimGroupsList.schemaVersion).toBe("sena-scim-groups-list/v1");
    expect(scimGroupsList.totalResults).toBe(3);
    expect(scimGroupsList.Resources.find((resource) => resource.displayName === "SCIM Cohort")?.members)
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: "pi", active: true })]));
    const scimGovernance = enterprise.getEnterpriseGovernanceStatus();
    const provisioningEvidence = scimGovernance.checks.find((check: { id: string }) => check.id === "organization-provisioning")?.evidence ?? [];
    expect(provisioningEvidence).toContain("scimApi=/api/sena/scim/v2");
    expect(provisioningEvidence).toContain("scimSchemas=User|Group|EnterpriseUser|SENAUser|SENAGroup");

    const invitation = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "reviewer@example.edu",
      role: "reviewer"
    });
    expect(invitation.inviteCode).toHaveLength(12);
    const webhookRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const originalWebhookFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      webhookRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const delivery = await enterprise.deliverEnterpriseNotifications(registered.context, {
        teamId: registered.context.teams[0].id,
        limit: 5
      });
      expect(delivery.schemaVersion).toBe("sena-enterprise-notification-delivery/v1");
      expect(delivery.provider.mode).toBe("webhook");
      expect(delivery.provider.endpointHash).toHaveLength(64);
      expect(delivery.provider.secretConfigured).toBe(true);
      expect(delivery.summary.delivered).toBe(1);
      expect(delivery.notifications[0].webhookStatus).toBe("delivered");
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(webhookRequests).toHaveLength(1);
    expect(webhookRequests[0].url).toBe("https://notify.example.test/sena");
    expect(webhookRequests[0].headers["x-sena-webhook-signature"]).toMatch(/^sha256=/);
    const webhookPayload = JSON.parse(webhookRequests[0].body) as {
      schemaVersion: string;
      notification: { kind: string; recipientEmailHash?: string; recipientEmailDomain?: string; detail: Record<string, unknown> };
      delivery: { endpointHash: string; attempt: number };
    };
    expect(webhookPayload.schemaVersion).toBe("sena-enterprise-notification-webhook/v1");
    expect(webhookPayload.notification.kind).toBe("team.invite");
    expect(webhookPayload.notification.recipientEmailHash).toHaveLength(64);
    expect(webhookPayload.notification.recipientEmailDomain).toBe("example.edu");
    expect("email" in webhookPayload.notification).toBe(false);
    expect("inviteCode" in webhookPayload.notification.detail).toBe(false);
    expect(webhookPayload.delivery.endpointHash).toHaveLength(64);
    expect(webhookPayload.delivery.attempt).toBe(1);
    const emailRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      emailRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const emailDelivery = await enterprise.deliverEnterpriseEmails(registered.context, {
        teamId: registered.context.teams[0].id,
        limit: 5
      });
      expect(emailDelivery.schemaVersion).toBe("sena-enterprise-email-delivery/v1");
      expect(emailDelivery.provider.mode).toBe("webhook");
      expect(emailDelivery.provider.endpointHash).toHaveLength(64);
      expect(emailDelivery.provider.secretConfigured).toBe(true);
      expect(emailDelivery.summary.delivered).toBe(1);
      expect(emailDelivery.emails[0].kind).toBe("team.invite");
      expect(emailDelivery.emails[0].emailStatus).toBe("delivered");
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(emailRequests).toHaveLength(1);
    expect(emailRequests[0].url).toBe("https://mail.example.test/sena");
    expect(emailRequests[0].headers["x-sena-webhook-event"]).toBe("email.deliver");
    expect(emailRequests[0].headers["x-sena-webhook-signature"]).toMatch(/^sha256=/);
    const emailPayload = JSON.parse(emailRequests[0].body) as {
      schemaVersion: string;
      email: {
        kind: string;
        recipientEmailHash?: string;
        recipientEmailDomain?: string;
        recipient: { email: string };
        actionUrl?: string;
        templateData: Record<string, unknown>;
      };
      delivery: { endpointHash: string; attempt: number };
    };
    expect(emailPayload.schemaVersion).toBe("sena-enterprise-email-webhook/v1");
    expect(emailPayload.email.kind).toBe("team.invite");
    expect(emailPayload.email.recipient.email).toBe("reviewer@example.edu");
    expect(emailPayload.email.recipientEmailHash).toHaveLength(64);
    expect(emailPayload.email.recipientEmailDomain).toBe("example.edu");
    expect(emailPayload.email.actionUrl).toContain("/register?inviteCode=");
    expect(emailPayload.email.templateData.inviteCode).toBe(invitation.inviteCode);
    expect(emailPayload.delivery.endpointHash).toHaveLength(64);
    expect(emailPayload.delivery.attempt).toBe(1);
    const reviewer = enterprise.registerEnterpriseUser({
      name: "Reviewer",
      email: "reviewer@example.edu",
      password: "sena-secure-123",
      organization: "Enterprise Lab",
      inviteCode: invitation.inviteCode
    });
    expect(enterprise.hasEnterprisePermission(reviewer.context, registered.context.teams[0].id, "project:read")).toBe(true);
    expect(enterprise.hasEnterprisePermission(reviewer.context, registered.context.teams[0].id, "project:update")).toBe(false);
    expect(enterprise.hasEnterprisePermission(reviewer.context, registered.context.teams[0].id, "reliability:adjudicate")).toBe(true);
    const reviewerNotifications = enterprise.listEnterpriseNotifications(reviewer.context, { kind: "team.invite" });
    expect(reviewerNotifications.schemaVersion).toBe("sena-enterprise-notifications/v1");
    const inviteNotification = reviewerNotifications.notifications.find((notification: { kind: string }) => notification.kind === "team.invite");
    expect(inviteNotification?.recipientEmailHash).toHaveLength(64);
    expect(inviteNotification?.recipientEmailDomain).toBe("example.edu");
    expect(inviteNotification?.webhookDelivery?.status).toBe("delivered");
    expect(enterprise.markEnterpriseNotificationRead(reviewer.context, inviteNotification!.id).status).toBe("read");
    expect(enterprise.listEnterpriseNotifications(reviewer.context, { status: "read" }).notifications.map((notification: { id: string }) => notification.id)).toContain(inviteNotification!.id);
    const existingCollaborator = enterprise.registerEnterpriseUser({
      name: "Existing Collaborator",
      email: "existing-collaborator@example.edu",
      password: "sena-secure-123",
      organization: "External Lab",
      plan: "individual"
    });
    const existingInvite = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "existing-collaborator@example.edu",
      role: "coder"
    });
    const acceptedExistingInvite = enterprise.acceptEnterpriseInvitation(existingCollaborator.context, {
      invitationId: existingInvite.id
    });
    expect(acceptedExistingInvite.schemaVersion).toBe("sena-team-invitation-acceptance/v1");
    expect(acceptedExistingInvite.invitation.status).toBe("accepted");
    expect(acceptedExistingInvite.membership.role).toBe("coder");
    expect(acceptedExistingInvite.context.teams.map((team: { id: string }) => team.id)).toContain(registered.context.teams[0].id);
    expect(enterprise.hasEnterprisePermission(acceptedExistingInvite.context, registered.context.teams[0].id, "project:update")).toBe(true);
    const acceptedInviteAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "team.invite.accept",
      limit: 10
    });
    expect(acceptedInviteAudit.events.some((event: { userId?: string }) => event.userId === existingCollaborator.context.user.id)).toBe(true);
    const lockoutInvitation = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "lockout-reviewer@example.edu",
      role: "reviewer"
    });
    enterprise.registerEnterpriseUser({
      name: "Lockout Reviewer",
      email: "lockout-reviewer@example.edu",
      password: "sena-secure-123",
      organization: "Enterprise Lab",
      inviteCode: lockoutInvitation.inviteCode
    });
    expect(() => enterprise.loginEnterpriseUser({
      email: "lockout-reviewer@example.edu",
      password: "wrong-password-1"
    })).toThrow(/incorrect/i);
    expect(() => enterprise.loginEnterpriseUser({
      email: "lockout-reviewer@example.edu",
      password: "wrong-password-2"
    })).toThrow(/incorrect/i);
    expect(() => enterprise.loginEnterpriseUser({
      email: "lockout-reviewer@example.edu",
      password: "wrong-password-3"
    })).toThrow(/too many failed/i);
    expect(() => enterprise.loginEnterpriseUser({
      email: "lockout-reviewer@example.edu",
      password: "sena-secure-123"
    })).toThrow(/too many failed/i);
    const authGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(authGovernance.auth.loginLockout.maxFailures).toBe(3);
    expect(authGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("loginLockout=maxFailures:3/windowMinutes:15/lockoutMinutes:15");
    const secondSessionLogin = requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "enterprise@example.edu",
      password: "sena-secure-123"
    }));
    const sessionList = enterprise.listEnterpriseSessions(registered.context);
    expect(sessionList.schemaVersion).toBe("sena-enterprise-session-list/v1");
    expect(sessionList.currentSessionId).toBe(registered.context.session.id);
    expect(sessionList.sessions.map((session: { id: string }) => session.id)).toEqual(expect.arrayContaining([
      registered.context.session.id,
      secondSessionLogin.context.session.id
    ]));
    expect(sessionList.sessions.every((session: { expiresInSeconds: number }) => session.expiresInSeconds > 0)).toBe(true);
    const csrfToken = enterprise.createEnterpriseCsrfToken(registered.context);
    expect(csrfToken.schemaVersion).toBe("sena-enterprise-csrf-token/v1");
    expect(csrfToken.headerName).toBe("x-sena-csrf-token");
    expect(csrfToken.sessionId).toBe(registered.context.session.id);
    expect(enterprise.verifyEnterpriseCsrfToken(registered.context, csrfToken.token)).toBe(true);
    expect(() => enterprise.verifyEnterpriseCsrfToken(registered.context, "invalid-token")).toThrow(/csrf/i);
    const sessionRevocation = enterprise.revokeEnterpriseSessions(registered.context, {
      sessionId: secondSessionLogin.context.session.id
    });
    expect(sessionRevocation.schemaVersion).toBe("sena-enterprise-session-revocation/v1");
    expect(sessionRevocation.revokedSessionIds).toContain(secondSessionLogin.context.session.id);
    expect(sessionRevocation.currentSessionRevoked).toBe(false);
    expect(sessionRevocation.remainingSessions.some((session: { id: string }) => session.id === secondSessionLogin.context.session.id)).toBe(false);
    const sessionGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(sessionGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("sessionLifecycleApi=/api/auth/sessions");
    expect(sessionGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("sessionRevocationEvents=1");
    expect(sessionGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("csrfTokenApi=/api/auth/csrf");
    expect(sessionGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("csrfCoverage=session-mutating-api");
    expect(sessionGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("csrfFailEvents=1");
    expect(enterprise.listEnterpriseAuditLog(registered.context, {
      event: "auth.session.revoke",
      limit: 5
    }).events.some((event: { userId?: string }) => event.userId === registered.context.user.id)).toBe(true);
    const csrfFailAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      event: "security.csrf.fail",
      limit: 5
    });
    expect(csrfFailAudit.events).toHaveLength(1);
    expect(csrfFailAudit.events[0].detail.tokenHash).toHaveLength(64);
    expect("token" in csrfFailAudit.events[0].detail).toBe(false);
    const failedLoginAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "auth.login.failed",
      limit: 10
    });
    expect(failedLoginAudit.events).toHaveLength(3);
    expect(failedLoginAudit.events[0].detail.emailHash).toHaveLength(64);
    expect(failedLoginAudit.events[0].detail.emailDomain).toBe("example.edu");
    expect("email" in failedLoginAudit.events[0].detail).toBe(false);
    const lockedLoginAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "auth.login.locked",
      limit: 10
    });
    expect(lockedLoginAudit.events.length).toBeGreaterThanOrEqual(2);
    expect(enterprise.enforceEnterpriseApiRateLimit({
      bucket: "auth.test",
      key: "rate-limit-fixture",
      limit: 2,
      windowSeconds: 60
    }).remaining).toBe(1);
    enterprise.enforceEnterpriseApiRateLimit({
      bucket: "auth.test",
      key: "rate-limit-fixture",
      limit: 2,
      windowSeconds: 60
    });
    expect(() => enterprise.enforceEnterpriseApiRateLimit({
      bucket: "auth.test",
      key: "rate-limit-fixture",
      limit: 2,
      windowSeconds: 60
    })).toThrow(/too many requests/i);
    const rateLimitGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(rateLimitGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("rateLimitEvents=1");
    expect(rateLimitGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("activeRateLimitBuckets=1");
    const rateLimitAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      event: "security.rate_limit",
      limit: 5
    });
    expect(rateLimitAudit.events).toHaveLength(1);
    expect(rateLimitAudit.events[0].detail.keyHash).toHaveLength(64);
    const resetInvitation = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "reset-reviewer@example.edu",
      role: "reviewer"
    });
    enterprise.registerEnterpriseUser({
      name: "Reset Reviewer",
      email: "reset-reviewer@example.edu",
      password: "sena-secure-123",
      organization: "Enterprise Lab",
      inviteCode: resetInvitation.inviteCode
    });
    const passwordReset = enterprise.createEnterprisePasswordReset({
      email: "reset-reviewer@example.edu",
      baseUrl: "https://sena.example.edu"
    });
    expect(passwordReset.schemaVersion).toBe("sena-enterprise-password-reset-request/v1");
    expect(passwordReset.delivery.mode).toBe("local-token");
    expect(passwordReset.delivery.emailDeliveryId).toBeTruthy();
    expect(passwordReset.delivery.resetToken).toBeTruthy();
    expect(passwordReset.delivery.resetUrl).toContain("/reset-password?token=");
    const resetEmailRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      resetEmailRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const resetEmailDelivery = await enterprise.deliverEnterpriseEmails(registered.context, {
        teamId: registered.context.teams[0].id,
        emailDeliveryId: passwordReset.delivery.emailDeliveryId,
        force: true
      });
      expect(resetEmailDelivery.summary.delivered).toBe(1);
      expect(resetEmailDelivery.emails[0].kind).toBe("auth.password_reset");
      expect(resetEmailDelivery.emails[0].emailStatus).toBe("delivered");
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(resetEmailRequests).toHaveLength(1);
    const resetEmailPayload = JSON.parse(resetEmailRequests[0].body) as {
      schemaVersion: string;
      email: {
        kind: string;
        recipient: { email: string };
        actionUrl?: string;
        templateData: Record<string, unknown>;
      };
    };
    expect(resetEmailRequests[0].url).toBe("https://mail.example.test/sena");
    expect(resetEmailRequests[0].headers["x-sena-webhook-signature"]).toMatch(/^sha256=/);
    expect(resetEmailPayload.schemaVersion).toBe("sena-enterprise-email-webhook/v1");
    expect(resetEmailPayload.email.kind).toBe("auth.password_reset");
    expect(resetEmailPayload.email.recipient.email).toBe("reset-reviewer@example.edu");
    expect(resetEmailPayload.email.actionUrl).toContain(passwordReset.delivery.resetToken!);
    expect(resetEmailPayload.email.templateData.resetRequestId).toBeTruthy();
    expect(() => enterprise.completeEnterprisePasswordReset({
      resetToken: passwordReset.delivery.resetToken!,
      password: "password123456"
    })).toThrow(/password policy/i);
    const passwordResetComplete = enterprise.completeEnterprisePasswordReset({
      resetToken: passwordReset.delivery.resetToken!,
      password: "sena-secure-456"
    });
    expect(passwordResetComplete.status).toBe("completed");
    expect(() => enterprise.loginEnterpriseUser({
      email: "reset-reviewer@example.edu",
      password: "sena-secure-123"
    })).toThrow(/incorrect/i);
    const resetLogin = requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "reset-reviewer@example.edu",
      password: "sena-secure-456"
    }));
    expect(resetLogin.context.user.email).toBe("reset-reviewer@example.edu");
    const resetNotifications = enterprise.listEnterpriseNotifications(resetLogin.context, { kind: "auth.password_reset" });
    expect(resetNotifications.notifications.some((notification: { detail: Record<string, unknown> }) => notification.detail.delivery === "local-token")).toBe(true);
    const passwordResetAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "auth.password_reset.complete",
      limit: 10
    });
    expect(passwordResetAudit.events).toHaveLength(1);
    expect(passwordResetAudit.events[0].detail.emailHash).toHaveLength(64);
    expect("resetToken" in passwordResetAudit.events[0].detail).toBe(false);
    const passwordResetGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(passwordResetGovernance.auth.passwordReset.delivery).toBe("local-token");
    expect(passwordResetGovernance.auth.passwordPolicy).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-password-policy/v1",
      minLength: 12,
      requiresLetter: true,
      requiresNumber: true,
      blocksCommonPasswords: true,
      blocksEmailLocalPart: true
    }));
    expect(passwordResetGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("passwordReset=minutes:30/activeRequests:0/delivery:local-token");
    expect(passwordResetGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("passwordPolicy=sena-enterprise-password-policy/v1/minLength:12/letter:number/common-blocklist/email-local-part");
    const mfaInvitation = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "mfa-reviewer@example.edu",
      role: "reviewer"
    });
    const mfaReviewer = enterprise.registerEnterpriseUser({
      name: "MFA Reviewer",
      email: "mfa-reviewer@example.edu",
      password: "sena-secure-123",
      organization: "Enterprise Lab",
      inviteCode: mfaInvitation.inviteCode
    });
    expect(enterprise.getEnterpriseMfaStatus(mfaReviewer.context).enabled).toBe(false);
    const mfaSetup = enterprise.createEnterpriseMfaSetup(mfaReviewer.context);
    expect(mfaSetup.schemaVersion).toBe("sena-enterprise-mfa-setup/v1");
    expect(mfaSetup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(mfaSetup.otpauthUrl).toContain("otpauth://totp/");
    const mfaEnabled = enterprise.enableEnterpriseMfa(mfaReviewer.context, {
      setupToken: mfaSetup.setupToken,
      code: totpCode(mfaSetup.secret),
      label: "Enterprise test authenticator"
    });
    expect(mfaEnabled.enabled).toBe(true);
    expect(enterprise.getEnterpriseMfaStatus(mfaReviewer.context).enabled).toBe(true);
    const mfaChallenge = enterprise.loginEnterpriseUser({
      email: "mfa-reviewer@example.edu",
      password: "sena-secure-123"
    });
    expect("mfaRequired" in mfaChallenge && mfaChallenge.mfaRequired).toBe(true);
    if (!("mfaRequired" in mfaChallenge)) throw new Error("MFA challenge was not returned.");
    const invalidMfaCode = totpCode(mfaSetup.secret) === "000000" ? "111111" : "000000";
    expect(() => enterprise.loginEnterpriseUser({
      email: "mfa-reviewer@example.edu",
      password: "sena-secure-123",
      mfaChallengeToken: mfaChallenge.challengeToken,
      mfaCode: invalidMfaCode
    })).toThrow(/Authenticator code/i);
    const mfaLogin = enterprise.loginEnterpriseUser({
      email: "mfa-reviewer@example.edu",
      password: "sena-secure-123",
      mfaChallengeToken: mfaChallenge.challengeToken,
      mfaCode: totpCode(mfaSetup.secret)
    });
    if ("mfaRequired" in mfaLogin) throw new Error("MFA login did not complete.");
    expect(mfaLogin.context.user.email).toBe("mfa-reviewer@example.edu");
    const mfaAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "auth.mfa.verify",
      limit: 10
    });
    expect(mfaAudit.events.length).toBeGreaterThanOrEqual(3);
    expect(mfaAudit.events.every((event: { detail: Record<string, unknown> }) => !("secret" in event.detail))).toBe(true);
    const mfaGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(mfaGovernance.auth.mfa.enabledUsers).toBe(1);
    expect(mfaGovernance.checks.find((check: { id: string }) => check.id === "auth-session")?.evidence)
      .toContain("mfa=totp/enabledUsers:1/challengeMinutes:5/setupMinutes:10");
    const mfaDisabled = enterprise.disableEnterpriseMfa(mfaReviewer.context, {
      code: totpCode(mfaSetup.secret)
    });
    expect(mfaDisabled.enabled).toBe(false);
    const pendingInvite = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "pending-reviewer@example.edu",
      role: "viewer"
    });
    expect(enterprise.revokeEnterpriseInvitation(registered.context, pendingInvite.id).status).toBe("revoked");
    expect(() => enterprise.updateEnterpriseMembership(registered.context, registered.context.memberships[0].id, {
      role: "admin"
    })).toThrow(/at least one active/i);
    const reviewerMembership = enterprise
      .listEnterpriseTeamState(registered.context)
      .memberships
      .find((membership: { userId: string }) => membership.userId === reviewer.context.user.id);
    expect(reviewerMembership).toBeTruthy();
    expect(enterprise.updateEnterpriseMembership(registered.context, reviewerMembership!.id, {
      role: "coder"
    }).role).toBe("coder");
    expect(requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "reviewer@example.edu",
      password: "sena-secure-123"
    })).context.memberships[0].role).toBe("coder");
    expect(enterprise.updateEnterpriseMembership(registered.context, reviewerMembership!.id, {
      status: "suspended"
    }).status).toBe("suspended");
    const suspendedReviewer = requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "reviewer@example.edu",
      password: "sena-secure-123"
    }));
    expect(suspendedReviewer.context.teams).toHaveLength(0);
    expect(enterprise.updateEnterpriseMembership(registered.context, reviewerMembership!.id, {
      role: "reviewer",
      status: "active"
    }).status).toBe("active");
    const activeReviewer = requireCompletedLogin(enterprise.loginEnterpriseUser({
      email: "reviewer@example.edu",
      password: "sena-secure-123"
    }));
    const teamLifecycleGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(teamLifecycleGovernance.checks.map((check: { id: string }) => check.id)).toContain("team-lifecycle-governance");

    const oidcKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const oidcJwks = publicJwks(oidcKeys.publicKey);
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_SSO_GOOGLE_CLIENT_ID = "sena-google-client";
    process.env.SENA_SSO_GOOGLE_CLIENT_SECRET = "sena_google_2026_9f4c2a1d8e7b6c5a4f3e2d1c0b9a8765";
    process.env.SENA_SSO_GOOGLE_ISSUER = "https://idp.example.test";
    process.env.SENA_SSO_GOOGLE_AUTHORIZATION_URL = "https://idp.example.test/authorize";
    process.env.SENA_SSO_GOOGLE_TOKEN_URL = "https://idp.example.test/token";
    process.env.SENA_SSO_GOOGLE_USERINFO_URL = "https://idp.example.test/userinfo";
    process.env.SENA_SSO_GOOGLE_JWKS_URL = "https://idp.example.test/jwks";
    const googleStatus = enterprise.getEnterpriseSsoProviderStatuses().find((status: { provider: string }) => status.provider === "google");
    expect(googleStatus?.configured).toBe(true);
    const ssoPreflight = await enterprise.preflightEnterpriseSsoProviders({
      providers: ["google"],
      baseUrl: "https://sena.example.test"
    });
    expect(ssoPreflight.schemaVersion).toBe("sena-enterprise-sso-preflight/v1");
    expect(ssoPreflight.summary.checked).toBe(1);
    expect(ssoPreflight.summary.passed).toBe(1);
    expect(ssoPreflight.providers[0].provider).toBe("google");
    expect(ssoPreflight.providers[0].status).toBe("pass");
    expect(ssoPreflight.providers[0].callbackUrl).toBe("https://sena.example.test/api/auth/sso/callback?provider=google");
    expect(ssoPreflight.providers[0].endpointHashes.authorization).toHaveLength(64);
    expect(ssoPreflight.providers[0].endpointHashes.token).toHaveLength(64);
    expect(ssoPreflight.providers[0].endpointHashes.userinfo).toHaveLength(64);
    expect(ssoPreflight.providers[0].checks.find((check: { id: string }) => check.id === "sso-callback-url")?.status).toBe("pass");
    const pkceNonceCheck = ssoPreflight.providers[0].checks.find((check: { id: string }) => check.id === "sso-pkce-nonce-binding");
    expect(pkceNonceCheck?.status).toBe("pass");
    expect(pkceNonceCheck?.evidence).toContain("pkce=S256");
    expect(pkceNonceCheck?.evidence).toContain("nonce=state-bound");
    const idTokenValidationCheck = ssoPreflight.providers[0].checks.find((check: { id: string }) => check.id === "sso-id-token-validation");
    expect(idTokenValidationCheck?.status).toBe("pass");
    expect(idTokenValidationCheck?.evidence).toContain("issuerHash=d2cee98e88da343aa5279aa57a95d380bad428c50dbbeb1e730f5839b0d46672");
    expect(idTokenValidationCheck?.evidence).toContain("jwksHash=1b108c6f1e42634632d9887e25b44525badafc3ea915c9bab01b439ab8f3a2c0");
    const ssoPreflightGovernance = enterprise.getEnterpriseGovernanceStatus();
    const ssoGovernanceEvidence = ssoPreflightGovernance.checks.find((check: { id: string }) => check.id === "oauth-oidc-sso")?.evidence ?? [];
    expect(ssoGovernanceEvidence).toContain("preflightApi=/api/auth/sso?status=1&preflight=1");
    expect(ssoGovernanceEvidence).toContain("preflightSchema=sena-enterprise-sso-preflight/v1");
    expect(ssoGovernanceEvidence).toContain("preflightPassedProviders=google");
    expect(ssoGovernanceEvidence).toContain("pkce=S256");
    expect(ssoGovernanceEvidence).toContain("nonce=state-bound");
    expect(ssoGovernanceEvidence).toContain("idTokenSignature=jwks");
    const ssoInvitation = enterprise.createEnterpriseInvitation(registered.context, {
      teamId: registered.context.teams[0].id,
      email: "sso@example.edu",
      role: "reviewer"
    });
    const authorization = await enterprise.createEnterpriseSsoAuthorization({
      provider: "google",
      baseUrl: "https://sena.example.test",
      redirectTo: "/workspace/sena?rail=sets",
      inviteCode: ssoInvitation.inviteCode
    });
    const authorizationUrl = new URL(authorization.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://idp.example.test");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("sena-google-client");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("https://sena.example.test/api/auth/sso/callback?provider=google");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("nonce")).toBeTruthy();
    let tokenRequestBody = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      if (String(url) === "https://idp.example.test/token") {
        tokenRequestBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          access_token: "provider-access-token",
          id_token: signedRs256Jwt({
            iss: "https://idp.example.test",
            aud: "sena-google-client",
            nonce: authorizationUrl.searchParams.get("nonce"),
            sub: "google-subject-1",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300
          }, oidcKeys.privateKey)
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/jwks") {
        return new Response(JSON.stringify(oidcJwks), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/userinfo") {
        return new Response(JSON.stringify({
          sub: "google-subject-1",
          email: "sso@example.edu",
          name: "Google SSO Researcher",
          hd: "example.edu"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected SSO fetch ${String(url)}`);
    }) as typeof fetch;
    try {
      const sso = await enterprise.completeEnterpriseSsoCallback({
        provider: "google",
        baseUrl: "https://sena.example.edu",
        code: "provider-code",
        state: authorizationUrl.searchParams.get("state")!
      });
      expect(tokenRequestBody).toContain("grant_type=authorization_code");
      expect(tokenRequestBody).toContain("code_verifier=");
      expect(sso.context.user.email).toBe("sso@example.edu");
      expect(sso.context.user.ssoIdentities[0].provider).toBe("google");
      expect(sso.redirectTo).toBe("/workspace/sena?rail=sets");
      expect(sso.context.teams.map((team: { id: string }) => team.id)).toContain(registered.context.teams[0].id);
      expect(enterprise.hasEnterprisePermission(sso.context, registered.context.teams[0].id, "project:read")).toBe(true);
      expect(enterprise.hasEnterprisePermission(sso.context, registered.context.teams[0].id, "project:update")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const nonceMismatchAuthorization = await enterprise.createEnterpriseSsoAuthorization({
      provider: "google",
      baseUrl: "https://sena.example.edu",
      redirectTo: "/workspace/sena"
    });
    const nonceMismatchUrl = new URL(nonceMismatchAuthorization.authorizationUrl);
    let nonceMismatchUserinfoCalled = false;
    globalThis.fetch = (async (url) => {
      if (String(url) === "https://idp.example.test/token") {
        return new Response(JSON.stringify({
          access_token: "provider-access-token",
          id_token: signedRs256Jwt({
            iss: "https://idp.example.test",
            aud: "sena-google-client",
            nonce: "tampered-nonce",
            sub: "google-subject-2",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300
          }, oidcKeys.privateKey)
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/jwks") {
        return new Response(JSON.stringify(oidcJwks), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/userinfo") {
        nonceMismatchUserinfoCalled = true;
        return new Response(JSON.stringify({
          sub: "google-subject-2",
          email: "nonce-mismatch@example.edu",
          name: "Nonce Mismatch"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected SSO nonce mismatch fetch ${String(url)}`);
    }) as typeof fetch;
    try {
      await expect(enterprise.completeEnterpriseSsoCallback({
        provider: "google",
        baseUrl: "https://sena.example.edu",
        code: "provider-code",
        state: nonceMismatchUrl.searchParams.get("state")!
      })).rejects.toMatchObject({ code: "sso_nonce_mismatch" });
      expect(nonceMismatchUserinfoCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const issuerMismatchAuthorization = await enterprise.createEnterpriseSsoAuthorization({
      provider: "google",
      baseUrl: "https://sena.example.edu",
      redirectTo: "/workspace/sena"
    });
    const issuerMismatchUrl = new URL(issuerMismatchAuthorization.authorizationUrl);
    let issuerMismatchUserinfoCalled = false;
    globalThis.fetch = (async (url) => {
      if (String(url) === "https://idp.example.test/token") {
        return new Response(JSON.stringify({
          access_token: "provider-access-token",
          id_token: signedRs256Jwt({
            iss: "https://rogue-idp.example.test",
            aud: "sena-google-client",
            nonce: issuerMismatchUrl.searchParams.get("nonce"),
            sub: "google-subject-3",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300
          }, oidcKeys.privateKey)
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/jwks") {
        return new Response(JSON.stringify(oidcJwks), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/userinfo") {
        issuerMismatchUserinfoCalled = true;
        return new Response(JSON.stringify({
          sub: "google-subject-3",
          email: "issuer-mismatch@example.edu",
          name: "Issuer Mismatch"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected SSO issuer mismatch fetch ${String(url)}`);
    }) as typeof fetch;
    try {
      await expect(enterprise.completeEnterpriseSsoCallback({
        provider: "google",
        baseUrl: "https://sena.example.edu",
        code: "provider-code",
        state: issuerMismatchUrl.searchParams.get("state")!
      })).rejects.toMatchObject({ code: "sso_issuer_mismatch" });
      expect(issuerMismatchUserinfoCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const expiredAuthorization = await enterprise.createEnterpriseSsoAuthorization({
      provider: "google",
      baseUrl: "https://sena.example.edu",
      redirectTo: "/workspace/sena"
    });
    const expiredUrl = new URL(expiredAuthorization.authorizationUrl);
    let expiredUserinfoCalled = false;
    globalThis.fetch = (async (url) => {
      if (String(url) === "https://idp.example.test/token") {
        return new Response(JSON.stringify({
          access_token: "provider-access-token",
          id_token: signedRs256Jwt({
            iss: "https://idp.example.test",
            aud: "sena-google-client",
            nonce: expiredUrl.searchParams.get("nonce"),
            sub: "google-subject-4",
            iat: Math.floor(Date.now() / 1000) - 600,
            exp: Math.floor(Date.now() / 1000) - 60
          }, oidcKeys.privateKey)
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/jwks") {
        return new Response(JSON.stringify(oidcJwks), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/userinfo") {
        expiredUserinfoCalled = true;
        return new Response(JSON.stringify({
          sub: "google-subject-4",
          email: "expired@example.edu",
          name: "Expired Token"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected SSO expired token fetch ${String(url)}`);
    }) as typeof fetch;
    try {
      await expect(enterprise.completeEnterpriseSsoCallback({
        provider: "google",
        baseUrl: "https://sena.example.edu",
        code: "provider-code",
        state: expiredUrl.searchParams.get("state")!
      })).rejects.toMatchObject({ code: "sso_id_token_expired" });
      expect(expiredUserinfoCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const rogueKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signatureMismatchAuthorization = await enterprise.createEnterpriseSsoAuthorization({
      provider: "google",
      baseUrl: "https://sena.example.edu",
      redirectTo: "/workspace/sena"
    });
    const signatureMismatchUrl = new URL(signatureMismatchAuthorization.authorizationUrl);
    let signatureMismatchUserinfoCalled = false;
    globalThis.fetch = (async (url) => {
      if (String(url) === "https://idp.example.test/token") {
        return new Response(JSON.stringify({
          access_token: "provider-access-token",
          id_token: signedRs256Jwt({
            iss: "https://idp.example.test",
            aud: "sena-google-client",
            nonce: signatureMismatchUrl.searchParams.get("nonce"),
            sub: "google-subject-5",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300
          }, rogueKeys.privateKey)
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/jwks") {
        return new Response(JSON.stringify(oidcJwks), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (String(url) === "https://idp.example.test/userinfo") {
        signatureMismatchUserinfoCalled = true;
        return new Response(JSON.stringify({
          sub: "google-subject-5",
          email: "signature-mismatch@example.edu",
          name: "Signature Mismatch"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected SSO signature mismatch fetch ${String(url)}`);
    }) as typeof fetch;
    try {
      await expect(enterprise.completeEnterpriseSsoCallback({
        provider: "google",
        baseUrl: "https://sena.example.edu",
        code: "provider-code",
        state: signatureMismatchUrl.searchParams.get("state")!
      })).rejects.toMatchObject({ code: "sso_id_token_signature_invalid" });
      expect(signatureMismatchUserinfoCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const ssoInviteAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "team.invite.accept",
      limit: 10
    });
    expect(ssoInviteAudit.events.some((event: { detail: Record<string, unknown> }) => (
      event.detail.invitationId === ssoInvitation.id && event.detail.method === "sso"
    ))).toBe(true);

    enterprise.touchEnterpriseProjectPresence(registered.context, project.id, {
      activeView: "plots",
      cursorLabel: "fusion"
    });
    const comment = enterprise.createEnterpriseProjectComment(activeReviewer.context, project.id, {
      body: "Reviewer note on the fusion canvas.",
      target: { kind: "project", label: "Whole project" }
    });
    enterprise.createEnterpriseAdjudicationRecord(activeReviewer.context, project.id, {
      itemId: "u1",
      codeId: "Evidence",
      decision: "include",
      notes: "Reviewer adjudicated the Evidence code."
    });
    const collaboration = enterprise.listEnterpriseProjectCollaboration(registered.context, project.id);
    expect(collaboration.revisions.map((revision: { version: number }) => revision.version)).toEqual([2, 1]);
    expect(collaboration.presence).toHaveLength(1);
    expect(collaboration.comments[0].body).toContain("Reviewer note");
    expect(collaboration.adjudications[0].decision).toBe("include");
    const commentNotifications = enterprise.listEnterpriseNotifications(registered.context, { kind: "project.comment" });
    expect(commentNotifications.notifications.some((notification: { projectId?: string; detail: Record<string, unknown> }) => (
      notification.projectId === project.id && notification.detail.commentId === comment.id
    ))).toBe(true);
    expect(enterprise.resolveEnterpriseProjectComment(registered.context, project.id, comment.id).status).toBe("resolved");
    const pubSubRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      pubSubRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const pubSubDelivery = await enterprise.deliverEnterpriseCollaborationPubSub(registered.context, {
        projectId: project.id,
        limit: 10,
        force: true
      });
      expect(pubSubDelivery.schemaVersion).toBe("sena-enterprise-collaboration-pubsub-delivery/v1");
      expect(pubSubDelivery.provider.mode).toBe("webhook");
      expect(pubSubDelivery.provider.endpointHash).toHaveLength(64);
      expect(pubSubDelivery.provider.secretConfigured).toBe(true);
      expect(pubSubDelivery.summary.delivered).toBeGreaterThanOrEqual(4);
      expect(pubSubDelivery.events.every((event: { deliveryStatus: string }) => event.deliveryStatus === "delivered")).toBe(true);
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(pubSubRequests.length).toBeGreaterThanOrEqual(4);
    expect(pubSubRequests[0].url).toBe("https://pubsub.example.test/sena/collaboration");
    expect(pubSubRequests[0].headers["x-sena-webhook-event"]).toBe("collaboration.publish");
    expect(pubSubRequests[0].headers["x-sena-project-id"]).toBe(project.id);
    const pubSubTimestamp = pubSubRequests[0].headers["x-sena-webhook-timestamp"];
    expect(pubSubRequests[0].headers["x-sena-webhook-signature"]).toBe(`sha256=${createHmac("sha256", "sena-collaboration-pubsub-secret").update(`${pubSubTimestamp}.${pubSubRequests[0].body}`).digest("hex")}`);
    const pubSubPayloads = pubSubRequests.map((request) => JSON.parse(request.body) as {
      schemaVersion: string;
      event: { id: string; kind: string; projectId: string; actorUserId: string; detail: Record<string, unknown> };
      delivery: { endpointHash: string; attempt: number; maxAttempts: number };
    });
    expect(pubSubPayloads.every((payload) => payload.schemaVersion === "sena-enterprise-collaboration-pubsub-webhook/v1")).toBe(true);
    expect(pubSubPayloads.map((payload) => payload.event.kind)).toEqual(expect.arrayContaining(["presence", "comment", "comment.resolve", "adjudication"]));
    expect(pubSubPayloads.every((payload) => payload.event.projectId === project.id)).toBe(true);
    expect(pubSubPayloads.every((payload) => payload.delivery.endpointHash.length === 64)).toBe(true);
    expect(pubSubPayloads.every((payload) => payload.delivery.maxAttempts === 2)).toBe(true);
    const governance = enterprise.getEnterpriseGovernanceStatus();
    expect(governance.schemaVersion).toBe("sena-enterprise-governance/v1");
    expect(governance.checks.map((check: { id: string }) => check.id)).toContain("collaboration-governance");
    expect(governance.checks.map((check: { id: string }) => check.id)).toContain("notification-delivery");
    expect(governance.checks.find((check: { id: string }) => check.id === "collaboration-governance")?.evidence).toContain("streamSchema=sena-project-collaboration-stream/v1");
    expect(governance.checks.find((check: { id: string }) => check.id === "notification-delivery")?.evidence).toContain("api=/api/sena/notifications");
    expect(governance.checks.find((check: { id: string }) => check.id === "notification-delivery")?.evidence).toContain("webhookProvider=webhook");
    expect(governance.checks.find((check: { id: string }) => check.id === "notification-delivery")?.evidence).toContain("emailWebhookProvider=webhook");
    expect(governance.checks.find((check: { id: string }) => check.id === "notification-delivery")?.evidence).toContain("emailWebhookSchema=sena-enterprise-email-webhook/v1");
    expect(governance.checks.find((check: { id: string }) => check.id === "notification-delivery")?.evidence).toContain("webhookDeliverEvents=1");
    expect(governance.checks.find((check: { id: string }) => check.id === "notification-delivery")?.evidence).toContain("emailWebhookDeliverEvents=2");
    const teamLifecycleEvidence = governance.checks.find((check: { id: string }) => check.id === "team-lifecycle-governance")?.evidence ?? [];
    const invitationAcceptances = Number(teamLifecycleEvidence.find((entry: string) => entry.startsWith("invitationAcceptances="))?.split("=")[1] ?? 0);
    expect(invitationAcceptances).toBeGreaterThanOrEqual(2);
    expect(governance.checks.find((check: { id: string }) => check.id === "audit-log")?.evidence).toContain("api=/api/sena/governance/audit");
    expect(governance.checks.find((check: { id: string }) => check.id === "audit-log")?.evidence).toContain("integrityApi=/api/sena/governance/audit?integrity=1");
    expect(governance.checks.find((check: { id: string }) => check.id === "audit-log")?.evidence).toContain("deliveryApi=POST:/api/sena/governance/audit");
    expect(governance.checks.find((check: { id: string }) => check.id === "audit-log")?.evidence).toContain("webhookProvider=webhook");
    expect(governance.checks.find((check: { id: string }) => check.id === "audit-log")?.evidence).toContain("retentionDays=3650");
    expect(governance.counts.projectRevisions).toBe(2);
    expect(governance.counts.collaborationEvents).toBeGreaterThanOrEqual(4);
    expect(governance.counts.notifications).toBeGreaterThan(0);
    expect(governance.checks.find((check: { id: string }) => check.id === "persistence")?.evidence)
      .toContain("optimisticConcurrency=currentVersion/expectedVersion");
    expect(governance.checks.find((check: { id: string }) => check.id === "persistence")?.evidence)
      .toContain("revisionRestore=append-only");
    expect(governance.checks.find((check: { id: string }) => check.id === "collaboration-governance")?.evidence)
      .toContain("saveGuard=expectedVersion-409-conflict");
    expect(governance.checks.find((check: { id: string }) => check.id === "collaboration-governance")?.evidence)
      .toContain("revisionRestoreGuard=expectedVersion-append-only");
    expect(governance.checks.find((check: { id: string }) => check.id === "collaboration-governance")?.evidence)
      .toContain("pubsubProvider=webhook");
    expect(governance.checks.find((check: { id: string }) => check.id === "collaboration-governance")?.evidence)
      .toContain("pubsubWebhookSchema=sena-enterprise-collaboration-pubsub-webhook/v1");
    expect(governance.checks.find((check: { id: string }) => check.id === "collaboration-governance")?.evidence)
      .toContain("pubsubDeliverEvents=4");
    const securityPosture = enterprise.getEnterpriseSecurityPosture();
    expect(securityPosture.schemaVersion).toBe("sena-enterprise-security-posture/v1");
    expect(["ready", "review", "blocked"]).toContain(securityPosture.status);
    expect(securityPosture.evidenceSources).toEqual({
      governanceSchema: "sena-enterprise-governance/v1",
      readinessSchema: "sena-enterprise-deployment-readiness/v1"
    });
    expect(securityPosture.auth.sessionCookie).toBe(governance.auth.sessionCookie);
    expect(securityPosture.auth.passwordHash).toBe("pbkdf2-sha256");
    expect(securityPosture.summary.controls).toBe(securityPosture.controls.length);
    expect(securityPosture.summary.categories.map((category: { id: string }) => category.id))
      .toEqual(["identity", "access", "data-protection", "audit-monitoring", "continuity"]);
    expect(securityPosture.controls.map((control: { id: string }) => control.id)).toEqual(expect.arrayContaining([
      "auth-session",
      "oauth-oidc-sso",
      "security-response-headers",
      "rbac",
      "upload-security-scan",
      "audit-log",
      "ops-bearer-token",
      "backup-webhook",
      "collaboration-pubsub"
    ]));
    expect(governance.checks.find((check: { id: string }) => check.id === "security-response-headers")?.evidence)
      .toEqual(expect.arrayContaining([
        "header=x-content-type-options:nosniff",
        "header=x-frame-options:DENY",
        "header=strict-transport-security:max-age=63072000; includeSubDomains; preload",
        "header=cross-origin-opener-policy:same-origin",
        "header=cross-origin-resource-policy:same-origin",
        "header=content-security-policy-report-only",
        "cspMode=report-only"
      ]));
    expect(securityPosture.controls.find((control: { id: string }) => control.id === "auth-session")?.source).toBe("governance");
    expect(securityPosture.controls.find((control: { id: string }) => control.id === "security-response-headers")?.source).toBe("governance");
    expect(securityPosture.controls.find((control: { id: string }) => control.id === "ops-bearer-token")?.source).toBe("readiness");
    expect(securityPosture.runbook.api).toBe("/api/sena/governance/security");
    const concurrentBaseSnapshot = sampleSnapshot();
    concurrentBaseSnapshot.title = "Concurrent Base Snapshot";
    const concurrentNextSnapshot = sampleSnapshot();
    concurrentNextSnapshot.title = "Concurrent Next Snapshot";
    const concurrentProject = enterprise.createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Concurrent Save Project",
      snapshot: concurrentBaseSnapshot
    });
    const concurrentUpdate = enterprise.updateEnterpriseProject(registered.context, concurrentProject.id, {
      snapshot: concurrentNextSnapshot,
      expectedVersion: 1
    });
    expect(concurrentUpdate.currentVersion).toBe(2);
    expect(() => enterprise.updateEnterpriseProject(registered.context, concurrentProject.id, {
      snapshot: sampleSnapshot(),
      expectedVersion: 1
    })).toThrow(/version conflict/i);
    expect(enterprise.getEnterpriseProject(registered.context, concurrentProject.id).currentVersion).toBe(2);
    const restoredProject = enterprise.restoreEnterpriseProjectRevision(registered.context, concurrentProject.id, {
      version: 1,
      expectedVersion: 2
    });
    expect(restoredProject.schemaVersion).toBe("sena-project-revision-restore/v1");
    expect(restoredProject.project.currentVersion).toBe(3);
    expect(restoredProject.project.snapshot.title).toBe("Concurrent Base Snapshot");
    expect(restoredProject.restoredFrom.version).toBe(1);
    expect(restoredProject.restoredRevision.summary).toContain("Restored from version 1");
    expect(() => enterprise.restoreEnterpriseProjectRevision(registered.context, concurrentProject.id, {
      version: 1,
      expectedVersion: 2
    })).toThrow(/version conflict/i);
    const projectRestoreAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "project.restore",
      limit: 5
    });
    expect(projectRestoreAudit.events[0].detail.restoredFromVersion).toBe(1);
    expect(projectRestoreAudit.events[0].detail.restoredToVersion).toBe(3);
    const projectCreateAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "project.create",
      limit: 5
    });
    expect(projectCreateAudit.schemaVersion).toBe("sena-enterprise-audit-log/v1");
    expect(projectCreateAudit.events.some((event: { projectId?: string }) => event.projectId === project.id)).toBe(true);
    expect(projectCreateAudit.pagination.limit).toBe(5);
    const auditIntegrity = enterprise.verifyEnterpriseAuditIntegrity(registered.context, {
      teamId: registered.context.teams[0].id
    });
    expect(auditIntegrity.schemaVersion).toBe("sena-enterprise-audit-integrity/v1");
    expect(auditIntegrity.status).toBe("pass");
    expect(auditIntegrity.retention.retentionWindowDays).toBe(3650);
    expect(auditIntegrity.retention.withinConfiguredWindow).toBe(true);
    expect(auditIntegrity.chain.headHash).toHaveLength(64);
    expect(auditIntegrity.checks.find((check: { id: string }) => check.id === "audit-retention-window")?.status).toBe("pass");
    const auditWebhookRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      auditWebhookRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const auditDelivery = await enterprise.deliverEnterpriseAuditLog(registered.context, {
        teamId: registered.context.teams[0].id,
        limit: 100,
        force: true
      });
      expect(auditDelivery.schemaVersion).toBe("sena-enterprise-audit-delivery/v1");
      expect(auditDelivery.provider.mode).toBe("webhook");
      expect(auditDelivery.provider.endpointHash).toHaveLength(64);
      expect(auditDelivery.provider.secretConfigured).toBe(true);
      expect(auditDelivery.integrity.chain.headHash).toBe(auditIntegrity.chain.headHash);
      expect(auditDelivery.summary.delivered).toBeGreaterThan(0);
      expect(auditDelivery.auditEvents.every((event: { webhookStatus: string }) => event.webhookStatus === "delivered")).toBe(true);
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(auditWebhookRequests.length).toBeGreaterThan(0);
    expect(auditWebhookRequests[0].url).toBe("https://siem.example.test/sena/audit");
    expect(auditWebhookRequests[0].headers["x-sena-webhook-event"]).toBe("audit.forward");
    expect(auditWebhookRequests[0].headers["x-sena-webhook-signature"]).toMatch(/^sha256=/);
    expect(auditWebhookRequests[0].headers["x-sena-audit-chain-head"]).toHaveLength(64);
    const inviteAuditPayload = auditWebhookRequests
      .map((request) => JSON.parse(request.body) as { schemaVersion: string; audit: { event: string; detail: Record<string, unknown>; chainHead: string } })
      .find((payload) => payload.audit.event === "team.invite");
    expect(inviteAuditPayload?.schemaVersion).toBe("sena-enterprise-audit-webhook/v1");
    expect(inviteAuditPayload?.audit.chainHead).toBe(auditIntegrity.chain.headHash);
    expect(inviteAuditPayload?.audit.detail.emailHash).toHaveLength(64);
    expect(inviteAuditPayload?.audit.detail.emailDomain).toBe("example.edu");
    expect("email" in (inviteAuditPayload?.audit.detail ?? {})).toBe(false);
    expect(() => enterprise.listEnterpriseAuditLog(activeReviewer.context)).toThrow(/team management permission/i);

    const backup = enterprise.createEnterpriseBackup(registered.context, {
      teamId: registered.context.teams[0].id
    });
    expect(backup.schemaVersion).toBe("sena-enterprise-backup/v1");
    expect(backup.scope.uploadBlobsIncluded).toBe(false);
    expect(backup.scope.excludedCollections).toContain("passwordHash");
    expect(backup.scope.excludedCollections).toContain("mfaSecrets");
    expect(backup.scope.excludedCollections).toContain("mfaChallenges");
    expect(backup.scope.excludedCollections).toContain("emailDeliveries");
    expect(backup.scope.excludedCollections).toContain("passwordResetTokens");
    expect(backup.scope.excludedCollections).toContain("apiRateLimits");
    expect(backup.scope.excludedCollections).toContain("collaborationEvents");
    expect(backup.manifest.payloadSha256).toHaveLength(64);
    expect(backup.manifest.recordCounts.projects).toBeGreaterThan(0);
    expect(backup.manifest.recordCounts.notifications).toBe(backup.payload.notifications.length);
    expect(backup.payload.notifications.length).toBeGreaterThan(0);
    expect(backup.payload.projects.map((savedProject: { id: string }) => savedProject.id)).toContain(project.id);
    expect("passwordHash" in backup.payload.users[0]).toBe(false);
    const backupVerification = enterprise.verifyEnterpriseBackup(registered.context, backup);
    expect(backupVerification.schemaVersion).toBe("sena-enterprise-backup-verification/v1");
    expect(backupVerification.checks.find((check: { id: string }) => check.id === "backup-checksum")?.status).toBe("pass");
    expect(backupVerification.checks.find((check: { id: string }) => check.id === "backup-secret-exclusions")?.status).toBe("pass");
    expect(backupVerification.checks.find((check: { id: string }) => check.id === "backup-id-collision-preflight")?.status).toBe("review");
    const backupWebhookRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      backupWebhookRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const backupDelivery = await enterprise.deliverEnterpriseBackup(registered.context, { backup });
      expect(backupDelivery.schemaVersion).toBe("sena-enterprise-backup-delivery/v1");
      expect(backupDelivery.status).toBe("delivered");
      expect(backupDelivery.provider.mode).toBe("webhook");
      expect(backupDelivery.provider.endpointHash).toHaveLength(64);
      expect(backupDelivery.provider.secretConfigured).toBe(true);
      expect(backupDelivery.backup.backupId).toBe(backup.backupId);
      expect(backupDelivery.backup.payloadSha256).toBe(backup.manifest.payloadSha256);
      expect(backupDelivery.delivery.webhookStatus).toBe("delivered");
      expect(backupDelivery.delivery.httpStatus).toBe(202);
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(backupWebhookRequests).toHaveLength(1);
    expect(backupWebhookRequests[0].url).toBe("https://backup.example.test/sena");
    expect(backupWebhookRequests[0].headers["x-sena-webhook-event"]).toBe("backup.deliver");
    expect(backupWebhookRequests[0].headers["x-sena-backup-id"]).toBe(backup.backupId);
    expect(backupWebhookRequests[0].headers["x-sena-backup-payload-sha256"]).toBe(backup.manifest.payloadSha256);
    const backupWebhookSignature = backupWebhookRequests[0].headers["x-sena-webhook-signature"];
    const backupWebhookTimestamp = backupWebhookRequests[0].headers["x-sena-webhook-timestamp"];
    expect(backupWebhookSignature).toBe(`sha256=${createHmac("sha256", "sena-backup-webhook-secret").update(`${backupWebhookTimestamp}.${backupWebhookRequests[0].body}`).digest("hex")}`);
    const backupWebhookPayload = JSON.parse(backupWebhookRequests[0].body) as {
      schemaVersion: string;
      backup: {
        backupId: string;
        scope: { excludedCollections: string[] };
        manifest: { payloadSha256: string; retentionPolicy: { passwordHashesExcluded: boolean; emailDeliveriesExcluded: boolean; collaborationPubSubExcluded: boolean; uploadBlobsExcluded: boolean } };
        payload: { users: Array<Record<string, unknown>> };
      };
      verification: { payloadSha256: string; checks: Array<{ id: string; status: string }> };
      delivery: { endpointHash: string; secretConfigured: boolean };
    };
    expect(backupWebhookPayload.schemaVersion).toBe("sena-enterprise-backup-webhook/v1");
    expect(backupWebhookPayload.backup.backupId).toBe(backup.backupId);
    expect(backupWebhookPayload.backup.manifest.payloadSha256).toBe(backup.manifest.payloadSha256);
    expect(backupWebhookPayload.verification.payloadSha256).toBe(backup.manifest.payloadSha256);
    expect(backupWebhookPayload.backup.scope.excludedCollections).toContain("emailDeliveries");
    expect(backupWebhookPayload.backup.scope.excludedCollections).toContain("collaborationEvents");
    expect(backupWebhookPayload.backup.manifest.retentionPolicy.passwordHashesExcluded).toBe(true);
    expect(backupWebhookPayload.backup.manifest.retentionPolicy.emailDeliveriesExcluded).toBe(true);
    expect(backupWebhookPayload.backup.manifest.retentionPolicy.collaborationPubSubExcluded).toBe(true);
    expect(backupWebhookPayload.backup.manifest.retentionPolicy.uploadBlobsExcluded).toBe(true);
    expect(backupWebhookPayload.backup.payload.users.every((user) => !("passwordHash" in user))).toBe(true);
    expect(backupWebhookPayload.verification.checks.find((check) => check.id === "backup-secret-exclusions")?.status).toBe("pass");
    expect(backupWebhookPayload.delivery.endpointHash).toHaveLength(64);
    expect(backupWebhookPayload.delivery.secretConfigured).toBe(true);
    const databaseSyncRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      databaseSyncRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const databaseSync = await enterprise.deliverEnterpriseDatabaseSync(registered.context, { backup });
      expect(databaseSync.schemaVersion).toBe("sena-enterprise-database-sync/v1");
      expect(databaseSync.status).toBe("delivered");
      expect(databaseSync.provider.mode).toBe("webhook");
      expect(databaseSync.provider.endpointHash).toHaveLength(64);
      expect(databaseSync.provider.secretConfigured).toBe(true);
      expect(databaseSync.backup.backupId).toBe(backup.backupId);
      expect(databaseSync.backup.payloadSha256).toBe(backup.manifest.payloadSha256);
      expect(databaseSync.sync.webhookStatus).toBe("delivered");
      expect(databaseSync.sync.httpStatus).toBe(202);
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(databaseSyncRequests).toHaveLength(1);
    expect(databaseSyncRequests[0].url).toBe("https://database.example.test/sena/sync");
    expect(databaseSyncRequests[0].headers["x-sena-webhook-event"]).toBe("database.sync");
    expect(databaseSyncRequests[0].headers["x-sena-database-sync-backup-id"]).toBe(backup.backupId);
    expect(databaseSyncRequests[0].headers["x-sena-database-sync-payload-sha256"]).toBe(backup.manifest.payloadSha256);
    const databaseSyncTimestamp = databaseSyncRequests[0].headers["x-sena-webhook-timestamp"];
    expect(databaseSyncRequests[0].headers["x-sena-webhook-signature"]).toBe(`sha256=${createHmac("sha256", "sena-database-sync-secret").update(`${databaseSyncTimestamp}.${databaseSyncRequests[0].body}`).digest("hex")}`);
    const databaseSyncPayload = JSON.parse(databaseSyncRequests[0].body) as {
      schemaVersion: string;
      sync: { kind: string; sourceStorageEngine: string; backupId: string; payloadSha256: string; recordCounts: { projects: number } };
      backup: { backupId: string; manifest: { payloadSha256: string; retentionPolicy: { passwordHashesExcluded: boolean; collaborationPubSubExcluded: boolean } }; payload: { users: Array<Record<string, unknown>> } };
      verification: { payloadSha256: string; checks: Array<{ id: string; status: string }> };
      delivery: { endpointHash: string; secretConfigured: boolean };
    };
    expect(databaseSyncPayload.schemaVersion).toBe("sena-enterprise-database-sync-webhook/v1");
    expect(databaseSyncPayload.sync.kind).toBe("sanitized-enterprise-state");
    expect(databaseSyncPayload.sync.sourceStorageEngine).toBe("file-backed-json");
    expect(databaseSyncPayload.sync.backupId).toBe(backup.backupId);
    expect(databaseSyncPayload.sync.payloadSha256).toBe(backup.manifest.payloadSha256);
    expect(databaseSyncPayload.backup.manifest.payloadSha256).toBe(backup.manifest.payloadSha256);
    expect(databaseSyncPayload.backup.manifest.retentionPolicy.passwordHashesExcluded).toBe(true);
    expect(databaseSyncPayload.backup.manifest.retentionPolicy.collaborationPubSubExcluded).toBe(true);
    expect(databaseSyncPayload.backup.payload.users.every((user) => !("passwordHash" in user))).toBe(true);
    expect(databaseSyncPayload.verification.checks.find((check) => check.id === "backup-secret-exclusions")?.status).toBe("pass");
    expect(databaseSyncPayload.delivery.endpointHash).toHaveLength(64);
    expect(databaseSyncPayload.delivery.secretConfigured).toBe(true);
    const restoreDryRun = enterprise.restoreEnterpriseBackup(registered.context, backup, { dryRun: true });
    expect(restoreDryRun.schemaVersion).toBe("sena-enterprise-backup-restore/v1");
    expect(restoreDryRun.status).toBe("dry-run");
    expect(restoreDryRun.summary.projectsUpdated).toBeGreaterThan(0);
    enterprise.updateEnterpriseProject(registered.context, project.id, {
      snapshot: sampleSnapshot(),
      description: "Temporary project drift before restore."
    });
    expect(enterprise.getEnterpriseProject(registered.context, project.id).description).toBe("Temporary project drift before restore.");
    const restore = enterprise.restoreEnterpriseBackup(registered.context, backup, { mode: "merge" });
    expect(restore.status).toBe("completed");
    expect(restore.summary.projectsUpdated).toBeGreaterThan(0);
    expect(enterprise.getEnterpriseProject(registered.context, project.id).description).toBe(updatedProject.description);
    const restoreAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId: registered.context.teams[0].id,
      event: "governance.backup.restore",
      limit: 5
    });
    expect(restoreAudit.events).toHaveLength(1);
    const backupGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(backupGovernance.checks.map((check: { id: string }) => check.id)).toContain("backup-restore-rehearsal");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "backup-restore-rehearsal")?.evidence)
      .toContain("restoreEvents=1");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "backup-restore-rehearsal")?.evidence)
      .toContain("deliveryApi=POST:/api/sena/governance/backup action=deliver");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "backup-restore-rehearsal")?.evidence)
      .toContain("webhookProvider=webhook");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "backup-restore-rehearsal")?.evidence)
      .toContain("deliverEvents=1");
    expect(backupGovernance.checks.map((check: { id: string }) => check.id)).toContain("database-sync-bridge");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "database-sync-bridge")?.evidence)
      .toContain("webhookProvider=webhook");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "database-sync-bridge")?.evidence)
      .toContain("webhookSchema=sena-enterprise-database-sync-webhook/v1");
    expect(backupGovernance.checks.find((check: { id: string }) => check.id === "database-sync-bridge")?.evidence)
      .toContain("deliverEvents=1");
    const opsStatus = enterprise.getEnterpriseOpsStatus();
    expect(opsStatus.schemaVersion).toBe("sena-enterprise-ops-status/v1");
    expect(opsStatus.status).toBe("ready");
    expect(opsStatus.deployment.opsTokenConfigured).toBe(true);
    expect(opsStatus.deployment.collaborationPubSubWebhookConfigured).toBe(true);
    expect(opsStatus.deployment.databaseSyncWebhookConfigured).toBe(true);
    expect(opsStatus.deployment.objectStorageWebhookConfigured).toBe(true);
    expect(opsStatus.deployment.backupWebhookConfigured).toBe(true);
    expect(opsStatus.deployment.alertWebhookConfigured).toBe(true);
    expect(opsStatus.storage.writable).toBe(true);
    expect(opsStatus.storage.lockProbe).toBe("pass");
    expect(opsStatus.storage.dbBackupExists).toBe(true);
    expect(opsStatus.storage.dbBackupBytes).toBeGreaterThan(0);
    expect(opsStatus.backup.status).toBe("fresh");
    expect(opsStatus.counts.projects).toBeGreaterThan(0);
    expect(opsStatus.counts.collaborationEvents).toBeGreaterThanOrEqual(4);
    expect(opsStatus.counts.provisionedUsers).toBe(5);
    const opsMetrics = enterprise.buildEnterpriseOpsMetrics(opsStatus);
    expect(opsMetrics).toContain("sena_enterprise_ready");
    expect(opsMetrics).toContain("sena_enterprise_storage_lock_healthy");
    expect(opsMetrics).toContain("sena_enterprise_write_backup_exists");
    expect(opsMetrics).toContain("sena_enterprise_collaboration_pubsub_webhook_configured");
    expect(opsMetrics).toContain("sena_enterprise_database_sync_webhook_configured");
    expect(opsMetrics).toContain("sena_enterprise_object_storage_webhook_configured");
    expect(opsMetrics).toContain("sena_enterprise_backup_webhook_configured");
    expect(opsMetrics).toContain("sena_enterprise_alert_webhook_configured");
    expect(opsMetrics).toContain('collection="projects"');
    expect(opsMetrics).toContain('queue="notificationsPendingWebhook"');
    expect(opsMetrics).toContain('queue="emailPendingWebhook"');
    expect(opsMetrics).toContain('queue="collaborationPubSubPending"');
    expect(opsMetrics).toContain('queue="auditPendingWebhook"');
    const opsGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(opsGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("statusApi=/api/sena/ops/status");
    expect(opsGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("opsToken=configured");
    expect(opsGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("alertsApi=/api/sena/ops/alerts");
    expect(opsGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("alertingOwner=configured");
    expect(opsGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("alertWebhookProvider=webhook");
    expect(opsGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("alertWebhookSecret=configured");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-storage-lock")?.evidence)
      .toContain("lockProbe=pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-write-before-backup")?.evidence)
      .toContain("backupExists=true");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-upload-storage-integrity")?.evidence)
      .toContain("missing=0");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-database-sync-webhook")?.status).toBe("pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-object-storage-webhook")?.status).toBe("pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-collaboration-pubsub")?.status).toBe("pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-email-webhook-queue")?.status).toBe("pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-backup-webhook")?.status).toBe("pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-alert-webhook")?.status).toBe("pass");
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-audit-webhook-queue")?.status).toBe("pass");
    const deploymentReadiness = enterprise.getEnterpriseDeploymentReadiness();
    expect(deploymentReadiness.schemaVersion).toBe("sena-enterprise-deployment-readiness/v1");
    expect(deploymentReadiness.status).toBe("review");
    expect(deploymentReadiness.summary.blockingReview).toBe(0);
    expect(deploymentReadiness.summary.advisoryReview).toBeGreaterThan(0);
    expect(deploymentReadiness.environment.collaborationPubSubWebhookConfigured).toBe(true);
    expect(deploymentReadiness.environment.databaseSyncWebhookConfigured).toBe(true);
    expect(deploymentReadiness.environment.objectStorageWebhookConfigured).toBe(true);
    expect(deploymentReadiness.environment.backupWebhookConfigured).toBe(true);
    expect(deploymentReadiness.environment.alertWebhookConfigured).toBe(true);
    expect(deploymentReadiness.blocking.map((item: { id: string }) => item.id)).toContain("oidc-provider");
    expect(deploymentReadiness.blocking.map((item: { id: string }) => item.id)).toContain("write-before-backup");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "oidc-provider")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "oidc-provider")?.evidence)
      .toContain("preflightPassedProviders=google");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "object-storage-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "database-sync-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "database-sync-webhook")?.evidence)
      .toContain("webhookSchema=sena-enterprise-database-sync-webhook/v1");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "collaboration-pubsub")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "collaboration-pubsub")?.evidence)
      .toContain("webhookSchema=sena-enterprise-collaboration-pubsub-webhook/v1");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "backup-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "alert-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "alert-webhook")?.evidence)
      .toContain("webhookSchema=sena-enterprise-ops-alert-webhook/v1");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "notification-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "email-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.blocking.find((item: { id: string }) => item.id === "audit-webhook")?.status).toBe("pass");
    expect(deploymentReadiness.advisory.map((item: { id: string }) => item.id)).toContain("managed-database-decision");
    expect(deploymentReadiness.advisory.find((item: { id: string }) => item.id === "managed-database-decision")?.status).toBe("pass");
    expect(deploymentReadiness.advisory.find((item: { id: string }) => item.id === "managed-database-decision")?.evidence)
      .toContain("bridge=sena-enterprise-database-sync-webhook/v1");
    expect(deploymentReadiness.advisory.find((item: { id: string }) => item.id === "object-storage-decision")?.status).toBe("pass");
    expect(deploymentReadiness.advisory.find((item: { id: string }) => item.id === "object-storage-decision")?.evidence)
      .toContain("missing=0");
    expect(deploymentReadiness.runbook.verificationCommands).toContain("npm run sena:pilot:verify");
    const readinessRunbook = deploymentReadiness.runbook as typeof deploymentReadiness.runbook & {
      platformDecisionRegister?: string;
    };
    expect(readinessRunbook.platformDecisionRegister).toBe("sena-enterprise-platform-decision-register/v1");
    const organizationDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
    expect(organizationDeployment.schemaVersion).toBe("sena-enterprise-organization-deployment/v1");
    expect(organizationDeployment.status).toBe("review");
    expect(organizationDeployment.redaction.secretValuesExcluded).toBe(true);
    expect(organizationDeployment.redaction.endpointValuesHashed).toBe(true);
    expect(organizationDeployment.baseUrl.origin).toBe("https://sena.example.test");
    expect(organizationDeployment.access.api).toBe("/api/sena/ops/deployment");
    expect(organizationDeployment.summary.missingRequiredEnv).toEqual([]);
    expect(organizationDeployment.summary.identityProductionStatus).toBe("review");
    expect(organizationDeployment.summary.identitySubmissionVerifierIncomplete).toEqual(expect.any(Number));
    expect(organizationDeployment.summary.identityRotationFreshness).toBe("review");
    expect(organizationDeployment.summary.configuredWebhookBridges).toBe(8);
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/deployment");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/native-adapters");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/saas-operations");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/identity-production-evidence");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/go-live-rehearsal");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/platform-decisions");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/jobs/worker-contract");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/jobs/probe");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/postgres");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/observability");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/observability/probe");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/ops/production-evidence");
    expect(organizationDeployment.serviceEndpoints.map((endpoint: { path: string }) => endpoint.path)).toContain("/api/sena/provisioning");
    expect(organizationDeployment.env.find((entry: { name: string }) => entry.name === "SENA_ALERT_WEBHOOK_SECRET")?.secret).toBe(true);
    expect(organizationDeployment.env.find((entry: { name: string }) => entry.name === "SENA_ALERT_WEBHOOK_SECRET")?.configured).toBe(true);
    expect(organizationDeployment.env.find((entry: { name: string }) => entry.name === "SENA_ALERT_WEBHOOK_URL")?.endpointHash).toHaveLength(64);
    expect(organizationDeployment.env.find((entry: { name: string }) => entry.name === "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")?.configured).toBe(false);
    expect(organizationDeployment.platformDecisions.find((decision: { id: string }) => decision.id === "native-managed-database")?.status).toBe("bridge-ready");
    expect(organizationDeployment.platformDecisions.find((decision: { id: string }) => decision.id === "institution-idp-approval")?.status).toBe("ready");
    expect(organizationDeployment.platformDecisions.map((decision: { id: string }) => decision.id)).toContain("full-saas-backend-operations");
    const organizationDeploymentWithRegister = organizationDeployment as typeof organizationDeployment & {
      platformDecisionRegister?: {
        schemaVersion: string;
        summary: {
          decisions: number;
          ready: number;
          bridgeReady: number;
          open: number;
          productionBlocking: number;
          acceptedBridge: number;
        };
        decisions: Array<{
          id: string;
          status: string;
          productionBlocking: boolean;
          acceptedBridge: boolean;
          acceptanceCriteria: string[];
          ownerEvidence: string[];
        }>;
        nextActions: string[];
      };
    };
    const platformDecisionRegister = organizationDeploymentWithRegister.platformDecisionRegister;
    expect(platformDecisionRegister?.schemaVersion).toBe("sena-enterprise-platform-decision-register/v1");
    expect(platformDecisionRegister?.summary.decisions).toBe(organizationDeployment.platformDecisions.length);
    expect(platformDecisionRegister?.summary.bridgeReady).toBeGreaterThan(0);
    expect(platformDecisionRegister?.summary.open).toBeGreaterThan(0);
    expect(platformDecisionRegister?.summary.productionBlocking).toBeGreaterThan(0);
    expect(platformDecisionRegister?.summary.acceptedBridge).toBe(0);
    expect(platformDecisionRegister?.decisions.map((decision) => decision.id)).toContain("full-saas-backend-operations");
    expect(platformDecisionRegister?.decisions.map((decision) => decision.id)).toEqual(expect.arrayContaining([
      "native-audit-siem-adapter",
      "native-managed-backup-storage"
    ]));
    expect(platformDecisionRegister?.decisions.find((decision) => decision.id === "native-managed-database")?.acceptedBridge).toBe(false);
    expect(platformDecisionRegister?.decisions.find((decision) => decision.id === "native-audit-siem-adapter")?.acceptanceCriteria)
      .toContain("Institution platform owner accepts the signed audit/SIEM bridge for production or replaces it with a native audit retention adapter.");
    expect(platformDecisionRegister?.decisions.find((decision) => decision.id === "native-managed-backup-storage")?.acceptanceCriteria)
      .toContain("Institution platform owner accepts the signed backup bridge for production or replaces it with a native managed backup and restore adapter.");
    expect(platformDecisionRegister?.decisions.find((decision) => decision.id === "full-saas-backend-operations")?.productionBlocking).toBe(true);
    expect(platformDecisionRegister?.decisions.find((decision) => decision.id === "full-saas-backend-operations")?.acceptanceCriteria)
      .toContain("Managed database, object storage, pub/sub, email, alerting, audit, backup, and IdP ownership are approved for multi-instance SaaS operation.");
    expect(platformDecisionRegister?.nextActions.length).toBeGreaterThan(0);
    const organizationDeploymentWithIdentityEvidence = organizationDeployment as typeof organizationDeployment & {
      identityProductionEvidence?: {
        schemaVersion: "sena-enterprise-identity-production-evidence/v1";
        status: "ready" | "review";
        releaseGateBlocked: boolean;
        submissionVerifier: {
          incompleteDecisions: number;
          missingProductionEvidence: number;
          missingTechnicalPrerequisites: number;
        };
      };
    };
    expect(organizationDeploymentWithIdentityEvidence.identityProductionEvidence).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-identity-production-evidence/v1",
      status: "review",
      releaseGateBlocked: true,
      submissionVerifier: expect.objectContaining({
        incompleteDecisions: expect.any(Number),
        missingProductionEvidence: expect.any(Number),
        missingTechnicalPrerequisites: expect.any(Number)
      })
    }));
    const deploymentNativeAdapterCertification = organizationDeployment as typeof organizationDeployment & {
      nativeAdapterCertification?: {
        schemaVersion: "sena-enterprise-native-adapter-certification/v1";
        summary: {
          adapters: number;
          bridgeReady: number;
          acceptedBridge: number;
          nativeRequired: number;
          productionBlocking: number;
        };
        export: {
          api: "/api/sena/ops/native-adapters";
          filename: "sena-enterprise-native-adapter-certification.json";
        };
        adapters: Array<{
          id: string;
          decisionId: string;
          category: string;
          status: string;
          currentAdapter: string;
          targetAdapter: string;
          bridgeSchema: string;
          acceptedBridge: boolean;
          productionBlocking: boolean;
          certificationEvidence: string[];
          ownerEvidence: string[];
        }>;
      };
    };
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.schemaVersion).toBe("sena-enterprise-native-adapter-certification/v1");
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.export.api).toBe("/api/sena/ops/native-adapters");
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.export.filename).toBe("sena-enterprise-native-adapter-certification.json");
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.summary.adapters).toBeGreaterThanOrEqual(8);
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.summary.bridgeReady).toBeGreaterThan(0);
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.summary.acceptedBridge).toBe(0);
    const databaseAdapterCertification = deploymentNativeAdapterCertification.nativeAdapterCertification?.adapters
      .find((adapter) => adapter.id === "managed-database-adapter");
    expect(databaseAdapterCertification).toEqual(expect.objectContaining({
      decisionId: "native-managed-database",
      status: "bridge-ready",
      currentAdapter: "file-backed-json",
      targetAdapter: "managed-database",
      bridgeSchema: "sena-enterprise-database-sync-webhook/v1",
      acceptedBridge: false,
      productionBlocking: true
    }));
    expect(databaseAdapterCertification?.certificationEvidence).toEqual(expect.arrayContaining([
      "platformDecision=native-managed-database",
      "bridge=sena-enterprise-database-sync-webhook/v1",
      "endpointHash=present"
    ]));
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.adapters.find((adapter) => adapter.id === "institution-audit-siem-adapter")).toEqual(expect.objectContaining({
      decisionId: "native-audit-siem-adapter",
      category: "operations",
      status: "bridge-ready",
      currentAdapter: "append-only-file-audit-log-plus-signed-webhook",
      targetAdapter: "institution-siem-audit-retention",
      bridgeSchema: "sena-enterprise-audit-webhook/v1",
      productionBlocking: true,
      certificationEvidence: expect.arrayContaining([
        "platformDecision=native-audit-siem-adapter",
        "bridge=sena-enterprise-audit-webhook/v1",
        "endpointHash=present"
      ])
    }));
    expect(deploymentNativeAdapterCertification.nativeAdapterCertification?.adapters.find((adapter) => adapter.id === "managed-backup-storage-adapter")).toEqual(expect.objectContaining({
      decisionId: "native-managed-backup-storage",
      category: "storage",
      status: "bridge-ready",
      currentAdapter: "team-scoped-file-backup-plus-signed-webhook",
      targetAdapter: "managed-backup-storage-and-restore",
      bridgeSchema: "sena-enterprise-backup-webhook/v1",
      productionBlocking: true,
      certificationEvidence: expect.arrayContaining([
        "platformDecision=native-managed-backup-storage",
        "bridge=sena-enterprise-backup-webhook/v1",
        "endpointHash=present"
      ])
    }));
    const deploymentSaasOperations = organizationDeployment as typeof organizationDeployment & {
      saasOperationsReadiness?: {
        schemaVersion: "sena-enterprise-saas-operations-readiness/v1";
        status: "ready" | "review" | "blocked";
        export: {
          api: "/api/sena/ops/saas-operations";
          filename: "sena-enterprise-saas-operations-readiness.json";
        };
        approval: {
          envConfigured: boolean;
          fullSaasDecisionAccepted: boolean;
          latestReleaseGateStatus?: string;
        };
        summary: {
          platformDecisions: number;
          acceptedPlatformDecisions: number;
          nativeAdapterProductionBlocking: number;
          releaseGateReviews: number;
          identityProductionStatus: "ready" | "review" | "missing";
          identitySubmissionVerifierIncomplete: number | "missing";
          identityRotationFreshness: "ready" | "review" | "missing";
          blockers: string[];
        };
        requiredEvidence: string[];
      };
    };
    expect(deploymentSaasOperations.saasOperationsReadiness?.schemaVersion).toBe("sena-enterprise-saas-operations-readiness/v1");
    expect(deploymentSaasOperations.saasOperationsReadiness?.export.api).toBe("/api/sena/ops/saas-operations");
    expect(deploymentSaasOperations.saasOperationsReadiness?.export.filename).toBe("sena-enterprise-saas-operations-readiness.json");
    expect(deploymentSaasOperations.saasOperationsReadiness?.status).toBe("blocked");
    expect(deploymentSaasOperations.saasOperationsReadiness?.approval.envConfigured).toBe(false);
    expect(deploymentSaasOperations.saasOperationsReadiness?.approval.fullSaasDecisionAccepted).toBe(false);
    expect(deploymentSaasOperations.saasOperationsReadiness?.summary.nativeAdapterProductionBlocking).toBeGreaterThan(0);
    expect(deploymentSaasOperations.saasOperationsReadiness?.summary.identityProductionStatus).toBe("missing");
    expect(deploymentSaasOperations.saasOperationsReadiness?.summary.identitySubmissionVerifierIncomplete).toBe("missing");
    expect(deploymentSaasOperations.saasOperationsReadiness?.summary.identityRotationFreshness).toBe("missing");
    expect(deploymentSaasOperations.saasOperationsReadiness?.summary.blockers).toEqual(expect.arrayContaining([
      "saas-operating-model-approval-env-required",
      "full-saas-platform-decision-acceptance-required",
      "native-adapter-certification-production-blockers"
    ]));
    expect(deploymentSaasOperations.saasOperationsReadiness?.requiredEvidence).toEqual(expect.arrayContaining([
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-platform-decision-acceptance/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-production-evidence-manifest/v1"
    ]));
    expect((organizationDeployment as typeof organizationDeployment & {
      productionEvidenceManifest?: {
        schemaVersion: string;
        export: { api: string };
      };
    }).productionEvidenceManifest).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-production-evidence-manifest/v1",
      export: expect.objectContaining({
        api: "/api/sena/ops/production-evidence"
      })
    }));
    const goLiveRehearsal = (enterprise as typeof enterprise & {
      getEnterpriseGoLiveRehearsal: () => {
        schemaVersion: "sena-enterprise-go-live-rehearsal/v1";
        status: "ready" | "review" | "blocked";
        export: {
          api: "/api/sena/ops/go-live-rehearsal";
          filename: "sena-enterprise-go-live-rehearsal.json";
        };
        rehearsal: {
          deploymentReadiness: string;
          nativeAdapterCertification: string;
          saasOperationsReadiness: string;
          releaseGate: string;
        };
        summary: {
          blockingItems: number;
          advisoryItems: number;
          nativeAdapterProductionBlocking: number;
          saasOperationsStatus: string;
          releaseGateReviews: number;
          blockers: string[];
        };
        releaseGateDraft: {
          schemaVersion: "sena-enterprise-release-gate-draft/v1";
          decision: "approved" | "conditional" | "blocked";
          environment: string;
          releaseVersion: string;
          verificationCommand: string;
          verificationEvidence: {
            status: "passed" | "failed" | "not-run";
            summary: string;
          };
          notes: string;
          requiredBeforeSubmit: string[];
          evidence: string[];
        };
        rollbackDrill: {
          schemaVersion: "sena-enterprise-go-live-rollback-drill/v1";
          status: "ready" | "review" | "blocked";
          summary: {
            blockers: string[];
          };
          requiredEvidence: string[];
          runbook: {
            ownerEvidence: string[];
            steps: Array<{ command?: string; evidence: string[] }>;
          };
          evidence: string[];
        };
        postCutoverMonitor: {
          schemaVersion: "sena-enterprise-go-live-monitor/v1";
          status: "ready" | "watch" | "blocked";
          summary: {
            criticalAlerts: number;
            warningAlerts: number;
            blockers: string[];
          };
          observationWindow: {
            recommendedMinutes: number;
            exitCriteria: string[];
          };
          requiredEvidence: string[];
          checks: Array<{ id: string; status: "pass" | "watch" | "blocked"; evidence: string[] }>;
          evidence: string[];
        };
        requiredEvidence: string[];
        verificationCommands: string[];
        evidence: string[];
      };
    }).getEnterpriseGoLiveRehearsal();
    expect(goLiveRehearsal.schemaVersion).toBe("sena-enterprise-go-live-rehearsal/v1");
    expect(goLiveRehearsal.export.api).toBe("/api/sena/ops/go-live-rehearsal");
    expect(goLiveRehearsal.export.filename).toBe("sena-enterprise-go-live-rehearsal.json");
    expect(goLiveRehearsal.status).toBe("blocked");
    expect(goLiveRehearsal.rehearsal.deploymentReadiness).toBe("sena-enterprise-deployment-readiness/v1");
    expect(goLiveRehearsal.rehearsal.nativeAdapterCertification).toBe("sena-enterprise-native-adapter-certification/v1");
    expect(goLiveRehearsal.rehearsal.saasOperationsReadiness).toBe("sena-enterprise-saas-operations-readiness/v1");
    expect(goLiveRehearsal.rehearsal.releaseGate).toBe("sena-enterprise-release-gate-reviews/v1");
    expect(goLiveRehearsal.summary.nativeAdapterProductionBlocking).toBeGreaterThan(0);
    expect(goLiveRehearsal.summary.blockingItems).toBe(deploymentReadiness.summary.blockingReview);
    expect(goLiveRehearsal.summary.blockers).toEqual(expect.arrayContaining([
      "saas-operations-not-ready",
      "native-adapter-certification-production-blockers",
      "approved-release-gate-required",
      "release-gate-verification-passed-required"
    ]));
    expect(goLiveRehearsal.releaseGateDraft.schemaVersion).toBe("sena-enterprise-release-gate-draft/v1");
    expect(goLiveRehearsal.releaseGateDraft.decision).toBe("blocked");
    expect(goLiveRehearsal.releaseGateDraft.environment).toBe("pilot-production");
    expect(goLiveRehearsal.releaseGateDraft.releaseVersion).toContain("go-live-rehearsal");
    expect(goLiveRehearsal.releaseGateDraft.verificationCommand).toBe("npm run sena:pilot:verify");
    expect(goLiveRehearsal.releaseGateDraft.verificationEvidence.status).toBe("not-run");
    expect(goLiveRehearsal.releaseGateDraft.verificationEvidence.summary).toContain("Generated from sena-enterprise-go-live-rehearsal/v1");
    expect(goLiveRehearsal.releaseGateDraft.notes).toContain("saas-operations-not-ready");
    expect(goLiveRehearsal.releaseGateDraft.requiredBeforeSubmit).toEqual(expect.arrayContaining([
      "Run npm run sena:pilot:verify and paste the real verification summary before approving production release.",
      "Resolve go-live rehearsal blockers before changing the draft decision to approved."
    ]));
    expect(goLiveRehearsal.releaseGateDraft.evidence).toEqual(expect.arrayContaining([
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "releaseGateReview=sena-enterprise-release-gate-review/v1"
    ]));
    expect(goLiveRehearsal.rollbackDrill.schemaVersion).toBe("sena-enterprise-go-live-rollback-drill/v1");
    expect(goLiveRehearsal.rollbackDrill.status).toBe("blocked");
    expect(goLiveRehearsal.rollbackDrill.summary.blockers).toEqual(expect.arrayContaining([
      "approved-release-gate-required",
      "release-gate-verification-passed-required"
    ]));
    expect(goLiveRehearsal.rollbackDrill.requiredEvidence).toEqual(expect.arrayContaining([
      "sena-enterprise-backup/v1",
      "sena-enterprise-backup-restore/v1",
      "sena-enterprise-ops-alerts/v1",
      "sena-enterprise-release-gate-review/v1",
      "npm run sena:pilot:verify"
    ]));
    expect(goLiveRehearsal.rollbackDrill.runbook.steps.map((step) => step.command).filter(Boolean)).toContain("npm run sena:pilot:verify");
    expect(goLiveRehearsal.rollbackDrill.evidence).toEqual(expect.arrayContaining([
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "rollbackDrill=sena-enterprise-go-live-rollback-drill/v1"
    ]));
    expect(goLiveRehearsal.postCutoverMonitor.schemaVersion).toBe("sena-enterprise-go-live-monitor/v1");
    expect(goLiveRehearsal.postCutoverMonitor.status).toBe("blocked");
    expect(goLiveRehearsal.postCutoverMonitor.summary.criticalAlerts).toBeGreaterThanOrEqual(0);
    expect(goLiveRehearsal.postCutoverMonitor.summary.blockers).toEqual(expect.arrayContaining([
      "go-live-rehearsal-not-ready",
      "rollback-drill-not-ready"
    ]));
    expect(goLiveRehearsal.postCutoverMonitor.observationWindow.recommendedMinutes).toBe(60);
    expect(goLiveRehearsal.postCutoverMonitor.observationWindow.exitCriteria).toEqual(expect.arrayContaining([
      "No critical ops alerts firing during the observation window.",
      "The full SENA pilot verifier has passed and is attached to the release gate."
    ]));
    expect(goLiveRehearsal.postCutoverMonitor.requiredEvidence).toEqual(expect.arrayContaining([
      "sena-enterprise-ops-status/v1",
      "sena-enterprise-ops-alerts/v1",
      "sena-enterprise-go-live-rollback-drill/v1",
      "sena-enterprise-release-gate-review/v1",
      "npm run sena:pilot:verify"
    ]));
    expect(goLiveRehearsal.postCutoverMonitor.checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      "ops-status",
      "critical-alerts",
      "rollback-drill",
      "release-verification"
    ]));
    expect(goLiveRehearsal.postCutoverMonitor.evidence).toEqual(expect.arrayContaining([
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "postCutoverMonitor=sena-enterprise-go-live-monitor/v1"
    ]));
    const capabilityAudit = (enterprise as typeof enterprise & {
      getEnterpriseCapabilityAudit: () => {
        schemaVersion: "sena-enterprise-capability-audit/v1";
        status: "ready" | "review" | "blocked";
        summary: {
          capabilities: number;
          ready: number;
          review: number;
          blocked: number;
          platformDecisionItems: number;
        };
        sourceObjective: {
          requestedCapabilityAreas: string[];
        };
        export: {
          api: "/api/sena/ops/capability-audit";
          filename: "sena-enterprise-capability-audit.json";
        };
        capabilities: Array<{
          id: string;
          status: "ready" | "review" | "blocked";
          objectiveArea: string;
          evidence: string[];
          endpoints: string[];
          requiredArtifacts: string[];
          productionContractTestIds: string[];
          remainingPlatformDecisions: string[];
        }>;
        nextActions: string[];
      };
    }).getEnterpriseCapabilityAudit();
    expect(capabilityAudit.schemaVersion).toBe("sena-enterprise-capability-audit/v1");
    expect(capabilityAudit.export.api).toBe("/api/sena/ops/capability-audit");
    expect(capabilityAudit.export.filename).toBe("sena-enterprise-capability-audit.json");
    expect(capabilityAudit.sourceObjective.requestedCapabilityAreas).toEqual(expect.arrayContaining([
      "真实登录/注册/SSO",
      "RBAC、团队空间、多用户协作",
      "服务端保存项目和数据库",
      "SENA 后端 API",
      "更广的数据导入适配",
      "正式多编码者可靠性流程",
      "研究验证和统计推断",
      "出版级导出",
      "生产部署、安全和治理"
    ]));
    expect(capabilityAudit.capabilities.map((capability) => capability.id)).toEqual(expect.arrayContaining([
      "auth-login-register-sso",
      "rbac-team-collaboration",
      "server-persistence-database",
      "sena-backend-apis",
      "data-import-adapters",
      "multicoder-reliability",
      "research-validation-inference",
      "publication-exports",
      "production-security-governance",
      "go-live-operations"
    ]));
    expect(capabilityAudit.summary.capabilities).toBe(capabilityAudit.capabilities.length);
    expect(capabilityAudit.summary.platformDecisionItems).toBeGreaterThan(0);
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso")?.endpoints)
      .toEqual(expect.arrayContaining(["/api/auth/login", "/api/auth/register", "/api/auth/sso", "/api/auth/sessions"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "server-persistence-database")?.remainingPlatformDecisions)
      .toEqual(expect.arrayContaining(["native-managed-database"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "production-security-governance")?.remainingPlatformDecisions)
      .toEqual(expect.arrayContaining(["deployment-alerting-escalation", "native-audit-siem-adapter", "native-managed-backup-storage"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "production-security-governance")?.endpoints)
      .toEqual(expect.arrayContaining(["/api/sena/ops/alerts"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "production-security-governance")?.requiredArtifacts)
      .toEqual(expect.arrayContaining(["sena-enterprise-ops-alerts/v1"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "production-security-governance")?.evidence)
      .toEqual(expect.arrayContaining(["alertingEscalation=sena-enterprise-ops-alert-webhook/v1"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "production-security-governance")?.productionContractTestIds)
      .toEqual(expect.arrayContaining(["enterprise-ops-alerts-export", "enterprise-ops-alert-delivery"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "sena-backend-apis")?.endpoints)
      .toEqual(expect.arrayContaining(["/api/sena/projects", "/api/sena/uploads", "/api/sena/analyze", "/api/sena/exports/publication"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "research-validation-inference")?.requiredArtifacts)
      .toEqual(expect.arrayContaining(["sena-formal-inference-readiness/v1"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "research-validation-inference")?.evidence)
      .toEqual(expect.arrayContaining(["formalInference=sena-formal-inference-readiness/v1"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "multicoder-reliability")?.evidence)
      .toEqual(expect.arrayContaining(["jsonRequest=sena-reliability-json-request/v1"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "publication-exports")?.evidence)
      .toEqual(expect.arrayContaining(["xlsxWorkbookEvidence=claim-readiness|coding-reliability|data-governance|matrix-fingerprints|evidence-snippets"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "publication-exports")?.evidence)
      .toEqual(expect.arrayContaining(["projectSource=projectId|snapshot"]));
    expect(capabilityAudit.capabilities.find((capability) => capability.id === "go-live-operations")?.requiredArtifacts)
      .toEqual(expect.arrayContaining([
        "sena-enterprise-go-live-rehearsal/v1",
        "sena-enterprise-go-live-rollback-drill/v1",
        "sena-enterprise-go-live-monitor/v1"
      ]));
    expect(capabilityAudit.nextActions).toEqual(expect.arrayContaining([
      "Resolve or formally accept remaining platform-decision items before institution-wide SaaS rollout."
    ]));
    const goLiveAttestationTools = enterprise as typeof enterprise & {
      createEnterpriseGoLiveAttestation: (
        context: typeof registered.context,
        input: {
          teamId: string;
          environment: string;
          releaseVersion: string;
          decision: "approved" | "conditional" | "blocked";
          attesterName: string;
          attesterRole: string;
          notes: string;
          checklist: {
            rehearsalReviewed: boolean;
            releaseGateDraftReviewed: boolean;
            verificationEvidenceReviewed: boolean;
            rollbackOwnerConfirmed: boolean;
            platformOwnerDecisionReviewed: boolean;
          };
        }
      ) => {
        schemaVersion: "sena-enterprise-go-live-attestation/v1";
        decision: "approved" | "conditional" | "blocked";
        status: "approved" | "conditional" | "blocked";
        teamId: string;
        goLiveRehearsalSnapshot: {
          schemaVersion: "sena-enterprise-go-live-rehearsal/v1";
          status: "ready" | "review" | "blocked";
          blockers: string[];
        };
        releaseGateDraftSnapshot: {
          schemaVersion: "sena-enterprise-release-gate-draft/v1";
          decision: "approved" | "conditional" | "blocked";
          verificationStatus: "passed" | "failed" | "not-run";
        };
        checklist: {
          schemaVersion: "sena-enterprise-go-live-checklist/v1";
          passed: boolean;
          missing: string[];
        };
        evidence: string[];
      };
      listEnterpriseGoLiveAttestations: (
        context: typeof registered.context,
        input: { teamId?: string }
      ) => {
        schemaVersion: "sena-enterprise-go-live-attestations/v1";
        summary: { total: number; approved: number; conditional: number; blocked: number };
        attestations: Array<{ schemaVersion: "sena-enterprise-go-live-attestation/v1"; decision: string }>;
      };
    };
    expect(() => goLiveAttestationTools.createEnterpriseGoLiveAttestation(registered.context, {
      teamId: registered.context.teams[0].id,
      environment: "pilot-production",
      releaseVersion: "2026.06.13-go-live",
      decision: "approved",
      attesterName: "Platform Owner",
      attesterRole: "Institution platform owner",
      notes: "Attempting to approve a blocked rehearsal should be rejected.",
      checklist: {
        rehearsalReviewed: true,
        releaseGateDraftReviewed: true,
        verificationEvidenceReviewed: true,
        rollbackOwnerConfirmed: true,
        platformOwnerDecisionReviewed: true
      }
    })).toThrow(/cannot be approved/i);
    const blockedGoLiveAttestation = goLiveAttestationTools.createEnterpriseGoLiveAttestation(registered.context, {
      teamId: registered.context.teams[0].id,
      environment: "pilot-production",
      releaseVersion: "2026.06.13-go-live",
      decision: "blocked",
      attesterName: "Platform Owner",
      attesterRole: "Institution platform owner",
      notes: "Go-live blocked until SaaS operations and native adapter blockers are resolved.",
      checklist: {
        rehearsalReviewed: true,
        releaseGateDraftReviewed: true,
        verificationEvidenceReviewed: true,
        rollbackOwnerConfirmed: true,
        platformOwnerDecisionReviewed: true
      }
    });
    expect(blockedGoLiveAttestation.schemaVersion).toBe("sena-enterprise-go-live-attestation/v1");
    expect(blockedGoLiveAttestation.decision).toBe("blocked");
    expect(blockedGoLiveAttestation.goLiveRehearsalSnapshot.schemaVersion).toBe("sena-enterprise-go-live-rehearsal/v1");
    expect(blockedGoLiveAttestation.goLiveRehearsalSnapshot.status).toBe("blocked");
    expect(blockedGoLiveAttestation.goLiveRehearsalSnapshot.blockers).toEqual(expect.arrayContaining(["saas-operations-not-ready"]));
    expect(blockedGoLiveAttestation.releaseGateDraftSnapshot.schemaVersion).toBe("sena-enterprise-release-gate-draft/v1");
    expect(blockedGoLiveAttestation.releaseGateDraftSnapshot.verificationStatus).toBe("not-run");
    expect(blockedGoLiveAttestation.checklist.schemaVersion).toBe("sena-enterprise-go-live-checklist/v1");
    expect(blockedGoLiveAttestation.checklist.passed).toBe(true);
    expect(blockedGoLiveAttestation.evidence).toEqual(expect.arrayContaining([
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "releaseGateDraft=sena-enterprise-release-gate-draft/v1",
      "checklist=sena-enterprise-go-live-checklist/v1",
      "latestReleaseGateIdentityRotationFreshness=missing"
    ]));
    const listedGoLiveAttestations = goLiveAttestationTools.listEnterpriseGoLiveAttestations(registered.context, { teamId: registered.context.teams[0].id });
    expect(listedGoLiveAttestations.schemaVersion).toBe("sena-enterprise-go-live-attestations/v1");
    expect(listedGoLiveAttestations.summary.blocked).toBeGreaterThanOrEqual(1);
    expect(listedGoLiveAttestations.attestations).toEqual(expect.arrayContaining([
      expect.objectContaining({ schemaVersion: "sena-enterprise-go-live-attestation/v1", decision: "blocked" })
    ]));
    expect(goLiveRehearsal.requiredEvidence).toEqual(expect.arrayContaining([
      "sena-enterprise-deployment-readiness/v1",
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-saas-operations-readiness/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-release-verification-evidence/v1"
    ]));
    expect(goLiveRehearsal.verificationCommands).toContain("npm run sena:pilot:verify");
    expect(goLiveRehearsal.evidence).toEqual(expect.arrayContaining([
      "redaction=secret-values-excluded",
      "deploymentPackage=sena-enterprise-organization-deployment/v1",
      "saasOperations=sena-enterprise-saas-operations-readiness/v1"
    ]));
    expect(organizationDeployment.governance.keyChecks.map((check: { id: string }) => check.id)).toContain("organization-deployment-package");
    expect(organizationDeployment.governance.keyChecks.find((check: { id: string }) => check.id === "organization-deployment-package")?.evidence)
      .toContain("platformDecisionRegister=sena-enterprise-platform-decision-register/v1");
    const platformDecisionTools = enterprise as typeof enterprise & {
      reviewEnterprisePlatformDecision: (
        context: typeof registered.context,
        input: {
          teamId: string;
          decisionId: string;
          status: "accepted" | "rejected" | "needs-native-adapter" | "superseded";
          acceptedBridge?: boolean;
          ownerName: string;
          ownerRole: string;
          environment: string;
          evidenceUrl?: string;
          notes: string;
        }
      ) => {
        schemaVersion: "sena-enterprise-platform-decision-acceptance/v1";
        decisionId: string;
        status: string;
        acceptedBridge: boolean;
        ownerName: string;
        ownerRole: string;
        environment: string;
      };
      listEnterprisePlatformDecisionAcceptances: (
        context: typeof registered.context,
        input?: { teamId?: string }
      ) => {
        schemaVersion: "sena-enterprise-platform-decision-acceptances/v1";
        acceptances: Array<{ decisionId: string; status: string; acceptedBridge: boolean }>;
      };
      createEnterpriseReleaseGateReview: (
        context: typeof registered.context,
        input: {
          teamId: string;
          environment: string;
          releaseVersion: string;
          decision: "approved" | "blocked" | "conditional";
          approverName: string;
          approverRole: string;
          notes: string;
          verificationCommand: string;
          verificationEvidence: {
            status: "passed" | "failed" | "not-run";
            summary: string;
            outputSha256: string;
          };
        }
      ) => {
        schemaVersion: "sena-enterprise-release-gate-review/v1";
        decision: string;
        status: "approved" | "blocked" | "conditional";
        verificationEvidence: {
          schemaVersion: "sena-enterprise-release-verification-evidence/v1";
          status: "passed" | "failed" | "not-run";
          summary: string;
          outputSha256: string;
          hashAlgorithm: "sha256";
        };
        readinessSnapshot: {
          schemaVersion: "sena-enterprise-deployment-readiness/v1";
          blockingReview: number;
          advisoryReview: number;
        };
        platformDecisionSnapshot: {
          schemaVersion: "sena-enterprise-platform-decision-register/v1";
          productionBlocking: number;
          acceptedBridge: number;
        };
      };
      listEnterpriseReleaseGateReviews: (
        context: typeof registered.context,
        input?: { teamId?: string }
      ) => {
        schemaVersion: "sena-enterprise-release-gate-reviews/v1";
        reviews: Array<{ schemaVersion: "sena-enterprise-release-gate-review/v1"; decision: string }>;
      };
    };
    expect(platformDecisionTools.reviewEnterprisePlatformDecision).toBeTypeOf("function");
    expect(platformDecisionTools.listEnterprisePlatformDecisionAcceptances).toBeTypeOf("function");
    expect(platformDecisionTools.createEnterpriseReleaseGateReview).toBeTypeOf("function");
    expect(platformDecisionTools.listEnterpriseReleaseGateReviews).toBeTypeOf("function");
    const platformAcceptance = platformDecisionTools.reviewEnterprisePlatformDecision(registered.context, {
      teamId: registered.context.teams[0].id,
      decisionId: "native-managed-database",
      status: "accepted",
      acceptedBridge: true,
      ownerName: "SENA platform owner",
      ownerRole: "Platform operations",
      environment: "pilot-production",
      evidenceUrl: "https://ops.example.test/sena/database-bridge-approval",
      notes: "Signed database-sync bridge accepted for pilot production."
    });
    expect(platformAcceptance.schemaVersion).toBe("sena-enterprise-platform-decision-acceptance/v1");
    expect(platformAcceptance.decisionId).toBe("native-managed-database");
    expect(platformAcceptance.status).toBe("accepted");
    expect(platformAcceptance.acceptedBridge).toBe(true);
    const listedPlatformAcceptances = platformDecisionTools.listEnterprisePlatformDecisionAcceptances(registered.context, {
      teamId: registered.context.teams[0].id
    });
    expect(listedPlatformAcceptances.schemaVersion).toBe("sena-enterprise-platform-decision-acceptances/v1");
    expect(listedPlatformAcceptances.acceptances).toEqual([
      expect.objectContaining({
        decisionId: "native-managed-database",
        status: "accepted",
        acceptedBridge: true
      })
    ]);
    const acceptedOrganizationDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage() as typeof organizationDeployment & {
      summary: typeof organizationDeployment.summary & { acceptedPlatformDecisions: number };
      platformDecisionRegister: typeof platformDecisionRegister;
    };
    const acceptedDatabaseDecision = acceptedOrganizationDeployment.platformDecisionRegister?.decisions
      .find((decision) => decision.id === "native-managed-database");
    expect(acceptedOrganizationDeployment.summary.acceptedPlatformDecisions).toBe(1);
    expect(acceptedOrganizationDeployment.platformDecisionRegister?.summary.acceptedBridge).toBe(1);
    expect(acceptedOrganizationDeployment.platformDecisionRegister?.summary.productionBlocking)
      .toBeLessThan(platformDecisionRegister?.summary.productionBlocking ?? Number.POSITIVE_INFINITY);
    expect(acceptedDatabaseDecision?.acceptedBridge).toBe(true);
    expect(acceptedDatabaseDecision?.ownerEvidence).toEqual(expect.arrayContaining([
      "acceptance=sena-enterprise-platform-decision-acceptance/v1",
      "acceptanceStatus=accepted",
      "acceptedBridge=true",
      "ownerRole=Platform operations",
      "environment=pilot-production"
    ]));
    expect(acceptedOrganizationDeployment.nativeAdapterCertification.summary.acceptedBridge).toBe(1);
    expect(acceptedOrganizationDeployment.nativeAdapterCertification.adapters.find((adapter) => adapter.id === "managed-database-adapter")).toEqual(expect.objectContaining({
      status: "accepted-bridge",
      acceptedBridge: true,
      ownerEvidence: expect.arrayContaining([
        "acceptance=sena-enterprise-platform-decision-acceptance/v1",
        "acceptedBridge=true",
        "ownerRole=Platform operations"
      ])
    }));
    process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED = "1";
    const envApprovedOnlyDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage() as typeof acceptedOrganizationDeployment & {
      saasOperationsReadiness: NonNullable<typeof deploymentSaasOperations.saasOperationsReadiness>;
    };
    expect(envApprovedOnlyDeployment.saasOperationsReadiness.schemaVersion).toBe("sena-enterprise-saas-operations-readiness/v1");
    expect(envApprovedOnlyDeployment.saasOperationsReadiness.approval.envConfigured).toBe(true);
    expect(envApprovedOnlyDeployment.saasOperationsReadiness.approval.fullSaasDecisionAccepted).toBe(false);
    expect(envApprovedOnlyDeployment.saasOperationsReadiness.status).toBe("blocked");
    expect(envApprovedOnlyDeployment.saasOperationsReadiness.summary.blockers).toContain("full-saas-platform-decision-acceptance-required");
    delete process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED;
    expect(acceptedOrganizationDeployment.governance.keyChecks.find((check: { id: string }) => check.id === "organization-deployment-package")?.evidence)
      .toContain("platformDecisionAcceptances=1");
    const releaseGateReview = platformDecisionTools.createEnterpriseReleaseGateReview(registered.context, {
      teamId: registered.context.teams[0].id,
      environment: "pilot-production",
      releaseVersion: "2026.06.13-local-pilot",
      decision: "conditional",
      approverName: "SENA release owner",
      approverRole: "Research platform lead",
      notes: "Conditional release requires remaining platform-decision owners before institution-wide deployment.",
      verificationCommand: "npm run sena:pilot:verify",
      verificationEvidence: {
        status: "passed",
        summary: "sena:pilot:verify passed with production build, visual guards, and browser interaction smoke.",
        outputSha256: "b".repeat(64)
      }
    });
    expect(releaseGateReview.schemaVersion).toBe("sena-enterprise-release-gate-review/v1");
    expect(releaseGateReview.status).toBe("conditional");
    expect(releaseGateReview.verificationEvidence).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-release-verification-evidence/v1",
      status: "passed",
      hashAlgorithm: "sha256",
      outputSha256: "b".repeat(64)
    }));
    expect(releaseGateReview.verificationEvidence.summary).toContain("browser interaction smoke");
    expect(releaseGateReview.readinessSnapshot.schemaVersion).toBe("sena-enterprise-deployment-readiness/v1");
    expect(releaseGateReview.readinessSnapshot.blockingReview).toBe(0);
    expect(releaseGateReview.platformDecisionSnapshot.schemaVersion).toBe("sena-enterprise-platform-decision-register/v1");
    expect(releaseGateReview.platformDecisionSnapshot.productionBlocking).toBeGreaterThan(0);
    expect(releaseGateReview.platformDecisionSnapshot.acceptedBridge).toBe(1);
    const listedReleaseGateReviews = platformDecisionTools.listEnterpriseReleaseGateReviews(registered.context, {
      teamId: registered.context.teams[0].id
    });
    expect(listedReleaseGateReviews.schemaVersion).toBe("sena-enterprise-release-gate-reviews/v1");
    expect(listedReleaseGateReviews.reviews).toEqual([
      expect.objectContaining({
        schemaVersion: "sena-enterprise-release-gate-review/v1",
        decision: "conditional",
        verificationEvidence: expect.objectContaining({
          schemaVersion: "sena-enterprise-release-verification-evidence/v1",
          outputSha256: "b".repeat(64)
        })
      })
    ]);
    const releaseGateGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(releaseGateGovernance.counts.releaseGateReviews).toBe(1);
    expect(releaseGateGovernance.checks.find((check: { id: string }) => check.id === "release-gate-review")?.evidence)
      .toContain("releaseGateReviews=1");
    expect(releaseGateGovernance.checks.find((check: { id: string }) => check.id === "release-gate-review")?.evidence)
      .toContain("verificationEvidence=sena-enterprise-release-verification-evidence/v1");
    expect(releaseGateGovernance.checks.find((check: { id: string }) => check.id === "release-gate-review")?.evidence)
      .toContain("latestVerificationStatus=passed");
    const releaseGateDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage() as typeof acceptedOrganizationDeployment & {
      releaseGate: {
        schemaVersion: "sena-enterprise-release-gate-reviews/v1";
        summary: { total: number; latestStatus?: string };
        latestReview?: {
          schemaVersion: "sena-enterprise-release-gate-review/v1";
          id: string;
          decision: string;
          releaseVersion: string;
          verificationEvidence: { schemaVersion: "sena-enterprise-release-verification-evidence/v1"; status: string; outputSha256: string };
          readinessSnapshot: { schemaVersion: "sena-enterprise-deployment-readiness/v1"; blockingReview: number };
          platformDecisionSnapshot: { schemaVersion: "sena-enterprise-platform-decision-register/v1"; productionBlocking: number };
        };
        evidence: string[];
      };
    };
    expect(releaseGateDeployment.releaseGate).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-release-gate-reviews/v1",
      summary: expect.objectContaining({
        total: 1,
        latestStatus: "conditional"
      }),
      latestReview: expect.objectContaining({
        schemaVersion: "sena-enterprise-release-gate-review/v1",
        id: releaseGateReview.id,
        decision: "conditional",
        releaseVersion: "2026.06.13-local-pilot",
        verificationEvidence: expect.objectContaining({
          schemaVersion: "sena-enterprise-release-verification-evidence/v1",
          status: "passed",
          outputSha256: "b".repeat(64)
        }),
        readinessSnapshot: expect.objectContaining({
          schemaVersion: "sena-enterprise-deployment-readiness/v1",
          blockingReview: 0
        }),
        platformDecisionSnapshot: expect.objectContaining({
          schemaVersion: "sena-enterprise-platform-decision-register/v1",
          productionBlocking: expect.any(Number)
        })
      }),
      evidence: expect.arrayContaining([
        "schema=sena-enterprise-release-gate-reviews/v1",
        "latestReview=sena-enterprise-release-gate-review/v1",
        "releaseGateReviews=1",
        "latestVerificationStatus=passed",
        "latestVerificationOutputSha256=present"
      ])
    }));
    const auditSiemAcceptance = platformDecisionTools.reviewEnterprisePlatformDecision(registered.context, {
      teamId: registered.context.teams[0].id,
      decisionId: "native-audit-siem-adapter",
      status: "accepted",
      acceptedBridge: true,
      ownerName: "SENA platform owner",
      ownerRole: "Security operations",
      environment: "pilot-production",
      evidenceUrl: "https://ops.example.test/sena/audit-siem-bridge-approval",
      notes: "Signed audit/SIEM forwarding bridge accepted with retention and SIEM delivery ownership."
    });
    const backupAcceptance = platformDecisionTools.reviewEnterprisePlatformDecision(registered.context, {
      teamId: registered.context.teams[0].id,
      decisionId: "native-managed-backup-storage",
      status: "accepted",
      acceptedBridge: true,
      ownerName: "SENA platform owner",
      ownerRole: "Platform operations",
      environment: "pilot-production",
      evidenceUrl: "https://ops.example.test/sena/backup-restore-bridge-approval",
      notes: "Signed backup bridge accepted with restore drill, RPO/RTO, and managed storage ownership."
    });
    expect(auditSiemAcceptance.decisionId).toBe("native-audit-siem-adapter");
    expect(auditSiemAcceptance.acceptedBridge).toBe(true);
    expect(backupAcceptance.decisionId).toBe("native-managed-backup-storage");
    expect(backupAcceptance.acceptedBridge).toBe(true);
    const acceptedGovernanceAdaptersDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage() as typeof acceptedOrganizationDeployment;
    expect(acceptedGovernanceAdaptersDeployment.platformDecisionRegister?.summary.acceptedBridge).toBe(3);
    expect(acceptedGovernanceAdaptersDeployment.nativeAdapterCertification.summary.acceptedBridge).toBe(3);
    expect(acceptedGovernanceAdaptersDeployment.nativeAdapterCertification.adapters.find((adapter) => adapter.id === "institution-audit-siem-adapter")).toEqual(expect.objectContaining({
      status: "accepted-bridge",
      acceptedBridge: true,
      productionBlocking: false,
      ownerEvidence: expect.arrayContaining([
        "acceptance=sena-enterprise-platform-decision-acceptance/v1",
        "ownerRole=Security operations",
        "environment=pilot-production"
      ])
    }));
    expect(acceptedGovernanceAdaptersDeployment.nativeAdapterCertification.adapters.find((adapter) => adapter.id === "managed-backup-storage-adapter")).toEqual(expect.objectContaining({
      status: "accepted-bridge",
      acceptedBridge: true,
      productionBlocking: false,
      ownerEvidence: expect.arrayContaining([
        "acceptance=sena-enterprise-platform-decision-acceptance/v1",
        "ownerRole=Platform operations",
        "environment=pilot-production"
      ])
    }));
    const organizationDeploymentJson = JSON.stringify(organizationDeployment);
    expect(organizationDeploymentJson).not.toContain("sena-alert-webhook-secret");
    expect(organizationDeploymentJson).not.toContain("sena-ops-token");
    expect(organizationDeploymentJson).not.toContain("sena-test-mfa-encryption-key");
    const opsAlerts = enterprise.getEnterpriseOpsAlerts(opsStatus, deploymentReadiness);
    expect(opsAlerts.schemaVersion).toBe("sena-enterprise-ops-alerts/v1");
    expect(opsAlerts.ownership.configured).toBe(true);
    expect(opsAlerts.ownership.owner).toBe("SENA platform rotation");
    expect(opsAlerts.ownership.runbookUrl).toBe("https://ops.example.test/sena-runbook");
    expect(opsAlerts.summary.critical).toBe(0);
    expect(opsAlerts.alerts.map((alert: { id: string }) => alert.id)).toContain("readiness-advisory-node-env-production");
    expect(opsAlerts.alerts.every((alert: { owner: string }) => alert.owner === "SENA platform rotation")).toBe(true);
    const alertRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      alertRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const alertDelivery = await enterprise.deliverEnterpriseOpsAlerts({
        status: opsStatus,
        readiness: deploymentReadiness
      });
      expect(alertDelivery.schemaVersion).toBe("sena-enterprise-ops-alert-delivery/v1");
      expect(alertDelivery.status).toBe("delivered");
      expect(alertDelivery.provider.mode).toBe("webhook");
      expect(alertDelivery.provider.endpointHash).toHaveLength(64);
      expect(alertDelivery.provider.secretConfigured).toBe(true);
      expect(alertDelivery.alerts.status).toBe(opsAlerts.status);
      expect(alertDelivery.alerts.summary.firing).toBe(opsAlerts.summary.firing);
      expect(alertDelivery.delivery.webhookStatus).toBe("delivered");
      expect(alertDelivery.delivery.httpStatus).toBe(202);
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(alertRequests).toHaveLength(1);
    expect(alertRequests[0].url).toBe("https://alerts.example.test/sena/ops");
    expect(alertRequests[0].headers["x-sena-webhook-event"]).toBe("ops.alert");
    expect(alertRequests[0].headers["x-sena-ops-alert-status"]).toBe(opsAlerts.status);
    expect(alertRequests[0].headers["x-sena-ops-alert-firing"]).toBe(String(opsAlerts.summary.firing));
    const alertTimestamp = alertRequests[0].headers["x-sena-webhook-timestamp"];
    expect(alertRequests[0].headers["x-sena-webhook-signature"]).toBe(`sha256=${createHmac("sha256", "sena-alert-webhook-secret").update(`${alertTimestamp}.${alertRequests[0].body}`).digest("hex")}`);
    const alertPayload = JSON.parse(alertRequests[0].body) as {
      schemaVersion: string;
      alerts: { schemaVersion: string; summary: { firing: number }; ownership: { owner: string } };
      delivery: { endpointHash: string; secretConfigured: boolean };
    };
    expect(alertPayload.schemaVersion).toBe("sena-enterprise-ops-alert-webhook/v1");
    expect(alertPayload.alerts.schemaVersion).toBe("sena-enterprise-ops-alerts/v1");
    expect(alertPayload.alerts.summary.firing).toBe(opsAlerts.summary.firing);
    expect(alertPayload.alerts.ownership.owner).toBe("SENA platform rotation");
    expect(alertPayload.delivery.endpointHash).toHaveLength(64);
    expect(alertPayload.delivery.secretConfigured).toBe(true);
    const alertGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(alertGovernance.checks.find((check: { id: string }) => check.id === "deployment-monitoring")?.evidence)
      .toContain("alertDeliverEvents=1");

    const analysisRun = buildSenaAnalysisRun({
      snapshot: project.snapshot,
      title: "Server-side SENA Analysis",
      includeRuntimeBundle: true
    });
    expect(analysisRun.schemaVersion).toBe("sena-analysis-run/v1");
    expect(analysisRun.summary.people).toBeGreaterThan(0);
    expect(analysisRun.report.schemaVersion).toBe("sena-report/v1");
    expect(analysisRun.projectSnapshot.schemaVersion).toBe("sena-project-snapshot/v1");
    expect(analysisRun.runtimeBundle?.schemaVersion).toBe("sena-runtime-bundle/v1");
    const analyzedProject = enterprise.createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: analysisRun.summary.title,
      snapshot: analysisRun.projectSnapshot
    });
    expect(analyzedProject.claimUse).toBe(analysisRun.summary.claimUse);
    const enterpriseAnalysisRun = enterprise.createEnterpriseAnalysisRun(registered.context, {
      teamId: registered.context.teams[0].id,
      projectId: project.id,
      persistedProjectId: analyzedProject.id,
      run: analysisRun
    });
    expect(enterpriseAnalysisRun.sourceKind).toBe("snapshot");
    expect(enterpriseAnalysisRun.includeRuntimeBundle).toBe(true);
    expect(enterpriseAnalysisRun.artifactFingerprints.reportSha256).toHaveLength(64);
    expect(enterpriseAnalysisRun.artifactFingerprints.projectSnapshotSha256).toHaveLength(64);
    expect(enterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256).toHaveLength(64);
    expect(enterprise.listEnterpriseAnalysisRuns(registered.context, { projectId: project.id })[0].id).toBe(enterpriseAnalysisRun.id);
    expect(enterprise.listEnterpriseTeamState(registered.context).analysisRuns.map((run: { id: string }) => run.id)).toContain(enterpriseAnalysisRun.id);
    const analysisGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(analysisGovernance.counts.analysisRuns).toBe(1);
    expect(analysisGovernance.checks.map((check: { id: string }) => check.id)).toContain("analysis-run-history");
    expect(analysisGovernance.checks.find((check: { id: string }) => check.id === "analysis-run-history")?.evidence)
      .toContain("schema=sena-analysis-run/v1");
    expect(analysisGovernance.checks.find((check: { id: string }) => check.id === "analysis-run-history")?.evidence)
      .toContain("historyApi=GET:/api/sena/analyze");

    const workbookBuffer = await buildXlsxWorkbookBuffer([
      {
        name: "people",
        rows: [
          { person_id: "p1", label: "Ada", role: "Teacher", group: "A" },
          { person_id: "p2", label: "Ben", role: "Student", group: "B" }
        ]
      },
      {
        name: "utterances",
        rows: [
          { utterance_id: "u1", person_id: "p1", unit_id: "unit", stanza_id: "s1", turn_index: 1, text: "Claim with evidence" },
          { utterance_id: "u2", person_id: "p2", unit_id: "unit", stanza_id: "s1", turn_index: 2, text: "Explanation follows" }
        ]
      },
      {
        name: "coded_segments",
        rows: [
          { segment_id: "cs1", utterance_id: "u1", person_id: "p1", unit_id: "unit", stanza_id: "s1", turn_index: 1, codes: "Claim|Evidence" },
          { segment_id: "cs2", utterance_id: "u2", person_id: "p2", unit_id: "unit", stanza_id: "s1", turn_index: 2, codes: "Explanation" }
        ]
      },
      {
        name: "codebook",
        rows: [
          { code_id: "Claim", label: "Claim" },
          { code_id: "Evidence", label: "Evidence" },
          { code_id: "Explanation", label: "Explanation" }
        ]
      }
    ]);
    const transcriptSrtBytes = Buffer.from([
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "Ada: We need #Evidence",
      "",
      "2",
      "00:00:04,000 --> 00:00:06,000",
      "Ben: I can add #Explanation"
    ].join("\n"), "utf8");
    const imported = await importSenaEnterpriseFiles([
      uploadLike("workbook.xlsx", workbookBuffer),
      uploadLike("transcript.srt", transcriptSrtBytes)
    ]);
    expect(imported.dataset.people.length).toBeGreaterThanOrEqual(2);
    expect(imported.sources.map((source) => source.profile)).toContain("excel-workbook");
    expect(imported.sources.map((source) => source.profile)).toContain("cleaned-transcript");
    expect(imported.cleaningManifest.schemaVersion).toBe("sena-import-cleaning-manifest/v1");
    expect(imported.cleaningManifest.summary.adapterProfiles).toContain("excel-workbook");
    expect(imported.cleaningManifest.summary.adapterProfiles).toContain("cleaned-transcript");
    expect(imported.cleaningManifest.sources.find((source) => source.profile === "cleaned-transcript")?.transformations)
      .toContain("hashtag/{{code}} marker extraction");
    expect(imported.cleaningManifest.checks.find((check) => check.id === "analysis-table-readiness")?.status).toBe("pass");
    const uploads = enterprise.createEnterpriseUploads(registered.context, {
      teamId: registered.context.teams[0].id,
      files: [
        {
          name: "workbook.xlsx",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: workbookBuffer,
          importProfile: "excel-workbook",
          warningCount: 0
        },
        {
          name: "transcript.srt",
          contentType: "application/x-subrip",
          bytes: transcriptSrtBytes,
          importProfile: "cleaned-transcript",
          warningCount: 0
        }
      ]
    });
    expect(uploads).toHaveLength(2);
    expect(uploads[0].sha256).toHaveLength(64);
    expect(uploads[0].importProfile).toBe("excel-workbook");
    expect(uploads[0].scanStatus).toBe("passed");
    expect(uploads[0].storageEncoding).toBe("sena-upload-aes-256-gcm-envelope/v1");
    expect(uploads[0].storageKeySource).toBe("pilot-local-derived");
    expect(uploads[1].importProfile).toBe("cleaned-transcript");
    expect(uploads[1].originalName).toBe("transcript.srt");
    expect(uploads[1].scanStatus).toBe("passed");
    expect(uploads[1].storageEncoding).toBe("sena-upload-aes-256-gcm-envelope/v1");
    const storedUploadBytes = readFileSync(path.join(enterpriseDbDir, uploads[0].storagePath));
    expect(storedUploadBytes.equals(workbookBuffer)).toBe(false);
    expect(JSON.parse(storedUploadBytes.toString("utf8"))).toEqual(expect.objectContaining({
      schemaVersion: "sena-upload-aes-256-gcm-envelope/v1",
      algorithm: "aes-256-gcm",
      keySource: "pilot-local-derived",
      iv: expect.any(String),
      authTag: expect.any(String),
      ciphertextBase64: expect.any(String)
    }));
    expect(uploads[0].scanEngine).toBe("sena-local-upload-scan/v1");
    expect(enterprise.listEnterpriseUploads(registered.context, registered.context.teams[0].id)[0].id).toBe(uploads[0].id);
    expect(enterprise.listEnterpriseTeamState(registered.context).uploads.map((upload: { id: string }) => upload.id)).toContain(uploads[0].id);
    const uploadStorageVerification = enterprise.verifyEnterpriseUploadStorage(registered.context, { teamId: registered.context.teams[0].id });
    expect(uploadStorageVerification.schemaVersion).toBe("sena-enterprise-upload-storage-verification/v1");
    expect(uploadStorageVerification.status).toBe("pass");
    expect(uploadStorageVerification.summary.registeredUploads).toBe(2);
    expect(uploadStorageVerification.summary.verifiedBlobs).toBe(2);
    expect(uploadStorageVerification.summary.missingBlobs).toBe(0);
    expect(uploadStorageVerification.summary.checksumMismatches).toBe(0);
    expect(uploadStorageVerification.summary.orphanBlobs).toBe(0);
    expect(uploadStorageVerification.storage.encryption).toEqual({
      atRest: "sena-upload-aes-256-gcm-envelope/v1",
      keySource: "pilot-local-derived",
      encryptedBlobs: 2,
      legacyRawBlobs: 0
    });
    const objectStorageRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url, init) => {
      objectStorageRequests.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>
      });
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    try {
      const objectStorageDelivery = await enterprise.deliverEnterpriseUploadBlobs(registered.context, {
        teamId: registered.context.teams[0].id,
        uploadId: uploads[0].id
      });
      expect(objectStorageDelivery.schemaVersion).toBe("sena-enterprise-upload-object-storage-delivery/v1");
      expect(objectStorageDelivery.status).toBe("completed");
      expect(objectStorageDelivery.provider.mode).toBe("webhook");
      expect(objectStorageDelivery.provider.endpointHash).toHaveLength(64);
      expect(objectStorageDelivery.provider.secretConfigured).toBe(true);
      expect(objectStorageDelivery.summary.delivered).toBe(1);
      expect(objectStorageDelivery.uploads[0].deliveryStatus).toBe("delivered");
      expect(objectStorageDelivery.uploads[0].objectKey).toContain(`/uploads/${uploads[0].id}/`);
    } finally {
      globalThis.fetch = originalWebhookFetch;
    }
    expect(objectStorageRequests).toHaveLength(1);
    expect(objectStorageRequests[0].url).toBe("https://objects.example.test/sena/uploads");
    expect(objectStorageRequests[0].headers["x-sena-webhook-event"]).toBe("upload.object_storage.deliver");
    expect(objectStorageRequests[0].headers["x-sena-upload-id"]).toBe(uploads[0].id);
    expect(objectStorageRequests[0].headers["x-sena-upload-sha256"]).toBe(uploads[0].sha256);
    expect(objectStorageRequests[0].headers["x-sena-object-key"]).toContain(`/uploads/${uploads[0].id}/`);
    const objectStorageTimestamp = objectStorageRequests[0].headers["x-sena-webhook-timestamp"];
    expect(objectStorageRequests[0].headers["x-sena-webhook-signature"]).toBe(`sha256=${createHmac("sha256", "sena-object-storage-webhook-secret").update(`${objectStorageTimestamp}.${objectStorageRequests[0].body}`).digest("hex")}`);
    const objectStoragePayload = JSON.parse(objectStorageRequests[0].body) as {
      schemaVersion: string;
      upload: { id: string; originalName: string; sha256: string; scanStatus: string };
      object: { key: string; encoding: string; bytesBase64: string; sha256: string; size: number };
      delivery: { endpointHash: string; secretConfigured: boolean };
    };
    expect(objectStoragePayload.schemaVersion).toBe("sena-enterprise-upload-object-storage-webhook/v1");
    expect(objectStoragePayload.upload.id).toBe(uploads[0].id);
    expect(objectStoragePayload.upload.originalName).toBe("workbook.xlsx");
    expect(objectStoragePayload.upload.sha256).toBe(uploads[0].sha256);
    expect(objectStoragePayload.upload.scanStatus).toBe("passed");
    expect(objectStoragePayload.object.encoding).toBe("base64");
    expect(Buffer.from(objectStoragePayload.object.bytesBase64, "base64").equals(workbookBuffer)).toBe(true);
    expect(objectStoragePayload.object.sha256).toBe(uploads[0].sha256);
    expect(objectStoragePayload.object.size).toBe(workbookBuffer.byteLength);
    expect(objectStoragePayload.delivery.endpointHash).toHaveLength(64);
    expect(objectStoragePayload.delivery.secretConfigured).toBe(true);
    const reviewUpload = enterprise.createEnterpriseUploads(registered.context, {
      teamId: registered.context.teams[0].id,
      files: [{
        name: "contact-notes.txt",
        contentType: "text/plain",
        bytes: Buffer.from("Ada: contact ada@example.edu for #Evidence", "utf8"),
        importProfile: "cleaned-transcript",
        warningCount: 0
      }]
    })[0];
    expect(reviewUpload.scanStatus).toBe("review");
    expect(reviewUpload.scanFindings).toContain("possible-email-addresses");
    expect(() => enterprise.createEnterpriseUploads(registered.context, {
      teamId: registered.context.teams[0].id,
      files: [{
        name: "tool.exe",
        contentType: "application/octet-stream",
        bytes: Buffer.from("MZblocked", "utf8")
      }]
    })).toThrow(/not allowed|executable/i);
    const uploadGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(uploadGovernance.checks.map((check: { id: string }) => check.id)).toContain("upload-registry");
    expect(uploadGovernance.checks.map((check: { id: string }) => check.id)).toContain("upload-security-scan");
    expect(uploadGovernance.checks.map((check: { id: string }) => check.id)).toContain("upload-storage-integrity");
    expect(uploadGovernance.checks.find((check: { id: string }) => check.id === "upload-registry")?.evidence)
      .toContain("objectStorageProvider=webhook");
    expect(uploadGovernance.checks.find((check: { id: string }) => check.id === "upload-registry")?.evidence)
      .toContain("objectStorageDeliverEvents=1");
    expect(uploadGovernance.checks.find((check: { id: string }) => check.id === "upload-storage-integrity")?.evidence)
      .toContain("objectStorageProvider=webhook");
    expect(uploadGovernance.checks.find((check: { id: string }) => check.id === "upload-storage-integrity")?.evidence)
      .toContain("missing=0");
    const importRun = enterprise.createEnterpriseImportRun(registered.context, {
      teamId: registered.context.teams[0].id,
      uploadIds: uploads.map((upload: { id: string }) => upload.id),
      sources: imported.sources,
      warnings: imported.warnings,
      dataset: imported.dataset,
      cleaningManifest: imported.cleaningManifest
    });
    expect(importRun.sources.map((source: { profile: string }) => source.profile)).toContain("excel-workbook");
    expect(importRun.sources.map((source: { profile: string }) => source.profile)).toContain("cleaned-transcript");
    expect(importRun.cleaningManifest?.schemaVersion).toBe("sena-import-cleaning-manifest/v1");
    expect(importRun.cleaningManifest?.summary.totalSourceRows).toBeGreaterThan(0);
    expect(importRun.datasetCounts.people).toBe(imported.dataset.people.length);
    expect(enterprise.listEnterpriseImportRuns(registered.context, registered.context.teams[0].id)[0].id).toBe(importRun.id);
    expect(enterprise.listEnterpriseImportRuns(registered.context, registered.context.teams[0].id)[0].cleaningManifest?.schemaVersion)
      .toBe("sena-import-cleaning-manifest/v1");
    expect(enterprise.listEnterpriseTeamState(registered.context).importRuns.map((run: { id: string }) => run.id)).toContain(importRun.id);
    const importGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(importGovernance.counts.importRuns).toBe(1);
    expect(importGovernance.checks.map((check: { id: string }) => check.id)).toContain("import-run-history");
    expect(importGovernance.checks.find((check: { id: string }) => check.id === "import-run-history")?.evidence)
      .toContain("cleaningManifest=sena-import-cleaning-manifest/v1");
    expect(importGovernance.checks.find((check: { id: string }) => check.id === "import-run-history")?.evidence)
      .toContain("cleaningManifests=1");
    const importedAnalysisArtifact = buildSenaAnalysisRun({
      sourceKind: "dataset",
      dataset: imported.dataset,
      title: "Imported Enterprise Dataset",
      includeRuntimeBundle: true
    });
    const importedProject = enterprise.createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Imported Enterprise Dataset",
      description: `Created from enterprise import run ${importRun.id}.`,
      snapshot: importedAnalysisArtifact.projectSnapshot
    });
    const importedAnalysisRun = enterprise.createEnterpriseAnalysisRun(registered.context, {
      teamId: registered.context.teams[0].id,
      persistedProjectId: importedProject.id,
      run: importedAnalysisArtifact
    });
    expect(importedAnalysisArtifact.source.kind).toBe("dataset");
    expect(importedAnalysisArtifact.runtimeBundle?.schemaVersion).toBe("sena-runtime-bundle/v1");
    expect(importedProject.snapshot.schemaVersion).toBe("sena-project-snapshot/v1");
    expect(importedProject.datasetCounts.utterances).toBe(imported.dataset.utterances.length);
    expect(importedProject.datasetCounts.codes).toBe(imported.dataset.codebook.length);
    expect(importedAnalysisRun.persistedProjectId).toBe(importedProject.id);
    expect(importedAnalysisRun.sourceKind).toBe("dataset");
    expect(importedAnalysisRun.includeRuntimeBundle).toBe(true);
    expect(enterprise.getEnterpriseProject(registered.context, importedProject.id).snapshot.title).toBe("Imported Enterprise Dataset");
    expect(enterprise.listEnterpriseProjects(registered.context).map((candidate: { id: string }) => candidate.id)).toContain(importedProject.id);
    expect(enterprise.listEnterpriseAnalysisRuns(registered.context, { projectId: importedProject.id })[0].id).toBe(importedAnalysisRun.id);
    const importProjectTeamState = enterprise.listEnterpriseTeamState(registered.context);
    expect(importProjectTeamState.importRuns.map((run: { id: string }) => run.id)).toContain(importRun.id);
    expect(importProjectTeamState.analysisRuns.map((run: { id: string }) => run.id)).toContain(importedAnalysisRun.id);

    const parsedReliability = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Explanation", value: "1" },
      { coder_id: "c2", item_id: "u2", code_id: "Explanation", value: "0" },
      { coder_id: "c1", item_id: "u3", code_id: "Explanation", value: "1" },
      { coder_id: "c2", item_id: "u3", code_id: "Explanation", value: "0" }
    ]);
    const reliability = buildSenaReliabilityDashboard(parsedReliability.annotations);
    expect(reliability.coderCount).toBe(2);
    expect(reliability.disagreementCount).toBe(2);
    expect(reliability.codeDiagnostics[0]).toEqual(expect.objectContaining({
      codeId: "Explanation",
      disagreementCount: 2,
      coderPositiveRates: { c1: 0.6667, c2: 0 }
    }));
    expect(reliabilityDashboardToReview(reliability).agreementValue).toContain("kappa=");
    const reliabilityReview = reliabilityDashboardToReview(reliability, "Enterprise test");
    const reliabilityRun = enterprise.createEnterpriseReliabilityRun(registered.context, {
      teamId: registered.context.teams[0].id,
      projectId: project.id,
      reviewer: "Enterprise test",
      fileCount: 1,
      annotationCount: parsedReliability.annotations.length,
      inputFiles: [{ name: "coder-ratings.csv", size: 128, sha256: "a".repeat(64) }],
      dashboard: reliability,
      reviewPatch: reliabilityReview
    });
    expect(reliabilityRun.meanPairwiseKappa).toBe(reliability.meanPairwiseKappa);
    expect(reliabilityRun.status).toBe("pending-adjudication");
    expect(reliabilityRun.adjudicationCoverage).toEqual(expect.objectContaining({
      schemaVersion: "sena-reliability-adjudication-coverage/v1",
      queuedDisagreements: 2,
      resolvedDisagreements: 0,
      unresolvedDisagreements: 2,
      coverageRate: 0
    }));
    expect(enterprise.listEnterpriseReliabilityRuns(registered.context, { projectId: project.id })[0].id).toBe(reliabilityRun.id);
    expect(enterprise.listEnterpriseTeamState(registered.context).reliabilityRuns.map((run: { id: string }) => run.id)).toContain(reliabilityRun.id);
    expect(enterprise.listEnterpriseProjectCollaboration(registered.context, project.id).reliabilityRuns[0].id).toBe(reliabilityRun.id);
    const reliabilityAdjudication = enterprise.createEnterpriseReliabilityAdjudications(registered.context, reliabilityRun.id, {
      decision: "revise",
      notes: "Batch adjudication generated from reliability disagreement queue.",
      limit: 1
    });
    expect(reliabilityAdjudication.schemaVersion).toBe("sena-enterprise-reliability-adjudication/v1");
    expect(reliabilityAdjudication.summary.created).toBe(1);
    expect(reliabilityAdjudication.summary.resolvedDisagreements).toBe(1);
    expect(reliabilityAdjudication.summary.unresolvedDisagreements).toBe(1);
    expect(reliabilityAdjudication.reliabilityRun.adjudicationCoverage.coverageRate).toBe(0.5);
    expect(reliabilityAdjudication.adjudications[0].reliabilityRunId).toBe(reliabilityRun.id);
    expect(enterprise.listEnterpriseProjectCollaboration(registered.context, project.id).adjudications.some((record: { reliabilityRunId?: string }) => (
      record.reliabilityRunId === reliabilityRun.id
    ))).toBe(true);
    expect(() => enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
      status: "approved",
      notes: "Only one disagreement was resolved."
    })).toThrow(/all queued reliability disagreements/i);
    const finalReliabilityAdjudication = enterprise.createEnterpriseReliabilityAdjudications(registered.context, reliabilityRun.id, {
      decision: "include",
      notes: "Remaining reliability disagreement resolved."
    });
    expect(finalReliabilityAdjudication.summary.created).toBe(1);
    expect(finalReliabilityAdjudication.summary.resolvedDisagreements).toBe(2);
    expect(finalReliabilityAdjudication.summary.unresolvedDisagreements).toBe(0);
    expect(finalReliabilityAdjudication.reliabilityRun.adjudicationCoverage).toEqual(expect.objectContaining({
      queuedDisagreements: 2,
      resolvedDisagreements: 2,
      unresolvedDisagreements: 0,
      coverageRate: 1,
      decisions: { include: 1, exclude: 0, revise: 1 }
    }));
    const reviewedReliabilityRun = enterprise.reviewEnterpriseReliabilityRun(registered.context, reliabilityRun.id, {
      status: "approved",
      notes: "Disagreement was resolved through the reliability adjudication batch."
    });
    expect(reviewedReliabilityRun.status).toBe("approved");
    expect(reviewedReliabilityRun.reviewNotes).toContain("resolved");
    expect(reviewedReliabilityRun.adjudicationCoverage.unresolvedDisagreements).toBe(0);
    expect(reviewedReliabilityRun.adjudicationCoverage.coverageRate).toBe(1);
    expect(enterprise.listEnterpriseProjectCollaboration(registered.context, project.id).reliabilityRuns[0].status).toBe("approved");
    expect(enterprise.listEnterpriseNotifications(registered.context, { kind: "reliability.review" }).notifications.some((notification: { detail: Record<string, unknown> }) => (
      notification.detail.reliabilityRunId === reliabilityRun.id && notification.detail.status === "approved"
    ))).toBe(true);
    const reliabilityGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(reliabilityGovernance.counts.reliabilityRuns).toBe(1);
    expect(reliabilityGovernance.checks.map((check: { id: string }) => check.id)).toContain("reliability-run-history");
    expect(reliabilityGovernance.checks.find((check: { id: string }) => check.id === "reliability-run-history")?.evidence)
      .toContain("reliabilityAdjudications=2");
    expect(reliabilityGovernance.checks.find((check: { id: string }) => check.id === "reliability-run-history")?.evidence)
      .toContain("diagnostics=code-level-agreement|coder-positive-rate-drift");
    expect(reliabilityGovernance.checks.find((check: { id: string }) => check.id === "reliability-run-history")?.evidence)
      .toContain("adjudicationCoverage=sena-reliability-adjudication-coverage/v1");
    expect(reliabilityGovernance.checks.find((check: { id: string }) => check.id === "reliability-run-history")?.evidence)
      .toContain("latestAdjudicationCoverage=1");

    const comparison = buildSenaGroupComparison({
      dataset: lessonStudySenaContract,
      groupField: "role",
      groupA: "Lead teacher",
      groupB: "Curriculum designer",
      iterations: 100
    });
    expect(comparison.schemaVersion).toBe("sena-group-comparison/v1");
    expect(comparison.permutation.pTwoSided).toBeGreaterThan(0);
    expect(comparison.effectSize).toEqual(expect.objectContaining({
      cohenD: expect.any(Number),
      hedgesG: expect.any(Number)
    }));
    expect(comparison.bootstrap.meanDifferenceLower).toBeLessThanOrEqual(comparison.bootstrap.meanDifferenceUpper);
    const validationRun = enterprise.createEnterpriseValidationRun(registered.context, {
      teamId: registered.context.teams[0].id,
      projectId: project.id,
      preregistrationNote: "Protocol fixture preregistration note.",
      methodNote: "Permutation comparison fixture for enterprise validation.",
      result: comparison
    });
    expect(validationRun.status).toBe("pending-review");
    expect(validationRun.pTwoSided).toBe(comparison.permutation.pTwoSided);
    expect(validationRun.parityEvidence).toEqual(expect.objectContaining({
      schemaVersion: "sena-validation-parity-evidence/v1",
      status: "ready-for-review",
      walkthrough: expect.objectContaining({
        datasetLabel: "analysis:Server-side SENA Analysis",
        datasetHash: enterpriseAnalysisRun.artifactFingerprints.projectSnapshotSha256,
        source: "analysis-run",
        sourceId: enterpriseAnalysisRun.id,
        status: "attached"
      })
    }));
    expect((validationRun as { preregistrationPlan?: { schemaVersion: string; planHash: string; evidence: string[] } }).preregistrationPlan)
      .toEqual(expect.objectContaining({
        schemaVersion: "sena-validation-preregistration-plan/v1",
        planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        evidence: expect.arrayContaining([
          "protocolNote=present",
          "methodNote=present",
          "analysis=single-comparison"
        ])
      }));
    expect(enterprise.listEnterpriseValidationRuns(registered.context, { projectId: project.id })[0].id).toBe(validationRun.id);
    const reviewedValidationRun = enterprise.reviewEnterpriseValidationRun(registered.context, validationRun.id, {
      status: "approved",
      notes: "Approved as descriptive validation support."
    });
    expect(reviewedValidationRun.status).toBe("approved");
    const validationCollaboration = enterprise.listEnterpriseProjectCollaboration(registered.context, project.id);
    expect(validationCollaboration.validationRuns[0].status).toBe("approved");
    expect(enterprise.listEnterpriseNotifications(registered.context, { kind: "validation.review" }).notifications.some((notification: { detail: Record<string, unknown> }) => (
      notification.detail.validationRunId === validationRun.id && notification.detail.status === "approved"
    ))).toBe(true);

    const comparisonSuite = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" },
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "alignment" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    expect(comparisonSuite.schemaVersion).toBe("sena-group-comparison-suite/v1");
    expect(comparisonSuite.correction).toBe("holm");
    expect(comparisonSuite.comparisonCount).toBe(3);
    expect(comparisonSuite.comparisons.map((entry) => entry.holmRank)).toEqual([1, 2, 3]);
    expect(comparisonSuite.comparisons.every((entry) => entry.holmAdjustedP >= entry.permutation.pTwoSided)).toBe(true);
    const validationSuiteRun = enterprise.createEnterpriseValidationRun(registered.context, {
      teamId: registered.context.teams[0].id,
      projectId: project.id,
      preregistrationNote: "Protocol fixture preregistration note for multi-metric suite.",
      methodNote: "Holm-corrected multi-metric fixture for enterprise validation.",
      result: comparisonSuite,
      parityEvidence: {
        walkthroughDatasetLabel: "lesson-study sample walkthrough",
        walkthroughDatasetHash: "walkthrough-fixture-sha256",
        expertReviewRequired: true,
        studySpecificInferenceReference: "prereg:lesson-study-holm-model-v1"
      }
    });
    expect(validationSuiteRun.comparisonCount).toBe(3);
    expect(validationSuiteRun.minHolmAdjustedP).toBeGreaterThanOrEqual(0);
    expect(validationSuiteRun.result.schemaVersion).toBe("sena-group-comparison-suite/v1");
    expect(validationSuiteRun.parityEvidence).toEqual(expect.objectContaining({
      schemaVersion: "sena-validation-parity-evidence/v1",
      status: "ready-for-review",
      validationRunHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      walkthrough: expect.objectContaining({
        datasetLabel: "lesson-study sample walkthrough",
        datasetHash: "walkthrough-fixture-sha256",
        status: "attached"
      }),
      runtimeParity: expect.arrayContaining([
        expect.objectContaining({ id: "jena-rena-sample-parity", status: "covered" }),
        expect.objectContaining({ id: "jsna-r-sna-social-parity", status: "covered" })
      ]),
      inference: expect.objectContaining({
        studySpecificInferenceReference: "prereg:lesson-study-holm-model-v1"
      }),
      formalInference: expect.objectContaining({
        schemaVersion: "sena-formal-inference-readiness/v1",
        status: "model-referenced",
        preregistrationPlanHash: validationSuiteRun.preregistrationPlan?.planHash,
        studySpecificInferenceReference: "prereg:lesson-study-holm-model-v1",
        resultSchemaVersion: "sena-group-comparison-suite/v1",
        correction: "holm",
        comparisonCount: 3,
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "preregistration-plan", status: "passed" }),
          expect.objectContaining({ id: "study-specific-model", status: "passed" }),
          expect.objectContaining({ id: "runtime-parity", status: "passed" }),
          expect.objectContaining({ id: "real-data-walkthrough", status: "passed" }),
          expect.objectContaining({ id: "multiplicity-control", status: "passed" })
        ]),
        warnings: expect.arrayContaining(["small-sample-comparisons=3"])
      }),
      gates: expect.arrayContaining([
        expect.objectContaining({ id: "rena-parity", status: "passed" }),
        expect.objectContaining({ id: "r-sna-parity", status: "passed" }),
        expect.objectContaining({ id: "real-data-walkthrough", status: "passed" }),
        expect.objectContaining({ id: "domain-expert-review", status: "required" }),
        expect.objectContaining({ id: "study-specific-inference", status: "attached" })
      ])
    }));
    expect((validationSuiteRun as { preregistrationPlan?: { evidence: string[] } }).preregistrationPlan?.evidence)
      .toEqual(expect.arrayContaining(["analysis=holm-suite", "correction=holm", "comparisons=3"]));
    const reviewedValidationSuiteRun = enterprise.reviewEnterpriseValidationRun(registered.context, validationSuiteRun.id, {
      status: "approved",
      notes: "Approved Holm-corrected suite for claim package evidence."
    });
    expect(reviewedValidationSuiteRun.status).toBe("approved");

    const expertReview = enterprise.createEnterpriseExpertReview(registered.context, {
      projectId: project.id,
      target: { kind: "validation-run", id: validationSuiteRun.id, label: "Holm-corrected validation suite" },
      reviewerName: "Domain Expert",
      reviewerRole: "External lesson-study reviewer",
      expertiseArea: "Lesson study and discourse analysis",
      status: "changes-requested",
      claimScope: "exploratory-only",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 3 },
      strengths: "The validation suite is auditable.",
      concerns: "Interpretation needs tighter claim language.",
      recommendations: "Limit claims until a second dataset walkthrough is complete.",
      limitations: "Fixture review."
    });
    expect(expertReview.status).toBe("changes-requested");
    expect(expertReview.target.id).toBe(validationSuiteRun.id);
    const approvedExpertReview = enterprise.reviewEnterpriseExpertReview(registered.context, expertReview.id, {
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { interpretationValidity: 4 },
      recommendations: "Approved with limited claim scope after revisions."
    });
    expect(approvedExpertReview.status).toBe("approved");
    expect(approvedExpertReview.claimScope).toBe("claim-ready-with-limits");
    expect(approvedExpertReview.ratings.interpretationValidity).toBe(4);
    const expertCollaboration = enterprise.listEnterpriseProjectCollaboration(registered.context, project.id);
    expect(expertCollaboration.expertReviews[0].id).toBe(expertReview.id);
    expect(enterprise.listEnterpriseExpertReviews(registered.context, { projectId: project.id })[0].status).toBe("approved");
    expect(enterprise.listEnterpriseNotifications(registered.context, { kind: "expert.review" }).notifications.some((notification: { detail: Record<string, unknown> }) => (
      notification.detail.expertReviewId === expertReview.id && notification.detail.status === "approved"
    ))).toBe(true);
    const validationGovernance = enterprise.getEnterpriseGovernanceStatus();
    expect(validationGovernance.counts.validationRuns).toBe(2);
    expect(validationGovernance.counts.expertReviews).toBe(1);
    expect(validationGovernance.checks.map((check: { id: string }) => check.id)).toContain("validation-run-history");
    expect(validationGovernance.checks.map((check: { id: string }) => check.id)).toContain("domain-expert-review");
    const validationCheck = validationGovernance.checks.find((check: { id: string }) => check.id === "validation-run-history");
    expect(validationCheck?.evidence).toContain("multipleComparison=holm");
    expect(validationCheck?.evidence).toContain("preregistrationPlan=sena-validation-preregistration-plan/v1");
    expect(validationCheck?.evidence).toContain("planHash=sha256");
    expect(validationCheck?.evidence).toContain("suiteRuns=1");
    expect(validationCheck?.evidence).toContain("parityEvidence=sena-validation-parity-evidence/v1");
    expect(validationCheck?.evidence).toContain("parityEvidenceRuns=2");
    expect(validationCheck?.evidence).toContain("parityReadyForReview=2");
    const expertCheck = validationGovernance.checks.find((check: { id: string }) => check.id === "domain-expert-review");
    expect(expertCheck?.evidence).toContain("expertReviews=1");
    expect(expertCheck?.evidence).toContain("approved=1");
    const claimPackage = enterprise.getEnterpriseClaimEvidencePackage(registered.context, { projectId: project.id });
    expect(claimPackage.schemaVersion).toBe("sena-enterprise-claim-evidence-package/v1");
    expect(claimPackage.project.id).toBe(project.id);
    expect(claimPackage.sourceSnapshotEvidence).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-claim-source-snapshot/v1",
      projectVersion: claimPackage.project.currentVersion,
      snapshotSchemaVersion: "sena-project-snapshot/v1",
      snapshotTitle: project.title,
      revisionMatchesCurrentVersion: true,
      datasetCounts: project.datasetCounts,
      buildOptions: project.snapshot.reproducibility.buildOptions
    }));
    expect(claimPackage.sourceSnapshotEvidence.revisionId).toMatch(/^rev_/);
    expect(claimPackage.sourceSnapshotEvidence.snapshotSha256).toHaveLength(64);
    expect(claimPackage.sourceSnapshotEvidence.reportSha256).toHaveLength(64);
    expect(claimPackage.sourceSnapshotEvidence.matrixFingerprints.map((fingerprint: { id: string }) => fingerprint.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(claimPackage.sourceSnapshotEvidence.matrixFingerprints.every((fingerprint: { sha256: string }) => fingerprint.sha256.length === 64)).toBe(true);
    expect(claimPackage.status).toBe("claim-ready-with-limits");
    expect(claimPackage.summary.blockers).toBe(0);
    expect(claimPackage.evidence.reliability?.runId).toBe(reliabilityRun.id);
    expect(claimPackage.evidence.reliability?.status).toBe("approved");
    expect(claimPackage.evidence.validation?.runId).toBe(validationSuiteRun.id);
    expect(claimPackage.evidence.validation?.preregistrationPlanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(claimPackage.evidence.validation?.suiteCorrection).toBe("holm");
    expect(claimPackage.evidence.validation?.parityEvidence).toEqual(expect.objectContaining({
      schemaVersion: "sena-validation-parity-evidence/v1",
      status: "ready-for-review",
      validationRunHash: validationSuiteRun.parityEvidence?.validationRunHash
    }));
    expect(claimPackage.evidence.expertReview?.reviewId).toBe(expertReview.id);
    expect(claimPackage.evidence.expertReview?.claimScope).toBe("claim-ready-with-limits");
    expect(claimPackage.guardrails).toContain("Claim readiness is limited to the approved project evidence in this package and does not replace study-level preregistration or institutional review.");
    expect(claimPackage.artifacts.map((artifact: { schemaVersion: string }) => artifact.schemaVersion)).toEqual(expect.arrayContaining([
      "sena-coding-reliability-dashboard/v1",
      "sena-validation-preregistration-plan/v1",
      "sena-validation-parity-evidence/v1",
      "sena-formal-inference-readiness/v1",
      "sena-enterprise-expert-review/v1"
    ]));

    const snapshot = sampleSnapshot();
    const svg = await buildSenaPublicationExport(snapshot, "svg");
    const png = await buildSenaPublicationExport(snapshot, "png");
    const xlsx = await buildSenaPublicationExport(snapshot, "xlsx");
    const docx = await buildSenaPublicationExport(snapshot, "docx");
    const pdf = await buildSenaPublicationExport(snapshot, "pdf");
    const publicationPackage = await buildSenaPublicationExport(snapshot, "package");
    expect(svg.contentType).toContain("image/svg+xml");
    expect(String(svg.body)).toContain("SENA publication export");
    expect(png.contentType).toBe("image/png");
    expect(Buffer.isBuffer(png.body)).toBe(true);
    expect((png.body as Buffer).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(Buffer.isBuffer(xlsx.body)).toBe(true);
    const publicationWorkbook = await readXlsxWorkbookRows(xlsx.body as Buffer);
    const publicationSheetNames = publicationWorkbook.map((sheet) => sheet.name);
    const publicationRows = (sheetName: string) => publicationWorkbook.find((sheet) => sheet.name === sheetName)?.rows ?? [];
    expect(publicationSheetNames).toEqual(expect.arrayContaining([
      "Summary",
      "Claim readiness",
      "Coding reliability",
      "Data governance",
      "Matrix fingerprints",
      "Evidence snippets"
    ]));
    const claimRows = publicationRows("Claim readiness");
    expect(claimRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gate: "Claim readiness",
        status: snapshot.report.claimReadinessGate.status,
        claimUse: snapshot.report.claimReadinessGate.claimUse
      })
    ]));
    const codingRows = publicationRows("Coding reliability");
    expect(codingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schemaVersion: "sena-coding-reliability-gate/v1",
        status: snapshot.report.codingReliabilityGate.status,
        reviewer: snapshot.report.codingReliabilityGate.review.reviewer
      })
    ]));
    const matrixRows = publicationRows("Matrix fingerprints");
    expect(matrixRows.map((row) => row.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(matrixRows.every((row) => String(row.checksum).startsWith("0x"))).toBe(true);
    const evidenceRows = publicationRows("Evidence snippets");
    expect(evidenceRows.length).toBeGreaterThan(0);
    expect(evidenceRows[0]).toEqual(expect.objectContaining({
      activeWindow: snapshot.report.analysisWindow?.label ?? "Full conversation"
    }));
    expect(Buffer.isBuffer(docx.body)).toBe(true);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(publicationPackage.contentType).toBe("application/vnd.sena.publication-package+json; charset=utf-8");
    const publicationManifest = JSON.parse(String(publicationPackage.body)) as {
      schemaVersion: string;
      manifest: {
        title: string;
        formats: string[];
        artifactCount: number;
        packageSha256: string;
        sourceSnapshotSha256: string;
      };
      claimEvidence: {
        claimReadinessStatus: string;
        claimUse: string;
        codingReliability: string;
        humanReview: string;
      };
      sourceSnapshotEvidence: {
        schemaVersion: string;
        snapshotSchemaVersion: string;
        snapshotSha256: string;
        reportSha256: string;
        dataGovernance: {
          schemaVersion: string;
          status: string;
          irbApprovalId: string;
        };
        datasetCounts: {
          people: number;
          interactions: number;
          utterances: number;
          codedSegments: number;
          codes: number;
        };
        buildOptions: {
          alpha: number;
          beta: number;
          gamma: number;
          normalization: string;
        };
        matrixFingerprints: Array<{ id: string; sha256: string }>;
      };
      artifactManifest: Array<{
        format: string;
        filename: string;
        contentType: string;
        bytes: number;
        sha256: string;
      }>;
      verificationCertificate: {
        schemaVersion: string;
        status: string;
        artifactChecks: Array<{
          filename: string;
          format: string;
          sha256: string;
          status: string;
        }>;
        gateEvidence: {
          claimReadinessStatus: string;
          codingReliabilityStatus: string;
          humanReviewStatus: string;
          completenessStatus: string;
        };
      };
      artifacts: Array<{
        format: string;
        filename: string;
        contentType: string;
        bytes: number;
        sha256: string;
        bodyBase64: string;
      }>;
    };
    expect(publicationManifest.schemaVersion).toBe("sena-publication-package/v1");
    expect(publicationManifest.manifest.formats).toEqual(["svg", "png", "html", "xlsx", "docx", "pdf"]);
    expect(publicationManifest.manifest.artifactCount).toBe(6);
    expect(publicationManifest.manifest.packageSha256).toHaveLength(64);
    expect(publicationManifest.manifest.sourceSnapshotSha256).toBe(publicationManifest.sourceSnapshotEvidence.snapshotSha256);
    expect(publicationManifest.claimEvidence.claimReadinessStatus).toBe(snapshot.report.claimReadinessGate.status);
    expect(publicationManifest.claimEvidence.codingReliability).toBe(snapshot.report.codingReliabilityGate.status);
    expect(publicationManifest.claimEvidence.humanReview).toBe(snapshot.report.humanReview.status);
    expect(publicationManifest.sourceSnapshotEvidence.schemaVersion).toBe("sena-publication-source-snapshot/v1");
    expect(publicationManifest.sourceSnapshotEvidence.snapshotSchemaVersion).toBe("sena-project-snapshot/v1");
    expect(publicationManifest.sourceSnapshotEvidence.snapshotSha256).toHaveLength(64);
    expect(publicationManifest.sourceSnapshotEvidence.reportSha256).toHaveLength(64);
    expect(publicationManifest.sourceSnapshotEvidence.dataGovernance.schemaVersion).toBe("sena-data-governance-metadata/v1");
    expect(publicationManifest.sourceSnapshotEvidence.dataGovernance.status).toBe(snapshot.report.dataGovernance.status);
    expect(publicationManifest.sourceSnapshotEvidence.datasetCounts).toEqual(snapshot.source.sourceDatasetCounts);
    expect(publicationManifest.sourceSnapshotEvidence.buildOptions).toEqual(snapshot.reproducibility.buildOptions);
    expect(publicationManifest.sourceSnapshotEvidence.matrixFingerprints.map((entry) => entry.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(publicationManifest.sourceSnapshotEvidence.matrixFingerprints.every((entry) => entry.sha256.length === 64)).toBe(true);
    expect(publicationManifest.artifactManifest).toEqual(publicationManifest.artifacts.map(({ bodyBase64: _bodyBase64, ...artifact }) => artifact));
    expect(publicationManifest.verificationCertificate.schemaVersion).toBe("sena-publication-verification-certificate/v1");
    expect(publicationManifest.verificationCertificate.status).toBe("verified");
    expect(publicationManifest.verificationCertificate.artifactChecks).toHaveLength(6);
    expect(publicationManifest.verificationCertificate.artifactChecks.every((check) => check.status === "verified" && check.sha256.length === 64)).toBe(true);
    expect(publicationManifest.verificationCertificate.gateEvidence).toEqual({
      claimReadinessStatus: snapshot.report.claimReadinessGate.status,
      codingReliabilityStatus: snapshot.report.codingReliabilityGate.status,
      humanReviewStatus: snapshot.report.humanReview.status,
      completenessStatus: snapshot.report.completenessAudit.status
    });
    expect(publicationManifest.artifacts.map((artifact) => artifact.format)).toEqual(["svg", "png", "html", "xlsx", "docx", "pdf"]);
    expect(publicationManifest.artifacts.every((artifact) => artifact.sha256.length === 64 && artifact.bytes > 0 && artifact.bodyBase64.length > 0)).toBe(true);
    expect(Buffer.from(publicationManifest.artifacts.find((artifact) => artifact.format === "png")?.bodyBase64 ?? "", "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    delete process.env.SENA_SSO_GOOGLE_CLIENT_ID;
    delete process.env.SENA_SSO_GOOGLE_CLIENT_SECRET;
    delete process.env.SENA_SSO_GOOGLE_ISSUER;
    delete process.env.SENA_SSO_GOOGLE_AUTHORIZATION_URL;
    delete process.env.SENA_SSO_GOOGLE_TOKEN_URL;
    delete process.env.SENA_SSO_GOOGLE_USERINFO_URL;
    delete process.env.SENA_SSO_GOOGLE_JWKS_URL;
    delete process.env.SENA_APP_URL;
    delete process.env.SENA_MFA_ENCRYPTION_KEY;
    delete process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES;
    delete process.env.SENA_AUTH_LOCKOUT_WINDOW_MINUTES;
    delete process.env.SENA_AUTH_LOCKOUT_MINUTES;
    delete process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN;
    delete process.env.SENA_NOTIFICATION_WEBHOOK_URL;
    delete process.env.SENA_NOTIFICATION_WEBHOOK_SECRET;
    delete process.env.SENA_NOTIFICATION_WEBHOOK_MAX_ATTEMPTS;
    delete process.env.SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_EMAIL_WEBHOOK_URL;
    delete process.env.SENA_EMAIL_WEBHOOK_SECRET;
    delete process.env.SENA_EMAIL_WEBHOOK_MAX_ATTEMPTS;
    delete process.env.SENA_EMAIL_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_BACKUP_WEBHOOK_URL;
    delete process.env.SENA_BACKUP_WEBHOOK_SECRET;
    delete process.env.SENA_BACKUP_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_DATABASE_SYNC_WEBHOOK_URL;
    delete process.env.SENA_DATABASE_SYNC_WEBHOOK_SECRET;
    delete process.env.SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_OBJECT_STORAGE_WEBHOOK_URL;
    delete process.env.SENA_OBJECT_STORAGE_WEBHOOK_SECRET;
    delete process.env.SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_URL;
    delete process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET;
    delete process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_MAX_ATTEMPTS;
    delete process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_PROVISIONING_TOKEN;
    delete process.env.SENA_OPS_TOKEN;
    delete process.env.SENA_AUDIT_RETENTION_DAYS;
    delete process.env.SENA_AUDIT_WEBHOOK_URL;
    delete process.env.SENA_AUDIT_WEBHOOK_SECRET;
    delete process.env.SENA_AUDIT_WEBHOOK_MAX_ATTEMPTS;
    delete process.env.SENA_AUDIT_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_ALERTING_OWNER;
    delete process.env.SENA_ALERTING_CHANNEL;
    delete process.env.SENA_ALERTING_RUNBOOK_URL;
    delete process.env.SENA_ALERT_WEBHOOK_URL;
    delete process.env.SENA_ALERT_WEBHOOK_SECRET;
    delete process.env.SENA_ALERT_WEBHOOK_TIMEOUT_MS;
    delete process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED;
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
  }, 180_000);
});
