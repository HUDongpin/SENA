import type { ElementType } from "react";
import {
  Eye,
  EyeOff,
  SlidersHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaLayer,
  SenaLayoutMode,
  SenaNormalization
} from "./analysis-runtime";
import {
  Panel,
  Slider
} from "./workspace-primitives";

export type ModelBuilderLayerCopy = Record<SenaLayer, {
  label: string;
  detail: string;
  className: string;
}>;

export type ModelBuilderLayoutOption = {
  value: SenaLayoutMode;
  label: string;
  icon: ElementType;
  note: string;
};

export type ModelBuilderPanelProps = {
  layoutOptions: ModelBuilderLayoutOption[];
  layout: SenaLayoutMode;
  onLayoutChange: (value: SenaLayoutMode) => void;
  layers: Record<SenaLayer, boolean>;
  layerCopy: ModelBuilderLayerCopy;
  onLayerToggle: (layer: SenaLayer) => void;
  alpha: number;
  beta: number;
  gamma: number;
  threshold: number;
  normalization: SenaNormalization;
  onAlphaChange: (value: number) => void;
  onBetaChange: (value: number) => void;
  onGammaChange: (value: number) => void;
  onThresholdChange: (value: number) => void;
  onNormalizationChange: (value: SenaNormalization) => void;
};

export function ModelBuilderPanel({
  layoutOptions,
  layout,
  onLayoutChange,
  layers,
  layerCopy,
  onLayerToggle,
  alpha,
  beta,
  gamma,
  threshold,
  normalization,
  onAlphaChange,
  onBetaChange,
  onGammaChange,
  onThresholdChange,
  onNormalizationChange
}: ModelBuilderPanelProps) {
  return (
    <Panel id="workflow-model" title="Model Builder" icon={SlidersHorizontal} className="p-4">
      <div className="grid gap-4">
        <div className="grid gap-2">
          {layoutOptions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                data-testid={`model-layout-${item.value}`}
                onClick={() => onLayoutChange(item.value)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition",
                  layout === item.value ? "border-cyanGlow/60 bg-cyanGlow/12 text-foreground" : "border-cardBorder/45 bg-background/30 text-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-black">{item.label}</span>
                  <span className="block text-xs font-semibold">{item.note}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2">
          {(["social", "concept", "bridge"] as SenaLayer[]).map((layer) => {
            const Icon = layers[layer] ? Eye : EyeOff;
            return (
              <button
                key={layer}
                type="button"
                data-testid={`model-layer-${layer}-toggle`}
                onClick={() => onLayerToggle(layer)}
                className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-black", layerCopy[layer].className, !layers[layer] && "opacity-50")}
              >
                <span>{layerCopy[layer].label}</span>
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <Slider label="alpha - SNA" value={alpha} testId="alpha-slider" onChange={onAlphaChange} />
        <Slider label="beta - ENA" value={beta} testId="beta-slider" onChange={onBetaChange} />
        <Slider label="gamma - Bridge" value={gamma} testId="gamma-slider" onChange={onGammaChange} />
        <Slider label="Edge threshold" value={threshold} testId="edge-threshold-slider" onChange={onThresholdChange} />

        <label className="grid gap-2 text-sm font-black text-foreground">
          Normalization
          <select
            data-testid="normalization-select"
            value={normalization}
            onChange={(event) => onNormalizationChange(event.currentTarget.value as SenaNormalization)}
            className="h-11 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          >
            <option value="max">Max scaling</option>
            <option value="frobenius">Frobenius scaling</option>
            <option value="log1p-max">Log1p + max scaling</option>
          </select>
        </label>
      </div>
    </Panel>
  );
}
