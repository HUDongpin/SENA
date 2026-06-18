import { NextResponse } from "next/server";
import {
  createEnterpriseAdjudicationRecord,
  createEnterpriseProjectComment,
  deliverEnterpriseCollaborationPubSub,
  listEnterpriseProjectCollaboration,
  resolveEnterpriseProjectComment,
  touchEnterpriseProjectPresence
} from "@/lib/sena/enterprise/team-project";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSession();
    return NextResponse.json(listEnterpriseProjectCollaboration(context, params.projectId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "presence");

    if (action === "deliver-pubsub") {
      return NextResponse.json(await deliverEnterpriseCollaborationPubSub(context, {
        projectId: params.projectId,
        limit: body.limit,
        force: Boolean(body.force),
        eventId: body.eventId ? String(body.eventId) : undefined
      }));
    }

    if (action === "presence") {
      return NextResponse.json({
        schemaVersion: "sena-project-presence/v1",
        presence: touchEnterpriseProjectPresence(context, params.projectId, {
          activeView: body.activeView ? String(body.activeView) : undefined,
          cursorLabel: body.cursorLabel ? String(body.cursorLabel) : undefined
        })
      });
    }

    if (action === "comment") {
      return NextResponse.json({
        schemaVersion: "sena-project-comment/v1",
        comment: createEnterpriseProjectComment(context, params.projectId, {
          body: String(body.body ?? ""),
          target: body.target && typeof body.target === "object" ? body.target : { kind: "project" }
        })
      }, { status: 201 });
    }

    if (action === "resolve-comment") {
      return NextResponse.json({
        schemaVersion: "sena-project-comment/v1",
        comment: resolveEnterpriseProjectComment(context, params.projectId, String(body.commentId ?? ""))
      });
    }

    if (action === "adjudication") {
      const decision = body.decision === "exclude" || body.decision === "revise" ? body.decision : "include";
      return NextResponse.json({
        schemaVersion: "sena-project-adjudication/v1",
        adjudication: createEnterpriseAdjudicationRecord(context, params.projectId, {
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
