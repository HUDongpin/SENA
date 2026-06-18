import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import {
  createEnterpriseCsrfToken
} from "@/lib/sena/enterprise/identity-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = requireApiSession();
    return NextResponse.json(createEnterpriseCsrfToken(context));
  } catch (error) {
    return jsonError(error);
  }
}
