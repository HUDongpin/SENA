import { NextResponse } from "next/server";
import {
  deliverEnterpriseAuditLog,
  enterpriseAuditExportMaxEvents,
  exportEnterpriseAuditLogAsync,
  isEnterpriseAuditEvent,
  listEnterpriseAuditLog,
  listEnterpriseAuditLogAsync,
  recordEnterpriseAuditAsync,
  verifyEnterpriseAuditIntegrityAsync,
  type SenaEnterpriseAuditEvent
} from "@/lib/sena/enterprise/ops-audit";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function eventParam(value: string | null): SenaEnterpriseAuditEvent | undefined {
  if (!value) return undefined;
  if (!isEnterpriseAuditEvent(value)) {
    throw new SenaEnterpriseError("Unsupported audit event filter.", 400, "unsupported_audit_event");
  }
  return value;
}

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function auditCsv(events: ReturnType<typeof listEnterpriseAuditLog>["events"]) {
  const rows = [
    ["id", "createdAt", "event", "userId", "teamId", "projectId", "detail"].map(csvCell).join(","),
    ...events.map((entry) => [
      entry.id,
      entry.createdAt,
      entry.event,
      entry.userId ?? "",
      entry.teamId ?? "",
      entry.projectId ?? "",
      entry.detail
    ].map(csvCell).join(","))
  ];
  return rows.join("\n");
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-governance-audit" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId") || undefined;
    const csv = url.searchParams.get("format") === "csv";
    const query = {
      teamId,
      userId: url.searchParams.get("userId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      event: eventParam(url.searchParams.get("event")),
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined
    };
    // A CSV response is an archival artifact, not a screenful: it carries the
    // whole scoped set and ignores limit/offset, because a page of an export is
    // indistinguishable from the export once it is a file on someone's disk.
    // JSON stays paged.
    const result = csv
      ? await exportEnterpriseAuditLogAsync(context, query)
      : await listEnterpriseAuditLogAsync(context, {
        ...query,
        limit: numberParam(url.searchParams.get("limit")),
        offset: numberParam(url.searchParams.get("offset"))
      });
    const integrity = url.searchParams.get("integrity") === "1" || url.searchParams.get("integrity") === "true"
      ? await verifyEnterpriseAuditIntegrityAsync(context, { teamId })
      : undefined;

    if (csv) {
      // Only reachable when the scoped set outgrows the retention cap, which the
      // file-backed store makes impossible on write and only the Postgres store
      // can produce. Refuse: a spreadsheet missing its oldest rows looks exactly
      // like a complete one, and a marker row inside the body is something a CSV
      // consumer is free to drop.
      if (result.pagination.nextOffset !== null) {
        throw new SenaEnterpriseError(
          `Audit CSV export would be truncated: ${result.pagination.total} scoped events exceed the ${enterpriseAuditExportMaxEvents}-event export cap. Narrow the export with from/to, event, projectId, or userId filters.`,
          413,
          "audit_export_truncated"
        );
      }
      await recordEnterpriseAuditAsync({
        event: "governance.audit.export",
        userId: context.user.id,
        teamId: result.scope.requestedTeamId ?? (result.scope.teamIds.length === 1 ? result.scope.teamIds[0] : undefined),
        detail: {
          format: "csv",
          events: result.pagination.returned,
          total: result.pagination.total,
          complete: result.pagination.returned === result.pagination.total,
          chainHead: integrity?.chain.headHash ?? null,
          filterEvent: result.filters.event ?? null,
          projectId: result.filters.projectId ?? null
        }
      });
      return new Response(auditCsv(result.events), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="sena-enterprise-audit-log.csv"`,
          // The file itself is unchanged CSV; completeness and chain evidence
          // ride alongside it so an archiver never has to infer either.
          "x-sena-audit-total": String(result.pagination.total),
          "x-sena-audit-returned": String(result.pagination.returned),
          "x-sena-audit-next-offset": "none",
          ...(integrity ? {
            "x-sena-audit-chain-head": integrity.chain.headHash,
            "x-sena-audit-chain-algorithm": integrity.chain.algorithm,
            "x-sena-audit-integrity-status": integrity.status
          } : {})
        }
      });
    }

    return NextResponse.json({
      ...result,
      integrity
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-governance-audit" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const delivery = await deliverEnterpriseAuditLog(context, {
      teamId: body.teamId ? String(body.teamId) : undefined,
      limit: numberParam(body.limit === undefined ? null : String(body.limit)),
      force: Boolean(body.force),
      auditId: body.auditId ? String(body.auditId) : undefined
    });
    return NextResponse.json(delivery);
  });
}
