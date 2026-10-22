import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildAssurancePacket } from './build-assurance-packet.mjs';
import {
  candidateDigest,
  makeBundle,
  makeInput,
  makeRollbackEvidence,
  now,
  replaceDescriptor,
  replaceProof,
  repositoryRegistry,
  riskMap,
  riskMapSchema,
} from './assurance-packet.fixtures.mjs';

const org = 'qa-test-automation-frameworks';
const aria = `${org}/aria-api-framework`;
const playwright = `${org}/playwright-typescript-framework`;
const hash = (value) => createHash('sha256').update(value).digest('hex');

function build(input = makeInput(), map = riskMap) {
  return buildAssurancePacket({ riskMap: map, input, repositoryRegistry, schema: riskMapSchema, now });
}

function rewriteBundle(bundle, mutateRecord) {
  const updated = structuredClone(bundle);
  const manifest = JSON.parse(updated.manifestBytes);
  const entry = manifest.records[0];
  const file = updated.records.find((record) => record.path === entry.path);
  const record = JSON.parse(file.bytes);
  mutateRecord(record);
  file.bytes = `${JSON.stringify(record, null, 2)}\n`;
  entry.sha256 = hash(file.bytes);
  updated.manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  updated.manifestSha256 = hash(updated.manifestBytes);
  return updated;
}

test('validates the bounded risk map and its selected framework scope references', () => {
  const packet = build();
  assert.equal(packet.verdict, 'ready-for-review');
  assert.equal(packet.rollbackEvidence.state, 'complete');
  assert.equal(packet.rollbackEvidence.workflowRun.conclusion, 'failure');
  assert.equal(packet.rollbackEvidence.rollbackJob.conclusion, 'success');
  const map = structuredClone(riskMap);
  map.risks[0].requiredScopes[0].scopeId = 'not-a-portfolio-scope';
  assert.throws(() => build(makeInput(), map), /Invalid risk map.*unknown portfolio scope/s);
});

test('missing, invalid, or expired retained rollback evidence keeps the packet incomplete', () => {
  assert.equal(build(makeInput({ rollbackEvidence: null })).verdict, 'incomplete');

  const invalid = makeInput();
  invalid.rollbackEvidence.sha256 = '0'.repeat(64);
  assert.equal(build(invalid).verdict, 'incomplete');

  const expired = makeInput();
  expired.rollbackEvidence.artifactReceipt.expiresAt = new Date(now - 1).toISOString();
  assert.equal(build(expired).verdict, 'incomplete');

  const wrongIdentity = makeInput();
  wrongIdentity.rollbackEvidence.artifactReceipt.artifactFileSha256 = 'f'.repeat(64);
  assert.equal(build(wrongIdentity).verdict, 'incomplete');

  const wrongSource = makeInput();
  wrongSource.rollbackEvidence.workflowRun.sourceSha = 'f'.repeat(40);
  wrongSource.rollbackEvidence.artifactReceipt.sourceSha = 'f'.repeat(40);
  assert.equal(build(wrongSource).verdict, 'incomplete');
});

test('a failed rollback job or failed rollback outcome blocks review', () => {
  assert.equal(build(makeInput({
    rollbackEvidence: makeRollbackEvidence({ jobConclusion: 'failure' }),
  })).verdict, 'blocked');
  assert.equal(build(makeInput({
    rollbackEvidence: makeRollbackEvidence({ outcome: 'failed' }),
  })).verdict, 'blocked');
});

test('missing scope evidence is incomplete and cannot be hidden by the remaining green input', () => {
  const input = makeInput({ bundles: [makeBundle(aria, { records: [{ scopeId: 'aria.shared-app', profile: null }] })] });
  const packet = build(input);
  assert.equal(packet.verdict, 'incomplete');
  assert.ok(packet.risks.every((risk) => risk.verdict === 'incomplete'));
});

test('a consumer target digest mismatch or a source-SHA-only target remains incomplete', () => {
  for (const revision of ['oci:sha256:' + '9'.repeat(64), `git:${'a'.repeat(40)}`]) {
    const input = makeInput();
    input.bundles[1] = rewriteBundle(input.bundles[1], (record) => { record.target.revision = revision; });
    assert.equal(build(input).verdict, 'incomplete');
  }
});

