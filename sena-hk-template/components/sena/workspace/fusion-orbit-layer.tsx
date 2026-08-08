"use client";

import { useMemo } from "react";
import { hexPoints } from "@/lib/sena/hex";
import {
  buildSenaOrbitLayout,
  type SenaOrbitGeometry,
  type SenaOrbitModelInput
} from "@/lib/sena/orbit-layout";

// ADR 0009 (P2). The social orbit: persons as hexagons on an ellipse, directed
// ties as nested lanes that dock at their own ports, arrowheads cased in paper
// and painted after every line so a crossing never swallows a direction.
//
// This renders INSIDE somebody else's <svg> and owns no root of its own, so the
// same layer serves the Fusion plane-orbit surface (where it rings the ENA
// plane) and the SNA view (where it stands alone as a sociogram). Its group
// carries `data-sena-layer`, which is also what lets the plane's parity suite
// strip it: everything drawn here is SENA's explanatory grammar, not a
// measurement.

const ORBIT_LANE_COLOR = "#2f73ff";
const ORBIT_HEX_STROKE = "#24dcee";
const ORBIT_HEX_FILL = "#f8fbff";

function formatOrbitNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export type FusionOrbitLayerProps = {
  model: SenaOrbitModelInput;
  threshold: number;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Ring geometry; omit to use the module default sized for a 1240x840 surface. */
  geometry?: Partial<SenaOrbitGeometry> & { center?: Partial<SenaOrbitGeometry["center"]> };
  /** The dashed ellipse that says "this ring is a layout, not a measurement". */
  showRingGuide?: boolean;
};

export function FusionOrbitLayer({
  model,
  threshold,
  selectedId,
  onSelect,
  geometry,
  showRingGuide = true
}: FusionOrbitLayerProps) {
  const layout = useMemo(
    () => buildSenaOrbitLayout(model, { geometry, threshold }),
    [geometry, model, threshold]
  );

  return (
    <g data-sena-layer="orbit" data-testid="sena-fusion-orbit-layer" data-orbit-lane-count={layout.laneCount}>
      {showRingGuide && (
        <ellipse
          cx={layout.geometry.center.x}
          cy={layout.geometry.center.y}
          rx={layout.geometry.rx}
          ry={layout.geometry.ry}
          fill="none"
          stroke="#94a8c4"
          strokeWidth="1.4"
          strokeDasharray="2 7"
          opacity="0.35"
          pointerEvents="none"
          data-visual-role="orbit-ring-guide"
        />
      )}

      {/* Every lane first… */}
      <g data-orbit-paint="lanes">
        {layout.lanes.map((lane) => (
          <path
            key={lane.edgeId}
            data-testid={`sena-edge-${lane.edgeId}`}
            data-layer="social"
            data-visual-role="orbit-social-lane"
            data-orbit-lane={lane.lane}
            data-orbit-lane-offset={lane.offset}
            data-edge-weight={formatOrbitNumber(lane.weight)}
            data-edge-normalized-weight={formatOrbitNumber(lane.normalizedWeight, 4)}
            data-edge-scaled-weight={formatOrbitNumber(lane.scaledWeight, 4)}
            data-edge-visual-salience={formatOrbitNumber(lane.salience, 4)}
            data-edge-visual-width={formatOrbitNumber(lane.strokeWidth, 2)}
            d={lane.path}
            fill="none"
            stroke={ORBIT_LANE_COLOR}
            strokeWidth={lane.strokeWidth}
            strokeLinecap="round"
            opacity={selectedId === lane.edgeId ? 1 : lane.opacity}
            onClick={() => onSelect(lane.edgeId)}
            className="cursor-pointer"
          >
            <title>
              {`${lane.label}; weight ${formatOrbitNumber(lane.weight)}, normalized ${formatOrbitNumber(lane.normalizedWeight, 3)}, visual width ${formatOrbitNumber(lane.strokeWidth, 1)}`}
            </title>
          </path>
        ))}
      </g>

      {/* …then every arrowhead, each on its own paper casing. Painting the
          heads last is what keeps a direction readable where lanes cross. */}
      <g data-orbit-paint="arrowheads" pointerEvents="none">
        {layout.lanes.map((lane) => (
          <g key={lane.edgeId}>
            <polygon
              points={lane.arrowhead.points}
              fill="none"
              stroke="rgb(var(--background))"
              strokeWidth="5"
              strokeLinejoin="round"
              data-orbit-arrowhead-casing="true"
            />
            <polygon
              points={lane.arrowhead.points}
              fill={ORBIT_LANE_COLOR}
              opacity={Math.min(1, lane.opacity + 0.15)}
              data-visual-role="orbit-social-arrowhead"
              data-edge-id={lane.edgeId}
            />
          </g>
        ))}
      </g>

      <g data-orbit-paint="persons">
        {layout.persons.map((person) => {
          const selected = selectedId === person.id;
          return (
            <g
              key={person.id}
              data-testid={`sena-node-${person.id}`}
              data-node-kind="person"
              data-orbit-community={person.community}
              onClick={() => onSelect(person.id)}
              className="cursor-pointer"
            >
              {selected && (
                <polygon
                  points={hexPoints(person.x, person.y, person.radius + 10)}
                  fill="none"
                  stroke={ORBIT_HEX_STROKE}
                  strokeWidth="2.4"
                  opacity="0.85"
                  data-visual-role="orbit-person-selection-ring"
                />
              )}
              {person.communityTint && (
                <polygon
                  points={hexPoints(person.x, person.y, person.radius + 5)}
                  fill="none"
                  stroke={person.communityTint}
                  strokeWidth="3"
                  opacity="0.55"
                  data-visual-role="orbit-community-ring"
                />
              )}
              <polygon
                points={hexPoints(person.x, person.y, person.radius)}
                fill={ORBIT_HEX_FILL}
                stroke={ORBIT_HEX_STROKE}
                strokeWidth="2.4"
                data-visual-role="sna-person-hex-node"
              />
              <text
                x={person.x}
                y={person.y + person.radius * 0.16}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
                fontSize={Math.max(12, person.radius * 0.52)}
                fontWeight="900"
              >
                {person.initials}
              </text>
              {/* Always on. A sociogram whose names appear on hover is a
                  sociogram you cannot read in a screenshot. */}
              <text
                x={person.nameLabel.x}
                y={person.nameLabel.y}
                textAnchor={person.nameLabel.anchor}
                fill="rgb(var(--foreground))"
                fontSize={person.nameLabel.fontSize}
                fontWeight="900"
                data-visual-role="orbit-person-label"
                data-label-side={person.nameLabel.side}
                pointerEvents="none"
              >
                {person.nameLabel.text}
              </text>
              <title>{`${person.label}: ${person.role}; social strength ${formatOrbitNumber(person.strength)}`}</title>
            </g>
          );
        })}
      </g>
    </g>
  );
}
