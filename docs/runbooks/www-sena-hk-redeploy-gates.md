# www.sena.hk production redeploy gates

The www.sena.hk production redeploy is held. This runbook records the gates required to lift that hold. Final go is Dongpin and the CTO.

Line numbers are from main `62470e1bf6ea6af3a2ab6430d670c15ef9911916`. The target commit is main at the time of the redeploy.

## Current production

Vercel project `sena-hk`. Production deployment `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`. CLI build, created 2026-08-01 04:03Z by `hudongpin-7372`. Source is `cli`. Deployment `meta` is empty. No git commit is stored. The source commit is unknown.

Rollback target: `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.

Target commit: current main at the time of the redeploy.

`www.sena.hk` aliases this deployment. Leave that alias in place until G8.

## Execution order

Gate ids stay G2 through G8. Run them in this order:

1. G2. Choose git provenance. Every CLI deploy uses the dirty-worktree refusal in G2. Do not deploy yet.
2. G3. Read the full production environment list.
3. G5. Write preview-scoped variables before any preview deployment.
4. Preview deploy of the target commit, after the dirty-worktree refusal exits 0.
5. G4. Commit-bound evidence on that preview.
6. G6. Live Postgres, Blob, CDN, job-queue, and observability probes on that same preview.
7. G7. `npm test` and `npm run sena:pilot:verify`.
8. G8. Dongpin and the CTO, then promotion, the `www.sena.hk` preflight, the bind, the endpoint check, and rollback if that check fails.

## G2. Git provenance

Do this first. Dongpin chooses A or B.

### A. Link the project to git

Link Vercel project `sena-hk` to `HUDongpin/SENA`. Set the root directory to `sena-hk-template`. That directory contains the Next app and `vercel.json`. Deploy from main, so every deploy records its commit.

Leave automatic assignment of the production domain off. Promoting `www.sena.hk` stays a manual gate.

A CLI upload, if one is still used after the link, uses the same dirty-worktree refusal as option B.

### B. Keep CLI deploys and record the commit

`vercel deploy` uploads the project directory. `--meta gitCommitSha` stores a label. The preflight does not read that label. A later clean performance run does not prove what was uploaded.

Refuse the deploy when the worktree is dirty. Tracked changes and untracked files both refuse it. Run this block as one shell script from the repository root, immediately before every CLI deploy in this runbook:

```bash
if [ -n "$(git status --porcelain)" ]; then
  echo "refuse: dirty worktree" >&2
  exit 1
fi
SHA="$(git rev-parse HEAD)"
cd sena-hk-template
vercel deploy --meta "gitCommitSha=${SHA}"
```

`exit 1` stops the script before `vercel deploy`. That non-zero status is the refusal. Check out the target commit, make the worktree clean, and run the block again. The preview command records `gitCommitSha` only after the refusal exits 0.

This preview command has no `--prod`. `--prod` promotes `www.sena.hk`. G8 is the only promotion, and its command repeats this refusal in the same shell before adding `--prod`.

After the deploy, run:

```bash
vercel inspect <deployment-url>
```

Confirm the inspected `gitCommitSha` equals `$SHA` from that clean worktree. Record the deployment id and that sha. A mismatch discards the deployment. G4 and G6 use only a deployment that passed this check.

### Recommendation

Choose A. A git link makes drift measurable and rollback auditable. Keep auto-promotion off, so production promotion stays manual.

## G3. Production environment

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

## G5. Preview environment

Owner: Dongpin.

No preview environment variables exist. Add preview-scoped config so the target commit can be previewed before production.

Run this gate before the preview deploy. Add the preview-scoped database, storage, and ops variables and save them first. Vercel applies environment changes on the next deployment. A preview created before those variables exist is not G4 or G6 evidence. After any later change to preview variables, run the G2 dirty-worktree refusal again, deploy a new preview, and rerun G4 and G6 on that new deployment.

Confirm with a complete list:

```bash
vercel env ls preview
```

Use the same full-list rule as G3. A list that stops at 100 entries is incomplete.

## G4. Commit-bound evidence

Owner: code and Dongpin.

Regenerate the preflight, the go-live gate, and the performance budget for a preview of the target commit. Discard evidence taken from `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.

