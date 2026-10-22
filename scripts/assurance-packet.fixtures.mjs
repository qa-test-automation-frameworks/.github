import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
export const riskMap = JSON.parse(readFileSync(new URL('portfolio/risk-map.json', root), 'utf8'));
export const riskMapSchema = JSON.parse(readFileSync(new URL('portfolio/risk-map.schema.json', root), 'utf8'));
export const repositoryRegistry = JSON.parse(readFileSync(new URL('portfolio/repositories.json', root), 'utf8'));
export const now = Date.parse('2026-10-22T16:00:00.000Z');
export const candidateDigest = `sha256:${'1'.repeat(64)}`;
export const candidateSha = 'a'.repeat(40);

const iso = (milliseconds) => new Date(milliseconds).toISOString();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const org = 'qa-test-automation-frameworks';
const appRepository = `${org}/quality-reference-application`;
const descriptor = {
  schemaVersion: 1,
  repository: appRepository,
  sourceSha: candidateSha,
  applicationVersion: '0.2.0',
  imageDigest: candidateDigest,
  fixtureVersion: 'v0.2.0',
  apiVersions: ['v1', 'v2'],
  sourceRun: {
    id: '1001',
    attempt: 1,
    url: `https://github.com/${appRepository}/actions/runs/1001`,
  },
  generatedAt: iso(now - 10 * 60_000),
};

const descriptorBytes = `${JSON.stringify(descriptor, null, 2)}\n`;
const descriptorReceipt = {
  schemaVersion: 1,
  repository: appRepository,
  workflowPath: '.github/workflows/ci.yml',
  event: 'push',
  branch: 'main',
  conclusion: 'success',
  runId: '1001',
  attempt: 1,
  sourceSha: candidateSha,
  runUrl: descriptor.sourceRun.url,
  artifactId: '5001',
  artifactName: 'qra-release-descriptor',
  artifactUrl: `https://github.com/${appRepository}/actions/runs/1001/artifacts/5001`,
  artifactSha256: `sha256:${'2'.repeat(64)}`,
  descriptorSha256: hash(descriptorBytes),
  expiresAt: iso(now + 30 * 24 * 60 * 60_000),
  verifiedAt: iso(now - 8 * 60_000),
};

function baseRecord(repository, scopeId, runId, sourceSha, profile) {
  return {
    schemaVersion: 3,
    kind: 'execution',
    repository,
    sourceSha,
    limitations: ['Synthetic contract fixture; not executed framework evidence.'],
    workflow: {
      id: 'ci.yml',
      name: 'Synthetic candidate workflow',
      runId,
      attempt: 1,
      url: `https://github.com/${repository}/actions/runs/${runId}`,
      trigger: 'workflow_dispatch',
      branch: 'main',
    },
    scope: { id: scopeId, evidenceClass: 'controlled', required: true, freshnessPolicy: 'daily_gate_v1' },
    target: {
      identity: 'quality-reference-application',
      revision: `oci:${candidateDigest}`,
      fixtureVersion: descriptor.fixtureVersion,
      environment: 'isolated-github-actions',
      profile,
      tools: { node: '24.21.0', runner: 'ubuntu-latest' },
    },
    execution: {
      disposition: 'passed',
      reason: null,
      startedAt: iso(now - 30 * 60_000),
      completedAt: iso(now - 25 * 60_000),
      integrity: 'complete',
      counts: {
        unit: 'test_case',
        selected: 3,
        executed: 3,
        passed: 3,
        failed: 0,
        skipped: 0,
        retried: 0,
        semantics: 'Synthetic contract fixture only.',
      },
      measurements: [],
      shards: { expected: [scopeId], received: [scopeId] },
    },
    publication: { disposition: 'pending', reason: null, publishedAt: null, reportUrl: null, artifacts: [] },
    generator: { name: 'assurance_packet_fixture', version: '1.0.0' },
  };
}