test('fixture, API-version, profile, and framework revision mismatches remain incomplete', () => {
  const wrongFixture = makeInput();
  wrongFixture.bundles[1] = rewriteBundle(wrongFixture.bundles[1], (record) => { record.target.fixtureVersion = 'old-fixture'; });
  assert.equal(build(wrongFixture).verdict, 'incomplete');

  const wrongProfile = makeInput();
  wrongProfile.bundles[1] = rewriteBundle(wrongProfile.bundles[1], (record) => { record.target.profile = 'e2e'; });
  assert.equal(build(wrongProfile).verdict, 'incomplete');

  const wrongApi = replaceDescriptor(makeInput(), (descriptor) => ({ ...descriptor, apiVersions: ['v1'] }));
  assert.equal(build(wrongApi).verdict, 'incomplete');

  for (const applicationVersion of [undefined, 'latest', '01.2.3']) {
    const wrongApplicationVersion = replaceDescriptor(makeInput(), (descriptor) => ({ ...descriptor, applicationVersion }));
    assert.equal(build(wrongApplicationVersion).verdict, 'incomplete');
  }

  const map = structuredClone(riskMap);
  map.frameworkContexts.find((context) => context.repository === playwright).sourceSha = 'c'.repeat(40);
  assert.equal(build(makeInput(), map).verdict, 'incomplete');
});

test('tampered record bytes and traversal paths are rejected before packet generation', () => {
  const badHash = makeInput();
  badHash.bundles[0].records[0].bytes += ' ';
  assert.throws(() => build(badHash), /Evidence record hash mismatch/);

  const traversal = makeInput();
  const manifest = JSON.parse(traversal.bundles[0].manifestBytes);
  manifest.records[0].path = '../outside.json';
  traversal.bundles[0].manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  traversal.bundles[0].manifestSha256 = hash(traversal.bundles[0].manifestBytes);
  assert.throws(() => build(traversal), /Unsafe manifest record path/);
});

test('unsafe GitHub URLs and secret or signed download URL fields are rejected', () => {
  const unsafe = makeInput();
  unsafe.bundles[0] = rewriteBundle(unsafe.bundles[0], (record) => { record.workflow.url = 'https://attacker.example/run'; });
  assert.throws(() => build(unsafe), /does not match its bundle run identity/);

  const signed = makeInput();
  signed.descriptorReceipt.downloadUrl = 'https://github.com/download?token=private';
  assert.throws(() => build(signed), /downloadUrl is not allowed/);
});

test('expired evidence artifact and invalid descriptor artifacts are incomplete', () => {
  const expiredEvidence = makeInput();
  expiredEvidence.bundles[0].artifactReceipt.expiresAt = new Date(now - 1000).toISOString();
  assert.equal(build(expiredEvidence).verdict, 'incomplete');

  const noCandidateDigest = replaceDescriptor(makeInput(), (descriptor) => ({ ...descriptor, imageDigest: 'ghcr.io/example/latest' }));
  assert.equal(build(noCandidateDigest).verdict, 'incomplete');

  const noArtifactDigest = makeInput();
  noArtifactDigest.descriptorReceipt.artifactSha256 = null;
  assert.equal(build(noArtifactDigest).verdict, 'incomplete');

  const expiredDescriptor = makeInput();
  expiredDescriptor.descriptorReceipt.expiresAt = new Date(now - 1000).toISOString();
  assert.equal(build(expiredDescriptor).verdict, 'incomplete');
});

test('missing and expired risk proofs remain incomplete', () => {
  assert.equal(build(makeInput({ riskProofs: [] })).verdict, 'incomplete');

  const missingFileDigest = makeInput();
  delete missingFileDigest.riskProofs[0].artifactReceipt.artifactFileSha256;
  assert.equal(build(missingFileDigest).verdict, 'incomplete');

  const input = makeInput();
  input.riskProofs[0].artifactReceipt.expiresAt = new Date(now - 1000).toISOString();
  assert.equal(build(input).verdict, 'incomplete');
});