Also regenerate the conference-load rehearsal and the preview ops closeout for that same preview.

The preview deploy is the G2 option B block, after G5 and after the dirty-worktree refusal exits 0. Record its deployment id and `gitCommitSha`. Commands below run from `sena-hk-template` on that same clean target commit.

Command names, from `sena-hk-template/package.json`:

- Preflight: `npm run sena:vercel:preflight` runs `scripts/verify-sena-vercel-production.ts` (line 53).
- Performance budget: `npm run sena:performance:check` runs `scripts/verify-sena-performance-path.ts` (line 19). It accepts `--output`.
- Evidence bind: `npm run sena:production-evidence:bind` runs `scripts/bind-sena-production-evidence.mjs` (line 46). `--artifact <file>` selects one file. Without `--yes` the command prints a dry run. `--yes` writes the Vercel production environment.
- Conference load: `npm run sena:conference:load-check` runs `scripts/verify-sena-conference-load.ts` (line 29). It accepts `--output`.
- Go-live closeout: `npm run sena:go-live:check` runs `scripts/check-sena-go-live-readiness.ts` (line 49). It loads `.env.local` and the local `.sena-enterprise` store. It has no domain flag and no preflight flag.
- Go-live gate: `npm run sena:production:gate` runs `scripts/check-sena-production-go-live-gate.ts` (line 48). It accepts `--domain` and `--preflight`, and it rebuilds the closeout with `buildSenaGoLiveCloseoutCheck()` from that same local store.

There is no `sena:go-live:verify` and no `sena:performance:verify`.

The preflight marks `deployment-ready` only when the inspected deployment is `READY` and `target === "production"` (`verify-sena-vercel-production.ts` line 848). The production host check expects `www.sena.hk` (`ops-productionization.ts` lines 84 and 97-98). A preview host cannot close that production check. Inspect the preview with:

```bash
npm run sena:vercel:preflight -- --domain <preview-host> --output output/production-evidence/vercel-preview-preflight.json
```

Leave `deployment-ready` in review on that run. Bind `SENA_VERCEL_PRODUCTION_PREFLIGHT_*` only from a preflight whose host is `www.sena.hk`, whose artifact `status` is `pass`, and whose deployment is the target commit. That bind is in G8, after promotion.

### Performance budget

`buildEnterpriseProductionPerformanceBudgetArtifact()` requires a production build and checks that `.next/BUILD_ID` matches the current source identity. Build the target commit before measuring it. A fresh checkout, or a `.next` directory left from another commit, fails `production-build-present` or `production-build-identity`.

The worktree stays clean. The binder accepts the budget only when `gitDirty` is false and source custody mode is `git-clean-worktree`.

Write the check to a named artifact, dry-run that exact file, then bind it:

```bash
npm run build
npm run sena:performance:check -- --output output/production-evidence/performance-budget.json
npm run sena:production-evidence:bind -- --artifact output/production-evidence/performance-budget.json
npm run sena:production-evidence:bind -- --artifact output/production-evidence/performance-budget.json --yes
```

`sena:performance:check` without `--output` writes no file. `sena:production-evidence:bind` without `--artifact` scans whatever is already under `output/production-evidence` and can bind a stale file. Without `--yes` the binder prints `Dry run only` and writes nothing. The `--yes` run writes the 10-key tuple:

- `SENA_PERFORMANCE_BUDGET_CONFIRMED`
- `SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256`
- `SENA_PERFORMANCE_BUDGET_VERIFIED_AT`
- `SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION`
- `SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256`
- `SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256`
- `SENA_PERFORMANCE_BUDGET_GIT_COMMIT`
- `SENA_PERFORMANCE_BUDGET_GIT_DIRTY`
- `SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256`
- `SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE`

Leave those keys to the binder (`ops-productionization.ts` lines 444-448). The binder writes the Vercel production environment. The promoting deploy in G8 is the deployment that receives values written here.

