import { EvidenceLedgerPanel } from "./evidence-ledger-panel";
import type { CentralEvidenceLedgerViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralEvidenceLedgerViewPanel({
  evidenceLedger,
  evidenceSourceFilter,
  onEvidenceSourceFilterChange,
  onExportEvidenceLedgerJson
}: CentralEvidenceLedgerViewPanelProps) {
  return (
    <EvidenceLedgerPanel
      ledger={evidenceLedger}
      sourceFilter={evidenceSourceFilter}
      onSourceFilterChange={onEvidenceSourceFilterChange}
      onExportJson={onExportEvidenceLedgerJson}
    />
  );
}
