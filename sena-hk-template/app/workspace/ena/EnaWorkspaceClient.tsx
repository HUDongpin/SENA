"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createENAWorkerClient, type ENAWorkerClient, type ENAWorkerProgress, type ENAWorkerRunHandle } from "jena-js/browser";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  Database,
  Download,
  FileUp,
  Loader2,
  Play,
  RotateCcw,
  Server,
  Square,
  Wand2,
  Zap
} from "lucide-react";
import { EnaPlot } from "@/components/ena/EnaPlot";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import { parseCsv, rowsToCsv, type ParsedCsv } from "@/lib/ena/csv";
import { buildEnaRunResult } from "@/lib/ena/results";
import { sampleEnaCsv } from "@/lib/ena/sample-data";
import type { EnaMapping, EnaRunOptions, EnaRunRequest, EnaRunResult, EnaRuntime } from "@/lib/ena/types";
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

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Panel({
  title,
  icon: Icon,
  children,
  className
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass-panel min-w-0 rounded-2xl p-5", className)}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyanGlow/12 text-cyanGlow">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-black uppercase tracking-[0.18em] text-muted">{children}</label>;
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
      <div className="grid max-h-52 min-w-0 grid-cols-2 gap-2 overflow-auto pr-1 text-xs sm:grid-cols-3">
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

function DataTable({
  rows,
  maxRows = 7,
  maxColumns = 9
}: {
  rows: Array<Record<string, unknown>>;
  maxRows?: number;
  maxColumns?: number;
}) {
  const headers = useMemo(() => {
    const all = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()));
    return all.slice(0, maxColumns);
  }, [rows, maxColumns]);

  if (rows.length === 0) {
    return <div className="rounded-lg border border-cardBorder/45 bg-background/35 p-4 text-sm text-muted">No rows.</div>;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-cardBorder/45">
      <div className="min-w-0 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-background/65 text-muted">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap border-b border-cardBorder/35 px-3 py-2 font-black">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, maxRows).map((row, rowIndex) => (
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
      {(rows.length > maxRows || headers.length < Object.keys(rows[0] ?? {}).length) && (
        <div className="bg-background/45 px-3 py-2 text-xs font-semibold text-muted">
          Showing {Math.min(rows.length, maxRows)} of {rows.length} rows.
        </div>
      )}
    </div>
  );
}

