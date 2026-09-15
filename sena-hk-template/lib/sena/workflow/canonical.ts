import { createHash } from "node:crypto";
import { canonicalSenaJson } from "../canonical-json";

export function senaWorkflowCanonicalJson(value: unknown) {
  const canonical = canonicalSenaJson(value);
  if (canonical === undefined) throw new Error("Workflow evidence must be canonically JSON serializable.");
  return canonical;
}

export function senaWorkflowDigest(value: unknown) {
  return createHash("sha256").update(senaWorkflowCanonicalJson(value)).digest("hex");
}

export function senaWorkflowAuditChainHead(input: {
  previousAuditChainHead?: string;
  receiptWithoutAuditChainHead: unknown;
}) {
  return senaWorkflowDigest({
    previousAuditChainHead: input.previousAuditChainHead ?? null,
    receipt: input.receiptWithoutAuditChainHead
  });
}
