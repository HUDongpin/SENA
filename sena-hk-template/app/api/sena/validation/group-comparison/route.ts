import { NextResponse } from "next/server";
import {
  createEnterpriseValidationRun,
  listEnterpriseValidationRuns,
  reviewEnterpriseValidationRun,
  type SenaEnterpriseValidationParityEvidenceInput
} from "@/lib/sena/enterprise/reliability-validation";
import {
  getEnterpriseProject
} from "@/lib/sena/enterprise/team-project";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  type SenaGroupComparisonMetric,
  type SenaGroupComparisonSpec
} from "@/lib/sena/inference";
import { importSenaJsonContract } from "@/lib/sena/import";
import { importSenaProjectSnapshot } from "@/lib/sena/snapshot";
import type { SenaBuildOptions } from "@/lib/sena/types";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type ValidationRunHeaderSource = {
  id: string;
  status: string;
  projectId?: string;
  comparisonCount?: number;
  pTwoSided: number;
  minHolmAdjustedP?: number;
  preregistrationPlan?: { planHash?: string };
  parityEvidence?: {
    status: string;
    validationRunHash: string;
    formalInference: { status: string };
  };
};

const metrics = new Set<SenaGroupComparisonMetric>([
  "bridgeScore",
  "epistemicContribution",
  "epistemicDiversity",
  "socialStrength",
  "socialDegree",
  "conceptBrokerage",
  "alignment"
]);

function metricValue(value: unknown): SenaGroupComparisonMetric {
  return metrics.has(value as SenaGroupComparisonMetric) ? value as SenaGroupComparisonMetric : "bridgeScore";
}

function parseMetricList(value: unknown, fallback: unknown) {
  const candidates = Array.isArray(value) ? value : [fallback];
  const parsed = candidates
    .map((candidate) => metricValue(candidate))
    .filter((metric, index, list) => list.indexOf(metric) === index);
  return parsed.length > 0 ? parsed : ["bridgeScore" as SenaGroupComparisonMetric];
}

function parseComparisonSpecs(body: Record<string, unknown>): SenaGroupComparisonSpec[] {
  if (Array.isArray(body.comparisons)) {
    return body.comparisons
      .filter((comparison): comparison is Record<string, unknown> => typeof comparison === "object" && comparison !== null && !Array.isArray(comparison))
      .map((comparison): SenaGroupComparisonSpec => ({
        groupField: comparison.groupField === "role" ? "role" : "group",
        groupA: String(comparison.groupA ?? ""),
        groupB: String(comparison.groupB ?? ""),
        metric: metricValue(comparison.metric)
      }))
      .filter((comparison) => comparison.groupA && comparison.groupB && comparison.groupA !== comparison.groupB)
      .slice(0, 40);
  }

  const groupA = String(body.groupA ?? "");
  const groupB = String(body.groupB ?? "");
  const groupField = body.groupField === "role" ? "role" : "group";
  return parseMetricList(body.metrics, body.metric).map((metric) => ({
    groupField,
    groupA,
    groupB,
    metric
  }));
}

function parseParityEvidence(value: unknown): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    walkthroughDatasetLabel: record.walkthroughDatasetLabel ? String(record.walkthroughDatasetLabel) : undefined,
    walkthroughDatasetHash: record.walkthroughDatasetHash ? String(record.walkthroughDatasetHash) : undefined,
    expertReviewRequired: typeof record.expertReviewRequired === "boolean" ? record.expertReviewRequired : undefined,
    studySpecificInferenceReference: record.studySpecificInferenceReference ? String(record.studySpecificInferenceReference) : undefined,
    notes: Array.isArray(record.notes) ? record.notes.map((note) => String(note)).slice(0, 20) : undefined,
    runtimeParityIds: Array.isArray(record.runtimeParityIds) ? record.runtimeParityIds.map((id) => String(id)).slice(0, 20) : undefined
  };
}

