# Quality Operating Model

The portfolio uses one decision loop across five quality surfaces:

1. **Risk intake:** identify the user, data, reliability, security, latency, or model-trust risk and its failure cost.
2. **Layer selection:** choose the cheapest layer that proves the behavior: API/contract before browser, controlled load before external load, hermetic detector before provider-backed evaluation.
3. **Gate ownership:** the repository owning the signal owns the workflow, threshold, failure artifact, and reviewer documentation.
4. **Exceptions:** every quarantine or unavailable state has an owner, reason, expiry, and visible limitation. An exception never becomes a passing result.
5. **Evidence retention:** a current result records the exact source SHA, workflow run, target, scope, result counts, report, and retention period.
6. **Lifecycle:** a capability is deprecated when its target, tool, or signal no longer earns its execution and maintenance cost; the replacement and removal date belong in the changelog.

The five repositories implement different layers of this loop. The organization profile and dashboard show the current evidence state; they do not substitute for repository-owned proof.

## Scheduled failure follow-up

Each scheduled main-branch failure opens or updates one issue named for its
workflow. Repeated failures add evidence to that issue; the next successful
scheduled run records recovery and closes it. Classify and disposition failures
within seven days. The dashboard shows open counts, oldest age, and overdue
issues for the five frameworks, shared reference application, and dashboard.
Triage is an operating signal; it does not change an execution result.

The reusable triage workflow has a dispatch-only self-test with its own
`triage-selftest` label. It checks initial success, issue creation, deduplication,
and recovery using a unique run-specific title.
