import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIndex, retainedPath, retainedReplayTime } from './check-retained-samples.mjs';
import { buildAssurancePacket } from './build-assurance-packet.mjs';
import { makeInput, now, repositoryRegistry, riskMap, riskMapSchema } from './assurance-packet.fixtures.mjs';

async function fixture(t, entries = [{ window: 'samples/window-one.json', summary: 'samples/summary.json', report: 'report.md' }]) {
  const root = await mkdtemp(join(tmpdir(), 'retained-samples-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'samples'));
  for (const path of ['samples/window-one.json', 'samples/summary.json', 'report.md']) await writeFile(join(root, path), '{}');
  await writeFile(join(root, 'samples/index.json'), JSON.stringify(entries));
  return root;
}
const read = (root) => readIndex(root, 'samples', ['window', 'summary', 'report'], /^window-.*\.json$/, 'window');

test('discovers a valid indexed sample', async (t) => {
  assert.equal((await read(await fixture(t))).length, 1);
});

test('rejects empty indexes, missing files, and duplicate entries', async (t) => {
  const root = await fixture(t, []);
  await assert.rejects(read(root), /Empty retained sample index/);
  const entry = { window: 'samples/window-one.json', summary: 'samples/missing.json', report: 'report.md' };
  await writeFile(join(root, 'samples/index.json'), JSON.stringify([entry]));
  await assert.rejects(read(root), /ENOENT/);
  entry.summary = 'samples/summary.json';
  await writeFile(join(root, 'samples/index.json'), JSON.stringify([entry, entry]));
  await assert.rejects(read(root), /Duplicate retained sample/);
});

test('rejects a new retained window without an index entry', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'samples/window-two.json'), '{}');
  await assert.rejects(read(root), /unindexed retained sample/);
});

test('rejects paths outside the retained repository', () => {
  for (const path of ['../secret', '/secret', 'samples/../secret', 'samples\\secret', '']) {
    assert.throws(() => retainedPath('/repo', path), /Invalid retained sample path/);
  }
});

test('takes the latest recorded receipt time and fails without valid receipts', () => {
  assert.equal(retainedReplayTime({ a: { verifiedAt: '2026-10-22T10:00:00Z' }, b: [{ verifiedAt: '2026-10-22T11:00:00Z' }] }), Date.parse('2026-10-22T11:00:00Z'));
  assert.throws(() => retainedReplayTime({}), /recorded receipt time/);
  assert.throws(() => retainedReplayTime({ verifiedAt: 'invalid' }), /Invalid retained receipt time/);
});

test('historical replay preserves readiness checks and the live clock still rejects expired evidence', () => {
  const input = makeInput();
  const options = { riskMap, input, repositoryRegistry, schema: riskMapSchema };
  assert.equal(buildAssurancePacket({ ...options, now: retainedReplayTime(input) }).verdict, 'ready-for-review');
  assert.equal(buildAssurancePacket({ ...options, now: now + 40 * 24 * 3_600_000 }).verdict, 'incomplete');
  const damaged = makeInput({ rollbackEvidence: null });
  assert.equal(buildAssurancePacket({ ...options, input: damaged, now: retainedReplayTime(damaged) }).verdict, 'incomplete');
});