test('a wrong expected control blocks review while an omitted expected testcase stays incomplete', () => {
  const wrong = makeInput();
  wrong.riskProofs[0] = replaceProof(wrong.riskProofs[0], (proof) => ({ ...proof, controlId: 'wrong-control' }));
  assert.equal(build(wrong).verdict, 'blocked');

  const missingTest = makeInput();
  missingTest.riskProofs[0] = replaceProof(missingTest.riskProofs[0], (proof) => ({
    ...proof,
    observedNativeTestIds: proof.observedNativeTestIds.slice(1),
  }));
  assert.equal(build(missingTest).verdict, 'incomplete');
});

test('mutation identity and clean/mutated native result hashes are required', () => {
  const invalidTargetKind = makeInput();
  invalidTargetKind.riskProofs[0] = replaceProof(invalidTargetKind.riskProofs[0], (proof) => ({
    ...proof,
    mutation: { ...proof.mutation, targetKind: 'untyped-digest' },
  }));
  assert.equal(build(invalidTargetKind).verdict, 'blocked');

  for (const transform of [
    (proof) => ({ ...proof, cleanNativeTestIds: [] }),
    (proof) => ({ ...proof, detectedNativeTestIds: [] }),
    (proof) => ({ ...proof, mutatedNativeResultsSha256: 'invalid' }),
    (proof) => ({ ...proof, mutatedRun: { ...proof.mutatedRun, sourceSha: 'e'.repeat(40) } }),
  ]) {
    const invalidProof = makeInput();
    invalidProof.riskProofs[0] = replaceProof(invalidProof.riskProofs[0], transform);
    assert.equal(build(invalidProof).verdict, 'blocked');
  }
});

test('a relevant failed native scope blocks review on the exact candidate', () => {
  const input = makeInput();
  input.bundles[0] = makeBundle(aria, {
    records: [{ scopeId: 'aria.shared-app', profile: null, disposition: 'failed' }],
  });
  const packet = build(input);
  assert.equal(packet.verdict, 'blocked');
  assert.ok(packet.risks.every((risk) => risk.verdict === 'blocked'));
});

test('an unrelated failed legacy-target scope is visible and does not change mapped risk verdicts', () => {
  const input = makeInput();
  input.bundles[0] = makeBundle(aria, {
    records: [
      { scopeId: 'aria.shared-app', profile: null },
      { scopeId: 'aria.deterministic', profile: null, disposition: 'failed' },
    ],
  });
  const packet = build(input);
  assert.equal(packet.verdict, 'ready-for-review');
  assert.equal(packet.unrelatedEvidence.length, 1);
  assert.equal(packet.unrelatedEvidence[0].disposition, 'failed');
  assert.match(packet.unrelatedEvidence[0].impact, /does not prove or disprove/);
});

test('duplicate risks and duplicate source runs are rejected as ambiguous', () => {
  const duplicateRisk = structuredClone(riskMap);
  duplicateRisk.risks.push(structuredClone(duplicateRisk.risks[0]));
  assert.throws(() => build(makeInput(), duplicateRisk), /Invalid risk map.*duplicate risk ID/s);

  const duplicateRun = makeInput();
  duplicateRun.bundles.push(structuredClone(duplicateRun.bundles[0]));
  assert.equal(build(duplicateRun).verdict, 'incomplete');
});

test('an empty evidence input and an invalid candidate descriptor can never become ready', () => {
  assert.notEqual(build(makeInput({ bundles: [], riskProofs: [] })).verdict, 'ready-for-review');
  const malformedDescriptor = makeInput();
  malformedDescriptor.descriptorBytes = '{';
  assert.equal(build(malformedDescriptor).verdict, 'incomplete');
  assert.notEqual(build(makeInput({ bundles: [], riskProofs: [] })).verdict, 'ready-for-review');
  assert.equal(build(makeInput()).candidate.imageDigest, candidateDigest);
  assert.equal(build(makeInput()).candidate.applicationVersion, '0.2.0');
});
