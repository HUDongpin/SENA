import { NextResponse } from "next/server";
import {
  createEnterpriseMfaSetupAsync,
  disableEnterpriseMfaAsync,
  enableEnterpriseMfaAsync,
  getEnterpriseMfaStatusAsync
} from "@/lib/sena/enterprise/auth-mfa";
import { authProductionGateHeaders, observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-mfa" }, async () => {
    const context = await requireApiSession();
    return NextResponse.json(await getEnterpriseMfaStatusAsync(context), {
      headers: authProductionGateHeaders()
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-mfa" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "setup");
    if (action === "setup") {
      return NextResponse.json(await createEnterpriseMfaSetupAsync(context), {
        status: 201,
        headers: authProductionGateHeaders()
      });
    }
    if (action === "enable") {
      return NextResponse.json(await enableEnterpriseMfaAsync(context, {
        setupToken: String(body.setupToken ?? ""),
        code: String(body.code ?? ""),
        label: body.label ? String(body.label) : undefined
      }), {
        headers: authProductionGateHeaders()
      });
    }
    return NextResponse.json({ error: "Unsupported MFA action.", code: "unsupported_mfa_action" }, { status: 400 });
  });
}

export async function DELETE(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-mfa" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await disableEnterpriseMfaAsync(context, {
      code: String(body.code ?? "")
    }), {
      headers: authProductionGateHeaders()
    });
  });
}
