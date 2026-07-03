import { NextResponse } from "next/server";
import {
  listEnterpriseSessionsAsync,
  revokeEnterpriseSessionsAsync,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { observeSenaApiRoute, requireApiCsrf, requireApiSession, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-sessions" }, async () => {
    const context = await requireApiSession();
    return NextResponse.json(await listEnterpriseSessionsAsync(context));
  });
}

export async function DELETE(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-sessions" }, async () => {
    const context = await requireApiSession();
    await requireApiCsrf(request, context);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const result = await revokeEnterpriseSessionsAsync(context, {
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      revokeOtherSessions: action === "revoke-others",
      revokeAllSessions: action === "revoke-all"
    });
    const response = NextResponse.json(result);
    if (result.currentSessionRevoked) {
      response.cookies.set(senaSessionCookieName, "", sessionCookieOptions(0));
    }
    return response;
  });
}
