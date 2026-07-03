import { NextResponse } from "next/server";
import {
  completeEnterprisePasswordResetAsync,
  createEnterprisePasswordResetAsync
} from "@/lib/sena/enterprise/auth-password-reset";
import { authProductionGateHeaders, enforceAuthRateLimitAsync, observeSenaApiRoute } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-password-reset" }, async () => {
    const body = await request.json();
    const action = String(body.action ?? "request");
    await enforceAuthRateLimitAsync(request, {
      bucket: `auth.password_reset.${action}`,
      discriminator: String(body.email ?? body.resetToken ?? body.token ?? "")
    });
    if (action === "request") {
      return NextResponse.json(await createEnterprisePasswordResetAsync({
        email: String(body.email ?? ""),
        baseUrl: requestOrigin(request)
      }), {
        status: 202,
        headers: authProductionGateHeaders()
      });
    }
    if (action === "confirm") {
      return NextResponse.json(await completeEnterprisePasswordResetAsync({
        resetToken: String(body.resetToken ?? body.token ?? ""),
        password: String(body.password ?? "")
      }), {
        headers: authProductionGateHeaders()
      });
    }
    return NextResponse.json({ error: "Unsupported password reset action.", code: "unsupported_password_reset_action" }, { status: 400 });
  });
}
