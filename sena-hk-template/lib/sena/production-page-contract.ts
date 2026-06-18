import contract from "./production-page-contract.json";
import type { SenaProductionPageContract } from "./types";

export const senaProductionPageContract = contract as SenaProductionPageContract;

export function buildSenaProductionPageContract(): SenaProductionPageContract {
  return senaProductionPageContract;
}

export function productionPageRequiredText(
  pageContract: SenaProductionPageContract = senaProductionPageContract
) {
  return [
    ...pageContract.sections.flatMap((section) => section.requiredText),
    ...pageContract.visualChecks.map((check) => check.requiredText)
  ];
}
