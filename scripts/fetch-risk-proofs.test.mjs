import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRiskProofBundle } from './fetch-risk-proofs.mjs';
import { riskMap } from './assurance-packet.fixtures.mjs';

const repository =
  'qa-test-automation-frameworks/quality-reference-application';
const sourceSha = 'a'.repeat(40);
const candidateDigest = `sha256:${'b'.repeat(64)}`;
const now = Date.parse('2026-10-22T16:00:00.000Z');
const run = { id: 1001, run_attempt: 1, head_sha: sourceSha };
const descriptor = { imageDigest: candidateDigest };
const artifactReceipt = {
  schemaVersion: 1,
  repository,
  workflowPath: '.github/workflows/ci.yml',
  event: 'push',
  branch: 'main',
  conclusion: 'success',
  runId: '1001',
  attempt: 1,
  sourceSha,
  artifactName: 'qra-risk-proofs',
  artifactId: '6001',
  artifactSha256: `sha256:${'6'.repeat(64)}`,
  artifactFileName: 'risk-proofs.json',
  artifactFileSha256: '7'.repeat(64),
  artifactUrl: `https://github.com/${repository}/actions/runs/1001/artifacts/6001`,
};

function makeBundle() {
  const generatedAt = new Date(now - 60_000).toISOString();
  return {
    schemaVersion: 1,
    repository,
    sourceRun: { id: '1001', attempt: 1 },
    sourceSha,
    candidateDigest,
    generatedAt,
    proofs: riskMap.risks.map((risk, index) => {
      const expected = risk.expectedFaultControl.nativeTestIds;
      const detecting =
        risk.id === 'API_V1_V2_CLAIM_LIMITS' ? expected[1] : expected[0];
      const cleanResultsSha256 = 'c'.repeat(64);
      const mutatedResultsSha256 = 'd'.repeat(64);
      return {
        schemaVersion: 1,
        riskId: risk.id,
        controlId: risk.expectedFaultControl.id,
        repository,
        sourceSha,
        candidateDigest,
        detectorRepository: repository,
        detectorFrameworkSha: sourceSha,
        expectedNativeTestIds: expected,
        cleanNativeTestIds: expected,
        observedNativeTestIds: expected,
        detectedNativeTestIds: [detecting],
        cleanNativeResultsSha256: cleanResultsSha256,
        mutatedNativeResultsSha256: mutatedResultsSha256,
        cleanExitCode: 0,
        mutatedExitCode: 1,
        outcome: 'detected',
        generatedAt,
        expiresAt: new Date(now + 7 * 24 * 60 * 60_000 - 60_000).toISOString(),
        mutation: {
          cleanCandidateDigest: candidateDigest,
          derivedFromCandidateSha: sourceSha,
          mutatedTargetSourceSha: sourceSha,
          mutatedTargetDigest: `sha256:${String(index + 3).repeat(64)}`,
          patchSha256: String(index + 4).repeat(64),
          controlledFaultConfig: risk.expectedFaultControl.id,
          targetKind: 'mutated-source-tree-v1',
        },
        cleanRun: {
          id: '1001',
          attempt: 1,
          sourceSha,
          jobName: 'risk-proof',
          execution: 'clean-candidate',
          resultSha256: cleanResultsSha256,
        },
        mutatedRun: {
          id: '1001',
          attempt: 1,
          sourceSha,
          jobName: 'risk-proof',
          execution: risk.expectedFaultControl.id,
          resultSha256: mutatedResultsSha256,
        },
      };
    }),
  };
}

test('accepts the exact clean, mutated, candidate-bound native proof set', () => {
  const entries = validateRiskProofBundle(makeBundle(), {
    run,
    descriptor,
    artifactReceipt,
    riskMap,
    now,
  });
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => entry.path),
    [
      'proofs/claim_cross_member_denial.json',
      'proofs/claim_version_conflict.json',
      'proofs/api_v1_v2_claim_limits.json',
    ],
  );
  assert.ok(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  assert.ok(
    entries.every((entry) => entry.artifactReceipt === artifactReceipt),
  );
});

test('rejects missing tests, wrong mutation controls, and candidate identity drift', () => {
  const missingTest = makeBundle();
  missingTest.proofs[0].observedNativeTestIds = [];
  assert.throws(
    () =>
      validateRiskProofBundle(missingTest, {
        run,
        descriptor,
        artifactReceipt,
        riskMap,
        now,
      }),
    /omitted or reordered/,
  );

  const wrongControl = makeBundle();
  wrongControl.proofs[1].mutation.mutatedTargetSourceSha = 'e'.repeat(40);
  assert.throws(
    () =>
      validateRiskProofBundle(wrongControl, {
        run,
        descriptor,
        artifactReceipt,
        riskMap,
        now,
      }),
    /candidate-derived/,
  );

  const wrongCandidate = makeBundle();
  wrongCandidate.proofs[2].candidateDigest = `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () =>
      validateRiskProofBundle(wrongCandidate, {
        run,
        descriptor,
        artifactReceipt,
        riskMap,
        now,
      }),
    /identity does not match/,
  );
});

test('rejects an expired proof and a control that failed to detect its intended test', () => {
  const expired = makeBundle();
  expired.proofs[0].generatedAt = new Date(
    now - 200 * 60 * 60_000,
  ).toISOString();
  expired.proofs[0].expiresAt = new Date(now - 32 * 60 * 60_000).toISOString();
  expired.generatedAt = expired.proofs[0].generatedAt;
  assert.throws(
    () =>
      validateRiskProofBundle(expired, {
        run,
        descriptor,
        artifactReceipt,
        riskMap,
        now,
      }),
    /outside the accepted time window|expired/,
  );

  const wrongDetection = makeBundle();
  wrongDetection.proofs[2].detectedNativeTestIds = [
    riskMap.risks[2].expectedFaultControl.nativeTestIds[0],
  ];
  assert.throws(
    () =>
      validateRiskProofBundle(wrongDetection, {
        run,
        descriptor,
        artifactReceipt,
        riskMap,
        now,
      }),
    /exact expected mutation detection/,
  );
});
