# Operation and maintenance decisions

`scripts/operation-summary.mjs` turns a finite, saved GitHub Actions run/job snapshot into a JSON summary and a Markdown report. It reads local files only. It does not fetch runs, schedule work, or infer current GitHub prices.

```sh
node scripts/operation-summary.mjs \
  --input portfolio/operation-samples/window.json \
  --json-out portfolio/operation-samples/summary.json \
  --markdown-out docs/operation-cost-decisions-report.md
```

When a triage file is available, pass it with `--triage path/to/triage.json`.

The input follows [the sample schema](../portfolio/operation-sample.schema.json). It preserves repository, workflow, run, attempt, job, source SHA, and URL identities. The CLI records SHA-256 hashes of the exact input bytes. Repeated identical run/job entries are deduplicated; conflicting duplicates are rejected. Retries remain separate attempts, and recovery after a failed or cancelled first attempt is reported separately.

An optional triage file is a JSON array. Each entry has `repository`, `workflowFile`, `run_id`, `attempt`, `job_id` (or `null` for a run-level failure), `classification`, and `reason`. The classification values are exactly `product`, `infrastructure`, `policy`, `expected-control`, and `unclassified`.

Job duration percentiles use the nearest-rank method and include their sample count. The sum of job elapsed time can include overlapping jobs; it is elapsed time across jobs, not CPU time or billed minutes. Missing timestamps and opportunity denominators stay unknown. A partial capture is marked incomplete. Failure triage accepts only `product`, `infrastructure`, `policy`, `expected-control`, or `unclassified`, keyed by repository, workflow, run, job, and attempt with a reason. With no triage file, incident classification is unknown rather than zero.

Currency cost is null unless the input includes a dated, explicit observed billing amount and its source. A rate by itself is not multiplied by elapsed workflow time. Any engineering decision is supplied explicitly with its rationale and source; the report does not claim savings or reliability improvements without matched measurements.

The dashboard workflow runs the offline unit suite in GitHub CI. No recurring workflow or new cadence was added. Any future read-only fetch wrapper must allow only configured organization repositories and workflows, stop at 100 runs per workflow/window, and mark a truncated page incomplete.

The retained [October 22 report](history/operation-cost-decisions-report-2026-10-22.md) is based on one completed scheduled dashboard run. Its input snapshot and dashboard artifact hashes are recorded in the accompanying JSON summary. The broader schedule observation remains open through October 27; the report does not assign the four unaccounted opportunities to specific slots or call them failures.
