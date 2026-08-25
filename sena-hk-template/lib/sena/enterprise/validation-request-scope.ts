import { AsyncLocalStorage } from "node:async_hooks";
import { SenaGroupComparisonSourceVerificationCache } from "../inference";

type SenaValidationRequestScope = {
  sourceVerificationCache: SenaGroupComparisonSourceVerificationCache;
};

type SenaValidationRequestBudgetOptions = ConstructorParameters<
  typeof SenaGroupComparisonSourceVerificationCache
>[0];

const validationRequestScope = new AsyncLocalStorage<SenaValidationRequestScope>();

export function currentSenaValidationSourceVerificationCache() {
  return validationRequestScope.getStore()?.sourceVerificationCache;
}

export function senaValidationSourceVerificationCache() {
  return currentSenaValidationSourceVerificationCache() ??
    new SenaGroupComparisonSourceVerificationCache();
}

/**
 * Shares one cumulative validation replay/model budget across a complete API
 * request (including state-write normalization and observability writes).
 * Nested route helpers reuse the existing scope; they cannot reset the budget
 * by opening another helper or retrying a state mutation.
 */
export function runWithSenaValidationRequestScope<T>(
  operation: (scope: SenaValidationRequestScope) => T,
  options: SenaValidationRequestBudgetOptions = {}
): T {
  const existing = validationRequestScope.getStore();
  if (existing) return operation(existing);
  const scope: SenaValidationRequestScope = {
    sourceVerificationCache: new SenaGroupComparisonSourceVerificationCache(options)
  };
  return validationRequestScope.run(scope, () => operation(scope));
}
