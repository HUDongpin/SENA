import { NextResponse } from "next/server";
import {
  createEnterpriseMfaSetup,
  disableEnterpriseMfa,
  enableEnterpriseMfa,
  getEnterpriseMfaStatus
} from "@/lib/sena/enterprise/auth-mfa";
import { authProductionGateHeaders, jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireApiSession();
    return NextResponse.json(getEnterpriseMfaStatus(context), {
      headers: authProductionGateHeaders()
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "setup");
    if (action === "setup") {
      return NextResponse.json(createEnterpriseMfaSetup(context), {
        status: 201,
        headers: authProductionGateHeaders()
      });
    }
    if (action === "enable") {
      return NextResponse.json(enableEnterpriseMfa(context, {
        setupToken: String(body.setupToken ?? ""),
        code: String(body.code ?? ""),
        label: body.label ? String(body.label) : undefined
      }), {
        headers: authProductionGateHeaders()
      });
    }
    return NextResponse.json({ error: "Unsupported MFA action.", code: "unsupported_mfa_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(disableEnterpriseMfa(context, {
      code: String(body.code ?? "")
    }), {
      headers: authProductionGateHeaders()
    });
  } catch (error) {
    return jsonError(error);
  }
}