export function makeBundle(repository, { sourceSha, runId, records, artifactId, artifactName, artifactDigest, expiresAt } = {}) {
  const context = riskMap.frameworkContexts.find((entry) => entry.repository === repository);
  const selectedSha = sourceSha ?? context.sourceSha;
  const selectedRunId = runId ?? (repository.endsWith('aria-api-framework') ? '2001' : '2002');
  const recordFiles = records.map(({ scopeId, profile, disposition, targetDigest, fixtureVersion, sourceSha: recordSha }) => {
    const record = baseRecord(repository, scopeId, selectedRunId, recordSha ?? selectedSha, profile);
    if (targetDigest) record.target.revision = targetDigest;
    if (fixtureVersion) record.target.fixtureVersion = fixtureVersion;
    if (disposition === 'failed') {
      record.execution.disposition = 'failed';
      record.execution.reason = 'Synthetic relevant failure.';
      record.execution.counts.passed = 2;
      record.execution.counts.failed = 1;
    }
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    return { path: `records/${scopeId.replaceAll('.', '-')}.json`, scopeId, record, bytes };
  });
  const conclusion = recordFiles.some(({ record }) => record.execution.disposition === 'failed') ? 'failure' : 'success';
  const runUrl = `https://github.com/${repository}/actions/runs/${selectedRunId}`;
  const manifest = {
    schemaVersion: 1,
    repository,
    run: {
      id: selectedRunId,
      attempt: 1,
      sourceSha: selectedSha,
      event: 'workflow_dispatch',
      branch: 'main',
      workflowName: 'Synthetic candidate workflow',
      conclusion,
      completedAt: iso(now - 20 * 60_000),
      url: runUrl,
    },
    records: recordFiles.map(({ path, scopeId, record, bytes }) => ({
      scope: scopeId,
      evidenceClass: record.scope.evidenceClass,
      execution: record.execution.disposition,
      integrity: record.execution.integrity,
      path,
      sha256: hash(bytes),
    })),
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const actualArtifactId = artifactId ?? (repository.endsWith('aria-api-framework') ? '3001' : '3002');
  const actualArtifactName = artifactName ?? (repository.endsWith('aria-api-framework') ? 'evidence-aria-shared-app' : 'reports-shared-app-ui');
  const receipt = {
    schemaVersion: 1,
    repository,
    workflowPath: '.github/workflows/ci.yml',
    event: 'workflow_dispatch',
    branch: 'main',
    conclusion,
    runId: selectedRunId,
    attempt: 1,
    sourceSha: selectedSha,
    artifactId: actualArtifactId,
    artifactName: actualArtifactName,
    artifactUrl: `${runUrl}/artifacts/${actualArtifactId}`,
    artifactSha256: artifactDigest ?? `sha256:${'3'.repeat(64)}`,
    expiresAt: expiresAt ?? iso(now + 20 * 24 * 60 * 60_000),
    verifiedAt: iso(now - 15 * 60_000),
  };
  return {
    manifestBytes,
    manifestSha256: hash(manifestBytes),
    artifactReceipt: receipt,
    records: recordFiles.map(({ path, bytes }) => ({ path, bytes })),
  };
}

export function makeProof(risk) {
  const proof = {
    schemaVersion: 1,
    riskId: risk.id,
    controlId: risk.expectedFaultControl.id,
    repository: appRepository,
    sourceSha: candidateSha,
    generatedAt: iso(now - 30 * 60_000),
    expiresAt: iso(now + 7 * 24 * 60 * 60_000),
    outcome: 'detected',
    candidateDigest,
    detectorRepository: risk.expectedFaultControl.detectorRepository,
    detectorFrameworkSha: candidateSha,
    expectedNativeTestIds: risk.expectedFaultControl.nativeTestIds,
    cleanNativeTestIds: risk.expectedFaultControl.nativeTestIds,
    observedNativeTestIds: risk.expectedFaultControl.nativeTestIds,
    detectedNativeTestIds: [risk.expectedFaultControl.nativeTestIds[risk.id === 'API_V1_V2_CLAIM_LIMITS' ? 1 : 0]],
    cleanNativeResultsSha256: 'a'.repeat(64),
    mutatedNativeResultsSha256: 'b'.repeat(64),
    cleanExitCode: 0,
    mutatedExitCode: 1,
    cleanRun: { id: '1001', attempt: 1, sourceSha: candidateSha, jobName: 'risk-proof', execution: 'clean-candidate', resultSha256: 'a'.repeat(64) },
    mutatedRun: { id: '1101', attempt: 1, sourceSha: candidateSha, jobName: 'risk-proof', execution: risk.expectedFaultControl.id, resultSha256: 'b'.repeat(64) },
    mutation: {
      cleanCandidateDigest: candidateDigest,
      mutatedTargetDigest: `sha256:${'4'.repeat(64)}`,
      mutatedTargetSourceSha: candidateSha,
      derivedFromCandidateSha: candidateSha,
      patchSha256: '5'.repeat(64),
      controlledFaultConfig: 'controlled fixture mutation',
      targetKind: 'mutated-source-tree-v1',
    },
  };
  const bytes = `${JSON.stringify(proof, null, 2)}\n`;
  const appRunUrl = `https://github.com/${appRepository}/actions/runs/1001`;
  return {
    path: `proofs/${risk.id.toLowerCase()}.json`,
    bytes,
    sha256: hash(bytes),
    artifactReceipt: {
      schemaVersion: 1,
      repository: appRepository,
      workflowPath: '.github/workflows/ci.yml',
      event: 'push',
      branch: 'main',
      conclusion: 'success',
      runId: '1001',
      attempt: 1,
      sourceSha: candidateSha,
      artifactId: '6001',
      artifactName: 'qra-risk-proofs',
      artifactUrl: `${appRunUrl}/artifacts/6001`,
      artifactSha256: `sha256:${'6'.repeat(64)}`,
      artifactFileName: 'risk-proofs.json',
      artifactFileSha256: '7'.repeat(64),
      expiresAt: iso(now + 20 * 24 * 60 * 60_000),
      verifiedAt: iso(now - 15 * 60_000),
    },
  };
}

export function makeRollbackEvidence({
  runConclusion = 'failure',
  jobConclusion = 'success',
  outcome = 'passed',
} = {}) {
  const repository = `${org}/playwright-typescript-framework`;
  const runId = '4001';
  const attempt = 1;
  const sourceSha = riskMap.frameworkContexts.find((context) => context.repository === repository).sourceSha;
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const jobId = '4101';
  const digest = `sha256:${'8'.repeat(64)}`;
  const summary = {
    check: 'shared-app-immutable-rollback',
    image: `ghcr.io/${appRepository}@${digest}`,
    digest,
    sourceRevision: '9'.repeat(40),
    fixtureVersion: 'v0.1.0',
    startedAt: iso(now - 20 * 60_000),
    checks: [
      { name: 'pinned rollback image readiness and identity', status: 'passed' },
      { name: 'API v1 accepts 1,000,000 cents', status: 'passed' },
      { name: 'API v1 rejects 1,000,001 cents', status: 'passed' },
    ],
    outcome,
    completedAt: iso(now - 19 * 60_000),
  };
  const bytes = `${JSON.stringify(summary, null, 2)}\n`;
  const fileSha256 = hash(bytes);
  return {
    path: 'rollback-summary.json',
    bytes,
    sha256: fileSha256,
    workflowRun: {
      id: runId,
      attempt,
      sourceSha,
      branch: 'main',
      event: 'workflow_dispatch',
      conclusion: runConclusion,
      url: runUrl,
    },
    rollbackJob: {
      id: jobId,
      runId,
      attempt,
      name: 'shared-app-rollback',
      conclusion: jobConclusion,
      url: `${runUrl}/job/${jobId}`,
    },
    artifactReceipt: {
      schemaVersion: 1,
      repository,
      workflowPath: '.github/workflows/ci.yml',
      event: 'workflow_dispatch',
      branch: 'main',
      conclusion: runConclusion,
      runId,
      attempt,
      sourceSha,
      artifactId: '4201',
      artifactName: 'shared-app-rollback-proof',
      artifactUrl: `${runUrl}/artifacts/4201`,
      artifactSha256: `sha256:${'7'.repeat(64)}`,
      artifactFileName: 'rollback-summary.json',
      artifactFileSha256: fileSha256,
      expiresAt: iso(now + 90 * 24 * 60 * 60_000),
      verifiedAt: iso(now - 10 * 60_000),
    },
  };
}

export function makeInput({ bundles, riskProofs, rollbackEvidence } = {}) {
  return {
    schemaVersion: 1,
    candidateDescriptor: structuredClone(descriptor),
    descriptorBytes,
    descriptorReceipt: structuredClone(descriptorReceipt),
    rollbackEvidence: rollbackEvidence === undefined ? makeRollbackEvidence() : rollbackEvidence,
    bundles: bundles ?? [
      makeBundle(`${org}/aria-api-framework`, {
        records: [{ scopeId: 'aria.shared-app', profile: null }],
      }),
      makeBundle(`${org}/playwright-typescript-framework`, {
        records: [{ scopeId: 'shared-app-ui', profile: 'shared-app-ui' }],
      }),
    ],
    riskProofs: riskProofs ?? riskMap.risks.map(makeProof),
  };
}

export function replaceDescriptor(input, transform) {
  const updated = structuredClone(input);
  updated.candidateDescriptor = transform(updated.candidateDescriptor);
  updated.descriptorBytes = `${JSON.stringify(updated.candidateDescriptor, null, 2)}\n`;
  updated.descriptorReceipt.descriptorSha256 = hash(updated.descriptorBytes);
  return updated;
}

export function replaceProof(entry, transform) {
  const updated = structuredClone(entry);
  const proof = transform(JSON.parse(updated.bytes));
  updated.bytes = `${JSON.stringify(proof, null, 2)}\n`;
  updated.sha256 = hash(updated.bytes);
  return updated;
}
