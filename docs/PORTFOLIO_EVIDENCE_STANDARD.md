# Portfolio Evidence Standard

Version3 defines a per-scope record produced after execution, not an attestation
committed onto the source branch to chase its own SHA. The organization dashboard
is a scheduled snapshot, not real-time monitoring. Schema and fixture files live
in [portfolio/evidence](../portfolio/evidence); every example is explicitly
synthetic and must never be presented as a current framework result.

## Contract and validation

[evidence-v3.schema.json](../portfolio/evidence/evidence-v3.schema.json) uses JSON
Schema2020-12. It describes two distinct kinds: `execution` and
`historical_attestation`. Source SHA is the exact tested checkout (including a PR
merge checkout when that is what ran), not automatically the delivered branch
head. Repository, workflow ID/name, immutable run ID and attempt, trigger/branch,
and UTC start/completion times identify the execution. Scope has an ID, required
flag, evidence class and freshness policy. Records are identified by repository,
workflow/run/attempt and scope; shards belong to that scope/attempt. Do not merge
results across attempts, source revisions, targets or browser projects.

Use the dependency-free Node24 checker for both schema and semantic rules:

```sh
node scripts/validate-evidence.mjs path/to/evidence.json
node --test scripts/evidence-contract.test.mjs
```

Exit0 means valid, exit1 means invalid input, exit2 means no input supplied. The
validator implements the schema's checked-in keyword subset, not a general JSON
Schema engine. Its `https-url` format additionally requires HTTPS, no userinfo,
query parameters or fragment. This avoids credential-bearing/signed artifact URLs;
use stable public references instead. External validators must enable format
checking and register that custom format, then apply the semantic rules below.
UTC timestamps must be real calendar times ending inZ, with either no fractional
seconds or three fractional digits. Unknown fields/versions are rejected, so a
new contract needs an explicit migration. The schema `$id` is a namespace, not a
claim that the file is already deployed at that URL.

## Execution and publication are independent

Execution disposition is `passed`, `failed`, `skipped`, `unavailable`, `cancelled`
or `in_progress`. Non-pass records need a reason. Attempted execution needs a
start time; terminal passed/failed/cancelled execution needs completion. Skipped
credentials and unavailable runner data have no fabricated execution time/count.
In-progress results have no completion. Completion cannot precede start.

Integrity is `complete`, `partial`, `empty` or `unavailable`. A pass requires
complete evidence, every expected shard exactly once and substantive native
execution. Successful empty collection, all-skipped selection, missing shards,
duplicate shards and unexpected shards cannot be passed evidence. A runner/API
that loses part of an attempted suite should emit `failed`/`partial` with its
reason and known counts; `unavailable` does not claim substantive execution.
Keep the original runner exit and collect evidence in an always-run step (E02).

Publication is separately `pending`, `published`, `failed` or `not_applicable`.
A published record needs publication time and at least one artifact with SHA256
and retention metadata; a report URL alone does not certify evidence. Failed or
not-applicable publication needs a reason. Failed tests can have a successfully
published diagnostic bundle; publication success never converts them to a pass.
A passed test with upload failure remains passed execution/failed publication.
Unpublished records cannot claim a new report URL or publication time; an older
report belongs to the last successful record, not this attempted publication.
Publication cannot precede execution completion.

## Counts and target identity

All count fields are required but may be null when unknown. Zero means a measured
zero, not absent data. Units distinguish `test_case`, `parameter_case`,
`evaluation_sample` and `not_applicable`. Describe the exact denominator in
`semantics`: Playwright project/parameter cases, TestNG parameter invocations,
JUnit final cases, or selected evaluation samples as appropriate. Selected cases
include skipped cases. Executed cases exclude skipped cases; final passed/failed
outcomes reconcile to executed cases on a passing completed suite. `retried` is
the number of unique cases retried, never extra executions added to the test total.
Retain individual attempt detail in linked native results. Partial/cancelled
records can have unresolved final outcomes but cannot exceed known totals.

k6 uses null test counts and native measurements for requests, iterations, checks,
latency and threshold decisions. Each measurement has a distinct name, value,
unit, positive native sampleCount and semantics. A zero error metric is valid
when observations exist; an empty metric map is not substantive execution.
Requests/iterations/check assertions are different denominators, not fake tests.
The contract validates representation; native adapters must establish provenance,
collection completeness and count reconciliation. Fixtures alone cannot do so.

