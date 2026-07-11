"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  buildSenaDemoVerificationCompatibilityAudit,
  type SenaDemoVerification,
  type SenaDemoVerificationCheck,
  type SenaModel
} from "./analysis-runtime";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type DemoManualReviewState = Record<string, SenaDemoVerificationCheck["manualReview"]>;

export type DemoVerificationManualReviewActionsOptions = {
  model: SenaModel;
  setDemoManualReviews: StateSetter<DemoManualReviewState>;
  setImportError: StateSetter<string | null>;
  setImportMessage: StateSetter<string>;
};

export function useDemoVerificationManualReviewActions({
  model,
  setDemoManualReviews,
  setImportError,
  setImportMessage
}: DemoVerificationManualReviewActionsOptions) {
  const updateDemoManualReview = useCallback((
    checkId: string,
    patch: Partial<SenaDemoVerificationCheck["manualReview"]>
  ) => {
    setDemoManualReviews((current) => {
      const existing = current[checkId] ?? {
        status: "pending",
        reviewer: "",
        verifiedAt: "",
        notes: ""
      };
      const next = {
        ...existing,
        ...patch
      };
      if (next.status === "pending") next.verifiedAt = "";
      return {
        ...current,
        [checkId]: next
      };
    });
  }, [setDemoManualReviews]);

  const applyDemoVerificationManualReviews = useCallback((verification: SenaDemoVerification, fileName: string) => {
    const compatibility = buildSenaDemoVerificationCompatibilityAudit(model, verification);
    if (compatibility.status !== "compatible") {
      const mismatch = compatibility.items.filter((item) => item.status === "review").map((item) => item.label).join(", ");
      setImportError(`${fileName}: demo verification does not match the active model (${mismatch}). Load the matching snapshot or dataset before applying manual-review records.`);
      return;
    }

    const manualReviews = Object.fromEntries(verification.checks.map((check) => [check.id, check.manualReview])) as DemoManualReviewState;
    setDemoManualReviews(manualReviews);
    setImportMessage(`${fileName}: demo verification manual-review records applied (${verification.summary.manualPassed} passed, ${verification.summary.manualFailed} failed, ${verification.summary.manualPending} pending).`);
    setImportError(null);
  }, [model, setDemoManualReviews, setImportError, setImportMessage]);

  return {
    applyDemoVerificationManualReviews,
    updateDemoManualReview
  };
}
