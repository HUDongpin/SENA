import { createHash } from "node:crypto";
import { senaJsonValuesEqual } from "../canonical-json";
import { SenaEnterpriseError } from "./errors";

export type SenaEnterpriseExecutionIdempotency = {
  key: string;
  createdAt: string;
};

export function assertSenaEnterpriseExecutionIdempotency(
  input: SenaEnterpriseExecutionIdempotency | undefined,
  context: string
) {
  if (!input) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(input.key) || !Number.isFinite(Date.parse(input.createdAt))) {
    throw new SenaEnterpriseError(
      `${context} execution idempotency binding is invalid.`,
      400,
      "enterprise_execution_idempotency_invalid"
    );
  }
  return input;
}

export function senaEnterpriseExecutionId(prefix: string, key: string) {
  if (!/^[a-z][a-z0-9_]{0,30}$/.test(prefix)) {
    throw new SenaEnterpriseError(
      "Enterprise execution id prefix is invalid.",
      500,
      "enterprise_execution_idempotency_invalid"
    );
  }
  return `${prefix}_job_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

export function assertSenaEnterpriseIdempotentResult<T>(input: {
  existing: T | undefined;
  candidate: T;
  context: string;
  code: string;
}) {
  if (!input.existing) return undefined;
  if (senaJsonValuesEqual(input.existing, input.candidate)) return input.existing;
  throw new SenaEnterpriseError(
    `${input.context} execution idempotency key is bound to different evidence.`,
    409,
    input.code
  );
}