### Conference-load rehearsal

Production posture requires `conference-load-rehearsal`: a passed `npm run sena:conference:load-check` for at least 50 users and 1800 seconds. Run that rehearsal against the preview of the target commit. Write a named artifact. Bind that artifact's complete tuple before G8. Discard a rehearsal taken from `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC` or from any other deployment.

```bash
SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 \
SENA_LOAD_TARGET_URL=https://<preview-host> \
SENA_LOAD_TARGET_USERS=50 \
SENA_LOAD_CONCURRENCY=50 \
SENA_LOAD_RAMP_SECONDS=120 \
SENA_LOAD_DURATION_SECONDS=1800 \
SENA_LOAD_THINK_TIME_MS=1000 \
npm run sena:conference:load-check -- --output output/production-evidence/conference-load-rehearsal.json
npm run sena:production-evidence:bind -- --artifact output/production-evidence/conference-load-rehearsal.json --target-url https://<preview-host>
npm run sena:production-evidence:bind -- --artifact output/production-evidence/conference-load-rehearsal.json --target-url https://<preview-host> --yes
```

`--target-url` is the same preview origin the rehearsal measured. The binder compares the artifact origin hash to that URL. The dry run names this file. The `--yes` run writes the complete tuple:

- `SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED`
- `SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256`
- `SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT`
- `SENA_CONFERENCE_LOAD_REHEARSAL_USERS`
- `SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS`
- `SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS`
- `SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT`

G8 accepts this tuple when `vercel inspect` shows the promoted deployment is the same target commit as this preview.

### Preview ops closeout

The closeout that counts is the preview deployment's own ops workflow. Save its responses. `npm run sena:go-live:check` loads `.env.local` and builds deployment readiness, rehearsal, rollback drill, and post-cutover status from the local `.sena-enterprise` store. `npm run sena:production:gate` rebuilds that same local closeout when `--preflight` points at the preview artifact. `npm run sena:self-managed:workflow` and `npm run sena:post-cutover:observe` write that local store. Those local commands are not the preview closeout.

On the preview host, with that deployment's ops bearer, save the five closeout checks. They are deployment readiness, go-live rehearsal, rollback drill, post-cutover monitor, and capability audit.

```bash
mkdir -p output/production-evidence/preview-closeout
curl -fsS -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/readiness" \
  -o output/production-evidence/preview-closeout/readiness.json
curl -fsS -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/deployment" \
  -o output/production-evidence/preview-closeout/deployment.json
curl -fsS -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/go-live-rehearsal" \
  -o output/production-evidence/preview-closeout/go-live-rehearsal.json
curl -fsS -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/go-live-rehearsal?artifact=rollback-drill" \
  -o output/production-evidence/preview-closeout/rollback-drill.json
curl -fsS -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/go-live-rehearsal?artifact=post-cutover-monitor" \
  -o output/production-evidence/preview-closeout/post-cutover-monitor.json
curl -fsS -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/capability-audit" \
  -o output/production-evidence/preview-closeout/capability-audit.json
```

Run the post-cutover observation on that same preview host. `POST /api/sena/ops/go-live-rehearsal` with `action=start-post-cutover-observation`, then `action=record-post-cutover-sample` through the 60-minute window, then `action=complete-post-cutover-observation`. Save each response in `output/production-evidence/preview-closeout/`. Record the preview deployment id next to those files.

The production-path `sena:*:verify` scripts call the same probe functions as the ops routes and use the environment of the process that runs them:

- `npm run sena:postgres:verify` runs `scripts/verify-sena-postgres-runtime.ts` (`package.json` line 30).
- `npm run sena:object-storage:verify` runs `scripts/verify-sena-object-storage-runtime.ts` (line 35).
- `npm run sena:cdn:verify` runs `scripts/verify-sena-cdn-runtime.ts` (line 33).
- `npm run sena:observability:verify` runs `scripts/verify-sena-observability-runtime.ts` (line 37).
- `npm run sena:jobs:queue-verify` runs `scripts/verify-sena-job-queue-runtime.ts` (line 39).

