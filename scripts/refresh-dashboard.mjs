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
      workflow: await workflowMetrics(repository),
    };
  }),
);

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  organization: owner,
  recommendedReviewOrder: definition.recommendedReviewOrder,
  repositories,
};

await writeFile(
  new URL('../site/data/portfolio.json', import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`,
);
