import {
  AlertTriangle,
  CheckCircle2,
  Download,
  PanelRight,
  RotateCcw,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import type { SenaGroupComparisonValidationResult } from "@/lib/sena/inference";
import type {
  EnterpriseAnalysisRun,
  EnterpriseClaimEvidencePackage,
  EnterpriseCollaborationState,
  EnterpriseImportRun
} from "./enterprise-contracts";

type EnterpriseReviewStatus = "approved" | "rejected";
type EnterpriseExpertClaimScope = "exploratory-only" | "claim-ready-with-limits" | "not-claim-ready";
type EnterpriseExpertReviewStatus = "approved" | "changes-requested" | "rejected";
type EnterpriseAdjudicationDecision = "include" | "exclude" | "revise";

function reliabilityScoreLabel(value: number | null) {
  return value === null ? "not estimable" : String(value);
}

export type EnterpriseCollaborationProjectPanelProps = {
  activeEnterpriseProjectId: string;
  busy: boolean;
  disabled: boolean;
  enterpriseCollaboration: EnterpriseCollaborationState | null;
  enterpriseCollaborationTransport: string;
  enterpriseClaimPackage: EnterpriseClaimEvidencePackage | null;
  latestEnterpriseAnalysisRun: EnterpriseAnalysisRun | null;
  latestEnterpriseImportRun: EnterpriseImportRun | null;
  enterpriseComment: string;
  reliabilityReviewNote: string;
  validationReviewNote: string;
  expertReviewerName: string;
  expertExpertiseArea: string;
  expertClaimScope: EnterpriseExpertClaimScope;
  expertDataAdequacy: number;
  expertMethodFit: number;
  expertInterpretationValidity: number;
  expertConcerns: string;
  expertRecommendations: string;
  adjudicationItemId: string;
  adjudicationCodeId: string;
  adjudicationDecision: EnterpriseAdjudicationDecision;
  adjudicationNotesQuick: string;
  onEnterpriseCommentChange: (value: string) => void;
  onReliabilityReviewNoteChange: (value: string) => void;
  onValidationReviewNoteChange: (value: string) => void;
  onExpertReviewerNameChange: (value: string) => void;
  onExpertExpertiseAreaChange: (value: string) => void;
  onExpertClaimScopeChange: (value: EnterpriseExpertClaimScope) => void;
  onExpertDataAdequacyChange: (value: number) => void;
  onExpertMethodFitChange: (value: number) => void;
  onExpertInterpretationValidityChange: (value: number) => void;
  onExpertConcernsChange: (value: string) => void;
  onExpertRecommendationsChange: (value: string) => void;
  onAdjudicationItemIdChange: (value: string) => void;
  onAdjudicationCodeIdChange: (value: string) => void;
  onAdjudicationDecisionChange: (value: EnterpriseAdjudicationDecision) => void;
  onAdjudicationNotesQuickChange: (value: string) => void;
  onTouchEnterprisePresence: () => unknown | Promise<unknown>;
  onRefreshEnterpriseCollaboration: () => unknown | Promise<unknown>;
  onRestoreEnterpriseProjectRevision: (revisionId: string) => unknown | Promise<unknown>;
  onAddEnterpriseComment: () => unknown | Promise<unknown>;
  onReviewEnterpriseReliabilityRun: (status: EnterpriseReviewStatus) => unknown | Promise<unknown>;
  onReviewEnterpriseValidationRun: (status: EnterpriseReviewStatus) => unknown | Promise<unknown>;
  onExportEnterpriseExpertReviewDossierJson: () => unknown | Promise<unknown>;
  onSubmitEnterpriseExpertReview: (status: Extract<EnterpriseExpertReviewStatus, "approved" | "changes-requested">) => unknown | Promise<unknown>;
  onUpdateEnterpriseExpertReview: (status: EnterpriseExpertReviewStatus) => unknown | Promise<unknown>;
  onAddEnterpriseAdjudication: () => unknown | Promise<unknown>;
};

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function validationSuiteSummary(result: SenaGroupComparisonValidationResult) {
  if (result.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite) return null;
  const minimumAdjustedP = result.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1);
  return `Holm suite ${result.comparisonCount} comparisons, ${result.significantHolmCount} significant at alpha ${formatNumber(result.alpha, 3)}, min adjusted p=${formatNumber(minimumAdjustedP, 4)}`;
}

