import { randomUUID } from "node:crypto";
import Link from "next/link";
import { currentSessionToken } from "@/lib/sena/api-helpers";
import {
  createEnterpriseCsrfToken,
  getEnterpriseSessionAsync
} from "@/lib/sena/enterprise/auth-session";
import { enterpriseErrorResponse } from "@/lib/sena/enterprise/errors";
import { listEnterpriseUploadsAsync } from "@/lib/sena/enterprise/import-analysis";
import { listEnterpriseProjectCollaborationWithPostgresEvidenceAsync } from "@/lib/sena/enterprise/team-collaboration";
import { listEnterpriseProjectsAsync } from "@/lib/sena/enterprise/team-project";
import {
  senaWorkflowDecisionDigest,
  withSenaWorkflowStore
} from "@/lib/sena/workflow/api-runtime";
import { senaWorkflowDefinitions } from "@/lib/sena/workflow/definitions";
import type {
  SenaWorkflowRun,
  SenaWorkflowRunEvents
} from "@/lib/sena/workflow/types";

type QueryValue = string | string[] | undefined;
export type AutomationControlRoomQuery = Record<string, QueryValue>;

const evidenceLayers = ["source", "local", "ci", "merged", "deployed", "live"] as const;
const terminalStatuses = new Set(["succeeded", "failed", "dead_lettered", "cancelled", "superseded"]);

