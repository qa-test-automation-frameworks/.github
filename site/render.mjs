export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const safeHref = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const stateClass = (value) => String(value ?? 'unavailable').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const anchor = (label, href) => {
  const safe = safeHref(href);
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(label)}</a>` : escapeHtml(label);
};
const timestamp = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
};

function evidenceDetails(repository) {
  const scopes = repository.evidenceRecords ?? [];
  const required = repository.evidenceSummary?.requiredCount ?? 0;
  const fresh = repository.evidenceSummary?.freshRequiredCount ?? 0;
  const controlPairs = repository.evidenceSummary?.controlPairs ?? [];
  const summary = scopes.length
    ? `${fresh}/${required} required scopes fresh · ${scopes.length} scope statuses${controlPairs.length ? ` · ${controlPairs.filter((pair) => pair.state === 'verified').length}/${controlPairs.length} failure controls verified` : ''}`
    : 'No verified published scope records';
  const rows = scopes.map((scope) => {
    const reasons = (scope.reasons ?? []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
    const limitations = (scope.limitations ?? []).length
      ? `<p>Limitations: ${escapeHtml(scope.limitations.join(' '))}</p>`
      : '';
    return `<li><strong>${escapeHtml(scope.id)}</strong> — <span class="status ${stateClass(scope.state)}">${escapeHtml(scope.state)}</span>; ${escapeHtml(scope.evidenceClass)}; ${escapeHtml(scope.freshnessPolicy)}; completed ${escapeHtml(timestamp(scope.completedAt))}<ul>${reasons}</ul>${limitations}</li>`;
  }).join('');
  const controlRows = controlPairs.map((pair) =>
    `<li><strong>${escapeHtml(pair.label)}</strong> — <span class="status ${stateClass(pair.state)}">${escapeHtml(pair.state)}</span>; ${escapeHtml(pair.message)} <span>(raw: ${escapeHtml(pair.rawScopeId)}; verifier: ${escapeHtml(pair.verifierScopeId)})</span></li>`,
  ).join('');
  const controls = controlRows
    ? `<h4>Verified failure controls</h4><ul class="scope-list">${controlRows}</ul>`
    : '';
  return `<details><summary>${escapeHtml(summary)}</summary>${controls}${rows ? `<ul class="scope-list">${rows}</ul>` : '<p>No public durable index is available.</p>'}</details>`;
}

export function renderRepositoryRows(repositories) {
  return repositories.map((repository) => {
    const workflow = repository.workflow;
    const attempt = workflow?.latestAttempt;
    const attemptLabel = attempt
      ? `${anchor(`#${attempt.runId} · attempt ${attempt.attempt}`, attempt.url)}<br>${escapeHtml(attempt.event)} · ${escapeHtml(attempt.status)}${attempt.conclusion ? ` · ${escapeHtml(attempt.conclusion)}` : ''}<br>${workflow.currentCodeCompatibility === true ? 'Source matches current default branch' : 'Source differs from current code or compatibility is unknown'}<br><time datetime="${escapeHtml(attempt.createdAt)}">${escapeHtml(timestamp(attempt.createdAt))}</time>`
      : 'No trusted default-branch run';
    const execution = attempt?.status === 'in_progress' || attempt?.status === 'queued'
      ? attempt.status
      : attempt?.conclusion ?? 'unavailable';
    const lastSuccess = workflow?.lastSuccess
      ? (() => {
          const run = workflow.lastSuccess;
          const normalized = Object.hasOwn(run, 'lastSuccessTimestamp');
          const at = normalized ? run.lastSuccessTimestamp : run.completedAt ?? run.updatedAt ?? null;
          const label = normalized
            ? run.lastSuccessTimestampLabel
            : run.completedAt ? 'Completed' : run.updatedAt ? 'Last updated' : null;
          const date = at
            ? `<time datetime="${escapeHtml(at)}">${escapeHtml(timestamp(at))}</time>`
            : 'Not recorded';
          return `${anchor(`#${run.runId} · attempt ${run.attempt}`, run.url)}<br>${label ? `${escapeHtml(label)} ` : ''}${date}`;
        })()
      : 'No successful run found';
    const release = repository.release
      ? (() => {
          const label = repository.release.historical === true
            ? `Historical release ${repository.release.tag}`
            : repository.release.historical === false
              ? `Current release ${repository.release.tag}`
              : `Published release ${repository.release.tag}`;
          const sourceSha = repository.currentSha;
          const proofUrl =
            /^[A-Za-z0-9_.-]+$/u.test(repository.name ?? '') &&
            /^[a-f0-9]{40}$/u.test(sourceSha ?? '')
              ? `https://github.com/qa-test-automation-frameworks/${repository.name}/commit/${sourceSha}`
              : null;
          return `${anchor(label, repository.release.url)}${proofUrl ? `<br>${anchor(`Current proof: ${sourceSha.slice(0, 7)}`, proofUrl)}` : ''}`;
        })()
      : 'Unreleased';
    const links = [
      ['Verification', repository.verificationUrl],
      ['Limitations', repository.limitationsUrl],
      ['Report', repository.reportUrl],
      ['Docs', repository.docsUrl],
      ['Screenshot', repository.screenshotUrl],
    ].map(([label, href]) => safeHref(href) ? anchor(label, href) : '').filter(Boolean).join(' ');
    return `<tr id="repo-${escapeHtml(repository.name)}">
      <td>${anchor(repository.label, repository.url)}</td>
      <td class="status ${stateClass(repository.evidenceState)}">${escapeHtml(repository.evidenceState)}</td>
      <td>${attemptLabel}</td>
      <td class="status ${stateClass(execution)}">${escapeHtml(execution)}</td>
      <td class="status ${stateClass(repository.publication?.status)}">${escapeHtml(repository.publication?.status ?? 'unavailable')}</td>
      <td>${lastSuccess}</td>
      <td>${evidenceDetails(repository)}</td>
      <td>${release}</td>
      <td>${Number(repository.commitCount ?? 0)} commits · ${Number(repository.pullRequestCount ?? 0)} PRs</td>
      <td class="evidence-links">${links}</td>
    </tr>`;
  }).join('\n');
}

