import { NextResponse } from "next/server";
import {
  deliverEnterpriseOpsAlerts,
  getEnterpriseOpsAlerts,
  type SenaEnterpriseOpsAlerts
} from "@/lib/sena/enterprise/ops-governance";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { jsonError } from "@/lib/sena/api-helpers";
import { requireOpsAccess, requireOpsMutationAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function identityAlertBlockers(alerts: SenaEnterpriseOpsAlerts) {
  return alerts.alerts.filter((alert) => alert.id.startsWith("readiness-blocking-identity-"));
}

function opsAlertHeaders(alerts: SenaEnterpriseOpsAlerts): Record<string, string> {
  const identityAlerts = identityAlertBlockers(alerts);
  const identitySeverity = identityAlerts.some((alert) => alert.severity === "critical")
    ? "critical"
    : identityAlerts.some((alert) => alert.severity === "warning")
      ? "warning"
      : "clear";
  return {
    "x-sena-ops-alert-status": alerts.status,
    "x-sena-ops-alert-firing": String(alerts.summary.firing),
    "x-sena-identity-alert-count": String(identityAlerts.length),
    "x-sena-identity-alert-blockers": identityAlerts.map((alert) => alert.id).join("|") || "none",
    "x-sena-identity-alert-severity": identitySeverity
  };
}

export async function GET(request: Request) {
  try {
    const access = requireOpsAccess(request);
    const alerts = getEnterpriseOpsAlerts();
    return NextResponse.json({
      ...alerts,
      access
    }, {
      status: alerts.status === "critical" ? 503 : 200,
      headers: opsAlertHeaders(alerts)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = requireOpsMutationAccess(request);
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (!body.action || body.action === "deliver") {
      const delivery = await deliverEnterpriseOpsAlerts();
      return NextResponse.json({
        ...delivery,
        access
      }, {
        status: delivery.status === "failed" ? 502 : 200
      });
    }
    throw new SenaEnterpriseError("Unsupported ops alert action.", 400, "unsupported_ops_alert_action");
  } catch (error) {
    return jsonError(error);
  }
}
