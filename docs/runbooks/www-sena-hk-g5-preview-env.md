# G5: sena-hk preview env

Names, targets, and types only. No values. Project `sena-hk`. App root `sena-hk-template`.

This is the preview name plan for the redeploy hold. G6 can run on a preview of the target commit before `www.sena.hk` moves. A preview host does not close `deployment-ready`. That check requires `target === "production"` (`sena-hk-template/scripts/verify-sena-vercel-production.ts` line 848).

## Walk

On 2026-10-19 at 01:45 HKT the CTO ran a names-only paginated `vercel api` count on Dongpin's Mac.

`target=preview` returned 0 rows. `target=development` returned 0 rows. No row targets more than one environment. There is no production/preview crossover today.

`vercel api` prints a beta banner on stdout. Drop every line before the first `{`, then pipe to `jq`. `jq` prints `key`, `target`, and `type`. It does not select `value`. `pagination.next` is the `until` cursor. Repeat while it is non-null. `vercel env ls` is one page and is not this count.

```bash
(
set -o pipefail
until_ts=""
names=$(mktemp)
trap 'rm -f "$names"' EXIT
while :; do
  path="/v10/projects/sena-hk/env?target=preview"
  if [ -n "$until_ts" ]; then
    path="${path}&until=${until_ts}"
  fi
  page_out="$(
    vercel api "$path" \
      | awk 'seen { print; next } { i = index($0, "{"); if (i) { seen = 1; print substr($0, i) } }' \
      | jq -e -r '
          if (.envs | type) != "array" or (.pagination | type) != "object" then
            error("response missing envs or pagination")
          else
            (.envs[] | [
              .key,
              (if (.target | type) == "array" then (.target | join(",")) else (.target // "") end),
              .type
            ] | @tsv),
            ("#pagination.next\t" + (if .pagination.next == null then "" else (.pagination.next | tostring) end))
          end
        '
  )" || exit 1
  printf '%s\n' "$page_out" | awk -F '\t' '$1 != "#pagination.next" { print; print $1 >> names }' names="$names"
  next="$(printf '%s\n' "$page_out" | awk -F '\t' '$1 == "#pagination.next" { print $2; exit }')"
  if [ -z "$next" ]; then
    break
  fi
  if [ "$next" = "$until_ts" ]; then
    printf 'pagination.next repeated; total is not authoritative\n' >&2
    exit 1
  fi
  until_ts="$next"
done
sort -u "$names" | wc -l | awk '{ printf "unique=%s\n", $1 }'
)
```

Repeat with `target=development` and `target=production`. The production walk is the G3 count.

## Rule

Create new rows with `target=preview` only. Never edit a production row to add preview.

`sensitive` is `vercel env add <NAME> preview --sensitive`. `encrypted` is `vercel env add <NAME> preview --no-sensitive`. Enter the value at the prompt. Do not pass `--value`.

## Dongpin creates

Dongpin creates these resources and sets these preview rows himself.

| Resource | Name | Type |
|---|---|---|
| Neon preview branch | `SENA_ENTERPRISE_POSTGRES_URL` | sensitive |
| Blob store token | `SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN` | sensitive |
| Queue secret | `SENA_JOB_QUEUE_SECRET` | sensitive |
| Queue callback | `SENA_JOB_WORKER_CALLBACK_URL` | encrypted |
| Alert webhook URL | `SENA_ALERT_WEBHOOK_URL` | encrypted |
| Alert webhook secret | `SENA_ALERT_WEBHOOK_SECRET` | sensitive |
| Exporter URL | `SENA_OBSERVABILITY_EXPORTER_URL` | encrypted |
| Exporter secret | `SENA_OBSERVABILITY_EXPORTER_SECRET` | sensitive |
| Session secret | `SENA_SESSION_SECRET` | sensitive |
| CSRF secret | `SENA_CSRF_SECRET` | sensitive |
| MFA key | `SENA_MFA_ENCRYPTION_KEY` | sensitive |
| Ops bearer | `SENA_OPS_TOKEN` | sensitive |

`SENA_ENTERPRISE_POSTGRES_URL` is the first Postgres URL name in `lib/sena/enterprise/postgres-url-env.ts`. G6 `GET /api/sena/ops/postgres` runs CREATE TABLE, INSERT, SELECT, and DELETE on that database.

