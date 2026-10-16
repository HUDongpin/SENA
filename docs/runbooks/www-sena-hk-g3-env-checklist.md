# G3: www.sena.hk production env checklist

Read-only checklist for Vercel project `sena-hk`. Repo `HUDongpin/SENA` at `62470e1bf6ea6af3a2ab6430d670c15ef9911916`. App root `sena-hk-template`. Listing date 2026-10-16.

Names, targets, and types only. No values. Dongpin sets values in Vercel.

This is the G3 production-env checklist for the redeploy hold in #116.

## 1. List commands

CLI prints names, targets, and created dates. Values stay hidden. Run from a directory linked to `sena-hk`.

```bash
vercel env ls production --scope <team-slug>
vercel env ls preview --scope <team-slug>
```

REST returns names, targets, and types. Use `decrypt=false`. Do not record the `value` field.

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v10/projects/sena-hk/env?teamId=<team-id>&decrypt=false"
```

The response schema includes `pagination.count`, `pagination.next`, and `pagination.prev`. `pagination.next` is a timestamp for the next page. When it is non-null, repeat the request with `&until=<pagination.next>` until it is null. The total is the sum of `.envs` lengths.

Names, targets, and types only:

```bash
jq -r '.envs[] | [.key, (if (.target|type)=="array" then (.target|join(",")) else (.target // "") end), .type] | @tsv'
```

Gate command, from `sena-hk-template`:

```bash
npm run sena:vercel:preflight
```

The script name `sena:vercel:preflight` is `sena-hk-template/package.json` line 53. It runs `scripts/verify-sena-vercel-production.ts`. That script runs `vercel env ls production` (lines 853-855) and keeps names parsed from that stdout (lines 207-213). A short CLI listing becomes a short preflight.

## 2. The 100-entry listing

`filter_project_envs` on project `sena-hk` with `decrypt=false` returned 100 entries. Target on every entry: `production`. Preview entries: 0. Development entries: 0. Types: 18 `encrypted`, 82 `sensitive`. `hiddenProductionEnvCount`: 0.

The call has no page parameter and returned no `pagination` object.

Truncation is not ruled out. The count is 100. Confirm the total with the CLI command or the paginated REST command in section 1.

## 3. Names absent from a possibly truncated 100-entry listing

Source: `sena-hk-template/scripts/verify-sena-vercel-production.ts`. `requirement()` uses mode `all` when the caller omits `mode` (line 379). `any-of` means one name in the group is enough. Observability `any-of` groups use `keys.some` (line 769).

Truncation is not ruled out. Every row below is absent from a possibly truncated 100-entry listing. Confirm with the CLI or paginated REST commands in section 1 before treating a name as unset. A later page can add names. Names already in this listing stay in the full list.

| Gate | Name | Rule | Listing | Cite |
|---|---|---|---|---|
| `security-env` | `SENA_OPS_TOKEN` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:868-870`; `lib/sena/ops-api.ts:19` |
| `server-job-queue-env` | `SENA_JOB_QUEUE_SECRET` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:650`, `:665`, `:692` |
| `server-job-queue-env` | `SENA_JOB_WORKER_CALLBACK_URL` | any-of with `SENA_JOB_QUEUE_URL` | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:649`, `:664`, `:710` |
| `observability-env` | `SENA_ALERTING_OWNER`, `SENA_OBSERVABILITY_OWNER`, `ALERTING_OWNER`, `OBSERVABILITY_OWNER` | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:716-719`, `:813` |
| `observability-env` | `SENA_ALERT_WEBHOOK_URL`, `SENA_ALERTING_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, `ALERTS_WEBHOOK_URL`, `OBSERVABILITY_ALERT_WEBHOOK_URL` | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:722-726` |
| `observability-env` | `SENA_ALERT_WEBHOOK_SECRET`, `SENA_ALERTING_WEBHOOK_SECRET`, `SENA_ALERT_WEBHOOK_SIGNING_SECRET`, `ALERT_WEBHOOK_SECRET`, `ALERTS_WEBHOOK_SECRET`, `OBSERVABILITY_ALERT_WEBHOOK_SECRET` | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:729-734` |
| `observability-env` | `SENA_OBSERVABILITY_PROVIDER`, or any exporter URL or exporter secret name in the next two rows | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:737`, `:771-772` |
| `observability-env` | `SENA_OBSERVABILITY_EXPORTER_URL`, `SENA_OBSERVABILITY_WEBHOOK_URL`, `OBSERVABILITY_WEBHOOK_URL`, `OBSERVABILITY_EXPORTER_URL` | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:740-743` |
| `observability-env` | `SENA_OBSERVABILITY_EXPORTER_SECRET`, `SENA_OBSERVABILITY_WEBHOOK_SECRET`, `SENA_OBSERVABILITY_EXPORTER_TOKEN`, `OBSERVABILITY_WEBHOOK_SECRET`, `OBSERVABILITY_EXPORTER_SECRET`, `OBSERVABILITY_EXPORTER_TOKEN` | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:746-751` |
| `observability-env` | `SENA_OBSERVABILITY_DASHBOARD_URL`, `OBSERVABILITY_DASHBOARD_URL` | any-of | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:754-755` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_CONFIRMED` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:878`, `:882` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_ARTIFACT_SHA256` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:883` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_VERIFIED_AT` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:884` |
| `cdn-evidence-env` | `SENA_CDN_CONTRACT_ARTIFACT_VALIDATION` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:885` |
| `cdn-evidence-env` | `SENA_CDN_LIVE_PROBE_CONFIRMED` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:886` |
| `cdn-evidence-env` | `SENA_CDN_PROBE_ARTIFACT_SHA256` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:887` |
| `cdn-evidence-env` | `SENA_CDN_PROBE_VERIFIED_AT` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:888` |
| `cdn-evidence-env` | `SENA_CDN_PROBE_ARTIFACT_VALIDATION` | all | absent from a possibly truncated 100-entry listing | `verify-sena-vercel-production.ts:889` |

Paths in the Cite column are under `sena-hk-template/` except `lib/sena/ops-api.ts`, which is `sena-hk-template/lib/sena/ops-api.ts`.

`SENA_JOB_QUEUE_URL` is in the listing, so the destination any-of at line 649 is met on the names seen. Line 710 is the failure text. It still names `SENA_JOB_WORKER_CALLBACK_URL`. That failure text is inactive while `SENA_JOB_QUEUE_URL` is in the listing.

On line 870, `SENA_SESSION_SECRET`, `SENA_CSRF_SECRET`, and `SENA_MFA_ENCRYPTION_KEY` are in the listing. `security-env` stays unmet while `SENA_OPS_TOKEN` is absent from the full list. `SENA_OPS_TOKEN` is also read at `sena-hk-template/lib/sena/ops-api.ts` line 19.

`SENA_CDN_VERIFY_URL` (line 881) is in the listing. `cdn-evidence-env` is mode `all`, so it stays unmet while any name from lines 882-889 is absent from the full list.

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

1. Dongpin runs the section 1 CLI or paginated REST list and records the total. Confirm or deny truncation.
2. Recheck each section 3 row against the full list. Drop a row when that name is present. For an any-of row, drop it when any name in the group is present.
3. Dongpin sets values for names that are still absent. Set the CDN evidence names only after the CDN contract and live probe on the new preview deploy (G4 in #116).
4. From `sena-hk-template`, run `npm run sena:vercel:preflight`. `security-env`, `server-job-queue-env`, `observability-env`, and `cdn-evidence-env` need to pass. Treat `legacy-local-file-env` as passed only when the full list shows `SENA_ENTERPRISE_DB_DIR` unset.
