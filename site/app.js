const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return 'Not measured';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
};

const link = (label, href) => {
  if (!href) return '';
  const anchor = document.createElement('a');
  anchor.textContent = label;
  anchor.href = href;
  return anchor;
};

const response = await fetch('data/portfolio.json', { cache: 'no-store' });
if (!response.ok) throw new Error(`Portfolio data returned ${response.status}`);
const data = await response.json();

const generatedAt = new Date(data.generatedAt);
const ageHours = (Date.now() - generatedAt.getTime()) / 3_600_000;
const freshnessState = document.querySelector('#freshness-state');
freshnessState.textContent = ageHours <= 36 ? 'Evidence current' : 'Evidence snapshot is stale';
freshnessState.classList.add(ageHours <= 36 ? 'success' : 'failure');
document.querySelector('#generated-at').textContent = generatedAt.toLocaleString();

const repositories = new Map(data.repositories.map((repository) => [repository.name, repository]));
const reviewOrder = document.querySelector('#review-order');
for (const name of data.recommendedReviewOrder) {
  const repository = repositories.get(name);
  if (!repository) continue;
  const item = document.createElement('li');
  item.append(link(repository.label, repository.url));
  const detail = document.createElement('span');
  detail.textContent = `${repository.reviewMinutes} minute review`;
  item.append(detail);
  reviewOrder.append(item);
}

const rows = document.querySelector('#repository-rows');
for (const repository of data.repositories) {
  const row = document.createElement('tr');

  const name = document.createElement('td');
  name.append(link(repository.label, repository.url));
  row.append(name);

  const status = document.createElement('td');
  const statusLabel = repository.status === 'work-in-progress' ? 'WIP' : 'Review ready';
  status.textContent = statusLabel;
  status.className = `status ${repository.status}`;
  row.append(status);

  const ci = document.createElement('td');
  ci.textContent = repository.workflow?.conclusion ?? 'No CI';
  ci.className = `status ${repository.workflow?.conclusion ?? 'missing'}`;
  if (repository.workflow?.url) {
    const ciLink = link(ci.textContent, repository.workflow.url);
    ci.textContent = '';
    ci.append(ciLink);
  }
  row.append(ci);

  const runtime = document.createElement('td');
  runtime.textContent = repository.workflow
    ? `${formatDuration(repository.workflow.medianDurationSeconds)} (n=${repository.workflow.sampleSize})`
    : 'Not measured';
  row.append(runtime);

  const release = document.createElement('td');
  if (repository.release) release.append(link(repository.release.tag, repository.release.url));
  else release.textContent = 'Unreleased';
  row.append(release);

  const activity = document.createElement('td');
  activity.textContent = `${repository.commitCount} commits · ${repository.pullRequestCount} PRs`;
  row.append(activity);

  const evidence = document.createElement('td');
  evidence.className = 'evidence-links';
  for (const [label, href] of [
    ['Report', repository.reportUrl],
    ['Docs', repository.docsUrl],
    ['Screenshot', repository.screenshotUrl],
  ]) {
    const evidenceLink = link(label, href);
    if (evidenceLink) evidence.append(evidenceLink);
  }
  row.append(evidence);

  rows.append(row);
}
