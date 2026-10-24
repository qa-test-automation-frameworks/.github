export function summarizeScheduledTriage(issues, now = Date.now()) {
  if (!Array.isArray(issues) || !Number.isFinite(now)) throw new Error('Invalid scheduled triage input.');
  const open = issues.filter((issue) => !issue.pull_request && issue.state === 'open');
  const rows = open.map((issue) => {
    const time = Date.parse(issue.created_at);
    if (!Number.isFinite(time) || time > now || !Number.isInteger(issue.number) || issue.number < 1) throw new Error('Invalid scheduled triage issue metadata.');
    return { number: issue.number, url: issue.html_url, title: issue.title, openedAt: issue.created_at };
  }).sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  const oldestOpenedAt = rows[0]?.openedAt ?? null;
  const oldestAgeDays = oldestOpenedAt ? (now - Date.parse(oldestOpenedAt)) / 86_400_000 : null;
  return { status: 'available', openCount: rows.length, oldestOpenedAt, oldestAgeDays, overdue: oldestAgeDays !== null && oldestAgeDays > 7, issues: rows };
}

export async function fetchScheduledTriage(repository, github, now = Date.now()) {
  try {
    const issues = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await github(`/repos/qa-test-automation-frameworks/${repository}/issues?state=open&labels=scheduled-failure&sort=created&direction=asc&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Issue query did not return a list.');
      for (const issue of batch) {
        if (!issue.pull_request && issue.html_url !== `https://github.com/qa-test-automation-frameworks/${repository}/issues/${issue.number}`) throw new Error('Issue URL does not match its repository.');
      }
      issues.push(...batch);
      if (batch.length < 100) return summarizeScheduledTriage(issues, now);
    }
    throw new Error('Scheduled triage query exceeded its 1000-issue bound.');
  } catch (error) {
    return { status: 'unavailable', reason: error.message, openCount: null, oldestOpenedAt: null, oldestAgeDays: null, overdue: null, issues: [] };
  }
}
