import './check-runtime.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeRunSummary, publicationState, summarizeEvidence } from './dashboard-state.mjs';

const fixtureUrl = new URL('../portfolio/evidence/fixtures/', import.meta.url);
const load = async (file) => JSON.parse(await readFile(new URL(file, fixtureUrl), 'utf8'));
const policies = JSON.parse(await readFile(new URL('../portfolio/evidence/freshness-policies.json', import.meta.url), 'utf8')).policies;
const now = Date.parse('2026-10-04T08:01:00.000Z');
const contextFor = (record, options = {}) => ({
  repository: record.repository,
  currentSha: record.sourceSha,
  now,
  policies,
  requiredScopeIds: options.requiredScopeIds ?? [record.scope.id],
  controlPairs: options.controlPairs ?? [],
});

const verityRepository = 'qa-test-automation-frameworks/verity-policy-coverage-eval-framework';
const rawScopeId = 'verity.failure-control-py3.12.15';
const verifierScopeId = 'verity.failure-control-verification-py3.12.15';
const controlPair = {
  id: 'verity-failure-control',
  label: 'Verity failure control',
  rawScopeId,
  verifierScopeId,
};

async function verityControlRecords() {
  const template = await load('valid-pass.json');
  const workflow = {
    ...template.workflow,
    url: `https://github.com/${verityRepository}/actions/runs/1001`,
  };
  const raw = structuredClone(template);
  raw.repository = verityRepository;
  raw.workflow = { ...workflow };
  raw.scope = { ...template.scope, id: rawScopeId, required: false };
  raw.execution = {
    ...template.execution,
    disposition: 'failed',
    reason: 'The seeded assertion failed as intended.',
    counts: {
      ...template.execution.counts,
      selected: 1,
      executed: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      retried: 0,
    },
  };
  const verifier = structuredClone(template);
  verifier.repository = verityRepository;
  verifier.workflow = { ...workflow };
  verifier.scope = { ...template.scope, id: verifierScopeId, required: true };
  verifier.execution = {
    ...template.execution,
    counts: {
      ...template.execution.counts,
      selected: 1,
      executed: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      retried: 0,
    },
  };
  return { raw, verifier };
}

test('review-ready requires every required record to match current code and freshness policy', async () => {
  const record = await load('valid-pass.json');
  const result = summarizeEvidence([record], contextFor(record));
  assert.equal(result.state, 'review-ready');
  assert.equal(result.requiredCount, 1);
  assert.equal(result.freshRequiredCount, 1);
  assert.equal(result.scopes[0].freshnessPolicy, 'daily_gate_v1');
});

test('a successful upload preserves failed execution as a failed portfolio state', async () => {
  const record = await load('real-failure-published.json');
  const result = summarizeEvidence([record], contextFor(record));
  assert.equal(result.scopes[0].state, 'failed');
  assert.equal(result.state, 'failed');
});

test('stale, future, and incompatible source records cannot appear current', async () => {
  const valid = await load('valid-pass.json');
  const context = { ...contextFor(valid), now: Date.parse('2026-10-16T00:00:00Z') };
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
  const result = summarizeEvidence([required, optional], contextFor(required));
  assert.equal(result.state, 'review-ready');
  assert.equal(result.freshRequiredCount, 1);
  assert.equal(result.scopes[1].state, 'skipped');
});

test('repository policy keeps a required scope mandatory when its record says optional', async () => {
  const record = await load('valid-pass.json');
  record.scope.required = false;

  const result = summarizeEvidence([record], contextFor(record));

  assert.equal(result.state, 'review-ready');
  assert.equal(result.requiredCount, 1);
  assert.equal(result.freshRequiredCount, 1);
  assert.equal(result.scopes[0].required, true);
  assert.match(result.scopes[0].reasons.join(' '), /Repository policy requires this scope/);
});

test('missing and duplicate registry-required scopes cannot become review-ready', async () => {
  const record = await load('valid-pass.json');
  const missing = summarizeEvidence([], contextFor(record));
  assert.equal(missing.state, 'evidence-unavailable');
  assert.equal(missing.requiredCount, 1);
  assert.equal(missing.freshRequiredCount, 0);
  assert.match(missing.scopes[0].reasons.join(' '), /no published record/);

  const duplicate = summarizeEvidence([record, structuredClone(record)], contextFor(record));
  assert.equal(duplicate.state, 'evidence-unavailable');
  assert.equal(duplicate.requiredCount, 1);
  assert.equal(duplicate.freshRequiredCount, 0);
  assert.ok(duplicate.scopes.every((scope) => scope.state === 'invalid'));
});

test('an undeclared required record is a registry policy mismatch', async () => {
  const record = await load('valid-pass.json');
  const undeclared = structuredClone(record);
  undeclared.scope.id = 'unexpected.required.scope';

  const result = summarizeEvidence([record, undeclared], contextFor(record));

  assert.equal(result.state, 'evidence-unavailable');
  assert.match(result.policyMismatches.join(' '), /absent from the repository registry/);
  assert.match(result.scopes[1].reasons.join(' '), /not declared by repository policy/);
});

