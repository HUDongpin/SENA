import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  sanitizeEnterpriseContext
} from "@/lib/sena/enterprise/auth-session";
import {
  acceptEnterpriseInvitation,
  createEnterpriseInvitation,
  revokeEnterpriseInvitation,
  type SenaEnterpriseInvitation
} from "@/lib/sena/enterprise/auth-invitations";
import { jsonError, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type InvitationMembershipHeaderSource = {
  id: string;
  role: string;
  status: string;
};

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

function invitationLifecycleHeaders(invitation: SenaEnterpriseInvitation, membership?: InvitationMembershipHeaderSource): HeadersInit {
  const headers: Record<string, string> = {
    "x-sena-invitation-id": invitation.id,
    "x-sena-invitation-status": invitation.status,
    "x-sena-team-id": invitation.teamId,
    "x-sena-invitation-role": invitation.role
  };
  if (membership) {
    headers["x-sena-membership-id"] = membership.id;
    headers["x-sena-membership-role"] = membership.role;
    headers["x-sena-membership-status"] = membership.status;
  }
  return headers;
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const invitation = createEnterpriseInvitation(context, {
      teamId: String(body.teamId || context.teams[0]?.id || ""),
      email: String(body.email ?? ""),
      role: body.role === "pi" || body.role === "admin" || body.role === "coder" || body.role === "reviewer" || body.role === "viewer"
        ? body.role
        : "reviewer",
      baseUrl: requestOrigin(request)
    });
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.teamInvitation, invitation }, {
      status: 201,
      headers: invitationLifecycleHeaders(invitation)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const url = new URL(request.url);
    let invitationId = url.searchParams.get("invitationId") || "";
    if (!invitationId) {
      const body = await request.json().catch(() => ({}));
      invitationId = String(body.invitationId ?? "");
    }
    const invitation = revokeEnterpriseInvitation(context, invitationId);
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.teamInvitation, invitation }, {
      headers: invitationLifecycleHeaders(invitation)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const accepted = acceptEnterpriseInvitation(context, {
      invitationId: body.invitationId ? String(body.invitationId) : undefined,
      inviteCode: body.inviteCode ? String(body.inviteCode) : undefined
    });
    return NextResponse.json({
      schemaVersion: accepted.schemaVersion,
      invitation: accepted.invitation,
      membership: accepted.membership,
      context: sanitizeEnterpriseContext(accepted.context)
    }, {
      headers: invitationLifecycleHeaders(accepted.invitation, accepted.membership)
    });
  } catch (error) {
    return jsonError(error);
  }
}
