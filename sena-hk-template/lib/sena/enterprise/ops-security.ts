import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSsoProvider } from "./auth-sso";
import {
  getEnterpriseDeploymentReadiness,
  type SenaEnterpriseDeploymentReadiness,
  type SenaEnterpriseDeploymentReadinessItem
} from "./ops-deployment-readiness";
import {
  getEnterpriseGovernanceStatus,
  type SenaEnterpriseGovernanceStatus
} from "./ops-governance";
import {
  isSelfManagedEnterpriseMode,
  selfManagedIdentityEvidence
} from "./ops-platform-decision-policy";

export type SenaEnterpriseSecurityControlCategory =
  | "identity"
  | "access"
  | "data-protection"
  | "audit-monitoring"
  | "continuity";

export type SenaEnterpriseSecurityControl = {
  id: string;
  category: SenaEnterpriseSecurityControlCategory;
  label: string;
  severity: SenaEnterpriseDeploymentReadinessItem["severity"];
  status: SenaEnterpriseDeploymentReadinessItem["status"];
  source: "governance" | "readiness";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseSecurityPosture = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSecurityPosture;
  status: "ready" | "review" | "blocked";
  generatedAt: string;
  evidenceSources: {
    governanceSchema: SenaEnterpriseGovernanceStatus["schemaVersion"];
    readinessSchema: SenaEnterpriseDeploymentReadiness["schemaVersion"];
  };
  summary: {
    controls: number;
    pass: number;
    review: number;
    blockingReview: number;
    advisoryReview: number;
    categories: Array<{
      id: SenaEnterpriseSecurityControlCategory;
      controls: number;
      review: number;
    }>;
  };
  auth: {
    sessionCookie: string;
    sessionDays: number;
    sessionPolicy: {
      standardDays: number;
      rememberedDays: number;
    };
    passwordHash: SenaEnterpriseGovernanceStatus["auth"]["passwordHash"];
    ssoModes: SenaEnterpriseSsoProvider[];
    configuredOidcProviders: SenaEnterpriseSsoProvider[];
    mfa: SenaEnterpriseGovernanceStatus["auth"]["mfa"];
    passwordReset: SenaEnterpriseGovernanceStatus["auth"]["passwordReset"];
  };
  controls: SenaEnterpriseSecurityControl[];
  runbook: {
    requiredBeforeProduction: string[];
    reviewBeforePublication: string[];
    api: "/api/sena/governance/security";
  };
};

function now() {
  return new Date().toISOString();
}

function securityGovernanceCheck(status: SenaEnterpriseGovernanceStatus, id: string) {
  return status.checks.find((check) => check.id === id);
}

function governanceSecurityControl(
  governance: SenaEnterpriseGovernanceStatus,
  id: string,
  category: SenaEnterpriseSecurityControlCategory,
  severity: SenaEnterpriseDeploymentReadinessItem["severity"]
): SenaEnterpriseSecurityControl {
  const check = securityGovernanceCheck(governance, id);
  return {
    id,
    category,
    label: check?.label ?? id,
    severity,
    status: check?.status ?? "review",
    source: "governance",
    evidence: check?.evidence ?? ["governanceCheck=missing"],
    nextAction: check?.nextAction ?? "Add governance evidence for this security control."
  };
}

function readinessSecurityControl(
  readiness: SenaEnterpriseDeploymentReadiness,
  id: string,
  category: SenaEnterpriseSecurityControlCategory
): SenaEnterpriseSecurityControl {
  const item = [...readiness.blocking, ...readiness.advisory].find((candidate) => candidate.id === id);
  return {
    id,
    category,
    label: item?.label ?? id,
    severity: item?.severity ?? "advisory",
    status: item?.status ?? "review",
    source: "readiness",
    evidence: item?.evidence ?? ["readinessItem=missing"],
    nextAction: item?.nextAction ?? "Add deployment-readiness evidence for this security control."
  };
}

