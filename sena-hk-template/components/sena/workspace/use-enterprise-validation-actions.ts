"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import type { SenaBuildOptions, SenaDataset, SenaProjectSnapshot } from "@/lib/sena/types";
import {
  reviewEnterpriseValidationRunAction,
  runEnterpriseValidationComparisonAction
} from "./enterprise-actions";
import type {
  LocalEnterpriseValidationResult
} from "./enterprise-contracts";
import { enterpriseValidationMetrics } from "./enterprise-options";
import type {
  SenaGroupComparisonMetric,
  SenaGroupComparisonResult,
  SenaGroupComparisonValidationResult
} from "./analysis-runtime";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type ValidationMode = "single" | "suite";

export type EnterpriseValidationActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  activeEnterpriseProjectId: string;
  dataset: SenaDataset;
  buildOptions: Partial<SenaBuildOptions>;
  validationGroupField: "group" | "role";
  selectedValidationGroupA: string;
  selectedValidationGroupB: string;
  validationMetric: SenaGroupComparisonMetric;
  validationPreregistrationNote: string;
  validationMethodNote: string;
  validationStudySpecificInferenceReference: string;
  validationReviewNote: string;
  latestEnterpriseValidationRunId?: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  buildCurrentProjectSnapshot: () => SenaProjectSnapshot;
  refreshEnterpriseCollaboration: (projectId?: string) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setLocalEnterpriseValidationResult: StateSetter<LocalEnterpriseValidationResult | null>;
  setValidationReviewNote: StateSetter<string>;
};

function formatValidationNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function primaryGroupComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result.primary : result;
}

function validationResultSummary(result: SenaGroupComparisonValidationResult) {
  const primary = primaryGroupComparison(result);
  return `${primary.metric} ${primary.groupA} vs ${primary.groupB}, p=${formatValidationNumber(primary.permutation.pTwoSided, 4)}`;
}

function validationSuiteSummary(result: SenaGroupComparisonValidationResult) {
  if (result.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite) return null;
  const minimumAdjustedP = result.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1);
  return `Holm suite ${result.comparisonCount} comparisons, ${result.significantHolmCount} significant at alpha ${formatValidationNumber(result.alpha, 3)}, min adjusted p=${formatValidationNumber(minimumAdjustedP, 4)}`;
}

function validationComparisonPlanRow(result: SenaGroupComparisonResult) {
  return {
    metric: result.metric,
    groupField: result.groupField,
    groupA: result.groupA,
    groupB: result.groupB
  };
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

async function sha256Text(text: string) {
  const cryptoSubtle = globalThis.crypto?.subtle;
  if (!cryptoSubtle) {
    throw new Error("Validation preregistration plan export requires browser SHA-256 support.");
  }
  const digest = await cryptoSubtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildLocalValidationPreregistrationPlan(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationNote: string;
  methodNote: string;
}): Promise<LocalEnterpriseValidationResult["preregistrationPlan"]> {
  const primary = primaryGroupComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? input.result : null;
  const analysis: NonNullable<LocalEnterpriseValidationResult["preregistrationPlan"]>["analysis"] = suite ? "holm-suite" : "single-comparison";
  const comparisons = suite
    ? suite.comparisons.map(validationComparisonPlanRow)
    : [validationComparisonPlanRow(primary)];
  const parameters: NonNullable<LocalEnterpriseValidationResult["preregistrationPlan"]>["parameters"] = {
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    seed: primary.permutation.seed,
    ...(suite ? { alpha: suite.alpha, correction: suite.correction } : {})
  };
  const protocolNote = input.preregistrationNote.trim();
  const methodNote = input.methodNote.trim();
  const [protocolNoteHash, methodNoteHash] = await Promise.all([
    sha256Text(protocolNote),
    sha256Text(methodNote)
  ]);
  const planBody: Omit<NonNullable<LocalEnterpriseValidationResult["preregistrationPlan"]>, "planHash"> = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationPreregistrationPlan,
    hashAlgorithm: "sha256",
    analysis,
    primary: validationComparisonPlanRow(primary),
    comparisons,
    parameters,
    protocolNoteHash,
    methodNoteHash,
    guardrail: primary.guardrail,
    evidence: [
      `protocolNote=${protocolNote ? "present" : "missing"}`,
      `methodNote=${methodNote ? "present" : "missing"}`,
      `analysis=${analysis}`,
      `comparisons=${comparisons.length}`,
      ...(suite ? [`correction=${suite.correction}`] : []),
      `permutationIterations=${parameters.permutationIterations}`,
      `bootstrapIterations=${parameters.bootstrapIterations}`,
      `seed=${parameters.seed}`
    ]
  };
  return {
    ...planBody,
    planHash: await sha256Text(stableJsonStringify(planBody))
  };
}

