import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOperationSummary, renderOperationMarkdown } from './operation-summary.mjs';

const now = new Date('2026-10-22T15:00:00.000Z');
const workflowFile = '.github/workflows/dashboard.yml';
const repository = 'qa-test-automation-frameworks/.github';
const run = ({
  id = 100,
  runAttempt = 1,
  runNumber = 10,
  conclusion = 'success',
  status = 'completed',
  started = '2026-10-22T13:00:00Z',
  completed = '2026-10-22T13:02:00Z',
  jobs = [],
} = {}) => ({
  id,
  run_number: runNumber,
  run_attempt: runAttempt,
  event: 'schedule',
  status,
  conclusion,
  head_sha: '27f977e93ac962c2c184b0d4898c13471d3eeaca',
  head_branch: 'main',
  created_at: '2026-10-22T13:00:00Z',
  run_started_at: started,
  updated_at: completed,
  completed_at: completed,
  html_url: `https://github.com/${repository}/actions/runs/${id}`,
  jobs,
});

const source = (runs, extra = {}) => ({
  repository,
  workflow: 'Portfolio dashboard',
  workflowFile,
  expectedOpportunities: null,
  runs,
  ...extra,
});

const snapshot = (sources, extra = {}) => ({
  schemaVersion: 1,
  window: { start: '2026-10-22T12:00:00Z', end: '2026-10-22T14:00:00Z' },
  sources,
  ...extra,
});

test('empty input stays insufficient and keeps unknowns distinct from zero', () => {
  const report = buildOperationSummary(snapshot([]), { now });
  assert.equal(report.status, 'insufficient-data');
  assert.equal(report.totals.opportunityDenominator, 'unknown');
  assert.equal(report.totals.expectedOpportunities, null);
  assert.equal(report.triage.status, 'unknown');
  assert.equal(report.triage.counts, null);
  assert.equal(report.currencyCost.amount, null);
  assert.match(renderOperationMarkdown(report), /Not recorded/);
  assert.match(renderOperationMarkdown(report), /unknown, not zero/);
});

test('the retained real sample preserves its run and dashboard artifact identities', async () => {
  const sample = JSON.parse(await readFile(new URL('../portfolio/operation-samples/window-2026-10-22.json', import.meta.url), 'utf8'));
  const schema = JSON.parse(await readFile(new URL('../portfolio/operation-sample.schema.json', import.meta.url), 'utf8'));
  const report = buildOperationSummary(sample, { now: new Date('2026-10-22T16:00:00Z'), snapshotSha256: 'a'.repeat(64) });
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(report.sources[0].observedRunAttempts, 1);
  assert.equal(report.sources[0].artifactObservations[0].id, '12430172934');
  assert.equal(report.sources[0].artifactObservations[0].sha256, '7527d8816de6bd6445a483791eb993c7dea2abf155b2b802ee5095cef09d6465');
  assert.equal(report.evidenceStates.counts['evidence-unavailable'], 2);
  assert.equal(report.totals.opportunityDenominator, 'unknown');
});

test('partial pagination is visible and prevents an all-success status', () => {
  const report = buildOperationSummary(snapshot([source([run()], { totalCount: 150 })]), { now });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.incompleteSources[0].capturedRunAttempts, 1);
  assert.equal(report.incompleteSources[0].totalCount, 150);
});

test('identical duplicate runs and jobs count once while conflicts are rejected', () => {
  const job = { id: 500, name: 'validate', status: 'completed', conclusion: 'success', started_at: '2026-10-22T13:00:00Z', completed_at: '2026-10-22T13:00:30Z' };
  const one = run({ jobs: [job] });
  const repeated = structuredClone(one);
  repeated.jobs.push(structuredClone(job));
  const report = buildOperationSummary(snapshot([source([one, repeated])]), { now });
  assert.equal(report.totals.uniqueRunAttempts, 1);
  assert.equal(report.sources[0].jobElapsed.sampleCount, 1);
  const conflicting = structuredClone(one);
  conflicting.conclusion = 'failure';
  assert.throws(() => buildOperationSummary(snapshot([source([one, conflicting])]), { now }), /Conflicting duplicate run/);
});

test('a successful retry is reported separately from the failed first attempt', () => {
  const report = buildOperationSummary(snapshot([source([
    run({ id: 101, conclusion: 'failure' }),
    run({ id: 101, runAttempt: 2, runNumber: 10, conclusion: 'success', started: '2026-10-22T13:05:00Z', completed: '2026-10-22T13:06:00Z' }),
  ])]), { now });
  assert.equal(report.totals.uniqueLogicalRuns, 1);
  assert.equal(report.totals.uniqueRunAttempts, 2);
  assert.deepEqual(report.totals.firstAttempt, { pass: 0, fail: 1, cancel: 0, unavailable: 0 });
  assert.equal(report.sources[0].retryRecovery.recoveredAfterFailureOrCancel, 1);
});

