import { NextResponse } from "next/server";
import {
  deliverEnterpriseEmails,
  deliverEnterpriseNotifications,
  listEnterpriseNotifications,
  markEnterpriseNotificationRead,
  type SenaEnterpriseNotificationKind,
  type SenaEnterpriseNotificationStatus
} from "@/lib/sena/enterprise/notifications-delivery";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

const notificationKinds: SenaEnterpriseNotificationKind[] = [
  "team.invite",
  "auth.password_reset",
  "project.comment",
  "reliability.review",
  "validation.review"
];

const notificationStatuses: SenaEnterpriseNotificationStatus[] = ["delivered", "read", "failed"];

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusParam(value: string | null) {
  return notificationStatuses.includes(value as SenaEnterpriseNotificationStatus)
    ? value as SenaEnterpriseNotificationStatus
    : undefined;
}

function kindParam(value: string | null) {
  return notificationKinds.includes(value as SenaEnterpriseNotificationKind)
    ? value as SenaEnterpriseNotificationKind
    : undefined;
}

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    return NextResponse.json(listEnterpriseNotifications(context, {
      teamId: url.searchParams.get("teamId") || undefined,
      status: statusParam(url.searchParams.get("status")),
      kind: kindParam(url.searchParams.get("kind")),
      limit: numberParam(url.searchParams.get("limit")),
      offset: numberParam(url.searchParams.get("offset"))
    }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const notification = markEnterpriseNotificationRead(context, String(body.notificationId ?? ""));
    return NextResponse.json({
      schemaVersion: "sena-enterprise-notification/v1",
      notification
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === "deliver-email" || body.channel === "email") {
      const delivery = await deliverEnterpriseEmails(context, {
        teamId: body.teamId ? String(body.teamId) : undefined,
        limit: typeof body.limit === "number" ? body.limit : undefined,
        force: Boolean(body.force),
        emailDeliveryId: body.emailDeliveryId ? String(body.emailDeliveryId) : undefined
      });
      return NextResponse.json(delivery);
    }
    const delivery = await deliverEnterpriseNotifications(context, {
      teamId: body.teamId ? String(body.teamId) : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      force: Boolean(body.force),
      notificationId: body.notificationId ? String(body.notificationId) : undefined
    });
    return NextResponse.json(delivery);
  } catch (error) {
    return jsonError(error);
  }
}