The Blob token is the G6 PUT, HEAD, DELETE credential (`lib/sena/enterprise/object-storage-adapter.ts`). Connect a new Blob store. Do not connect the production store.

`SENA_JOB_QUEUE_SECRET` is the worker HMAC (`app/api/sena/ops/jobs/worker/route.ts`). For QStash, the destination is `SENA_JOB_WORKER_CALLBACK_URL` before `SENA_JOB_QUEUE_URL` (`server-job-queue.ts` lines 814-818).

`SENA_OPS_TOKEN` is the G6 bearer for `/api/sena/ops/*`.

The webhook URL and secret pairs are preview sinks. They are not the production alert or exporter endpoints.

## Preview origin

`SENA_APP_URL`, `NEXT_PUBLIC_SENA_APP_URL`, and `SENA_CDN_VERIFY_URL` are own preview values, type `encrypted`.

Each value is the preview deployment origin, `https://<preview-host>`. `NEXT_PUBLIC_SENA_APP_URL` is fixed at build time. `SENA_JOB_WORKER_CALLBACK_URL` is that origin plus `/api/sena/ops/jobs`.

`targetFromEnv` in `lib/sena/enterprise/cdn-verification.ts` uses the first of `SENA_CDN_VERIFY_URL`, `SENA_CDN_URL`, `SENA_APP_URL`, `NEXT_PUBLIC_SENA_APP_URL`. These three names stay on the preview host. `https://www.sena.hk` sends links and the CDN probe at production.

## Own preview value

New preview rows. The value is not the production value.

| Name | Type |
|---|---|
| `SENA_ENTERPRISE_POSTGRES_URL` | sensitive |
| `SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN` | sensitive |
| `SENA_JOB_QUEUE_SECRET` | sensitive |
| `SENA_JOB_WORKER_CALLBACK_URL` | encrypted |
| `SENA_ALERT_WEBHOOK_URL` | encrypted |
| `SENA_ALERT_WEBHOOK_SECRET` | sensitive |
| `SENA_OBSERVABILITY_EXPORTER_URL` | encrypted |
| `SENA_OBSERVABILITY_EXPORTER_SECRET` | sensitive |
| `SENA_SESSION_SECRET` | sensitive |
| `SENA_CSRF_SECRET` | sensitive |
| `SENA_MFA_ENCRYPTION_KEY` | sensitive |
| `SENA_OPS_TOKEN` | sensitive |
| `SENA_APP_URL` | encrypted |
| `NEXT_PUBLIC_SENA_APP_URL` | encrypted |
| `SENA_CDN_VERIFY_URL` | encrypted |

## Reuse production literal

New preview-scoped rows. The literal matches production. Do not add `preview` onto the production row.

| Name |
|---|
| `SENA_ENTERPRISE_DB_ADAPTER` |
| `SENA_ENTERPRISE_STATE_STORE` |
| `SENA_OBJECT_STORAGE_ADAPTER` |
| `SENA_OBJECT_STORAGE_REGION` |
| `SENA_JOB_QUEUE_ADAPTER` |
| `SENA_JOB_QUEUE_PROVIDER_URL` |
| `QSTASH_URL` |
| `UPSTASH_QSTASH_URL` |
| `SENA_OBSERVABILITY_PROVIDER` |
| `SENA_ALERTING_OWNER` |
| `SENA_ALERTING_RUNBOOK_URL` |
| `SENA_OBSERVABILITY_RUNBOOK_URL` |
| `SENA_OBSERVABILITY_DASHBOARD_URL` |
| `SENA_OPS_SESSION_OPERATOR_EMAILS` |
| `SENA_UPLOAD_MAX_BYTES` |
| `SENA_JOB_QUEUE_TIMEOUT_MS` |
| `SENA_JOB_QUEUE_MAX_ATTEMPTS` |
| `SENA_OBSERVABILITY_TIMEOUT_MS` |
| `SENA_OBSERVABILITY_SLO_P95_MS` |
| `SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT` |
| `SENA_CDN_PROBE_TIMEOUT_MS` |
| `SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH` |

`SENA_ENTERPRISE_DB_ADAPTER` and `SENA_ENTERPRISE_STATE_STORE` select Postgres mode. They are not the connection string.

