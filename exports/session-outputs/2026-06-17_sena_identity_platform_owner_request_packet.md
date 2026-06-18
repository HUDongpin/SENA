# SENA Identity Platform Owner Request Packet

Date: 2026-06-17

Workspace: `/Users/dongpinhu/Desktop/SENA`

Purpose: give the institution platform owner a concrete, redacted submission checklist for closing the SENA enterprise identity production gate. This packet does not contain secrets and does not replace institution-owned evidence.

## Current Status

Local engineering verification has passed for the current SENA worktree, including `npm run build` and `npm run sena:pilot:verify`. Production cutover is still blocked until the institution platform owner submits signed or institution-owned evidence for IdP tenant approval, SSO secret custody and rotation, SCIM/IdP lifecycle ownership, and provisioning rotation.

Canonical local dossier route:

```text
GET /api/sena/ops/identity-production-evidence?teamId=<teamId>
```

Use this route immediately before submission to capture the current `requestPacketPolicyHash`, action-plan digest, owner-runbook digest, missing evidence IDs, and receipt archive manifest. Session requests require `teamId`; ops bearer access can inspect global ops evidence where configured.

Platform-decision submission route:

```text
POST /api/sena/ops/platform-decisions
```

This mutation requires an authenticated team-manager session plus CSRF token from:

```text
GET /api/auth/csrf
```

Send the returned token in:

```text
x-sena-csrf-token: <token>
```

## Redaction Rules

- Do not submit raw SSO client secrets, provisioning bearer tokens, passwords, private keys, recovery codes, or screenshots that reveal them.
- Do not paste secret values into `notes`, `ownerName`, `ownerRole`, `environment`, or evidence URLs.
- Evidence URLs must be institution-owned HTTPS locations with a concrete artifact path.
- Evidence URLs must not include embedded credentials, fragments, or sensitive query parameters.
- Submit only a SHA-256 digest of the institution-owned external evidence artifact in `productionEvidenceArtifactDigest`.
- Keep tenant IDs, secret-store references, and rotation versions as non-secret bindings; SENA stores hashes/redacted status, not secret values.

## Preflight Checklist

Before platform-owner submission, confirm the deployment has the non-secret bindings needed by the identity production verifier:

```text
SENA_APP_URL
SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS
SENA_SSO_INSTITUTION_TENANT_ID
SENA_SSO_INSTITUTION_CLIENT_SECRET_REF
SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION
SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS
SENA_PROVISIONING_TOKEN_SECRET_REF
SENA_PROVISIONING_TOKEN_VERSION
SENA_IDENTITY_LIFECYCLE_OWNER_MODE
```

Also run the SSO provider preflight for the institution provider before submitting release evidence:

```text
GET /api/auth/sso?status=1&preflight=1&provider=institution
```

## Submission 1: Institution IdP Owner

Decision ID:

```text
institution-idp-approval
```

Evidence IDs this submission must cover:

```text
idp-tenant-approval
idp-callback-approval
sso-provider-secrets
sso-secret-store-reference
sso-secret-rotation
```

Required external artifact: an institution-owned evidence artifact, stored outside this repository, whose SHA-256 digest covers tenant/app-registration approval, callback/redirect URI approval, SSO secret custody, secret-store reference, and rotation receipt/version. The artifact may be a signed ticket, change record, platform approval export, or equivalent institution evidence.

JSON body template:

```json
{
  "teamId": "<team-id>",
  "decisionId": "institution-idp-approval",
  "status": "accepted",
  "acceptedBridge": true,
  "ownerName": "<specific institution IdP owner name>",
  "ownerRole": "Institution identity platform owner",
  "environment": "production",
  "evidenceUrl": "https://<institution-owned-evidence-host>/<specific-artifact-path>",
  "productionEvidenceIds": [
    "idp-tenant-approval",
    "idp-callback-approval",
    "sso-provider-secrets",
    "sso-secret-store-reference",
    "sso-secret-rotation"
  ],
  "productionEvidenceArtifactDigest": "sha256:<external-evidence-artifact-digest>",
  "productionEvidenceVerifiedAt": "<ISO-8601 timestamp, past or present>",
  "requestPacketPolicyHash": "<x-sena-identity-request-packet-policy-hash from the current dossier>",
  "notes": "Institution-owned IdP tenant/app registration, callback approval, SSO secret custody, secret-store reference, and rotation receipt are recorded in the external evidence artifact. No secret values are included."
}
```

