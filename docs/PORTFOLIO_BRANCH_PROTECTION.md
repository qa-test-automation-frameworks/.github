# Portfolio default-branch protection plan

## Current repository-level ruleset readback — 2026-10-22

GitHub's repository-ruleset API returned an active `main-protection` ruleset targeting the default
branch in each of the seven repositories below. The IDs are the read-back identifiers, not
assumptions based on this document. An organization-level ruleset query was unavailable to the
current credential because it lacks `admin:org`; that result does not establish that no organization
rulesets exist.

| Repository | Active ruleset ID | Current detail read back |
| --- | ---: | --- |
| `.github` | 25251471 | Required check `local-links-and-claims`; 0 required approvals. |
| `aria-api-framework` | 16839992 | Active `main-protection`; check-context details below are the dated 2026-10-16 snapshot. |
| `k6-performance-framework` | 25251474 | Active `main-protection`; check-context details below are the dated 2026-10-16 snapshot. |
| `playwright-typescript-framework` | 25251476 | Active `main-protection`; check-context details below are the dated 2026-10-16 snapshot. |
| `selenium-testng-java-framework` | 16796207 | Active `main-protection`; check-context details below are the dated 2026-10-16 snapshot. |
| `verity-policy-coverage-eval-framework` | 25251478 | Active `main-protection`; check-context details below are the dated 2026-10-16 snapshot. |
| `quality-reference-application` | 25291349 | Default-branch PR required, strict checks, required context `verify`, stale reviews dismissed, no code-owner review; 0 required approvals; deletion and non-fast-forward updates blocked. |

The zero-approval setting is a solo-workflow policy choice. It does not count as independent review,
and self-review is not independent approval. The detailed `.github` and QRA settings above were read
back on 2026-10-22. The other five repositories' exact check contexts and approval counts in the
table below are historical observations from 2026-10-16, not a current context readback.

## Historical required GitHub Actions check contexts — 2026-10-16

The names below were read from GitHub's Checks API for the
`portfolio/roadmap-implementation` commits on 2026-10-16. They identify Actions jobs, not workflow
titles. Preserve them as a dated snapshot; reread the ruleset and current check contexts before
making a present-day enforcement claim.

| Repository                              | Active ruleset ID | Required check contexts on `main`                                                                                                               | Notes                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github`                               | 25251471          | `local-links-and-claims`                                                                                                                        | The docs workflow now runs for every pull request so the required context cannot be skipped by a source-only change.                                                                                                                                                                      |
| `aria-api-framework`                    | 16839992          | `quality-gate`, `links-and-claims`                                                                                                              | `quality-gate` aggregates runtime rejection, native tests, dependency review, OSV, container tests, and the failure control. Scheduled live smoke remains outside ordinary PR scope.                                                                                                      |
| `k6-performance-framework`              | 25251474          | `quality`, `windows-format`, `smoke`, `regression`, `telemetry`, `validate`, `study`, `dependency-security`, `links-and-claims`                 | These checks came from the current PR workflows. The D04 `study` is a bounded controlled experiment; it does not assert production capacity. Docs now run on all PRs.                                                                                                                     |
| `playwright-typescript-framework`       | 25251476          | `required-ci`, `links-and-claims`                                                                                                               | `required-ci` aggregates the browser/API/accessibility/visual/selector/reliability suites, clean-clone checks, negative control, and report generation. Docs now run on all PRs.                                                                                                          |
| `selenium-testng-java-framework`        | 16796207          | `required-ci`, `fresh-clone-bootstrap`, `dependency-review`, `scan`, `local-links`                                                              | The aggregate requires Java rejection, a cold Maven bootstrap, quality, failure control, browser matrix, and Grid experiment. The opt-in accessibility suite is required by the aggregate when explicitly requested and on the quarterly schedule, not every PR. Docs now run on all PRs. |
| `verity-policy-coverage-eval-framework` | 25251478          | `Lint · Type · Unit Tests (Python 3.12.15)`, `Lint · Type · Unit Tests (Python 3.13.16)`, `Build image and scan with Trivy`, `links-and-claims` | At the time of this 2026-10-16 snapshot, Docker scanning ran on every PR and unresolved source/image findings blocked the observed PR. This is not a current PR status claim. |

If a workflow renames a job, update the current ruleset and this document in the same reviewed
change. Do not substitute a workflow title, a green historical run, or an artifact-publication job
for the current required execution gate.

## Policy

Configure a ruleset targeting only each repository's default branch. Require pull requests and
up-to-date branches, require the active Actions checks, and disallow force pushes and branch
deletion. Do not add bypass actors for ordinary development. Independent approvals should be
enabled only when an independent reviewer is available; self-review does not provide that oversight.

## Historical enforcement verification — 2026-10-16

- Positive control: [.github PR #10](https://github.com/qa-test-automation-frameworks/.github/pull/10)
  has its required `local-links-and-claims` check successful and reports merge state `CLEAN` under
  ruleset 25251471.
- Negative control: temporary [.github PR #11](https://github.com/qa-test-automation-frameworks/.github/pull/11)
  intentionally included a prohibited self-assessment claim. Its required check failed in
  [run 38927947183](https://github.com/qa-test-automation-frameworks/.github/actions/runs/38927947183)
  and GitHub reported merge state `BLOCKED`. The PR was then closed and its temporary branch
  deleted; the closed PR remains as the auditable control record.
- On 2026-10-16, Verity PR #30 reported `BLOCKED` while both Python-version vulnerability scans
  and the Trivy image scan fail on unresolved findings. The controlled offline model-cache check
  passed before Trivy ran, so its result remains a separate verified behavior.
- At the 2026-10-16 readback, four observed framework PRs with all required checks successful
  reported `CLEAN`, while the observed Verity PR was blocked by its then-current security checks.
  Those outcomes are historical evidence, not current PR or check status.

## Historical operational limitations — 2026-10-16

- The Verity PR and Trivy checks observed in that snapshot failed on then-active advisories. That
  was an expected merge block, not a reason to remove checks or add ignores.
- Repository-level rulesets require maintain/admin access. The organization-level ruleset query in
  the 2026-10-22 readback was unavailable because the credential lacked `admin:org`.
- The historical six-repository plan predates the QRA repository. QRA now has its own active
  `main-protection` ruleset recorded in the current readback above.
