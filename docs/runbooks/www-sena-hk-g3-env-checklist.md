# G3: www.sena.hk production env checklist

Read-only checklist for Vercel project `sena-hk`. Repo `HUDongpin/SENA` at `62470e1bf6ea6af3a2ab6430d670c15ef9911916`. App root `sena-hk-template`.

Names, targets, and types only. No values.

This is the G3 production-env checklist for the redeploy hold in #116.

## Result

On 2026-10-19 at 01:30 HKT the CTO ran the names-only count on Dongpin's Mac. Vercel CLI 54.9.0. Project `sena-hk`.

Method: paginated `vercel api '/v10/projects/sena-hk/env?target=production'`.

Result: 1 page, 151 unique production names.

The 2026-10-16 listing of 100 entries was truncated. G3 has no name gaps. Values and freshness belong to G4.

## 1. Count command

`vercel env ls` is not the count. The CLI calls `getEnvRecords` once and does not follow `pagination.next`. A short listing is a short inventory.

```bash
vercel env ls production --scope <team-slug>
vercel env ls preview --scope <team-slug>
```

The preview command does not clear a production row.

The count is the paginated `vercel api` walk. `target=production`. `vercel api` prints a beta banner on stdout. Drop every line before the first `{`, then pipe to `jq`. `jq` prints `key`, `target`, and `type`. It does not select `value`.

`pagination.next` is the `until` cursor. Repeat while it is non-null. A response with no `pagination` object is not a complete total. The reported total is the number of unique keys.

