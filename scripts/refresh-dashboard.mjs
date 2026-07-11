import { readFile, writeFile } from 'node:fs/promises';

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

async function workflowMetrics(repository) {
  let workflow = null;
  if (repository.workflow) {
    const runs = await github(
      `/repos/${owner}/${repository.name}/actions/workflows/${repository.workflow}/runs?branch=main&status=completed&per_page=10`,
    );
    const completed = runs.workflow_runs ?? [];
    const latest = completed[0];
    const durations = completed
      .map((run) => new Date(run.updated_at) - new Date(run.run_started_at ?? run.created_at))
      .filter((duration) => Number.isFinite(duration) && duration >= 0);
    durations.sort((a, b) => a - b);
    workflow = latest
      ? {
          conclusion: latest.conclusion,
          url: latest.html_url,
          runId: latest.id,
          headSha: latest.head_sha,
          branch: latest.head_branch,
          event: latest.event,
          updatedAt: latest.updated_at,
          durationSeconds: Math.round(
            (new Date(latest.updated_at) - new Date(latest.run_started_at ?? latest.created_at)) /
              1000,
          ),
          medianDurationSeconds: durations.length
            ? Math.round(durations[Math.floor(durations.length / 2)] / 1000)
            : null,
          sampleSize: durations.length,
        }
      : null;
  }
  return workflow;
}

async function verificationManifest(repository) {
  try {
    const response = await github(
      `/repos/${owner}/${repository.name}/contents/docs/evidence/latest-verification.json?ref=main`,
    );
    const encoded = Buffer.from(response.content, response.encoding ?? 'base64').toString('utf8');
    return JSON.parse(encoded);
  } catch (error) {
    if (String(error).includes('returned 404')) return null;
    throw error;
  }
}

const FRESHNESS_HOURS = 36;
const evidenceState = (repository, workflow, manifest, now = Date.now()) => {
  if (
    !workflow?.updatedAt ||
    workflow.conclusion !== 'success' ||
    workflow.branch !== 'main' ||
    !repository.verificationUrl ||
    !manifest ||
    manifest.verifiedSha !== workflow.headSha ||
    manifest.workflow?.runId !== workflow.runId ||
    manifest.workflow?.conclusion !== 'success' ||
    manifest.evidenceState !== 'review-ready'
  ) {
    return 'evidence-unavailable';
  }
  const ageHours = (now - new Date(workflow.updatedAt).getTime()) / 3_600_000;
  return ageHours <= FRESHNESS_HOURS ? 'review-ready' : 'evidence-stale';
};

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
          }
          defaultBranchRef {
            name
            target {
              ... on Commit {
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

const metadata = await repositoryMetadata();
const repositories = await Promise.all(
  definition.repositories.map(async (repository) => {
    const repo = metadata.get(repository.name);
    if (!repo) throw new Error(`Repository ${repository.name} was not returned by GitHub.`);
    const [metrics, manifest] = await Promise.all([
      workflowMetrics(repository),
      verificationManifest(repository),
    ]);
    return {
      ...repository,
      url: repo.url,
      description: repo.description,
      defaultBranch: repo.defaultBranchRef?.name ?? 'main',
      pushedAt: repo.pushedAt,
      pullRequestCount: repo.pullRequests.totalCount,
      release: repo.latestRelease
        ? {
            tag: repo.latestRelease.tagName,
            name: repo.latestRelease.name,
            url: repo.latestRelease.url,
            publishedAt: repo.latestRelease.publishedAt,
          }
        : null,
      commitCount: repo.defaultBranchRef?.target?.history?.totalCount ?? 0,
      stars: repo.stargazerCount,
      forks: repo.forkCount,
      workflow: metrics,
      evidenceManifest: manifest,
      evidenceState: evidenceState(repository, metrics, manifest),
    };
  }),
);

const output = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  organization: owner,
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

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return 'Not measured';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
};

const evidenceLinks = (repository) =>
  [
    ['Verification', repository.verificationUrl],
    ['Limitations', repository.limitationsUrl],
    ['Report', repository.reportUrl],
    ['Docs', repository.docsUrl],
    ['Screenshot', repository.screenshotUrl],
  ]
    .filter(([, href]) => href)
    .map(([label, href]) => `<a href="${escapeHtml(href)}">${label}</a>`)
    .join(' ');

const repositoryByName = new Map(repositories.map((repository) => [repository.name, repository]));
const reviewOrderHtml = output.recommendedReviewOrder
  .map((name) => repositoryByName.get(name))
  .filter(Boolean)
  .map(
    (repository) =>
      `<li><a href="${escapeHtml(repository.url)}">${escapeHtml(repository.label)}</a>` +
      `<span>${escapeHtml(repository.reviewMinutes)} minute review</span></li>`,
  )
  .join('\n');

const repositoryRowsHtml = repositories
  .map((repository) => {
    const statusLabel = repository.status === 'work-in-progress' ? 'WIP' : 'Configured';
    const evidenceLabel = repository.evidenceState ?? 'evidence-unavailable';
    const workflowLabel = repository.workflow?.conclusion ?? 'No CI';
    const workflow = repository.workflow?.url
      ? `<a href="${escapeHtml(repository.workflow.url)}">${escapeHtml(workflowLabel)}</a>`
      : escapeHtml(workflowLabel);
    const release = repository.release
      ? `<a href="${escapeHtml(repository.release.url)}">${escapeHtml(repository.release.tag)}</a>`
      : 'Unreleased';
    const runtime = repository.workflow
      ? `${formatDuration(repository.workflow.medianDurationSeconds)} (n=${repository.workflow.sampleSize})`
      : 'Not measured';
    return `<tr>
      <td><a href="${escapeHtml(repository.url)}">${escapeHtml(repository.label)}</a></td>
      <td class="status ${escapeHtml(repository.status)}">${statusLabel}</td>
      <td class="status ${escapeHtml(evidenceLabel)}">${escapeHtml(evidenceLabel)}</td>
      <td class="status ${escapeHtml(workflowLabel)}">${workflow}</td>
      <td>${escapeHtml(runtime)}</td>
      <td>${release}</td>
      <td>${repository.commitCount} commits · ${repository.pullRequestCount} PRs</td>
      <td class="evidence-links">${evidenceLinks(repository)}</td>
    </tr>`;
  })
  .join('\n');

const indexUrl = new URL('../site/index.html', import.meta.url);
const indexTemplate = await readFile(indexUrl, 'utf8');
const renderedIndex = indexTemplate
  .replace(
    /(<span id="freshness-state"[^>]*>).*?(<\/span>)/,
    `$1Scheduled evidence snapshot$2`,
  )
  .replace(
    /(<span id="generated-at"[^>]*>).*?(<\/span>)/,
    `$1${escapeHtml(new Date(output.generatedAt).toLocaleString('en-GB', { timeZone: 'UTC' }))} UTC$2`,
  )
  .replace(
    /(<ol id="review-order" class="review-order">)[\s\S]*?(<\/ol>)/,
    `$1\n${reviewOrderHtml}\n$2`,
  )
  .replace(
    /(<tbody id="repository-rows">)[\s\S]*?(<\/tbody>)/,
    `$1\n${repositoryRowsHtml}\n$2`,
  );
await writeFile(indexUrl, renderedIndex);
