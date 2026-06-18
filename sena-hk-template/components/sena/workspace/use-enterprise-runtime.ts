"use client";

import { useCallback, useRef } from "react";
import {
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import type { EnterpriseCsrfToken } from "./enterprise-contracts";

export function useEnterpriseWorkspaceApi() {
  const enterpriseCsrfRef = useRef<EnterpriseCsrfToken | null>(null);

  const enterpriseCsrfHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!enterpriseCsrfRef.current) {
      const payload = await requestSenaWorkspaceJson<Partial<EnterpriseCsrfToken> & { error?: string }>(
        SENA_WORKSPACE_API_ROUTES.auth.csrf,
        undefined,
        { errorMessage: "Could not prepare secure request token." }
      );
      if (!payload.token) throw new Error(payload.error || "Could not prepare secure request token.");
      enterpriseCsrfRef.current = {
        headerName: String(payload.headerName || "x-sena-csrf-token"),
        token: String(payload.token),
        sessionId: String(payload.sessionId || ""),
        expiresAt: String(payload.expiresAt || "")
      };
    }
    return { [enterpriseCsrfRef.current.headerName]: enterpriseCsrfRef.current.token };
  }, []);

  const enterpriseJsonHeaders = useCallback(async () => ({
    "content-type": "application/json",
    ...(await enterpriseCsrfHeaders())
  }), [enterpriseCsrfHeaders]);

  const resetEnterpriseCsrfToken = useCallback(() => {
    enterpriseCsrfRef.current = null;
  }, []);

  return {
    enterpriseCsrfHeaders,
    enterpriseJsonHeaders,
    resetEnterpriseCsrfToken
  };
}
