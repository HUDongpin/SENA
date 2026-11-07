# Current-deployment external worker proof

The worker proof verifies signed HTTP queue delivery to a distinct worker process, an authenticated callback, and durable single consumption of a five-minute nonce. It does not attest third-party broker durability or independently attest infrastructure identity. The current managed HTTP adapter may use separate serverless processes in the same deployment; matching issuer and worker process identities are rejected.

## Configure the isolated deployment

Keep the existing Postgres primary store, queue signing key, queue destination, worker runtime, owner, and runbook configured. Preserve the existing worker status-store self-test evidence. Its `same-process-status-store-cas-self-test` result remains a separate prerequisite and never substitutes for this proof.

Configure these values in the selected environment only:

| Variable | Requirement |
| --- | --- |
| `SENA_JOB_WORKER_PROOF_SECRET` | Dedicated random callback signing key of at least 32 characters; must differ from queue/provider credentials. Keep in the secret store. |
| `SENA_JOB_WORKER_PROOF_KEY_VERSION` | Non-secret rotation identifier, for example `20261028-v1`. |
| `SENA_JOB_WORKER_PROOF_CALLBACK_URL` | HTTPS URL ending exactly in `/api/sena/ops/jobs/worker-proof/callback`, without query, fragment, or user information. |
| `SENA_JOB_WORKER_PROOF_BUILD_ID` | Exact clean source commit/build identity when `VERCEL_GIT_COMMIT_SHA` is unavailable. If both are present they must agree. Supply it from the candidate's Git SHA during CLI deployment. |

The runtime also requires Preview/production environment and immutable Vercel deployment identity. A generic alias is not sufficient as the deployment identity. `SENA_JOB_WORKER_CALLBACK_URL` retains its existing meaning as the queue's worker destination, including for QStash; it is not the new proof callback URL.

Restore access and verify the Preview database and Blob isolation before live probes. CLI deployment must refuse a dirty worktree and record the exact source commit. For the approved Preview flow, supply the same SHA as deployment metadata and proof build identity:

```sh
if [ -n "$(git status --porcelain)" ]; then
  echo 'refuse: dirty worktree' >&2
  exit 1
fi
candidate_sha="$(git rev-parse HEAD)"
cd sena-hk-template
vercel deploy --yes --regions sin1 \
  --meta "gitCommitSha=${candidate_sha}" \
  --env "SENA_JOB_WORKER_PROOF_BUILD_ID=${candidate_sha}" \
  --scope peter-dongpin-hu-s-projects
```

This command creates a Preview. Verify its identity before moving the Preview alias. Production promotion remains governed by the separate release runbook.

## Issue, verify, and archive

1. With an ops service bearer, `POST /api/sena/ops/jobs/worker-proof`. No request body or caller-supplied nonce/configuration is admitted. Retain the returned challenge hash, deployment ID, and source identity.
2. The issuer inserts a nonce-hash challenge before dispatch. The existing signed worker receiver validates the bounded transport and challenge, calculates its own process identity, and sends a dedicated HMAC callback. Callback authentication precedes JSON parsing. Redirects are refused.
3. The callback atomically consumes the unexpired challenge after acquiring its row lock. A callback may arrive before the issuer saves the HTTP acknowledgement; confirmation requires both events. Replays and concurrent losers cannot replace or refresh the receipt.
4. Read `GET /api/sena/ops/jobs/worker-contract`. Confirm that the receipt's challenge hash matches the issued challenge, the current deployment/build/configuration match, and the complete contract passes. The receipt is fresh for at most 24 hours, further limited by the existing production-evidence policy.
5. Archive the worker contract and its SHA-256 sidecar. `npm run sena:jobs:worker-contract -- --output <artifact>` uses the environment and database of the process running that command; the live deployment's GET response is the deployment evidence. Exclude the response-only `access` field when producing the standalone contract file.

The worker contract's `generatedAt` comes from immutable receipt time. Its artifact hash identifies the complete pretty-printed contract plus a trailing newline, separately from the receipt hash. Loading a receipt never updates its timestamps. New deployment, source, endpoint, credential, or key-version bindings invalidate old receipts.

`readinessSource=durable-worker-callback` artifacts are archive-only in the evidence binder. Do not bind them into another deployment's environment: that would change deployment identity again. Legacy `SENA_JOB_WORKER_CONTRACT_*` values remain historical metadata and neither grant nor veto live confirmation. Synchronous readers without a verified request-scoped database load remain unconfirmed.

## Failure and evidence boundaries

- Missing configuration/identity, database failure, stale evidence, signature/payload mismatch, wrong deployment, and same-process execution fail closed.
- The proof table is separate from real analysis/import/export jobs. It does not relax source custody, leases, retry policy, tenant authorization, or the exact internal heartbeat exception.
- Process/deployment relationships are authenticated runtime self-reports. SQL-assigned acceptance metadata is trusted adapter state with strict coherence checks; challenge and receipt MACs authenticate their immutable content. Do not describe this as independent infrastructure attestation or as cryptographic attestation of every SQL column.
- A Preview receipt cannot grant production acceptance. Load, backup/recovery, other operational integrations, release approval, and observation windows remain separate requirements.
- Restore any temporary Preview protection exceptions after checks. Never log or archive the raw nonce, callback body/signature, credentials, or internal binding/receipt MACs.

Focused tests cover protocol, transport, request-scope behavior and malformed byte streams. The opt-in store integration test provisions and removes its own loopback PostgreSQL cluster and exercises real concurrent consumption and row-lock waits across expiry; it must not use application database credentials.
