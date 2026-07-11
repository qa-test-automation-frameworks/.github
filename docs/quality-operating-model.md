# Quality Operating Model

The portfolio uses one decision loop across five quality surfaces:

1. **Risk intake:** identify the user, data, reliability, security, latency, or model-trust risk and its failure cost.
2. **Layer selection:** choose the cheapest layer that proves the behavior: API/contract before browser, controlled load before external load, hermetic detector before provider-backed evaluation.
3. **Gate ownership:** the repository owning the signal owns the workflow, threshold, failure artifact, and reviewer documentation.
4. **Exceptions:** every quarantine or unavailable state has an owner, reason, expiry, and visible limitation. An exception never becomes a passing result.
5. **Evidence retention:** a current result records the exact source SHA, workflow run, target, scope, result counts, report, and retention period.
6. **Lifecycle:** a capability is deprecated when its target, tool, or signal no longer earns its execution and maintenance cost; the replacement and removal date belong in the changelog.

The five repositories implement different layers of this loop. The organization profile and dashboard show the current evidence state; they do not substitute for repository-owned proof.
