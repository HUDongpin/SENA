# G3: www.sena.hk production env checklist

Read-only checklist for Vercel project `sena-hk`. Repo `HUDongpin/SENA` at `62470e1bf6ea6af3a2ab6430d670c15ef9911916`. App root `sena-hk-template`. Listing date 2026-10-16.

Names, targets, and types only. No values. Dongpin sets manual values in Vercel. The eight CDN evidence names are the exception: the bind script writes them.

This is the G3 production-env checklist for the redeploy hold in #116.

## 1. List commands

`vercel env ls` is not the authoritative count. The CLI calls `getEnvRecords` once and does not follow `pagination.next`. A short listing is a short inventory. Run from a directory linked to `sena-hk` when a quick look is useful:

```bash
vercel env ls production --scope <team-slug>
vercel env ls preview --scope <team-slug>
```

The preview command does not clear a production row. A name that exists only on preview or development stays absent for this checklist.

The authoritative production count is the paginated REST walk below. `decrypt=false`. `target=production`. The `jq` filter prints `key`, `target`, and `type`. It does not select `value`.

The response schema includes `pagination.count`, `pagination.next`, and `pagination.prev`. `pagination.next` is the `until` cursor for the next page. Repeat while it is non-null. The total is the sum of `.envs` lengths. A response with no `pagination` object is not a complete total.

```bash
(
set -o pipefail
until_ts=""
total=0
while :; do
  url="https://api.vercel.com/v10/projects/sena-hk/env?teamId=<team-id>&decrypt=false&target=production"
  if [ -n "$until_ts" ]; then
    url="${url}&until=${until_ts}"
  fi
  page_out="$(
    curl -fsS -H "Authorization: Bearer $VERCEL_TOKEN" "$url" \
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
  printf '%s\n' "$page_out" | awk -F '\t' '$1 != "#pagination.next"'
  count="$(printf '%s\n' "$page_out" | awk -F '\t' '$1 != "#pagination.next" && NF { c++ } END { print c+0 }')"
  total=$((total + count))
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
printf 'total=%s\n' "$total"
)
```

A section 3 name is present only when this production list contains it.

Gate command, from `sena-hk-template`:

```bash
npm run sena:vercel:preflight
```

The script name `sena:vercel:preflight` is `sena-hk-template/package.json` line 53. It runs `scripts/verify-sena-vercel-production.ts`. That script runs `vercel env ls production` (lines 853-855) and keeps names parsed from that stdout (lines 207-213). It does not read Vercel `type`. A short CLI listing becomes a short preflight. The section 1 REST walk remains the count.

## 2. The 100-entry listing

`filter_project_envs` on project `sena-hk` with `decrypt=false` returned 100 entries. Target on every entry: `production`. Preview entries: 0. Development entries: 0. Types: 18 `encrypted`, 82 `sensitive`. `hiddenProductionEnvCount`: 0.

The call has no page parameter and returned no `pagination` object.

Truncation is not ruled out. The count is 100. The authoritative total is the paginated production REST walk in section 1. `vercel env ls` is not that total.

## 3. Names absent from a possibly truncated 100-entry listing

Source: `sena-hk-template/scripts/verify-sena-vercel-production.ts`. `requirement()` uses mode `all` when the caller omits `mode` (line 379). `any-of` means one name in the group is enough. Observability `any-of` groups use `keys.some` (line 769).

Truncation is not ruled out. Every row below is absent from a possibly truncated 100-entry listing. Confirm with the section 1 production REST walk before treating a name as unset. A later page can add names. Names already in this listing stay in the full list. A preview or development entry does not clear the row.

Type is the Vercel production type when Dongpin creates the name by hand. `sensitive` is `SENA_OPS_TOKEN`, `SENA_JOB_QUEUE_SECRET` (`secretKeys`, line 650), the alert-secret group (lines 729-734), and the exporter-secret group (lines 746-751). `encrypted` is the callback URL, owner names, alert URLs, `SENA_OBSERVABILITY_PROVIDER`, exporter URLs, and dashboard URLs. Those names are not in the secret arrays. `not manual` is the eight CDN names; section 5 writes them. None of these names is `plain`. `vercel env add` stores `sensitive`, or `encrypted` with `--no-sensitive`. It does not store `plain`.

If the team enforces sensitive Production variables, `--no-sensitive` is ignored and the stored type is `sensitive`. Leave that result.

