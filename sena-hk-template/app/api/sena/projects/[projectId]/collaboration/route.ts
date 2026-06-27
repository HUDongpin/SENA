import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  createEnterpriseAdjudicationRecord,
  createEnterpriseProjectComment,
  deliverEnterpriseCollaborationPubSub,
  listEnterpriseProjectCollaboration,
  resolveEnterpriseProjectComment,
  touchEnterpriseProjectPresence
} from "@/lib/sena/enterprise/team-collaboration";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: ProjectRouteContext) {
  try {
    const { projectId } = await params;
    const context = await requireApiSession();
    return NextResponse.json(listEnterpriseProjectCollaboration(context, projectId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: ProjectRouteContext) {
  try {
    const { projectId } = await params;
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "presence");

    if (action === "deliver-pubsub") {
      return NextResponse.json(await deliverEnterpriseCollaborationPubSub(context, {
        projectId,
        limit: body.limit,
        force: Boolean(body.force),
        eventId: body.eventId ? String(body.eventId) : undefined
      }));
    }

    if (action === "presence") {
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectPresence,
        presence: touchEnterpriseProjectPresence(context, projectId, {
          activeView: body.activeView ? String(body.activeView) : undefined,
          cursorLabel: body.cursorLabel ? String(body.cursorLabel) : undefined
        })
      });
    }

    if (action === "comment") {
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectComment,
        comment: createEnterpriseProjectComment(context, projectId, {
          body: String(body.body ?? ""),
          target: body.target && typeof body.target === "object" ? body.target : { kind: "project" }
        })
      }, { status: 201 });
    }

    if (action === "resolve-comment") {
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectComment,
        comment: resolveEnterpriseProjectComment(context, projectId, String(body.commentId ?? ""))
      });
    }

    if (action === "adjudication") {
      const decision = body.decision === "exclude" || body.decision === "revise" ? body.decision : "include";
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectAdjudication,
        adjudication: createEnterpriseAdjudicationRecord(context, projectId, {
          reliabilityRunId: body.reliabilityRunId ? String(body.reliabilityRunId) : undefined,
          itemId: String(body.itemId ?? ""),
          codeId: String(body.codeId ?? ""),
          decision,
          notes: body.notes ? String(body.notes) : undefined,
          coderValues: body.coderValues && typeof body.coderValues === "object" ? body.coderValues : undefined
        })
      }, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported collaboration action.", code: "unsupported_collaboration_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