export function useEnterpriseValidationActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  activeEnterpriseProjectId,
  dataset,
  buildOptions,
  validationGroupField,
  selectedValidationGroupA,
  selectedValidationGroupB,
  validationMetric,
  validationPreregistrationNote,
  validationMethodNote,
  validationStudySpecificInferenceReference,
  validationReviewNote,
  latestEnterpriseValidationRunId,
  enterpriseJsonHeaders,
  buildCurrentProjectSnapshot,
  refreshEnterpriseCollaboration,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setLocalEnterpriseValidationResult,
  setValidationReviewNote
}: EnterpriseValidationActionsOptions) {
  const runValidationComparisonLocally = useCallback(async (mode: ValidationMode = "single") => {
    setEnterpriseBusy(true);
    try {
      const { buildSenaGroupComparison, buildSenaGroupComparisonSuite } = await import("@/lib/sena/inference");
      const result = mode === "suite"
        ? buildSenaGroupComparisonSuite({
          dataset,
          buildOptions,
          comparisons: enterpriseValidationMetrics.map((metric) => ({
            groupField: validationGroupField,
            groupA: selectedValidationGroupA,
            groupB: selectedValidationGroupB,
            metric: metric.value
          })),
          iterations: 1000,
          seed: 20260611,
          bootstrapIterations: 1000,
          alpha: 0.05
        })
        : buildSenaGroupComparison({
          dataset,
          buildOptions,
          groupField: validationGroupField,
          groupA: selectedValidationGroupA,
          groupB: selectedValidationGroupB,
          metric: validationMetric,
          iterations: 1000,
          seed: 20260611,
          bootstrapIterations: 1000
        });
      const preregistrationPlan = await buildLocalValidationPreregistrationPlan({
        result,
        preregistrationNote: validationPreregistrationNote,
        methodNote: validationMethodNote
      });
      const localRun: LocalEnterpriseValidationResult = {
        schemaVersion: SENA_SCHEMA_VERSIONS.localValidationRun,
        generatedAt: new Date().toISOString(),
        result,
        preregistrationNote: validationPreregistrationNote,
        methodNote: validationMethodNote,
        studySpecificInferenceReference: validationStudySpecificInferenceReference.trim(),
        preregistrationPlan
      };
      setLocalEnterpriseValidationResult(localRun);
      setEnterpriseMessage(`Local group-comparison validation calculated without sign-in: ${validationSuiteSummary(result) ?? validationResultSummary(result)}. Sign in to persist validation runs, review status, and claim-package evidence.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Local group-comparison validation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    buildOptions,
    dataset,
    selectedValidationGroupA,
    selectedValidationGroupB,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setLocalEnterpriseValidationResult,
    validationGroupField,
    validationMethodNote,
    validationMetric,
    validationPreregistrationNote,
    validationStudySpecificInferenceReference
  ]);

  const runEnterpriseValidationComparison = useCallback(async (mode: ValidationMode = "single") => {
    if (!selectedValidationGroupA || !selectedValidationGroupB || selectedValidationGroupA === selectedValidationGroupB) {
      setEnterpriseMessage("Choose two different groups or roles before running validation.");
      return;
    }
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      await runValidationComparisonLocally(mode === "suite" ? "suite" : "single");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const studySpecificInferenceReference = validationStudySpecificInferenceReference.trim();
      const payload = await runEnterpriseValidationComparisonAction(
        {
          teamId: activeEnterpriseTeamId,
          projectId: activeEnterpriseProjectId || undefined,
          snapshot: buildCurrentProjectSnapshot(),
          groupField: validationGroupField,
          groupA: selectedValidationGroupA,
          groupB: selectedValidationGroupB,
          suite: mode === "suite",
          metrics: mode === "suite" ? enterpriseValidationMetrics.map((metric) => metric.value) : undefined,
          metric: mode === "suite" ? undefined : validationMetric,
          iterations: 1000,
          seed: 20260611,
          preregistrationNote: validationPreregistrationNote,
          methodNote: validationMethodNote,
          parityEvidence: studySpecificInferenceReference ? {
            studySpecificInferenceReference
          } : undefined
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setLocalEnterpriseValidationResult(null);
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      const suiteSummary = payload.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
        ? `Holm suite ${payload.comparisonCount} comparisons, min adjusted p=${payload.validationRun?.minHolmAdjustedP ?? payload.primary?.holmAdjustedP}.`
        : `${payload.metric} ${payload.groupA} vs ${payload.groupB}, p=${payload.permutation.pTwoSided}.`;
      setEnterpriseMessage(`Validation run ${payload.validationRun?.id ?? "local"} saved: ${suiteSummary}`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Group-comparison validation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    activeEnterpriseTeamId,
    buildCurrentProjectSnapshot,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    refreshEnterpriseCollaboration,
    runValidationComparisonLocally,
    selectedValidationGroupA,
    selectedValidationGroupB,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setLocalEnterpriseValidationResult,
    validationGroupField,
    validationMethodNote,
    validationMetric,
    validationPreregistrationNote,
    validationStudySpecificInferenceReference
  ]);

  const reviewEnterpriseValidationRun = useCallback(async (status: "approved" | "rejected") => {
    if (!latestEnterpriseValidationRunId) return;
    setEnterpriseBusy(true);
    try {
      const payload = await reviewEnterpriseValidationRunAction(
        {
          runId: latestEnterpriseValidationRunId,
          status,
          notes: validationReviewNote
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setValidationReviewNote("");
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Validation run ${payload.validationRun.id} marked ${payload.validationRun.status}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Validation review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    latestEnterpriseValidationRunId,
    refreshEnterpriseCollaboration,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setValidationReviewNote,
    validationReviewNote
  ]);

  return {
    runEnterpriseValidationComparison,
    reviewEnterpriseValidationRun
  };
}
