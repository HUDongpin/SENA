# www.sena.hk production redeploy gates

The www.sena.hk production redeploy is held. This runbook records the gates required to lift that hold. Final go is Dongpin and the CTO.

Line numbers are from main `62470e1bf6ea6af3a2ab6430d670c15ef9911916`. The target commit is main at the time of the redeploy.

## Current production

Vercel project `sena-hk`. Production deployment `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`. CLI build, created 2026-08-01 04:03Z by `hudongpin-7372`. Source is `cli`. Deployment `meta` is empty. No git commit is stored. The source commit is unknown.

Rollback target: `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.

Target commit: current main at the time of the redeploy.

`www.sena.hk` aliases this deployment. Leave that alias in place until G8.

## G2. Git provenance

Dongpin chose option B on 2026-10-18 at 21:34 HKT. CLI deploys continue, and each deploy records its commit. Option A, the git link, is not chosen.

### A. Link the project to git

Option A is not chosen.

Link Vercel project `sena-hk` to `HUDongpin/SENA`. Set the root directory to `sena-hk-template`. That directory contains the Next app and `vercel.json`. Deploy from main, so every deploy records its commit.

Leave automatic assignment of the production domain off. Promoting `www.sena.hk` stays a manual gate.

### B. Keep CLI deploys and record the commit

Check out the target commit in a clean git worktree before every deploy. Confirm that `git status` shows a clean worktree.

Deploy a preview first:

```bash
vercel deploy --meta gitCommitSha=$(git rev-parse HEAD)
```

Use `--prod` on that command only after Dongpin and the CTO sign off at G8.

After each deploy, run:

```bash
vercel inspect <deployment-url>
```

Confirm that the `gitCommitSha` meta equals the target commit. Record the deployment id and the commit sha.

Auto-promotion stays off. The rollback target stays `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.

## G3. Production environment

The G2 decision unblocks this gate. The production redeploy remains held.

Owner: Dongpin.

The environment listing that was inspected may have stopped at 100 entries. A name missing from a partial list is not evidence that the variable is unset.

Main's readiness checks read these variables:

- `SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION` in `sena-hk-template/lib/sena/enterprise/ops-productionization.ts` lines 216-217.
- `SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256` in the same file, lines 218-220.
- `SENA_ALERTING_OWNER` in the same file, line 210, and in the observability evidence at line 400.
- `SENA_OPS_TOKEN` in `sena-hk-template/lib/sena/enterprise/ops-status.ts` lines 178-179 (`opsTokenConfigured`). The ops-auth check uses that result at lines 561-571.

`npm run sena:vercel:preflight` lists production names with `vercel env ls production` (`sena-hk-template/scripts/verify-sena-vercel-production.ts` lines 853-855) and keeps only names parsed from that stdout (lines 207-213). A truncated listing becomes a truncated preflight.

Verify with the full production list:

```bash
vercel env ls production
```

Read every page. Then, from `sena-hk-template`:

```bash
npm run sena:vercel:preflight
```

The script name is `sena:vercel:preflight` in `sena-hk-template/package.json` line 53. It runs `scripts/verify-sena-vercel-production.ts`.

## G4. Commit-bound evidence

The G2 decision unblocks this gate. The production redeploy remains held.

Owner: code and Dongpin.

