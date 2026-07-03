import { NextResponse } from "next/server";
import {
  logoutEnterpriseSessionAsync,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { currentSessionToken, observeSenaApiRoute, requireApiSessionForMutation, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-logout" }, async () => {
    await requireApiSessionForMutation(request);
    await logoutEnterpriseSessionAsync(await currentSessionToken());
    const response = NextResponse.json({ ok: true });
    response.cookies.set(senaSessionCookieName, "", sessionCookieOptions(0));
    return response;
  });
}
