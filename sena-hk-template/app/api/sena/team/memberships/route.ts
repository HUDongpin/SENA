import { NextResponse } from "next/server";
import {
  updateEnterpriseMembership,
  type SenaEnterpriseMembership,
  type SenaEnterpriseRole
} from "@/lib/sena/enterprise/identity-auth";
import { jsonError, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function roleFromBody(value: unknown): SenaEnterpriseRole | undefined {
  return value === "owner" || value === "pi" || value === "admin" || value === "coder" || value === "reviewer" || value === "viewer"
    ? value
    : undefined;
}

function statusFromBody(value: unknown): SenaEnterpriseMembership["status"] | undefined {
  return value === "active" || value === "suspended" ? value : undefined;
}

function membershipLifecycleHeaders(membership: SenaEnterpriseMembership): HeadersInit {
  return {
    "x-sena-membership-id": membership.id,
    "x-sena-team-id": membership.teamId,
    "x-sena-member-user-id": membership.userId,
    "x-sena-membership-role": membership.role,
    "x-sena-membership-status": membership.status
  };
}

export async function PATCH(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const membership = updateEnterpriseMembership(context, String(body.membershipId ?? ""), {
      role: roleFromBody(body.role),
      status: statusFromBody(body.status)
    });
    return NextResponse.json({ schemaVersion: "sena-team-membership/v1", membership }, {
      headers: membershipLifecycleHeaders(membership)
    });
  } catch (error) {
    return jsonError(error);
  }
}
