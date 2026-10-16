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
workflow to a full 40-character commit SHA. Remote publication is still pending until each framework
has a caller workflow, exact-run CI, and a retrieved bundle whose checksums
validate.

The local controls in `scripts/publish-evidence.test.mjs` and
`scripts/prune-evidence.test.mjs` cover record identity, checksums, immutable
paths, interrupted latest-index updates, out-of-order completion, expiration,
size-limit pruning and refusal to delete oversized latest bundles. They do not
by themselves prove remote publication, repository permissions, artifact
retrieval, branch retention or scheduled operation.
