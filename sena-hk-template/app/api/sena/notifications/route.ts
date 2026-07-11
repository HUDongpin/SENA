import { NextResponse } from "next/server";
import {
  buildEnterpriseNotificationDeliveryResponseAsync,
  buildEnterpriseNotificationListResponseAsync,
  buildEnterpriseNotificationReadResponseAsync
} from "@/lib/sena/enterprise/notifications-delivery";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-notifications" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const response = await buildEnterpriseNotificationListResponseAsync(context, url.searchParams);
    return NextResponse.json(response.body);
  });
}

export async function PATCH(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-notifications" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const response = await buildEnterpriseNotificationReadResponseAsync(context, await request.json());
    return NextResponse.json(response.body);
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-notifications" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json().catch(() => ({}));
    const response = await buildEnterpriseNotificationDeliveryResponseAsync(context, body);
    return NextResponse.json(response.body);
  });
}
