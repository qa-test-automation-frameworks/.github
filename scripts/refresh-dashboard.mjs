import './check-runtime.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { normalizeRunSummary, publicationState, summarizeEvidence } from './dashboard-state.mjs';
import { validateEvidence } from './evidence-contract.mjs';
import { classifyRefreshHealth } from './dashboard-refresh-health.mjs';
import { renderDashboard } from '../site/render.mjs';

const owner = 'qa-test-automation-frameworks';
const token = process.env.GITHUB_TOKEN;
if (!token) {
  throw new Error('GITHUB_TOKEN is required to refresh portfolio evidence.');
}
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  Authorization: `Bearer ${token}`,
};

const definition = JSON.parse(
  await readFile(new URL('../portfolio/repositories.json', import.meta.url), 'utf8'),
);

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

const trustedEvents = new Set(['push', 'schedule', 'workflow_dispatch']);
const freshnessPolicies = JSON.parse(
  await readFile(new URL('../portfolio/evidence/freshness-policies.json', import.meta.url), 'utf8'),
).policies;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function workflowMetrics(repository, defaultBranch, currentSha) {
  if (!repository.workflow) return { status: 'not-configured', latestAttempt: null, lastSuccess: null };
  const now = Date.now();
  try {
    const encodedWorkflow = encodeURIComponent(repository.workflow);
    const base = `/repos/${owner}/${repository.name}/actions/workflows/${encodedWorkflow}/runs?branch=${encodeURIComponent(defaultBranch)}&per_page=20`;
    const [recent, completed] = await Promise.all([
      github(base),
      github(`${base}&status=completed`),
    ]);
    const trusted = (recent.workflow_runs ?? []).filter(
      (run) => run.head_branch === defaultBranch && trustedEvents.has(run.event),
    );
    trusted.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.run_attempt - a.run_attempt);
    const completedTrusted = (completed.workflow_runs ?? []).filter(
      (run) => run.head_branch === defaultBranch && trustedEvents.has(run.event) && run.status === 'completed',
    );
    const latest = trusted[0];
    const successes = completedTrusted
      .filter((run) => run.conclusion === 'success')
      .map((run) => normalizeRunSummary(run, now))
      .filter((run) => run.lastSuccessTimestamp)
      .sort((a, b) => Date.parse(b.lastSuccessTimestamp) - Date.parse(a.lastSuccessTimestamp));
    const durations = completedTrusted
      .map((run) => {
        const normalized = normalizeRunSummary(run, now);
        if (!normalized || normalized.lastSuccessTimestampLabel !== 'Completed') return null;
        return Date.parse(normalized.completedAt) - Date.parse(normalized.startedAt ?? normalized.createdAt);
      })
      .filter((duration) => Number.isFinite(duration) && duration >= 0)
      .sort((a, b) => a - b);
    return {
      status: latest ? 'available' : 'no-run',
      latestAttempt: normalizeRunSummary(latest, now),
      lastSuccess: successes[0] ?? null,
      conclusion: latest?.conclusion ?? null,
      url: latest?.html_url ?? null,
      runId: latest ? String(latest.id) : null,
      attempt: latest?.run_attempt ?? null,
      headSha: latest?.head_sha ?? null,
      branch: latest?.head_branch ?? defaultBranch,
      event: latest?.event ?? null,
      state: latest?.status ?? 'unavailable',
      updatedAt: latest?.updated_at ?? null,
      currentCodeCompatibility: latest ? latest.head_sha === currentSha : false,
      medianDurationSeconds: durations.length ? Math.round(durations[Math.floor(durations.length / 2)] / 1000) : null,
      sampleSize: durations.length,
    };
  } catch (error) {
    return { status: 'unavailable', reason: error.message.match(/returned (\d+)/)?.[1] ? `GitHub API returned ${error.message.match(/returned (\d+)/)[1]}` : 'GitHub API request failed', latestAttempt: null, lastSuccess: null };
  }
}

async function rawBytes(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public evidence source returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Public evidence object exceeds the 5 MiB safety limit');
  return bytes;
}

