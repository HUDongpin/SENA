import { NextResponse } from "next/server";
import {
  getEnterpriseSecurityPosture,
  type SenaEnterpriseSecurityPosture
} from "@/lib/sena/enterprise/ops-security";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

const identitySecurityControlIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

function securityControlStatus(posture: SenaEnterpriseSecurityPosture, id: string) {
  return posture.controls.find((control) => control.id === id)?.status ?? "missing";
}

function securityPostureHeaders(posture: SenaEnterpriseSecurityPosture): Record<string, string> {
  const identityControlBlockers = posture.controls.filter((control) => (
    identitySecurityControlIds.includes(control.id as (typeof identitySecurityControlIds)[number]) &&
    control.status !== "pass"
  ));
  return {
    "x-sena-security-posture-status": posture.status,
    "x-sena-security-identity-controls-review": String(identityControlBlockers.length),
    "x-sena-security-identity-control-blockers": identityControlBlockers.map((control) => control.id).join("|") || "none",
    "x-sena-identity-evidence-host-allowlist": securityControlStatus(posture, "identity-evidence-host-allowlist"),
    "x-sena-identity-secret-version-binding": securityControlStatus(posture, "identity-secret-version-binding"),
    "x-sena-identity-secret-store-reference": securityControlStatus(posture, "identity-secret-store-reference"),
    "x-sena-identity-secret-rotation-cadence": securityControlStatus(posture, "identity-secret-rotation-cadence"),
    "x-sena-identity-idp-tenant-binding": securityControlStatus(posture, "identity-idp-tenant-binding"),
    "x-sena-identity-lifecycle-owner-mode": securityControlStatus(posture, "identity-lifecycle-owner-mode")
  };
}

export async function GET() {
  try {
    await requireApiSession();
    const posture = getEnterpriseSecurityPosture();
    return NextResponse.json(posture, {
      headers: securityPostureHeaders(posture)
    });
  } catch (error) {
    return jsonError(error);
  }
}