export function EnaWorkspaceClient() {
  const [parsed, setParsed] = useState<ParsedCsv>(initialParsed);
  const [mapping, setMapping] = useState<EnaMapping>(initialMapping);
  const [options, setOptions] = useState<Required<EnaRunOptions>>(defaultEnaOptions);
  const [runtime, setRuntime] = useState<EnaRuntime>("worker");
  const [result, setResult] = useState<EnaRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string>("Sample lesson-study dataset loaded.");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const workerBundleRef = useRef<WorkerBundle | null>(null);
  const runHandleRef = useRef<ENAWorkerRunHandle | null>(null);

  useEffect(() => {
    return () => {
      workerBundleRef.current?.client.terminate();
      workerBundleRef.current = null;
    };
  }, []);

  const request = useMemo<EnaRunRequest>(() => ({
    rows: parsed.rows,
    mapping,
    options
  }), [mapping, options, parsed.rows]);

  const validationMessage = useMemo(() => {
    try {
      prepareEnaRun(request);
      return null;
    } catch (validationError) {
      return validationError instanceof Error ? validationError.message : "Current ENA mapping is invalid.";
    }
  }, [request]);

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
    return buildEnaRunResult(set, parsed.rows.length, "worker", Math.round(performance.now() - startedAt), prepared.warnings);
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

  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-cyanGlow">jENA Workspace</div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">Run ENA analysis in SENA.HK</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
              CSV-based ENA analysis powered by the local jENA JavaScript engine.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={loadSampleData} className={buttonStyles({ variant: "secondary" })}>
              <Wand2 className="h-4 w-4" /> Sample data
            </button>
            <label className={buttonStyles({ variant: "secondary" })}>
              <FileUp className="h-4 w-4" /> Upload CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-5">
            <Panel title="Dataset" icon={Database}>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Rows", parsed.rows.length],
                  ["Columns", parsed.headers.length],
                  ["Codes", mapping.codes.length]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-cardBorder/45 bg-background/40 p-3">
                    <div className="text-xl font-black text-foreground">{value}</div>
                    <div className="text-xs font-bold text-muted">{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-muted">{csvMessage}</p>
              <div className="mt-4">
                <DataTable rows={parsed.rows} maxRows={5} maxColumns={6} />
              </div>
            </Panel>

            <Panel title="Column Mapping" icon={Braces}>
              <div className="grid gap-4">
                <ColumnChips headers={parsed.headers} mapping={mapping} onToggle={toggleColumn} />
                <ColumnSelect label="Units" headers={parsed.headers} selected={mapping.units} onChange={(units) => updateMapping({ units })} />
                <ColumnSelect label="Conversation" headers={parsed.headers} selected={mapping.conversation} onChange={(conversation) => updateMapping({ conversation })} />
                <ColumnSelect label="Codes" headers={parsed.headers} selected={mapping.codes} onChange={(codes) => updateMapping({ codes })} />
                <ColumnSelect label="Metadata" headers={parsed.headers} selected={mapping.metadata ?? []} onChange={(metadata) => updateMapping({ metadata })} />
              </div>
            </Panel>

            <Panel title="ENA Parameters" icon={Zap}>
              <div className="grid gap-4">
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
                <div className="grid min-w-0 grid-cols-3 gap-3">
                  <NumberInput label="Back" value={options.windowSizeBack} min={1} onChange={(windowSizeBack) => updateOptions({ windowSizeBack })} />
                  <NumberInput label="Forward" value={options.windowSizeForward} min={0} onChange={(windowSizeForward) => updateOptions({ windowSizeForward })} />
                  <NumberInput label="Dims" value={options.dimensions} min={1} onChange={(dimensions) => updateOptions({ dimensions })} />
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid min-w-0 content-start gap-5">
            <Panel title="Run" icon={Play}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex rounded-lg border border-cardBorder/55 bg-background/45 p-1">
                  {[
                    { value: "worker" as const, label: "Browser Worker", icon: Zap },
                    { value: "api" as const, label: "Next API", icon: Server }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        onClick={() => setRuntime(item.value)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-black transition",
                          runtime === item.value ? "bg-cyanGlow text-slate-950 shadow-glow" : "text-muted hover:bg-card/65 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" /> {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3">
                  {isRunning ? (
                    <button onClick={cancelAnalysis} className={buttonStyles({ variant: "secondary" })}>
                      <Square className="h-4 w-4" /> Cancel
                    </button>
                  ) : (
                    <button disabled={Boolean(validationMessage)} onClick={runAnalysis} className={buttonStyles()}>
                      <Play className="h-4 w-4" /> Run jENA
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setResult(null);
                      setError(null);
                    }}
                    className={buttonStyles({ variant: "ghost" })}
                  >
                    <RotateCcw className="h-4 w-4" /> Clear
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {isRunning && (
                  <div className="flex items-center gap-3 rounded-lg border border-cyanGlow/35 bg-cyanGlow/10 p-3 text-sm font-bold text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-cyanGlow" />
                    Running {runtime === "worker" ? "in browser worker" : "through API"}
                    {progress !== null && <span className="ml-auto text-cyanGlow">{Math.round(progress * 100)}%</span>}
                  </div>
                )}
                {validationMessage && (
                  <div className="flex gap-3 rounded-lg border border-amber-400/35 bg-amber-400/10 p-3 text-sm font-semibold text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {validationMessage}
                  </div>
                )}
                {error && (
                  <div className="flex gap-3 rounded-lg border border-red-400/35 bg-red-400/10 p-3 text-sm font-semibold text-red-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
                {result?.warnings.map((warning) => (
                  <div key={warning} className="flex gap-3 rounded-lg border border-amber-400/35 bg-amber-400/10 p-3 text-sm font-semibold text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
                  </div>
                ))}
              </div>
            </Panel>

            {result ? (
              <>
                <Panel title="Projection" icon={Zap}>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                      <div className="rounded-lg border border-cardBorder/45 bg-background/40 p-3">
                        <div className="text-xl font-black text-foreground">{result.summary.rows}</div>
                        <div className="text-xs font-bold text-muted">Rows</div>
                      </div>
                      <div className="rounded-lg border border-cardBorder/45 bg-background/40 p-3">
                        <div className="text-xl font-black text-foreground">{result.summary.units}</div>
                        <div className="text-xs font-bold text-muted">Units</div>
                      </div>
                      <div className="rounded-lg border border-cardBorder/45 bg-background/40 p-3">
                        <div className="text-xl font-black text-foreground">{result.summary.codes}</div>
                        <div className="text-xs font-bold text-muted">Codes</div>
                      </div>
                      <div className="rounded-lg border border-cardBorder/45 bg-background/40 p-3">
                        <div className="text-xl font-black text-foreground">{result.summary.elapsedMs}ms</div>
                        <div className="text-xs font-bold text-muted">Runtime</div>
                      </div>
                      <div className="rounded-lg border border-cardBorder/45 bg-background/40 p-3">
                        <div className="text-xl font-black text-foreground uppercase">{result.summary.runtime}</div>
                        <div className="text-xs font-bold text-muted">Path</div>
                      </div>
                    </div>
                    <div className="min-h-[24rem] overflow-hidden rounded-lg border border-cardBorder/45 bg-background/35 p-2">
                      <EnaPlot model={result.plotModel} />
                    </div>
                  </div>
                </Panel>

                <Panel title="Results" icon={Database}>
                  <div className="mb-4 flex flex-wrap gap-3">
                    <button onClick={exportResultJson} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <Download className="h-4 w-4" /> JSON
                    </button>
                    <button onClick={exportPointsCsv} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <Download className="h-4 w-4" /> Points CSV
                    </button>
                    <button onClick={exportConnectionsCsv} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <Download className="h-4 w-4" /> Connections CSV
                    </button>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-muted">Variance</h3>
                      <div className="grid gap-2">
                        {Object.entries(result.summary.variance).map(([dimension, value]) => (
                          <div key={dimension} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-3 text-sm">
                            <span className="font-black text-foreground">{dimension}</span>
                            <span className="h-2 rounded-full bg-background/70">
                              <span className="block h-2 rounded-full bg-gradient-to-r from-cyanGlow to-magentaGlow" style={{ width: `${Math.max(2, value * 100)}%` }} />
                            </span>
                            <span className="text-right font-bold text-muted">{(value * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-muted">Dimensions</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.summary.dimensions.map((dimension) => (
                          <span key={dimension} className="rounded-lg border border-cardBorder/45 bg-background/45 px-3 py-2 text-sm font-black text-foreground">
                            {dimension}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-muted">Points</h3>
                      <DataTable rows={result.set.points} maxRows={8} maxColumns={7} />
                    </div>
                    <div>
                      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-muted">Connection Counts</h3>
                      <DataTable rows={result.set.connectionCounts} maxRows={8} maxColumns={7} />
                    </div>
                  </div>
                </Panel>
              </>
            ) : (
              <Panel title="Ready" icon={CheckCircle2}>
                <div className="rounded-lg border border-cardBorder/45 bg-background/35 p-6 text-sm leading-7 text-muted">
                  jENA is ready with {parsed.rows.length} rows, {mapping.units.length} unit field, {mapping.conversation.length} conversation field, and {mapping.codes.length} code fields.
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