export function renderReviewOrder(repositories, order) {
  const byName = new Map(repositories.map((repository) => [repository.name, repository]));
  return order.map((name) => byName.get(name)).filter(Boolean).map((repository) =>
    `<li>${anchor(repository.label, repository.url)}<span>${escapeHtml(repository.reviewMinutes)} minute review</span></li>`,
  ).join('\n');
}

export function renderScheduledTriage(data) {
  const repositories = [...(data.repositories ?? []), ...(data.triageOnlyRepositories ?? [])];
  return '<h2>Scheduled failure triage</h2><p>Scheduled failures need a disposition within seven days.</p><ul>' + repositories.map((repository) => {
    const triage = repository.triage;
    if (triage?.status !== 'available') return `<li>${escapeHtml(repository.label)}: triage unavailable</li>`;
    const age = triage.oldestAgeDays === null ? '' : `; oldest ${triage.oldestAgeDays.toFixed(1)} days`;
    const state = triage.overdue ? '; overdue' : '';
    const issues = triage.issues.map((issue) => anchor(`#${issue.number}: ${issue.title}`, issue.url)).join(', ');
    return `<li>${escapeHtml(repository.label)}: ${triage.openCount} open${age}${state}${issues ? ` — ${issues}` : ''}</li>`;
  }).join('') + '</ul>';
}

export function renderDashboard(template, data) {
  const generatedAt = Number.isFinite(Date.parse(data.generatedAt))
    ? `${new Date(data.generatedAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC')}`
    : 'Refresh time unavailable';
  const freshness = data.refresh?.status === 'available'
    ? 'Refresh completed; inspect evidence and publication states per repository'
    : 'Refresh unavailable; showing the last static snapshot';
  return template
    .replace(/(<section id="scheduled-triage"[^>]*>)[\s\S]*?(<\/section>)/, `$1${renderScheduledTriage(data)}$2`)
    .replace(/(<span id="freshness-state"[^>]*>).*?(<\/span>)/, `$1${escapeHtml(freshness)}$2`)
    .replace(/(<span id="generated-at"[^>]*>).*?(<\/span>)/, `$1${escapeHtml(generatedAt)}$2`)
    .replace(/(<span id="refresh-schedule-state"[^>]*>).*?(<\/span>)/, `$1Scheduled refresh: ${escapeHtml(data.refresh?.schedule?.status ?? 'unavailable')}$2`)
    .replace(/(<ol id="review-order" class="review-order">)[\s\S]*?(<\/ol>)/, `$1\n${renderReviewOrder(data.repositories, data.recommendedReviewOrder)}\n$2`)
    .replace(/(<tbody id="repository-rows">)[\s\S]*?(<\/tbody>)/, `$1\n${renderRepositoryRows(data.repositories)}\n$2`);
}