Regenerate the preflight, the go-live gate, and the performance budget for a preview of the target commit. Discard evidence taken from `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.

The real commands, from `sena-hk-template`:

- Preflight: `npm run sena:vercel:preflight` runs `scripts/verify-sena-vercel-production.ts` (`package.json` line 53). Usage is in that file at lines 158-168.
- Go-live gate: `npm run sena:production:gate` runs `scripts/check-sena-production-go-live-gate.ts` (`package.json` line 48).
- Go-live closeout: `npm run sena:go-live:check` runs `scripts/check-sena-go-live-readiness.ts` (`package.json` line 49). This command has no domain flag. It evaluates the local runtime.
- Performance budget: `npm run sena:performance:check` runs `scripts/verify-sena-performance-path.ts` (`package.json` line 19).

There is no `sena:go-live:verify` and no `sena:performance:verify`.

The preflight marks `deployment-ready` only when the inspected deployment is `READY` and `target === "production"` (`verify-sena-vercel-production.ts` line 848). The production host check expects `www.sena.hk` (`ops-productionization.ts` lines 84 and 97-98). A preview host cannot close that production check. Inspect the preview with:

```bash
npm run sena:vercel:preflight -- --domain <preview-host> --output output/production-evidence/vercel-preview-preflight.json
```

Leave `deployment-ready` in review on that run. Bind `SENA_VERCEL_PRODUCTION_PREFLIGHT_*` only from a preflight whose host is `www.sena.hk` and whose deployment is the target commit. That bind waits until G8 allows promotion.

Run the performance check from a clean worktree of the target commit:

```bash
npm run sena:performance:check
```

Rebind the full budget tuple with `npm run sena:production-evidence:bind`. Do not set the budget keys by hand (`ops-productionization.ts` lines 444-448).

Run the go-live gate from that same commit, with the preview preflight as input:

```bash
npm run sena:go-live:check
npm run sena:production:gate -- --domain <preview-host> --preflight output/production-evidence/vercel-preview-preflight.json
```

The production-path `sena:*:verify` scripts are:

- `npm run sena:postgres:verify` runs `scripts/verify-sena-postgres-runtime.ts` (`package.json` line 30).
- `npm run sena:object-storage:verify` runs `scripts/verify-sena-object-storage-runtime.ts` (line 35).
- `npm run sena:cdn:verify` runs `scripts/verify-sena-cdn-runtime.ts` (line 33).
- `npm run sena:observability:verify` runs `scripts/verify-sena-observability-runtime.ts` (line 37).
- `npm run sena:jobs:queue-verify` runs `scripts/verify-sena-job-queue-runtime.ts` (line 39).

Those commands call the same probe functions as the ops routes. They use the environment of the process that runs them. On the preview, use the `/api/sena/ops/*` routes in G6.

## G5. Preview environment

The G2 decision unblocks this gate. The production redeploy remains held.

Owner: Dongpin.

No preview environment variables exist. Add preview-scoped config so the target commit can be previewed before production.

Confirm with a complete list:

```bash
vercel env ls preview
```

Use the same full-list rule as G3. A list that stops at 100 entries is incomplete.

## G6. File writes, Postgres, and Blob

The G2 decision unblocks this gate. The production redeploy remains held.

Owner: code and Dongpin.

`SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH` blocks file-backed enterprise writes when `NODE_ENV=production` is also set. See `sena-hk-template/lib/sena/enterprise/state.ts` lines 912-926. The blocking reason is `NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH` (line 926). The error code is `enterprise_file_state_production_write_blocked` (line 953).

After the preview deploy, the Postgres and Blob live checks must pass.

Postgres: `GET /api/sena/ops/postgres` (`sena-hk-template/app/api/sena/ops/postgres/route.ts` lines 23-41) runs CREATE TABLE, INSERT, SELECT, and DELETE (headers at lines 14-17). The evidence string is `postgresProbeSteps=CREATE_TABLE|INSERT|SELECT|DELETE` (`sena-hk-template/lib/sena/enterprise-postgres.ts` line 829). Local command: `npm run sena:postgres:verify`.

Blob: native mode `native-vercel-blob` is defined in `sena-hk-template/lib/sena/enterprise/object-storage-adapter.ts` lines 17 and 204. `GET /api/sena/ops/object-storage` (`sena-hk-template/app/api/sena/ops/object-storage/route.ts` lines 23-43) runs PUT, HEAD, and DELETE. The probe is in `object-storage-adapter.ts` lines 1022-1055. The evidence string is `objectStorageProbeSteps=PUT|HEAD|DELETE` (line 995). Local command: `npm run sena:object-storage:verify`.

Also read, on the preview:

- `GET /api/sena/ops/status` for `writePolicy` (`sena-hk-template/lib/sena/enterprise/ops-status.ts` lines 347-353).
- `GET /api/sena/ops/readiness` for `x-sena-production-performance-path` (`sena-hk-template/app/api/sena/ops/readiness/route.ts` lines 51 and 56-66).

These routes require ops access. `SENA_OPS_TOKEN` is the bearer (`sena-hk-template/lib/sena/enterprise/ops-status.ts` lines 178-187).

## G7. Enterprise tests

The G2 decision unblocks this gate. The production redeploy remains held.

Owner: code.

`sena-hk-template/lib/sena/__tests__/enterprise-go-live.test.ts` and `sena-hk-template/lib/sena/__tests__/enterprise.test.ts` must pass in a full run of the local harness. From `sena-hk-template`:

```bash
npm test
```

`npm test` is `node scripts/run-vitest-with-enterprise-temp-db.mjs` (`package.json` line 57). With no file arguments it runs the suite, then the serial phase in `scripts/sena-vitest-phase-plan.mjs` lines 25-32. That phase includes `enterprise-go-live.test.ts` and `enterprise.test.ts` (lines 4-5). The GitHub build workflow does not run this suite.

## G8. Final go

Owner: Dongpin and the CTO.

Both agree before `www.sena.hk` moves. Until that agreement, the rollback target remains `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.