function MetricCell({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-lg border border-cardBorder/35 bg-background/35 p-2">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

export function EnterpriseCollaborationProjectPanel({
  activeEnterpriseProjectId,
  busy,
  disabled,
  enterpriseCollaboration,
  enterpriseCollaborationTransport,
  enterpriseClaimPackage,
  latestEnterpriseAnalysisRun,
  latestEnterpriseImportRun,
  enterpriseComment,
  reliabilityReviewNote,
  validationReviewNote,
  expertReviewerName,
  expertExpertiseArea,
  expertClaimScope,
  expertDataAdequacy,
  expertMethodFit,
  expertInterpretationValidity,
  expertConcerns,
  expertRecommendations,
  adjudicationItemId,
  adjudicationCodeId,
  adjudicationDecision,
  adjudicationNotesQuick,
  onEnterpriseCommentChange,
  onReliabilityReviewNoteChange,
  onValidationReviewNoteChange,
  onExpertReviewerNameChange,
  onExpertExpertiseAreaChange,
  onExpertClaimScopeChange,
  onExpertDataAdequacyChange,
  onExpertMethodFitChange,
  onExpertInterpretationValidityChange,
  onExpertConcernsChange,
  onExpertRecommendationsChange,
  onAdjudicationItemIdChange,
  onAdjudicationCodeIdChange,
  onAdjudicationDecisionChange,
  onAdjudicationNotesQuickChange,
  onTouchEnterprisePresence,
  onRefreshEnterpriseCollaboration,
  onRestoreEnterpriseProjectRevision,
  onAddEnterpriseComment,
  onReviewEnterpriseReliabilityRun,
  onReviewEnterpriseValidationRun,
  onExportEnterpriseExpertReviewDossierJson,
  onSubmitEnterpriseExpertReview,
  onUpdateEnterpriseExpertReview,
  onAddEnterpriseAdjudication
}: EnterpriseCollaborationProjectPanelProps) {
  const hasProjectControls = Boolean(activeEnterpriseProjectId && enterpriseCollaboration);
  if (!latestEnterpriseAnalysisRun && !latestEnterpriseImportRun && !hasProjectControls) return null;

  const latestEnterpriseReliabilityRun = enterpriseCollaboration?.reliabilityRuns[0] ?? null;
  const latestEnterpriseValidationRun = enterpriseCollaboration?.validationRuns[0] ?? null;
  const latestEnterpriseExpertReview = enterpriseCollaboration?.expertReviews[0] ?? null;
  const importCleaningReviewCount = latestEnterpriseImportRun?.cleaningManifest?.checks.filter((check) => check.status === "review").length ?? 0;

  return (
    <div className="grid gap-3">
      {latestEnterpriseAnalysisRun && (
        <div className="grid gap-1 rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
          <div>
            Latest analysis: {latestEnterpriseAnalysisRun.title} · {latestEnterpriseAnalysisRun.sourceKind} · {latestEnterpriseAnalysisRun.summary.people} people · {latestEnterpriseAnalysisRun.summary.concepts} codes · {latestEnterpriseAnalysisRun.summary.claimUse}
          </div>
          <div>
            Fingerprints: report {latestEnterpriseAnalysisRun.artifactFingerprints.reportSha256.slice(0, 10)} · snapshot {latestEnterpriseAnalysisRun.artifactFingerprints.projectSnapshotSha256.slice(0, 10)}{latestEnterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256 ? ` · bundle ${latestEnterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256.slice(0, 10)}` : ""}
          </div>
        </div>
      )}
      {latestEnterpriseImportRun && (
        <div className="grid gap-1 rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
          <div>
            Latest import: {latestEnterpriseImportRun.status} · {latestEnterpriseImportRun.fileCount} file{latestEnterpriseImportRun.fileCount === 1 ? "" : "s"} · {latestEnterpriseImportRun.datasetCounts.people} people · {latestEnterpriseImportRun.datasetCounts.utterances} utterances · {latestEnterpriseImportRun.warningCount} warnings
          </div>
          <div>
            Profiles: {latestEnterpriseImportRun.sources.map((source) => `${source.profile}:${source.rows}`).join(", ")}
          </div>
          {latestEnterpriseImportRun.cleaningManifest && (
            <div>
              Cleaning: {latestEnterpriseImportRun.cleaningManifest.schemaVersion} · {importCleaningReviewCount} review check{importCleaningReviewCount === 1 ? "" : "s"} · placeholders {latestEnterpriseImportRun.cleaningManifest.summary.derivedPlaceholderCount} · skipped {latestEnterpriseImportRun.cleaningManifest.summary.skippedRowCount}
            </div>
          )}
        </div>
      )}
      {hasProjectControls && enterpriseCollaboration && (
        <div className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <MetricCell label="Version" value={enterpriseCollaboration.project.currentVersion} />
        <MetricCell label="Presence" value={enterpriseCollaboration.presence.length} />
        <MetricCell label="Open comments" value={enterpriseCollaboration.comments.filter((comment) => comment.status === "open").length} />
        <MetricCell label="Adjudications" value={enterpriseCollaboration.adjudications.length} />
        <MetricCell label="Reliability runs" value={enterpriseCollaboration.reliabilityRuns.length} />
        <MetricCell label="Validation runs" value={enterpriseCollaboration.validationRuns.length} />
        <MetricCell label="Expert reviews" value={enterpriseCollaboration.expertReviews.length} />
      </div>
      <div className="text-xs font-bold uppercase text-muted">
        Live sync {enterpriseCollaborationTransport}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void onTouchEnterprisePresence()} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <UsersRound className="h-4 w-4" /> Sync presence
        </button>
        <button type="button" onClick={() => void onRefreshEnterpriseCollaboration()} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <RotateCcw className="h-4 w-4" /> Collaboration
        </button>
      </div>
      {enterpriseCollaboration.revisions.length > 0 && (
        <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
          <div className="text-xs font-black uppercase text-muted">Revision history</div>
          <div className="grid gap-2">
            {enterpriseCollaboration.revisions.slice(0, 4).map((revision) => {
              const isCurrentRevision = revision.version === enterpriseCollaboration.project.currentVersion;
              return (
                <div key={revision.id} className="grid gap-2 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted lg:grid-cols-[auto_1fr_auto] lg:items-center">
                  <div className="font-black text-foreground">v{revision.version}</div>
                  <div className="min-w-0">
                    <div className="truncate">{revision.summary}</div>
                    <div className="text-[11px] uppercase text-muted/80">
                      {revision.user?.name ?? "SENA user"} · {new Date(revision.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRestoreEnterpriseProjectRevision(revision.id)}
                    disabled={busy || isCurrentRevision}
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    <RotateCcw className="h-4 w-4" /> {isCurrentRevision ? "Current" : "Restore"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {enterpriseCollaboration.presence.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs font-bold text-muted">
          {enterpriseCollaboration.presence.slice(0, 4).map((presence) => (
            <span key={presence.id} className="rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-3 py-1">
              {presence.user?.name ?? "Collaborator"} · {presence.activeView}/{presence.cursorLabel}
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Project comment
          <textarea
            value={enterpriseComment}
            onChange={(event) => onEnterpriseCommentChange(event.currentTarget.value)}
            placeholder="Leave a reviewer/coder note on the selected node, edge, or whole project."
            className="min-h-20 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <button type="button" onClick={() => void onAddEnterpriseComment()} disabled={busy || !enterpriseComment.trim()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <PanelRight className="h-4 w-4" /> Add comment
        </button>
        {enterpriseCollaboration.comments[0] && (
          <div className="rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
            Latest: {enterpriseCollaboration.comments[0].body} ({enterpriseCollaboration.comments[0].status})
          </div>
        )}
        {latestEnterpriseReliabilityRun && (
          <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
            <div>
              Reliability: {latestEnterpriseReliabilityRun.reviewer} · {latestEnterpriseReliabilityRun.status} · kappa {reliabilityScoreLabel(latestEnterpriseReliabilityRun.meanPairwiseKappa)} · alpha {reliabilityScoreLabel(latestEnterpriseReliabilityRun.krippendorffAlphaNominal)}
            </div>
            {latestEnterpriseReliabilityRun.adjudicationCoverage && (
              <div data-testid="enterprise-reliability-adjudication-coverage" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                Adjudication coverage: {Math.round(latestEnterpriseReliabilityRun.adjudicationCoverage.coverageRate * 100)}% · resolved {latestEnterpriseReliabilityRun.adjudicationCoverage.resolvedDisagreements}/{latestEnterpriseReliabilityRun.adjudicationCoverage.queuedDisagreements} · unresolved {latestEnterpriseReliabilityRun.adjudicationCoverage.unresolvedDisagreements}
              </div>
            )}
            {latestEnterpriseReliabilityRun.dashboard?.codeDiagnostics?.[0] && (
              <div data-testid="enterprise-reliability-code-diagnostics" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                Weakest code: {latestEnterpriseReliabilityRun.dashboard.codeDiagnostics[0].codeId} · disagreements {latestEnterpriseReliabilityRun.dashboard.codeDiagnostics[0].disagreementCount} · agreement {latestEnterpriseReliabilityRun.dashboard.codeDiagnostics[0].agreementRate}
              </div>
            )}
            <input
              value={reliabilityReviewNote}
              onChange={(event) => onReliabilityReviewNoteChange(event.currentTarget.value)}
              placeholder="Reliability sign-off note"
              className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void onReviewEnterpriseReliabilityRun("approved")} disabled={busy || Boolean(latestEnterpriseReliabilityRun.adjudicationCoverage?.unresolvedDisagreements)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <button type="button" onClick={() => void onReviewEnterpriseReliabilityRun("rejected")} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <AlertTriangle className="h-4 w-4" /> Return
              </button>
            </div>
          </div>
        )}
        {latestEnterpriseValidationRun && (
          <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
            <div className="text-xs font-black uppercase text-muted">Group-comparison validation</div>
            <div className="grid gap-2 rounded-lg border border-cardBorder/25 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
              <div>
                Validation: {latestEnterpriseValidationRun.status} · {latestEnterpriseValidationRun.metric} · {latestEnterpriseValidationRun.groupA} vs {latestEnterpriseValidationRun.groupB} · p={latestEnterpriseValidationRun.pTwoSided}
              </div>
              {latestEnterpriseValidationRun.result && validationSuiteSummary(latestEnterpriseValidationRun.result) && (
                <div data-testid="enterprise-validation-suite-summary" className="rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1 text-cyanGlow">
                  {validationSuiteSummary(latestEnterpriseValidationRun.result)}
                </div>
              )}
              {latestEnterpriseValidationRun.preregistrationPlan && (
                <div data-testid="enterprise-validation-preregistration-plan" className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                  Plan hash: {latestEnterpriseValidationRun.preregistrationPlan.planHash.slice(0, 12)} · {latestEnterpriseValidationRun.preregistrationPlan.schemaVersion}
                </div>
              )}
              {latestEnterpriseValidationRun.parityEvidence && (
                <div
                  data-testid="enterprise-validation-parity-evidence-detail"
                  data-visual-role="enterprise-validation-parity-evidence-detail"
                  className="grid gap-2 rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyanGlow">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{latestEnterpriseValidationRun.parityEvidence.schemaVersion}</span>
                    <span>{latestEnterpriseValidationRun.parityEvidence.status}</span>
                    <span>hash {latestEnterpriseValidationRun.parityEvidence.validationRunHash.slice(0, 12)}</span>
                  </div>
                  <div data-testid="enterprise-validation-walkthrough-evidence-detail" className="rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                    parityEvidence.walkthrough: {latestEnterpriseValidationRun.parityEvidence.walkthrough.status} · {latestEnterpriseValidationRun.parityEvidence.walkthrough.source} · {latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetLabel}
                    {latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetHash ? ` · sha256 ${latestEnterpriseValidationRun.parityEvidence.walkthrough.datasetHash.slice(0, 12)}` : ""}
                  </div>
                  <div className="break-words rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                    parityEvidence.runtimeParity: {latestEnterpriseValidationRun.parityEvidence.runtimeParity.map((evidence) => `${evidence.id}:${evidence.status}`).join(" · ")}
                  </div>
                  <div className="break-words rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                    parityEvidence.inference.studySpecificInferenceReference: {latestEnterpriseValidationRun.parityEvidence.inference.studySpecificInferenceReference ?? "required-before-publication-claim"}
                  </div>
                  <div data-testid="enterprise-formal-inference-readiness-detail" className="break-words rounded border border-cardBorder/30 bg-background/35 px-2 py-1">
                    formalInference: {latestEnterpriseValidationRun.parityEvidence.formalInference
                      ? `${latestEnterpriseValidationRun.parityEvidence.formalInference.schemaVersion} · ${latestEnterpriseValidationRun.parityEvidence.formalInference.status} · blockers=${latestEnterpriseValidationRun.parityEvidence.formalInference.blockers.length} · warnings=${latestEnterpriseValidationRun.parityEvidence.formalInference.warnings.length}`
                      : "sena-formal-inference-readiness/v1 · pending"}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {latestEnterpriseValidationRun.parityEvidence.gates.map((gate) => (
                      <span key={gate.id} className="rounded-full border border-cardBorder/30 bg-background/35 px-2 py-0.5 text-[11px] font-black uppercase text-muted">
                        {gate.id}: {gate.status}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <input
                value={validationReviewNote}
                onChange={(event) => onValidationReviewNoteChange(event.currentTarget.value)}
                placeholder="Validation review note"
                className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void onReviewEnterpriseValidationRun("approved")} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <CheckCircle2 className="h-4 w-4" /> Approve validation
                </button>
                <button type="button" onClick={() => void onReviewEnterpriseValidationRun("rejected")} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <AlertTriangle className="h-4 w-4" /> Return validation
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-black uppercase text-muted">Domain expert review</div>
              <div className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-cyanGlow">
                sena-expert-review-list/v1 · sena-enterprise-expert-review/v1
              </div>
            </div>
            <button
              type="button"
              data-testid="enterprise-expert-review-dossier-export-project"
              onClick={() => void onExportEnterpriseExpertReviewDossierJson()}
              disabled={disabled}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              <Download className="h-4 w-4" /> Expert JSON
            </button>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            <input value={expertReviewerName} onChange={(event) => onExpertReviewerNameChange(event.currentTarget.value)} placeholder="Reviewer name" className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
            <input value={expertExpertiseArea} onChange={(event) => onExpertExpertiseAreaChange(event.currentTarget.value)} placeholder="Expertise area" className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
            <select value={expertClaimScope} onChange={(event) => onExpertClaimScopeChange(event.currentTarget.value as EnterpriseExpertClaimScope)} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow">
              <option value="exploratory-only">Exploratory</option>
              <option value="claim-ready-with-limits">Claim-ready with limits</option>
              <option value="not-claim-ready">Not claim-ready</option>
            </select>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            <label className="grid gap-1 text-xs font-bold text-muted">
              Data
              <input type="number" min={1} max={5} value={expertDataAdequacy} onChange={(event) => onExpertDataAdequacyChange(Number(event.currentTarget.value))} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Method
              <input type="number" min={1} max={5} value={expertMethodFit} onChange={(event) => onExpertMethodFitChange(Number(event.currentTarget.value))} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Interpretation
              <input type="number" min={1} max={5} value={expertInterpretationValidity} onChange={(event) => onExpertInterpretationValidityChange(Number(event.currentTarget.value))} className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
            </label>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <input value={expertConcerns} onChange={(event) => onExpertConcernsChange(event.currentTarget.value)} placeholder="Concerns" className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
            <input value={expertRecommendations} onChange={(event) => onExpertRecommendationsChange(event.currentTarget.value)} placeholder="Recommendations" className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow" />
          </div>
          {latestEnterpriseExpertReview && (
            <div className="rounded-lg border border-cardBorder/25 bg-background/35 p-2 text-xs font-semibold leading-5 text-muted">
              Expert: {latestEnterpriseExpertReview.status} · {latestEnterpriseExpertReview.claimScope} · data {latestEnterpriseExpertReview.ratings.dataAdequacy}/5 · method {latestEnterpriseExpertReview.ratings.methodFit}/5 · interpretation {latestEnterpriseExpertReview.ratings.interpretationValidity}/5
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void onSubmitEnterpriseExpertReview("approved")} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <CheckCircle2 className="h-4 w-4" /> Record expert approval
            </button>
            <button type="button" onClick={() => void onSubmitEnterpriseExpertReview("changes-requested")} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <AlertTriangle className="h-4 w-4" /> Request changes
            </button>
            {latestEnterpriseExpertReview && (
              <button type="button" onClick={() => void onUpdateEnterpriseExpertReview("rejected")} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <X className="h-4 w-4" /> Reject latest
              </button>
            )}
          </div>
        </div>
        <div data-testid="enterprise-claim-evidence-package-details" data-visual-role="enterprise-claim-evidence-package" className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/35 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black uppercase text-muted">Enterprise claim package</div>
              <div className="text-xs font-semibold text-muted">sena-enterprise-claim-evidence-package/v2</div>
            </div>
            <button type="button" onClick={() => void onRefreshEnterpriseCollaboration()} disabled={!activeEnterpriseProjectId || busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <ShieldCheck className="h-4 w-4" /> Refresh package
            </button>
          </div>
          {enterpriseClaimPackage ? (
            <div className="grid gap-2 text-xs font-semibold leading-5 text-muted">
              <div className="grid gap-2 md:grid-cols-4">
                <MetricCell label="Claim status" value={enterpriseClaimPackage.status} />
                <MetricCell label="Blockers" value={enterpriseClaimPackage.summary.blockers} />
                <MetricCell label="Warnings" value={enterpriseClaimPackage.summary.warnings} />
                <MetricCell label="Artifacts" value={enterpriseClaimPackage.artifacts.length} />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                  Reliability: {enterpriseClaimPackage.summary.reliability}
                  {enterpriseClaimPackage.evidence.reliability ? ` · kappa ${reliabilityScoreLabel(enterpriseClaimPackage.evidence.reliability.meanPairwiseKappa)} · alpha ${reliabilityScoreLabel(enterpriseClaimPackage.evidence.reliability.krippendorffAlphaNominal)}` : ""}
                </div>
                <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                  Validation: {enterpriseClaimPackage.summary.validation}
                  {enterpriseClaimPackage.evidence.validation ? ` · ${enterpriseClaimPackage.evidence.validation.analysis} · comparisons ${enterpriseClaimPackage.evidence.validation.comparisonCount}` : ""}
                  {enterpriseClaimPackage.evidence.validation?.preregistrationPlanHash ? ` · plan ${enterpriseClaimPackage.evidence.validation.preregistrationPlanHash.slice(0, 12)}` : ""}
                  {enterpriseClaimPackage.evidence.validation?.parityEvidence ? ` · parity ${enterpriseClaimPackage.evidence.validation.parityEvidence.status} · ${enterpriseClaimPackage.evidence.validation.parityEvidence.validationRunHash.slice(0, 12)}` : ""}
                </div>
                <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                  Expert: {enterpriseClaimPackage.summary.expertReview}
                  {enterpriseClaimPackage.evidence.expertReview ? ` · ${enterpriseClaimPackage.evidence.expertReview.claimScope} · ${enterpriseClaimPackage.evidence.expertReview.reviewerName}` : ""}
                </div>
              </div>
              <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                Source: project v{enterpriseClaimPackage.sourceSnapshotEvidence.projectVersion} · revision {enterpriseClaimPackage.sourceSnapshotEvidence.revisionMatchesCurrentVersion ? "matched" : "missing"} · snapshot {enterpriseClaimPackage.sourceSnapshotEvidence.snapshotSha256.slice(0, 12)} · report {enterpriseClaimPackage.sourceSnapshotEvidence.reportSha256.slice(0, 12)} · fingerprints {enterpriseClaimPackage.sourceSnapshotEvidence.matrixFingerprints.length}
              </div>
              {enterpriseClaimPackage.blockers.length > 0 && (
                <div className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-amber-100">
                  Blockers: {enterpriseClaimPackage.blockers.join(", ")}
                </div>
              )}
              <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-1">
                Guardrail: {enterpriseClaimPackage.guardrails[0]}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-cardBorder/30 bg-background/35 px-2 py-2 text-xs font-semibold text-muted">
              Select or save a server project to assemble approved reliability, validation, preregistration, and expert-review evidence.
            </div>
          )}
        </div>
        <div className="grid gap-2 lg:grid-cols-[1fr_1fr_8rem_1fr_auto]">
          <input value={adjudicationItemId} onChange={(event) => onAdjudicationItemIdChange(event.currentTarget.value)} placeholder="item/segment id" className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow" />
          <input value={adjudicationCodeId} onChange={(event) => onAdjudicationCodeIdChange(event.currentTarget.value)} placeholder="code id" className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow" />
          <select value={adjudicationDecision} onChange={(event) => onAdjudicationDecisionChange(event.currentTarget.value as EnterpriseAdjudicationDecision)} className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow">
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
            <option value="revise">Revise</option>
          </select>
          <input value={adjudicationNotesQuick} onChange={(event) => onAdjudicationNotesQuickChange(event.currentTarget.value)} placeholder="adjudication note" className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow" />
          <button type="button" onClick={() => void onAddEnterpriseAdjudication()} disabled={busy || !adjudicationItemId.trim() || !adjudicationCodeId.trim()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <CheckCircle2 className="h-4 w-4" /> Record
          </button>
        </div>
        </div>
        </div>
      )}
    </div>
  );
}
