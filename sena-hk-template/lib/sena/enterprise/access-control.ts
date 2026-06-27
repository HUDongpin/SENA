import { SenaEnterpriseError } from "./errors";

export type SenaEnterpriseRole = "owner" | "pi" | "admin" | "coder" | "reviewer" | "viewer";

export type SenaEnterprisePermission =
  | "team:manage"
  | "member:invite"
  | "upload:create"
  | "upload:read"
  | "project:create"
  | "project:read"
  | "project:update"
  | "project:delete"
  | "project:comment"
  | "reliability:adjudicate"
  | "expert:review"
  | "analysis:run"
  | "export:create";

export const rolePermissions: Record<SenaEnterpriseRole, SenaEnterprisePermission[]> = {
  owner: ["team:manage", "member:invite", "upload:create", "upload:read", "project:create", "project:read", "project:update", "project:delete", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  pi: ["team:manage", "member:invite", "upload:create", "upload:read", "project:create", "project:read", "project:update", "project:delete", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  admin: ["member:invite", "upload:create", "upload:read", "project:create", "project:read", "project:update", "project:delete", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  coder: ["upload:create", "upload:read", "project:create", "project:read", "project:update", "project:comment", "reliability:adjudicate", "analysis:run", "export:create"],
  reviewer: ["upload:read", "project:read", "project:comment", "reliability:adjudicate", "expert:review", "analysis:run", "export:create"],
  viewer: ["upload:read", "project:read", "export:create"]
};

type SenaEnterprisePermissionContext = {
  memberships: Array<{
    teamId: string;
    role: SenaEnterpriseRole;
    status: string;
  }>;
};

export function hasEnterprisePermission(
  context: SenaEnterprisePermissionContext,
  teamId: string,
  permission: SenaEnterprisePermission
) {
  return context.memberships.some((membership) => (
    membership.teamId === teamId &&
    membership.status === "active" &&
    rolePermissions[membership.role].includes(permission)
  ));
}

export function requireEnterprisePermission(
  context: SenaEnterprisePermissionContext,
  teamId: string,
  permission: SenaEnterprisePermission
) {
  if (!hasEnterprisePermission(context, teamId, permission)) {
    throw new SenaEnterpriseError("Your SENA role does not allow this action.", 403, "permission_denied");
  }
}
