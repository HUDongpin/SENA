import { NextResponse } from "next/server";
import {
  createEnterpriseReleaseGateReviewWithPostgresEvidence,
  listEnterpriseReleaseGateReviewsWithPostgresEvidence,
  type SenaEnterpriseReleaseGateReviewInput
} from "@/lib/sena/enterprise/ops-release-gate";
import {
  buildEnterpriseReleaseGateIdentitySnapshotHeaders
} from "@/lib/sena/enterprise/ops-response-builders";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-release-gate" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    const reviews = await listEnterpriseReleaseGateReviewsWithPostgresEvidence(context, { teamId });
    return NextResponse.json(reviews, {
      headers: buildEnterpriseReleaseGateIdentitySnapshotHeaders(reviews.reviews[0])
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-release-gate" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json() as Partial<SenaEnterpriseReleaseGateReviewInput>;
    const review = await createEnterpriseReleaseGateReviewWithPostgresEvidence(context, {
      teamId: String(body.teamId ?? ""),
      environment: String(body.environment ?? ""),
      releaseVersion: String(body.releaseVersion ?? ""),
      decision: String(body.decision ?? "") as SenaEnterpriseReleaseGateReviewInput["decision"],
      approverName: String(body.approverName ?? ""),
      approverRole: String(body.approverRole ?? ""),
      notes: String(body.notes ?? ""),
      verificationCommand: String(body.verificationCommand ?? ""),
      verificationEvidence: body.verificationEvidence
    });
    return NextResponse.json({ review }, {
      status: 201,
      headers: buildEnterpriseReleaseGateIdentitySnapshotHeaders(review)
    });
  });
}
