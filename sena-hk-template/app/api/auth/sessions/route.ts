import { NextResponse } from "next/server";
import {
  listEnterpriseSessions,
  revokeEnterpriseSessions,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { jsonError, requireApiCsrf, requireApiSession, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireApiSession();
    return NextResponse.json(listEnterpriseSessions(context));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireApiSession();
    requireApiCsrf(request, context);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const result = revokeEnterpriseSessions(context, {
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      revokeOtherSessions: action === "revoke-others",
      revokeAllSessions: action === "revoke-all"
    });
    const response = NextResponse.json(result);
    if (result.currentSessionRevoked) {
      response.cookies.set(senaSessionCookieName, "", sessionCookieOptions(0));
    }
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
