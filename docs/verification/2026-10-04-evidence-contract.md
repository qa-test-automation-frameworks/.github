# E01 portable evidence contract

Version3 JSON Schema, semantic checker, freshness policies and22 synthetic
fixtures describe all five frameworks without unifying their denominators.
Unknown counts stay null; k6 uses sampled measurements rather than invented tests.
Historical attestations remain separate. The version2 dashboard is unmigrated.

Actual Node24.21.0 test runner:32 passed, zero failures/skips, including two
existing dashboard controls and30 contract controls. CLI accepts the positive
fixture and returns1 for empty collection falsely marked passed. Independent
Python jsonschema4.10.3 Draft202012 accepts all positive fixtures;19 of22 fixtures
are structurally valid and three are structurally invalid. Remaining negatives
exercise semantics beyond the schema. Actionlint1.7.7 passes both changed workflows
with optional ShellCheck/Pyflakes disabled. Native logs and exact source/fixture
hashes are retained in evidence/2026-10-04-evidence-contract.

Controls cover failure with successful publication, failed publication with passed
execution, credential skip, unavailable data, empty collection, missing/duplicate
shards, cancellation/in-progress, stale/future/invalid calendar time, unsupported
schema, unsafe URLs, historical attestation, retry inflation, missing checksum,
invented freshness policy and wrong run identity. All fixtures are synthetic;
none certifies current framework results.

The active Documentation workflow now runs these controls under.nvmrc. Portfolio
dashboard also includes them but is disabled_inactivity in GitHub's inspected
API state. New-revision remote execution must be checked separately; no scheduled
refresh/deployment is claimed. Next: E02 native emitters, E03 durable publication
and E04 dashboard ingestion/operational checks. No threshold or exception changed.

## Native remote execution

Exactb0a347750fa2826cdd6b681107b7f1391d8da02b
[Documentation37206212278](https://github.com/qa-test-automation-frameworks/.github/actions/runs/37206212278)
completed successfully. Native log records30 contract cases passed, zero failed/
skipped under the selected Node runtime, then the local claim/link check passed.
The two existing dashboard controls were run locally in the32-case total, not by
this remote documentation job. Native remote metadata/log are retained separately
from local source/fixture hashes. Dashboard schedule remains disabled; this proves
E01 contract execution only, not E02 emitters or E03–E04 publication/ingestion.
