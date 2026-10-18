# Dashboard schedule reliability follow-up — 2026-10-18

## Observation

The dashboard's configured `04:37 UTC` schedule was re-registered on October 17 by commit `1dc65d9244757897d3be1c0a4fa25196c336c358`. The workflow is active, exists on the repository's default branch, and repository Actions are enabled. The last `schedule` event remains run `34332182917` from September 9; no schedule event appeared after the October 18 expected run. The schedule actor is the active `prayagv` account. Another portfolio repository's independent scheduled workflow completed at `2026-10-18T04:09:43Z`; that does not prove the dashboard's schedule is healthy.

The precise cause is not established. GitHub documents that scheduled runs can be delayed or dropped under high Actions load and that a schedule can stop when its associated actor is suspended, deleted, or deprovisioned. The current repository and actor checks do not show those conditions. See [GitHub Actions troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) and the [schedule event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## Change and verification boundary

This branch moves the existing daily schedule from `04:37 UTC` to `05:17 UTC` and thereby re-registers it at a different time. It creates no additional workflow or recurring job. This is a diagnostic reliability change, not proof that the schedule problem is fixed. A successful genuine `schedule` event on the default branch is still required before the dashboard can report a fresh scheduled run or the P03 28-day history can begin. Push, pull-request, and manual-dispatch runs do not substitute for that event.

After merge, inspect the next natural event and the public dashboard's generated timestamp/refresh disposition. If no scheduled event occurs, preserve the failure as an operational blocker; do not repeatedly alter the cron or manually dispatch to make the 28-day criterion appear satisfied.
