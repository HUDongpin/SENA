"use client";

import { useMemo } from "react";
import { EnaPlot, clampPlotZoom, type EnaPlotOverlay } from "@/components/ena/EnaPlot";
import { buildSenaEnaOverlayEdges, type SenaEnaOverlayKind } from "@/lib/sena/ena-overlay";
import { buildSenaEnaPlotComposition } from "@/lib/sena/ena-plot-model";
import { cn } from "@/lib/utils";
import type { SenaEnaManifest, SenaLayer, SenaModel } from "./analysis-runtime";

// The Fusion default surface (ADR 0009): a canonical ENA plane with an
// explanatory social orbit around it. This file is the plane; the orbit lands
// beside it in its own layer.
//
// The plane is not a re-drawing of ENA geometry in fusion coordinates — it is
// <EnaPlot> itself, nested as a child viewport of this surface's own SVG. That
// is what makes ADR 0008's rule reach inside Fusion: where a node's position is
// a measured coordinate, the grammar is rENA's through the one shared renderer,
// and everything SENA adds is a marked, subordinate overlay. Stripping every
// data-sena-layer subtree from the nested plane yields the plot /workspace/ena
// draws for the same model, byte for byte (fusion-plane-parity.test.tsx).
//
// Two embedding obligations, both from the EnaPlot audit:
//   * className="" drops its Tailwind sizing default, which is HTML layout and
//     means nothing inside an SVG;
//   * the zoom is forwarded into EnaPlot rather than applied to this surface's
//     viewBox. EnaPlot's legend and low-rank badge counter-scale against their
//     own viewBox, so an outer zoom-window would shrink and drift the plot's
//     own chrome. One zoom, one owner.
//
// S ties never draw in here. ADR 0008 defaulted them off in projected space
// because a line between two projected unit points traces no meaningful path;
// ADR 0009 gives them a home on the orbit instead. B bridges do cross, through
// the overlay channel, capped below the network's own ink.

/** This surface's coordinate space. The plane is a slot inside it. */
export const FUSION_PLANE_ORBIT_CANVAS = { width: 1240, height: 840 } as const;

/**
 * Where the nested plot sits. EnaPlot's canvas is 720x520, so the slot is that
 * canvas at 1:1 — no letterboxing, no scale — centred horizontally with the
 * margin the orbit ring needs around it.
 */
export const FUSION_PLANE_SLOT = { x: 260, y: 160, width: 720, height: 520 } as const;

/** The plane's own title, drawn by the shared renderer as any plot title is. */
export const FUSION_PLANE_TITLE = "Fusion — ENA plane";

const FOOTER_DEFINITION_Y = 726;
const FOOTER_FIT_Y = 748;
const DEFINITION_FILL = "rgb(var(--muted))";
const FIT_FILL = "rgb(var(--foreground) / 0.78)";
const OVERLAY_BRIDGE_COLOR = "#24dcee";

function formatCorrelation(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "NA";
}

/**
 * The model definition an ENA figure is unreadable without: what a unit is,
 * what a conversation is, and which window and rotation produced the
 * projection. rENA prints it beside the plot; so does this.
 */
function modelDefinitionLine(manifest: SenaEnaManifest) {
  const units = manifest.source.unitColumns.join(", ") || "NA";
  const conversation = manifest.source.conversationColumns.join(", ") || "NA";
  const options = manifest.options;
  const window = options
    ? `${options.window} (back ${options.windowSizeBack}, forward ${options.windowSizeForward})`
    : "NA";
  const rotation = options
    ? `${options.model}, ${options.weightBy}, ${options.nodePositionMethod} nodes, ${options.dimensions}D`
    : "NA";

  return `Units ${units} · Conversation ${conversation} · Window ${window} · Rotation ${rotation}`;
}

/** Co-registration r/ρ per dimension — jena-js's enaCorrelations, as serialized. */
function goodnessOfFitLine(manifest: SenaEnaManifest) {
  const rows = manifest.outputs?.goodnessOfFit ?? [];
  if (rows.length === 0) return "Co-registration NA — goodness of fit was not estimable for this projection";
  const parts = rows.map(
    (row) => `${row.dimension} r ${formatCorrelation(row.pearson)} ρ ${formatCorrelation(row.spearman)}`
  );
  return `Co-registration ${parts.join(" · ")}`;
}

