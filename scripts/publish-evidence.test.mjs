import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discoverEvidence, publishEvidence } from './publish-evidence.mjs';

const fixture = new URL('../portfolio/evidence/fixtures/valid-pass.json', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-publication-'));
  const input = join(root, 'evidence.json');
  const record = JSON.parse(await readFile(fixture, 'utf8'));
  record.workflow.trigger = 'push';
  record.workflow.branch = 'main';
  await writeFile(input, `${JSON.stringify(record, null, 2)}\n`);
  const metadata = {
    repository: record.repository,
    runId: record.workflow.runId,
    attempt: record.workflow.attempt,
    sourceSha: record.sourceSha,
    event: 'push',
    branch: 'main',
    workflowName: 'CI',
    conclusion: 'success',
    completedAt: '2026-10-04T08:01:00.000Z',
    runUrl: record.workflow.url,
  };
  return { root, input, metadata, output: join(root, 'published') };
}

test('publishes validated immutable bundle and checksummed latest scope pointer', async () => {
  const context = await setup();
  try {
    const result = await publishEvidence({ ...context, inputs: [context.input] });
    const manifest = JSON.parse(await readFile(join(result.bundlePath, 'manifest.json'), 'utf8'));
    const recordBytes = await readFile(join(result.bundlePath, manifest.records[0].path));
    const latest = JSON.parse(await readFile(result.latestPath, 'utf8'));
    assert.equal(manifest.records[0].sha256, digest(recordBytes));
    assert.equal(latest.scopes['browser.chromium'].runId, '1001');
    assert.equal(latest.scopes['browser.chromium'].execution, 'passed');
    assert.equal(latest.scopes['browser.chromium'].manifestSha256, result.bundleDigest);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('a successful publication preserves a failed test disposition', async () => {
  const context = await setup();
  try {
    const record = JSON.parse(await readFile(context.input, 'utf8'));
    record.execution.disposition = 'failed';
    record.execution.reason = 'Controlled failure is visible.';
    record.execution.counts.passed = 1;
    record.execution.counts.failed = 1;
    await writeFile(context.input, JSON.stringify(record));
    const result = await publishEvidence({
      ...context,
      metadata: { ...context.metadata, conclusion: 'failure' },
      inputs: [context.input],
    });
    const latest = JSON.parse(await readFile(result.latestPath, 'utf8'));
    assert.equal(latest.scopes['browser.chromium'].execution, 'failed');
    assert.equal(latest.scopes['browser.chromium'].workflowConclusion, 'failure');
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('rejects evidence whose repository, attempt, source SHA, event, or branch differs', async () => {
  const context = await setup();
  try {
    const record = JSON.parse(await readFile(context.input, 'utf8'));
    record.workflow.attempt = 2;
    await writeFile(context.input, JSON.stringify(record));
    await assert.rejects(publishEvidence({ ...context, inputs: [context.input] }), /identity does not match/);
    await assert.rejects(
      readFile(join(context.output, 'repositories', ...context.metadata.repository.split('/'), 'latest.json')),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('rejects credentials and redaction sentinels in evidence text', async () => {
  const context = await setup();
  try {
    const record = JSON.parse(await readFile(context.input, 'utf8'));
    record.limitations.push('SYNTHETIC_SECRET_SENTINEL');
    await writeFile(context.input, JSON.stringify(record));
    await assert.rejects(publishEvidence({ ...context, inputs: [context.input] }), /secret-like value or redaction sentinel/);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('artifact discovery selects schema-v3 records and fails closed on broken evidence JSON', async () => {
  const context = await setup();
  const artifactDir = join(context.root, 'artifacts');
  try {
    await mkdir(join(artifactDir, 'reports', 'evidence'), { recursive: true });
    await writeFile(join(artifactDir, 'reports', 'summary.json'), '{"summary":true}');
    await writeFile(join(artifactDir, 'reports', 'evidence', 'record.json'), await readFile(context.input));
    const files = await discoverEvidence(artifactDir);
    assert.deepEqual(files, [join(artifactDir, 'reports', 'evidence', 'record.json')]);
    await writeFile(join(artifactDir, 'reports', 'evidence', 'broken.json'), '{');
    await assert.rejects(discoverEvidence(artifactDir), /Unreadable evidence JSON/);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('an interrupted publication leaves the existing latest pointer unchanged', async () => {
  const context = await setup();
  try {
    const first = await publishEvidence({ ...context, inputs: [context.input] });
    const before = await readFile(first.latestPath, 'utf8');
    const record = JSON.parse(await readFile(context.input, 'utf8'));
    record.workflow.runId = '1002';
    record.workflow.url = record.workflow.url.replace('/1001', '/1002');
    record.workflow.attempt = 1;
    record.sourceSha = 'b'.repeat(40);
    await writeFile(context.input, JSON.stringify(record));
    const metadata = {
      ...context.metadata,
      runId: '1002',
      sourceSha: 'b'.repeat(40),
      runUrl: context.metadata.runUrl.replace('/1001', '/1002'),
      completedAt: '2026-10-05T08:01:00.000Z',
    };
    await assert.rejects(
      publishEvidence({ ...context, metadata, inputs: [context.input], beforeLatest: async () => { throw new Error('simulated interruption'); } }),
      /simulated interruption/,
    );
    assert.equal(await readFile(first.latestPath, 'utf8'), before);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('late completion of an older run cannot move latest backwards', async () => {
  const context = await setup();
  try {
    const first = await publishEvidence({ ...context, inputs: [context.input] });
    const record = JSON.parse(await readFile(context.input, 'utf8'));
    record.workflow.runId = '999';
    record.workflow.url = record.workflow.url.replace('/1001', '/999');
    record.sourceSha = 'c'.repeat(40);
    await writeFile(context.input, JSON.stringify(record));
    const metadata = {
      ...context.metadata,
      runId: '999',
      sourceSha: 'c'.repeat(40),
      runUrl: context.metadata.runUrl.replace('/1001', '/999'),
      completedAt: '2026-10-03T08:01:00.000Z',
    };
    await publishEvidence({ ...context, metadata, inputs: [context.input] });
    const latest = JSON.parse(await readFile(first.latestPath, 'utf8'));
    assert.equal(latest.scopes['browser.chromium'].runId, '1001');
    assert.ok(await readFile(join(context.output, 'repositories', ...context.metadata.repository.split('/'), 'runs', '999', '1', 'manifest.json')));
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});
