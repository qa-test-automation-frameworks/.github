import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectProducerWorkflow, verifyProducers } from './verify-producers.mjs';

const producer = { workflow: 'ci.yml', schedule: '23 5 * * *', pushToMain: 'unfiltered', scopes: [{ id: 'scope', job: 'test' }] };
const source = `name: CI
on:
  push:
    branches: [main]
  pull_request:
    paths: [docs/**]
  schedule:
    - cron: '23 5 * * *'
jobs:
  test:
    runs-on: ubuntu-latest
`;
const repository = { name: 'fixture', requiredScopeIds: ['scope'], controlPairs: [], requiredFreshnessPolicy: 'daily', producers: [producer] };
const policies = { daily: { maxAgeHours: 36 } };

test('matching cron, main push and job pass; PR path filters do not filter main', () => {
  assert.deepEqual(inspectProducerWorkflow(source, producer), []);
  assert.deepEqual(inspectProducerWorkflow(source.replace('branches: [main]', 'branches:\n      - main'), producer), []);
});

for (const [name, changed, expected] of [
  ['changed cron', source.replace('23 5 * * *', '0 5 * * 0'), /R6a/],
  ['missing schedule', source.replace('  schedule:', '  other:'), /R6a/],
  ['push path filter', source.replace('    branches: [main]', '    branches: [main]\n    paths: [src/**]'), /R6b.*path filters/],
  ['push ignored paths', source.replace('    branches: [main]', '    branches: [main]\n    paths-ignore: [docs/**]'), /R6b.*path filters/],
  ['other branch', source.replace('branches: [main]', 'branches: [develop]'), /R6b.*main/],
  ['flow trigger', source.replace(/on:[\s\S]*?jobs:/, 'on: [push]\njobs:'), /unrecognised trigger layout/],
  ['flow push', source.replace('  push:\n    branches: [main]', '  push: {branches: [main]}'), /unrecognised trigger layout/],
  ['missing job', source.replace('  test:', '  other:'), /R6c missing job test/],
  ['unrelated job-shaped step', source.replace('  test:', '  other:') + '    run: |\n      test:\n', /R6c missing job test/],
]) test(`workflow rejects ${name}`, () => assert.match(inspectProducerWorkflow(changed, producer).join('\n'), expected));

function github(state = 'active') {
  return async (path) => path.includes('/contents/')
    ? { encoding: 'base64', content: Buffer.from(source).toString('base64') }
    : { state };
}

test('live verification checks source and active workflow state', async () => {
  assert.deepEqual(await verifyProducers(repository, policies, github()), []);
  for (const state of ['disabled_inactivity', 'disabled_manually', undefined]) {
    assert.match((await verifyProducers(repository, policies, github(state ?? 'unknown'))).join('\n'), /fixture\/ci.yml: R6d/);
  }
});

test('unavailable GitHub state fails closed', async () => {
  const errors = await verifyProducers(repository, policies, async () => { throw new Error('returned 403'); });
  assert.match(errors.join('\n'), /fixture\/ci.yml: producer verification unavailable.*403/);
});

test('source reads use main and malformed content fails closed', async () => {
  const paths = [];
  const errors = await verifyProducers(repository, policies, async (path) => { paths.push(path); return {}; });
  assert.ok(paths.some((path) => path.endsWith('?ref=main')));
  assert.match(errors.join('\n'), /workflow contents are unavailable/);
});
