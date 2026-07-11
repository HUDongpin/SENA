import { Download, Sigma } from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import type {
  SenaGroupComparisonMetric,
  SenaGroupComparisonResult,
  SenaGroupComparisonValidationResult
} from "@/lib/sena/inference";
import type {
  LocalEnterpriseValidationResult,
  LocalValidationPreregistrationPlan
} from "./enterprise-contracts";
import { enterpriseValidationMetrics } from "./enterprise-options";

type ValidationGroupField = "group" | "role";
type ValidationRunMode = "single" | "suite";

export type EnterpriseLocalValidationPanelProps = {
  busy: boolean;
  validationGroupField: ValidationGroupField;
  validationGroupValues: string[];
  selectedValidationGroupA: string;
  selectedValidationGroupB: string;
  validationMetric: SenaGroupComparisonMetric;
  validationPreregistrationNote: string;
  validationMethodNote: string;
  validationStudySpecificInferenceReference: string;
  localEnterpriseValidationResult: LocalEnterpriseValidationResult | null;
  latestValidationResult: SenaGroupComparisonValidationResult | null;
  latestValidationPreregistrationPlan: LocalValidationPreregistrationPlan | null;
  onValidationGroupFieldChange: (value: ValidationGroupField) => void;
  onValidationGroupAChange: (value: string) => void;
  onValidationGroupBChange: (value: string) => void;
  onValidationMetricChange: (value: SenaGroupComparisonMetric) => void;
  onValidationPreregistrationNoteChange: (value: string) => void;
  onValidationMethodNoteChange: (value: string) => void;
  onValidationStudySpecificInferenceReferenceChange: (value: string) => void;
  onRunEnterpriseValidationComparison: (mode?: ValidationRunMode) => unknown | Promise<unknown>;
  onExportLocalValidationResultJson: () => unknown | Promise<unknown>;
  onExportValidationPreregistrationPlanJson: () => unknown | Promise<unknown>;
};

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function primaryGroupComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result.primary : result;
}

function validationResultSummary(result: SenaGroupComparisonValidationResult) {
  const primary = primaryGroupComparison(result);
  return `${primary.metric} ${primary.groupA} vs ${primary.groupB}, p=${formatNumber(primary.permutation.pTwoSided, 4)}`;
}

function validationSuiteSummary(result: SenaGroupComparisonValidationResult) {
  if (result.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite) return null;
  const minimumAdjustedP = result.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1);
  return `Holm suite ${result.comparisonCount} comparisons, ${result.significantHolmCount} significant at alpha ${formatNumber(result.alpha, 3)}, min adjusted p=${formatNumber(minimumAdjustedP, 4)}`;
}

export function EnterpriseLocalValidationPanel({
  busy,
  validationGroupField,
  validationGroupValues,
  selectedValidationGroupA,
  selectedValidationGroupB,
  validationMetric,
  validationPreregistrationNote,
  validationMethodNote,
  validationStudySpecificInferenceReference,
  localEnterpriseValidationResult,
  latestValidationResult,
  latestValidationPreregistrationPlan,
  onValidationGroupFieldChange,
  onValidationGroupAChange,
  onValidationGroupBChange,
  onValidationMetricChange,
  onValidationPreregistrationNoteChange,
  onValidationMethodNoteChange,
  onValidationStudySpecificInferenceReferenceChange,
  onRunEnterpriseValidationComparison,
  onExportLocalValidationResultJson,
  onExportValidationPreregistrationPlanJson
}: EnterpriseLocalValidationPanelProps) {
  const canRunValidation = !busy && validationGroupValues.length >= 2;
  const suiteSummary = localEnterpriseValidationResult ? validationSuiteSummary(localEnterpriseValidationResult.result) : null;

  return (
    <div data-testid="local-validation-controls" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
      <div className="text-xs font-black uppercase text-muted">Group-comparison validation</div>
      <div className="grid gap-2">
        <select
          value={validationGroupField}
          onChange={(event) => onValidationGroupFieldChange(event.currentTarget.value as ValidationGroupField)}
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
        >
          <option value="group">Group</option>
          <option value="role">Role</option>
        </select>
        <select
          value={selectedValidationGroupA}
          onChange={(event) => onValidationGroupAChange(event.currentTarget.value)}
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
        >
          {validationGroupValues.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select
          value={selectedValidationGroupB}
          onChange={(event) => onValidationGroupBChange(event.currentTarget.value)}
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
        >
          {validationGroupValues.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select
          value={validationMetric}
          onChange={(event) => onValidationMetricChange(event.currentTarget.value as SenaGroupComparisonMetric)}
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
        >
          {enterpriseValidationMetrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
        </select>
        <button type="button" onClick={() => void onRunEnterpriseValidationComparison()} disabled={!canRunValidation} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Sigma className="h-4 w-4" /> Run
        </button>
        <button
          type="button"
          data-testid="run-validation-suite"
          onClick={() => void onRunEnterpriseValidationComparison("suite")}
          disabled={!canRunValidation}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <Sigma className="h-4 w-4" /> Run Holm suite
        </button>
        <button type="button" data-testid="export-local-validation-result" onClick={() => void onExportLocalValidationResultJson()} disabled={!latestValidationResult} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Download className="h-4 w-4" /> Export validation
        </button>
        <button type="button" data-testid="export-validation-preregistration-plan" onClick={() => void onExportValidationPreregistrationPlanJson()} disabled={!latestValidationPreregistrationPlan} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Download className="h-4 w-4" /> Export plan
        </button>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <input
          value={validationPreregistrationNote}
          onChange={(event) => onValidationPreregistrationNoteChange(event.currentTarget.value)}
          placeholder="Preregistration or protocol note"
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
        />
        <input
          value={validationMethodNote}
          onChange={(event) => onValidationMethodNoteChange(event.currentTarget.value)}
          placeholder="Method note for reviewer"
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
        />
        <input
          data-testid="enterprise-validation-inference-reference-input"
          value={validationStudySpecificInferenceReference}
          onChange={(event) => onValidationStudySpecificInferenceReferenceChange(event.currentTarget.value)}
          placeholder="Study-specific inferential model or preregistration reference"
          className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow lg:col-span-2"
        />
      </div>
      {localEnterpriseValidationResult && (
        <div data-testid="local-validation-result" className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-2 text-xs font-semibold leading-5 text-muted">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyanGlow">
            <Sigma className="h-3.5 w-3.5" />
            <span>{localEnterpriseValidationResult.schemaVersion}</span>
            <span>{localEnterpriseValidationResult.result.schemaVersion}</span>
          </div>
          <div>
            Local validation: {validationResultSummary(localEnterpriseValidationResult.result)}
          </div>
          {suiteSummary && (
            <div data-testid="local-validation-suite-summary" className="rounded-md border border-cyanGlow/25 bg-background/35 px-2 py-1 text-cyanGlow">
              {suiteSummary}
            </div>
          )}
          <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
            Guardrail: {primaryGroupComparison(localEnterpriseValidationResult.result).guardrail}
          </div>
          {localEnterpriseValidationResult.preregistrationPlan && (
            <div data-testid="local-validation-preregistration-plan" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
              Plan hash: {localEnterpriseValidationResult.preregistrationPlan.planHash.slice(0, 12)} · {localEnterpriseValidationResult.preregistrationPlan.schemaVersion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