test('a real failed control and its passing verifier must share current run identity', async () => {
  const { raw, verifier } = await verityControlRecords();
  const context = {
    repository: verityRepository,
    currentSha: raw.sourceSha,
    now,
    policies,
    requiredScopeIds: [verifierScopeId],
    controlPairs: [controlPair],
  };

  const result = summarizeEvidence([raw, verifier], context);
  assert.equal(result.state, 'review-ready');
  assert.equal(result.controlPairs[0].state, 'verified');
  assert.equal(
    result.controlPairs[0].message,
    'Expected failure detected; native control failed 1; verifier passed 1.',
  );

  const otherRun = structuredClone(raw);
  otherRun.workflow.runId = '1002';
  otherRun.workflow.url = `https://github.com/${verityRepository}/actions/runs/1002`;
  const mismatch = summarizeEvidence([otherRun, verifier], context);
  assert.equal(mismatch.state, 'evidence-unavailable');
  assert.equal(mismatch.controlPairs[0].state, 'unverified');
});

test('a missing or unexpected control record blocks the control pair', async () => {
  const { raw, verifier } = await verityControlRecords();
  const context = {
    repository: verityRepository,
    currentSha: raw.sourceSha,
    now,
    policies,
    requiredScopeIds: [verifierScopeId],
    controlPairs: [controlPair],
  };
  assert.equal(summarizeEvidence([verifier], context).state, 'evidence-unavailable');

  const unexpectedPass = structuredClone(raw);
  unexpectedPass.execution.disposition = 'passed';
  unexpectedPass.execution.reason = null;
  unexpectedPass.execution.counts = {
    ...unexpectedPass.execution.counts,
    passed: 1,
    failed: 0,
  };
  const result = summarizeEvidence([unexpectedPass, verifier], context);
  assert.equal(result.state, 'evidence-unavailable');
  assert.equal(result.controlPairs[0].state, 'unverified');
});

test('last-success time labels distinguish completion from updated-at fallback', () => {
  const completed = normalizeRunSummary({
    id: 1,
    run_attempt: 1,
    status: 'completed',
    completed_at: '2026-10-04T08:00:00Z',
    updated_at: '2026-10-04T08:00:30Z',
  }, now);
  assert.equal(completed.completedAt, '2026-10-04T08:00:00Z');
  assert.equal(completed.lastSuccessTimestamp, '2026-10-04T08:00:00Z');
  assert.equal(completed.lastSuccessTimestampLabel, 'Completed');

  const fallback = normalizeRunSummary({
    id: 2,
    run_attempt: 1,
    status: 'completed',
    completed_at: null,
    updated_at: '2026-10-04T08:00:30Z',
  }, now);
  assert.equal(fallback.completedAt, null);
  assert.equal(fallback.updatedAt, '2026-10-04T08:00:30Z');
  assert.equal(fallback.lastSuccessTimestamp, '2026-10-04T08:00:30Z');
  assert.equal(fallback.lastSuccessTimestampLabel, 'Last updated');

  const future = normalizeRunSummary({
    completed_at: '2026-10-04T08:02:00Z',
    updated_at: '2026-10-04T08:03:00Z',
  }, now);
  assert.equal(future.lastSuccessTimestamp, null);
  assert.equal(future.lastSuccessTimestampLabel, null);
});

test('a real completed workflow run with no completed_at uses updated_at without inventing completion', async () => {
  const response = JSON.parse(await readFile(
    new URL('../portfolio/evidence/fixtures/workflow-run-no-completed-at.json', import.meta.url),
    'utf8',
  ));
  const summary = normalizeRunSummary(response, Date.parse('2026-10-23T00:00:00Z'));

  assert.equal(summary.completedAt, null);
  assert.equal(summary.updatedAt, '2026-10-22T09:11:46Z');
  assert.equal(summary.lastSuccessTimestamp, '2026-10-22T09:11:46Z');
  assert.equal(summary.lastSuccessTimestampLabel, 'Last updated');
});

test('invalid, absent and unknown run timestamps stay unavailable', () => {
  const invalid = normalizeRunSummary({
    completed_at: '2026-02-31T12:00:00Z',
    updated_at: 'not-a-timestamp',
  }, Date.parse('2026-10-23T00:00:00Z'));
  assert.equal(invalid.lastSuccessTimestamp, null);
  assert.equal(invalid.lastSuccessTimestampLabel, null);

  const absent = normalizeRunSummary({}, Date.parse('2026-10-23T00:00:00Z'));
  assert.equal(absent.completedAt, null);
  assert.equal(absent.updatedAt, null);
  assert.equal(absent.lastSuccessTimestamp, null);
  assert.equal(normalizeRunSummary(null, Date.parse('2026-10-23T00:00:00Z')), null);
});

test('a fresh record lists the policy rationale exactly once', async () => {
  const record = await load('valid-pass.json');
  const result = summarizeEvidence([record], contextFor(record));
  const rationale = policies[record.scope.freshnessPolicy].rationale;

  assert.equal(result.scopes[0].state, 'fresh');
  assert.equal(result.scopes[0].reasons.filter((reason) => reason === rationale).length, 1);
});