test('overlapping jobs use nearest-rank percentiles and the elapsed sum is labeled honestly', () => {
  const report = buildOperationSummary(snapshot([source([run({ jobs: [
    { id: 501, name: 'validate', status: 'completed', conclusion: 'success', started_at: '2026-10-22T13:00:00Z', completed_at: '2026-10-22T13:01:00Z' },
    { id: 502, name: 'deploy', status: 'completed', conclusion: 'success', started_at: '2026-10-22T13:00:30Z', completed_at: '2026-10-22T13:02:00Z' },
  ] })])]), { now });
  assert.equal(report.sources[0].jobElapsed.sampleCount, 2);
  assert.equal(report.sources[0].jobElapsed.p50Seconds, 60);
  assert.equal(report.sources[0].jobElapsed.p95Seconds, 90);
  assert.equal(report.sources[0].jobElapsed.sumJobElapsedSeconds, 150);
  assert.match(renderOperationMarkdown(report), /not CPU time or billed minutes/);
});

test('missing job timestamps produce no invented duration sample', () => {
  const report = buildOperationSummary(snapshot([source([run({ jobs: [
    { id: 503, name: 'validate', status: 'completed', conclusion: 'success' },
  ] })])]), { now });
  assert.equal(report.sources[0].jobElapsed.sampleCount, 0);
  assert.equal(report.sources[0].jobElapsed.p50Seconds, null);
  assert.equal(report.sources[0].jobElapsed.jobsMissingTimestamps, 1);
});

test('invalid and future timestamps are rejected', () => {
  const invalid = run({ started: 'not-a-time' });
  assert.throws(() => buildOperationSummary(snapshot([source([invalid])]), { now }), /ISO timestamp/);
  const future = run({ completed: '2026-10-23T00:00:00Z' });
  assert.throws(() => buildOperationSummary(snapshot([source([future])]), { now }), /future/);
});

test('explicit expected-control and unclassified triage use the allowed exact labels', () => {
  const runs = [
    run({ id: 110, conclusion: 'failure', jobs: [{ id: 510, name: 'native-control', status: 'completed', conclusion: 'failure' }] }),
    run({ id: 111, runNumber: 11, conclusion: 'failure', jobs: [{ id: 511, name: 'other-failure', status: 'completed', conclusion: 'failure' }] }),
  ];
  const triage = [
    { repository, workflowFile, run_id: '110', attempt: 1, job_id: '510', classification: 'expected-control', reason: 'The isolated negative control detected the seeded failure.' },
    { repository, workflowFile, run_id: '111', attempt: 1, job_id: '511', classification: 'unclassified', reason: 'The run failed and no cause has been established.' },
  ];
  const report = buildOperationSummary(snapshot([source(runs)]), { now, triageRecords: triage });
  assert.equal(report.triage.counts['expected-control'], 1);
  assert.equal(report.triage.counts.unclassified, 1);
  assert.equal(report.triage.untriagedFailureCount, 0);
  assert.throws(() => buildOperationSummary(snapshot([source(runs)]), { now, triageRecords: [{ ...triage[0], classification: 'flaky' }] }), /one of/);
});

test('failure observations without triage remain unknown, not zero incidents', () => {
  const report = buildOperationSummary(snapshot([source([run({ conclusion: 'failure' })])]), { now, triageRecords: [] });
  assert.equal(report.triage.status, 'provided');
  assert.equal(report.triage.untriagedFailureCount, 1);
  assert.equal(report.triage.failureDisposition, 'some-failures-untriaged');
});

test('publication delay uses only both observed timestamps and billing remains null without a dated amount', () => {
  const report = buildOperationSummary(snapshot([source([{
    ...run(),
    report_generated_at: '2026-10-22T13:02:00Z',
    published_at: '2026-10-22T13:02:19Z',
  }])]), { now });
  assert.equal(report.sources[0].publicationDelay.sampleCount, 1);
  assert.equal(report.sources[0].publicationDelay.p50Seconds, 19);
  assert.equal(report.currencyCost.amount, null);
  const rateOnly = buildOperationSummary(snapshot([source([run()])], { billing: { rate: 0.01, currency: 'USD', source: 'dated rate table', asOf: '2026-10-22T14:00:00Z' } }), { now });
  assert.equal(rateOnly.currencyCost.amount, null);
  assert.match(rateOnly.currencyCost.reason, /no cost was calculated/);
});

