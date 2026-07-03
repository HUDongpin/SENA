import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  updateEnterpriseMembershipAsync,
  type SenaEnterpriseMembership
} from "@/lib/sena/enterprise/team-memberships";
import type { SenaEnterpriseRole } from "@/lib/sena/enterprise/access-control";
import { observeSenaApiRoute, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

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
  return observeSenaApiRoute(request, { routeId: "sena-team-memberships" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const membership = await updateEnterpriseMembershipAsync(context, String(body.membershipId ?? ""), {
      role: roleFromBody(body.role),
      status: statusFromBody(body.status)
    });
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.teamMembership, membership }, {
      headers: membershipLifecycleHeaders(membership)
    });
  });
}
