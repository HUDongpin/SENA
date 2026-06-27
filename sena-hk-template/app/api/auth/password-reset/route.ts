import { NextResponse } from "next/server";
import {
  completeEnterprisePasswordReset,
  createEnterprisePasswordReset
} from "@/lib/sena/enterprise/auth-password-reset";
import { authProductionGateHeaders, enforceAuthRateLimit, jsonError } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "request");
    enforceAuthRateLimit(request, {
      bucket: `auth.password_reset.${action}`,
      discriminator: String(body.email ?? body.resetToken ?? body.token ?? "")
    });
    if (action === "request") {
      return NextResponse.json(createEnterprisePasswordReset({
        email: String(body.email ?? ""),
        baseUrl: requestOrigin(request)
      }), {
        status: 202,
        headers: authProductionGateHeaders()
      });
    }
    if (action === "confirm") {
      return NextResponse.json(completeEnterprisePasswordReset({
        resetToken: String(body.resetToken ?? body.token ?? ""),
        password: String(body.password ?? "")
      }), {
        headers: authProductionGateHeaders()
      });
    }
    return NextResponse.json({ error: "Unsupported password reset action.", code: "unsupported_password_reset_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
