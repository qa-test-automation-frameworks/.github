# Dashboard evidence state and refresh health

The portfolio page is a reviewer view of the latest verified evidence. It does not infer test success from an uploaded artifact or from the newest workflow badge. Its schema-v3 snapshot keeps execution, publication, workflow freshness, and current-code compatibility separate.

## Evidence evaluation

The dashboard reads the public `portfolio-evidence` branch index for each configured repository. It verifies the index repository identity, every bundle manifest checksum, each record checksum, schema and semantic contract, and the record's repository, scope, run ID, attempt, source SHA, default branch, and trusted trigger. Any missing object is reported as not published; malformed, inaccessible, or inconsistent data is unavailable. It never treats an API or object-fetch failure as success.

For each verified execution record, the dashboard applies the declared freshness policy in `portfolio/evidence/freshness-policies.json`. A record is review-ready only when all required scopes are fresh, passed, and bound to the current default-branch SHA. Failed and cancelled executions stay visible even if publication succeeded. Stale records, historical records, missing data, and source-SHA mismatches have separate states. Optional scopes remain visible but do not make the required aggregate green. The table also shows the latest trusted default-branch attempt, its conclusion, whether its source SHA matches current default-branch code, the last successful run, evidence publication state, policy rationale, and known limitations.

The HTML page contains the same repository and evidence view as the enhanced JavaScript rendering. The static view includes its generated timestamp, refresh result, and scheduled-workflow health so a browser without JavaScript does not hide evidence status.

## Refresh health and operations

The refresh job checks that the dashboard workflow is enabled and that its latest scheduled completed run succeeded within 36 hours. It reports disabled, never-run, failed, stale, invalid-time, or unavailable states explicitly. The regular refresh runs daily at 04:17 UTC and on the default-branch push; pull requests validate and render without deploying Pages.

As observed from GitHub on 2026-10-16, `dashboard.yml` is active. Two authorized
manual refresh runs (`38939452031` and `38941194532`) remained queued with no
jobs assigned and no updated timestamps. The public Pages page and
`site/data/portfolio.json` returned HTTP 200, but both retained a
`Last-Modified` timestamp of 2026-09-09; the snapshot's `generatedAt` was
`2026-09-09T08:59:57.006Z` and contained no latest runs/evidence. Thus the
implementation and local static checks are validated, while live refresh and
deployment freshness remain unverified and the public snapshot is stale. Recheck
the queued runs and inspect the deployed timestamp before claiming E04 complete.

## Follow-up — 2026-10-17

After `.github` PR #13 merged as `b379b893412502fc9cd8e25b2a26abbb4fc60301`,
main run [`38997504290`](https://github.com/qa-test-automation-frameworks/.github/actions/runs/38997504290)
completed the evidence refresh and Pages deployment successfully. The public
`https://qa-test-automation-frameworks.github.io/.github/` page returned HTTP
200 with `Last-Modified: Sat, 17 Oct 2026 03:06:57 GMT`. Its
`data/portfolio.json` reports `generatedAt` `2026-10-17T03:06:38.031Z`, refresh
status `available`, and no unavailable repositories. The same payload still
reports the scheduled workflow as `stale`, last checked at
`2026-09-09T09:00:22Z` (906.1 hours old at generation). Thus live ingestion and
deployment are now proven; daily schedule operation remains a separately visible
blocker and needs continued monitoring before claiming the operational part of
E04 complete.

## Verification

Local validation under pinned Node.js 24.21.0 passed five dashboard/evidence
test files, and `scripts/validate-dashboard.mjs` validated all five repository
cards. Python trusted-source verifier tests passed 3/3. This verifies local
aggregation, rendering and contract behavior; it does not make the stale public
snapshot current.
