import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAssurancePacket } from './render-assurance-packet.mjs';

function packet(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-22T16:00:00.000Z',
    verdict: 'ready-for-review',
    decisionLimit: 'Human review only.',
    candidate: {
      repository: 'qa-test-automation-frameworks/quality-reference-application',
      sourceSha: 'a'.repeat(40),
      applicationVersion: '0.2.0',
      imageDigest: `sha256:${'b'.repeat(64)}`,
      fixtureVersion: 'v0.1.0',
      apiVersions: ['v1', 'v2'],
      sourceRun: {
        id: '1001',
        attempt: 1,
        url: 'https://github.com/qa-test-automation-frameworks/quality-reference-application/actions/runs/1001',
      },
      descriptorArtifact: {
        artifactId: '6001',
        artifactUrl:
          'https://github.com/qa-test-automation-frameworks/quality-reference-application/actions/runs/1001/artifacts/6001',
        artifactSha256: `sha256:${'c'.repeat(64)}`,
      },
    },
    rollbackEvidence: {
      state: 'complete',
      reasons: [],
      summarySha256: '5'.repeat(64),
      summary: {
        outcome: 'passed',
        digest: `sha256:${'6'.repeat(64)}`,
        sourceRevision: '7'.repeat(40),
        fixtureVersion: 'v0.1.0',
        startedAt: '2026-10-22T15:40:00.000Z',
        completedAt: '2026-10-22T15:41:00.000Z',
        checks: [{ name: 'pinned rollback image readiness and identity', status: 'passed' }],
      },
      workflowRun: {
        id: '3001',
        attempt: 1,
        conclusion: 'failure',
        url: 'https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/runs/3001',
      },
      rollbackJob: {
        id: '3101',
        name: 'shared-app-rollback',
        conclusion: 'success',
        url: 'https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/runs/3001/job/3101',
      },
      artifactReceipt: {
        artifactId: '3201',
        artifactUrl: 'https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/actions/runs/3001/artifacts/3201',
        artifactSha256: `sha256:${'8'.repeat(64)}`,
        artifactFileSha256: '9'.repeat(64),
        expiresAt: '2027-01-20T17:25:51Z',
      },
    },
    risks: [
      {
        id: 'CLAIM_CROSS_MEMBER_DENIAL',
        description: 'Members cannot read each other’s policies.',
        verdict: 'complete',
        expectedFaultControl: 'cross-member-isolation',
        matchedEvidence: [
          {
            repository: 'qa-test-automation-frameworks/aria-api-framework',
            scopeId: 'aria.shared-app',
            disposition: 'passed',
            freshness: 'fresh',
            sourceSha: 'd'.repeat(40),
            frameworkSourceSha: 'd'.repeat(40),
            runId: '2001',
            attempt: 1,
            runUrl:
              'https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/runs/2001',
            bundleArtifactId: '7001',
            bundleArtifactUrl:
              'https://github.com/qa-test-automation-frameworks/aria-api-framework/actions/runs/2001/artifacts/7001',
          },
        ],
        faultControlProof: {
          controlId: 'cross-member-isolation',
          detectorFrameworkSha: 'a'.repeat(40),
          cleanCandidateDigest: `sha256:${'b'.repeat(64)}`,
          mutatedTargetDigest: `sha256:${'e'.repeat(64)}`,
          mutatedTargetKind: 'mutated-source-tree-v1',
          patchSha256: 'f'.repeat(64),
          cleanNativeResultsSha256: '1'.repeat(64),
          mutatedNativeResultsSha256: '2'.repeat(64),
          artifactFileSha256: '3'.repeat(64),
          cleanNativeTestIds: ['identity isolation test'],
          detectedNativeTestIds: ['identity isolation test'],
          cleanRun: { id: '1001', attempt: 1 },
          mutatedRun: { id: '1001', attempt: 1 },
          artifactId: '6002',
          artifactUrl:
            'https://github.com/qa-test-automation-frameworks/quality-reference-application/actions/runs/1001/artifacts/6002',
          artifactSha256: `sha256:${'4'.repeat(64)}`,
        },
        reasons: [],
        residualLimitations: ['Synthetic identities only.'],
      },
    ],
    unrelatedEvidence: [],
    limitations: ['Hashes establish byte integrity only.'],
    ...overrides,
  };
}

test('renders candidate, consumer, mutation, and decision evidence as a static review page', () => {
  const html = renderAssurancePacket(packet());
  assert.match(html, /Release assurance review/);
  assert.match(html, /ready-for-review/);
  assert.match(html, /aria\.shared-app/);
  assert.match(html, /mutated-source-tree-v1/);
  assert.match(html, /artifact 6002/);
  assert.match(html, /Retained rollback evidence/);
  assert.match(html, /workflow conclusion: failure; rollback job conclusion: success/);
  assert.match(html, /artifact 3201/);
  assert.match(html, /Human review only\./);
  assert.doesNotMatch(html, /<script\b/i);
});

test('escapes packet text and only links stable GitHub URLs', () => {
  const html = renderAssurancePacket(
    packet({
      decisionLimit: '</p><script>alert(1)</script>',
      risks: [
        {
          id: 'RISK',
          description: '<img src=x onerror=alert(1)>',
          verdict: 'blocked',
          expectedFaultControl: 'control',
          matchedEvidence: [
            {
              repository: 'qa-test-automation-frameworks/example',
              scopeId: 'scope',
              disposition: 'failed',
              freshness: 'fresh',
              runUrl: 'https://attacker.example/run',
            },
          ],
          faultControlProof: null,
          reasons: ['<svg onload=alert(2)>'],
          residualLimitations: [],
        },
      ],
    }),
  );
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;\/p&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="https:\/\/attacker\.example/);
  assert.doesNotMatch(html, /<script\b/i);
});

test('rejects invalid packet schemas and verdicts', () => {
  assert.throws(
    () =>
      renderAssurancePacket({
        schemaVersion: 2,
        verdict: 'ready-for-review',
        risks: [],
      }),
    /schema or verdict/,
  );
  assert.throws(
    () => renderAssurancePacket(packet({ verdict: 'approved' })),
    /schema or verdict/,
  );
});
