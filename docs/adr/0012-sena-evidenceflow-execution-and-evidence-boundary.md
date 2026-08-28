# ADR-0012 — SENA EvidenceFlow execution and evidence boundary

- **Status:** Accepted for local shadow implementation
- **Date:** 2026-08-28
- **Deciders:** SENA owner; SENA-A01/A09/A10/A11/A14/A15 implementation lanes

## Context

SENA needs durable research and engineering workflows that can pause for human
decisions, survive worker restarts, retry bounded failures, and produce exact,
hash-bound evidence. The current application already has enterprise RBAC/CSRF,
project revisions, an indexed Postgres server-job table, retry/dead-letter
semantics, publication and validation evidence contracts, and a fail-closed
production posture. It does not have a durable cross-job workflow coordinator.

Three objects must remain distinct:

1. `A_fusion` is a research analysis graph.
2. LangGraph is an execution/recovery graph.
3. EvidenceFlow step receipts form the authoritative audit evidence graph.

The first release is local shadow only. It may not modify a real Git remote,
create or merge a real PR, change a provider, deploy, approve a research claim,
or persist raw research rows in a checkpoint.

## Decision

SENA EvidenceFlow uses explicit, code-defined LangGraph `StateGraph` graphs in a
long-running Node worker. SENA remains the sole evidence authority.

- `research-evidence/v1` and `engineering-release/v1` are fixed manifests; no
  user-supplied graph code or arbitrary DSL is executed.
- Exact dependency pins for the compatibility baseline are:
  `@langchain/langgraph@1.4.13`,
  `@langchain/langgraph-checkpoint-postgres@1.0.5`,
  `@langchain/core@1.2.9`, and `zod@4.4.3` on Node 24.
- LangGraph checkpoints use a dedicated `sena_langgraph` Postgres schema and
  `workflowRunId` as `thread_id`. They contain pointers, digests, redacted
  metadata, and control state only.
- SENA's `sena_workflow_*` tables contain runs, transactional commands,
  hash-chained step receipts, approvals, and artifact manifests. They are the
  source used for UI status, closeout, policy decisions, and audit.
- The existing SENA server-job queue remains the sole owner of heavy import,
  analysis, reliability, validation, and publication execution. EvidenceFlow
  stores job references and terminal receipts; it does not duplicate job
  persistence or retry state.
- Every external-effect node first resolves the idempotency key
  `(runId, nodeId, inputDigest)`. Interrupt nodes are safe to restart from the
  beginning because a previously successful receipt is reused.
- Approval records bind run, interrupt, node, expected version, actor/role,
  input digest, candidate-output digest, and decision digest. A bare
  `approved=true` is never sufficient.
- API mutation acceptance is expressed as `202 queued`; success is only a
  terminal run/receipt state. Missing executable capability returns `503` before
  a server job or success receipt is created.
- No LangSmith service, control plane, tracing, or telemetry path is used.
  `@langchain/core` currently carries dormant `langsmith` client code as a
  transitive OSS package; the independent worker fails startup if any
  LangSmith/LangChain tracing switch is truthy and then forces all known
  tracing switches to `false`. The first release exports only redacted
  operational metrics through SENA's existing observability boundary.
- A source-changing fork validates that the named checkpoint exists in the
  source thread, records its digest-bound lineage, and deliberately restarts
  the fixed graph. Replaying downstream state from the old source would make
  stale receipts appear current. Engineering forks preserve the immutable
  work-request digest.
- The worker independently binds its executable Git SHA to every run and
  refuses definition or code drift before graph execution. Succeeded closeout
  documents require the complete fixed DAG, exact predecessors, approvals,
  server-job bindings, and a final receipt/artifact commitment.

## Options considered

### A. SENA control plane + independent OSS LangGraph worker (selected)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Durability | High with PostgresSaver and SENA outbox |
| Evidence authority | Clear: SENA only |
| Deployment fit | VM/container/long-running process |
| Vendor dependency | OSS runtime only; no LangSmith control plane |

**Pros:** durable interrupts/recovery; reuses SENA job and evidence contracts;
separates server request lifetime from workflow lifetime.

**Cons:** adds a worker and checkpoint schema; requires idempotent nodes and
cross-process integration tests.

### B. Execute graphs inside Next.js requests

| Dimension | Assessment |
|---|---|
| Complexity | Low initially |
| Durability | Low |
| Evidence authority | Ambiguous on timeout/retry |
| Deployment fit | Poor for serverless/scale-to-zero |

