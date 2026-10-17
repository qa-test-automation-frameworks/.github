# Durable evidence publication contract

The E03 publisher stores validated execution records in immutable
`repositories/<owner>/<repo>/runs/<run-id>/<attempt>/` bundles and maintains one
`repositories/<owner>/<repo>/latest.json` index. The bundle contains only the
schema-v3 JSON records, a metadata manifest and SHA-256 sums. Native logs,
screenshots, videos, JUnit bodies and arbitrary workflow artifacts are excluded;
the source run URL remains the reference to ephemeral diagnostic material.

The publisher accepts only completed `push`, `schedule` or `workflow_dispatch`
runs from `main`. Each input record must pass the shared semantic validator and
match the trusted source repository, run ID, attempt, SHA, event and branch.
Secret-like credentials and named synthetic redaction sentinels fail closed.
Failed test executions remain publishable as failures; publication success never
changes the execution disposition.

Each run/attempt path is immutable. A retry may reuse a path only when its
manifest is byte-equivalent; conflicting content fails. The publisher writes a
complete bundle to a temporary directory and renames it into place before
atomically replacing `latest.json`. If interruption occurs before that final
replacement, the previous index remains authoritative. A late completion cannot
move a scope's latest pointer to an older run. For remote publication, bundle and
index changes must be committed together in a single repository commit, and
publisher jobs for that repository must be serialized to avoid racing branch
updates.

Retention budget for the planned evidence branch: cap the checked-out evidence
tree at 500 MiB, retain run bundles for 365 days, and keep each scope's latest
bundle/index pointer even when that execution has aged beyond its freshness
policy. Expire older non-latest bundles first when either limit is reached. Keep
GitHub Actions artifacts as short-lived diagnostic copies; the sanitized
manifest, summaries and checksums survive ordinary Actions artifact expiry.
The reusable publisher prunes the checked-out evidence tree before committing;
it rewrites the evidence branch as a single snapshot commit so expired bundles
do not remain reachable through that branch's commit history. This bounds the
published tree, not GitHub's internal object-store reclamation time. Do not
claim public freshness until the index is retrieved and verified.

Local package command shape:

```sh
node scripts/publish-evidence.mjs \
  --repository qa-test-automation-frameworks/example \
  --run-id 123456 --attempt 1 --source-sha <full-sha> \
  --event push --branch main --workflow-name 'CI' \
  --conclusion success --completed-at 2026-10-16T10:00:00.000Z \
  --run-url https://github.com/qa-test-automation-frameworks/example/actions/runs/123456 \
  --input evidence.json --output /tmp/portfolio-evidence
```

The command prepares content only. A workflow integration must obtain artifacts
using the source run ID, use that source run's event/branch/SHA metadata, validate
the source workflow identity, and commit the resulting bundle and index as one
atomic Git commit with `actions: read` and `contents: write` scoped to that same
repository. Fork pull-request runs must never reach this privileged publisher.
The local packager is only the first E03 component; remote integration,
retention enforcement and live retrieval remain open.

The reusable workflow `.github/workflows/publish-evidence.yml` implements that
trusted-run sequence for calling repositories: it verifies the source run via
the Actions API against an exact workflow file, downloads artifacts by the
verified run ID, discovers schema-v3 JSON records, and writes one commit
containing both immutable bundle and latest index on `portfolio-evidence`.
For sharded producers, a validated `execution-evidence-v3.json` envelope may
carry the complete aggregated records. The publisher uses that envelope for
scopes it contains and ignores duplicate leaf records for those same scopes;
unrelated leaf scopes remain publishable. Duplicate scopes that remain after
selection still fail closed. This lets the producer's native aggregator prove
the expected and received shard sets before durable publication.
Publisher runs are serialized per repository, and retention pruning runs before
the commit. The calling workflow must be a
`workflow_run` listener on its default branch and filter to completed `main`
push/schedule/manual runs; the reusable workflow independently verifies those
claims before the write token is used. Framework callers must pin the reusable
workflow to a full 40-character commit SHA.

## Verified default-branch publication (2026-10-16)

The following source runs completed on their merged default-branch revisions;
the trusted publisher ran, the public `portfolio-evidence` bundle was retrieved,
checksums matched, and records passed the official schema-v3 validator:

| Framework | Source run | Publication evidence |
|---|---:|---|
| ARIA | `38938727842` | Exact merged source SHA; five scopes plus the deliberate failure-control and skipped-live scopes validated. |
| K6 | `38938737816` | Publisher run `38939892944`; two records, manifest and record hashes validated. |
| Playwright | `38941588895` | Publisher run `38942315074`; eight scopes validated, including the expected failed negative control. |
| Selenium | `38938759562` | Publisher run `38939493848`; five records and manifest validated. |

