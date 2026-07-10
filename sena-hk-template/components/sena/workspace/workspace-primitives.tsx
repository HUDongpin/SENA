import type {
  ElementType,
  ReactNode
} from "react";
import { cn } from "@/lib/utils";

export function Panel({
  id,
  title,
  icon: Icon,
  children,
  className
}: {
  id?: string;
  title: string;
  icon: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("glass-panel min-w-0 scroll-mt-24 rounded-lg p-5", className)}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyanGlow/12 text-cyanGlow">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function MetricCell({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div data-testid={testId} className="min-w-0 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="truncate text-xl font-black text-foreground">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

export function Slider({
  label,
  value,
  testId,
  onChange
}: {
  label: string;
  value: number;
  testId?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-black text-foreground">{label}</span>
        <span className="font-semibold text-muted">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-2 accent-cyanGlow"
        data-testid={testId}
      />
    </label>
  );
}

export function IntegerControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          const fallback = Number.isFinite(parsed) ? parsed : min;
          onChange(Math.max(min, Math.min(max, Math.round(fallback / step) * step)));
        }}
        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-black text-foreground outline-none focus:border-cyanGlow"
      />
    </label>
  );
}

export function MappingSelect({
  label,
  value,
  columns,
  required,
  onChange
}: {
  label: string;
  value: string;
  columns: string[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      <span className="flex items-center justify-between gap-2">
        {label}
        {required && <span className="text-[0.65rem] font-black uppercase text-cyanGlow">Required</span>}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
      >
        <option value="">Unmapped</option>
        {columns.map((column) => (
          <option key={column} value={column}>{column}</option>
        ))}
      </select>
    </label>
  );
}