function validationRunHeaders(run: ValidationRunHeaderSource) {
  return {
    "x-sena-validation-run-id": run.id,
    "x-sena-validation-status": run.status,
    ...(run.projectId ? { "x-sena-project-id": run.projectId } : {}),
    "x-sena-validation-comparison-count": String(run.comparisonCount ?? 1),
    "x-sena-validation-p-two-sided": String(run.pTwoSided),
    ...(run.minHolmAdjustedP !== undefined ? { "x-sena-validation-min-holm-p": String(run.minHolmAdjustedP) } : {}),
    ...(run.preregistrationPlan?.planHash ? { "x-sena-validation-preregistration-sha256": run.preregistrationPlan.planHash } : {}),
    ...(run.parityEvidence?.status ? { "x-sena-validation-parity-status": run.parityEvidence.status } : {}),
    ...(run.parityEvidence?.validationRunHash ? { "x-sena-validation-parity-sha256": run.parityEvidence.validationRunHash } : {}),
    ...(run.parityEvidence?.formalInference.status ? { "x-sena-formal-inference-status": run.parityEvidence.formalInference.status } : {})
  };
}

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    return NextResponse.json({
      schemaVersion: "sena-validation-run-list/v1",
      validationRuns: listEnterpriseValidationRuns(context, {
        teamId: url.searchParams.get("teamId") || undefined,
        projectId: url.searchParams.get("projectId") || undefined
      })
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const projectId = body.projectId ? String(body.projectId) : undefined;
    const project = projectId ? getEnterpriseProject(context, projectId) : null;
    const snapshot = body.snapshot ? importSenaProjectSnapshot(body.snapshot) : project?.snapshot ?? null;
    const dataset = snapshot?.dataset ?? importSenaJsonContract(body.dataset).dataset;
    const comparisons = parseComparisonSpecs(body);
    const buildOptions = snapshot?.reproducibility.buildOptions ?? (
      typeof body.buildOptions === "object" && body.buildOptions !== null && !Array.isArray(body.buildOptions)
        ? body.buildOptions as Partial<SenaBuildOptions>
        : undefined
    );
    const result = comparisons.length <= 1 && body.suite !== true
      ? buildSenaGroupComparison({
        dataset,
        buildOptions,
        groupField: comparisons[0]?.groupField ?? (body.groupField === "role" ? "role" : "group"),
        groupA: comparisons[0]?.groupA ?? String(body.groupA ?? ""),
        groupB: comparisons[0]?.groupB ?? String(body.groupB ?? ""),
        metric: comparisons[0]?.metric ?? metricValue(body.metric),
        iterations: Number(body.iterations ?? 1000),
        seed: Number(body.seed ?? 20260611),
        bootstrapIterations: Number(body.bootstrapIterations ?? body.iterations ?? 1000)
      })
      : buildSenaGroupComparisonSuite({
        dataset,
        buildOptions,
        comparisons,
        defaultGroupField: body.groupField === "role" ? "role" : "group",
        defaultMetric: metricValue(body.metric),
        iterations: Number(body.iterations ?? 1000),
        seed: Number(body.seed ?? 20260611),
        bootstrapIterations: Number(body.bootstrapIterations ?? body.iterations ?? 1000),
        alpha: Number(body.alpha ?? 0.05)
      });
    const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
    const validationRun = createEnterpriseValidationRun(context, {
      teamId,
      projectId,
      preregistrationNote: body.preregistrationNote ? String(body.preregistrationNote) : undefined,
      methodNote: body.methodNote ? String(body.methodNote) : undefined,
      parityEvidence: parseParityEvidence(body.parityEvidence),
      result
    });
    return NextResponse.json({
      ...result,
      validationRun
    }, {
      headers: validationRunHeaders(validationRun)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const status = body.status === "approved" ? "approved" : "rejected";
    const validationRun = reviewEnterpriseValidationRun(context, String(body.runId ?? ""), {
      status,
      notes: body.notes ? String(body.notes) : undefined
    });
    return NextResponse.json({
      schemaVersion: "sena-validation-run-review/v1",
      validationRun
    }, {
      headers: validationRunHeaders(validationRun)
    });
  } catch (error) {
    return jsonError(error);
  }
}
