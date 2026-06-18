import { NextResponse } from "next/server";
import { logoutEnterpriseSession, senaSessionCookieName } from "@/lib/sena/enterprise";
import { currentSessionToken, jsonError, requireApiSessionForMutation, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireApiSessionForMutation(request);
    logoutEnterpriseSession(currentSessionToken());
    const response = NextResponse.json({ ok: true });
    response.cookies.set(senaSessionCookieName, "", sessionCookieOptions(0));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