On the preview, the evidence is the `/api/sena/ops/*` responses saved in G6.

## G6. File writes, Postgres, and Blob

Owner: code and Dongpin.

`SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH` blocks file-backed enterprise writes when `NODE_ENV=production` is also set. See `sena-hk-template/lib/sena/enterprise/state.ts` lines 912-926. The blocking reason is `NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH` (line 926). The error code is `enterprise_file_state_production_write_blocked` (line 953).

After the preview deploy, the Postgres, Blob, CDN, job-queue, and observability live checks must pass on that preview. Save each response from the preview deployment id recorded in G4. Responses from `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`, or from an earlier preview, are not evidence for this commit. G8 waits until this set is current for the target deployment.

Postgres: `GET /api/sena/ops/postgres` (`sena-hk-template/app/api/sena/ops/postgres/route.ts` lines 23-41) runs CREATE TABLE, INSERT, SELECT, and DELETE (headers at lines 14-17). The evidence string is `postgresProbeSteps=CREATE_TABLE|INSERT|SELECT|DELETE` (`sena-hk-template/lib/sena/enterprise-postgres.ts` line 829). Local command: `npm run sena:postgres:verify`.

Blob: native mode `native-vercel-blob` is defined in `sena-hk-template/lib/sena/enterprise/object-storage-adapter.ts` lines 17 and 204. `GET /api/sena/ops/object-storage` (`sena-hk-template/app/api/sena/ops/object-storage/route.ts` lines 23-43) runs PUT, HEAD, and DELETE. The probe is in `object-storage-adapter.ts` lines 1022-1055. The evidence string is `objectStorageProbeSteps=PUT|HEAD|DELETE` (line 995). Local command: `npm run sena:object-storage:verify`.

CDN: `GET /api/sena/ops/cdn` (`sena-hk-template/app/api/sena/ops/cdn/route.ts`). Require HTTP 200 and `x-sena-cdn-probe: pass`.

Server job queue: `GET /api/sena/ops/jobs/probe` (`sena-hk-template/app/api/sena/ops/jobs/probe/route.ts`). Require HTTP 200 and `x-sena-server-job-queue-probe: pass`.

Observability: `GET /api/sena/ops/observability/probe` (`sena-hk-template/app/api/sena/ops/observability/probe/route.ts`). Require HTTP 200 and `x-sena-observability-probe: pass`.

Save those three probes with the Postgres and Blob responses:

```bash
mkdir -p output/production-evidence/preview-closeout
curl -fsS -D output/production-evidence/preview-closeout/postgres.headers \
  -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/postgres" \
  -o output/production-evidence/preview-closeout/postgres.json
curl -fsS -D output/production-evidence/preview-closeout/object-storage.headers \
  -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/object-storage" \
  -o output/production-evidence/preview-closeout/object-storage.json
curl -fsS -D output/production-evidence/preview-closeout/cdn.headers \
  -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/cdn" \
  -o output/production-evidence/preview-closeout/cdn.json
curl -fsS -D output/production-evidence/preview-closeout/jobs-probe.headers \
  -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/jobs/probe" \
  -o output/production-evidence/preview-closeout/jobs-probe.json
curl -fsS -D output/production-evidence/preview-closeout/observability-probe.headers \
  -H "Authorization: Bearer $SENA_OPS_TOKEN" \
  "https://<preview-host>/api/sena/ops/observability/probe" \
  -o output/production-evidence/preview-closeout/observability-probe.json
```

Also read, on the preview:

- `GET /api/sena/ops/status` for `writePolicy` (`sena-hk-template/lib/sena/enterprise/ops-status.ts` lines 347-353).
- `GET /api/sena/ops/readiness` for `x-sena-production-performance-path` (`sena-hk-template/app/api/sena/ops/readiness/route.ts` lines 51 and 56-66).

These routes require ops access. `SENA_OPS_TOKEN` is the bearer (`sena-hk-template/lib/sena/enterprise/ops-status.ts` lines 178-187).

