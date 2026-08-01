"use client";

import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createENAWorkerClient, type ENAWorkerClient, type ENAWorkerProgress, type ENAWorkerRunHandle } from "jena-js/browser";
import {
  AlertCircle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  Loader2,
  Network,
  Play,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Square,
  Table2,
  Wand2,
  Zap,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { enaCorrelations } from "jena-js";
import { EnaPlot, clampPlotZoom } from "@/components/ena/EnaPlot";
import { cn } from "@/lib/utils";
import { parseCsv, rowsToCsv, type ParsedCsv } from "@/lib/ena/csv";
import { compareGroups, comparisonGroups } from "@/lib/ena/comparison";
import { buildEnaMethodsWriteUp } from "@/lib/ena/methods-write-up";
import {
  applyEnaPlotModelDisplay,
  defaultEnaPlotDisplay,
  enaPlotDisplayVariance,
  enaPlotInkDisplay,
  enaPlotScaleRange,
  type EnaPlotDisplay
} from "@/lib/ena/plot-display";
import { buildEnaPlotModel, buildEnaRunResult } from "@/lib/ena/results";
import { sampleEnaCsv } from "@/lib/ena/sample-data";
import type {
  EnaMapping,
  EnaPlotComposition,
  EnaRunOptions,
  EnaRunRequest,
  EnaRunResult,
  EnaRuntime
} from "@/lib/ena/types";
import {
  defaultEnaOptions,
  inferEnaMapping,
  prepareEnaRun,
  sanitizeMapping
} from "@/lib/ena/validation";

type WorkerBundle = {
  worker: Worker;
  client: ENAWorkerClient;
};

type ColumnRole = keyof EnaMapping;

// webENA-inspired workbench modes. The plot stays visible while the researcher
// moves between data (Sets), model definition (Model), visual tuning (Plot
// Tools), and results (Stats) — the shell pattern captured in
// ena-official-website-design.skill.md.
type WorkspaceMode = "sets" | "model" | "plot" | "stats";

// webENA's Stats sub-navigation.
type StatsTab = "comparison" | "fit" | "variance" | "methods";

const statsTabs: Array<{ id: StatsTab; label: string }> = [
  { id: "comparison", label: "Compare" },
  { id: "fit", label: "Fit" },
  { id: "variance", label: "Variance" },
  { id: "methods", label: "Methods" }
];

const workspaceModes: Array<{ id: WorkspaceMode; label: string; icon: React.ElementType }> = [
  { id: "sets", label: "Sets", icon: Boxes },
  { id: "model", label: "Model", icon: SlidersHorizontal },
  { id: "plot", label: "Plot Tools", icon: Network },
  { id: "stats", label: "Stats", icon: BarChart3 }
];

// webENA teal, used only for the active rail mode and primary actions; gray
// carries the rest of the interface.
const TEAL = "#56b09d";
const TEAL_DISABLED = "#bcdfd8";

const initialParsed = parseCsv(sampleEnaCsv);
const initialMapping = inferEnaMapping(initialParsed.headers, initialParsed.rows);

const modelOptions = ["EndPoint", "AccumulatedTrajectory", "SeparateTrajectory"] as const;
const windowOptions = ["MovingStanzaWindow", "Conversation"] as const;
const weightOptions = ["binary", "sum"] as const;
const nodePositionOptions = ["undirected", "directed", "directed-ground-response"] as const;

function createWorkerBundle(): WorkerBundle {
  const worker = new Worker(new URL("./jena.worker.ts", import.meta.url), { type: "module" });
  return { worker, client: createENAWorkerClient(worker) };
}

function selectedOptions(event: React.ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
}

function setMembership(values: string[]) {
  return new Set(values);
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  return String(value);
}

/** A statistic, or an em dash where it is undefined — never a stray NaN. */
function formatStat(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

/** p-values below the third decimal read as a bound, the way papers report them. */
function formatP(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value < 0.001 ? "< .001" : `= ${value.toFixed(3)}`;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <dt className="shrink-0 font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-bold tabular-nums text-foreground/85">{value}</dd>
    </div>
  );
}

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Uppercase, small, utilitarian section heading — the webENA panel convention.
function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted", className)}>{children}</h3>
  );
}

// A restrained card: subtle border, flat surface, small radius. No glass
// gradient, no glow — gray carries the interface.
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-cardBorder/55 bg-card/50", className)}>{children}</div>
  );
}

// Compact teal primary button (webENA: small radius, teal fill for primary
// actions only).
function TealButton({
  children,
  onClick,
  disabled,
  className
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: disabled ? TEAL_DISABLED : TEAL }}
      className={cn(
        "inline-flex items-center gap-2 rounded px-3.5 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:text-white/70",
        className
      )}
    >
      {children}
    </button>
  );
}

// Compact gray/ghost action button.
function GhostButton({
  children,
  onClick,
  className,
  as = "button",
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  as?: "button" | "label";
} & Record<string, unknown>) {
  const Component = as as React.ElementType;
  return (
    <Component
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded border border-cardBorder/60 bg-background/40 px-3 py-2 text-sm font-semibold text-foreground/80 transition hover:border-cardBorder hover:text-foreground",
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">{children}</label>;
}

function NativeSelect({
  label,
  value,
  children,
  onChange
}: {
  label: string;
  value: string;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-11 w-full min-w-0 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
      >
        {children}
      </select>
    </div>
  );
}

// Compact row switch — webENA's Plot Tools are switches and sliders in a
// 325px column, not cards with explanatory copy.
function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-w-0 cursor-pointer items-center justify-between gap-3 py-1.5",
        disabled && "cursor-not-allowed opacity-45"
      )}
      title={hint}
    >
      <span className="min-w-0 truncate text-xs font-bold text-foreground/85">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-[#56b09d]"
      />
    </label>
  );
}

