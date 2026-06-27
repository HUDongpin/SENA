import { NextResponse } from "next/server";
import {
  logoutEnterpriseSession,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { currentSessionToken, jsonError, requireApiSessionForMutation, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireApiSessionForMutation(request);
    logoutEnterpriseSession(await currentSessionToken());
    const response = NextResponse.json({ ok: true });
    response.cookies.set(senaSessionCookieName, "", sessionCookieOptions(0));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