Target identity records version/digest/commit, fixture version, environment class,
profile and tool versions. Unavailable revision/fixture data uses null with an
honest limitation; do not replace it with the framework SHA. Credentials, private
request bodies and unnecessary traces/screenshots do not belong in the manifest.
Artifact hashes cover retained sanitized bytes; generator name/version and
limitations are mandatory. Ephemeral artifacts have expiry and retention policy;
durable artifacts have a budgeted policy (E03), not an invented infinite-retention
promise. Expired raw baseline inputs remain unavailable.

## Freshness and the three histories

[freshness-policies.json](../portfolio/evidence/freshness-policies.json) declares
policy identifiers and rationale. Daily gates have36 hours (one daily slot plus
12 hours of scheduling margin); optional quarterly experiments have100 days.
Manual case studies remain historical and cannot establish current readiness.
Freshness uses actual execution completion with a supplied clock. A refresh time,
upload time or HTTP200 report cannot renew an old run. Future or invalid completion
time is invalid; failed/skipped/cancelled/unavailable/in-progress outcomes remain
explicit instead of becoming a green freshness label.

Consumers must retain three separate concepts:

1. Latest attempted execution, even when it failed, was cancelled or was skipped.
2. Last successful execution and its immutable artifact/report references.
3. A reviewed baseline or historical attestation, including reviewer/date/source.

A later failure does not erase the prior report, and a prior report does not hide
the failure. An attestation never upgrades a new run by matching its SHA/run ID.
The dashboard now selects and renders against these histories, keeping the latest
attempt, last successful execution, and reviewed historical attestations separate.
This contract supplies the record rules and controlled-clock freshness checks;
dashboard implementation and deployed observations are recorded in the dated
[dashboard verification notes](verification/2026-10-16-dashboard-evidence-state.md)
and the [operation log](history/PORTFOLIO_OPERATION_LOG.md).

## Additive migration from the existing dashboard

The existing portfolio definition and stored snapshot keep their schemaVersion2;
they are dashboard documents, not new execution manifests. Preserve existing
`latest-verification.md` and JSON attestation records as historical references.
`classifyLegacyAttestation` wraps old fields without inventing missing attempt,
counts, target, shards or timestamps and marks them ineligible as current execution.
Do not mutate tested branches merely to record a run generated after checkout.

Implemented native producers emit version3 records and the publisher makes
immutable bundles keyed by repository/run/attempt with a validated atomic index.
The dashboard consumes available bundles and displays legacy attestations
separately. Missing producer data remains unavailable; the Verity producer
follow-up is tracked in the organization roadmap. Old labels `review-ready`, `evidence-stale`,
`evidence-unavailable` and `work-in-progress` remain legacy display states only.

The `.github` documentation workflow validates this repository's Markdown and
contract tests. It does not validate every framework's native outputs or enforce
all organization branch protections. The 2026-10-04 readback found the Portfolio
dashboard workflow `disabled_inactivity`; the 2026-10-19 observation later
recorded healthy schedule status. Neither dated observation establishes current
health. Use the live dashboard and P03 operation log for current status and
continued schedule verification.

## Evidence producer cadence

Every required scope and failure-control scope has exactly one declared workflow
and job below. Its producer runs on every push to `main`, without path filters,
and on a schedule whose maximum gap plus twelve hours is within the required
freshness policy. The checker enumerates UTC firing times across two years.

Exact source matching means a push causes `code-mismatch` until its producers
publish for the new SHA. The source-run verifier checks the branch, event, and
run identity; it does not require the run's SHA to remain the current main tip.
The dashboard makes that separate comparison.

Live producer verification checks the declared cron, unfiltered main trigger,
job keys, and workflow state. GitHub may disable scheduled public workflows after
sixty days without repository activity. A disabled or unavailable workflow adds
a policy mismatch and prevents `review-ready`.

