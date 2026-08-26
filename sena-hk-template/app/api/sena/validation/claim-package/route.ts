import { NextResponse } from "next/server";
import {
  getEnterpriseClaimEvidencePackageWithPostgresEvidence
} from "@/lib/sena/enterprise/claim-evidence-package";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-claim-package" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const claimPackage = await getEnterpriseClaimEvidencePackageWithPostgresEvidence(context, {
      projectId: String(url.searchParams.get("projectId") ?? "")
    });
    return NextResponse.json(claimPackage, {
      headers: {
        "x-sena-claim-package-status": claimPackage.status,
        "x-sena-project-id": claimPackage.project.id,
        "x-sena-project-version": String(claimPackage.project.currentVersion),
        "x-sena-source-snapshot-sha256": claimPackage.sourceSnapshotEvidence.snapshotSha256,
        ...(claimPackage.sourceSnapshotEvidence.persistedSnapshotSha256
          ? { "x-sena-persisted-source-snapshot-sha256": claimPackage.sourceSnapshotEvidence.persistedSnapshotSha256 }
          : {}),
        ...(claimPackage.sourceSnapshotEvidence.stateRevisionSha256
          ? { "x-sena-claim-state-revision-sha256": claimPackage.sourceSnapshotEvidence.stateRevisionSha256 }
          : {}),
        "x-sena-report-sha256": claimPackage.sourceSnapshotEvidence.reportSha256,
        "x-sena-claim-evidence-reliability-source": claimPackage.evidenceSource.reliabilityRuns,
        "x-sena-claim-evidence-validation-source": claimPackage.evidenceSource.validationRuns,
        "x-sena-claim-evidence-expert-review-source": claimPackage.evidenceSource.expertReviews,
        "x-sena-claim-evidence-adjudication-source": claimPackage.evidenceSource.adjudications
      }
    });
  });
}
