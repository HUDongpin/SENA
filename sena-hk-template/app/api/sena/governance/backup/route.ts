import { NextResponse } from "next/server";
import {
  createEnterpriseBackupWithPostgresEvidence,
  deliverEnterpriseBackupWithPostgresEvidence,
  verifyEnterpriseBackupWithPostgresEvidence,
  type SenaEnterpriseBackupArtifact
} from "@/lib/sena/enterprise/ops-backup";
import {
  deliverEnterpriseDatabaseSyncWithPostgresEvidence
} from "@/lib/sena/enterprise/ops-database-sync";
import {
  restoreEnterpriseBackupWithPostgresEvidence
} from "@/lib/sena/enterprise/ops-backup-restore";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-governance-backup" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId") || undefined;
    return NextResponse.json(await createEnterpriseBackupWithPostgresEvidence(context, { teamId }));
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-governance-backup" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    if (body.action === "deliver") {
      const backup = (body.artifact ?? body.backup) as SenaEnterpriseBackupArtifact | undefined;
      return NextResponse.json(await deliverEnterpriseBackupWithPostgresEvidence(context, {
        teamId: body.teamId,
        backup
      }));
    }
    if (body.action === "sync-database") {
      const backup = (body.artifact ?? body.backup) as SenaEnterpriseBackupArtifact | undefined;
      return NextResponse.json(await deliverEnterpriseDatabaseSyncWithPostgresEvidence(context, {
        teamId: body.teamId,
        backup
      }));
    }
    const backup = (body.artifact ?? body.backup ?? body) as SenaEnterpriseBackupArtifact;
    if (body.action === "restore" || body.action === "restore-dry-run") {
      return NextResponse.json(await restoreEnterpriseBackupWithPostgresEvidence(context, backup, {
        mode: "merge",
        dryRun: body.action === "restore-dry-run" || Boolean(body.dryRun)
      }));
    }
    return NextResponse.json(await verifyEnterpriseBackupWithPostgresEvidence(context, backup));
  });
}