async function durableEvidence(repository) {
  const repositoryPath = `${owner}/${repository.name}`;
  const rawRoot = `https://raw.githubusercontent.com/${repositoryPath}/portfolio-evidence/`;
  const latestPath = `repositories/${repositoryPath}/latest.json`;
  try {
    const latestBytes = await rawBytes(`${rawRoot}${latestPath}`);
    if (!latestBytes) return { indexStatus: 'not-published', index: null, records: [], reason: 'No public portfolio-evidence branch index exists.' };
    const index = JSON.parse(latestBytes.toString('utf8'));
    if (index.schemaVersion !== 1 || index.repository !== repositoryPath || !index.scopes || typeof index.scopes !== 'object') {
      throw new Error('Latest evidence index has an unsupported or mismatched contract.');
    }
    const entries = Object.entries(index.scopes);
    if (entries.length > 500) throw new Error('Latest index exceeds the 500-scope safety limit.');
    const records = await Promise.all(entries.map(async ([scopeId, pointer]) => {
      const expectedPrefix = `repositories/${repositoryPath}/runs/`;
      if (typeof pointer.bundle !== 'string' || !pointer.bundle.startsWith(expectedPrefix) || pointer.bundle.includes('..')) {
        throw new Error(`Unsafe bundle path for ${scopeId}.`);
      }
      const manifestBytes = await rawBytes(`${rawRoot}${pointer.bundle}/manifest.json`);
      if (!manifestBytes || sha256(manifestBytes) !== pointer.manifestSha256) throw new Error(`Bundle manifest checksum failed for ${scopeId}.`);
      const manifest = JSON.parse(manifestBytes.toString('utf8'));
      if (manifest.schemaVersion !== 1 || manifest.repository !== repositoryPath || String(manifest.run?.id) !== String(pointer.runId) || manifest.run?.attempt !== pointer.attempt || manifest.run?.sourceSha !== pointer.sourceSha) {
        throw new Error(`Bundle source identity failed for ${scopeId}.`);
      }
      const entry = manifest.records?.find((item) => item.scope === scopeId);
      if (!entry || !/^records\/[a-f0-9]{24}\.json$/.test(entry.path)) throw new Error(`Bundle record path is missing or unsafe for ${scopeId}.`);
      const recordBytes = await rawBytes(`${rawRoot}${pointer.bundle}/${entry.path}`);
      if (!recordBytes || sha256(recordBytes) !== entry.sha256) throw new Error(`Evidence checksum failed for ${scopeId}.`);
      const record = JSON.parse(recordBytes.toString('utf8'));
      const errors = validateEvidence(record);
      if (errors.length) throw new Error(`Evidence record is invalid for ${scopeId}: ${errors.join('; ')}`);
      if (record.repository !== repositoryPath || record.scope.id !== scopeId || record.workflow.runId !== String(pointer.runId) || record.workflow.attempt !== pointer.attempt || record.sourceSha !== pointer.sourceSha || record.workflow.branch !== 'main' || !trustedEvents.has(record.workflow.trigger)) {
        throw new Error(`Evidence record does not match the latest index for ${scopeId}.`);
      }
      return record;
    }));
    return { indexStatus: 'available', index, records, reason: null };
  } catch (error) {
    return { indexStatus: 'unavailable', index: null, records: [], reason: error.message };
  }
}

const query = `
  query Portfolio($owner: String!) {
    organization(login: $owner) {
      repositories(first: 100) {
        nodes {
          name
          url
          description
          pushedAt
          stargazerCount
          forkCount
          pullRequests { totalCount }
          latestRelease {
            tagName
            name
            url
            publishedAt
            tagCommit { oid }
          }
          defaultBranchRef {
            name
            target {
              ... on Commit {
                oid
                history { totalCount }
              }
            }
          }
        }
      }
    }
  }
`;

async function repositoryMetadata() {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { owner } }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL returned ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (payload.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }
  return new Map(payload.data.organization.repositories.nodes.map((repo) => [repo.name, repo]));
}

