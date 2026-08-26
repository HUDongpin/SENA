export type SenaVerifierServerCustodyOptions = {
  expectedReceiptKeyId?: string;
  provisioningToken?: string;
  serverCustody?: unknown;
};

export function requireExpectedReceiptKeyId(
  options: SenaVerifierServerCustodyOptions
): string;

export function requireVerifierControlledLoopbackOrigin(baseUrl: string): string;

export function registerVerifierControlledServerCustody(
  options: SenaVerifierServerCustodyOptions,
  origin: string,
  expectedReceiptKeyId: string,
  provisioningToken: string
): unknown;

export function requireVerifierControlledServerCustody(
  options: SenaVerifierServerCustodyOptions,
  origin: string,
  expectedReceiptKeyId: string,
  provisioningToken: string
): unknown;

export function verifySenaEnterpriseApiBrowserSmoke(
  baseUrl?: string,
  options?: SenaVerifierServerCustodyOptions
): Promise<void>;
