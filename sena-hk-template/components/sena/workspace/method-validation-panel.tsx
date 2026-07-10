import {
  Activity,
  Binary,
  CheckCircle2,
  Info,
  SlidersHorizontal,
  UsersRound
} from "lucide-react";
import type { SenaValidation } from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

function formatValidationNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function MethodValidationPanel({ validation }: { validation: SenaValidation }) {
  const layerVariants = validation.sensitivity.layerWeights.variants;
  const normalizationVariants = validation.sensitivity.normalization.variants;
  const community = validation.stability.community;
  const temporal = validation.stability.temporal;
  const nullModels = validation.nullModels;
  const metricSources = Array.from(new Set(validation.metricProvenance.map((metric) => metric.source)));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCell label="Metric sources" value={validation.metricProvenance.length} />
        <MetricCell label="Weight variants" value={layerVariants.length} />
        <MetricCell label="Normalization variants" value={normalizationVariants.length} />
        <MetricCell label="Null iterations" value={nullModels.permutation.iterations} />
      </div>

      <div
        data-testid="metric-provenance-panel"
        data-visual-role="sena-metric-provenance"
        className="rounded-lg border border-cardBorder/40 bg-background/25 p-3"
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Metric provenance</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              sena-metric-provenance/v1; {metricSources.join(", ")}; parity and interpretation limits are carried into report exports.
            </div>
          </div>
          <Info className="h-4 w-4 shrink-0 text-cyanGlow" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-cardBorder/35 text-muted">
                <th className="px-2 py-2 font-black">Metric</th>
                <th className="px-2 py-2 font-black">Scope</th>
                <th className="px-2 py-2 font-black">Source</th>
                <th className="px-2 py-2 font-black">Parity</th>
                <th className="px-2 py-2 font-black">Limit</th>
              </tr>
            </thead>
            <tbody>
              {validation.metricProvenance.map((metric) => (
                <tr key={metric.id} data-metric-id={metric.id} className="border-t border-cardBorder/20">
                  <td className="whitespace-nowrap px-2 py-2 font-black text-foreground">{metric.label}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-foreground/82">{metric.scope}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-cyanGlow">{metric.source}</td>
                  <td className="min-w-56 px-2 py-2 font-semibold text-foreground/82">{metric.parityStatus}</td>
                  <td className="min-w-64 px-2 py-2 font-semibold text-muted">{metric.interpretationLimit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-foreground">{validation.sensitivity.layerWeights.label}</div>
              <div className="mt-1 text-xs font-semibold text-muted">Fusion totals under alpha, beta, and gamma changes.</div>
            </div>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-cyanGlow" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cardBorder/35 text-muted">
                  <th className="px-2 py-2 font-black">Variant</th>
                  <th className="px-2 py-2 font-black">S</th>
                  <th className="px-2 py-2 font-black">W</th>
                  <th className="px-2 py-2 font-black">B</th>
                  <th className="px-2 py-2 font-black">Delta</th>
                  <th className="px-2 py-2 font-black">Strongest</th>
                </tr>
              </thead>
              <tbody>
                {layerVariants.map((variant) => (
                  <tr key={variant.id} className="border-t border-cardBorder/20">
                    <td className="whitespace-nowrap px-2 py-2 font-black text-foreground">{variant.label}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.fusionLayerTotals.social)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.fusionLayerTotals.concept)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.fusionLayerTotals.bridge)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.fusionTotalDelta)}</td>
                    <td className="min-w-40 px-2 py-2 font-semibold text-muted">{variant.strongestScaledEdge?.label ?? "NA"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-foreground">{validation.sensitivity.normalization.label}</div>
                <div className="mt-1 text-xs font-semibold text-muted">Compare max, Frobenius, and log1p-max scaling.</div>
              </div>
              <Binary className="h-4 w-4 shrink-0 text-cyanGlow" />
            </div>
            <div className="grid gap-2">
              {normalizationVariants.map((variant) => (
                <div key={variant.id} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-black text-foreground">{variant.label}</span>
                  <span className="text-right font-semibold text-muted">Total {formatValidationNumber(variant.fusionLayerTotals.total)}</span>
                  <span className="text-right font-semibold text-muted">Delta {formatValidationNumber(variant.fusionTotalDelta)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-foreground">Community Stability</div>
                <div className="mt-1 text-xs font-semibold text-muted">{community.method}</div>
              </div>
              <UsersRound className="h-4 w-4 shrink-0 text-blue-300" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MetricCell label="Repeat agreement" value={formatValidationNumber(community.deterministicRepeatAgreement)} />
              <MetricCell label="Stable norm." value={community.stableAcrossNormalizations ? "Yes" : "Review"} />
            </div>
            <div className="mt-3 grid gap-2">
              {community.normalizationAgreement.map((entry) => (
                <div key={entry.normalization} className="flex items-center justify-between gap-3 rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs font-semibold text-muted">
                  <span>{entry.normalization}</span>
                  <span>agreement {formatValidationNumber(entry.agreement)}; communities {entry.communityCount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-foreground">Temporal Stability</div>
              <div className="mt-1 text-xs font-semibold text-muted">Coverage and peak signal under stage, moving, and turn windows.</div>
            </div>
            <Activity className="h-4 w-4 shrink-0 text-cyanGlow" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cardBorder/35 text-muted">
                  <th className="px-2 py-2 font-black">Mode</th>
                  <th className="px-2 py-2 font-black">Windows</th>
                  <th className="px-2 py-2 font-black">Segments</th>
                  <th className="px-2 py-2 font-black">Interactions</th>
                  <th className="px-2 py-2 font-black">Peak B</th>
                </tr>
              </thead>
              <tbody>
                {temporal.variants.map((variant) => (
                  <tr key={variant.mode} className="border-t border-cardBorder/20">
                    <td className="whitespace-nowrap px-2 py-2 font-black text-foreground">{variant.mode}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{variant.windowCount}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.segmentCoverage)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.interactionCoverage)}</td>
                    <td className="px-2 py-2 font-semibold text-foreground/82">{formatValidationNumber(variant.maxBridgeIntegration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-foreground">Permutation and Bootstrap Null Models</div>
              <div className="mt-1 text-xs font-semibold text-muted">Target: {nullModels.targetConceptPair.label}</div>
            </div>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-cyanGlow" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MetricCell label="Observed W" value={formatValidationNumber(nullModels.targetConceptPair.observedWeight)} />
            <MetricCell label="p >= obs" value={formatValidationNumber(nullModels.permutation.pValueGreaterOrEqual)} />
            <MetricCell label="Boot lower" value={formatValidationNumber(nullModels.bootstrap.lower)} />
            <MetricCell label="Boot upper" value={formatValidationNumber(nullModels.bootstrap.upper)} />
          </div>
          <div className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-muted">
            {nullModels.notes.map((note) => (
              <div key={note} className="rounded-lg border border-cardBorder/30 bg-background/25 p-2">{note}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="sena-warning-panel rounded-lg p-3 text-xs font-semibold leading-5">
        Validation diagnostics are report gates for local pilots. They document sensitivity, stability, and lightweight null checks, but publication claims still require study design, coding reliability, and human review.
      </div>
    </div>
  );
}
