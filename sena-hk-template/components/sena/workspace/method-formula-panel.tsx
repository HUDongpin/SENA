import {
  Download,
  Eye,
  FileText
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type {
  SenaFusionMathAudit,
  SenaModel
} from "./analysis-runtime";
import { FusionMathAuditPanel } from "./fusion-math-audit-panel";
import { MetricCell } from "./workspace-primitives";

export type MethodFormulaPanelProps = {
  model: SenaModel;
  fusionMathAudit: SenaFusionMathAudit;
  onExportMathAudit: () => void;
  onExportMethodProtocol: () => void;
  onExportVisualGrammar: () => void;
};

function formatFormulaNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function matrixTotal(values: number[][]) {
  return values.reduce((total, row) => total + row.reduce((rowTotal, value) => rowTotal + value, 0), 0);
}

function upperTriangleTotal(values: number[][]) {
  let total = 0;
  values.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (columnIndex > rowIndex) total += value;
    });
  });
  return total;
}

export function MethodFormulaPanel({
  model,
  fusionMathAudit,
  onExportMathAudit,
  onExportMethodProtocol,
  onExportVisualGrammar
}: MethodFormulaPanelProps) {
  const options = model.options;
  const peopleCount = model.people.length;
  const codeCount = model.codes.length;
  const pairCount = model.matrices.G.pairs.length;
  const socialNormalized = upperTriangleTotal(model.matrices.S.normalized);
  const conceptNormalized = upperTriangleTotal(model.matrices.W.normalized);
  const bridgeNormalized = matrixTotal(model.matrices.B.normalized);
  const matrixFingerprints = fusionMathAudit.matrixFingerprints;
  const formatOptionalNumber = (value?: number) => (typeof value === "number" ? formatFormulaNumber(value) : "NA");
  const ledgerRows = [
    {
      id: "S",
      source: "jSNA / sna.js",
      dimensions: `${peopleCount}x${peopleCount}`,
      rawTotal: formatFormulaNumber(upperTriangleTotal(model.matrices.S.raw)),
      normalizedTotal: formatFormulaNumber(socialNormalized),
      activeTotal: formatFormulaNumber(socialNormalized * options.alpha),
      note: "social block"
    },
    {
      id: "W",
      source: "jENA aligned",
      dimensions: `${codeCount}x${codeCount}`,
      rawTotal: formatFormulaNumber(upperTriangleTotal(model.matrices.W.raw)),
      normalizedTotal: formatFormulaNumber(conceptNormalized),
      activeTotal: formatFormulaNumber(conceptNormalized * options.beta),
      note: "concept block"
    },
    {
      id: "B",
      source: "SENA bridge",
      dimensions: `${peopleCount}x${codeCount}`,
      rawTotal: formatFormulaNumber(matrixTotal(model.matrices.B.raw)),
      normalizedTotal: formatFormulaNumber(bridgeNormalized),
      activeTotal: formatFormulaNumber(bridgeNormalized * options.gamma),
      note: "off-diagonal block"
    },
    {
      id: "G",
      source: "G pair layer",
      dimensions: `${peopleCount}x${pairCount}`,
      rawTotal: formatFormulaNumber(matrixTotal(model.matrices.G.raw)),
      normalizedTotal: formatFormulaNumber(matrixTotal(model.matrices.G.normalized)),
      activeTotal: `${model.pairReport.filter((pair) => pair.totalContribution > 0).length} pairs`,
      note: "explanatory layer"
    },
    {
      id: "A_fusion",
      source: "A_fusion block matrix",
      dimensions: `${peopleCount + codeCount}x${peopleCount + codeCount}`,
      rawTotal: "S/W/B",
      normalizedTotal: "weighted",
      activeTotal: formatFormulaNumber((socialNormalized * options.alpha) + (conceptNormalized * options.beta) + (bridgeNormalized * options.gamma)),
      note: "fusion total"
    }
  ];

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-black uppercase text-cyanGlow">Fusion matrix</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onExportMethodProtocol} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <FileText className="h-4 w-4" /> Export method protocol
            </button>
            <button type="button" onClick={onExportVisualGrammar} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <Eye className="h-4 w-4" /> Export visual grammar
            </button>
            <button type="button" onClick={onExportMathAudit} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <Download className="h-4 w-4" /> Export math audit
            </button>
          </div>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-cardBorder/35 bg-slate-950/80 p-3 text-xs font-black leading-6 text-cyanGlow">
{`A_fusion = [ alpha*S      gamma*B_PC ]
           [ gamma*B_CP  beta*W     ]`}
        </pre>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricCell label="alpha SNA" value={formatFormulaNumber(options.alpha)} />
          <MetricCell label="beta ENA" value={formatFormulaNumber(options.beta)} />
          <MetricCell label="gamma bridge" value={formatFormulaNumber(options.gamma)} />
        </div>
      </div>

      <div data-testid="live-matrix-ledger" data-visual-role="sena-live-matrix-ledger" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Live matrix ledger</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              Current block dimensions and totals derived from the active SENA model.
            </div>
          </div>
          <div data-testid="live-matrix-ledger-normalization" className="inline-flex w-fit rounded-full border border-cardBorder/45 bg-background/45 px-3 py-1 text-xs font-black text-foreground">
            Normalization {options.normalization}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-cardBorder/35">
                <th className="px-2 py-2 font-black">Block</th>
                <th className="px-2 py-2 font-black">Runtime/source</th>
                <th className="px-2 py-2 font-black">Size</th>
                <th className="px-2 py-2 text-right font-black">Raw</th>
                <th className="px-2 py-2 text-right font-black">Normalized</th>
                <th className="px-2 py-2 text-right font-black">Active</th>
                <th className="px-2 py-2 font-black">Role</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={row.id} data-testid={`live-matrix-ledger-${row.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="border-b border-cardBorder/20 last:border-0">
                  <td className="px-2 py-2 font-black text-foreground">{row.id}</td>
                  <td className="px-2 py-2 font-semibold text-foreground/82">{row.source}</td>
                  <td className="px-2 py-2 font-semibold text-muted">{row.dimensions}</td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">{row.rawTotal}</td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">{row.normalizedTotal}</td>
                  <td className="px-2 py-2 text-right font-black text-cyanGlow">{row.activeTotal}</td>
                  <td className="px-2 py-2 font-semibold text-muted">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div data-testid="matrix-fingerprint-ledger" data-visual-role="sena-matrix-fingerprint-ledger" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Matrix fingerprints</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-muted">
              S/W/B/B_PC/B_CP/G/A_fusion fingerprints use sena-stable-fnv1a32/v1 so report, runtime bundle, and review packet handoffs can be checked against the same matrix results.
            </div>
          </div>
          <div className="inline-flex w-fit rounded-full border border-cardBorder/45 bg-background/45 px-3 py-1 text-xs font-black text-foreground">
            {matrixFingerprints.length} checksums
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-cardBorder/35">
                <th className="px-2 py-2 font-black">Matrix</th>
                <th className="px-2 py-2 font-black">Shape</th>
                <th className="px-2 py-2 font-black">Checksum</th>
                <th className="px-2 py-2 text-right font-black">Non-zero</th>
                <th className="px-2 py-2 text-right font-black">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrixFingerprints.map((fingerprint) => (
                <tr key={fingerprint.id} data-testid={`matrix-fingerprint-${fingerprint.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="border-b border-cardBorder/20 last:border-0">
                  <td className="px-2 py-2 font-black text-foreground">{fingerprint.id}</td>
                  <td className="px-2 py-2 font-semibold text-muted">{fingerprint.shape}</td>
                  <td className="px-2 py-2 font-mono text-[0.7rem] font-black text-cyanGlow">{fingerprint.checksum}</td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">
                    {fingerprint.nonZero.values ?? fingerprint.nonZero.normalized ?? fingerprint.nonZero.raw ?? "NA"}
                  </td>
                  <td className="px-2 py-2 text-right font-black text-foreground/86">
                    {formatOptionalNumber(fingerprint.totals.values ?? fingerprint.totals.normalized ?? fingerprint.totals.raw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 text-sm leading-6 text-muted">
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">S:</span> person-person social ties from interactions, analyzed with local sna.js metrics.
        </div>
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">W:</span> code-code epistemic co-occurrence from stanza/window coded segments, aligned with jENA manifest output.
        </div>
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">B:</span> person-code association bridge linking actors to coded epistemic evidence.
        </div>
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <span className="font-black text-foreground">G:</span> person-code-pair association for explaining who was exposed to ENA-style links such as Evidence-Explanation.
        </div>
      </div>

      <div className="sena-warning-panel rounded-lg p-3 text-xs font-semibold leading-5">
        The fusion matrix is a typed heterogeneous adjacency model. It supports exploratory graph analysis and reporting, but it is not a causal model or an inferential test without additional study design and validation.
      </div>

      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-xs font-semibold leading-5 text-muted">
        Method protocol and visual grammar exports record the S/W/B/G layer definitions, `A_fusion` block equation, selected weights, Temporal Fusion Arc story view, A1 Inner Solid Mesh canvas grammar, local jENA/jSNA runtime provenance, the metric provenance companion artifact, and interpretation guardrails.
      </div>

      <FusionMathAuditPanel audit={fusionMathAudit} />
    </div>
  );
}
