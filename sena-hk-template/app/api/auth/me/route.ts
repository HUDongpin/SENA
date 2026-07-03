import {
  getEnterpriseSessionAsync
} from "@/lib/sena/enterprise/auth-session";
import { currentSessionToken, observeSenaApiRoute, sessionJson } from "@/lib/sena/api-helpers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-me" }, async () => {
    const context = await getEnterpriseSessionAsync(await currentSessionToken());
    if (!context) return NextResponse.json({ user: null, teams: [], memberships: [], permissions: [] });
    return sessionJson(context);
  });
}