export function FusionPlaneOrbitPlot({
  model,
  enaManifest,
  layers,
  threshold,
  selectedId,
  onSelect,
  zoom = 1,
  className
}: {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  layers: Record<SenaLayer, boolean>;
  threshold: number;
  selectedId: string;
  /**
   * Reserved for the orbit's always-on person names; the plane draws no
   * SENA labels of its own, so P1 reads nothing from it.
   */
  revealedLabelIds?: string[];
  onSelect: (id: string) => void;
  zoom?: number;
  className?: string;
}) {
  const composition = useMemo(
    () => buildSenaEnaPlotComposition(enaManifest, model.people, model.codes, { title: FUSION_PLANE_TITLE }),
    [enaManifest, model.codes, model.people]
  );

  // Read as a scalar before the memo, for the reason ena-space-plot.tsx records:
  // depending on `layers.bridge` inside it makes the React Compiler infer the
  // whole pass-through `layers` object as the dependency.
  const bridgeLayerEnabled = layers.bridge;

  const overlay = useMemo<EnaPlotOverlay>(() => {
    if (composition.status !== "computed") return {};

    // Focus on selection. All of a dense bridge layer at once is the picture
    // ADR 0009 is replacing, so the default answers "what does this person
    // contribute" — and the B toggle, explicitly on, still shows every bridge.
    // The filter runs after normalization (lib/sena/ena-overlay.ts), so a
    // bridge's width means the same thing whoever is selected.
    const kinds: SenaEnaOverlayKind[] = [
      {
        layer: "bridge",
        kind: "bridge",
        enabled: true,
        include: bridgeLayerEnabled
          ? undefined
          : (edge) => edge.source === selectedId || edge.target === selectedId
      }
    ];
    const edges = buildSenaEnaOverlayEdges({ edges: model.edges, composition, threshold, kinds });

    return {
      edges,
      // Person identity stays an overlay ring on the selected or hovered unit
      // point (ADR 0008 rule 5) rather than a permanent hexagon; the hexagons
      // belong to the orbit, where position is an explanatory choice.
      markers: composition.units,
      legend: edges.length > 0 ? [{ name: "Person–code bridges", color: OVERLAY_BRIDGE_COLOR, kind: "line" }] : []
    };
  }, [bridgeLayerEnabled, composition, model.edges, selectedId, threshold]);

  const safeZoom = clampPlotZoom(zoom);
  const description = `SENA Fusion plane and social orbit. ${FUSION_PLANE_TITLE}.`;

  return (
    <svg
      viewBox={`0 0 ${FUSION_PLANE_ORBIT_CANVAS.width} ${FUSION_PLANE_ORBIT_CANVAS.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-[40rem] w-full max-w-full", className)}
      role="img"
      aria-label={description}
      data-testid="sena-fusion-plane-orbit"
      data-visual-role="fusion-plane-orbit"
      data-plot-zoom={safeZoom.toFixed(3)}
    >
      {composition.status === "computed" && composition.model ? (
        <EnaPlot
          model={composition.model}
          variance={composition.variance}
          lowRank={composition.lowRank}
          x={FUSION_PLANE_SLOT.x}
          y={FUSION_PLANE_SLOT.y}
          width={FUSION_PLANE_SLOT.width}
          height={FUSION_PLANE_SLOT.height}
          className=""
          zoom={zoom}
          overlay={overlay}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <g data-sena-layer="plane-unavailable">
          <text
            x={FUSION_PLANE_SLOT.x}
            y={FUSION_PLANE_SLOT.y + FUSION_PLANE_SLOT.height / 2}
            fill={FIT_FILL}
            fontSize="14"
            fontWeight="700"
          >
            {composition.warnings[0] ?? "The Fusion plane needs a computed jENA projection."}
          </text>
        </g>
      )}

      {/*
        The model definition and its goodness of fit, on the figure rather than
        beside it: an ENA plot whose unit, conversation, window, and rotation
        are not stated is not reproducible, and a caption is the first thing a
        figure loses on its way into a paper.
      */}
      <g data-sena-layer="model-footer">
        <text
          data-sena-footer-row="model-definition"
          x={FUSION_PLANE_SLOT.x}
          y={FOOTER_DEFINITION_Y}
          fill={DEFINITION_FILL}
          fontSize="12"
          fontWeight="700"
        >
          {modelDefinitionLine(enaManifest)}
        </text>
        <text
          data-sena-footer-row="goodness-of-fit"
          x={FUSION_PLANE_SLOT.x}
          y={FOOTER_FIT_Y}
          fill={FIT_FILL}
          fontSize="11"
          fontWeight="600"
        >
          {goodnessOfFitLine(enaManifest)}
        </text>
      </g>
    </svg>
  );
}
