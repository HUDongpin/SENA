import { NextResponse } from "next/server";
import {
  getEnterpriseClaimEvidencePackage
} from "@/lib/sena/enterprise/reliability-validation";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    const claimPackage = getEnterpriseClaimEvidencePackage(context, {
      projectId: String(url.searchParams.get("projectId") ?? "")
    });
    return NextResponse.json(claimPackage, {
      headers: {
        "x-sena-claim-package-status": claimPackage.status,
        "x-sena-project-id": claimPackage.project.id,
        "x-sena-project-version": String(claimPackage.project.currentVersion),
        "x-sena-source-snapshot-sha256": claimPackage.sourceSnapshotEvidence.snapshotSha256,
        "x-sena-report-sha256": claimPackage.sourceSnapshotEvidence.reportSha256
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
