const schemaVersion = "sena-enterprise-production-performance-budget/v2";

const expectedCheckIds = [
  "production-build-present",
  "production-build-identity",
  "workspace-html-br",
  "workspace-route-js-br",
  "total-static-js-br"
];

const canonicalBudgets = {
  workspaceHtmlBrotliBytes: 80_000,
  workspaceRouteJsBrotliBytes: 180_000,
  totalStaticJsBrotliBytes: 848_000,
  totalStaticJsMinimumHeadroomBytes: 12_000
};

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateSenaPerformanceBudgetSemantics(artifact) {
  if (artifact?.schemaVersion !== schemaVersion || artifact?.status !== "pass") {
    return "performance-budget-top-level-invalid";
  }

  const policy = record(artifact.policy);
  if (policy?.productionBuildRequired !== true ||
    policy.buildIdentityRequiredForBinding !== true ||
    policy.totalStaticJsHeadroomReserveRequired !== true ||
    policy.strictProductionEvidenceRequired !== true ||
    policy.artifactPurpose !== "archive-performance-budget-json-plus-sha256") {
    return "performance-budget-policy-invalid";
  }

  const redaction = record(artifact.redaction);
  if (redaction?.localBuildPathsExcluded !== true ||
    redaction.sourceContentsExcluded !== true ||
    redaction.secretValuesExcluded !== true) {
    return "performance-budget-redaction-missing";
  }

  if (!Array.isArray(artifact.checks) || artifact.checks.length !== expectedCheckIds.length) {
    return "performance-budget-checks-invalid";
  }
  const checks = new Map();
  for (const value of artifact.checks) {
    const check = record(value);
    if (!check || typeof check.id !== "string" || checks.has(check.id)) {
      return "performance-budget-checks-invalid";
    }
    checks.set(check.id, check);
  }
  if (expectedCheckIds.some((id) => !checks.has(id)) ||
    Array.from(checks.values()).some((check) => check.status !== "pass")) {
    return "performance-budget-checks-invalid";
  }

  const summary = record(artifact.summary);
  if (summary?.checks !== expectedCheckIds.length ||
    summary.passed !== expectedCheckIds.length ||
    summary.failed !== 0 ||
    !positiveInteger(summary.totalStaticJsFiles) ||
    !positiveInteger(summary.workspaceRouteJsFiles)) {
    return "performance-budget-summary-invalid";
  }

  const budgets = record(artifact.budgets);
  if (budgets?.workspaceHtmlBrotliBytes !== canonicalBudgets.workspaceHtmlBrotliBytes ||
    budgets.workspaceRouteJsBrotliBytes !== canonicalBudgets.workspaceRouteJsBrotliBytes ||
    budgets.totalStaticJsBrotliBytes !== canonicalBudgets.totalStaticJsBrotliBytes ||
    budgets.totalStaticJsMinimumHeadroomBytes !== canonicalBudgets.totalStaticJsMinimumHeadroomBytes) {
    return "performance-budget-values-invalid";
  }

  const sizeChecks = [
    ["workspace-html-br", budgets.workspaceHtmlBrotliBytes, undefined],
    ["workspace-route-js-br", budgets.workspaceRouteJsBrotliBytes, undefined],
    ["total-static-js-br", budgets.totalStaticJsBrotliBytes, budgets.totalStaticJsMinimumHeadroomBytes]
  ];
  for (const [id, expectedBudget, expectedReserve] of sizeChecks) {
    const check = checks.get(id);
    if (!positiveInteger(check.actualBrotliBytes) ||
      !positiveInteger(check.budgetBytes) ||
      check.budgetBytes !== expectedBudget ||
      !nonNegativeInteger(check.headroomBytes) ||
      check.headroomBytes !== check.budgetBytes - check.actualBrotliBytes ||
      check.actualBrotliBytes > check.budgetBytes) {
      return "performance-budget-math-invalid";
    }
    if (expectedReserve === undefined) {
      if (check.minimumHeadroomBytes !== undefined) {
        return "performance-budget-math-invalid";
      }
    } else if (check.minimumHeadroomBytes !== expectedReserve || check.headroomBytes < expectedReserve) {
      return "performance-budget-math-invalid";
    }
  }

  return undefined;
}