Local `npm run sena:cdn:verify`, `npm run sena:jobs:queue-verify`, and `npm run sena:observability:verify` use the local process environment. The preview evidence is the saved route responses above.

## G7. Enterprise tests

Owner: code.

`sena-hk-template/lib/sena/__tests__/enterprise-go-live.test.ts` and `sena-hk-template/lib/sena/__tests__/enterprise.test.ts` must pass in a full run of the local harness. From `sena-hk-template`:

```bash
npm test
```

`npm test` is `node scripts/run-vitest-with-enterprise-temp-db.mjs` (`package.json` line 57). With no file arguments it runs the suite, then the serial phase in `scripts/sena-vitest-phase-plan.mjs` lines 25-32. That phase includes `enterprise-go-live.test.ts` and `enterprise.test.ts` (lines 4-5). The GitHub build workflow does not run this suite.

`npm test` does not start a production server or run the browser handoff. Before G8, stop local `next dev` and `next start` processes for this project, then run the release handoff gate from `sena-hk-template`:

```bash
npm run sena:pilot:verify
```

`npm run sena:pilot:verify` is `node scripts/verify-sena-pilot.mjs` (`package.json` line 16). It clears `.next`, builds, starts a temporary production server, runs the browser smoke, and stops that server. The smoke covers sample and template downloads, JSON contract upload, five-CSV upload, the built-in lesson-study sample, layout switches, alpha/beta/gamma, temporal modes, SVG evidence, downloads, review-packet restore, and project-snapshot restore. G8 waits for this gate and for `npm test`.

## G8. Final go

After both agree, promote the target commit, then prove that `www.sena.hk` serves that deployment.

Option B repeats the dirty-worktree refusal in the same shell, then adds `--prod`:

```bash
if [ -n "$(git status --porcelain)" ]; then
  echo "refuse: dirty worktree" >&2
  exit 1
fi
SHA="$(git rev-parse HEAD)"
cd sena-hk-template
vercel deploy --prod --meta "gitCommitSha=${SHA}"
```

`exit 1` stops the script before `vercel deploy --prod`. Option A promotes the git deployment of the target commit through the manual production control. Automatic assignment of `www.sena.hk` stays off.

From `sena-hk-template`, preflight the moved domain, dry-run that artifact, then bind it:

```bash
npm run sena:vercel:preflight -- --domain www.sena.hk --output output/production-evidence/vercel-production-preflight.json
npm run sena:production-evidence:bind -- --artifact output/production-evidence/vercel-production-preflight.json --target-url https://www.sena.hk
npm run sena:production-evidence:bind -- --artifact output/production-evidence/vercel-production-preflight.json --target-url https://www.sena.hk --yes
vercel inspect https://www.sena.hk
curl -fsSI https://www.sena.hk
```

The preflight artifact `status` must be `pass`, including `deployment-ready`. The host must be `www.sena.hk`. The deployment id must be the promotion just created. It must differ from `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`. Option B: inspected `gitCommitSha` equals `$SHA`. Option A: the git commit on the deployment equals the target commit. The `--yes` bind writes `SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256`, `SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS`, and `SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER`.

Repeat the G4 closeout GETs and the G6 probe set against `https://www.sena.hk`. Save them under `output/production-evidence/production-closeout/`. The preview files describe the preview. These files describe the deployment that now serves the production domain.

If the preflight, the bind, `vercel inspect`, or the live request fails, roll production back to the held deployment:

```bash
vercel rollback dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC --scope <team>
vercel rollback status --scope <team>
vercel inspect https://www.sena.hk --scope <team>
```

Replace `<team>` with the Vercel team scope. `vercel rollback` points production at `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC` without a new build. On the Hobby plan, `vercel rollback` accepts only the immediately previous production deployment. Confirm that `vercel inspect` reports deployment id `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`. Record that deployment id.

Owner: Dongpin and the CTO.

Both agree before `www.sena.hk` moves. Until that agreement, the rollback target remains `dpl_AHJ28x1VrYtZ4Y2Rgdj1se7y51EC`.
