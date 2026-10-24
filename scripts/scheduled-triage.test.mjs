import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchScheduledTriage, summarizeScheduledTriage } from './scheduled-triage.mjs';
const now = Date.parse('2026-10-24T12:00:00Z');
const issue = { number: 1, title: 'Scheduled failure: CI', state: 'open', created_at: '2026-10-16T12:00:00Z', html_url: 'https://github.com/qa-test-automation-frameworks/fixture/issues/1' };

test('no open issues is an available empty operating signal', () => {
  assert.deepEqual(summarizeScheduledTriage([], now), { status: 'available', openCount: 0, oldestOpenedAt: null, oldestAgeDays: null, overdue: false, issues: [] });
});

test('an eight-day issue is overdue and closed issues and PRs are excluded', () => {
  const result = summarizeScheduledTriage([issue, { ...issue, state: 'closed' }, { ...issue, pull_request: {} }], now);
  assert.equal(result.openCount, 1);
  assert.equal(result.oldestAgeDays, 8);
  assert.equal(result.overdue, true);
});

test('the seven-day boundary is exact', () => {
  const entry = { ...issue, created_at: '2026-10-17T12:00:00Z' };
  assert.equal(summarizeScheduledTriage([entry], now).overdue, false);
  assert.equal(summarizeScheduledTriage([entry], now + 1).overdue, true);
});

test('unavailable and invalid query results never claim zero open failures', async () => {
  for (const github of [async () => { throw new Error('403'); }, async () => ({}), async () => [{ ...issue, html_url: 'https://example.com/' }]]) {
    const result = await fetchScheduledTriage('fixture', github, now);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.openCount, null);
  }
  assert.throws(() => summarizeScheduledTriage([{ ...issue, created_at: 'invalid' }], now), /Invalid/);
});

test('fetches oldest-first and paginates to include every open issue', async () => {
  const paths = [];
  const result = await fetchScheduledTriage('fixture', async (path) => {
    paths.push(path);
    return paths.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...issue, number: i + 1, html_url: `https://github.com/qa-test-automation-frameworks/fixture/issues/${i + 1}` })) : [];
  }, now);
  assert.equal(result.openCount, 100);
  assert.equal(paths.length, 2);
  assert.match(paths[0], /sort=created&direction=asc/);
});
