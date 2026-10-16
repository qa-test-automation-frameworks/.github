import './check-runtime.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { publicationState, summarizeEvidence } from './dashboard-state.mjs';

const fixtureUrl = new URL('../portfolio/evidence/fixtures/', import.meta.url);
const load = async (file) => JSON.parse(await readFile(new URL(file, fixtureUrl), 'utf8'));
const policies = JSON.parse(await readFile(new URL('../portfolio/evidence/freshness-policies.json', import.meta.url), 'utf8')).policies;
const now = Date.parse('2026-10-04T08:01:00.000Z');

test('review-ready requires every required record to match current code and freshness policy', async () => {
  const record = await load('valid-pass.json');
  const result = summarizeEvidence([record], { repository: record.repository, currentSha: record.sourceSha, now, policies });
  assert.equal(result.state, 'review-ready');
  assert.equal(result.requiredCount, 1);
  assert.equal(result.freshRequiredCount, 1);
  assert.equal(result.scopes[0].freshnessPolicy, 'daily_gate_v1');
});

test('a successful upload preserves failed execution as a failed portfolio state', async () => {
  const record = await load('real-failure-published.json');
  const result = summarizeEvidence([record], { repository: record.repository, currentSha: record.sourceSha, now, policies });
  assert.equal(result.scopes[0].state, 'failed');
  assert.equal(result.state, 'failed');
});

test('stale, future, and incompatible source records cannot appear current', async () => {
  const valid = await load('valid-pass.json');
  const context = { repository: valid.repository, currentSha: valid.sourceSha, now: Date.parse('2026-10-16T00:00:00Z'), policies };
  assert.equal(summarizeEvidence([valid], context).state, 'evidence-stale');
  const mismatch = summarizeEvidence([valid], { ...context, currentSha: 'b'.repeat(40) });
  assert.equal(mismatch.state, 'code-mismatch');
  const future = { ...valid, execution: { ...valid.execution, completedAt: '2026-10-17T00:00:00Z' } };
  assert.equal(summarizeEvidence([future], { ...context, now: Date.parse('2026-10-16T00:00:00Z') }).state, 'evidence-unavailable');
});

test('missing or unavailable publication data never becomes success', async () => {
  const record = await load('valid-pass.json');
  const attempt = { status: 'completed', runId: '1001', attempt: 1 };
  assert.equal(publicationState(null, 'unavailable', attempt), 'unavailable');
  assert.equal(publicationState(null, 'not-published', attempt), 'not-published');
  assert.equal(publicationState({ scopes: {} }, 'available', attempt), 'not-published-for-latest-attempt');
  assert.equal(publicationState({ scopes: { [record.scope.id]: { runId: '1001', attempt: 1 } } }, 'available', attempt), 'published');
  assert.equal(publicationState({ scopes: {} }, 'available', { status: 'in_progress', runId: '1002', attempt: 1 }), 'awaiting-publication');
});

test('an optional skipped evidence class does not downgrade fresh required proof', async () => {
  const required = await load('valid-pass.json');
  const optional = await load('credential-skip.json');
  optional.scope = {
    ...optional.scope,
    id: 'optional.cloud',
    evidenceClass: 'credentialed',
    required: false,
    freshnessPolicy: 'quarterly_experiment_v1',
  };
  const result = summarizeEvidence([required, optional], { repository: required.repository, currentSha: required.sourceSha, now, policies });
  assert.equal(result.state, 'review-ready');
  assert.equal(result.freshRequiredCount, 1);
  assert.equal(result.scopes[1].state, 'skipped');
});
