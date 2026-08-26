import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ReportGenerator,
  type PublicationFormat
} from "../../../components/sena/workspace/report-generator";
import { WorkspaceReportSection } from "../../../components/sena/workspace/workspace-report-section";
import { useSenaFusionWorkspaceMainShellProps } from "../../../components/sena/workspace/use-sena-fusion-workspace-main-shell-props";
import {
  buildSenaModel,
  buildSenaReviewPacket,
  lessonStudySenaContract
} from "../index";

/**
 * The seven publication exports that `exportPublication` refuses while signed
 * out. Its refusal message renders in EnterpriseRuntimePanel, which sits on a
 * different tab, so the button group itself has to carry the disclosure.
 */
const PUBLICATION_TEST_IDS: readonly string[] = [
  "export-publication-html",
  "export-publication-svg",
  "export-publication-png",
  "export-publication-xlsx",
  "export-publication-docx",
  "export-publication-pdf",
  "export-publication-package"
];

const PUBLICATION_PREREQUISITE_NOTE_TEST_ID = "publication-export-prerequisite-note";

const model = buildSenaModel(lessonStudySenaContract);
const packet = buildSenaReviewPacket(model, {
  title: "Publication Access Gate Fixture",
  generatedAt: "2026-08-15T00:00:00.000Z",
  sourceDataset: lessonStudySenaContract
});
const bundle = packet.contents.runtimeBundle;

const noop = () => undefined;

function renderReportGenerator(access: { hasPublicationAccess: boolean; hasReliabilityDashboard?: boolean }) {
  return renderToStaticMarkup(
    <ReportGenerator
      model={model}
      completenessAudit={packet.contents.reportJson.completenessAudit}
      reviewPacketAudit={packet.reviewPacketAudit}
      pilotReadinessAudit={bundle.pilotReadinessAudit}
      claimReadinessGate={bundle.claimReadinessGate}
      codingReliabilityGate={bundle.codingReliabilityGate}
      developmentPlan={bundle.developmentPlan}
      demoVerification={bundle.demoVerification}
      demoVerificationCompatibilityAudit={bundle.demoVerificationCompatibilityAudit}
      productionPageContract={bundle.productionPageContract}
      onDemoManualReviewChange={noop}
      reportTitle="Lesson Study Pilot"
      onReportTitleChange={noop}
      reviewStatus="draft"
      onReviewStatusChange={noop}
      reviewer="Ms Lee"
      onReviewerChange={noop}
      interpretation=""
      onInterpretationChange={noop}
      limitations=""
      onLimitationsChange={noop}
      nextActions=""
      onNextActionsChange={noop}
      dataGovernanceIrbApprovalId=""
      onDataGovernanceIrbApprovalIdChange={noop}
      dataGovernanceConsentScope=""
      onDataGovernanceConsentScopeChange={noop}
      dataGovernanceRetentionPolicy=""
      onDataGovernanceRetentionPolicyChange={noop}
      dataGovernanceUsageConstraints=""
      onDataGovernanceUsageConstraintsChange={noop}
      dataGovernanceDataSteward=""
      onDataGovernanceDataStewardChange={noop}
      codingReliabilityStatus="not-documented"
      onCodingReliabilityStatusChange={noop}
      codingReliabilityReviewer=""
      onCodingReliabilityReviewerChange={noop}
      codingScheme=""
      onCodingSchemeChange={noop}
      unitOfCoding=""
      onUnitOfCodingChange={noop}
      coderCount={2}
      onCoderCountChange={noop}
      agreementMetric=""
      onAgreementMetricChange={noop}
      agreementValue=""
      onAgreementValueChange={noop}
      adjudicationNotes=""
      onAdjudicationNotesChange={noop}
      reliabilityLimitations=""
      onReliabilityLimitationsChange={noop}
      onExportWalkthroughJson={noop}
      onExportVerificationJson={noop}
      onExportVerificationCompatibilityJson={noop}
      onExportProductionPageContractJson={noop}
      onExportProjectSnapshot={noop}
      onExportDevelopmentPlanJson={noop}
      onExportEnaReport={noop}
      onExportRuntimeBundleJson={noop}
      onExportRuntimeConsistencyAuditJson={noop}
      onExportReadinessJson={noop}
      onExportCodingReliabilityJson={noop}
      onExportReliabilityDashboardJson={noop}
      onExportClaimReadinessJson={noop}
      onExportReviewPacket={noop}
      onExportJson={noop}
      onExportMarkdown={noop}
      onReliabilityUpload={(_event: ChangeEvent<HTMLInputElement>) => undefined}
      hasReliabilityDashboard={access.hasReliabilityDashboard ?? true}
      onExportPublication={(_format: PublicationFormat) => undefined}
      hasPublicationAccess={access.hasPublicationAccess}
    />
  );
}