// Compact slider with its value shown — "scale units", "scale for edge
// weights", "minimum edge weight".
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1 py-1.5", disabled && "opacity-45")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-bold text-foreground/85">{label}</span>
        <span className="shrink-0 text-[11px] font-black tabular-nums text-muted">
          {(format ?? ((next: number) => next.toFixed(2)))(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-1.5 w-full min-w-0 cursor-pointer accent-[#56b09d]"
      />
    </div>
  );
}

// Free-text axis rename. Empty falls back to the rotation's own dimension name.
function TextInput({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-9 w-full min-w-0 rounded border border-cardBorder/55 bg-background/55 px-2.5 text-xs font-semibold text-foreground outline-none placeholder:text-muted/70 focus:border-cyanGlow"
      />
    </div>
  );
}

// Secondary tabs inside the panel — webENA's Model and Stats sub-navigation.
function PanelTabs<T extends string>({
  tabs,
  active,
  onChange,
  testId
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 gap-0.5 rounded border border-cardBorder/50 bg-background/40 p-0.5" data-testid={testId}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-pressed={isActive}
            data-panel-tab={tab.id}
            data-active={isActive ? "true" : "false"}
            className={cn(
              // Not uppercase: four labels in a 325px panel only fit at their
              // natural width, and truncated tabs are worse than plain ones.
              "min-w-0 flex-1 truncate rounded px-1.5 py-1.5 text-[11px] font-black transition",
              isActive ? "text-white" : "text-muted hover:text-foreground"
            )}
            style={isActive ? { backgroundColor: TEAL } : undefined}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-11 w-full min-w-0 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
      />
    </div>
  );
}

function ColumnSelect({
  label,
  headers,
  selected,
  onChange
}: {
  label: string;
  headers: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        multiple
        value={selected}
        onChange={(event) => onChange(selectedOptions(event))}
        className="min-h-32 w-full min-w-0 rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
      >
        {headers.map((header) => (
          <option key={header} value={header}>{header}</option>
        ))}
      </select>
    </div>
  );
}

function ColumnChips({
  headers,
  mapping,
  onToggle
}: {
  headers: string[];
  mapping: EnaMapping;
  onToggle: (role: ColumnRole, column: string) => void;
}) {
  const units = setMembership(mapping.units);
  const conversation = setMembership(mapping.conversation);
  const codes = setMembership(mapping.codes);
  const metadata = setMembership(mapping.metadata ?? []);

  return (
    <div className="grid min-w-0 gap-2">
      <FieldLabel>Columns</FieldLabel>
      <div className="grid max-h-52 min-w-0 grid-cols-2 gap-2 overflow-y-auto overflow-x-hidden pr-1 text-xs sm:grid-cols-3">
        {headers.map((header) => {
          const role = units.has(header)
            ? "units"
            : conversation.has(header)
              ? "conversation"
              : codes.has(header)
                ? "codes"
                : metadata.has(header)
                  ? "metadata"
                  : null;

          return (
            <button
              key={header}
              onClick={() => onToggle(role ?? "metadata", header)}
              className={cn(
                "flex min-h-10 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left font-bold transition",
                role === "units" && "border-emerald-400/55 bg-emerald-400/12 text-emerald-300",
                role === "conversation" && "border-cyanGlow/55 bg-cyanGlow/12 text-cyanGlow",
                role === "codes" && "border-magentaGlow/55 bg-magentaGlow/12 text-magentaGlow",
                role === "metadata" && "border-violetGlow/55 bg-violetGlow/12 text-violetGlow",
                role === null && "border-cardBorder/45 bg-background/35 text-muted hover:text-foreground"
              )}
            >
              <span className="truncate">{header}</span>
              {role && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Width of the element itself, not the viewport: the Data View drawer is a
// column inside the workbench, so a media query says nothing useful about how
// much room a table actually has.
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    measure();

    // A ResizeObserver only delivers through the rendering loop, which a
    // backgrounded tab does not run: resize a hidden window and the table
    // stays in whichever layout it was last measured for. Re-measuring on
    // resize and when the tab comes back catches exactly that case.
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", measure);
    };
  }, []);

  return [ref, width] as const;
}

// Narrowest a column can be and still read: below this the grid is swapped for
// stacked records rather than left to scroll sideways.
const minimumReadableColumnWidth = 88;

function DataTable({
  rows,
  maxRows = 7,
  maxColumns = 9
}: {
  rows: Array<Record<string, unknown>>;
  maxRows?: number;
  maxColumns?: number;
}) {
  const [wrapperRef, wrapperWidth] = useElementWidth<HTMLDivElement>();

  const headers = useMemo(() => {
    const all = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()));
    return all.slice(0, maxColumns);
  }, [rows, maxColumns]);

  // A 9-column grid cannot fit a phone or a half-width drawer column. Rather
  // than hand the reader a sideways scrollbar, each row becomes a stacked
  // field/value record — same data, read downward.
  const stacked = wrapperWidth > 0 && wrapperWidth < headers.length * minimumReadableColumnWidth;
  const visibleRows = rows.slice(0, maxRows);

  if (rows.length === 0) {
    return <div className="rounded-lg border border-cardBorder/45 bg-background/35 p-4 text-sm text-muted">No rows.</div>;
  }

  return (
    <div ref={wrapperRef} className="w-full min-w-0 overflow-hidden rounded-lg border border-cardBorder/45">
      {stacked ? (
        <ul className="divide-y divide-cardBorder/25">
          {visibleRows.map((row, rowIndex) => (
            <li key={rowIndex} className="min-w-0 px-3 py-2.5 odd:bg-card/20">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted/75">Row {rowIndex + 1}</p>
              <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                {headers.map((header) => (
                  <Fragment key={header}>
                    <dt className="truncate font-bold text-muted">{header}</dt>
                    <dd className="truncate font-semibold text-foreground/78">{displayValue(row[header]) || "—"}</dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        /*
          The scroll region owns its own horizontal scrolling: `w-full` on the
          wrapper keeps a wide table from widening its parent, so the panel (or
          drawer) around it never grows a second, page-length scrollbar. It is
          focusable so the columns can also be reached with the arrow keys
          instead of only by dragging the bar.
        */
        <div
          className="min-w-0 overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyanGlow/60"
          tabIndex={0}
          role="region"
          aria-label="Data table — scroll sideways for more columns"
        >
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-background/65 text-muted">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="whitespace-nowrap border-b border-cardBorder/35 px-3 py-2 font-black">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="odd:bg-card/20">
                  {headers.map((header) => (
                    <td key={header} className="max-w-36 truncate border-b border-cardBorder/20 px-3 py-2 text-foreground/78">
                      {displayValue(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(rows.length > maxRows || headers.length < Object.keys(rows[0] ?? {}).length) && (
        <div className="bg-background/45 px-3 py-2 text-xs font-semibold text-muted">
          Showing {Math.min(rows.length, maxRows)} of {rows.length} rows.
        </div>
      )}
    </div>
  );
}

// Compact column list for the fixed ~325px secondary panel.
//
// A row x column grid cannot be read inside that width: the sample dataset's
// preview table is 431px wide, so it pushed the whole panel into a horizontal
// scrollbar the researcher had to drag left and right to see the Codes card or
// the later columns. webENA's panel convention is compact vertical rows, so the
// panel lists one row per column — name, mapped role, first values — and the
// full grid moves to the Data View drawer, which has the width for it.
function ColumnPreviewList({
  headers,
  rows,
  mapping,
  maxValues = 3,
  scanRows = 200
}: {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  mapping: EnaMapping;
  maxValues?: number;
  scanRows?: number;
}) {
  const columns = useMemo(() => {
    const roles: Array<[ColumnRole, string, Set<string>]> = [
      ["units", "unit", setMembership(mapping.units)],
      ["conversation", "conv", setMembership(mapping.conversation)],
      ["codes", "code", setMembership(mapping.codes)],
      ["metadata", "meta", setMembership(mapping.metadata ?? [])]
    ];
    const scanned = rows.slice(0, scanRows);

    return headers.map((header) => {
      const samples = new Set<string>();
      for (const row of scanned) {
        const value = displayValue(row[header]).trim();
        if (value) samples.add(value);
        if (samples.size >= maxValues) break;
      }
      return {
        header,
        role: roles.find(([, , members]) => members.has(header))?.[1] ?? null,
        samples: Array.from(samples)
      };
    });
  }, [headers, rows, mapping, maxValues, scanRows]);

  if (columns.length === 0) {
    return <div className="rounded-lg border border-cardBorder/45 bg-background/35 p-4 text-sm text-muted">No columns.</div>;
  }

  return (
    <ul className="min-w-0 divide-y divide-cardBorder/25 overflow-hidden rounded-lg border border-cardBorder/45">
      {columns.map(({ header, role, samples }) => (
        <li key={header} className="min-w-0 px-3 py-2 odd:bg-card/20">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="truncate text-xs font-black text-foreground">{header}</span>
            {role && <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-muted/75">{role}</span>}
          </div>
          <p className="truncate text-[11px] font-semibold text-muted">{samples.join(" · ") || "—"}</p>
        </li>
      ))}
    </ul>
  );
}

export function EnaWorkspaceClient() {
  const [parsed, setParsed] = useState<ParsedCsv>(initialParsed);
  const [mapping, setMapping] = useState<EnaMapping>(initialMapping);
  const [options, setOptions] = useState<Required<EnaRunOptions>>(defaultEnaOptions);
  const [runtime, setRuntime] = useState<EnaRuntime>("worker");
  const [groupBy, setGroupBy] = useState<string>("");
  const [minWeight, setMinWeight] = useState(0);
  const [mode, setMode] = useState<WorkspaceMode>("model");
  const [display, setDisplay] = useState<EnaPlotDisplay>(defaultEnaPlotDisplay);
  const [statsTab, setStatsTab] = useState<StatsTab>("comparison");
  const [comparison, setComparison] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [methodsCopied, setMethodsCopied] = useState(false);
  const [dataViewOpen, setDataViewOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<EnaRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string>("Sample lesson-study dataset loaded.");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const workerBundleRef = useRef<WorkerBundle | null>(null);
  const runHandleRef = useRef<ENAWorkerRunHandle | null>(null);
  const dataViewRef = useRef<HTMLDivElement | null>(null);

  // The full row x column grid lives under the plot, where the width is. Opening
  // it from the Sets panel scrolls it into view so the drawer is not a hidden
  // destination.
  function openDataView() {
    setDataViewOpen(true);
    window.requestAnimationFrame(() => {
      dataViewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  useEffect(() => {
    return () => {
      workerBundleRef.current?.client.terminate();
      workerBundleRef.current = null;
    };
  }, []);

  function updateDisplay(next: Partial<EnaPlotDisplay>) {
    setDisplay((current) => ({ ...current, ...next }));
  }

  // Group-by only draws traces, so it must stay out of the mapping and options
  // that define the ENA model: changing it must never change the projection.
  const groupByOptions = useMemo(() => mapping.metadata ?? [], [mapping.metadata]);
  const activeGroupBy = groupByOptions.includes(groupBy) ? groupBy : "";

  // --- Plot Tools: the model the renderer actually gets -----------------------
  //
  // Composition (group traces, minimum edge weight) is rebuilt from the set
  // that has already been computed, not by re-running the analysis: it only
  // selects which traces are added, so it costs nothing and can follow the
  // controls immediately. Before this, changing Group By or the minimum edge
  // weight did nothing at all until the next Run.
  const composedPlotModel = useMemo(() => {
    if (!result) return null;
    const composition: EnaPlotComposition = {
      ...(activeGroupBy ? { groupBy: activeGroupBy } : {}),
      ...(minWeight > 0 ? { minWeight } : {})
    };
    return buildEnaPlotModel(result.set, composition);
  }, [result, activeGroupBy, minWeight]);

  const displayedPlotModel = useMemo(
    () => (composedPlotModel ? applyEnaPlotModelDisplay(composedPlotModel, display) : null),
    [composedPlotModel, display]
  );
  const displayedVariance = useMemo(
    () => (composedPlotModel ? enaPlotDisplayVariance(composedPlotModel, result?.set.variance, display) : undefined),
    [composedPlotModel, result, display]
  );
  const displayedInk = useMemo(() => enaPlotInkDisplay(display), [display]);

  // --- Stats -----------------------------------------------------------------
  const comparisonGroupOptions = useMemo(
    () => (result && activeGroupBy ? comparisonGroups(result.set, activeGroupBy) : []),
    [result, activeGroupBy]
  );

  // Selections survive as long as they name groups that still exist; otherwise
  // fall back to the first two, so switching datasets cannot leave the panel
  // comparing something that is no longer there.
  const activeComparison = useMemo(() => {
    const has = (value: string) => comparisonGroupOptions.includes(value);
    return {
      left: has(comparison.left) ? comparison.left : comparisonGroupOptions[0] ?? "",
      right: has(comparison.right) ? comparison.right : comparisonGroupOptions[1] ?? ""
    };
  }, [comparison, comparisonGroupOptions]);

  const comparisonResults = useMemo(() => {
    if (!result || !activeGroupBy) return [];
    if (!activeComparison.left || !activeComparison.right) return [];
    if (activeComparison.left === activeComparison.right) return [];
    return compareGroups(
      result.set,
      activeGroupBy,
      result.summary.dimensions,
      activeComparison.left,
      activeComparison.right
    );
  }, [result, activeGroupBy, activeComparison]);

  const goodnessOfFit = useMemo(() => {
    if (!result) return [];
    try {
      return enaCorrelations(result.set, result.summary.dimensions);
    } catch {
      // A degenerate set (one unit, or a dimension with no spread) has no
      // correlation to report; an empty table says that better than a crash.
      return [];
    }
  }, [result]);

  const methodsWriteUp = useMemo(
    () =>
      buildEnaMethodsWriteUp({
        result,
        mapping,
        options,
        groupBy: activeGroupBy,
        minWeight,
        comparisons: comparisonResults
      }),
    [result, mapping, options, activeGroupBy, minWeight, comparisonResults]
  );

  async function copyMethodsWriteUp() {
    try {
      await navigator.clipboard.writeText(methodsWriteUp);
      setMethodsCopied(true);
      window.setTimeout(() => setMethodsCopied(false), 2000);
    } catch {
      setError("Could not copy to the clipboard. Select the text and copy it manually.");
    }
  }

  const request = useMemo<EnaRunRequest>(() => ({
    rows: parsed.rows,
    mapping,
    options,
    composition:
      activeGroupBy || minWeight > 0
        ? { ...(activeGroupBy ? { groupBy: activeGroupBy } : {}), ...(minWeight > 0 ? { minWeight } : {}) }
        : undefined
  }), [activeGroupBy, mapping, minWeight, options, parsed.rows]);

  const validationMessage = useMemo(() => {
    try {
      prepareEnaRun(request);
      return null;
    } catch (validationError) {
      return validationError instanceof Error ? validationError.message : "Current ENA mapping is invalid.";
    }
  }, [request]);

  // webENA-style prerequisite checklist for the empty state — names what the
  // model still needs so a blank plot reads as guidance, not an error.
  const prerequisites = useMemo(
    () => [
      { label: "Define at least one unit column", done: mapping.units.length > 0 },
      { label: "Define at least one conversation column", done: mapping.conversation.length > 0 },
      { label: "Select at least two code columns", done: mapping.codes.length >= 2 }
    ],
    [mapping.units.length, mapping.conversation.length, mapping.codes.length]
  );

  function applyCsv(text: string, sourceLabel: string) {
    try {
      const nextParsed = parseCsv(text);
      const nextMapping = inferEnaMapping(nextParsed.headers, nextParsed.rows);
      setParsed(nextParsed);
      setMapping(nextMapping);
      setResult(null);
      setError(null);
      setCsvMessage(`${sourceLabel}: ${nextParsed.rows.length} rows and ${nextParsed.headers.length} columns loaded.`);
    } catch (csvError) {
      setError(csvError instanceof Error ? csvError.message : "CSV import failed.");
    }
  }

  function loadSampleData() {
    applyCsv(sampleEnaCsv, "Sample dataset");
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const text = await file.text();
    applyCsv(text, file.name);
    event.currentTarget.value = "";
  }

  function updateMapping(partial: Partial<EnaMapping>) {
    setMapping((current) => sanitizeMapping({ ...current, ...partial }, parsed.headers));
  }

  function toggleColumn(role: ColumnRole, column: string) {
    setMapping((current) => {
      const next: EnaMapping = {
        units: current.units.filter((item) => item !== column),
        conversation: current.conversation.filter((item) => item !== column),
        codes: current.codes.filter((item) => item !== column),
        metadata: (current.metadata ?? []).filter((item) => item !== column)
      };

      next[role] = toggleValue(current[role] ?? [], column);
      return sanitizeMapping(next, parsed.headers);
    });
  }

  function updateOptions(partial: Partial<Required<EnaRunOptions>>) {
    setOptions((current) => ({ ...current, ...partial }));
  }

  const zoomIn = () => setZoom((current) => clampPlotZoom(current * 1.25));
  const zoomOut = () => setZoom((current) => clampPlotZoom(current / 1.25));
  const resetZoom = () => setZoom(1);

  function ensureWorkerBundle() {
    if (!workerBundleRef.current) workerBundleRef.current = createWorkerBundle();
    return workerBundleRef.current;
  }

  async function runWithWorker() {
    const prepared = prepareEnaRun(request);
    const bundle = ensureWorkerBundle();
    const startedAt = performance.now();
    const handle = bundle.client.start(prepared.options, (event: ENAWorkerProgress) => {
      setProgress(event.progress);
    });
    runHandleRef.current = handle;
    const set = await handle.promise;
    return buildEnaRunResult(set, parsed.rows.length, "worker", Math.round(performance.now() - startedAt), prepared.warnings, request.composition);
  }

  async function runWithApi() {
    const csrfResponse = await fetch("/api/auth/csrf");
    const csrfPayload = await csrfResponse.json();
    if (!csrfResponse.ok || typeof csrfPayload.token !== "string") {
      throw new Error(csrfPayload.error ?? "Sign in is required before using the server ENA runtime.");
    }
    const response = await fetch("/api/ena/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sena-csrf-token": csrfPayload.token
      },
      body: JSON.stringify(request)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(Array.isArray(payload.issues) ? payload.issues.join(" ") : payload.error ?? "ENA API request failed.");
    }
    return payload as EnaRunResult;
  }

  async function runAnalysis() {
    setIsRunning(true);
    setProgress(runtime === "worker" ? 0 : null);
    setError(null);
    setResult(null);

    try {
      const nextResult = runtime === "worker" ? await runWithWorker() : await runWithApi();
      setResult(nextResult);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "ENA analysis failed.");
    } finally {
      runHandleRef.current = null;
      setIsRunning(false);
      setProgress(null);
    }
  }

  function cancelAnalysis() {
    runHandleRef.current?.cancel();
    workerBundleRef.current?.client.terminate();
    workerBundleRef.current = null;
    runHandleRef.current = null;
    setIsRunning(false);
    setProgress(null);
    setError("Analysis cancelled.");
  }

  function exportResultJson() {
    if (!result) return;
    downloadText("sena-ena-result.json", JSON.stringify(result, null, 2), "application/json");
  }

  function exportPointsCsv() {
    if (!result) return;
    downloadText("sena-ena-points.csv", rowsToCsv(result.set.points), "text/csv;charset=utf-8");
  }

  function exportConnectionsCsv() {
    if (!result) return;
    downloadText("sena-ena-connections.csv", rowsToCsv(result.set.connectionCounts), "text/csv;charset=utf-8");
  }

  const activeMode = workspaceModes.find((item) => item.id === mode);

  return (
    /* Desktop is a fixed-height workbench: the shell is exactly one viewport
       tall and each column scrolls inside itself, so the panel never grows the
       page and the plot stays anchored while the controls scroll.
       6.125rem is the floating NavBar pill: 4.5rem tall plus its 1rem sticky
       offset — clearing it starts the workbench below the pill instead of
       under it, and leaves the page itself with no scrollbar of its own. */
    <section
      className="flex min-h-[calc(100vh-4.5rem)] flex-col lg:mt-4 lg:h-[calc(100vh-6.125rem)] lg:min-h-0 lg:flex-row lg:overflow-hidden"
      data-visual-role="webena-workbench"
    >
      {/* Persistent dark mode rail — Sets, Model, Plot Tools, Stats. */}
      <nav
        className="flex shrink-0 flex-row gap-1 overflow-x-auto bg-[#1f1f1f] p-2 lg:w-[76px] lg:flex-col lg:gap-2 lg:overflow-visible lg:py-4"
        aria-label="ENA workspace modes"
      >
        {workspaceModes.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setMode(item.id)}
              aria-pressed={active}
              data-rail-mode={item.id}
              data-active={active ? "true" : "false"}
              className={cn(
                "group flex min-w-[64px] flex-col items-center gap-1 rounded px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition",
                active ? "bg-white/5" : "text-white/45 hover:bg-white/5 hover:text-white/80"
              )}
              style={active ? { color: TEAL } : undefined}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Secondary panel — the active mode's controls. Fixed ~340px width per
          the webENA shell, so it is a flex column: the header stays put and the
          controls below it fill the rest of the panel height. */}
      <aside className="flex w-full shrink-0 flex-col border-b border-cardBorder/50 bg-card/30 lg:w-[340px] lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 items-center justify-between border-b border-cardBorder/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-foreground">
            {activeMode ? <activeMode.icon className="h-4 w-4 text-muted" /> : null}
            {activeMode?.label}
          </div>
          <div className="flex gap-1.5">
            <GhostButton as="label" className="px-2 py-1.5 text-xs" title="Upload a CSV dataset">
              <FileUp className="h-3.5 w-3.5" /> CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileUpload} />
            </GhostButton>
            <GhostButton onClick={loadSampleData} className="px-2 py-1.5 text-xs" title="Load the sample lesson-study dataset">
              <Wand2 className="h-3.5 w-3.5" /> Sample
            </GhostButton>
          </div>
        </div>

        {/* The panel scrolls vertically only. `overflow-x-hidden` plus `min-w-0`
            on every mode's grid keeps a wide child (a preview table, a long
            column name) from turning the whole panel into a sideways scroller. */}
        <div className="min-h-0 max-h-[65vh] flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 lg:max-h-none">
          {mode === "sets" && (
            <div className="grid min-w-0 gap-4">
              <div className="min-w-0">
                <SectionHeading>Dataset</SectionHeading>
                <div className="grid min-w-0 grid-cols-3 gap-2">
                  {[
                    ["Rows", parsed.rows.length],
                    ["Columns", parsed.headers.length],
                    ["Codes", mapping.codes.length]
                  ].map(([label, value]) => (
                    <Card key={label} className="min-w-0 p-3">
                      <div className="truncate text-lg font-black text-foreground">{value}</div>
                      <div className="truncate text-[11px] font-bold text-muted">{label}</div>
                    </Card>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-muted">{csvMessage}</p>
              </div>
              <div className="min-w-0 border-t border-cardBorder/40 pt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SectionHeading className="mb-0">Preview</SectionHeading>
                  <GhostButton
                    onClick={openDataView}
                    className="px-2 py-1 text-[11px]"
                    title="Open the full table under the plot"
                    data-visual-role="ena-sets-open-data-view"
                  >
                    <Table2 className="h-3 w-3" /> Full table
                  </GhostButton>
                </div>
                <ColumnPreviewList headers={parsed.headers} rows={parsed.rows} mapping={mapping} />
              </div>
            </div>
          )}

          {mode === "model" && (
            <div className="grid min-w-0 gap-4">
              <ColumnChips headers={parsed.headers} mapping={mapping} onToggle={toggleColumn} />
              <ColumnSelect label="Units" headers={parsed.headers} selected={mapping.units} onChange={(units) => updateMapping({ units })} />
              <ColumnSelect label="Conversation" headers={parsed.headers} selected={mapping.conversation} onChange={(conversation) => updateMapping({ conversation })} />
              <ColumnSelect label="Codes" headers={parsed.headers} selected={mapping.codes} onChange={(codes) => updateMapping({ codes })} />
              <ColumnSelect label="Metadata" headers={parsed.headers} selected={mapping.metadata ?? []} onChange={(metadata) => updateMapping({ metadata })} />

              <div className="border-t border-cardBorder/40 pt-4">
                <SectionHeading>Accumulation</SectionHeading>
                <div className="grid gap-3">
                  <NativeSelect label="Model" value={options.model} onChange={(model) => updateOptions({ model: model as Required<EnaRunOptions>["model"] })}>
                    {modelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </NativeSelect>
                  <NativeSelect label="Window" value={options.window} onChange={(window) => updateOptions({ window: window as Required<EnaRunOptions>["window"] })}>
                    {windowOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </NativeSelect>
                  <NativeSelect label="Weight" value={options.weightBy} onChange={(weightBy) => updateOptions({ weightBy: weightBy as Required<EnaRunOptions>["weightBy"] })}>
                    {weightOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </NativeSelect>
                  <NativeSelect label="Node Positions" value={options.nodePositionMethod} onChange={(nodePositionMethod) => updateOptions({ nodePositionMethod: nodePositionMethod as Required<EnaRunOptions>["nodePositionMethod"] })}>
                    {nodePositionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </NativeSelect>
                  <div className="grid min-w-0 grid-cols-3 gap-2">
                    <NumberInput label="Back" value={options.windowSizeBack} min={1} onChange={(windowSizeBack) => updateOptions({ windowSizeBack })} />
                    <NumberInput label="Forward" value={options.windowSizeForward} min={0} onChange={(windowSizeForward) => updateOptions({ windowSizeForward })} />
                    <NumberInput label="Dims" value={options.dimensions} min={1} onChange={(dimensions) => updateOptions({ dimensions })} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/*
            Plot Tools, in webENA's three groups: Dimensions, Plotted Points,
            Network Graph. Everything here is presentation — it transforms the
            plot model or the ink, never the ENA model — except the minimum edge
            weight, which is part of how the network is composed and so re-runs
            through the plot composition.
          */}
          {mode === "plot" && (
            <div className="grid min-w-0 gap-4">
              <div className="min-w-0">
                <SectionHeading>Dimensions</SectionHeading>
                <div className="grid min-w-0 gap-2">
                  <TextInput
                    label="X axis label"
                    value={display.axisTitleX}
                    placeholder={result?.plotModel.dimensions[0] ?? "SVD1"}
                    onChange={(axisTitleX) => updateDisplay({ axisTitleX })}
                  />
                  <TextInput
                    label="Y axis label"
                    value={display.axisTitleY}
                    placeholder={result?.plotModel.dimensions[1] ?? "SVD2"}
                    onChange={(axisTitleY) => updateDisplay({ axisTitleY })}
                  />
                </div>
                <div className="mt-2 divide-y divide-cardBorder/25">
                  <ToggleRow
                    label="Dimension labels"
                    hint="Print the axis titles"
                    checked={display.showAxisTitles}
                    onChange={(showAxisTitles) => updateDisplay({ showAxisTitles })}
                  />
                  <ToggleRow
                    label="Variance explained"
                    hint="Append each dimension's share to its axis title"
                    checked={display.showVariance}
                    disabled={!display.showAxisTitles}
                    onChange={(showVariance) => updateDisplay({ showVariance })}
                  />
                  <ToggleRow
                    label="Flip X"
                    hint="Mirror the X axis about the origin"
                    checked={display.flipX}
                    onChange={(flipX) => updateDisplay({ flipX })}
                  />
                  <ToggleRow
                    label="Flip Y"
                    hint="Mirror the Y axis about the origin"
                    checked={display.flipY}
                    onChange={(flipY) => updateDisplay({ flipY })}
                  />
                </div>
                <p className="mt-2 text-[11px] font-semibold leading-5 text-muted">
                  Flipping mirrors the space about the origin — a rotation&apos;s sign is arbitrary, so this only changes how the plot reads.
                </p>
              </div>

              <div className="min-w-0 border-t border-cardBorder/40 pt-4">
                <SectionHeading>Plotted Points</SectionHeading>
                <NativeSelect label="Group By" value={activeGroupBy} onChange={setGroupBy}>
                  <option value="">None</option>
                  {groupByOptions.map((column) => <option key={column} value={column}>{column}</option>)}
                </NativeSelect>
                <p className="mt-2 text-[11px] font-semibold leading-5 text-muted">
                  Adds a mean point per value and colours trajectories. Draws traces only — the projection is unchanged.
                  {groupByOptions.length === 0 && " Map a metadata column (Model tab) to enable it."}
                </p>
                <div className="mt-2 divide-y divide-cardBorder/25">
                  <SliderRow
                    label="Scale units"
                    value={display.unitScale}
                    min={enaPlotScaleRange.min}
                    max={enaPlotScaleRange.max}
                    step={0.1}
                    format={(value) => `${value.toFixed(1)}x`}
                    onChange={(unitScale) => updateDisplay({ unitScale })}
                  />
                  <ToggleRow
                    label="Unit labels"
                    hint="Label unit points — suppressed anyway on a crowded plot"
                    checked={display.showUnitLabels}
                    onChange={(showUnitLabels) => updateDisplay({ showUnitLabels })}
                  />
                  <ToggleRow
                    label="Group labels"
                    hint="Label the group mean points"
                    checked={display.showGroupLabels}
                    disabled={!activeGroupBy}
                    onChange={(showGroupLabels) => updateDisplay({ showGroupLabels })}
                  />
                </div>
              </div>

              <div className="min-w-0 border-t border-cardBorder/40 pt-4">
                <SectionHeading>Network Graph</SectionHeading>
                <p className="text-[11px] font-semibold leading-5 text-muted">
                  Nodes are sized by connectivity and edges by mean connection weight, following rENA&apos;s <code className="rounded bg-background/60 px-1">ena.plot.network</code> grammar.
                </p>
                <div className="mt-2 divide-y divide-cardBorder/25">
                  <ToggleRow
                    label="Code labels"
                    hint="Label the network nodes"
                    checked={display.showCodeLabels}
                    onChange={(showCodeLabels) => updateDisplay({ showCodeLabels })}
                  />
                  <ToggleRow
                    label="Show unconnected codes"
                    hint="Keep codes that have no connection left above the minimum weight"
                    checked={display.showUnconnectedCodes}
                    onChange={(showUnconnectedCodes) => updateDisplay({ showUnconnectedCodes })}
                  />
                  <ToggleRow
                    label="Connection weights"
                    hint="Print each drawn edge's mean weight beside it"
                    checked={display.showEdgeWeights}
                    onChange={(showEdgeWeights) => updateDisplay({ showEdgeWeights })}
                  />
                  <SliderRow
                    label="Scale edge weights"
                    value={display.edgeWeightScale}
                    min={enaPlotScaleRange.min}
                    max={enaPlotScaleRange.max}
                    step={0.1}
                    format={(value) => `${value.toFixed(1)}x`}
                    onChange={(edgeWeightScale) => updateDisplay({ edgeWeightScale })}
                  />
                </div>
                {/*
                  webENA's "minimum edge weight". SENA's workspace has always
                  had this as a threshold slider; the ENA route was the side
                  missing it. It filters which connections are drawn — the
                  projection and node positions are unchanged.
                */}
                <label className="mt-3 grid gap-1.5" data-visual-role="ena-min-edge-weight">
                  <span className="flex items-center justify-between text-[11px] font-bold text-muted">
                    <span>Minimum edge weight</span>
                    <span className="tabular-nums text-foreground">{minWeight.toFixed(3)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={0.2}
                    step={0.005}
                    value={minWeight}
                    onChange={(event) => setMinWeight(Number(event.currentTarget.value))}
                    data-testid="ena-min-edge-weight-slider"
                    className="w-full accent-[#56b09d]"
                  />
                  <span className="text-[11px] font-semibold leading-5 text-muted">
                    Hides connections at or below this mean weight. Filters the drawn network only — node positions and the projection are unchanged.
                  </span>
                </label>
              </div>

              <div className="min-w-0 border-t border-cardBorder/40 pt-4">
                <GhostButton
                  onClick={() => setDisplay(defaultEnaPlotDisplay)}
                  className="w-full justify-center px-2 py-1.5 text-xs"
                  title="Return every plot tool to its default"
                  data-visual-role="ena-plot-tools-reset"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset plot tools
                </GhostButton>
              </div>
            </div>
          )}

          {/*
            Stats, in webENA's four tabs: Comparison, Goodness of Fit,
            Variance, Theory & Methods. Every number here is computed from the
            set that is on screen — jena-js's own correlations and descriptives,
            plus the pairwise tests it does not carry.
          */}
          {mode === "stats" && (
            <div className="grid min-w-0 gap-4">
              <PanelTabs
                tabs={statsTabs}
                active={statsTab}
                onChange={setStatsTab}
                testId="ena-stats-tabs"
              />

              {!result ? (
                <p className="text-xs font-semibold leading-6 text-muted">
                  Run the model to see comparisons, goodness of fit, variance explained, and the methods write-up.
                </p>
              ) : statsTab === "comparison" ? (
                <div className="grid min-w-0 gap-3">
                  <SectionHeading className="mb-0">Comparison</SectionHeading>
                  {comparisonGroupOptions.length < 2 ? (
                    <p className="text-[11px] font-semibold leading-5 text-muted">
                      {activeGroupBy
                        ? `“${activeGroupBy}” has fewer than two groups in this model.`
                        : "Choose a grouping column under Plot Tools > Group By, then compare two of its groups here."}
                    </p>
                  ) : (
                    <>
                      <div className="grid min-w-0 grid-cols-2 gap-2">
                        <NativeSelect
                          label="Group A"
                          value={activeComparison.left}
                          onChange={(left) => setComparison((current) => ({ ...current, left }))}
                        >
                          {comparisonGroupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                        </NativeSelect>
                        <NativeSelect
                          label="Group B"
                          value={activeComparison.right}
                          onChange={(right) => setComparison((current) => ({ ...current, right }))}
                        >
                          {comparisonGroupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                        </NativeSelect>
                      </div>

                      {activeComparison.left === activeComparison.right ? (
                        <p className="text-[11px] font-semibold leading-5 text-muted">Pick two different groups.</p>
                      ) : (
                        <div className="grid min-w-0 gap-3" data-visual-role="ena-stats-comparison">
                          {comparisonResults.map((row) => (
                            <div key={row.dimension} className="min-w-0 rounded-lg border border-cardBorder/45">
                              <div className="flex items-baseline justify-between gap-2 border-b border-cardBorder/35 bg-background/45 px-3 py-2">
                                <span className="truncate text-xs font-black text-foreground">{row.dimension}</span>
                                <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-muted">
                                  n {row.left.n} v {row.right.n}
                                </span>
                              </div>
                              <dl className="grid gap-1.5 px-3 py-2 text-[11px]">
                                <StatLine
                                  label={`${row.left.group} mean`}
                                  value={`${formatStat(row.left.mean)} ± ${formatStat(row.left.sd)}`}
                                />
                                <StatLine
                                  label={`${row.right.group} mean`}
                                  value={`${formatStat(row.right.mean)} ± ${formatStat(row.right.sd)}`}
                                />
                                <StatLine
                                  label="Welch t"
                                  value={
                                    row.parametric.degenerate
                                      ? "—"
                                      : `t(${row.parametric.df.toFixed(1)}) = ${formatStat(row.parametric.t)}, p ${formatP(row.parametric.p)}`
                                  }
                                />
                                <StatLine
                                  label="Cohen's d"
                                  value={row.parametric.degenerate ? "—" : formatStat(row.parametric.cohensD)}
                                />
                                <StatLine
                                  label="Mann-Whitney"
                                  value={
                                    row.nonParametric.degenerate
                                      ? "—"
                                      : `U = ${formatStat(row.nonParametric.u, 1)}, p ${formatP(row.nonParametric.p)}`
                                  }
                                />
                                <StatLine
                                  label="p from"
                                  value={row.nonParametric.degenerate ? "—" : row.nonParametric.method === "exact" ? "exact distribution" : "normal approximation"}
                                />
                              </dl>
                            </div>
                          ))}
                          <p className="text-[11px] font-semibold leading-5 text-muted">
                            One observation per unit, taken from the plotted coordinates. Two-sided tests; the rank test uses the exact distribution when the samples are small and untied.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : statsTab === "fit" ? (
                <div className="grid min-w-0 gap-3" data-visual-role="ena-stats-goodness-of-fit">
                  <SectionHeading className="mb-0">Goodness of Fit</SectionHeading>
                  <div className="min-w-0 divide-y divide-cardBorder/25 rounded-lg border border-cardBorder/45">
                    {goodnessOfFit.map((row) => (
                      <div key={row.dimension} className="min-w-0 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-black text-foreground">{row.dimension}</span>
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-muted/75">
                            {row.pearson >= 0.9 ? "strong" : row.pearson >= 0.7 ? "adequate" : "weak"}
                          </span>
                        </div>
                        <dl className="mt-1 grid gap-1 text-[11px]">
                          <StatLine label="Pearson" value={`${formatStat(row.pearson, 3)} [${formatStat(row.pearsonLower, 3)}, ${formatStat(row.pearsonUpper, 3)}]`} />
                          <StatLine label="Spearman" value={formatStat(row.spearman, 3)} />
                        </dl>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold leading-5 text-muted">
                    Correlation between each unit&apos;s position in the high-dimensional space and its plotted position. Above 0.9 is the conventional bar for reporting a projection as a faithful summary.
                  </p>
                </div>
              ) : statsTab === "variance" ? (
                <div className="grid min-w-0 gap-3">
                  <SectionHeading className="mb-0">Variance</SectionHeading>
                  {/*
                    Read from set.variance, the same source the plot axes use.
                    summary.variance renormalizes across the displayed
                    dimensions only, so driving this panel from it put two
                    different percentages for one dimension on screen at once
                    — 62.6% here against 44.1% on the axis. summary.variance
                    keeps its own convention and its fixture; the UI just stops
                    mixing the two.
                  */}
                  <div className="grid gap-2">
                    {result.summary.dimensions.map((dimension) => {
                      const value = result.set.variance[dimension] ?? 0;
                      return (
                        <div key={dimension} className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-2 text-xs">
                          <span className="truncate font-black text-foreground">{dimension}</span>
                          <span className="h-1.5 rounded-full bg-background/70">
                            <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(2, value * 100)}%`, backgroundColor: TEAL }} />
                          </span>
                          <span className="text-right font-bold text-muted">{(value * 100).toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] font-semibold leading-5 text-muted">
                    Share across all rotated dimensions, matching rENA and the plot axes.
                  </p>
                  <div className="border-t border-cardBorder/40 pt-3">
                    <SectionHeading>Model</SectionHeading>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        ["Rows", result.summary.rows],
                        ["Units", result.summary.units],
                        ["Codes", result.summary.codes],
                        ["Runtime", `${result.summary.elapsedMs}ms`],
                        ["Path", result.summary.runtime]
                      ].map(([label, value]) => (
                        <Card key={String(label)} className="flex min-w-0 items-center justify-between px-3 py-2">
                          <dt className="truncate font-semibold text-muted">{label}</dt>
                          <dd className="truncate font-black text-foreground">{value}</dd>
                        </Card>
                      ))}
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="grid min-w-0 gap-3" data-visual-role="ena-stats-methods">
                  <div className="flex items-center justify-between gap-2">
                    <SectionHeading className="mb-0">Theory &amp; Methods</SectionHeading>
                    <GhostButton
                      onClick={copyMethodsWriteUp}
                      className="px-2 py-1 text-[11px]"
                      title="Copy the write-up to the clipboard"
                      data-visual-role="ena-copy-methods"
                    >
                      {methodsCopied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {methodsCopied ? "Copied" : "Copy"}
                    </GhostButton>
                  </div>
                  <p className="whitespace-pre-line rounded-lg border border-cardBorder/45 bg-background/35 px-3 py-2.5 text-[11px] font-semibold leading-5 text-foreground/80">
                    {methodsWriteUp}
                  </p>
                  <p className="text-[11px] font-semibold leading-5 text-muted">
                    Generated from the model that is loaded, not a template — the parameters, counts, and shares are this run&apos;s.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Central plot — always visible. The column owns its own vertical scroll
          so the Data View drawer extends downward inside the workbench instead
          of stretching the page. */}
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cardBorder/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black uppercase tracking-[0.14em] text-foreground">ENA Projection</span>
            {/* Compact zoom actions near the plot title (webENA plot-tools pattern). */}
            <div className="flex items-center rounded border border-cardBorder/60 bg-background/40 text-foreground/80">
              <button
                onClick={zoomOut}
                disabled={!result || zoom <= 0.6}
                aria-label="Zoom out"
                title="Zoom out"
                className="grid h-7 w-7 place-items-center rounded-l transition hover:text-foreground disabled:opacity-35"
                data-visual-role="ena-zoom-out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={resetZoom}
                disabled={!result}
                title="Reset zoom"
                className="min-w-[3rem] border-x border-cardBorder/60 px-1 py-1 text-center text-[11px] font-bold tabular-nums transition hover:text-foreground disabled:opacity-35"
                data-visual-role="ena-zoom-reset"
                data-plot-zoom={zoom.toFixed(2)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={!result || zoom >= 4}
                aria-label="Zoom in"
                title="Zoom in"
                className="grid h-7 w-7 place-items-center rounded-r transition hover:text-foreground disabled:opacity-35"
                data-visual-role="ena-zoom-in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded border border-cardBorder/60 bg-background/40 p-0.5">
              {[
                { value: "worker" as const, label: "Worker", icon: Zap },
                { value: "api" as const, label: "API", icon: Server }
              ].map((item) => {
                const Icon = item.icon;
                const active = runtime === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setRuntime(item.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-bold transition",
                      active ? "text-white" : "text-muted hover:text-foreground"
                    )}
                    style={active ? { backgroundColor: TEAL } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" /> {item.label}
                  </button>
                );
              })}
            </div>
            {isRunning ? (
              <GhostButton onClick={cancelAnalysis}>
                <Square className="h-4 w-4" /> Cancel
              </GhostButton>
            ) : (
              <TealButton disabled={Boolean(validationMessage)} onClick={runAnalysis}>
                <Play className="h-4 w-4" /> Run jENA
              </TealButton>
            )}
            <GhostButton
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </GhostButton>
            <GhostButton onClick={exportResultJson} className={cn(!result && "pointer-events-none opacity-40")} title="Download result JSON">
              <Download className="h-4 w-4" /> JSON
            </GhostButton>
          </div>
        </div>

        {/* Alerts strip. */}
        {(isRunning || validationMessage || error || (result?.warnings.length ?? 0) > 0) && (
          <div className="grid gap-2 px-4 pt-3">
            {isRunning && (
              <div className="flex items-center gap-3 rounded border border-cardBorder/50 bg-background/40 px-3 py-2 text-sm font-bold text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: TEAL }} />
                Running {runtime === "worker" ? "in browser worker" : "through API"}
                {progress !== null && <span className="ml-auto" style={{ color: TEAL }}>{Math.round(progress * 100)}%</span>}
              </div>
            )}
            {validationMessage && (
              <div className="flex gap-3 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-600 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {validationMessage}
              </div>
            )}
            {error && (
              <div className="flex gap-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            {result?.warnings.map((warning) => (
              <div key={warning} className="flex gap-3 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-600 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
              </div>
            ))}
          </div>
        )}

        {/* Plot surface — stays visible; empty state is a prerequisite checklist.
            The plot panel is bounded (max-width + max-height) and centred so the
            graph reads at a reasonable size instead of stretching to the full
            main-area width. Zoom magnifies within this fixed panel. */}
        <div className="relative min-h-[24rem] flex-1 p-4">
          <div className="mx-auto flex h-full max-h-[34rem] min-h-[22rem] w-full max-w-2xl items-center justify-center overflow-hidden rounded-lg border border-cardBorder/50 bg-card p-2">
            {result && displayedPlotModel ? (
              <EnaPlot
                model={displayedPlotModel}
                variance={displayedVariance}
                ink={displayedInk}
                zoom={zoom}
                className="h-full w-full"
              />
            ) : (
              <div className="max-w-sm px-6 py-10 text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-cardBorder/60 text-muted">
                  <Network className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground">No model yet</h3>
                <ul className="mt-4 grid gap-2 text-left text-sm">
                  {prerequisites.map((item) => (
                    <li key={item.label} className="flex items-center gap-2">
                      <CheckCircle2 className={cn("h-4 w-4 shrink-0", item.done ? "text-foreground" : "text-muted/40")} style={item.done ? { color: TEAL } : undefined} />
                      <span className={cn(item.done ? "text-foreground/80" : "text-muted")}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs font-semibold leading-5 text-muted">
                  {validationMessage ? "Complete the checklist in the Model tab, then Run jENA." : "Ready — press Run jENA above."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Data View — collapsible bottom drawer (source rows, then points +
            connection counts). This is where a wide grid belongs: it has the
            main area's full width, so the source table is read here instead of
            through a horizontal scrollbar in the 340px panel.
            The toggle and the export buttons are siblings, never nested, so the
            markup stays valid (a button cannot contain a button). */}
        <div ref={dataViewRef} className="border-t border-cardBorder/50">
          <div className="flex items-center justify-between pr-4">
            <button
              onClick={() => setDataViewOpen((open) => !open)}
              disabled={!result && parsed.rows.length === 0}
              aria-expanded={dataViewOpen}
              className="flex flex-1 items-center justify-between px-4 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-foreground disabled:opacity-45"
              data-visual-role="ena-data-view-toggle"
            >
              <span className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-muted" /> Data View
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", dataViewOpen && "rotate-180")} />
            </button>
            {result && (
              <span className="flex gap-1.5 pl-3">
                <GhostButton onClick={exportPointsCsv} className="px-2 py-1 text-[11px]" title="Download points CSV">
                  <Download className="h-3 w-3" /> Points
                </GhostButton>
                <GhostButton onClick={exportConnectionsCsv} className="px-2 py-1 text-[11px]" title="Download connection counts CSV">
                  <Download className="h-3 w-3" /> Connections
                </GhostButton>
              </span>
            )}
          </div>
          {dataViewOpen && (
            /* Stacked, not side by side: a half-width column is narrow enough
               that Connection Counts needs a sideways drag, while the full
               main-area width fits every table outright. */
            <div className="grid min-w-0 gap-5 px-4 pb-5">
              {parsed.rows.length > 0 && (
                <div className="min-w-0">
                  <SectionHeading>Source Rows</SectionHeading>
                  <DataTable rows={parsed.rows} maxRows={8} maxColumns={9} />
                </div>
              )}
              {result && (
                <>
                  <div className="min-w-0">
                    <SectionHeading>Points</SectionHeading>
                    <DataTable rows={result.set.points} maxRows={8} maxColumns={7} />
                  </div>
                  <div className="min-w-0">
                    <SectionHeading>Connection Counts</SectionHeading>
                    <DataTable rows={result.set.connectionCounts} maxRows={8} maxColumns={7} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
