# Portfolio default-branch protection plan

## Status and evidence

This document records the active `main-protection` repository rulesets for the six existing
repositories. The context names were read from GitHub's Checks API for the current
`portfolio/roadmap-implementation` commits on 2026-10-16. They identify jobs as GitHub Actions
checks, not workflow titles. Each ruleset was read back from GitHub after configuration and targets
only the default branch. Each requires a pull request, a current branch, the listed Actions checks,
and blocks force-pushes and branch deletion. All have zero bypass actors and require zero approvals
until an independent reviewer is available through P02.

Configure a ruleset targeting only the default branch of each listed repository. Require pull
requests and up-to-date branches, require every check listed below from the GitHub Actions app,
and disallow force pushes and branch deletion. Do not add bypass actors for ordinary development.
Keep review-approval requirements disabled until an independent reviewer is available; self-review
does not provide independent oversight. Revisit that choice when P02 is completed.

## Required GitHub Actions check contexts

| Repository                              | Active ruleset ID | Required check contexts on `main`                                                                                                               | Notes                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github`                               | 25251471          | `local-links-and-claims`                                                                                                                        | The docs workflow now runs for every pull request so the required context cannot be skipped by a source-only change.                                                                                                                                                                      |
| `aria-api-framework`                    | 16839992          | `quality-gate`, `links-and-claims`                                                                                                              | `quality-gate` aggregates runtime rejection, native tests, dependency review, OSV, container tests, and the failure control. Scheduled live smoke remains outside ordinary PR scope.                                                                                                      |
| `k6-performance-framework`              | 25251474          | `quality`, `windows-format`, `smoke`, `regression`, `telemetry`, `validate`, `study`, `dependency-security`, `links-and-claims`                 | These checks came from the current PR workflows. The D04 `study` is a bounded controlled experiment; it does not assert production capacity. Docs now run on all PRs.                                                                                                                     |
| `playwright-typescript-framework`       | 25251476          | `required-ci`, `links-and-claims`                                                                                                               | `required-ci` aggregates the browser/API/accessibility/visual/selector/reliability suites, clean-clone checks, negative control, and report generation. Docs now run on all PRs.                                                                                                          |
| `selenium-testng-java-framework`        | 16796207          | `required-ci`, `fresh-clone-bootstrap`, `dependency-review`, `scan`, `local-links`                                                              | The aggregate requires Java rejection, a cold Maven bootstrap, quality, failure control, browser matrix, and Grid experiment. The opt-in accessibility suite is required by the aggregate when explicitly requested and on the quarterly schedule, not every PR. Docs now run on all PRs. |
| `verity-policy-coverage-eval-framework` | 25251478          | `Lint · Type · Unit Tests (Python 3.12.15)`, `Lint · Type · Unit Tests (Python 3.13.16)`, `Build image and scan with Trivy`, `links-and-claims` | Docker scanning now runs on every PR so it is a stable required context. The exact current PR run is red on unresolved source/image vulnerability findings; retain that blocker until the exposure is actually resolved. Docs now run on all PRs.                                         |

The names above are exact job/check contexts observed on current commits. If a workflow renames a
job, update this document and the branch ruleset in the same reviewed change. Do not substitute a
workflow title, a green historical run, or an artifact-publication job for the current required
execution gate.

## Enforcement verification

- Positive control: [.github PR #10](https://github.com/qa-test-automation-frameworks/.github/pull/10)
  has its required `local-links-and-claims` check successful and reports merge state `CLEAN` under
  ruleset 25251471.
- Negative control: temporary [.github PR #11](https://github.com/qa-test-automation-frameworks/.github/pull/11)
  intentionally included a prohibited self-assessment claim. Its required check failed in
  [run 38927947183](https://github.com/qa-test-automation-frameworks/.github/actions/runs/38927947183)
  and GitHub reported merge state `BLOCKED`. The PR was then closed and its temporary branch
  deleted; the closed PR remains as the auditable control record.
- The current Verity PR #30 also reports `BLOCKED` while both Python-version vulnerability scans
  and the Trivy image scan fail on unresolved findings. The controlled offline model-cache check
  passed before Trivy ran, so its result remains a separate verified behavior.
- Rulesets were read back for all six repositories on 2026-10-16. Four current framework PRs with
  all required checks successful report `CLEAN`; Verity remains blocked by its actual red security
  checks. This proves current gate evaluation but does not replace future monitoring of context
  drift or the need to add an independent review when P02 is available.

## Operational limitations

- The Verity PR and Trivy checks currently fail because active advisories remain unresolved. That is
  an expected merge block, not a reason to remove the checks or add ignores.
- Repository rulesets require maintain/admin access. The current CLI session has `repo`, `read:org`,
  and `workflow` scopes; no organization-level ruleset operation was needed.
- This plan covers the five framework repositories and the organization profile repository. The
  proposed shared application has no repository or default branch yet.
