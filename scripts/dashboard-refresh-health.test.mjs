import './check-runtime.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRefreshHealth } from './dashboard-refresh-health.mjs';

const now = Date.parse('2026-10-16T12:00:00.000Z');
const active = { status: 'available', state: 'active' };
const run = { id: 12, event: 'schedule', status: 'completed', conclusion: 'success', completed_at: '2026-10-16T00:00:00Z', html_url: 'https://github.com/qa-test-automation-frameworks/.github/actions/runs/12' };

test('refresh cadence is healthy only for a recent successful scheduled run', () => {
  assert.equal(classifyRefreshHealth(active, [run], now).status, 'healthy');
  assert.equal(classifyRefreshHealth({ ...active, state: 'disabled_inactivity' }, [run], now).status, 'disabled_inactivity');
  assert.equal(classifyRefreshHealth(active, [], now).status, 'never-run');
  assert.equal(classifyRefreshHealth(active, [{ ...run, conclusion: 'failure' }], now).status, 'failed');
  assert.equal(classifyRefreshHealth(active, [{ ...run, completed_at: '2026-10-14T00:00:00Z' }], now).status, 'stale');
  assert.equal(classifyRefreshHealth(active, [{ ...run, completed_at: '2026-10-17T00:00:00Z' }], now).status, 'invalid-time');
  assert.equal(classifyRefreshHealth(active, [{ ...run, completed_at: 'not-a-date' }], now).status, 'invalid-time');
  assert.equal(classifyRefreshHealth({ status: 'unavailable' }, [run], now).status, 'unavailable');
});
