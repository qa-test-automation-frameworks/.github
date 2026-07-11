# Portfolio Evidence Standard

Every framework card must distinguish capability from current proof. The dashboard is a scheduled snapshot of public GitHub data, not a real-time monitoring service.

## Evidence states

- `review-ready`: the configured fast gate has a completed successful run within 36 hours and the repository exposes a current verification record.
- `evidence-stale`: the latest completed run or verification record is older than 36 hours.
- `evidence-unavailable`: no completed run, no required provenance, or a required report is unavailable.
- `work-in-progress`: the repository is intentionally not presented as review-ready.

## Required verification record

Each target repository maintains `docs/evidence/latest-verification.md`, updated through a normal review or release change. It contains the commit SHA, source workflow/run URL, completion time, target/environment, hermetic versus credentialed scope, commands and result counts, report URL, retention note, and known limitations.

## Evidence classes

Repositories label their proof as `hermetic`, `controlled`, `credentialed`, or `scheduled-live`. A passing deterministic gate does not imply that a live provider, production system, or production-scale workload was validated.

## Dashboard rules

The generator must preserve the selected workflow's immutable run SHA and completion time. The validator rejects a `review-ready` record without a successful completed run, a verification URL, and a valid evidence state. Missing or stale evidence is rendered explicitly in both the static HTML and JavaScript-enhanced view.

## Scope boundary

The `.github` documentation workflow validates this repository's Markdown and local portfolio assets. It does not semantically validate every repository in the organization and must not be described as doing so.
