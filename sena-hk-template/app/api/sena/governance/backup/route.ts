import { NextResponse } from "next/server";
import {
  createEnterpriseBackup,
  deliverEnterpriseBackup,
  deliverEnterpriseDatabaseSync,
  restoreEnterpriseBackup,
  verifyEnterpriseBackup,
  type SenaEnterpriseBackupArtifact
} from "@/lib/sena/enterprise";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId") || undefined;
    return NextResponse.json(createEnterpriseBackup(context, { teamId }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    if (body.action === "deliver") {
      const backup = (body.artifact ?? body.backup) as SenaEnterpriseBackupArtifact | undefined;
      return NextResponse.json(await deliverEnterpriseBackup(context, {
        teamId: body.teamId,
        backup
      }));
    }
    if (body.action === "sync-database") {
      const backup = (body.artifact ?? body.backup) as SenaEnterpriseBackupArtifact | undefined;
      return NextResponse.json(await deliverEnterpriseDatabaseSync(context, {
        teamId: body.teamId,
        backup
      }));
    }
    const backup = (body.artifact ?? body.backup ?? body) as SenaEnterpriseBackupArtifact;
    if (body.action === "restore" || body.action === "restore-dry-run") {
      return NextResponse.json(restoreEnterpriseBackup(context, backup, {
        mode: "merge",
        dryRun: body.action === "restore-dry-run" || Boolean(body.dryRun)
      }));
    }
    return NextResponse.json(verifyEnterpriseBackup(context, backup));
  } catch (error) {
    return jsonError(error);
  }
}