```bash
(
set -o pipefail
until_ts=""
names=$(mktemp)
trap 'rm -f "$names"' EXIT
while :; do
  path="/v10/projects/sena-hk/env?target=production"
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

The 2026-10-19 run of this walk returned one page and `unique=151`.

`npm run sena:vercel:preflight` is `sena-hk-template/package.json` line 53. It runs `scripts/verify-sena-vercel-production.ts`, which calls `vercel env ls production` (lines 853-855) and keeps names parsed from that stdout (lines 207-213). It does not read Vercel `type`. A short CLI listing becomes a short preflight. The `vercel api` walk remains the count.

## 2. The truncated 100-entry page

`filter_project_envs` on 2026-10-16, project `sena-hk`, `decrypt=false`, returned 100 entries. Target on every entry: `production`. Preview entries: 0. Development entries: 0. Types on that page: 18 `encrypted`, 82 `sensitive`. `hiddenProductionEnvCount`: 0.

That call had no page parameter and returned no `pagination` object. It stopped at 100. It is not the production name set. The 151-name walk is.

## 3. Names that were absent from the truncated page

Source of the old rows: `sena-hk-template/scripts/verify-sena-vercel-production.ts`. `requirement()` uses mode `all` when the caller omits `mode` (line 379). `any-of` means one name in the group is enough.

Every name marked absent on that page is in the 151. The count recorded these production names as present:

| Gate | Name | Rule |
|---|---|---|
| `security-env` | `SENA_OPS_TOKEN` | all |
| `server-job-queue-env` | `SENA_JOB_QUEUE_SECRET` | all |
| `server-job-queue-env` | `SENA_JOB_WORKER_CALLBACK_URL` | any-of with `SENA_JOB_QUEUE_URL` |
| `observability-env` | `SENA_ALERTING_OWNER` | any-of owner |
| `observability-env` | `SENA_ALERT_WEBHOOK_URL` | any-of alert URL |
| `observability-env` | `SENA_ALERT_WEBHOOK_SECRET` | any-of alert secret |
| `observability-env` | `SENA_OBSERVABILITY_PROVIDER` | any-of provider |
| `observability-env` | `SENA_OBSERVABILITY_EXPORTER_URL` | any-of exporter URL |
| `observability-env` | `SENA_OBSERVABILITY_EXPORTER_SECRET` | any-of exporter secret |
| `observability-env` | `SENA_OBSERVABILITY_DASHBOARD_URL` | any-of dashboard |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_CONFIRMED` | all |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_ARTIFACT_SHA256` | all |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_VERIFIED_AT` | all |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_ARTIFACT_VALIDATION` | all |
| `cdn-evidence-env` | `SENA_CDN_LIVE_PROBE_CONFIRMED` | all |
| `cdn-evidence-env` | `SENA_CDN_PROBE_ARTIFACT_SHA256` | all |
| `cdn-evidence-env` | `SENA_CDN_PROBE_VERIFIED_AT` | all |
| `cdn-evidence-env` | `SENA_CDN_PROBE_ARTIFACT_VALIDATION` | all |

`SENA_JOB_QUEUE_URL` was already on the truncated page, so the destination any-of at line 649 was met before this count. `SENA_JOB_WORKER_CALLBACK_URL` is present as well.

`SENA_SESSION_SECRET`, `SENA_CSRF_SECRET`, and `SENA_MFA_ENCRYPTION_KEY` were on the truncated page. With `SENA_OPS_TOKEN` present, the `security-env` name list at lines 868-870 is complete.

`SENA_CDN_VERIFY_URL` was on the truncated page. The eight `SENA_CDN_CONTRACT_*`, `SENA_CDN_LIVE_PROBE_*`, and `SENA_CDN_PROBE_*` names are present, so the `cdn-evidence-env` name list at lines 881-889 is complete.

A present name does not say which deploy the value refers to. Freshness of those values is G4.

The CDN names stay on the bind script when they are rewritten. `sena:production-evidence:bind` is `sena-hk-template/package.json` line 46, `scripts/bind-sena-production-evidence.mjs`. It writes production only (lines 918-919) through `upsertVercelEnv` (lines 1262-1264). Do not replace that write with `vercel env add`.

### Already met on the truncated page

These checks were met by names on the 100-entry page. Those names remain in the 151.

- `neon-postgres-env` (id line 485). `SENA_ENTERPRISE_DB_ADAPTER`, `SENA_ENTERPRISE_STATE_STORE`, and `SENA_ENTERPRISE_POSTGRES_URL`.
- `app-url-env` (id line 861). `SENA_APP_URL` and `NEXT_PUBLIC_SENA_APP_URL`.
- `object-storage-env` (id line 625). `SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN`.
- `server-job-queue-env` adapter, destination (`SENA_JOB_QUEUE_URL`), and contract keys. The secret is now present too.
- `observability-env` runbook any-of. `SENA_ALERTING_RUNBOOK_URL` and the contract keys were on the truncated page. Owner, alert, exporter, and dashboard names are present now.
- Advisory `production-runtime-env-packet-custody` and `production-go-live-gate-custody`. Both name lists were on the truncated page.

`legacy-local-file-env` (id line 511) wants `SENA_ENTERPRISE_DB_DIR` unset. The 2026-10-19 count did not report that name. The forbid-check is not part of this name-gap closeout.

## 4. In the old page, no non-test reference

These names were on the truncated production page. No non-test file under `sena-hk-template` references them. The 151-name count did not remove this flag.

`DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `PGHOST_UNPOOLED`, `POSTGRES_DATABASE`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_URL_NO_SSL`, `POSTGRES_USER`.

`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, and `POSTGRES_URL_NON_POOLING` appear only in test redaction patterns: `sena-hk-template/lib/sena/__tests__/ops-probe-unconfigured-routes.test.ts` line 73 and `sena-hk-template/lib/sena/__tests__/ops-access-backend-failure-redaction.test.ts` line 57.

Flag only. Possibly stale:

- `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256`
- `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_TREE_SHA256`

Non-test code does not read those two names. The production evidence binder's planned env omits them (`sena-hk-template/lib/sena/__tests__/production-evidence-bind-script.test.ts` lines 1415-1429). Reviewed-slice custody hashes in non-test code use `SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256` and `SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256` (`sena-hk-template/lib/sena/enterprise/performance-source-custody.ts` lines 18-19; `sena-hk-template/lib/sena/enterprise/performance-budget-artifact.ts` lines 253-254).

## 5. What remains

G3 is the name inventory. It is closed.

G4 checks values and freshness on a preview of the target commit. A name in the 151 does not show which deploy an evidence hash refers to.