| Gate | Name | Rule | Type | Target | Listing | Cite |
|---|---|---|---|---|---|---|
| `security-env` | `SENA_OPS_TOKEN` | all | sensitive | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:868-870`; `lib/sena/ops-api.ts:19` |
| `server-job-queue-env` | `SENA_JOB_QUEUE_SECRET` | all | sensitive | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:650`, `:665`, `:692` |
| `server-job-queue-env` | `SENA_JOB_WORKER_CALLBACK_URL` | any-of with `SENA_JOB_QUEUE_URL` | encrypted | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:649`, `:664`, `:710` |
| `observability-env` | `SENA_ALERTING_OWNER`, `SENA_OBSERVABILITY_OWNER`, `ALERTING_OWNER`, `OBSERVABILITY_OWNER` | any-of | encrypted | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:716-719`, `:813` |
| `observability-env` | `SENA_ALERT_WEBHOOK_URL`, `SENA_ALERTING_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, `ALERTS_WEBHOOK_URL`, `OBSERVABILITY_ALERT_WEBHOOK_URL` | any-of | encrypted | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:722-726` |
| `observability-env` | `SENA_ALERT_WEBHOOK_SECRET`, `SENA_ALERTING_WEBHOOK_SECRET`, `SENA_ALERT_WEBHOOK_SIGNING_SECRET`, `ALERT_WEBHOOK_SECRET`, `ALERTS_WEBHOOK_SECRET`, `OBSERVABILITY_ALERT_WEBHOOK_SECRET` | any-of | sensitive | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:729-734` |
| `observability-env` | `SENA_OBSERVABILITY_PROVIDER`, or any exporter URL or exporter secret name in the next two rows | any-of | encrypted for `SENA_OBSERVABILITY_PROVIDER` | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:737`, `:771-772` |
| `observability-env` | `SENA_OBSERVABILITY_EXPORTER_URL`, `SENA_OBSERVABILITY_WEBHOOK_URL`, `OBSERVABILITY_WEBHOOK_URL`, `OBSERVABILITY_EXPORTER_URL` | any-of | encrypted | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:740-743` |
| `observability-env` | `SENA_OBSERVABILITY_EXPORTER_SECRET`, `SENA_OBSERVABILITY_WEBHOOK_SECRET`, `SENA_OBSERVABILITY_EXPORTER_TOKEN`, `OBSERVABILITY_WEBHOOK_SECRET`, `OBSERVABILITY_EXPORTER_SECRET`, `OBSERVABILITY_EXPORTER_TOKEN` | any-of | sensitive | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:746-751` |
| `observability-env` | `SENA_OBSERVABILITY_DASHBOARD_URL`, `OBSERVABILITY_DASHBOARD_URL` | any-of | encrypted | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:754-755` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_CONFIRMED` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:878`, `:882` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_ARTIFACT_SHA256` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:883` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_VERIFIED_AT` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:884` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_ARTIFACT_VALIDATION` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:885` |
| `cdn-evidence-env` | `SENA_CDN_LIVE_PROBE_CONFIRMED` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:886` |
| `cdn-evidence-env` | `SENA_CDN_PROBE_ARTIFACT_SHA256` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:887` |
| `cdn-evidence-env` | `SENA_CDN_PROBE_VERIFIED_AT` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:888` |
| `cdn-evidence-env` | `SENA_CDN_PROBE_ARTIFACT_VALIDATION` | all | not manual | production | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:889` |

Paths in the Cite column are under `sena-hk-template/` except `lib/sena/ops-api.ts`, which is `sena-hk-template/lib/sena/ops-api.ts`.

`SENA_JOB_QUEUE_URL` is in the listing, so the destination any-of at line 649 is met on the names seen. Line 710 is the failure text. It still names `SENA_JOB_WORKER_CALLBACK_URL`. That failure text is inactive while `SENA_JOB_QUEUE_URL` is in the listing.

On line 870, `SENA_SESSION_SECRET`, `SENA_CSRF_SECRET`, and `SENA_MFA_ENCRYPTION_KEY` are in the listing. `security-env` stays unmet while `SENA_OPS_TOKEN` is absent from the full production list. `SENA_OPS_TOKEN` is also read at `sena-hk-template/lib/sena/ops-api.ts` line 19.

`SENA_CDN_VERIFY_URL` (line 881) is in the listing. `cdn-evidence-env` is mode `all`, so it stays unmet while any name from lines 882-889 is absent from the full production list.

### Met on this listing

These checks are met by names in the 100-entry listing. Those names stay in the full list.

- `neon-postgres-env` (id line 485). `SENA_ENTERPRISE_DB_ADAPTER` (line 464), `SENA_ENTERPRISE_STATE_STORE` (line 465), and `SENA_ENTERPRISE_POSTGRES_URL` (lines 466-472, URL is any-of) are in the listing.
- `app-url-env` (id line 861, keys line 863). `SENA_APP_URL` and `NEXT_PUBLIC_SENA_APP_URL` are in the listing.
- `object-storage-env` (id line 625). `SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN` (line 558) is in the listing. That name meets the Blob path at lines 588-591.
- `server-job-queue-env` adapter (line 648; also satisfied by a QStash signal at lines 662-663), destination (`SENA_JOB_QUEUE_URL` at line 649), and contract keys (lines 654-658) are met on the listing. The secret at line 650 is the section 3 row.
- `observability-env` runbook any-of (lines 757-761). `SENA_ALERTING_RUNBOOK_URL` (line 760) is in the listing. Contract keys (lines 764-767) are in the listing. The other observability groups are section 3 rows.
- Advisory `production-runtime-env-packet-custody` (id line 430, keys lines 433-438) and `production-go-live-gate-custody` (id line 447, keys lines 450-456). Both name lists are in the listing. They are advisory (`mode=all-advisory` at line 417, `advisoryOnly=true` at line 422).

`legacy-local-file-env` (id line 511) wants `SENA_ENTERPRISE_DB_DIR` unset (lines 507-509). That name is absent from this listing. Truncation is not ruled out, so the forbid-check is not confirmed.

Names in the listing include `SENA_VERCEL_PRODUCTION_PREFLIGHT_*`, `SENA_PERFORMANCE_BUDGET_GIT_COMMIT`, and the `*_VERIFIED_AT` and `*_ARTIFACT_SHA256` names the preflight reads. A name in the listing does not show which deploy the evidence refers to. Rebind is G4 in #116.

## 4. In the listing, no non-test reference

These names are in the production listing. No non-test file under `sena-hk-template` references them.

`DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `PGHOST_UNPOOLED`, `POSTGRES_DATABASE`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_URL_NO_SSL`, `POSTGRES_USER`.

`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, and `POSTGRES_URL_NON_POOLING` appear only in test redaction patterns: `sena-hk-template/lib/sena/__tests__/ops-probe-unconfigured-routes.test.ts` line 73 and `sena-hk-template/lib/sena/__tests__/ops-access-backend-failure-redaction.test.ts` line 57.

