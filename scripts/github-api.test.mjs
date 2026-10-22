import assert from 'node:assert/strict';
import test from 'node:test';
import { githubApiGet } from './github-api.mjs';

test('public repository workflow reads omit the repository-scoped token', async () => {
  let request;
  const result = await githubApiGet('/repos/example/public/actions/runs', {
    token: 'repository-scoped-token',
    publicRead: true,
    fetchImpl: async (url, options) => {
      request = { url, headers: options.headers };
      return { ok: true, json: async () => ({ workflow_runs: [] }) };
    },
  });

  assert.equal(
    request.url,
    'https://api.github.com/repos/example/public/actions/runs',
  );
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.headers.Accept, 'application/vnd.github+json');
  assert.deepEqual(result, { workflow_runs: [] });
});

test('repository-scoped reads keep their token', async () => {
  let request;
  await githubApiGet('/repos/example/current/actions/workflows/dashboard.yml', {
    token: 'repository-scoped-token',
    fetchImpl: async (_url, options) => {
      request = options;
      return { ok: true, json: async () => ({ id: 42 }) };
    },
  });

  assert.equal(request.headers.Authorization, 'Bearer repository-scoped-token');
});

test('GitHub API errors retain their status and response text', async () => {
  await assert.rejects(
    githubApiGet('/repos/example/public/actions/runs', {
      publicRead: true,
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        text: async () => 'rate limit',
      }),
    }),
    /returned 403: rate limit/,
  );
});
