import { NextResponse } from "next/server";
import {
  buildEnterpriseNotificationDeliveryResponse,
  buildEnterpriseNotificationListResponse,
  buildEnterpriseNotificationReadResponse
} from "@/lib/sena/enterprise/notifications-delivery";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const response = buildEnterpriseNotificationListResponse(context, url.searchParams);
    return NextResponse.json(response.body);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const response = buildEnterpriseNotificationReadResponse(context, await request.json());
    return NextResponse.json(response.body);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json().catch(() => ({}));
    const response = await buildEnterpriseNotificationDeliveryResponse(context, body);
    return NextResponse.json(response.body);
  } catch (error) {
    return jsonError(error);
  }
}
