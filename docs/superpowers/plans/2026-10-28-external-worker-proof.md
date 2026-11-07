# External worker callback proof implementation plan

> For agentic workers: execute the approved bounded design task by task with test-first changes and independent code review. The user approved implementation, tests, review, and isolated Preview validation on 2026-10-28; production promotion remains held.

**Goal:** replace the hardcoded missing external-worker proof with a real nonce-bound signed HTTP dispatch, execution by a distinct worker process, authenticated callback, and atomic durable Postgres receipt.

**Architecture:** reuse the current queue adapter and signed worker receiver. Keep proof challenges in a separate small Postgres table so analysis/import/export custody and lifecycle remain unchanged. Read current deployment evidence through a request-scoped async loader; synchronous callers without durable evidence stay unconfirmed.

**Tech stack:** existing Next.js Node routes, TypeScript, node:crypto, pg/Postgres, Vitest, and the current Vercel Preview projects.

## Accepted boundaries

- Preserve the 62 captured modified/untracked files in `/Volumes/Mars/SENA`; only edit the isolated `codex/sena-worker-proof-20261028` branch.
- Restore access with a Preview-only automation token. Preserve the primary ops tokens and all production configuration. Temporary protection exceptions remain limited to the two previously approved Preview aliases and are restored after active checks.
- Current transport is managed HTTP to the deployed worker route. A valid result reports `distinctRuntimeObserved=true`, `brokerDurabilityObserved=false`, and the observed deployment relationship. A separate HTTP request alone cannot establish a distinct process. Runtime IDs are random once per process, shared across bundles through `globalThis`/`Symbol.for`; equal issuer/worker IDs fail closed.
- Bind every challenge to environment, immutable deployment, source/build identity, queue dispatch endpoint, worker receiver, callback endpoint, credential key version, issuer runtime, issue time and expiry. Use a dedicated callback signing key; retain credential-binding MACs only inside the store, never in exported evidence.
- The callback URL has its own setting. `SENA_JOB_WORKER_CALLBACK_URL` already means the queue's worker destination in the QStash adapter and must retain that meaning.
- Challenge lifetime is five minutes. Receipt freshness is independently bounded to at most 24 hours and the existing production evidence policy. No request input or environment confirmation flag can create a valid receipt.
- Store nonce hashes only. Insert before dispatch; record dispatch acknowledgement and callback consumption independently. Confirm only when both exist. An early callback must survive the later dispatch update. SQL single-consumption must reject replay and concurrent duplicates without changing the accepted receipt timestamp.
- Keep the global production acceptance and load/backup/operational release gates unchanged. Preview proof is valid only in its own environment/deployment scope.

## 1. Restore and verify the baseline

- [x] Create isolated worktree at integrated main `9c1eb1a2c69f5ef718e39033606ba28aa93dd265`; capture original dirty-file hashes.
- [x] Install the locked dependencies and run existing worker contract/transport baseline: 11 tests passed.
- [x] Read the Vercel alias/environment metadata without exporting secrets. Restore Preview automation access through a new Preview-only sensitive variable.
- [x] Deploy the unchanged clean baseline to Preview, verify exact source/deployment identity, run bounded Postgres/Blob/CDN/queue/observability probes, and restore protection.

## 2. Implement the proof protocol and store with failing tests first

Files: new focused modules under `sena-hk-template/lib/sena/enterprise/server-job-worker-proof-*.ts`; focused tests under `lib/sena/__tests__`; additive schema registry and Postgres schema catalog entries.

- [x] Add a failing behavior test showing a successful external proof can be supported while missing evidence remains unconfirmed; cover the dedicated table in schema contract tests.
- [x] Add the strict challenge/receipt types, canonical hashes, HMAC authentication, immutable deployment/configuration binding, and process-lifetime runtime identity.
- [x] Add a narrow Postgres adapter with `insertChallenge`, `recordDispatch`, `consumeCallback`, and `latestReceipt`. Consume via conditional `UPDATE ... WHERE nonce_sha256 = ... AND binding_mac = ... AND callback_accepted_at IS NULL AND expires_at > CURRENT_TIMESTAMP RETURNING ...`.
- [x] Exercise forged signature, malformed/oversize payload, expiry/future time, wrong nonce, wrong job/binding, source/deployment/endpoint/key changes, same-runtime rejection, duplicate races, and callback-before-dispatch finalization. Verify actual SQL single-consumption using an isolated real Postgres test when available.

