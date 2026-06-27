import type { ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Database, Download, FileText, Upload } from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type {
  SenaClaimReadinessGate,
  SenaCodingReliabilityGate,
  SenaCodingReliabilityReview,
  SenaDemoVerification,
  SenaDemoVerificationCheck,
  SenaDemoVerificationCompatibilityAudit,
  SenaDevelopmentPlan,
  SenaModel,
  SenaPilotReadinessAudit,
  SenaProductionPageContract,
  SenaReportCompletenessAudit,
  SenaReportHumanReview,
  SenaReviewPacketAudit
} from "./analysis-runtime";

export type PublicationFormat = "svg" | "png" | "html" | "xlsx" | "docx" | "pdf" | "package";

function MetricCell({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div data-testid={testId} className="min-w-0 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="truncate text-xl font-black text-foreground">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

function ReportCompletenessAuditPanel({ audit }: { audit: SenaReportCompletenessAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Report completeness audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Passed" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>

      <div className="grid max-h-72 gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.summary}</div>
                  {item.evidence.length > 0 && (
                    <div className="mt-1 truncate text-xs font-semibold text-foreground/72">
                      {item.evidence.slice(0, 3).join("; ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function ReviewPacketAuditPanel({ audit }: { audit: SenaReviewPacketAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div data-testid="review-packet-audit" data-visual-role="review-packet-audit" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Review packet audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Passed" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>

      <div className="grid max-h-64 gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              data-testid={`review-packet-audit-${item.id}`}
              data-audit-id={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.actual}</div>
                  {item.evidence.length > 0 && (
                    <div className="mt-1 truncate text-xs font-semibold text-foreground/72">
                      {item.evidence.slice(0, 3).join("; ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function DemoVerificationCompatibilityAuditPanel({ audit }: { audit: SenaDemoVerificationCompatibilityAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div data-testid="demo-verification-compatibility-audit" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Demo verification compatibility audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Passed" value={audit.passed} testId="demo-verification-compatibility-passed" />
          <MetricCell label="Review" value={audit.reviewNeeded} testId="demo-verification-compatibility-review" />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                    Expected: {item.expected}
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-foreground/72">
                    Actual: {item.actual}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function ProductionPageContractPanel({ contract }: { contract: SenaProductionPageContract }) {
  const requiredTextCount = contract.sections.reduce((total, section) => total + section.requiredText.length, 0);

  return (
    <div data-testid="production-page-contract" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Production page contract</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {contract.schemaVersion}; {contract.workspaceRoute}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Text checks" value={requiredTextCount} />
          <MetricCell label="Visual checks" value={contract.visualChecks.length} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {contract.sections.map((section) => (
          <div key={section.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="text-sm font-black text-foreground">{section.label}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {section.requiredText.map((text) => (
                <span key={`${section.id}-${text}`} className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1 text-[0.68rem] font-semibold text-muted">
                  {text}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        {contract.visualChecks.map((check) => (
          <div key={check.id} className="rounded-lg border border-violetGlow/35 bg-violetGlow/10 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-black text-foreground">{check.label}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-muted">{check.expectedOutcome}</div>
              </div>
              <code className="break-all rounded-md border border-cardBorder/35 bg-slate-950/70 px-2 py-1 text-[0.68rem] font-black text-cyanGlow">
                {check.requiredText}
              </code>
            </div>
          </div>
        ))}
      </div>

      {contract.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {contract.notes[0]}
        </div>
      )}
    </div>
  );
}

function PilotReadinessAuditPanel({ audit }: { audit: SenaPilotReadinessAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Pilot readiness audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Ready" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {visibleItems.map((item) => {
          const Icon = item.status === "ready" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "ready" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "ready" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black text-foreground">{item.label}</div>
                    <span className="rounded border border-cardBorder/40 px-1.5 py-0.5 text-[0.64rem] font-black uppercase text-cyanGlow">
                      {item.category}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.summary}</div>
                  {item.status === "review" && (
                    <div className="mt-1 text-xs font-semibold leading-5 text-amber-100">{item.nextAction}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}

function ClaimReadinessGatePanel({ gate }: { gate: SenaClaimReadinessGate }) {
  return (
    <div
      data-testid="claim-readiness-gate"
      data-visual-role="claim-readiness-gate"
      className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Claim readiness gate</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {gate.schemaVersion}; {gate.claimUse}
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 text-amber-100">
            Exploratory until coding reliability, data governance, human review, and all automated gates pass.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-80">
          <MetricCell label="Status" value={gate.status} />
          <MetricCell label="Ready" value={gate.ready} />
          <MetricCell label="Review" value={gate.reviewNeeded} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {gate.items.map((item) => {
          const Icon = item.status === "ready" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "ready" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "ready" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black text-foreground">{item.label}</div>
                    <span className="rounded border border-cardBorder/40 px-1.5 py-0.5 text-[0.64rem] font-black uppercase text-cyanGlow">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.summary}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-foreground/72">{item.guardrail}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-cardBorder/30 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
        Review blockers: {gate.blockers.length > 0 ? gate.blockers.join(", ") : "None"}.
      </div>
    </div>
  );
}

function CodingReliabilityGatePanel({ gate }: { gate: SenaCodingReliabilityGate }) {
  const Icon = gate.status === "ready" ? CheckCircle2 : AlertTriangle;

  return (
    <div
      data-testid="coding-reliability-gate"
      data-visual-role="coding-reliability-gate"
      className={cn(
        "grid gap-3 rounded-lg border p-3",
        gate.status === "ready" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", gate.status === "ready" ? "text-emerald-200" : "text-amber-100")} />
          <div>
            <div className="text-sm font-black text-foreground">Coding reliability gate</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {gate.schemaVersion}; {gate.claimUse}
            </div>
            <div className="mt-2 text-xs font-semibold leading-5 text-muted">{gate.guardrail}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-80">
          <MetricCell label="Status" value={gate.status} />
          <MetricCell label="Coders" value={gate.review.coderCount} />
          <MetricCell label="Blockers" value={gate.blockers.length} />
        </div>
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-3">
        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2">
          <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Scheme</div>
          <div className="mt-1">{gate.review.codingScheme}</div>
        </div>
        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2">
          <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Agreement</div>
          <div className="mt-1">{gate.review.agreementMetric}: {gate.review.agreementValue}</div>
        </div>
        <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2">
          <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Reviewer</div>
          <div className="mt-1">{gate.review.reviewer || "Unassigned"}</div>
        </div>
      </div>

      <div className="rounded-lg border border-cardBorder/30 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
        {gate.blockers.length > 0 ? `Blockers: ${gate.blockers.join(" ")}` : "Blockers: None."}
      </div>
    </div>
  );
}

function DevelopmentPlanPanel({ plan }: { plan: SenaDevelopmentPlan }) {
  const activePhase = plan.phases.find((phase) => phase.status === "active") ?? plan.phases[0];
  const productionPhase = plan.phases.find((phase) => phase.id === "production-platform");
  const deliveryCandidate = plan.deliveryCandidate;
  const nextStage = plan.nextStage;
  const phaseStyles: Record<SenaDevelopmentPlan["phases"][number]["status"], string> = {
    complete: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    active: "border-cyanGlow/45 bg-cyanGlow/10 text-cyanGlow",
    deferred: "border-amber-300/35 bg-amber-300/10 text-amber-100"
  };
  const nextStagePhaseStyles: Record<SenaDevelopmentPlan["nextStage"]["phases"][number]["status"], string> = {
    active: "border-cyanGlow/45 bg-cyanGlow/10 text-cyanGlow",
    next: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    deferred: "border-amber-300/35 bg-amber-300/10 text-amber-100",
    gate: "border-violet-300/35 bg-violet-300/10 text-violet-100"
  };

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Development plan</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {plan.schemaVersion}; {plan.milestone}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[34rem] md:grid-cols-5">
          <MetricCell label="Gate" value={plan.currentGate.pilotReadinessStatus} />
          <MetricCell label="Checks" value={`${plan.currentGate.automatedVerification.passed}/${plan.currentGate.automatedVerification.totalChecks}`} />
          <MetricCell label="Manual pending" value={plan.currentGate.automatedVerification.manualPending} />
          <MetricCell label="Manual failed" value={plan.currentGate.automatedVerification.manualFailed} />
          <MetricCell label="Artifacts" value={plan.requiredArtifacts.length} />
        </div>
      </div>

      <div
        data-testid="delivery-candidate-plan"
        data-visual-role="local-research-pilot-delivery-candidate"
        className="grid gap-3 rounded-lg border border-cyanGlow/35 bg-cyanGlow/10 p-3"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Local research pilot delivery candidate</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {deliveryCandidate.horizon}; {deliveryCandidate.priority}; {deliveryCandidate.status}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-80">
            <MetricCell label="Weeks" value={deliveryCandidate.weeklyPlan.length} />
            <MetricCell label="Commands" value={deliveryCandidate.verificationCommands.length} />
            <MetricCell label="Handoff" value={deliveryCandidate.handoffPackage.length} />
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {deliveryCandidate.weeklyPlan.map((week) => (
            <div key={week.week} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
              <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Week {week.week}</div>
              <div className="mt-1 text-sm font-black text-foreground">{week.label}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">{week.focus}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-2">
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Verification gate</div>
            {deliveryCandidate.verificationCommands.slice(0, 5).map((command) => <div key={command}>- {command}</div>)}
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Handoff package</div>
            {deliveryCandidate.handoffPackage.slice(0, 5).map((artifact) => <div key={artifact}>- {artifact}</div>)}
          </div>
        </div>
      </div>

      <div
        data-testid="next-stage-development-plan"
        data-visual-role="post-delivery-research-validation-plan"
        className="grid gap-3 rounded-lg border border-sky-300/35 bg-sky-300/10 p-3"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Next-stage development plan</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              {nextStage.horizon}; {nextStage.priority}; {nextStage.status}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-80">
            <MetricCell label="Phases" value={nextStage.phases.length} />
            <MetricCell label="Release gate" value={nextStage.releaseGate.command} />
            <MetricCell label="Data cases" value={nextStage.releaseGate.dataScenarios.length} />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {nextStage.phases.map((phase) => (
            <div key={phase.id} className={cn("rounded-lg border p-3", nextStagePhaseStyles[phase.status])}>
              <div className="text-[0.64rem] font-black uppercase">{phase.status}</div>
              <div className="mt-1 text-sm font-black text-foreground">{phase.label}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">{phase.goal}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-3">
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Release gate</div>
            <div>{nextStage.baseline.command}</div>
            <div className="mt-1">{nextStage.baseline.expectedResult}</div>
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Claim gate</div>
            <div>{nextStage.assumptions.find((assumption) => assumption.includes("exploratory-only")) ?? "Reports remain exploratory-only until review gates pass."}</div>
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <div className="mb-1 font-black text-cyanGlow">Public interfaces</div>
            {nextStage.publicInterfacePolicy.slice(0, 2).map((policy) => <div key={policy}>- {policy}</div>)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-2">
          <div className="text-xs font-black uppercase text-cyanGlow">Current focus</div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm leading-6">
            <div className="font-black text-foreground">{activePhase?.label ?? "Local research pilot"}</div>
            <div className="mt-1 text-muted">{activePhase?.scope ?? "Local pilot scope is being prepared for research walkthroughs."}</div>
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm leading-6">
            <div className="font-black text-foreground">{productionPhase?.label ?? "Production platform"}</div>
            <div className="mt-1 text-muted">{productionPhase?.scope ?? "Production platform work remains deferred."}</div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-black uppercase text-cyanGlow">Scope boundary</div>
          <div className="grid gap-2 text-xs font-semibold leading-5 text-muted sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
              <div className="mb-1 font-black text-emerald-100">In scope</div>
              {plan.scope.inScope.slice(0, 3).map((item) => <div key={item}>- {item}</div>)}
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
              <div className="mb-1 font-black text-amber-100">Deferred</div>
              {plan.scope.outOfScope.slice(0, 3).map((item) => <div key={item}>- {item}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {plan.phases.map((phase) => (
          <div key={phase.id} className={cn("rounded-lg border px-3 py-2", phaseStyles[phase.status])}>
            <div className="text-sm font-black text-foreground">{phase.label}</div>
            <div className="mt-1 text-[0.64rem] font-black uppercase">{phase.status}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-muted md:grid-cols-3">
        {plan.nextDecisions.slice(0, 3).map((decision) => (
          <div key={decision} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            {decision}
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoVerificationPanel({
  verification,
  defaultReviewer,
  onManualReviewChange
}: {
  verification: SenaDemoVerification;
  defaultReviewer: string;
  onManualReviewChange: (checkId: string, patch: Partial<SenaDemoVerificationCheck["manualReview"]>) => void;
}) {
  const reviewChecks = verification.checks.filter((check) => check.status === "review");
  const visibleChecks = reviewChecks.length > 0
    ? [...reviewChecks, ...verification.checks.filter((check) => check.status !== "review")]
    : verification.checks;

  return (
    <div className="rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Demo verification checklist</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {verification.schemaVersion}; {verification.summary.pilotReadinessStatus}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[34rem] sm:grid-cols-5">
          <MetricCell label="Auto pass" value={verification.summary.automatedPass} testId="demo-verification-summary-pass" />
          <MetricCell label="Auto review" value={verification.summary.automatedReview} testId="demo-verification-summary-review" />
          <MetricCell label="Pending" value={verification.summary.manualPending} testId="demo-verification-summary-manual-pending" />
          <MetricCell label="Passed" value={verification.summary.manualPassed} testId="demo-verification-summary-manual-passed" />
          <MetricCell label="Failed" value={verification.summary.manualFailed} testId="demo-verification-summary-manual-failed" />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
        Required artifacts: {verification.summary.requiredArtifacts.join(", ")}
      </div>

      <div className="mt-3 grid gap-2">
        {visibleChecks.map((check) => {
          const Icon = check.status === "pass" ? CheckCircle2 : AlertTriangle;
          const evidence = check.observedEvidence.slice(0, 4);
          const setManualStatus = (status: SenaDemoVerificationCheck["manualReview"]["status"]) => {
            onManualReviewChange(check.id, {
              status,
              reviewer: check.manualReview.reviewer || defaultReviewer,
              verifiedAt: status === "pending" ? "" : new Date().toISOString()
            });
          };
          return (
            <div
              key={check.id}
              data-testid={`demo-verification-check-${check.id}`}
              className={cn(
                "rounded-lg border px-3 py-2",
                check.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", check.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-black text-foreground">{check.label}</div>
                    <a href={check.anchor} className="text-xs font-black text-cyanGlow hover:text-foreground">{check.anchor}</a>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{check.manualAction}</div>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <div className="rounded-lg border border-cardBorder/25 bg-background/25 p-2">
                      <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Expected</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-muted">{check.expectedOutcome}</div>
                    </div>
                    <div className="rounded-lg border border-cardBorder/25 bg-background/25 p-2">
                      <div className="text-[0.64rem] font-black uppercase text-cyanGlow">Observed evidence</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                        {evidence.join("; ")}
                        {check.observedEvidence.length > evidence.length ? `; +${check.observedEvidence.length - evidence.length} more` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs font-semibold leading-5 text-muted">
                    Artifacts: {check.requiredArtifacts.join(", ")}
                  </div>
                  <div className="mt-3 grid gap-2 rounded-lg border border-cardBorder/25 bg-background/25 p-2 lg:grid-cols-[9rem_1fr_1.2fr]">
                    <label className="grid gap-1 text-xs font-bold text-muted">
                      Manual status
                      <select
                        data-testid={`demo-verification-status-${check.id}`}
                        value={check.manualReview.status}
                        onChange={(event) => setManualStatus(event.currentTarget.value as SenaDemoVerificationCheck["manualReview"]["status"])}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      >
                        <option value="pending">Pending</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-muted">
                      Reviewer
                      <input
                        data-testid={`demo-verification-reviewer-${check.id}`}
                        value={check.manualReview.reviewer}
                        onChange={(event) => onManualReviewChange(check.id, { reviewer: event.currentTarget.value })}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-muted">
                      Notes
                      <input
                        data-testid={`demo-verification-notes-${check.id}`}
                        value={check.manualReview.notes}
                        onChange={(event) => onManualReviewChange(check.id, { notes: event.currentTarget.value })}
                        className="h-9 rounded-lg border border-cardBorder/55 bg-background/55 px-2 text-xs font-semibold text-foreground outline-none focus:border-cyanGlow"
                      />
                    </label>
                    {check.manualReview.verifiedAt && (
                      <div className="text-xs font-semibold leading-5 text-muted lg:col-span-3">
                        Verified at: {check.manualReview.verifiedAt}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReportGenerator({
  model,
  completenessAudit,
  reviewPacketAudit,
  pilotReadinessAudit,
  claimReadinessGate,
  codingReliabilityGate,
  developmentPlan,
  demoVerification,
  demoVerificationCompatibilityAudit,
  productionPageContract,
  onDemoManualReviewChange,
  reportTitle,
  onReportTitleChange,
  reviewStatus,
  onReviewStatusChange,
  reviewer,
  onReviewerChange,
  interpretation,
  onInterpretationChange,
  limitations,
  onLimitationsChange,
  nextActions,
  onNextActionsChange,
  dataGovernanceIrbApprovalId,
  onDataGovernanceIrbApprovalIdChange,
  dataGovernanceConsentScope,
  onDataGovernanceConsentScopeChange,
  dataGovernanceRetentionPolicy,
  onDataGovernanceRetentionPolicyChange,
  dataGovernanceUsageConstraints,
  onDataGovernanceUsageConstraintsChange,
  dataGovernanceDataSteward,
  onDataGovernanceDataStewardChange,
  codingReliabilityStatus,
  onCodingReliabilityStatusChange,
  codingReliabilityReviewer,
  onCodingReliabilityReviewerChange,
  codingScheme,
  onCodingSchemeChange,
  unitOfCoding,
  onUnitOfCodingChange,
  coderCount,
  onCoderCountChange,
  agreementMetric,
  onAgreementMetricChange,
  agreementValue,
  onAgreementValueChange,
  adjudicationNotes,
  onAdjudicationNotesChange,
  reliabilityLimitations,
  onReliabilityLimitationsChange,
  onExportWalkthroughJson,
  onExportVerificationJson,
  onExportVerificationCompatibilityJson,
  onExportProductionPageContractJson,
  onExportProjectSnapshot,
  onExportDevelopmentPlanJson,
  onExportEnaReport,
  onExportRuntimeBundleJson,
  onExportRuntimeConsistencyAuditJson,
  onExportReadinessJson,
  onExportCodingReliabilityJson,
  onExportReliabilityDashboardJson,
  onExportClaimReadinessJson,
  onExportReviewPacket,
  onExportJson,
  onExportMarkdown,
  onReliabilityUpload,
  hasReliabilityDashboard,
  onExportPublication
}: {
  model: SenaModel;
  completenessAudit: SenaReportCompletenessAudit;
  reviewPacketAudit: SenaReviewPacketAudit;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  claimReadinessGate: SenaClaimReadinessGate;
  codingReliabilityGate: SenaCodingReliabilityGate;
  developmentPlan: SenaDevelopmentPlan;
  demoVerification: SenaDemoVerification;
  demoVerificationCompatibilityAudit: SenaDemoVerificationCompatibilityAudit;
  productionPageContract: SenaProductionPageContract;
  onDemoManualReviewChange: (checkId: string, patch: Partial<SenaDemoVerificationCheck["manualReview"]>) => void;
  reportTitle: string;
  onReportTitleChange: (value: string) => void;
  reviewStatus: SenaReportHumanReview["status"];
  onReviewStatusChange: (value: SenaReportHumanReview["status"]) => void;
  reviewer: string;
  onReviewerChange: (value: string) => void;
  interpretation: string;
  onInterpretationChange: (value: string) => void;
  limitations: string;
  onLimitationsChange: (value: string) => void;
  nextActions: string;
  onNextActionsChange: (value: string) => void;
  dataGovernanceIrbApprovalId: string;
  onDataGovernanceIrbApprovalIdChange: (value: string) => void;
  dataGovernanceConsentScope: string;
  onDataGovernanceConsentScopeChange: (value: string) => void;
  dataGovernanceRetentionPolicy: string;
  onDataGovernanceRetentionPolicyChange: (value: string) => void;
  dataGovernanceUsageConstraints: string;
  onDataGovernanceUsageConstraintsChange: (value: string) => void;
  dataGovernanceDataSteward: string;
  onDataGovernanceDataStewardChange: (value: string) => void;
  codingReliabilityStatus: SenaCodingReliabilityReview["status"];
  onCodingReliabilityStatusChange: (value: SenaCodingReliabilityReview["status"]) => void;
  codingReliabilityReviewer: string;
  onCodingReliabilityReviewerChange: (value: string) => void;
  codingScheme: string;
  onCodingSchemeChange: (value: string) => void;
  unitOfCoding: string;
  onUnitOfCodingChange: (value: string) => void;
  coderCount: number;
  onCoderCountChange: (value: number) => void;
  agreementMetric: string;
  onAgreementMetricChange: (value: string) => void;
  agreementValue: string;
  onAgreementValueChange: (value: string) => void;
  adjudicationNotes: string;
  onAdjudicationNotesChange: (value: string) => void;
  reliabilityLimitations: string;
  onReliabilityLimitationsChange: (value: string) => void;
  onExportWalkthroughJson: () => void;
  onExportVerificationJson: () => void;
  onExportVerificationCompatibilityJson: () => void;
  onExportProductionPageContractJson: () => void;
  onExportProjectSnapshot: () => void;
  onExportDevelopmentPlanJson: () => void;
  onExportEnaReport: () => void;
  onExportRuntimeBundleJson: () => void;
  onExportRuntimeConsistencyAuditJson: () => void;
  onExportReadinessJson: () => void;
  onExportCodingReliabilityJson: () => void;
  onExportReliabilityDashboardJson: () => void;
  onExportClaimReadinessJson: () => void;
  onExportReviewPacket: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onReliabilityUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  hasReliabilityDashboard: boolean;
  onExportPublication: (format: PublicationFormat) => void;
}) {
  const edgeEvidenceCount = model.edges.reduce((total, edge) => total + edge.evidence.length, 0);
  const pairEvidenceCount = model.pairReport.reduce((total, pair) => total + pair.evidence.length, 0);
  const temporalEvidenceCount = model.temporal.windows.reduce((total, window) => total + window.evidence.length, 0);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCell label="Matrices" value={5} />
        <MetricCell label="Figures" value={3} />
        <MetricCell label="Evidence refs" value={edgeEvidenceCount + pairEvidenceCount + temporalEvidenceCount} />
        <MetricCell label="Review" value={reviewStatus === "human-reviewed" ? "Reviewed" : "Draft"} />
      </div>

      <PilotReadinessAuditPanel audit={pilotReadinessAudit} />

      <ClaimReadinessGatePanel gate={claimReadinessGate} />

      <CodingReliabilityGatePanel gate={codingReliabilityGate} />

      <DevelopmentPlanPanel plan={developmentPlan} />

      <DemoVerificationPanel verification={demoVerification} defaultReviewer={reviewer} onManualReviewChange={onDemoManualReviewChange} />

      <DemoVerificationCompatibilityAuditPanel audit={demoVerificationCompatibilityAudit} />

      <ProductionPageContractPanel contract={productionPageContract} />

      <ReportCompletenessAuditPanel audit={completenessAudit} />

      <ReviewPacketAuditPanel audit={reviewPacketAudit} />

      <div className="grid gap-3 lg:grid-cols-[1fr_12rem_14rem]">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Report title
          <input
            value={reportTitle}
            onChange={(event) => onReportTitleChange(event.currentTarget.value)}
            className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Status
          <select
            value={reviewStatus}
            onChange={(event) => onReviewStatusChange(event.currentTarget.value as SenaReportHumanReview["status"])}
            className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          >
            <option value="draft">Draft</option>
            <option value="human-reviewed">Human-reviewed</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Reviewer
          <input
            value={reviewer}
            onChange={(event) => onReviewerChange(event.currentTarget.value)}
            className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Interpretation
          <textarea
            value={interpretation}
            onChange={(event) => onInterpretationChange(event.currentTarget.value)}
            className="min-h-36 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Limitations
          <textarea
            value={limitations}
            onChange={(event) => onLimitationsChange(event.currentTarget.value)}
            className="min-h-36 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Next actions
          <textarea
            value={nextActions}
            onChange={(event) => onNextActionsChange(event.currentTarget.value)}
            className="min-h-36 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
          />
        </label>
      </div>

      <div data-testid="data-governance-metadata" className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-black text-foreground">Data governance metadata</div>
            <div className="mt-1 text-xs font-semibold text-muted">
              Captured in report, snapshot, review packet, runtime bundle, and publication package exports.
            </div>
          </div>
          <div className="text-xs font-black text-muted">sena-data-governance-metadata/v1</div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">
            IRB / ethics approval ID
            <input
              data-testid="data-governance-irb-approval"
              value={dataGovernanceIrbApprovalId}
              onChange={(event) => onDataGovernanceIrbApprovalIdChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Data steward
            <input
              data-testid="data-governance-data-steward"
              value={dataGovernanceDataSteward}
              onChange={(event) => onDataGovernanceDataStewardChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Consent scope
            <textarea
              data-testid="data-governance-consent-scope"
              value={dataGovernanceConsentScope}
              onChange={(event) => onDataGovernanceConsentScopeChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Retention policy
            <textarea
              data-testid="data-governance-retention-policy"
              value={dataGovernanceRetentionPolicy}
              onChange={(event) => onDataGovernanceRetentionPolicyChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Usage constraints
            <textarea
              data-testid="data-governance-usage-constraints"
              value={dataGovernanceUsageConstraints}
              onChange={(event) => onDataGovernanceUsageConstraintsChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
        <div>
          <div className="text-sm font-black text-foreground">Coding reliability evidence</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            Used by the coding reliability gate before any research-claim-ready export.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Upload className="h-4 w-4" /> Upload coder annotations
            <input type="file" accept=".csv,.json,.xlsx,text/csv,application/json" multiple className="sr-only" onChange={onReliabilityUpload} />
          </label>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-xs font-semibold leading-5 text-muted">
            Columns: coder_id, item_id or segment_id, code_id or codes, optional value.
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[12rem_1fr_1fr_8rem]">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Status
            <select
              data-testid="coding-reliability-status"
              value={codingReliabilityStatus}
              onChange={(event) => onCodingReliabilityStatusChange(event.currentTarget.value as SenaCodingReliabilityReview["status"])}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            >
              <option value="not-documented">Not documented</option>
              <option value="documented">Documented</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Reliability reviewer
            <input
              data-testid="coding-reliability-reviewer"
              value={codingReliabilityReviewer}
              onChange={(event) => onCodingReliabilityReviewerChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Coding scheme
            <input
              data-testid="coding-scheme"
              value={codingScheme}
              onChange={(event) => onCodingSchemeChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Coders
            <input
              data-testid="coder-count"
              type="number"
              min={0}
              value={coderCount}
              onChange={(event) => onCoderCountChange(Number(event.currentTarget.value))}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Unit of coding
            <input
              data-testid="unit-of-coding"
              value={unitOfCoding}
              onChange={(event) => onUnitOfCodingChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Agreement metric
            <input
              data-testid="agreement-metric"
              value={agreementMetric}
              onChange={(event) => onAgreementMetricChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Agreement value
            <input
              data-testid="agreement-value"
              value={agreementValue}
              onChange={(event) => onAgreementValueChange(event.currentTarget.value)}
              className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">
            Adjudication notes
            <textarea
              data-testid="adjudication-notes"
              value={adjudicationNotes}
              onChange={(event) => onAdjudicationNotesChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Reliability limitations
            <textarea
              data-testid="reliability-limitations"
              value={reliabilityLimitations}
              onChange={(event) => onReliabilityLimitationsChange(event.currentTarget.value)}
              className="min-h-24 resize-y rounded-lg border border-cardBorder/55 bg-background/55 px-3 py-2 text-sm font-semibold leading-6 text-foreground outline-none focus:border-cyanGlow"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={onExportWalkthroughJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export walkthrough JSON
        </button>
        <button onClick={onExportVerificationJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export verification JSON
        </button>
        <button data-testid="export-demo-verification-compatibility" onClick={onExportVerificationCompatibilityJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export compatibility audit
        </button>
        <button onClick={onExportProductionPageContractJson} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export page contract
        </button>
        <button data-testid="export-project-snapshot" onClick={onExportProjectSnapshot} className={buttonStyles({ variant: "secondary" })}>
          <Database className="h-4 w-4" /> Export project snapshot
        </button>
        <button onClick={onExportDevelopmentPlanJson} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export development plan
        </button>
        <button onClick={onExportEnaReport} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export ENA report
        </button>
        <button onClick={onExportRuntimeBundleJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export runtime bundle
        </button>
        <button onClick={onExportRuntimeConsistencyAuditJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export runtime audit
        </button>
        <button onClick={onExportReadinessJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export readiness JSON
        </button>
        <button onClick={onExportCodingReliabilityJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export reliability gate
        </button>
        <button data-testid="export-reliability-dashboard" onClick={onExportReliabilityDashboardJson} disabled={!hasReliabilityDashboard} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export reliability dashboard
        </button>
        <button onClick={onExportClaimReadinessJson} className={buttonStyles({ variant: "secondary" })}>
          <CheckCircle2 className="h-4 w-4" /> Export claim gate JSON
        </button>
        <button onClick={onExportReviewPacket} className={buttonStyles()}>
          <Download className="h-4 w-4" /> Export review packet
        </button>
        <button onClick={onExportJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export report JSON
        </button>
        <button onClick={onExportMarkdown} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export report MD
        </button>
        <button data-testid="export-publication-html" onClick={() => onExportPublication("html")} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export HTML
        </button>
        <button data-testid="export-publication-svg" onClick={() => onExportPublication("svg")} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export figure SVG
        </button>
        <button data-testid="export-publication-png" onClick={() => onExportPublication("png")} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export figure PNG
        </button>
        <button data-testid="export-publication-xlsx" onClick={() => onExportPublication("xlsx")} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export Excel
        </button>
        <button data-testid="export-publication-docx" onClick={() => onExportPublication("docx")} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export DOCX
        </button>
        <button data-testid="export-publication-pdf" onClick={() => onExportPublication("pdf")} className={buttonStyles({ variant: "secondary" })}>
          <FileText className="h-4 w-4" /> Export PDF
        </button>
        <button data-testid="export-publication-package" onClick={() => onExportPublication("package")} className={buttonStyles()}>
          <Download className="h-4 w-4" /> Export publication package
        </button>
      </div>
    </div>
  );
}
