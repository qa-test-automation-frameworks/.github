import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyLegacyAttestation, evidenceFreshness, validateEvidence } from './evidence-contract.mjs';

const directory = new URL('../portfolio/evidence/fixtures/', import.meta.url);
const load = file => JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
const cases = load('cases.json');
const now = Date.parse(cases.clock);
for (const fixture of cases.cases) {
  test(`evidence contract: ${fixture.file}`, () => {
    const record = load(fixture.file);
    const errors = validateEvidence(record);
    assert.equal(errors.length === 0, fixture.valid, errors.join('\n'));
    if (fixture.state) assert.equal(evidenceFreshness(record, now).state, fixture.state);
  });
}

test('publication success cannot convert native test failure into pass', () => {
  const record = load('real-failure-published.json');
  assert.equal(record.publication.disposition, 'published');
  assert.equal(evidenceFreshness(record, now).state, 'failed');
});

test('refresh time cannot renew stale execution and policy boundary is exact', () => {
  const record = load('valid-pass.json');
  const completion = Date.parse(record.execution.completedAt);
  assert.equal(evidenceFreshness(record, completion + 36 * 3_600_000).state, 'fresh');
  assert.equal(evidenceFreshness(record, completion + 36 * 3_600_000 + 1).state, 'stale');
  assert.equal(evidenceFreshness(load('stale.json'), now).state, 'stale');
});

test('historical attestation remains separate when a new run fails', () => {
  const historical = load('historical-attestation.json');
  const failed = load('real-failure-published.json');
  assert.equal(evidenceFreshness(historical, now).state, 'historical');
  assert.equal(evidenceFreshness(failed, now).state, 'failed');
  const legacy = { schemaVersion: 2, verifiedSha: historical.sourceSha, workflow: { runId: 1001, conclusion: 'success' }, evidenceState: 'review-ready' };
  const migrated = classifyLegacyAttestation(legacy);
  assert.equal(migrated.eligibleAsCurrentExecution, false);
  assert.deepEqual(migrated.record, legacy);
});

test('case counts cannot double-count retries or hide failed final outcomes', () => {
  const record = load('valid-pass.json');
  record.execution.counts.executed = 3; // two final cases plus a retry attempt
  assert.match(validateEvidence(record).join('\n'), /reconcile|exceeds selected/);
  record.execution.counts.executed = 2;
  record.execution.counts.failed = 1;
  assert.match(validateEvidence(record).join('\n'), /failed final|outcomes exceed/);
});

test('zero metric values require actual samples and never become invented test counts', () => {
  const record = load('valid-k6-performance-framework.json');
  record.execution.measurements = [{ name: 'error_rate', value: 0, unit: 'fraction', sampleCount: 8, semantics: 'Zero errors in eight observed requests.' }];
  assert.deepEqual(validateEvidence(record), []);
  record.execution.measurements[0].sampleCount = 0;
  assert.ok(validateEvidence(record).length > 0);
  record.execution.measurements = [];
  assert.match(validateEvidence(record).join('\n'), /substantive/);
});

test('missing checksum, unknown count and unsupported policy are distinct', () => {
  const record = load('valid-pass.json');
  delete record.publication.artifacts[0].sha256;
  assert.match(validateEvidence(record).join('\n'), /sha256/);
  const unknown = load('unavailable.json');
  assert.equal(unknown.execution.counts.executed, null);
  assert.deepEqual(validateEvidence(unknown), []);
  unknown.scope.freshnessPolicy = 'made_up_green_policy';
  assert.match(validateEvidence(unknown).join('\n'), /unknown freshness policy/);
});

test('non-execution cannot smuggle positive final outcomes through unknown execution count', () => {
  const record = load('unavailable.json');
  record.execution.counts.passed = 1;
  assert.match(validateEvidence(record).join('\n'), /non-execution/);
});

test('workflow reference must bind the repository and immutable run identity', () => {
  const record = load('valid-pass.json');
  record.workflow.runId = '1002';
  assert.match(validateEvidence(record).join('\n'), /immutable run ID/);
});
