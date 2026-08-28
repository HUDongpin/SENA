import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/sena/api-helpers";
import {
  verifyEnterpriseCsrfTokenAsync
} from "@/lib/sena/enterprise/auth-session";
import { enterpriseErrorResponse, SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { listEnterpriseProjectCollaborationWithPostgresEvidenceAsync } from "@/lib/sena/enterprise/team-collaboration";
import { getEnterpriseProjectAsync } from "@/lib/sena/enterprise/team-project";
import {
  createSenaWorkflowRun,
  performSenaWorkflowAction,
  withSenaWorkflowStore
} from "@/lib/sena/workflow/api-runtime";
import { senaWorkflowCheckpointBinding } from "@/lib/sena/workflow/postgres-runtime";

export const runtime = "nodejs";
const maxFormBytes = 64 * 1024;
const maxFormChunks = 1_024;

function field(form: FormData, name: string, maximum = 512) {
  const value = form.get(name);
  if (typeof value !== "string") {
    throw new SenaEnterpriseError(`EvidenceFlow form field ${name} is required.`, 422, "workflow_form_field_required");
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) {
    throw new SenaEnterpriseError(`EvidenceFlow form field ${name} is invalid.`, 422, "workflow_form_field_invalid");
  }
  return trimmed;
}

function fields(form: FormData, name: string) {
  const values = form.getAll(name);
  if (values.length < 1 || values.length > 100 || values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new SenaEnterpriseError(`EvidenceFlow form field ${name} is invalid.`, 422, "workflow_form_field_invalid");
  }
  return values.map((value) => String(value).trim());
}

function expectedVersion(form: FormData) {
  const value = Number(field(form, "expectedVersion", 20));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SenaEnterpriseError("EvidenceFlow expectedVersion is invalid.", 422, "workflow_expected_version_invalid");
  }
  return value;
}

function redirect(input: {
  teamId?: string;
  runId?: string;
  notice?: "started" | "action";
  error?: string;
}) {
  const params = new URLSearchParams();
  if (input.teamId) params.set("team", input.teamId);
  if (input.runId) params.set("run", input.runId);
  if (input.notice) params.set("notice", input.notice);
  if (input.error) params.set("error", input.error);
  return new NextResponse(null, {
    status: 303,
    headers: { location: `/workspace/sena/automation?${params}` }
  });
}

async function readBoundedForm(request: Request) {
  const declared = request.headers.get("content-length")?.trim();
  if (declared) {
    if (!/^\d+$/.test(declared)) {
      throw new SenaEnterpriseError("EvidenceFlow form Content-Length is invalid.", 400, "workflow_form_length_invalid");
    }
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed > maxFormBytes) {
      throw new SenaEnterpriseError("EvidenceFlow form is too large.", 413, "workflow_form_too_large");
    }
  }
  const contentType = request.headers.get("content-type")?.trim();
  if (!contentType || !request.body) {
    throw new SenaEnterpriseError("EvidenceFlow form body is missing.", 400, "workflow_form_body_invalid");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let chunkCount = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    chunkCount += 1;
    bytes += next.value.byteLength;
    if (bytes > maxFormBytes || chunkCount > maxFormChunks) {
      await reader.cancel().catch(() => undefined);
      throw new SenaEnterpriseError("EvidenceFlow form is too large.", 413, "workflow_form_too_large");
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { "content-type": contentType } }).formData();
}

export async function POST(request: Request) {
  let teamId = "";
  let runId = "";
  try {
    const form = await readBoundedForm(request);
    teamId = field(form, "teamId", 200);
    runId = typeof form.get("runId") === "string" ? String(form.get("runId")).trim() : "";
    const context = await requireApiSession();
    await verifyEnterpriseCsrfTokenAsync(context, field(form, "csrfToken", 1024));
    const idempotencyKey = field(form, "idempotencyKey", 200);
    const intent = field(form, "intent", 40);

    if (intent === "start-research") {
      const projectId = field(form, "projectId", 200);
      const project = await getEnterpriseProjectAsync(context, projectId);
      const collaboration = await listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(context, projectId);
      const revision = collaboration.revisions.find((candidate) => candidate.version === project.currentVersion);
      if (!revision) {
        throw new SenaEnterpriseError("The current project revision is not retained.", 409, "workflow_project_revision_missing");
      }
      const result = await withSenaWorkflowStore((store) => createSenaWorkflowRun({
        context,
        idempotencyKey,
        store,
        body: {
          kind: "research-evidence",
          teamId,
          projectId,
          projectRevisionId: revision.id,
          parameters: {
            researchSourceClass: field(form, "researchSourceClass", 64),
            importUploadIds: fields(form, "importUploadIds"),
            reliabilityUploadIds: fields(form, "reliabilityUploadIds"),
            validationSuite: "default",
            publicationFormat: field(form, "publicationFormat", 32)
          }
        }
      }));
      return redirect({ teamId, runId: result.run.id, notice: "started" });
    }

    if (intent === "start-engineering") {
      const rawParameters = field(form, "engineeringJson", 50_000);
      let parameters: unknown;
      try {
        parameters = JSON.parse(rawParameters);
      } catch {
        throw new SenaEnterpriseError("Engineering evidence JSON is invalid.", 422, "workflow_engineering_json_invalid");
      }
      if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
        throw new SenaEnterpriseError("Engineering evidence JSON must be an object.", 422, "workflow_engineering_json_invalid");
      }
      const result = await withSenaWorkflowStore((store) => createSenaWorkflowRun({
        context,
        idempotencyKey,
        store,
        body: {
          kind: "engineering-release",
          teamId,
          repo: field(form, "repo", 300),
          baseSha: field(form, "baseSha", 64).toLowerCase(),
          candidateSha: field(form, "candidateSha", 64).toLowerCase(),
          workRequestDigest: field(form, "workRequestDigest", 64).toLowerCase(),
          parameters
        }
      }));
      return redirect({ teamId, runId: result.run.id, notice: "started" });
    }

    const version = expectedVersion(form);
    const body = intent === "approve"
      ? {
          action: "approve",
          expectedVersion: version,
          interruptId: field(form, "interruptId", 200),
          decisionDigest: field(form, "decisionDigest", 64).toLowerCase()
        }
      : intent === "reject"
        ? {
            action: "reject",
            expectedVersion: version,
            interruptId: field(form, "interruptId", 200),
            reasonCode: field(form, "reasonCode", 120)
          }
        : intent === "retry"
          ? { action: "retry", expectedVersion: version, nodeId: field(form, "nodeId", 200) }
          : intent === "cancel"
            ? { action: "cancel", expectedVersion: version, reasonCode: field(form, "reasonCode", 120) }
            : intent === "fork"
              ? {
                  action: "fork",
                  expectedVersion: version,
                  checkpointId: field(form, "checkpointId", 300),
                  newSourceBindingDigest: field(form, "newSourceBindingDigest", 64).toLowerCase()
                }
              : null;
    if (!body || !runId) {
      throw new SenaEnterpriseError("EvidenceFlow form intent is invalid.", 422, "workflow_form_intent_invalid");
    }
    const result = await withSenaWorkflowStore((store) => performSenaWorkflowAction({
      context,
      runId,
      body,
      idempotencyKey,
      store,
      validateCheckpoint: senaWorkflowCheckpointBinding
    }));
    return redirect({ teamId, runId: result.run.id, notice: "action" });
  } catch (error) {
    const response = enterpriseErrorResponse(error);
    const code = typeof response.body.code === "string" ? response.body.code : "workflow_form_failed";
    return redirect({ teamId, runId, error: code });
  }
}
