"use client";

import { useMemo } from "react";
import { EnaPlot, clampPlotZoom, type EnaPlotOverlay } from "@/components/ena/EnaPlot";
import { projectPoint } from "@/lib/ena/plot-encoding";
import { buildSenaEnaOverlayEdges, type SenaEnaOverlayKind } from "@/lib/sena/ena-overlay";
import { buildSenaEnaPlotComposition } from "@/lib/sena/ena-plot-model";
import { buildSenaOrbitLayout, type SenaOrbitGeometry } from "@/lib/sena/orbit-layout";
import { cn } from "@/lib/utils";
import type { SenaEnaManifest, SenaLayer, SenaModel } from "./analysis-runtime";
import { FusionOrbitLayer } from "./fusion-orbit-layer";

// The Fusion default surface (ADR 0009): a canonical ENA plane with an
// explanatory social orbit around it. This file owns the plane and composes
// the orbit layer (P2) around it.
//
// Paint order is the whole z-order argument, and it is short because the
// geometry removes the hard case: the ring encloses the plane, lanes bulge
// only outward, so no lane ever crosses the plane. The orbit group therefore
// renders first and the nested plane second — measurements on top of the
// explanatory layout — and the one mark that does span the boundary, the
// selected person's unit leader, renders last, marked, in the outer space
// where a nested viewport cannot clip it.
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
export const FUSION_PLANE_ORBIT_CANVAS = { width: 1480, height: 1040 } as const;

/**
 * Where the nested plot sits. EnaPlot's canvas is 720x520, so the slot is that
 * canvas at 1:1 — no letterboxing, no scale — centred in the surface with the
 * margin the orbit ring, its lane band, and the caption need around it.
 */
export const FUSION_PLANE_SLOT = { x: 380, y: 260, width: 720, height: 520 } as const;

/**
 * The orbit ring this surface mounts the shared layer at. Three constraints
 * fix it, and they are tighter than they look:
 *
 *  * the ring must *enclose* the plane, so the plane's corner offsets from the
 *    ring centre (±360, ±260) must satisfy (360/rx)^2 + (260/ry)^2 < 1 — which
 *    at ry 330 evaluates to 0.98, the same margin the module default keeps;
 *  * lanes bulge outward from the ring by up to `laneBaseOffset + lane * step`
 *    (44 + 26k; the pilot fills five lanes, so 148px), and every one of those
 *    points has to stay on the canvas;
 *  * the caption below is part of the figure, so the lane band has to stop
 *    short of the bottom edge rather than run into it.
 *
 * rx 600 with ry 330 satisfies all three at 1480x1040 with ~40px of caption
 * band to spare; the geometry is pinned numerically in
 * `__tests__/fusion-plane-orbit-geometry.test.ts` so a later canvas change
 * cannot silently push a lane off the surface.
 */
export const FUSION_ORBIT_GEOMETRY: SenaOrbitGeometry = {
  center: { x: 740, y: 520 },
  rx: 600,
  ry: 330
};

/** The plane's own title, drawn by the shared renderer as any plot title is. */
export const FUSION_PLANE_TITLE = "Fusion — ENA plane";

const FOOTER_DEFINITION_Y = 1012;
const FOOTER_FIT_Y = 1032;
const DEFINITION_FILL = "rgb(var(--muted))";
const FIT_FILL = "rgb(var(--foreground) / 0.78)";
const OVERLAY_BRIDGE_COLOR = "#24dcee";
const UNIT_LINK_COLOR = "#24dcee";

/**
 * Outer-surface position of a point given in the nested plane's own pixel
 * space (the 720x520 space `projectPoint` returns).
 *
 * EnaPlot is a nested `<svg>` at the slot with a zoom-derived viewBox centred
 * on its canvas midpoint — `viewBox = (360 - 360/z, 260 - 260/z, 720/z, 520/z)`
 * — and the viewBox keeps the viewport's aspect ratio, so `xMidYMid meet`
 * resolves to a plain uniform scale of `z`. That makes the mapping exact
 * rather than approximate: subtract the viewBox origin, scale by the zoom,
 * offset by the slot. At zoom 1 it collapses to `slot + point`.
 *
 * `visible` is false when the zoom window has scrolled the point out of the
 * slot: the nested viewport clips there, so a leader drawn to it would point
 * at nothing.
 */