`SENA_OBJECT_STORAGE_REGION` is reused when the production literal is `auto`.

`SENA_JOB_QUEUE_PROVIDER_URL`, `QSTASH_URL`, and `UPSTASH_QSTASH_URL` are the vendor API host. The provider token is omitted below.

Create the `SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH` preview row after `SENA_ENTERPRISE_POSTGRES_URL` exists. Vercel preview builds set `NODE_ENV=production`. That flag then blocks file-backed enterprise writes (`lib/sena/enterprise/state.ts` lines 912-926).

## Omit

Do not create these on preview.

Postgres URL aliases. The first set name wins. A production URL in any of them is a live database when `SENA_ENTERPRISE_POSTGRES_URL` is empty.

`SENA_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `NEON_DATABASE_URL`.

Blob and object-storage aliases. The preview store is the one token above.

`BLOB_READ_WRITE_TOKEN`, `SENA_OBJECT_STORAGE_BLOB_STORE_ID`, `BLOB_STORE_ID`, `SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN`, `SENA_OBJECT_STORAGE_ENDPOINT`, `SENA_OBJECT_STORAGE_BUCKET`, `SENA_OBJECT_STORAGE_ACCESS_KEY_ID`, `SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_ACCOUNT_ID`.

Queue names that would publish into production or name the production queue.

`SENA_JOB_QUEUE_URL`, `SENA_JOB_QUEUE_PROVIDER_TOKEN`, `QSTASH_TOKEN`, `UPSTASH_QSTASH_TOKEN`, `SENA_JOB_QUEUE_NAME`, `QSTASH_QUEUE_NAME`, `UPSTASH_QSTASH_QUEUE_NAME`.

Other webhook pairs.

`SENA_ALERTING_WEBHOOK_URL`, `SENA_ALERT_WEBHOOK_SIGNING_SECRET`, `ALERT_WEBHOOK_URL`, `ALERTS_WEBHOOK_URL`, `OBSERVABILITY_ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET`, `ALERTS_WEBHOOK_SECRET`, `OBSERVABILITY_ALERT_WEBHOOK_SECRET`, `SENA_OBSERVABILITY_WEBHOOK_URL`, `SENA_OBSERVABILITY_WEBHOOK_SECRET`, `SENA_OBSERVABILITY_EXPORTER_TOKEN`, `SENA_NOTIFICATION_WEBHOOK_URL`, `SENA_NOTIFICATION_WEBHOOK_SECRET`, `SENA_EMAIL_WEBHOOK_URL`, `SENA_EMAIL_WEBHOOK_SECRET`, `SENA_AUDIT_WEBHOOK_URL`, `SENA_AUDIT_WEBHOOK_SECRET`, `SENA_BACKUP_WEBHOOK_URL`, `SENA_BACKUP_WEBHOOK_SECRET`, `SENA_COLLABORATION_PUBSUB_WEBHOOK_URL`, `SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET`, `SENA_DATABASE_SYNC_WEBHOOK_URL`, `SENA_DATABASE_SYNC_WEBHOOK_SECRET`, `SENA_OBJECT_STORAGE_WEBHOOK_URL`, `SENA_OBJECT_STORAGE_WEBHOOK_SECRET`.

`SENA_DATABASE_SYNC_WEBHOOK_URL` would sync preview into another database. It stays omitted.

Host alias.

`SENA_CDN_URL`.

Secrets this preview does not use.

`SENA_OPS_AUTOMATION_TOKEN`, `SENA_UPLOAD_ENCRYPTION_KEY`, `SENA_EXPERT_REVIEW_SIGNING_SECRET`, `SENA_PROVISIONING_TOKEN`, `SENA_SSO_INSTITUTION_CLIENT_ID`, `SENA_SSO_INSTITUTION_CLIENT_SECRET`, `SENA_SSO_GOOGLE_CLIENT_ID`, `SENA_SSO_GOOGLE_CLIENT_SECRET`, `SENA_SSO_INSTITUTION_ISSUER`, `SENA_SSO_INSTITUTION_AUTHORIZATION_URL`, `SENA_SSO_INSTITUTION_TENANT_ID`.

Production evidence. A confirmed hash is the bound deploy. G4 binds `SENA_VERCEL_PRODUCTION_PREFLIGHT_*` from a `www.sena.hk` preflight at promotion, not from this preview.

`SENA_CDN_CONTRACT_CONFIRMED`, `SENA_CDN_CONTRACT_ARTIFACT_SHA256`, `SENA_CDN_CONTRACT_VERIFIED_AT`, `SENA_CDN_CONTRACT_ARTIFACT_VALIDATION`, `SENA_CDN_LIVE_PROBE_CONFIRMED`, `SENA_CDN_PROBE_ARTIFACT_SHA256`, `SENA_CDN_PROBE_VERIFIED_AT`, `SENA_CDN_PROBE_ARTIFACT_VALIDATION`, `SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED`, `SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256`, `SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT`, `SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION`, `SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED`, `SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256`, `SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT`, `SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION`, `SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED`, `SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256`, `SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT`, `SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION`, `SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED`, `SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256`, `SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT`, `SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION`, `SENA_JOB_QUEUE_CONTRACT_CONFIRMED`, `SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256`, `SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT`, `SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION`, `SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED`, `SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256`, `SENA_JOB_QUEUE_PROBE_VERIFIED_AT`, `SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION`, `SENA_JOB_WORKER_CONTRACT_CONFIRMED`, `SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256`, `SENA_JOB_WORKER_CONTRACT_VERIFIED_AT`, `SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION`, `SENA_OBSERVABILITY_CONTRACT_CONFIRMED`, `SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256`, `SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT`, `SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION`, `SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED`, `SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256`, `SENA_OBSERVABILITY_PROBE_VERIFIED_AT`, `SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION`, `SENA_PERFORMANCE_BUDGET_CONFIRMED`, `SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256`, `SENA_PERFORMANCE_BUDGET_VERIFIED_AT`, `SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION`, `SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256`, `SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256`, `SENA_PERFORMANCE_BUDGET_GIT_COMMIT`, `SENA_PERFORMANCE_BUDGET_GIT_DIRTY`, `SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256`, `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE`, `SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED`, `SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256`, `SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT`, `SENA_CONFERENCE_LOAD_REHEARSAL_USERS`, `SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS`, `SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS`, `SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER`, `SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED`, `SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256`, `SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT`, `SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS`, `SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS`, `SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS`, `SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED`, `SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256`, `SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT`, `SENA_PRODUCTION_GO_LIVE_GATE_STATUS`, `SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY`, `SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS`, `SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS`.

Also omit:

| Name | Why |
|---|---|
| `SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED` | Production claim. With `NODE_ENV=production` it blocks file writes (`state.ts` lines 922-928). |
| `SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED` | Demands the production evidence manifest. |
| `SENA_ENTERPRISE_DB_DIR` | Preflight `legacy-local-file-env` forbids it (lines 506-509). |
| `SENA_JOB_QUEUE_ALLOW_LOCAL` | Local queue. |
| `SENA_ALLOW_LOCAL_SSO_FALLBACK` | Local identity fallback. |
| `SENA_ALLOW_PRODUCTION_PASSWORD_RESET_TOKEN_EXPOSURE` | Token exposure flag. |
| `SENA_PASSWORD_RESET_EXPOSE_TOKEN` | Token exposure flag. |
| `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256` | Stale. Non-test code does not read it. |
| `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_TREE_SHA256` | Stale. Non-test code does not read it. |
| `VERCEL_URL` | Platform-injected. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Platform-injected. |
| `VERCEL_OIDC_TOKEN` | Platform-injected. |

## Risks

The 01:45 walk found no shared target. A later edit that adds `preview` to a production row creates the crossover this plan avoids.

G6 mutates. The preview Postgres URL and Blob token have to be the new branch and the new store.

An omitted Postgres alias that still holds a production URL is used when `SENA_ENTERPRISE_POSTGRES_URL` is empty.

`SENA_JOB_QUEUE_URL` stays omitted. QStash uses `SENA_JOB_WORKER_CALLBACK_URL` first (`server-job-queue.ts` lines 814-818). Managed mode uses `SENA_JOB_QUEUE_URL` alone, so a managed adapter has no destination under this plan.

Copied `*_CONFIRMED` names would make this preview trust another deploy's evidence.
