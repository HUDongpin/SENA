import { SENA_API_ENDPOINT_FACTS, SENA_API_GROUPS } from "./api-route-facts";

const groupCards = SENA_API_GROUPS.map((group) => {
  const endpoints = SENA_API_ENDPOINT_FACTS.filter((endpoint) => endpoint.group === group.id);
  return {
    ...group,
    endpointCount: endpoints.length,
    methodCount: endpoints.reduce((total, endpoint) => total + endpoint.methods.length, 0),
    samples: endpoints.slice(0, 3).map((endpoint) => `${endpoint.methods.join("/")} ${endpoint.path}`)
  };
});

const endpointRows = SENA_API_ENDPOINT_FACTS.map((endpoint) => ({
  id: endpoint.id,
  auth: endpoint.auth,
  group: endpoint.group,
  methods: endpoint.methods.join("/"),
  path: endpoint.path,
  responsesPreview: endpoint.responses.slice(0, 2).join(" · "),
  hiddenResponseCount: Math.max(0, endpoint.responses.length - 2)
}));

export const SENA_API_DOCS_SECTION_MANIFEST = {
  testIds: {
    panel: "sena-api-docs-panel",
    group: "sena-api-docs-group",
    opsHandoff: "sena-api-docs-ops-handoff",
    endpointMatrix: "sena-api-docs-endpoint-matrix",
    endpointRow: "sena-api-docs-endpoint-row"
  },
  opsHandoffSchemas: [
    "sena-enterprise-organization-deployment/v1",
    "sena-enterprise-platform-decision-register/v1",
    "sena-enterprise-native-adapter-certification/v1",
    "sena-enterprise-saas-operations-readiness/v1",
    "sena-enterprise-capability-audit/v1",
    "sena-enterprise-identity-production-evidence/v1",
    "sena-enterprise-go-live-rehearsal/v1",
    "sena-enterprise-release-gate-draft/v1",
    "sena-enterprise-go-live-rollback-drill/v1",
    "sena-enterprise-go-live-monitor/v1",
    "sena-enterprise-go-live-attestation/v1",
    "sena-enterprise-release-gate-reviews/v1"
  ],
  endpointCount: SENA_API_ENDPOINT_FACTS.length,
  methodCount: SENA_API_ENDPOINT_FACTS.reduce((total, endpoint) => total + endpoint.methods.length, 0),
  sourceGroups: SENA_API_GROUPS,
  groupCards,
  endpointRows
} as const;