export function fusionPlaneSurfacePoint(
  planePoint: { x: number; y: number },
  zoom = 1
): { x: number; y: number; visible: boolean } {
  const safeZoom = clampPlotZoom(zoom);
  const viewBoxX = FUSION_PLANE_SLOT.width / 2 - FUSION_PLANE_SLOT.width / (2 * safeZoom);
  const viewBoxY = FUSION_PLANE_SLOT.height / 2 - FUSION_PLANE_SLOT.height / (2 * safeZoom);
  const x = FUSION_PLANE_SLOT.x + (planePoint.x - viewBoxX) * safeZoom;
  const y = FUSION_PLANE_SLOT.y + (planePoint.y - viewBoxY) * safeZoom;

  return {
    x,
    y,
    visible: x >= FUSION_PLANE_SLOT.x &&
      x <= FUSION_PLANE_SLOT.x + FUSION_PLANE_SLOT.width &&
      y >= FUSION_PLANE_SLOT.y &&
      y <= FUSION_PLANE_SLOT.y + FUSION_PLANE_SLOT.height
  };
}

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

  // How the three layer toggles land on this surface, which is not how they
  // land on the A1 canvas and is worth stating rather than discovering:
  //   * S removes the orbit's ties and leaves its people standing;
  //   * B switches the bridge overlay between selected-only and every bridge;
  //   * W does nothing here. The plane's code network is the ENA model itself,
  //     drawn by the shared renderer as rENA draws it — an ENA plot with its
  //     network switched off is not a dimmer ENA plot, it is a different
  //     figure. The concept toggle keeps its meaning for the Canvas-based
  //     layouts, and FusionLayerKey still dims the W tile per its own law, so
  //     the control stays honest about what it is doing.
  //
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

  // The orbit layer builds this same layout from the same pure function; it is
  // recomputed rather than threaded through a prop so the layer keeps one owner
  // of its geometry. `buildSenaOrbitLayout` is deterministic, so the two calls
  // cannot disagree, and FUSION_ORBIT_GEOMETRY is module-level precisely so the
  // layer's own memo sees a stable reference.
  const orbitLayout = useMemo(
    () => buildSenaOrbitLayout(model, { geometry: FUSION_ORBIT_GEOMETRY, threshold }),
    [model, threshold]
  );

  /**
   * The one mark that crosses the boundary: a dashed leader from the selected
   * person's hexagon to the same person's unit point on the plane. It is what
   * makes the two halves one figure — without it the orbit is a sociogram
   * sitting next to an ENA plot — and it is drawn as a leader, not a tie,
   * because it asserts identity rather than a measured relation.
   */
  const unitLink = useMemo(() => {
    if (composition.status !== "computed" || !composition.model) return null;
    const person = orbitLayout.persons.find((candidate) => candidate.id === selectedId);
    const unit = composition.units.find((candidate) => candidate.id === selectedId);
    if (!person || !unit) return null;

    const [planeX, planeY] = projectPoint(composition.model, unit);
    const target = fusionPlaneSurfacePoint({ x: planeX, y: planeY }, zoom);
    // Zoomed in far enough and the unit leaves the plane's viewport, which
    // clips it. A leader to a clipped point is a line into the paper's edge, so
    // the honest render is no leader at all.
    if (!target.visible) return null;

    const dx = target.x - person.x;
    const dy = target.y - person.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return null;

    return {
      person: person.label,
      start: {
        x: person.x + (dx / distance) * (person.radius + 4),
        y: person.y + (dy / distance) * (person.radius + 4)
      },
      // Stop short of the point so EnaPlot's own selection marker stays the
      // thing the eye lands on.
      end: { x: target.x - (dx / distance) * 9, y: target.y - (dy / distance) * 9 }
    };
  }, [composition, orbitLayout.persons, selectedId, zoom]);

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
      {/*
        The orbit first, the plane over it. The ring encloses the plane and its
        lanes bulge outward only, so the two never contend for the same pixels;
        painting the measurement last is the rule that settles the case where a
        future geometry lets them.
      */}
      <FusionOrbitLayer
        model={model}
        threshold={threshold}
        selectedId={selectedId}
        onSelect={onSelect}
        geometry={FUSION_ORBIT_GEOMETRY}
        showLanes={layers.social}
      />

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

      {unitLink && (
        <g data-sena-layer="unit-link" data-testid="sena-fusion-unit-link" pointerEvents="none">
          <line
            x1={unitLink.start.x}
            y1={unitLink.start.y}
            x2={unitLink.end.x}
            y2={unitLink.end.y}
            stroke={UNIT_LINK_COLOR}
            strokeWidth="1.6"
            strokeDasharray="6 6"
            strokeLinecap="round"
            opacity="0.7"
            data-visual-role="fusion-unit-leader"
          >
            <title>{`${unitLink.person}: orbit hexagon and ENA unit point are the same person`}</title>
          </line>
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
