import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import {
  createEnterpriseCsrfToken
} from "@/lib/sena/enterprise/auth-session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireApiSession();
    return NextResponse.json(createEnterpriseCsrfToken(context));
  } catch (error) {
    return jsonError(error);
  }
}
