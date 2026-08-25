import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { canonicalSenaJson } from "@/lib/sena/canonical-json";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createEnterpriseExpertReviewWithPostgresMirrorAsync,
  listEnterpriseExpertReviewsAsync,
  reviewEnterpriseExpertReviewWithPostgresMirrorAsync,
  type SenaEnterpriseExpertReview
} from "@/lib/sena/enterprise/expert-review";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { admitSenaExpertReviewMutationRequest } from "@/lib/sena/enterprise/heavy-request-admission";

export const runtime = "nodejs";

function targetFromBody(body: Record<string, unknown>): Partial<SenaEnterpriseExpertReview["target"]> {
  const target = typeof body.target === "object" && body.target !== null && !Array.isArray(body.target)
    ? body.target as Record<string, unknown>
    : body;
  return {
    kind: target.kind === "validation-run" || target.kind === "reliability-run" || target.kind === "claim" || target.kind === "project"
      ? target.kind
      : "project",
    id: target.id ? String(target.id) : undefined,
    label: target.label ? String(target.label) : undefined
  };
}

function ratingsFromBody(body: Record<string, unknown>): Partial<SenaEnterpriseExpertReview["ratings"]> {
  const ratings = typeof body.ratings === "object" && body.ratings !== null && !Array.isArray(body.ratings)
    ? body.ratings as Record<string, unknown>
    : body;
  return {
    dataAdequacy: ratings.dataAdequacy === undefined ? undefined : Number(ratings.dataAdequacy),
    methodFit: ratings.methodFit === undefined ? undefined : Number(ratings.methodFit),
    interpretationValidity: ratings.interpretationValidity === undefined ? undefined : Number(ratings.interpretationValidity)
  };
}

function statusFromBody(value: unknown): SenaEnterpriseExpertReview["status"] | undefined {
  if (value === "requested" || value === "approved" || value === "changes-requested" || value === "rejected") return value;
  return undefined;
}

function claimScopeFromBody(value: unknown): SenaEnterpriseExpertReview["claimScope"] | undefined {
  if (value === "exploratory-only" || value === "claim-ready-with-limits" || value === "not-claim-ready") return value;
  return undefined;
}

function expertReviewHeaders(review: SenaEnterpriseExpertReview): HeadersInit {
  const receipt = review.evidenceReceipt;
  const receiptSha256 = receipt
    ? createHash("sha256").update(canonicalSenaJson(receipt) ?? "null").digest("hex")
    : undefined;
  return {
    "x-sena-expert-review-id": review.id,
    "x-sena-project-id": review.projectId,
    "x-sena-team-id": review.teamId,
    "x-sena-expert-review-status": review.status,
    "x-sena-expert-review-claim-scope": review.claimScope,
    "x-sena-expert-review-target-kind": review.target.kind,
    "x-sena-expert-review-target-id": review.target.id ?? "",
    "x-sena-expert-review-data-adequacy": String(review.ratings.dataAdequacy),
    "x-sena-expert-review-method-fit": String(review.ratings.methodFit),
    "x-sena-expert-review-interpretation-validity": String(review.ratings.interpretationValidity),
    "x-sena-expert-review-receipt-present": String(Boolean(receipt)),
    ...(receipt ? {
      "x-sena-expert-review-receipt-key-id": receipt.keyId,
      "x-sena-expert-review-receipt-sha256": receiptSha256!,
      "x-sena-expert-review-target-validation-evidence-sha256": receipt.validationRunEvidenceHash
    } : {})
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-expert-review" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.expertReviewList,
      expertReviews: await listEnterpriseExpertReviewsAsync(context, {
        teamId: url.searchParams.get("teamId") || undefined,
        projectId: url.searchParams.get("projectId") || undefined
      })
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-expert-review" }, async () => {
    const admitted = await admitSenaExpertReviewMutationRequest(request, "POST");
    const context = await requireApiSessionForMutation(admitted.request);
    const body = admitted.body;
    const expertReview = await createEnterpriseExpertReviewWithPostgresMirrorAsync(context, {
      projectId: String(body.projectId ?? ""),
      target: targetFromBody(body),
      reviewerName: body.reviewerName ? String(body.reviewerName) : undefined,
      reviewerRole: body.reviewerRole ? String(body.reviewerRole) : undefined,
      expertiseArea: body.expertiseArea ? String(body.expertiseArea) : undefined,
      status: statusFromBody(body.status),
      claimScope: claimScopeFromBody(body.claimScope),
      ratings: ratingsFromBody(body),
      strengths: body.strengths ? String(body.strengths) : undefined,
      concerns: body.concerns ? String(body.concerns) : undefined,
      recommendations: body.recommendations ? String(body.recommendations) : undefined,
      limitations: body.limitations ? String(body.limitations) : undefined
    });
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.expertReviewResponse,
      expertReview
    }, {
      headers: expertReviewHeaders(expertReview)
    });
  });
}

export async function PATCH(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-expert-review" }, async () => {
    const admitted = await admitSenaExpertReviewMutationRequest(request, "PATCH");
    const context = await requireApiSessionForMutation(admitted.request);
    const body = admitted.body;
    const expertReview = await reviewEnterpriseExpertReviewWithPostgresMirrorAsync(context, String(body.reviewId ?? body.expertReviewId ?? ""), {
      status: statusFromBody(body.status),
      claimScope: claimScopeFromBody(body.claimScope),
      ratings: ratingsFromBody(body),
      strengths: body.strengths === undefined ? undefined : String(body.strengths),
      concerns: body.concerns === undefined ? undefined : String(body.concerns),
      recommendations: body.recommendations === undefined ? undefined : String(body.recommendations),
      limitations: body.limitations === undefined ? undefined : String(body.limitations)
    });
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.expertReviewResponse,
      expertReview
    }, {
      headers: expertReviewHeaders(expertReview)
    });
  });
}
