# Verity default-branch publication verification (2026-10-19)

After Verity PRs #35 and #36 were merged, the main PR Gate completed on exact
source commit `10d101cf83decd86036f1e65ec1ff0d5c408e964` in run
[`39206484959`](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/runs/39206484959).
The trusted publisher completed on
[`39206664474`](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/actions/runs/39206664474).
The public
[`latest.json`](https://github.com/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/blob/portfolio-evidence/repositories/qa-test-automation-frameworks/verity-policy-coverage-eval-framework/latest.json)
now points deterministic scopes to that exact source SHA and records semantic
evaluation as skipped.

The two published bundles were fetched directly from the public
`portfolio-evidence` branch. Every `SHA256SUMS` entry was recomputed against the
retrieved raw bytes, including each record and its manifest. All five files
matched. The manifest digests also match the values in `latest.json`:

| Source run | Scopes and outcomes | Manifest SHA-256 |
|---|---|---|
| `39206484959` | `verity.deterministic-py3.12.15` passed (1,710 executed, 0 failed, 5 skipped); `verity.deterministic-py3.13.16` passed (1,710 executed, 0 failed, 5 skipped); `verity.failure-control-py3.12.15` recorded the expected one-test failure while the workflow succeeded. | `2705c454372a5849e3e8f252c1f81b9f852a125bfac701a662fb9081174255c8` |
| `39206484972` | `verity.semantic-evaluation` skipped because no provider key was configured. No live evaluation occurred. | `ac6814ae06389da32ca50766ec2a82db2c6fc788f1873c4f2890cc4064dd8a4d` |

All four retrieved JSON records passed the repository's official validator:

```sh
.venv/bin/python scripts/validate_evidence.py <record.json>
```

The raw records retain `publication.disposition: pending` because they are
immutable and emitted before the trusted publisher completes. Their reason
identifies this timing; the completed trusted publisher and the entries in the
public latest index establish subsequent durable publication. This distinction
is described in `docs/native-execution-evidence.md`.

The captured latest index, both manifests, checksum lists, raw records, and
verification output are retained locally under the ignored
`work/roadmap-evidence/e03-verity-post-merge-2026-10-19/` directory. The
publisher run confirms retention enforcement executed and the bundle is
currently retrievable. This single point-in-time verification does not prove
continued retention over the roadmap's observation period or recurring natural
schedule operation; E03 and P03 remain open for those reasons.