export function getEnterpriseSecurityPosture(): SenaEnterpriseSecurityPosture {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const governance = getEnterpriseGovernanceStatus();
  const readiness = getEnterpriseDeploymentReadiness();
  const selfManagedOidcControl: SenaEnterpriseSecurityControl = {
    id: "oauth-oidc-sso",
    category: "identity",
    label: "OAuth/OIDC provider configured and preflighted",
    severity: "blocking",
    status: "pass",
    source: "readiness",
    evidence: selfManagedIdentityEvidence(["authMode=local"]),
    nextAction: "Keep local auth, session, MFA, and CSRF evidence current for this self-managed deployment."
  };
  const controls: SenaEnterpriseSecurityControl[] = [
    governanceSecurityControl(governance, "auth-session", "identity", "blocking"),
    selfManagedEnterprise ? selfManagedOidcControl : governanceSecurityControl(governance, "oauth-oidc-sso", "identity", "blocking"),
    governanceSecurityControl(governance, "security-response-headers", "data-protection", "blocking"),
    readinessSecurityControl(readiness, "oidc-provider", "identity"),
    readinessSecurityControl(readiness, "provisioning-token", "identity"),
    readinessSecurityControl(readiness, "identity-evidence-host-allowlist", "identity"),
    readinessSecurityControl(readiness, "identity-secret-version-binding", "identity"),
    readinessSecurityControl(readiness, "identity-secret-store-reference", "identity"),
    readinessSecurityControl(readiness, "identity-secret-rotation-cadence", "identity"),
    readinessSecurityControl(readiness, "identity-idp-tenant-binding", "identity"),
    readinessSecurityControl(readiness, "identity-lifecycle-owner-mode", "identity"),
    governanceSecurityControl(governance, "rbac", "access", "blocking"),
    governanceSecurityControl(governance, "team-lifecycle-governance", "access", "advisory"),
    readinessSecurityControl(readiness, "secret-hardening", "data-protection"),
    governanceSecurityControl(governance, "upload-security-scan", "data-protection", "blocking"),
    governanceSecurityControl(governance, "upload-storage-integrity", "data-protection", "blocking"),
    readinessSecurityControl(readiness, "object-storage-webhook", "data-protection"),
    governanceSecurityControl(governance, "audit-log", "audit-monitoring", "blocking"),
    readinessSecurityControl(readiness, "audit-webhook", "audit-monitoring"),
    readinessSecurityControl(readiness, "ops-bearer-token", "audit-monitoring"),
    readinessSecurityControl(readiness, "alert-webhook", "audit-monitoring"),
    readinessSecurityControl(readiness, "storage-writable", "continuity"),
    readinessSecurityControl(readiness, "write-before-backup", "continuity"),
    readinessSecurityControl(readiness, "backup-freshness", "continuity"),
    readinessSecurityControl(readiness, "backup-webhook", "continuity"),
    readinessSecurityControl(readiness, "database-sync-webhook", "continuity"),
    readinessSecurityControl(readiness, "collaboration-pubsub", "continuity")
  ];
  const pass = controls.filter((control) => control.status === "pass").length;
  const review = controls.length - pass;
  const blockingReview = controls.filter((control) => control.status === "review" && control.severity === "blocking").length;
  const advisoryReview = controls.filter((control) => control.status === "review" && control.severity === "advisory").length;
  const categories: SenaEnterpriseSecurityControlCategory[] = ["identity", "access", "data-protection", "audit-monitoring", "continuity"];
  const configuredOidcProviders = governance.auth.oidcProviders
    .filter((provider) => provider.configured)
    .map((provider) => provider.provider);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSecurityPosture,
    status: blockingReview > 0 ? "blocked" : review > 0 ? "review" : "ready",
    generatedAt: now(),
    evidenceSources: {
      governanceSchema: governance.schemaVersion,
      readinessSchema: readiness.schemaVersion
    },
    summary: {
      controls: controls.length,
      pass,
      review,
      blockingReview,
      advisoryReview,
      categories: categories.map((category) => {
        const categoryControls = controls.filter((control) => control.category === category);
        return {
          id: category,
          controls: categoryControls.length,
          review: categoryControls.filter((control) => control.status === "review").length
        };
      })
    },
    auth: {
      sessionCookie: governance.auth.sessionCookie,
      sessionDays: governance.auth.sessionDays,
      sessionPolicy: governance.auth.sessionPolicy,
      passwordHash: governance.auth.passwordHash,
      ssoModes: governance.auth.ssoModes,
      configuredOidcProviders,
      mfa: governance.auth.mfa,
      passwordReset: governance.auth.passwordReset
    },
    controls,
    runbook: {
      requiredBeforeProduction: controls
        .filter((control) => control.status === "review" && control.severity === "blocking")
        .map((control) => control.nextAction),
      reviewBeforePublication: controls
        .filter((control) => control.status === "review" && control.severity === "advisory")
        .map((control) => control.nextAction),
      api: "/api/sena/governance/security"
    }
  };
}