<!-- producer-table:begin -->
| Repo | Scope | Required | Producer workflow | Job | Schedule (UTC) | Max gap (h) | Policy (max age h) |
|---|---|---|---|---|---|---|---|
| verity-policy-coverage-eval-framework | verity.deterministic-py3.12.15 | yes | pr-gate.yml | lint-type-test | `23 5 * * *` | 24 | daily_gate_v1 (36) |
| verity-policy-coverage-eval-framework | verity.deterministic-py3.13.16 | yes | pr-gate.yml | lint-type-test | `23 5 * * *` | 24 | daily_gate_v1 (36) |
| verity-policy-coverage-eval-framework | verity.failure-control-py3.12.15 | no (control) | pr-gate.yml | lint-type-test | `23 5 * * *` | 24 | daily_gate_v1 (36) |
| verity-policy-coverage-eval-framework | verity.failure-control-verification-py3.12.15 | yes | pr-gate.yml | lint-type-test | `23 5 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | framework-unit | yes | ci.yml | lint-typecheck | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | api | yes | ci.yml | test-api | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | e2e | yes | ci.yml | test-e2e | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | visual | yes | ci.yml | test-visual | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | accessibility | yes | ci.yml | test-accessibility | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | selector-contract | yes | ci.yml | test-selector-contract | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | shared-app-ui | yes | ci.yml | shared-app-ui | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| playwright-typescript-framework | cross-browser | yes | ci.yml | test-cross-browser | `0 6 * * *` | 24 | daily_gate_v1 (36) |
| aria-api-framework | aria.deterministic | yes | ci.yml | test | `41 4 * * *` | 24 | daily_gate_v1 (36) |
| aria-api-framework | aria.contract | yes | ci.yml | test | `41 4 * * *` | 24 | daily_gate_v1 (36) |
| aria-api-framework | aria.pact-provider | yes | ci.yml | test | `41 4 * * *` | 24 | daily_gate_v1 (36) |
| aria-api-framework | aria.container | yes | ci.yml | container-test | `41 4 * * *` | 24 | daily_gate_v1 (36) |
| aria-api-framework | aria.shared-app | yes | ci.yml | shared-reference-app | `41 4 * * *` | 24 | daily_gate_v1 (36) |
| selenium-testng-java-framework | framework-quality | yes | ui-tests.yml | quality-gates | `13 6 * * *` | 24 | daily_gate_v1 (36) |
| selenium-testng-java-framework | ui.CHROME | yes | ui-tests.yml | test | `13 6 * * *` | 24 | daily_gate_v1 (36) |
| selenium-testng-java-framework | ui.FIREFOX | yes | ui-tests.yml | test | `13 6 * * *` | 24 | daily_gate_v1 (36) |
| selenium-testng-java-framework | ui.EDGE | yes | ui-tests.yml | test | `13 6 * * *` | 24 | daily_gate_v1 (36) |
| selenium-testng-java-framework | accessibility.CHROME | yes | ui-tests.yml | accessibility | `13 6 * * *` | 24 | daily_gate_v1 (36) |
| k6-performance-framework | k6.articles-load | yes | main-load.yml | load | `7 3 * * *` | 24 | daily_gate_v1 (36) |
| k6-performance-framework | k6.authenticated-journey | yes | main-load.yml | load | `7 3 * * *` | 24 | daily_gate_v1 (36) |
| k6-performance-framework | k6.pr-smoke | yes | pr-smoke.yml | smoke | `27 3 * * *` | 24 | daily_gate_v1 (36) |
| k6-performance-framework | k6.evidence-failure-control | no (control) | pr-smoke.yml | smoke | `27 3 * * *` | 24 | daily_gate_v1 (36) |
| k6-performance-framework | k6.evidence-failure-control-verification | yes | pr-smoke.yml | smoke | `27 3 * * *` | 24 | daily_gate_v1 (36) |
| k6-performance-framework | k6.shared-app-load | yes | shared-app-load.yml | shared-app-load | `47 3 * * *` | 24 | daily_gate_v1 (36) |
<!-- producer-table:end -->

## Re-runs and publication

Partial re-runs (re-run failed jobs) can mix native attempt identities. The
publisher rejects such bundles, and the dashboard reports
`not-published-for-latest-attempt`. The last published evidence keeps its own
source SHA and execution time. Recover with a full workflow re-run or wait for
the next scheduled run; Playwright's setup-failure recovery uses a full re-run.

`portfolio/reusable-workflow-pins.json` declares reusable workflow revisions.
Update that file and all callers in a coordinated set of PRs. The dashboard
shows pin drift until the callers agree; unavailable source reads also prevent
review readiness.
