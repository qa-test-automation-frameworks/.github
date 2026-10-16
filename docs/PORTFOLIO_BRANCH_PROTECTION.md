# Portfolio default-branch protection plan

## Status and evidence

This document records the required check contexts to configure for each existing repository's
`main` branch. The context names were read from GitHub's public Checks API for the current
`portfolio/roadmap-implementation` commit on 2026-10-16. They identify jobs as GitHub Actions
checks, not workflow titles. This is a prepared configuration, not evidence that a ruleset or
branch-protection rule is currently enabled. The local `gh auth status` still reports an invalid
token, so protected-branch administration and a read-back of the resulting rules are unverified.

Configure a ruleset targeting only the default branch of each listed repository. Require pull
requests and up-to-date branches, require every check listed below from the GitHub Actions app,
and disallow force pushes and branch deletion. Do not add bypass actors for ordinary development.
Keep review-approval requirements disabled until an independent reviewer is available; self-review
does not provide independent oversight. Revisit that choice when P02 is completed.

## Required GitHub Actions check contexts

| Repository                              | Required check contexts on `main`                                                                                                               | Notes                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github`                               | `local-links-and-claims`                                                                                                                        | The docs workflow now runs for every pull request so the required context cannot be skipped by a source-only change.                                                                                                                                                                      |
| `aria-api-framework`                    | `quality-gate`, `links-and-claims`                                                                                                              | `quality-gate` aggregates runtime rejection, native tests, dependency review, OSV, container tests, and the failure control. Scheduled live smoke remains outside ordinary PR scope.                                                                                                      |
| `k6-performance-framework`              | `quality`, `windows-format`, `smoke`, `regression`, `telemetry`, `validate`, `study`, `dependency-security`, `links-and-claims`                 | These checks came from the current PR workflows. The D04 `study` is a bounded controlled experiment; it does not assert production capacity. Docs now run on all PRs.                                                                                                                     |
| `playwright-typescript-framework`       | `required-ci`, `links-and-claims`                                                                                                               | `required-ci` aggregates the browser/API/accessibility/visual/selector/reliability suites, clean-clone checks, negative control, and report generation. Docs now run on all PRs.                                                                                                          |
| `selenium-testng-java-framework`        | `required-ci`, `fresh-clone-bootstrap`, `dependency-review`, `scan`, `local-links`                                                              | The aggregate requires Java rejection, a cold Maven bootstrap, quality, failure control, browser matrix, and Grid experiment. The opt-in accessibility suite is required by the aggregate when explicitly requested and on the quarterly schedule, not every PR. Docs now run on all PRs. |
| `verity-policy-coverage-eval-framework` | `Lint · Type · Unit Tests (Python 3.12.15)`, `Lint · Type · Unit Tests (Python 3.13.16)`, `Build image and scan with Trivy`, `links-and-claims` | Docker scanning now runs on every PR so it is a stable required context. The exact current PR run is red on unresolved source/image vulnerability findings; retain that blocker until the exposure is actually resolved. Docs now run on all PRs.                                         |

The names above are exact job/check contexts observed on current commits. If a workflow renames a
job, update this document and the branch ruleset in the same reviewed change. Do not substitute a
workflow title, a green historical run, or an artifact-publication job for the current required
execution gate. After configuring each ruleset, query the protected branch's rules and verify with
one passing and one deliberately failing PR check before marking E02 enforcement verified.

## Operational limitations

- The Verity PR and Trivy checks currently fail because active advisories remain unresolved. That is
  an expected merge block, not a reason to remove the checks or add ignores.
- The GitHub CLI credential is currently invalid in the local environment, even though SSH pushes
  work. Ruleset administration and read-back require a valid GitHub CLI/API credential with access
  to organization repository settings.
- This plan covers the five framework repositories and the organization profile repository. The
  proposed shared application has no repository or default branch yet.
