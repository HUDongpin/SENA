import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  createEnterpriseAdjudicationRecordWithPostgresMirrorAsync,
  createEnterpriseProjectCommentWithPostgresMirrorAsync,
  deliverEnterpriseCollaborationPubSub,
  listEnterpriseProjectCollaborationWithPostgresEvidenceAsync,
  resolveEnterpriseProjectCommentWithPostgresMirrorAsync,
  touchEnterpriseProjectPresenceWithPostgresMirrorAsync
} from "@/lib/sena/enterprise/team-collaboration";
import { parseSenaReliabilityAdjudicationDecision } from "@/lib/sena/enterprise/reliability-adjudication-decision";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: ProjectRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-project-collaboration" }, async () => {
    const { projectId } = await params;
    const context = await requireApiSession();
    const collaboration = await listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(context, projectId);
    return NextResponse.json(collaboration, {
      headers: {
        "x-sena-collaboration-comment-source": collaboration.evidenceSource.comments,
        "x-sena-collaboration-presence-source": collaboration.evidenceSource.presence,
        "x-sena-collaboration-reliability-source": collaboration.evidenceSource.reliabilityRuns,
        "x-sena-collaboration-validation-source": collaboration.evidenceSource.validationRuns,
        "x-sena-collaboration-expert-review-source": collaboration.evidenceSource.expertReviews,
        "x-sena-collaboration-adjudication-source": collaboration.evidenceSource.adjudications
      }
    });
  });
}

export async function POST(request: Request, { params }: ProjectRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-project-collaboration" }, async () => {
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
        presence: await touchEnterpriseProjectPresenceWithPostgresMirrorAsync(context, projectId, {
          activeView: body.activeView ? String(body.activeView) : undefined,
          cursorLabel: body.cursorLabel ? String(body.cursorLabel) : undefined
        })
      });
    }

    if (action === "comment") {
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectComment,
        comment: await createEnterpriseProjectCommentWithPostgresMirrorAsync(context, projectId, {
          body: String(body.body ?? ""),
          target: body.target && typeof body.target === "object" ? body.target : { kind: "project" }
        })
      }, { status: 201 });
    }

    if (action === "resolve-comment") {
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectComment,
        comment: await resolveEnterpriseProjectCommentWithPostgresMirrorAsync(context, projectId, String(body.commentId ?? ""))
      });
    }

    if (action === "adjudication") {
      const decision = parseSenaReliabilityAdjudicationDecision(body.decision);
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.projectAdjudication,
        adjudication: await createEnterpriseAdjudicationRecordWithPostgresMirrorAsync(context, projectId, {
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
  });
}