Verity remains unverified for durable publication. Its required dependency and
image security checks fail on unresolved upstream findings, so its caller has
not been merged and must not be treated as a clean default-branch publication.
The new `scripts/test-evidence-git-push-atomicity.sh` control uses a local bare
Git remote to reject a receive, then verifies the branch ref and previous index
remain unchanged; it also verifies a successful single-commit bundle/index
update and rejection of a stale `--force-with-lease`. This exercises Git's
ref-update boundary, but is not an interruption test against GitHub itself.
Actual GitHub ref-write interruption remains unproven. Dashboard ingestion and
freshness are tracked separately in the dashboard evidence-state note.

The local Node tests in `scripts/publish-evidence.test.mjs` and
`scripts/prune-evidence.test.mjs` cover record identity, checksums, immutable
paths, interrupted latest-index updates, out-of-order completion, expiration,
size-limit pruning and refusal to delete oversized latest bundles. The Git
receive test's scope is described above. These local controls do not by
themselves prove production repository permissions, source artifact retrieval,
branch retention or scheduled operation. The four retrieved bundles above are
point-in-time proofs; continued retention and scheduled operation still
require observation over time.

## Post-merge verification (2026-10-17)

The K6 and Selenium publisher-pin changes are merged on their default branches.
I re-fetched each public `latest.json` from `portfolio-evidence`; the bytes
match the captured copies and their SHA-256 digests are respectively
`7b5064facea6a27db507fc4972c409dda6c9bf8149ecbf322c9b12f79bfa72ac` and
`b31944a9ddf0548cf50a99b97ffaa65e2c17dd9c2a0531a3105d7b31e6af2186`. All
listed manifest and record hashes in both captured `SHA256SUMS` files verify.

| Framework | Default-main execution | Trusted publisher | Published index |
|---|---|---|---|
| K6 | [Main load `39023381931`](https://github.com/qa-test-automation-frameworks/k6-performance-framework/actions/runs/39023381931), source `0070aee6dc0ad10334fea8c9e2b07094aa526d01`; `k6.articles-load` and `k6.authenticated-journey` passed. | [Publisher `39023939359`](https://github.com/qa-test-automation-frameworks/k6-performance-framework/actions/runs/39023939359) succeeded. | [Public latest index](https://github.com/qa-test-automation-frameworks/k6-performance-framework/blob/portfolio-evidence/repositories/qa-test-automation-frameworks/k6-performance-framework/latest.json), manifest digest `0422fd30737083d9568f9252b11bcf625e489dc4b51b6bbe80612f3fd45a0ac7`. |
| Selenium | [UI Tests `39023393488`](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/runs/39023393488), source `2301fd730988b0885e561d6a1a7eee690d0d399a`; framework quality and Chrome, Edge and Firefox passed. The deliberate evidence negative control remains a failed record. | [Publisher `39023692520`](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/actions/runs/39023692520) succeeded. | [Public latest index](https://github.com/qa-test-automation-frameworks/selenium-testng-java-framework/blob/portfolio-evidence/repositories/qa-test-automation-frameworks/selenium-testng-java-framework/latest.json), manifest digest `d24a6ef4b101cb17d6a17b856e1689e9b7e17d1ccf22d7c001c754dc67e81e5a`. |

The [portfolio dashboard deployment `39024016581`](https://github.com/qa-test-automation-frameworks/.github/actions/runs/39024016581)
passed. Its [public data](https://qa-test-automation-frameworks.github.io/.github/data/portfolio.json)
was generated at `2026-10-17T10:12:39.589Z`, reports refresh available, and
contains no unavailable repositories. The dashboard consumes the newly
published K6 and Selenium source SHAs and run IDs.

On this `.github` source revision (`8ad9eab`), Node.js `24.21.0` passed all
three local publisher, retention and evidence-contract test files (0 failures).
The bare-Git atomicity control also passed its rejected-receive, successful
single-commit update and stale-lease cases. These controls verify the local
publisher and Git ref-update behavior, not an injected interruption against
GitHub's hosting service. Captured local output is in the ignored
`work/roadmap-evidence/e03-local-tests-2026-10-17/` directory.

These checks demonstrate end-to-end current-main publication and retrieval for
K6 and Selenium; they do not close E03. Verity still has no default-main bundle
because its required security checks remain unresolved (see the [R02 security
review](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/pull/30)).
The point-in-time checks do not establish continuing retention or scheduled
operation. The latest genuine
dashboard schedule is still the September 9 run `34332182917`; manual and push
deployments do not reset that schedule observation.
