import {
  getEnterpriseSession
} from "@/lib/sena/enterprise/identity-auth";
import { currentSessionToken, jsonError, sessionJson } from "@/lib/sena/api-helpers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = getEnterpriseSession(currentSessionToken());
    if (!context) return NextResponse.json({ user: null, teams: [], memberships: [], permissions: [] });
    return sessionJson(context);
  } catch (error) {
    return jsonError(error);
  }
}
