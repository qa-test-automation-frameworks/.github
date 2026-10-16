import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pruneEvidence } from './prune-evidence.mjs';

const repository = 'qa-test-automation-frameworks/example';
const now = Date.parse('2026-10-16T00:00:00.000Z');

async function addBundle(root, runId, completedAt, payload) {
  const directory = join(root, 'repositories', ...repository.split('/'), 'runs', runId, '1');
  await mkdir(join(directory, 'records'), { recursive: true });
  await writeFile(join(directory, 'records', 'record.json'), payload);
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    repository,
    run: { id: runId, attempt: 1, completedAt },
  })}\n`);
  return `repositories/${repository}/runs/${runId}/1`;
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-prune-'));
  const repositoryRoot = join(root, 'repositories', ...repository.split('/'));
  await mkdir(repositoryRoot, { recursive: true });
  return { root, repositoryRoot };
}

test('expires old non-latest bundles and preserves the latest bundle for each scope', async () => {
  const context = await setup();
  try {
    const oldBundle = await addBundle(context.root, '101', '2025-01-01T00:00:00.000Z', 'old');
    const latestBundle = await addBundle(context.root, '102', '2026-10-15T00:00:00.000Z', 'current');
    await writeFile(join(context.repositoryRoot, 'latest.json'), `${JSON.stringify({
      schemaVersion: 1,
      repository,
      scopes: { smoke: { bundle: latestBundle } },
    })}\n`);
    const result = await pruneEvidence(context.root, { now, maxBytes: 1_000_000 });
    await assert.rejects(readFile(join(context.root, oldBundle, 'manifest.json')), { code: 'ENOENT' });
    assert.ok(await readFile(join(context.root, latestBundle, 'manifest.json')));
    assert.equal(result.removed.length, 1);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('enforces the tree budget by removing the oldest non-latest bundle first', async () => {
  const context = await setup();
  try {
    const oldBundle = await addBundle(context.root, '201', '2026-10-01T00:00:00.000Z', 'x'.repeat(5_000));
    const latestBundle = await addBundle(context.root, '202', '2026-10-15T00:00:00.000Z', 'current');
    await writeFile(join(context.repositoryRoot, 'latest.json'), `${JSON.stringify({
      schemaVersion: 1,
      repository,
      scopes: { smoke: { bundle: latestBundle } },
    })}\n`);
    const result = await pruneEvidence(context.root, { now, maxBytes: 1_000 });
    assert.ok(result.usedBytes <= 1_000);
    assert.deepEqual(result.removed, [oldBundle]);
    assert.ok(await readFile(join(context.root, latestBundle, 'manifest.json')));
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('fails when protected latest bundles exceed the configured tree budget', async () => {
  const context = await setup();
  try {
    const latestBundle = await addBundle(context.root, '301', '2026-10-15T00:00:00.000Z', 'x'.repeat(2_000));
    await writeFile(join(context.repositoryRoot, 'latest.json'), `${JSON.stringify({
      schemaVersion: 1,
      repository,
      scopes: { smoke: { bundle: latestBundle } },
    })}\n`);
    await assert.rejects(pruneEvidence(context.root, { now, maxBytes: 1_000 }), /Latest evidence alone exceeds/);
    assert.ok(await readFile(join(context.root, latestBundle, 'manifest.json')));
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});