function first(query: AutomationControlRoomQuery, key: string) {
  const value = query[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readable(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function short(value?: string) {
  if (!value) return "not recorded";
  return value.length > 20 ? `${value.slice(0, 11)}...${value.slice(-6)}` : value;
}

function href(query: AutomationControlRoomQuery, updates: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const key of ["team", "template", "project", "run", "node"] as const) {
    const value = updates[key] === undefined ? first(query, key) : updates[key];
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  return `/workspace/sena/automation${suffix ? `?${suffix}` : ""}`;
}

function errorCode(error: unknown) {
  const response = enterpriseErrorResponse(error);
  return typeof response.body.code === "string" ? response.body.code : "workflow_control_room_unavailable";
}

function CommandFields({
  csrfToken,
  intent,
  teamId
}: {
  csrfToken: string;
  intent: string;
  teamId: string;
}) {
  return (
    <>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="idempotencyKey" value={`sena-ui-${intent}-${randomUUID()}`} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="teamId" value={teamId} />
    </>
  );
}

function nodeState(nodeId: string, run: SenaWorkflowRun, events: SenaWorkflowRunEvents | null) {
  if (events?.receipts.some((receipt) => receipt.nodeId === nodeId)) return "passed";
  if (run.currentNodeId !== nodeId) return "not run";
  if (run.status === "waiting_human") return "waiting human";
  if (run.status === "waiting_job") return "waiting job";
  return run.status;
}

function definitionFor(run: SenaWorkflowRun | undefined) {
  return run
    ? senaWorkflowDefinitions.find((definition) => definition.kind === run.kind)
    : undefined;
}

function workflowTitle(kind: SenaWorkflowRun["kind"]) {
  return kind === "research-evidence" ? "Research Evidence" : "Engineering Release";
}

export async function SenaAutomationControlRoom({ query }: { query: AutomationControlRoomQuery }) {
  const context = await getEnterpriseSessionAsync(await currentSessionToken());
  if (!context) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background p-5 text-foreground" data-testid="sena-automation-control-room">
        <section className="max-w-xl rounded-xl border border-cardBorder/60 bg-card p-7 text-center">
          <h1 className="text-2xl font-black">SENA Automation Control Room</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Sign in to read or mutate tenant-scoped EvidenceFlow receipts.</p>
          <Link href="/login?next=%2Fworkspace%2Fsena%2Fautomation" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-slate-950 px-5 font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow">
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  const activeMemberships = context.memberships.filter((membership) => membership.status === "active");
  const activeTeamIds = new Set(activeMemberships.map((membership) => membership.teamId));
  const teams = context.teams.filter((team) => activeTeamIds.has(team.id));
  const requestedTeamId = first(query, "team");
  const teamId = teams.some((team) => team.id === requestedTeamId) ? requestedTeamId : teams[0]?.id ?? "";
  const requestedTemplate = first(query, "template");
  const csrfToken = createEnterpriseCsrfToken(context).token;
  let projects: Awaited<ReturnType<typeof listEnterpriseProjectsAsync>> = [];
  let uploads: Awaited<ReturnType<typeof listEnterpriseUploadsAsync>> = [];
  let runs: SenaWorkflowRun[] = [];
  let events: SenaWorkflowRunEvents | null = null;
  let loadError = "";

  try {
    [projects, uploads] = await Promise.all([
      listEnterpriseProjectsAsync(context),
      teamId ? listEnterpriseUploadsAsync(context, teamId) : Promise.resolve([])
    ]);
    projects = projects.filter((project) => project.teamId === teamId);
    if (teamId) {
      const requestedRunId = first(query, "run");
      const result = await withSenaWorkflowStore(async (store) => {
        const listed = await store.listRuns({ teamId });
        listed.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const selected = listed.find((run) => run.id === requestedRunId) ?? listed[0];
        return {
          runs: listed,
          events: selected ? await store.runEvents(selected.id, teamId) : null
        };
      });
      runs = result.runs;
      events = result.events;
    }
  } catch (error) {
    loadError = errorCode(error);
  }

  const selectedRun = events?.run ?? runs.find((run) => run.id === first(query, "run")) ?? runs[0];
  const template = requestedTemplate === "engineering-release" || requestedTemplate === "research-evidence"
    ? requestedTemplate
    : selectedRun?.kind ?? "research-evidence";
  const definition = definitionFor(selectedRun);
  const requestedProjectId = first(query, "project");
  const selectedProject = projects.find((project) => project.id === requestedProjectId) ?? projects[0];
  let selectedRevisionId = "";
  if (selectedProject) {
    try {
      const collaboration = await listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(context, selectedProject.id);
      selectedRevisionId = collaboration.revisions.find((revision) => revision.version === selectedProject.currentVersion)?.id ?? "";
    } catch (error) {
      loadError ||= errorCode(error);
    }
  }
  const selectedNodeId = definition?.nodes.some((node) => node.id === first(query, "node"))
    ? first(query, "node")
    : selectedRun?.currentNodeId ?? definition?.nodes[0]?.id ?? "";
  const selectedNode = definition?.nodes.find((node) => node.id === selectedNodeId);
  const receipt = events?.receipts.find((candidate) => candidate.nodeId === selectedNodeId);
  const approvals = events?.approvals.filter((candidate) => candidate.nodeId === selectedNodeId) ?? [];
  const artifacts = events?.artifacts.filter((candidate) => candidate.nodeId === selectedNodeId) ?? [];
  const pending = selectedRun?.pendingInterrupt?.nodeId === selectedNodeId
    ? selectedRun.pendingInterrupt
    : undefined;
  const pendingDecision = pending?.kind === "waiting-human"
    ? approvals.find((approval) => approval.interruptId === pending.interruptId)
    : undefined;
  const notice = first(query, "notice");
  const actionError = first(query, "error");
  const membership = activeMemberships.find((candidate) => candidate.teamId === teamId);
  const passedUploads = uploads.filter((upload) => upload.scanStatus === "passed");
  const formClass = "min-h-11 rounded-lg border border-cardBorder/70 bg-card px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow";
  const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-cardBorder/70 bg-card px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow disabled:opacity-50";
  const primaryButtonClass = `${buttonClass} border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950`;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground" data-testid="sena-automation-control-room">
      <a href="#automation-main" className="sr-only z-50 rounded-lg bg-slate-950 px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to EvidenceFlow controls</a>
      <header className="border-b border-cardBorder/60 bg-card/80 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">SENA Automation Control Room</h1>
            <p className="mt-1 text-xs font-bold text-muted">Durable execution, human authority, hash-bound evidence</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex min-h-11 items-center gap-2 rounded-lg border border-cardBorder/60 bg-card px-3 text-xs font-black">
              <label htmlFor="automation-team">Team</label>
              <select id="automation-team" name="team" defaultValue={teamId} className="min-h-9 bg-transparent text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow">
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name ?? team.id}</option>)}
              </select>
              <button className="font-black" type="submit">Load</button>
            </form>
            <Link href={href(query, {})} className={buttonClass}>Refresh</Link>
            <Link href="/workspace/sena" className={buttonClass}>Research workspace</Link>
          </div>
        </div>
      </header>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice ? "EvidenceFlow command persisted. Execution remains pending." : "EvidenceFlow control room loaded."}
      </div>

      <main id="automation-main" className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">
        {(loadError || actionError) && (
          <p role="alert" className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-800 dark:text-red-200">
            EvidenceFlow is fail closed: {readable(actionError || loadError)}.
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-lg border border-emerald-500/45 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">
            {notice === "started" ? "Run and start command persisted. This is not execution success." : "Action command persisted. Refresh to read worker evidence."}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-cardBorder/60 bg-card/35 shadow-[0_20px_60px_rgb(10_55_50/0.10)]">
          <div className="border-b border-cardBorder/55 bg-card/50 px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Start a fixed workflow</h2>
                <p className="mt-1 text-sm leading-6 text-muted">Inputs are hashed before execution. Queue acceptance is not workflow or claim success.</p>
              </div>
              <span className="text-xs font-bold text-muted">Role: {membership?.role ?? "not active"}</span>
            </div>
            <nav aria-label="EvidenceFlow templates" className="mt-4 inline-grid grid-cols-2 rounded-xl border border-cardBorder/60 bg-background/70 p-1">
              {senaWorkflowDefinitions.map((item) => (
                <Link key={item.kind} aria-current={template === item.kind ? "page" : undefined} href={href(query, { template: item.kind })} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow ${template === item.kind ? "bg-cyanGlow/20" : "text-muted"}`}>
                  {workflowTitle(item.kind)}
                </Link>
              ))}
            </nav>

            {template === "research-evidence" ? (
              <form action="/workspace/sena/automation/command" method="post" aria-label="Start Research Evidence" className="mt-5 grid gap-4 lg:grid-cols-5">
                <CommandFields csrfToken={csrfToken} intent="start-research" teamId={teamId} />
                <label className="grid gap-2 text-sm font-bold">Project
                  <select name="projectId" defaultValue={selectedProject?.id ?? ""} className={formClass} required>
                    <option value="">Choose a project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.title} (v{project.currentVersion})</option>)}
                  </select>
                  <span className="text-xs font-medium text-muted">Current revision: {selectedRevisionId || "not retained"}</span>
                </label>
                <label className="grid gap-2 text-sm font-bold">Source classification
                  <select name="researchSourceClass" defaultValue="fixture" className={formClass}>
                    <option value="fixture">Fixture or sample</option>
                    <option value="approved-pseudonymized">Approved pseudonymized data</option>
                  </select>
                  <span className="text-xs font-medium text-muted">Fixture evidence cannot become inference ready.</span>
                </label>
                <label className="grid gap-2 text-sm font-bold">Import uploads
                  <select name="importUploadIds" multiple className={`${formClass} min-h-28 py-2`} required>
                    {passedUploads.map((upload) => <option key={upload.id} value={upload.id}>{upload.originalName}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold">Reliability uploads
                  <select name="reliabilityUploadIds" multiple className={`${formClass} min-h-28 py-2`} required>
                    {passedUploads.map((upload) => <option key={upload.id} value={upload.id}>{upload.originalName}</option>)}
                  </select>
                </label>
                <div className="grid content-between gap-3">
                  <label className="grid gap-2 text-sm font-bold">Publication format
                    <select name="publicationFormat" defaultValue="package" className={formClass}><option value="package">Evidence package</option><option value="html">HTML</option><option value="pdf">PDF</option><option value="docx">DOCX</option></select>
                  </label>
                  <button type="submit" disabled={!teamId || !selectedRevisionId} className={primaryButtonClass}>Persist research run</button>
                </div>
              </form>
            ) : (
              <form action="/workspace/sena/automation/command" method="post" aria-label="Start Engineering Release" className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(22rem,1.2fr)]">
                <CommandFields csrfToken={csrfToken} intent="start-engineering" teamId={teamId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold">Repository<input name="repo" defaultValue="HUDongpin/SENA" className={formClass} required /></label>
                  <label className="grid gap-2 text-sm font-bold">Base SHA<input name="baseSha" className={`${formClass} font-mono`} required /></label>
                  <label className="grid gap-2 text-sm font-bold">Candidate SHA<input name="candidateSha" className={`${formClass} font-mono`} required /></label>
                  <label className="grid gap-2 text-sm font-bold">Work request digest<input name="workRequestDigest" className={`${formClass} font-mono`} required /></label>
                  <p className="sm:col-span-2 rounded-lg border border-cyanGlow/35 bg-cyanGlow/10 p-4 text-sm leading-6">Real SENA mode is read-only. Merge, deployment, and live layers remain not-run.</p>
                </div>
                <label className="grid gap-2 text-sm font-bold">Engineering evidence parameters JSON
                  <textarea name="engineeringJson" rows={12} className={`${formClass} min-h-64 resize-y py-3 font-mono text-xs`} required />
                  <span className="text-xs font-medium leading-5 text-muted">Provide engineeringEvidence, preflight, owner lane, allowlist, candidate receipt, and exact-SHA gate receipts.</span>
                  <button type="submit" disabled={!teamId} className={`${primaryButtonClass} justify-self-start`}>Persist shadow run</button>
                </label>
              </form>
            )}
          </div>

          <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="border-b border-cardBorder/55 bg-background/45 p-4 lg:border-b-0 lg:border-r" aria-labelledby="automation-runs-title">
              <div className="flex items-center justify-between"><h2 id="automation-runs-title" className="text-sm font-black">Runs</h2><span className="font-mono text-xs">{runs.length}</span></div>
              {runs.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-cardBorder/70 p-4 text-sm leading-6 text-muted">No run exists for this team.</p> : (
                <ul className="mt-3 grid max-h-[54rem] gap-2 overflow-y-auto" aria-label="EvidenceFlow runs">
                  {runs.map((run) => <li key={run.id}><Link href={href(query, { run: run.id, node: run.currentNodeId })} aria-current={run.id === selectedRun?.id ? "page" : undefined} className={`block min-h-16 rounded-lg border px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow ${run.id === selectedRun?.id ? "border-cyanGlow/60 bg-cyanGlow/10" : "border-cardBorder/50 bg-card/55"}`}><span className="block text-sm font-black">{workflowTitle(run.kind)}</span><span className="mt-1 block truncate font-mono text-[11px] text-muted">{short(run.id)}</span><span className="mt-2 flex justify-between text-xs font-bold"><span>{readable(run.status)}</span><span>v{run.version}</span></span></Link></li>)}
                </ul>
              )}
            </aside>

            {selectedRun && definition && events ? (
              <div className="grid min-h-[42rem] lg:grid-cols-[minmax(21rem,1fr)_minmax(18rem,0.62fr)]">
                <section className="min-w-0 border-b border-cardBorder/55 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-xl font-black">{workflowTitle(selectedRun.kind)}</h2><p className="mt-1 text-sm text-muted">Current node: {selectedRun.currentNodeId}</p></div>
                    <div className="flex flex-wrap gap-2 text-xs font-black"><span className="rounded-lg border border-cardBorder/60 px-3 py-2">status: {readable(selectedRun.status)}</span>{selectedRun.kind === "research-evidence" ? <><span className="rounded-lg border border-cyanGlow/40 px-3 py-2">claim: {readable(selectedRun.claimBoundary ?? "exploratory-only")}</span><span className="rounded-lg border border-cardBorder/60 px-3 py-2">source: {readable(selectedRun.researchSourceClass ?? "unclassified")}</span></> : <span className="rounded-lg border border-amber-500/45 px-3 py-2">mode=shadow, no external side effects</span>}</div>
                  </div>
                  <h3 className="mt-6 text-sm font-black">Evidence layers</h3>
                  <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-cardBorder/60 bg-cardBorder/60 sm:grid-cols-3 xl:grid-cols-6">{evidenceLayers.map((layer) => <div key={layer} className="bg-card px-3 py-3"><div className="font-mono text-[11px] font-black text-muted">{layer}</div><div className="mt-1 text-xs font-black">{readable(selectedRun.evidenceLayers[layer])}</div></div>)}</div>
                  <div className="mt-7 flex items-center justify-between"><h3 className="text-sm font-black">Durable graph</h3><span className="font-mono text-xs text-muted">{definition.definitionHash.slice(0, 12)}</span></div>
                  <ol className="mt-3 grid gap-1" aria-label={`${selectedRun.kind} workflow nodes`}>{definition.nodes.map((node) => <li key={node.id}><Link href={href(query, { run: selectedRun.id, node: node.id })} aria-current={node.id === selectedNodeId ? "step" : undefined} className={`grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow ${node.id === selectedNodeId ? "bg-cyanGlow/15" : "hover:bg-card/65"}`}><span className="min-w-0"><span className="block truncate text-sm font-black">{node.label}</span><span className="block truncate text-xs text-muted">{node.ownerLanes.join(", ")} | {readable(node.effect)}</span></span><span className="text-xs font-bold text-muted">{nodeState(node.id, selectedRun, events)}</span></Link></li>)}</ol>
                </section>

                <aside className="min-w-0 p-4 sm:p-6" aria-labelledby="automation-node-detail-title">
                  <h2 id="automation-node-detail-title" className="text-lg font-black">Node evidence</h2><p className="mt-1 text-sm font-bold">{selectedNode?.label ?? selectedNodeId}</p>
                  <dl className="mt-5 grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-xs"><dt className="font-bold text-muted">Input digest</dt><dd className="break-all font-mono">{short(pending?.inputDigest ?? receipt?.inputDigest)}</dd><dt className="font-bold text-muted">Output digest</dt><dd className="break-all font-mono">{short(receipt?.outputDigest)}</dd><dt className="font-bold text-muted">Audit chain</dt><dd className="break-all font-mono">{short(receipt?.auditChainHead)}</dd><dt className="font-bold text-muted">Worker job</dt><dd className="break-all font-mono">{receipt?.jobId ?? "not recorded"}</dd><dt className="font-bold text-muted">Attempt</dt><dd className="font-mono">{selectedRun.attempt}</dd></dl>
                  <div className="mt-5 grid grid-cols-2 gap-2 text-xs"><span>receipts: {events.receipts.length}</span><span>approvals: {events.approvals.length}</span><span>artifacts: {events.artifacts.length}</span><span>commands: {events.commands.length}</span></div>
                  <h3 className="mt-6 text-sm font-black">Artifacts and decisions</h3><div className="mt-2 grid gap-2">{artifacts.map((artifact) => <div key={artifact.id} className="rounded-lg border border-cardBorder/55 p-3 text-xs"><strong>{artifact.filename}</strong><div className="mt-1 break-all font-mono text-muted">{artifact.schemaVersion} | {short(artifact.sha256)}</div></div>)}{approvals.map((approval) => <div key={approval.id} className="rounded-lg border border-cardBorder/55 p-3 text-xs"><strong>Human decision: {approval.decision}</strong><div className="mt-1 break-all font-mono text-muted">{short(approval.decisionDigest)}</div></div>)}{artifacts.length === 0 && approvals.length === 0 && <p className="text-sm text-muted">No bound artifact or decision yet.</p>}</div>

                  {pending?.kind === "waiting-human" && pendingDecision ? <section className="mt-6 rounded-xl border border-cyanGlow/45 bg-cyanGlow/10 p-4"><h3 className="text-sm font-black">Decision persisted</h3><p className="mt-1 text-xs leading-5 text-muted">The immutable receipt is waiting for worker resume; duplicate decisions are unavailable.</p></section> : pending?.kind === "waiting-human" ? (
                    <section className="mt-6 rounded-xl border border-amber-500/45 bg-amber-500/10 p-4"><h3 className="text-sm font-black">Human decision required</h3><p className="mt-1 text-xs leading-5">Approval is bound to this interrupt, input, candidate output, actor, role, and expected version.</p><div className="mt-3 flex flex-wrap gap-2">
                      <form action="/workspace/sena/automation/command" method="post"><CommandFields csrfToken={csrfToken} intent="approve" teamId={teamId} /><input type="hidden" name="runId" value={selectedRun.id} /><input type="hidden" name="expectedVersion" value={selectedRun.version} /><input type="hidden" name="interruptId" value={pending.interruptId} /><input type="hidden" name="decisionDigest" value={senaWorkflowDecisionDigest({ runId: selectedRun.id, nodeId: pending.nodeId, interruptId: pending.interruptId, inputDigest: pending.inputDigest, candidateOutputDigest: pending.candidateOutputDigest, decision: "approve" })} /><button className={primaryButtonClass} type="submit">Approve evidence</button></form>
                      <form action="/workspace/sena/automation/command" method="post" className="flex flex-wrap gap-2"><CommandFields csrfToken={csrfToken} intent="reject" teamId={teamId} /><input type="hidden" name="runId" value={selectedRun.id} /><input type="hidden" name="expectedVersion" value={selectedRun.version} /><input type="hidden" name="interruptId" value={pending.interruptId} /><input name="reasonCode" defaultValue="evidence-incomplete" className={formClass} aria-label="Rejection reason code" required /><button className={buttonClass} type="submit">Reject</button></form>
                    </div></section>
                  ) : null}

                  <h3 className="mt-6 border-t border-cardBorder/55 pt-5 text-sm font-black">Run actions</h3><div className="mt-3 grid gap-3">
                    {["blocked", "failed", "dead_lettered"].includes(selectedRun.status) && <form action="/workspace/sena/automation/command" method="post"><CommandFields csrfToken={csrfToken} intent="retry" teamId={teamId} /><input type="hidden" name="runId" value={selectedRun.id} /><input type="hidden" name="expectedVersion" value={selectedRun.version} /><input type="hidden" name="nodeId" value={selectedRun.currentNodeId} /><button className={buttonClass} type="submit">Retry node</button></form>}
                    {!terminalStatuses.has(selectedRun.status) ? <form action="/workspace/sena/automation/command" method="post" className="flex flex-wrap gap-2"><CommandFields csrfToken={csrfToken} intent="cancel" teamId={teamId} /><input type="hidden" name="runId" value={selectedRun.id} /><input type="hidden" name="expectedVersion" value={selectedRun.version} /><input name="reasonCode" defaultValue="operator-cancelled" className={formClass} aria-label="Cancellation reason code" required /><button className={buttonClass} type="submit">Cancel run</button></form> : <a href={`/api/sena/workflows/runs/${encodeURIComponent(selectedRun.id)}/closeout`} className={buttonClass}>Download closeout</a>}
                    <details className="rounded-lg border border-cardBorder/60 p-3"><summary className="cursor-pointer text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow">Fork after source revision</summary><form action="/workspace/sena/automation/command" method="post" className="mt-3 grid gap-3"><CommandFields csrfToken={csrfToken} intent="fork" teamId={teamId} /><input type="hidden" name="runId" value={selectedRun.id} /><input type="hidden" name="expectedVersion" value={selectedRun.version} /><input name="checkpointId" placeholder="Checkpoint ID" className={formClass} required /><input name="newSourceBindingDigest" placeholder="New source binding digest" className={`${formClass} font-mono`} required /><button className={`${buttonClass} justify-self-start`} type="submit">Create immutable fork</button></form></details>
                  </div>
                  {selectedRun.blockers.length > 0 && <div className="mt-6 rounded-lg border border-red-500/45 p-3 text-xs"><strong>Blockers</strong>{selectedRun.blockers.map((blocker) => <p key={`${blocker.code}-${blocker.nodeId ?? "run"}`} className="mt-2">{blocker.code}: {blocker.message}</p>)}</div>}
                  {selectedRun.supersededByRunId && <p className="mt-4 text-xs font-bold">Superseded by {short(selectedRun.supersededByRunId)}</p>}
                </aside>
              </div>
            ) : <section className="grid min-h-[32rem] place-items-center p-6 text-center"><div><h2 className="text-lg font-black">Choose or start a run</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">The graph, evidence layers, receipts, approvals, artifacts, blockers, and closeout boundary appear here.</p></div></section>}
          </div>
        </section>
      </main>
    </div>
  );
}
