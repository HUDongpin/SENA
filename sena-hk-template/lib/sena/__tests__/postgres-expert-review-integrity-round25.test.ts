import { describe, expect, it } from "vitest";
import {
  createEnterprisePostgresExpertReviewAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import type { SenaEnterpriseExpertReview } from "../enterprise/expert-review";

const review: SenaEnterpriseExpertReview = {
  id: "expert-round25",
  teamId: "team-round25",
  projectId: "project-round25",
  userId: "user-round25",
  status: "approved",
  target: {
    kind: "validation-run",
    id: "validation-round25",
    validationRunEvidenceHash: "a".repeat(64)
  },
  reviewerName: "Round25 Reviewer",
  reviewerRole: "Domain expert",
  expertiseArea: "Statistical integrity",
  claimScope: "claim-ready-with-limits",
  ratings: {
    dataAdequacy: 4,
    methodFit: 4,
    interpretationValidity: 4
  },
  strengths: "Exact evidence target.",
  concerns: "Synthetic fixture.",
  recommendations: "Keep claims bounded.",
  limitations: "No participant data.",
  reviewedAt: "2026-08-25T00:00:00.000Z",
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z"
};

function rowFor(payload: SenaEnterpriseExpertReview): Record<string, unknown> {
  return {
    id: payload.id,
    team_id: payload.teamId,
    project_id: payload.projectId,
    user_id: payload.userId,
    status: payload.status,
    target_kind: payload.target.kind,
    target_id: payload.target.id ?? null,
    target_label: payload.target.label ?? null,
    reviewer_name: payload.reviewerName,
    reviewer_role: payload.reviewerRole,
    expertise_area: payload.expertiseArea,
    claim_scope: payload.claimScope,
    data_adequacy: payload.ratings.dataAdequacy,
    method_fit: payload.ratings.methodFit,
    interpretation_validity: payload.ratings.interpretationValidity,
    payload,
    reviewed_at: payload.reviewedAt ?? null,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt
  };
}

function adapterFor(row: Record<string, unknown>) {
  const query = (async (sql: string) => ({
    rows: sql.includes("SELECT *") ? [row] : []
  })) as SenaEnterprisePostgresQuery;
  return createEnterprisePostgresExpertReviewAdapter({ query });
}

async function expectStoredIntegrity(operation: Promise<unknown>, path: string) {
  await expect(operation).rejects.toMatchObject({
    name: "SenaEnterpriseStoredIntegrityError",
    issues: expect.arrayContaining([expect.objectContaining({ path })])
  });
}

describe("Postgres expert-review tenant and row integrity", () => {
  it("rejects a SQL team_id that diverges from the expert-review payload", async () => {
    const row = rowFor(structuredClone(review));
    row.team_id = "team_foreign_sql_row";

    await expectStoredIntegrity(adapterFor(row).listExpertReviews({
      teamId: review.teamId,
      projectId: review.projectId
    }), "row.team_id");
  });

  it("rejects a payload team that diverges from the requested team scope", async () => {
    const payload = structuredClone(review);
    payload.teamId = "team_foreign_payload";
    const row = rowFor(payload);

    await expectStoredIntegrity(adapterFor(row).listExpertReviews({
      teamId: review.teamId,
      projectId: review.projectId
    }), "row.team_id");
  });

  it("rejects a payload project that diverges from the requested project scope", async () => {
    const payload = structuredClone(review);
    payload.projectId = "project_foreign_payload";
    const row = rowFor(payload);

    await expectStoredIntegrity(adapterFor(row).listExpertReviews({
      teamId: review.teamId,
      projectId: review.projectId
    }), "row.project_id");
  });
});
