export class SenaEnterpriseError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "sena_enterprise_error"
  ) {
    super(message);
  }
}

export function enterpriseErrorResponse(error: unknown) {
  if (error instanceof SenaEnterpriseError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status
    };
  }
  return {
    body: { error: error instanceof Error ? error.message : "Unexpected SENA enterprise error.", code: "unexpected_error" },
    status: 500
  };
}
