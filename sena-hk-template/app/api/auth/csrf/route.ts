import { NextResponse } from "next/server";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import {
  createEnterpriseCsrfToken
} from "@/lib/sena/enterprise/auth-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-csrf" }, async () => {
    const context = await requireApiSession();
    return NextResponse.json(createEnterpriseCsrfToken(context));
  });
}