Flag only. Possibly stale:

- `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256`
- `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_TREE_SHA256`

Non-test code does not read those two names. The production evidence binder's planned env omits them (`sena-hk-template/lib/sena/__tests__/production-evidence-bind-script.test.ts` lines 1415-1429). Reviewed-slice custody hashes in non-test code use the other names `SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256` and `SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256` (`sena-hk-template/lib/sena/enterprise/performance-source-custody.ts` lines 18-19; `sena-hk-template/lib/sena/enterprise/performance-budget-artifact.ts` lines 253-254).

## 5. Steps

1. Dongpin runs the section 1 paginated production REST walk and records `total`. That total is the authoritative production count. `vercel env ls` does not establish it. Confirm or deny truncation from that walk.
2. Recheck each section 3 row against that production list. Drop a row when that name is present on production. For an any-of row, drop it when any name in the group is present on production. A preview or development entry does not clear the row.
3. Dongpin creates production values for manual names that are still absent. `sensitive` rows: `vercel env add <NAME> production --sensitive --scope <team-slug>`. `encrypted` rows: `vercel env add <NAME> production --no-sensitive --scope <team-slug>`. Enter the value at the prompt. Do not pass `--value` and do not echo the value.
4. Do not `vercel env add` the eight `SENA_CDN_CONTRACT_*`, `SENA_CDN_LIVE_PROBE_*`, and `SENA_CDN_PROBE_*` names. After the G4 preview deploy in #116, from `sena-hk-template`, write the contract and live-probe artifacts, then bind them:

```bash
npm run sena:cdn:contract -- --output output/production-evidence/cdn-contract.json
npm run sena:cdn:verify -- --output output/production-evidence/cdn-probe.json
npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-contract.json --scope <team-slug>
npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-probe.json --scope <team-slug>
```

`sena:cdn:contract` is `sena-hk-template/package.json` line 32 (`scripts/verify-sena-cdn-contract.ts`). `sena:cdn:verify` is line 33 (`scripts/verify-sena-cdn-runtime.ts`). `sena:production-evidence:bind` is line 46 (`scripts/bind-sena-production-evidence.mjs`). The first two bind commands are dry runs. Re-run a command with `--yes` only when its plan says `bind`.

The binder maps `sena-enterprise-cdn-contract/v1` to `SENA_CDN_CONTRACT_CONFIRMED`, `SENA_CDN_CONTRACT_ARTIFACT_SHA256`, `SENA_CDN_CONTRACT_VERIFIED_AT`, and `SENA_CDN_CONTRACT_ARTIFACT_VALIDATION` (lines 83-92). It maps `sena-enterprise-cdn-probe/v1` to `SENA_CDN_LIVE_PROBE_CONFIRMED`, `SENA_CDN_PROBE_ARTIFACT_SHA256`, `SENA_CDN_PROBE_VERIFIED_AT`, and `SENA_CDN_PROBE_ARTIFACT_VALIDATION` (lines 94-103). It requires status `pass`, a matching `.sha256` sidecar, and the redaction flags in `validateCdnContractArtifact` (line 377) and `validateCdnProbeArtifact` (line 518). The probe host hash must match the production target, `SENA_CDN_VERIFY_URL` or else `https://www.sena.hk` (lines 19 and 518-528). Pass `--target-url` when that default host is wrong. It refuses a non-production `--env` (lines 918-919). `upsertVercelEnv` (lines 1262-1264) is the write: `vercel env add <name> production`, with neither `--sensitive` nor `--no-sensitive`.

5. From `sena-hk-template`, run `npm run sena:vercel:preflight`. `security-env`, `server-job-queue-env`, `observability-env`, and `cdn-evidence-env` need to pass. Treat `legacy-local-file-env` as passed only when the section 1 production list shows `SENA_ENTERPRISE_DB_DIR` unset. The preflight env inventory is still the single CLI page, so a preflight name check that disagrees with the section 1 walk follows the walk.
