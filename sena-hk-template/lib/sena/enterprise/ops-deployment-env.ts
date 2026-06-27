import {
  envValue,
  sha256Text
} from "./ops-runtime";

export type SenaEnterpriseOrganizationDeploymentEnv = {
  name: string;
  category: "runtime" | "auth" | "identity" | "sso" | "provisioning" | "storage" | "notifications" | "collaboration" | "uploads" | "governance" | "ops";
  required: boolean;
  configured: boolean;
  secret: boolean;
  status: "pass" | "review";
  purpose: string;
  endpointHash?: string;
  valueHash?: string;
  defaultedTo?: string;
};

export function deploymentEnv(input: Omit<SenaEnterpriseOrganizationDeploymentEnv, "configured" | "status"> & {
  configured?: boolean;
  value?: string;
}) {
  const configured = input.configured ?? Boolean(envValue(input.name));
  const env: SenaEnterpriseOrganizationDeploymentEnv = {
    name: input.name,
    category: input.category,
    required: input.required,
    configured,
    secret: input.secret,
    status: input.required && !configured ? "review" : "pass",
    purpose: input.purpose,
    defaultedTo: input.defaultedTo
  };
  if (!input.secret && input.value) env.valueHash = sha256Text(input.value);
  if (input.endpointHash) env.endpointHash = input.endpointHash;
  return env;
}

export function deploymentWebhookEnv(
  urlName: string,
  secretName: string,
  provider: { configured: boolean; endpointHash?: string; secretConfigured: boolean },
  category: SenaEnterpriseOrganizationDeploymentEnv["category"],
  purpose: string
) {
  return [
    deploymentEnv({
      name: urlName,
      category,
      required: true,
      configured: provider.configured,
      secret: false,
      endpointHash: provider.endpointHash,
      purpose
    }),
    deploymentEnv({
      name: secretName,
      category,
      required: true,
      configured: provider.secretConfigured,
      secret: true,
      purpose: `${purpose} HMAC signing secret`
    })
  ];
}
