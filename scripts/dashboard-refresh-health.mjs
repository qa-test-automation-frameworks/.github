import './check-runtime.mjs';

const SCHEDULE_FRESHNESS_HOURS = 36;

export function classifyRefreshHealth(workflow, scheduledRuns, now = Date.now()) {
  if (!workflow || workflow.status === 'unavailable') return { status: 'unavailable', lastScheduledRun: null };
  if (workflow.state !== 'active') return { status: workflow.state ?? 'unavailable', lastScheduledRun: null };
  const latest = [...(scheduledRuns ?? [])]
    .filter((run) => run.event === 'schedule' && run.status === 'completed')
    .sort((a, b) => Date.parse(b.completed_at ?? b.updated_at) - Date.parse(a.completed_at ?? a.updated_at))[0];
  if (!latest) return { status: 'never-run', lastScheduledRun: null };
  const completedAt = latest.completed_at ?? latest.updated_at;
  const ageHours = (now - Date.parse(completedAt)) / 3_600_000;
  const status = latest.conclusion !== 'success'
    ? 'failed'
    : !Number.isFinite(ageHours) || ageHours < 0
      ? 'invalid-time'
      : ageHours > SCHEDULE_FRESHNESS_HOURS
        ? 'stale'
        : 'healthy';
  return {
    status,
    checkedAt: completedAt,
    ageHours,
    runId: String(latest.id),
    url: latest.html_url,
    conclusion: latest.conclusion,
  };
}
