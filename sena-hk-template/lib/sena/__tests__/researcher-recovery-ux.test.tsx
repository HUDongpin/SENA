import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataContractAuditPanel } from "../../../components/sena/workspace/data-contract-audit-panel";
import { EvidenceLedgerPanel } from "../../../components/sena/workspace/evidence-ledger-panel";
import { Inspector } from "../../../components/sena/workspace/inspector-panel";
import {
  formatResearcherImportError,
  RESEARCHER_FIVE_TABLE_RECOVERY,
  RESEARCHER_IMPORT_RECOVERY,
  WorkspaceDataImportFeedbackSection
} from "../../../components/sena/workspace/workspace-data-import-feedback-section";
import { WorkspaceDataImportPanel } from "../../../components/sena/workspace/workspace-data-import-panel";
import { CentralFusionPlotViewPanel } from "../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel";
import { WorkspaceSecondaryComparisonLens } from "../../../components/sena/workspace/workspace-secondary-comparison-lens";
import { plotViewOptions } from "../../../components/sena/workspace/workspace-static-config";
import { buildSenaDataContractAudit } from "../data-contract-audit";
import { buildSenaEnaManifest } from "../ena-manifest";
import { createEmptySenaDataset } from "../import";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildEdgeStrokeScale } from "../visual-encoding";
import type { SenaEvidenceLedger, SenaLayer } from "../types";

const emptyDataset = createEmptySenaDataset();
const emptyModel = buildSenaModel(emptyDataset);
const lessonModel = buildSenaModel(lessonStudySenaContract);
const layers: Record<SenaLayer, boolean> = { social: true, concept: true, bridge: true };

describe("researcher import error sanitization", () => {
  it("keeps class-stable import failures unchanged", () => {
    expect(formatResearcherImportError(new Error("No supported SENA import tables were found.")))
      .toBe("No supported SENA import tables were found.");
    expect(formatResearcherImportError(new Error("CSV is empty."))).toBe("CSV is empty.");
    expect(formatResearcherImportError(undefined, "SENA import failed.")).toBe("SENA import failed.");
  });

  it("does not echo JSON parse snippets or quoted cell values", () => {
    expect(formatResearcherImportError(new SyntaxError("Unexpected token 's' in JSON at position 10")))
      .toBe("The JSON file could not be parsed. Use the contract template or load the lesson-study sample.");
    expect(formatResearcherImportError(new Error('broken.json: JSON could not be parsed: Unexpected token "sk-live-secret"')))
      .toBe("broken.json: JSON could not be parsed. Use the contract template or load the lesson-study sample.");
    expect(formatResearcherImportError(new Error('people row 2 has non-numeric value "sk-live-secret"; using 1.')))
      .toBe("people row 2 has non-numeric value a cell value; using 1.");
  });
});