async function dashboardScheduleHealth() {
  try {
    const workflow = await github(`/repos/${owner}/.github/actions/workflows/dashboard.yml`);
    const runs = await github(`/repos/${owner}/.github/actions/workflows/dashboard.yml/runs?event=schedule&status=completed&per_page=5`);
    return classifyRefreshHealth({ status: 'available', state: workflow.state }, runs.workflow_runs ?? []);
  } catch (error) {
    return { status: 'unavailable', reason: error.message.match(/returned (\d+)/)?.[1] ? `GitHub API returned ${error.message.match(/returned (\d+)/)[1]}` : 'GitHub API request failed' };
  }
}

const [metadata, scheduleHealth] = await Promise.all([repositoryMetadata(), dashboardScheduleHealth()]);
const repositories = await Promise.all(
  definition.repositories.map(async (repository) => {
    const repo = metadata.get(repository.name);
    if (!repo) throw new Error(`Repository ${repository.name} was not returned by GitHub.`);
    const defaultBranch = repo.defaultBranchRef?.name ?? 'main';
    const currentSha = repo.defaultBranchRef?.target?.oid ?? null;
    const [metrics, durable] = await Promise.all([
      workflowMetrics(repository, defaultBranch, currentSha),
      durableEvidence(repository),
    ]);
    const evidence = summarizeEvidence(durable.records, {
      repository: `${owner}/${repository.name}`,
      currentSha,
      now: Date.now(),
      policies: freshnessPolicies,
      requiredScopeIds: repository.requiredScopeIds,
      controlPairs: repository.controlPairs ?? [],
    });
    const evidenceState = metrics.status === 'available' ? evidence.state : 'evidence-unavailable';
    return {
      ...repository,
      url: repo.url,
      description: repo.description,
      defaultBranch,
      currentSha,
      pushedAt: repo.pushedAt,
      pullRequestCount: repo.pullRequests.totalCount,
      release: repo.latestRelease
        ? {
            tag: repo.latestRelease.tagName,
            name: repo.latestRelease.name,
            url: repo.latestRelease.url,
            publishedAt: repo.latestRelease.publishedAt,
            sourceSha: repo.latestRelease.tagCommit?.oid ?? null,
            historical: repo.latestRelease.tagCommit?.oid && currentSha
              ? repo.latestRelease.tagCommit.oid !== currentSha
              : null,
          }
        : null,
      commitCount: repo.defaultBranchRef?.target?.history?.totalCount ?? 0,
      stars: repo.stargazerCount,
      forks: repo.forkCount,
      workflow: metrics,
      evidenceState,
      evidenceSummary: { ...evidence, state: evidenceState },
      evidenceRecords: evidence.scopes,
      publication: {
        status: publicationState(durable.index, durable.indexStatus, metrics.latestAttempt),
        indexStatus: durable.indexStatus,
        reason: durable.reason,
        scopeCount: durable.records.length,
        latestAttemptRunId: metrics.latestAttempt?.runId ?? null,
        latestAttemptAttempt: metrics.latestAttempt?.attempt ?? null,
      },
    };
  }),
);

const output = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  organization: owner,
  refresh: {
    status: repositories.some((repository) => repository.workflow?.status === 'unavailable' || repository.publication.indexStatus === 'unavailable') ? 'unavailable' : 'available',
    source: 'GitHub API and checksummed public portfolio-evidence branches',
    unavailableRepositories: repositories.filter((repository) => repository.workflow?.status === 'unavailable' || repository.publication.indexStatus === 'unavailable').map(({ name }) => name),
    schedule: scheduleHealth,
  },
  recommendedReviewOrder: definition.recommendedReviewOrder,
  repositories,
};

await writeFile(
  new URL('../site/data/portfolio.json', import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`,
);

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const indexUrl = new URL('../site/index.html', import.meta.url);
const indexTemplate = await readFile(indexUrl, 'utf8');
await writeFile(indexUrl, renderDashboard(indexTemplate, output));
