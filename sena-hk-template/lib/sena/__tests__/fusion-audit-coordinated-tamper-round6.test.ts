import { describe, expect, it } from "vitest";
import { normalizeSenaFusionMathAudit } from "../fusion-math";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";
import { importSenaProjectSnapshot } from "../snapshot";
import { importSenaReport, importSenaRuntimeBundle } from "../statistical-leaf-read";
import type { SenaFusionMathAudit, SenaMatrices, SenaReviewPacket } from "../types";

function packet(): SenaReviewPacket {
  return buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z"
  });
}

function makeNegative(matrices: SenaMatrices) {
  matrices.S.raw[0][0] = -1;
}

function forgeVerifiedAudit(value: SenaFusionMathAudit): SenaFusionMathAudit {
  const audit = structuredClone(value);
  audit.items = audit.items.map((item) => ({
    ...item,
    status: "pass" as const,
    detail: item.id === "nonnegative-values"
      ? item.detail.map((entry) => entry.replace("contains invalid or negative values", "nonnegative"))
      : item.detail
  }));
  audit.passed = 8;
  audit.reviewNeeded = 0;
  audit.status = "verified";
  const social = audit.matrixFingerprints.find((entry) => entry.id === "S");
  if (!social) throw new Error("test fixture requires an S fingerprint");
  social.shape = "999x999";
  social.totals.raw = -999;
  social.nonZero.raw = -1;
  return audit;
}

function replaceAuditCopies(value: unknown) {
  if (typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    value.forEach(replaceAuditCopies);
    return;
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion === "sena-fusion-math-audit/v2" &&
    Array.isArray(record.items) &&
    Array.isArray(record.matrixFingerprints)
  ) {
    Object.assign(record, forgeVerifiedAudit(record as SenaFusionMathAudit));
    return;
  }
  Object.values(record).forEach(replaceAuditCopies);
}

describe("fusion audit coordinated tamper resistance", () => {
  it("rejects an impossible standalone current-v2 fingerprint even when all eight checks say pass", () => {
    const forged = forgeVerifiedAudit(packet().contents.fusionMathAudit);

    expect(() => normalizeSenaFusionMathAudit(forged)).toThrow(/fusion math audit|fingerprint|shape|nonzero|total/i);
  });

  it("recomputes report audit semantics from the report matrices", () => {
    const report = structuredClone(packet().contents.reportJson);
    makeNegative(report.matrices);

    expect(() => importSenaReport(JSON.stringify(report))).toThrow(/fusion math audit|matrix|semantic|nonnegative/i);
  });

  it("recomputes runtime audit semantics from the runtime matrices", () => {
    const runtime = structuredClone(packet().contents.runtimeBundle);
    makeNegative(runtime.runtimes.sena.matrices);

    expect(() => importSenaRuntimeBundle(runtime)).toThrow(/fusion math audit|matrix|semantic|nonnegative/i);
  });

  it("recomputes snapshot audit semantics from the snapshot analysis matrices", () => {
    const snapshot = structuredClone(packet().contents.projectSnapshot);
    makeNegative(snapshot.analysis.matrices);

    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/fusion math audit|matrix|semantic|nonnegative/i);
  });

  it("rejects coordinated impossible proof metadata at the report, runtime, and snapshot readers", () => {
    const base = packet();
    const report = structuredClone(base.contents.reportJson);
    report.fusionMathAudit = forgeVerifiedAudit(report.fusionMathAudit);
    makeNegative(report.matrices);
    expect(() => importSenaReport(report)).toThrow(/fusion math audit|fingerprint|shape|nonzero|total/i);

    const runtime = structuredClone(base.contents.runtimeBundle);
    runtime.fusionMathAudit = forgeVerifiedAudit(runtime.fusionMathAudit);
    runtime.report.fusionMathAudit = forgeVerifiedAudit(runtime.report.fusionMathAudit);
    makeNegative(runtime.runtimes.sena.matrices);
    makeNegative(runtime.report.matrices);
    expect(() => importSenaRuntimeBundle(runtime)).toThrow(/fusion math audit|fingerprint|shape|nonzero|total/i);

    const snapshot = structuredClone(base.contents.projectSnapshot);
    snapshot.report.fusionMathAudit = forgeVerifiedAudit(snapshot.report.fusionMathAudit);
    makeNegative(snapshot.analysis.matrices);
    makeNegative(snapshot.report.matrices);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/fusion math audit|fingerprint|shape|nonzero|total/i);
  });

  it("rejects a review packet whose matrix and every duplicated audit surface are forged together", () => {
    const forged = structuredClone(packet());
    replaceAuditCopies(forged);
    makeNegative(forged.contents.reportJson.matrices);
    makeNegative(forged.contents.runtimeBundle.runtimes.sena.matrices);
    makeNegative(forged.contents.runtimeBundle.report.matrices);
    makeNegative(forged.contents.projectSnapshot.analysis.matrices);
    makeNegative(forged.contents.projectSnapshot.report.matrices);

    expect(() => importSenaReviewPacket(forged)).toThrow(/fusion math audit|fingerprint|shape|nonzero|total/i);
  });
});