describe("empty import, contract-audit, and inspector recovery UX", () => {
  it("shows actionable recovery copy on the import error plate", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceDataImportFeedbackSection, {
      importError: "No supported SENA import tables were found.",
      importErrorAttempt: 1,
      uploadedTables: [],
      warnings: [],
      onTableChange: () => undefined,
      onFieldChange: () => undefined
    }));

    expect(markup).toContain('data-testid="workspace-import-error"');
    expect(markup).toContain('data-testid="workspace-import-error-recovery"');
    expect(markup).toContain("No supported SENA import tables were found.");
    expect(markup).toContain(RESEARCHER_IMPORT_RECOVERY);
    expect(markup).not.toContain("sk-");
  });

  it("guides recovery after Clear when no people or codes are loaded", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceDataImportPanel, {
      model: emptyModel,
      timelineModel: emptyModel,
      dataset: emptyDataset,
      importMessage: "No SENA contract loaded.",
      fileAccept: ".csv,.json",
      isLoadingSample: false,
      onLoadSample: () => undefined,
      onContractUpload: () => undefined,
      onExportContractTemplate: () => undefined,
      onClearContract: () => undefined,
      children: null
    }));

    expect(markup).toContain("No SENA contract loaded.");
    expect(markup).toContain('data-testid="workspace-empty-import-state"');
    expect(markup).toContain(RESEARCHER_FIVE_TABLE_RECOVERY);
  });

  it("tells a reviewer how to repair an invalid five-table contract audit", () => {
    const markup = renderToStaticMarkup(createElement(DataContractAuditPanel, {
      audit: buildSenaDataContractAudit(emptyDataset),
      onExport: () => undefined
    }));

    expect(markup).toContain('data-testid="data-contract-audit-recovery"');
    expect(markup).toContain("The five-table contract is incomplete.");
    expect(markup).toContain(RESEARCHER_FIVE_TABLE_RECOVERY);
    expect(markup).toContain("needs-review");
  });

  it("keeps Dual Lens until selection and explains how to open Evidence Inspector", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceSecondaryComparisonLens, {
      currentModel: lessonModel,
      baselineModel: lessonModel
    }));

    expect(markup).toContain('data-testid="workspace-secondary-comparison-lens"');
    expect(markup).toContain('data-testid="evidence-inspector-empty-selection"');
    expect(markup).toContain("Click a person, concept, or typed edge on Fusion Canvas to open Evidence Inspector");
  });

  it("guides the inspector when a typed edge has no attached snippets", () => {
    const selected = { ...lessonModel.edges[0], evidence: [] };
    const markup = renderToStaticMarkup(createElement(Inspector, {
      selected,
      options: lessonModel.options,
      pairReport: lessonModel.pairReport,
      matrixFingerprints: [],
      edgeStrokeScale: buildEdgeStrokeScale([selected], new Map()),
      jenaConceptPairHandoffRows: [],
      jsnaSocialTieHandoffRows: []
    }));

    expect(markup).toContain('data-testid="sena-inspector"');
    expect(markup).toContain('data-testid="evidence-inspector-missing-evidence"');
    expect(markup).toContain("No evidence snippets are attached to this selection.");
  });

  it("explains an empty Evidence Ledger instead of leaving a blank list", () => {
    const ledger = {
      snippets: [],
      sourceCounts: {
        "social-edge": 0,
        "concept-edge": 0,
        "bridge-edge": 0,
        "pair-contribution": 0,
        "temporal-window": 0
      }
    } as unknown as SenaEvidenceLedger;
    const markup = renderToStaticMarkup(createElement(EvidenceLedgerPanel, {
      ledger,
      sourceFilter: "all",
      onSourceFilterChange: () => undefined,
      onExportJson: () => undefined
    }));

    expect(markup).toContain('data-testid="evidence-ledger-empty-state"');
    expect(markup).toContain("No evidence snippets in the current analysis window.");
    expect(markup).toContain("Load the lesson-study sample");
  });

  it("overlays empty-plot recovery without removing the Fusion Canvas contract hook", () => {
    const markup = renderToStaticMarkup(createElement(CentralFusionPlotViewPanel, {
      model: emptyModel,
      layout: "explanatory",
      jointEmbeddingOperator: "mds-schoenberg",
      onJointEmbeddingOperatorChange: () => undefined,
      enaManifest: buildSenaEnaManifest(emptyDataset),
      layers,
      threshold: 0.16,
      selectedId: "",
      revealedLabelIds: [],
      onCanvasSelect: () => undefined,
      fusionPlotZoom: 1,
      activePlotView: "fusion",
      isPlotSwitcherOpen: false,
      onPlotSwitcherToggle: () => undefined,
      onPlotViewSelect: () => undefined,
      plotViewOptions,
      alpha: 1,
      beta: 1,
      gamma: 1
    }));

    expect(markup).toContain('data-testid="sena-fusion-canvas"');
    expect(markup).toContain('data-testid="fusion-plot-empty-state"');
    expect(markup).toContain("Load the lesson-study sample, download the contract template, or upload the five SENA tables");
  });
});
