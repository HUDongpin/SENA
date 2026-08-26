import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket } from "../review-packet";
import {
  isSenaReport,
  isSenaRuntimeBundle,
  normalizeSenaReportStatisticalLeaves,
  normalizeSenaRuntimeBundleStatisticalLeaves
} from "../statistical-leaf-read";

function currentHolders() {
  const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
  return {
    report: packet.contents.reportJson,
    runtime: packet.contents.runtimeBundle
  };
}

const reportDeletions: Array<[string, (report: Record<string, any>) => void]> = [
  ["title", (report) => delete report.title],
  ["generatedAt", (report) => delete report.generatedAt],
  ["parameters.datasetCounts", (report) => delete report.parameters.datasetCounts],
  ["runtimeProvenance.senaModel", (report) => delete report.runtimeProvenance.senaModel],
  ["figures", (report) => delete report.figures],
  ["figures.fusionGraph.nodes", (report) => delete report.figures.fusionGraph.nodes],
  ["validation", (report) => delete report.validation],
  ["humanReview.status", (report) => delete report.humanReview.status]
];

const runtimeDeletions: Array<[string, (runtime: Record<string, any>) => void]> = [
  ["title", (runtime) => delete runtime.title],
  ["generatedAt", (runtime) => delete runtime.generatedAt],
  ["artifactEvidence", (runtime) => delete runtime.artifactEvidence],
  ["runtimes.ena.manifest", (runtime) => delete runtime.runtimes.ena.manifest],
  ["runtimes.sna.socialMatrix", (runtime) => delete runtime.runtimes.sna.socialMatrix],
  ["developmentPlan.currentGate", (runtime) => delete runtime.developmentPlan.currentGate],
  ["demoVerification.summary", (runtime) => delete runtime.demoVerification.summary],
  ["report.title", (runtime) => delete runtime.report.title]
];

describe("Round11 full report and runtime holder guards", () => {
  it("accepts complete current report and runtime holders", () => {
    const { report, runtime } = currentHolders();
    expect(isSenaReport(report)).toBe(true);
    expect(isSenaRuntimeBundle(runtime)).toBe(true);
    expect(normalizeSenaReportStatisticalLeaves(report).report.title).toBe(report.title);
    expect(normalizeSenaRuntimeBundleStatisticalLeaves(runtime).runtimeBundle.title).toBe(runtime.title);
  });

  it.each(reportDeletions)("rejects a report missing required %s", (_path, remove) => {
    const report = structuredClone(currentHolders().report) as unknown as Record<string, any>;
    remove(report);

    expect(isSenaReport(report)).toBe(false);
    expect(() => normalizeSenaReportStatisticalLeaves(report)).toThrow(/report|required|must|structure/i);
  });

  it.each(runtimeDeletions)("rejects a runtime bundle missing required %s", (_path, remove) => {
    const runtime = structuredClone(currentHolders().runtime) as unknown as Record<string, any>;
    remove(runtime);

    expect(isSenaRuntimeBundle(runtime)).toBe(false);
    expect(() => normalizeSenaRuntimeBundleStatisticalLeaves(runtime)).toThrow(/runtime|required|must|structure|report/i);
  });
});