## 3. Wire the existing worker and readiness contracts

Files: `server-job-queue.ts`, `app/api/sena/ops/jobs/worker/route.ts`, narrowly scoped proof issue/callback routes, `server-job-worker-contract.ts`, the owning async ops readers, `api-route-facts.ts`, API evidence notes/OpenAPI security, schema registry and affected tests.

- [x] Add a dedicated signed proof event through the existing managed/webhook/QStash transport. Keep proof payloads separate from real heavy-job commands and preserve existing body/hash/timestamp validation.
- [x] Require ops bearer for issuance; require the dedicated callback HMAC for callback consumption. The worker calculates its own runtime identity and calls only the configured matching callback URL with redirects refused.
- [x] Load and verify durable proof for live worker contract, deployment readiness, deployment exports, metrics, and production-evidence surfaces. Missing or failed DB evidence stays unconfirmed; no cross-request positive cache.
- [x] Derive worker confirmation from the current durable receipt to avoid an environment-binding/redeployment loop. Preserve exported artifact/binder validation and document its relationship to current runtime proof.
- [x] Update only the affected README/CONTEXT/API/schema tests and the worker verifier.

## 4. Review and validate the candidate

- [x] Run focused proof, worker transport/lifecycle, auth, readiness, binder, API/schema/boundary tests and TypeScript/build checks.
- [x] Obtain independent security/correctness review; resolve material findings and rerun affected checks.
- [ ] Use native Git custody/security hooks for the scoped commit and PR, with exact candidate authorization under the user's existing instruction. Never bypass failed gates.
- [ ] Deploy the clean candidate only to isolated Preview. Verify actual resource isolation and deployment/source identity before issuing a synthetic challenge.
- [ ] Obtain a genuine different-runtime callback receipt; verify replay rejection, authentication refusal and current worker readiness. If the host reuses the issuer process, keep the result unconfirmed and use an actually separate isolated worker runtime rather than weaken the check.
- [ ] Restore Preview protection, confirm production alias unchanged, check original dirty-file hashes, and report exact passed evidence and any remaining limits.

## Review notes

The early read-only review recommends a separate proof table, explicit managed-HTTP evidence limits, process-lifetime identity, atomic nonce consumption, and distinct callback credentials. It identified the existing QStash callback-variable naming trap and the callback-before-dispatch race. These are included above. No broad queue framework, UI redesign, or unrelated runtime refactor is in scope.

## Resumption checkpoint (2026-11-07)

The original worker implementation was retained and its protocol, real PostgreSQL atomic-consumption tests, TypeScript, lint and production build were rechecked. Independent review found and resolved the configuration-tool allowlist omission and API/schema expectation drift. The long-form go-live test now supplies the artifact metadata derived from its explicitly simulated worker receipt; runtime gates remain unchanged.

The first full G7 rerun recorded 3,509 passing tests and 35 failures: 27 missing browser binaries, six affected contract/fixture assertions, and two historical registry-currentness checks. The six affected assertions were repaired and rechecked. Browser binaries are being restored. The historical Q lane's expired heartbeat/review deadlines remain a release blocker; this worker change does not renew or waive that authority. The final result and exact candidate-bound Preview evidence belong in the English Claude handoff and ignored `output/production-evidence/worker-proof-20261107/` artifacts, not in a production-ready claim.

Cloud inventory confirmed the old Preview database branch had expired. A schema-only branch `sena-worker-proof-20261107` was restored in the existing SENA Neon project with an independent role credential, expires `2026-11-14T15:33:05Z`, and is bound only to Preview. The existing Preview Blob store is private and separate from production. A new dedicated proof signing key/key-version/callback configuration is Preview-only. Production remains on the original rollback deployment. Live candidate validation is still pending at this source checkpoint.