## Submission 2: Institution Provisioning Owner

Decision ID:

```text
institution-provisioning-owner
```

Evidence IDs this submission must cover:

```text
provisioning-owner
scim-or-idp-ownership
bearer-token-rotation
lifecycle-guardrails
```

Required external artifact: an institution-owned evidence artifact, stored outside this repository, whose SHA-256 digest covers the named provisioning owner, SCIM vs IdP lifecycle-write ownership, bearer-token rotation receipt/version, and accepted lifecycle guardrails for suspension/group sync/last-active-manager protection.

JSON body template:

```json
{
  "teamId": "<team-id>",
  "decisionId": "institution-provisioning-owner",
  "status": "accepted",
  "acceptedBridge": true,
  "ownerName": "<specific institution provisioning or SCIM owner name>",
  "ownerRole": "Institution identity lifecycle owner",
  "environment": "production",
  "evidenceUrl": "https://<institution-owned-evidence-host>/<specific-artifact-path>",
  "productionEvidenceIds": [
    "provisioning-owner",
    "scim-or-idp-ownership",
    "bearer-token-rotation",
    "lifecycle-guardrails"
  ],
  "productionEvidenceArtifactDigest": "sha256:<external-evidence-artifact-digest>",
  "productionEvidenceVerifiedAt": "<ISO-8601 timestamp, past or present>",
  "requestPacketPolicyHash": "<x-sena-identity-request-packet-policy-hash from the current dossier>",
  "notes": "Institution-owned provisioning owner, SCIM/IdP lifecycle ownership, bearer-token rotation, and lifecycle guardrails are recorded in the external evidence artifact. No bearer token or secret values are included."
}
```

## Response Headers To Archive

Archive the response body and these headers from each successful `POST /api/sena/ops/platform-decisions` call:

```text
x-sena-identity-request-packet-policy-hash
x-sena-identity-request-packet-policy-binding
x-sena-identity-production-receipt-digest
x-sena-identity-submitted-evidence-digest
x-sena-identity-production-evidence-artifact-digest
x-sena-identity-production-evidence-artifact-covered-ids
x-sena-identity-production-evidence-artifact-coverage
x-sena-identity-submitted-decision-production-evidence-artifact-completeness
x-sena-identity-production-verifier-status
x-sena-identity-evidence-url-host-binding
x-sena-identity-technical-binding
x-sena-identity-technical-readiness
x-sena-identity-rotation-freshness
x-sena-identity-production-evidence-digest
x-sena-identity-evidence-binding-digest
x-sena-identity-receipt-archive-manifest-digest
x-sena-identity-institution-action-plan-digest
x-sena-identity-owner-runbook-digest
x-sena-identity-production-status
x-sena-identity-release-gate-blocked
x-sena-identity-production-blocking-decisions
x-sena-identity-missing-evidence-ids
x-sena-identity-cutover-checklist
x-sena-identity-cutover-blockers
```

Expected successful direction after both submissions: request-packet policy binding is current, production evidence artifact completeness is complete, receipt archive status is ready, identity production status no longer reports these identity evidence IDs as missing, and release gate identity blockers clear or move to non-identity platform decisions.

## Final Verification After Institution Submission

After the institution owner submits both lanes, rerun:

```bash
cd /Users/dongpinhu/Desktop/SENA/sena-hk-template
npm run sena:pilot:verify
```

Then create or update release-gate and go-live rehearsal records. Do not mark enterprise production cutover complete until the platform-owner receipts, release gate, and go-live rehearsal evidence all agree.
