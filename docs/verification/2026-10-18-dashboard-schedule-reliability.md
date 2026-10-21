# Dashboard schedule reliability follow-up — 2026-10-18

## Observation

The dashboard's configured `04:37 UTC` schedule was re-registered on October 17 by commit `1dc65d9244757897d3be1c0a4fa25196c336c358`. The workflow is active, exists on the repository's default branch, and repository Actions are enabled. The last `schedule` event remains run `34332182917` from September 9; no schedule event appeared after the October 18 expected run. The schedule actor is the active `prayagv` account. Another portfolio repository's independent scheduled workflow completed at `2026-10-18T04:09:43Z`; that does not prove the dashboard's schedule is healthy.

The precise cause is not established. GitHub documents that scheduled runs can be delayed or dropped under high Actions load and that a schedule can stop when its associated actor is suspended, deleted, or deprovisioned. The current repository and actor checks do not show those conditions. See [GitHub Actions troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) and the [schedule event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## Change and verification boundary

This branch moved the existing schedule from `04:37 UTC` to `05:17 UTC` and thereby re-registered it at a different time. It created no additional workflow. That was a diagnostic reliability change, not proof that the schedule problem was fixed.

After that merge, inspect the next natural event and the public dashboard's generated timestamp/refresh disposition. If no scheduled event occurs, preserve the failure as an operational blocker; do not substitute push or manual-dispatch runs for scheduled evidence.

## Revised P03 acceptance — 2026-10-20

The portfolio owner replaced the former 28-calendar-day target with a bounded seven-day accelerated observation. This cadence change is intended to evaluate the dashboard's natural schedule, refresh, validation, and Pages publication reliability. The workflow refreshes the central dashboard; it does not rerun all five frameworks' test suites, and the result must not be described as seven-day framework or product stability.

- Schedule: `17 */4 * * *` (6 expected natural scheduled runs per UTC day, at minute 17 every four hours).
- Start the clock at the first successful natural `schedule` run on the default branch after this cadence change is merged. Record its exact event, run ID, start/completion times, commit, validation result, and deployment result. Changes made in a pull request, push-triggered runs, and manual dispatches do not count.
- Observe at least 168 elapsed hours and all 42 expected four-hour schedule slots. Allow runs triggered within the interval to complete before closeout.
- Pass threshold: at least 40/42 scheduled slots (≥95%) must complete both dashboard validation and Pages deployment successfully; every UTC day in the seven-day interval must contain at least one fully successful natural run; there must be no two consecutive failed/missing slots; and every failure or miss must have a documented cause and disposition.
- At closeout, independently verify the schedule event history and the public dashboard snapshot. A workflow run alone is insufficient if its validation or deployment failed. Keep the dashboard's existing schedule-health semantics explicit and do not count a manually refreshed snapshot as a scheduled observation.
- If GitHub delays or drops scheduled runs, those slots count as missed. GitHub documents this limitation; the observed success rate therefore measures the end-to-end schedule and publishing path under the repository's actual hosted conditions.

The former 28-day threshold is superseded by this dated decision. The seven-day result supports only a bounded claim about central dashboard operations across one weekly cycle; it does not establish month-long continuity, independent failure-domain coverage, or stability of the five framework test suites.

## Live observation checkpoint — 2026-10-21 11:45 UTC

The seven-day window began with natural run [#214](https://github.com/qa-test-automation-frameworks/.github/actions/runs/39431553881) at `2026-10-20T13:34:20Z`; the earliest closeout remains `2026-10-27T13:34:20Z`. Four natural successes (#214–#217) are confirmed. The latest is [#217](https://github.com/qa-test-automation-frameworks/.github/actions/runs/39546200133), started at `2026-10-21T04:50:10Z`. At this check, the nominal `08:17Z` slot is unresolved and is not counted; `12:17Z` is the next nominal slot. A push-triggered dashboard refresh does not add a schedule sample. See the [append-only operating log](../PORTFOLIO_OPERATION_LOG.md) for the run-level record and acceptance criteria.