Rejected because an HTTP request is not a durable worker lease and cannot
reliably wait for jobs or human interrupts.

### C. Replace SENA records and job queue with LangGraph/LangSmith

| Dimension | Assessment |
|---|---|
| Complexity | High migration |
| Durability | High |
| Evidence authority | Wrong boundary for SENA research governance |
| Vendor dependency | High |

Rejected because checkpoint state is execution state, not proof that a project
revision, approval, CI run, deployment, or research claim exists.

### D. Build a custom workflow engine

| Dimension | Assessment |
|---|---|
| Complexity | Very high |
| Durability | Depends on bespoke implementation |
| Evidence authority | Controllable |
| Maintenance | High |

Rejected because SENA would have to reimplement checkpoint replay, interrupts,
branch/join scheduling, and recovery while still building the evidence layer.

## Trade-off analysis

The selected design accepts a second persistence layer in exchange for durable
execution. The boundary is explicit: deleting checkpoints may prevent resume but
cannot rewrite historical SENA receipts; rebuilding a checkpoint cannot mint an
approval or claim-ready state. Conversely, a successful checkpoint without a
terminal SENA receipt is incomplete and must be reconciled, not treated as green.

The installed dependency audit currently reports five pre-existing findings via
ESLint/js-yaml, PostCSS/nanoid, Vercel Blob/undici, and Next/sharp. No finding is
reachable through the newly added LangGraph packages. This ADR does not reclassify
those findings as harmless; they remain release-security debt outside this
additive compatibility decision.

## Compatibility evidence

The local shadow spike was executed on Node 24.15.0 and PostgreSQL 16.15 against
the exact dependency pins above.

- The fixed manifest hashes are
  `research-evidence/v1 = 2d3ffbd8234f0d0cab9fd9d576af07b4d7e4eb56e7961e0d0cfb538ebedf7de1`
  and
  `engineering-release/v1 = 9d5796b20ac646a799c99223931906d3d7f8ea4cbf5fcfac7162aa013be1cefe`.
- MemorySaver verification proved that an interrupt resumes on the same
  `thread_id`, re-enters the approval node from its beginning, and reuses one
  deterministic receipt key rather than creating a second business effect.
- A disposable PostgreSQL cluster created four tables in `sena_langgraph`.
  Two threads interrupted concurrently, the first saver was closed, a new saver
  was opened, and both threads completed from their persisted checkpoints.
  The approval node executed four times while the authoritative receipt-key set
  remained exactly two entries.
- The checkpoint policy rejects raw-row, credential, token, password, provider
  secret, non-JSON, non-plain-object, and direct-email state. Its errors report
  only the field path and never echo the rejected value.
- The disposable cluster, listener, and temporary directory were removed after
  the integration test. This evidence proves local compatibility and recovery;
  it is not managed-Postgres, staging, deployment, or production proof.

## Fail-closed and rollback posture

- Workflow start remains unavailable until the authoritative SENA tables,
  transactional outbox, worker capability registry, and security tests exist.
- A checkpointer setup/migration error, unknown definition hash, unsafe
  checkpoint field, missing executable server-job capability, or digest mismatch
  blocks the command; it cannot be converted into a success receipt.
- If the pinned runtime is later found incompatible, operators stop the
  independent worker and reject new start/resume commands. Existing SENA
  receipts, approvals, and artifact hashes remain immutable even if disposable
  checkpoint data must be rebuilt or abandoned.
- Advancing any exact package pin, graph definition, checkpoint schema, or
  effectful node order requires a new compatibility receipt and definition hash.

## Consequences

- Worker and API can restart independently and reconcile through Postgres.
- Graph/state schema and interrupt order become backward-compatibility contracts.
- Every effectful node needs a receipt lookup and deterministic digest.
- Postgres is required for durable multi-process operation; in-memory savers are
  test-only and never production evidence.
- The UI must show workflow status separately from research claim boundary and
  source/local/CI/merged/deployed/live evidence layers.
- A staging or real-provider mode needs a new ADR and owner authorization; it
  cannot be enabled by a hidden configuration switch.

## Action items

1. Add SENA authoritative Postgres tables and transactional command outbox.
2. Add shared approval, job-wait, receipt, artifact, and closeout nodes.
3. Implement both v1 graphs and a separate long-running worker service.
4. Add API/OpenAPI/schema/artifact contracts and the Automation Control Room.
5. Run duplicate-delivery, dead-letter,
   source-drift/fork, security-redaction, and browser recovery acceptance tests.