function buttonTag(markup: string, testId: string) {
  const tag = markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Report generator rendered no <button> for ${testId}.`);
  return tag;
}

function isDisabled(markup: string, testId: string) {
  return /\sdisabled(?:=|\s|\/|>)/.test(buttonTag(markup, testId));
}

describe("publication export sign-in gate", () => {
  it("disables every publication export button while signed out", () => {
    const markup = renderReportGenerator({ hasPublicationAccess: false });

    for (const testId of PUBLICATION_TEST_IDS) {
      expect(isDisabled(markup, testId), `${testId} is clickable while signed out`).toBe(true);
    }
  });

  it("tells the signed-out reviewer why the publication exports are dead", () => {
    const markup = renderReportGenerator({ hasPublicationAccess: false });

    expect(markup).toContain(`data-testid="${PUBLICATION_PREREQUISITE_NOTE_TEST_ID}"`);
    expect(markup).toContain("Sign in and save or open a server-side project to export publication formats.");
  });

  it("enables every publication export button once signed in", () => {
    const markup = renderReportGenerator({ hasPublicationAccess: true });

    for (const testId of PUBLICATION_TEST_IDS) {
      expect(isDisabled(markup, testId), `${testId} stays disabled while signed in`).toBe(false);
    }
  });

  it("drops the sign-in note once signed in", () => {
    const markup = renderReportGenerator({ hasPublicationAccess: true });

    expect(markup).not.toContain(`data-testid="${PUBLICATION_PREREQUISITE_NOTE_TEST_ID}"`);
    expect(markup).not.toContain("Sign in and save or open a server-side project to export publication formats.");
  });

  it("leaves the exports that work signed out alone", () => {
    // A gate that disabled the whole export row would pass the signed-out case
    // above while breaking the local-only exports that never needed a session.
    const markup = renderReportGenerator({ hasPublicationAccess: false });

    for (const testId of ["export-demo-verification-compatibility", "export-project-snapshot"]) {
      expect(isDisabled(markup, testId), `${testId} lost its signed-out export`).toBe(false);
    }
  });

  it("keeps the publication gate and the reliability-dashboard gate independent", () => {
    const signedInWithoutDashboard = renderReportGenerator({
      hasPublicationAccess: true,
      hasReliabilityDashboard: false
    });
    expect(isDisabled(signedInWithoutDashboard, "export-reliability-dashboard")).toBe(true);
    expect(isDisabled(signedInWithoutDashboard, "export-publication-package")).toBe(false);

    const signedOutWithDashboard = renderReportGenerator({
      hasPublicationAccess: false,
      hasReliabilityDashboard: true
    });
    expect(isDisabled(signedOutWithDashboard, "export-reliability-dashboard")).toBe(false);
    expect(isDisabled(signedOutWithDashboard, "export-publication-package")).toBe(true);
  });

  it("gates every publication button the panel renders, not just the seven named here", () => {
    // An eighth publication export added without a gate would otherwise sail past
    // the per-id loops above.
    const markup = renderReportGenerator({ hasPublicationAccess: false });
    const rendered = markup.match(/data-testid="export-publication-[a-z]+"/g) ?? [];

    expect(rendered).toHaveLength(PUBLICATION_TEST_IDS.length);
    expect(rendered.map((attribute) => attribute.slice('data-testid="'.length, -1)).sort())
      .toEqual([...PUBLICATION_TEST_IDS].sort());
  });
});

type WorkspaceShellProps = ReturnType<typeof useSenaFusionWorkspaceMainShellProps>;

/**
 * Mounts the real workspace props hook, the one SenaFusionWorkspace calls, so the
 * publication gate under test is the value production computes rather than one
 * this test chose. There is no DOM renderer here, so effects never run and the
 * enterprise session stays unresolved: this mount is the signed-out workspace.
 */
function mountWorkspaceShellProps(): WorkspaceShellProps {
  let captured: WorkspaceShellProps | null = null;

  function WorkspaceShellPropsHarness() {
    captured = useSenaFusionWorkspaceMainShellProps();
    return null;
  }

  renderToStaticMarkup(<WorkspaceShellPropsHarness />);
  if (!captured) throw new Error("Workspace shell harness did not expose its props.");
  return captured;
}

describe("publication export sign-in gate reaches the report section", () => {
  it("hands the report section a closed gate when no session has resolved", () => {
    const reportProps = mountWorkspaceShellProps().reportAndStatsDeckProps.reportProps;

    expect(reportProps.hasPublicationAccess).toBe(false);
    // The gate is a disabled button, not a missing handler: a dropped callback
    // would silence the click without ever telling the reviewer why.
    expect(typeof reportProps.onExportPublication).toBe("function");
  });

  it("renders the closed gate end to end from the real workspace props", () => {
    const reportProps = mountWorkspaceShellProps().reportAndStatsDeckProps.reportProps;
    const markup = renderToStaticMarkup(<WorkspaceReportSection {...reportProps} />);

    for (const testId of PUBLICATION_TEST_IDS) {
      expect(isDisabled(markup, testId), `${testId} is clickable in the signed-out workspace`).toBe(true);
    }
    expect(markup).toContain(`data-testid="${PUBLICATION_PREREQUISITE_NOTE_TEST_ID}"`);
  });
});

describe("publication access derivation (source contract, not behaviour)", () => {
  // The workspace holds the enterprise session in local state that an effect
  // fills in. This repo has no DOM renderer, so effects never run and a mounted
  // hook can only ever be observed signed out — the signed-in half of the
  // derivation below is pinned as source text. The rendered consequence of a
  // true flag is covered behaviourally by the ReportGenerator suite above.
  const hookSource = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts"
    ),
    "utf8"
  );

  it("requires both the enterprise session user and an active persisted project", () => {
    expect(hookSource).toContain("hasPublicationAccess: Boolean(enterpriseContext?.user && activeEnterpriseProjectId)");
  });
});
