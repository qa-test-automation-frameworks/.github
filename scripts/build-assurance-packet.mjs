import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateEvidence, evidenceFreshness } from './evidence-contract.mjs';
import { validateRiskMap } from './validate-risk-map.mjs';

const ORG = 'qa-test-automation-frameworks';
const APP_REPOSITORY = `${ORG}/quality-reference-application`;
const DESCRIPTOR_ARTIFACT = 'qra-release-descriptor';
const PROOF_ARTIFACT = 'qra-risk-proofs';
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const ARTIFACT_SHA256 = /^(?:sha256:)?[0-9a-f]{64}$/;
const SOURCE_SHA = /^[0-9a-f]{40}$/;
const NUMERIC_ID = /^[1-9][0-9]*$/;
const inputSchemaVersion = 1;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function trustedGithubUrl(value, expectedPath) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === expectedPath;
  } catch {
    return false;
  }
}

function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240
    && !value.startsWith('/') && !value.includes('\\')
    && !value.split('/').some((part) => !part || part === '.' || part === '..')
    && !value.includes('%') && !value.includes('\0');
}

function rejectSecretFields(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretFields(item, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:token|authorization|secret|signed.?url|download.?url)/i.test(key)) {
      throw new Error(`${path}.${key} is not allowed in an assurance packet input.`);
    }
    rejectSecretFields(item, `${path}.${key}`);
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function timestamp(value, label, now, { allowExpired = false } = {}) {
  requireValue(typeof value === 'string' && /Z$/.test(value), `${label} must be a UTC timestamp.`);
  const time = Date.parse(value);
  requireValue(Number.isFinite(time), `${label} is not a valid timestamp.`);
  requireValue(time <= now, `${label} is in the future.`);
  if (!allowExpired) requireValue(time >= now, `${label} has expired.`);
  return time;
}

function validateCandidate(input, now) {
  const issues = [];
  const descriptor = input.candidateDescriptor;
  const receipt = input.descriptorReceipt;
  if (!isObject(descriptor) || !isObject(receipt) || typeof input.descriptorBytes !== 'string') {
    return { descriptor: null, issues: ['A release descriptor and its retrieval receipt are required.'] };
  }
  const descriptorBytes = Buffer.from(input.descriptorBytes, 'utf8');
  let parsed;
  try { parsed = parseJsonBytes(descriptorBytes.toString('utf8'), 'candidate descriptor'); }
  catch (error) { return { descriptor: null, issues: [error.message] }; }
  if (JSON.stringify(parsed) !== JSON.stringify(descriptor)) issues.push('Parsed descriptor does not match descriptorBytes.');
  if (descriptor.schemaVersion !== 1) issues.push('Unsupported release descriptor schema version.');
  if (descriptor.repository !== APP_REPOSITORY) issues.push('Candidate repository is not the configured application repository.');
  if (!SOURCE_SHA.test(descriptor.sourceSha ?? '')) issues.push('Candidate source SHA is missing or invalid.');
  if (!SHA256.test(descriptor.imageDigest ?? '')) issues.push('Candidate image digest is missing or is not immutable sha256.');
  if (typeof descriptor.fixtureVersion !== 'string' || !descriptor.fixtureVersion.trim()) issues.push('Candidate fixture version is missing.');
  if (!Array.isArray(descriptor.apiVersions) || !descriptor.apiVersions.length
      || descriptor.apiVersions.some((version) => !['v1', 'v2'].includes(version))
      || new Set(descriptor.apiVersions).size !== descriptor.apiVersions.length) {
    issues.push('Candidate supported API versions are missing or invalid.');
  }
  if (!isObject(descriptor.sourceRun) || !NUMERIC_ID.test(String(descriptor.sourceRun.id ?? ''))
      || !Number.isSafeInteger(descriptor.sourceRun.attempt) || descriptor.sourceRun.attempt < 1
      || !trustedGithubUrl(descriptor.sourceRun.url, `/${APP_REPOSITORY}/actions/runs/${descriptor.sourceRun.id}`)) {
    issues.push('Candidate source run identity or URL is invalid.');
  }
  if (typeof descriptor.generatedAt !== 'string') issues.push('Candidate generation time is missing.');
  else {
    try { timestamp(descriptor.generatedAt, 'candidate generatedAt', now, { allowExpired: true }); } catch (error) { issues.push(error.message); }
  }

  const expectedArtifactUrl = `/${APP_REPOSITORY}/actions/runs/${receipt.runId}/artifacts/${receipt.artifactId}`;
  if (receipt.schemaVersion !== 1 || receipt.repository !== APP_REPOSITORY
      || receipt.workflowPath !== '.github/workflows/ci.yml'
      || receipt.event !== 'push' || receipt.branch !== 'main' || receipt.conclusion !== 'success') {
    issues.push('Descriptor retrieval receipt is not from the successful trusted main push workflow.');
  }
  if (!NUMERIC_ID.test(String(receipt.runId ?? '')) || !NUMERIC_ID.test(String(receipt.artifactId ?? ''))
      || receipt.artifactName !== DESCRIPTOR_ARTIFACT) issues.push('Descriptor artifact identity is invalid.');
  if (!trustedGithubUrl(receipt.artifactUrl, expectedArtifactUrl)) issues.push('Descriptor artifact URL is unsafe or does not match its stable IDs.');
  if (!ARTIFACT_SHA256.test(receipt.artifactSha256 ?? '') || !HEX_SHA256.test(receipt.descriptorSha256 ?? '')) {
    issues.push('Descriptor artifact and file SHA-256 digests are required.');
  }
  if (receipt.descriptorSha256 !== sha256(descriptorBytes)) issues.push('Descriptor bytes do not match the retrieval receipt hash.');
  if (String(receipt.runId) !== String(descriptor.sourceRun?.id) || receipt.attempt !== descriptor.sourceRun?.attempt
      || receipt.sourceSha !== descriptor.sourceSha || receipt.runUrl !== descriptor.sourceRun?.url) {
    issues.push('Descriptor retrieval receipt does not match candidate source run identity.');
  }
  for (const field of ['runUrl']) {
    if (!trustedGithubUrl(receipt[field], `/${APP_REPOSITORY}/actions/runs/${receipt.runId}`)) {
      issues.push(`Descriptor receipt ${field} is unsafe.`);
    }
  }
  try { timestamp(receipt.expiresAt, 'descriptor artifact expiresAt', now); } catch (error) { issues.push(error.message); }
  try { timestamp(receipt.verifiedAt, 'descriptor receipt verifiedAt', now, { allowExpired: true }); } catch (error) { issues.push(error.message); }
  if (issues.length) return { descriptor, issues };
  return { descriptor, issues: [] };
}

function validateArtifactReceipt(receipt, expected, now) {
  const errors = [];
  if (!isObject(receipt)) return ['Artifact retrieval receipt is missing.'];
  if (receipt.schemaVersion !== 1 || receipt.repository !== expected.repository
      || receipt.workflowPath !== '.github/workflows/ci.yml'
      || receipt.event !== (expected.event ?? 'workflow_dispatch') || receipt.branch !== 'main'
      || !(expected.allowFailure ? ['success', 'failure'].includes(receipt.conclusion) : receipt.conclusion === 'success')) {
    errors.push('Evidence artifact is not from an accepted completed main workflow run.');
  }
  if (!NUMERIC_ID.test(String(receipt.runId ?? '')) || !Number.isSafeInteger(receipt.attempt) || receipt.attempt < 1
      || !NUMERIC_ID.test(String(receipt.artifactId ?? '')) || receipt.artifactName !== expected.artifactName) {
    errors.push('Evidence artifact run or artifact identity is invalid.');
  }
  if (!SOURCE_SHA.test(receipt.sourceSha ?? '') || !ARTIFACT_SHA256.test(receipt.artifactSha256 ?? '')) {
    errors.push('Evidence artifact source SHA and Actions artifact digest are required.');
  }
  const expectedPath = `/${receipt.repository}/actions/runs/${receipt.runId}/artifacts/${receipt.artifactId}`;
  if (!trustedGithubUrl(receipt.artifactUrl, expectedPath)) errors.push('Evidence artifact URL is unsafe or does not match its stable IDs.');
  try { timestamp(receipt.expiresAt, 'evidence artifact expiresAt', now); } catch (error) { errors.push(error.message); }
  try { timestamp(receipt.verifiedAt, 'evidence receipt verifiedAt', now, { allowExpired: true }); } catch (error) { errors.push(error.message); }
  return errors;
}

function readBundle(bundle, knownScopes, allowedRepositories, now) {
  requireValue(isObject(bundle), 'Each evidence bundle must be an object.');
  requireValue(typeof bundle.manifestBytes === 'string' && HEX_SHA256.test(bundle.manifestSha256 ?? ''), 'Bundle manifest bytes and SHA-256 are required.');
  requireValue(sha256(bundle.manifestBytes) === bundle.manifestSha256, 'Bundle manifest hash mismatch.');
  const manifest = parseJsonBytes(bundle.manifestBytes, 'bundle manifest');
  const repository = manifest.repository;
  requireValue(manifest.schemaVersion === 1 && SOURCE_SHA.test(manifest.run?.sourceSha ?? ''), 'Bundle manifest schema or source SHA is invalid.');
  requireValue(typeof repository === 'string' && repository.startsWith(`${ORG}/`), 'Bundle repository must belong to the configured organization.');
  requireValue(knownScopes.has(repository), `Unexpected bundle repository ${repository}.`);
  requireValue(allowedRepositories.has(repository), `Unselected consumer repository ${repository} is not part of this risk map.`);
  const expectedArtifactNames = {
    [`${ORG}/aria-api-framework`]: 'evidence-aria-shared-app',
    [`${ORG}/playwright-typescript-framework`]: 'reports-shared-app-ui',
  };
  const receiptErrors = validateArtifactReceipt(bundle.artifactReceipt, {
    repository,
    artifactName: expectedArtifactNames[repository] ?? bundle.artifactReceipt?.artifactName,
    allowFailure: true,
  }, now);
  const run = manifest.run;
  requireValue(isObject(run) && NUMERIC_ID.test(String(run.id ?? '')) && Number.isSafeInteger(run.attempt) && run.attempt > 0,
    'Bundle manifest run identity is invalid.');
  requireValue(trustedGithubUrl(run.url, `/${repository}/actions/runs/${run.id}`), 'Bundle manifest has an unsafe run URL.');
  if (bundle.artifactReceipt?.repository !== repository || String(bundle.artifactReceipt?.runId) !== String(run.id)
      || bundle.artifactReceipt?.attempt !== run.attempt || bundle.artifactReceipt?.sourceSha !== run.sourceSha) {
    receiptErrors.push('Bundle artifact receipt does not match manifest run identity.');
  }
  if (!['success', 'failure'].includes(run.conclusion) || run.branch !== 'main' || run.event !== 'workflow_dispatch') {
    receiptErrors.push('Bundle manifest is not an accepted candidate workflow run on main.');
  }
  if (bundle.artifactReceipt?.conclusion !== run.conclusion) {
    receiptErrors.push('Bundle artifact receipt conclusion does not match the manifest run.');
  }
  requireValue(Array.isArray(manifest.records) && Array.isArray(bundle.records), 'Bundle records are missing.');

  const files = new Map();
  for (const file of bundle.records) {
    requireValue(isObject(file) && safeRelativePath(file.path), `Unsafe bundle record path ${file?.path}.`);
    requireValue(typeof file.bytes === 'string', `Bundle record ${file.path} must include its raw bytes.`);
    requireValue(!files.has(file.path), `Duplicate bundle record path ${file.path}.`);
    files.set(file.path, file.bytes);
  }
  const records = [];
  const referenced = new Set();
  const scopeNames = new Set();
  for (const entry of manifest.records) {
    requireValue(isObject(entry) && safeRelativePath(entry.path), `Unsafe manifest record path ${entry?.path}.`);
    requireValue(HEX_SHA256.test(entry.sha256 ?? ''), `Invalid manifest record hash for ${entry.path}.`);
    const bytes = files.get(entry.path);
    requireValue(typeof bytes === 'string', `Missing record bytes for ${entry.path}.`);
    referenced.add(entry.path);
    requireValue(sha256(bytes) === entry.sha256, `Evidence record hash mismatch for ${entry.path}.`);
    const record = parseJsonBytes(bytes, `evidence record ${entry.path}`);
    const validationErrors = validateEvidence(record);
    const identityMatches = record.repository === repository && record.sourceSha === run.sourceSha
      && record.workflow?.runId === String(run.id) && record.workflow?.attempt === run.attempt
      && record.workflow?.branch === run.branch && record.workflow?.trigger === run.event
      && record.workflow?.url === run.url;
    requireValue(identityMatches, `Evidence record ${entry.path} does not match its bundle run identity.`);
    requireValue(entry.scope === record.scope?.id, `Manifest scope does not match evidence record ${entry.path}.`);
    requireValue(knownScopes.get(repository).has(record.scope?.id), `Unexpected portfolio record reference ${repository}#${record.scope?.id}.`);
    requireValue(!scopeNames.has(record.scope.id), `Duplicate evidence scope ${repository}#${record.scope.id}.`);
    scopeNames.add(record.scope.id);
    records.push({ path: entry.path, record, bytes, validationErrors, receiptErrors });
  }
  requireValue(referenced.size === files.size, 'Bundle contains unreferenced record files.');
  return { repository, run, manifest, records, receiptErrors, artifactReceipt: bundle.artifactReceipt };
}

function inspectFaultProof(proofEntry, risk, candidate, now) {
  if (!proofEntry) return { state: 'incomplete', reasons: ['Expected risk-specific fault proof is missing.'] };
  if (!safeRelativePath(proofEntry.path) || typeof proofEntry.bytes !== 'string'
      || !HEX_SHA256.test(proofEntry.sha256 ?? '') || sha256(proofEntry.bytes) !== proofEntry.sha256) {
    return { state: 'incomplete', reasons: ['Risk-specific fault proof is missing, unsafe, or has an invalid hash.'] };
  }
  let proof;
  try { proof = parseJsonBytes(proofEntry.bytes, `risk proof ${proofEntry.path}`); }
  catch (error) { return { state: 'incomplete', reasons: [error.message] }; }
  const receiptErrors = validateArtifactReceipt(proofEntry.artifactReceipt, {
    repository: APP_REPOSITORY,
    artifactName: PROOF_ARTIFACT,
    event: 'push',
  }, now);
  if (receiptErrors.length) return { state: 'incomplete', reasons: receiptErrors };
  if (String(proofEntry.artifactReceipt.runId) !== String(candidate.sourceRun.id)
      || proofEntry.artifactReceipt.attempt !== candidate.sourceRun.attempt
      || proofEntry.artifactReceipt.sourceSha !== candidate.sourceSha) {
    return { state: 'blocked', reasons: ['Risk proof artifact does not come from the candidate source run.'] };
  }
  const expectedIds = risk.expectedFaultControl.nativeTestIds;
  const observedIds = Array.isArray(proof.observedNativeTestIds) ? proof.observedNativeTestIds : [];
  const missingIds = expectedIds.filter((id) => !observedIds.includes(id));
  const wrongControl = proof.riskId !== risk.id || proof.controlId !== risk.expectedFaultControl.id
    || proof.detectorRepository !== risk.expectedFaultControl.detectorRepository
    || proof.expectedNativeTestIds?.length !== expectedIds.length
    || !expectedIds.every((id) => proof.expectedNativeTestIds?.includes(id));
  if (wrongControl) return { state: 'blocked', reasons: ['Risk proof names the wrong business risk, detector, control, or expected native test set.'], proof };
  if (proof.outcome !== 'detected') return { state: 'blocked', reasons: [`Expected fault control outcome was ${proof.outcome ?? 'missing'}, not detected.`], proof };
  if (missingIds.length) return { state: 'incomplete', reasons: [`Risk-specific native tests are missing: ${missingIds.join(', ')}.`], proof };
  if (proof.schemaVersion !== 1 || proof.repository !== risk.expectedFaultControl.detectorRepository
      || proof.sourceSha !== candidate.sourceSha || proof.candidateDigest !== candidate.imageDigest
      || proof.detectorFrameworkSha !== candidate.sourceSha) {
    return { state: 'blocked', reasons: ['Risk proof is not bound to the exact candidate and detector source.'], proof };
  }
  try {
    const created = timestamp(proof.generatedAt, 'risk proof generatedAt', now, { allowExpired: true });
    const expires = timestamp(proof.expiresAt, 'risk proof expiresAt', now);
    if (now - created > risk.expectedFaultControl.proofMaxAgeHours * 3_600_000) {
      return { state: 'incomplete', reasons: ['Risk-specific fault proof is older than the configured freshness window.'], proof };
    }
    if (expires < created) return { state: 'incomplete', reasons: ['Risk proof expiry precedes its generation time.'], proof };
  } catch (error) {
    return { state: 'incomplete', reasons: [error.message], proof };
  }
  const mutation = proof.mutation;
  if (!isObject(mutation) || mutation.cleanCandidateDigest !== candidate.imageDigest
      || mutation.derivedFromCandidateSha !== candidate.sourceSha
      || !SOURCE_SHA.test(mutation.mutatedTargetSourceSha ?? '')
      || !SHA256.test(mutation.mutatedTargetDigest ?? '') || mutation.mutatedTargetDigest === candidate.imageDigest
      || !(HEX_SHA256.test(mutation.patchSha256 ?? '') || (typeof mutation.controlledFaultConfig === 'string' && mutation.controlledFaultConfig.trim()))) {
    return { state: 'blocked', reasons: ['Fault proof does not describe a distinct, candidate-derived mutated target.'], proof };
  }
  const cleanRun = proof.cleanRun;
  const mutatedRun = proof.mutatedRun;
  if (!isObject(cleanRun) || cleanRun.id !== candidate.sourceRun.id || cleanRun.attempt !== candidate.sourceRun.attempt
      || !isObject(mutatedRun) || !NUMERIC_ID.test(String(mutatedRun.id ?? ''))
      || !Number.isSafeInteger(mutatedRun.attempt) || mutatedRun.attempt < 1) {
    return { state: 'blocked', reasons: ['Clean and mutated fault-control run identities are incomplete or unrelated.'], proof };
  }
  return {
    state: 'complete',
    reasons: [],
    proof: {
      riskId: proof.riskId,
      controlId: proof.controlId,
      sourceSha: proof.sourceSha,
      nativeTestIds: expectedIds,
      cleanCandidateDigest: mutation.cleanCandidateDigest,
      mutatedTargetDigest: mutation.mutatedTargetDigest,
      mutatedTargetSourceSha: mutation.mutatedTargetSourceSha,
      patchSha256: mutation.patchSha256 ?? null,
      controlledFaultConfig: mutation.controlledFaultConfig ?? null,
      detectorFrameworkSha: proof.detectorFrameworkSha,
      cleanRun,
      mutatedRun,
      artifactId: proofEntry.artifactReceipt.artifactId,
      artifactUrl: proofEntry.artifactReceipt.artifactUrl,
      artifactSha256: proofEntry.artifactReceipt.artifactSha256,
      proofSha256: proofEntry.sha256,
    },
  };
}

export function buildAssurancePacket({ riskMap, input, repositoryRegistry, schema, now = Date.now() }) {
  requireValue(Number.isFinite(now), 'A finite controlled clock is required.');
  requireValue(isObject(input) && input.schemaVersion === inputSchemaVersion, 'Assurance packet input schemaVersion must be 1.');
  rejectSecretFields(input);
  const registryErrors = validateRiskMap(riskMap, repositoryRegistry, schema);
  requireValue(registryErrors.length === 0, `Invalid risk map:\n${registryErrors.join('\n')}`);

  const candidateResult = validateCandidate(input, now);
  const descriptor = candidateResult.descriptor;
  const candidateIssues = [...candidateResult.issues];
  const knownScopes = new Map((repositoryRegistry.repositories ?? []).map((repository) => [
    `${ORG}/${repository.name}`,
    new Set(repository.requiredScopeIds ?? []),
  ]));
  const allowedRepositories = new Set(riskMap.frameworkContexts.map((context) => context.repository));
  requireValue(input.bundles === undefined || Array.isArray(input.bundles), 'bundles must be an array when supplied.');
  const bundles = (input.bundles ?? []).map((bundle) => readBundle(bundle, knownScopes, allowedRepositories, now));
  const evidence = bundles.flatMap((bundle) => bundle.records.map((entry) => ({ ...entry, bundle })));
  const proofEntries = input.riskProofs ?? [];
  requireValue(Array.isArray(input.riskProofs ?? []), 'riskProofs must be an array.');
  const knownRiskIds = new Set(riskMap.risks.map((risk) => risk.id));
  const knownControlIds = new Set(riskMap.risks.map((risk) => risk.expectedFaultControl.id));
  for (const entry of proofEntries) {
    requireValue(isObject(entry) && safeRelativePath(entry.path), `Unsafe or missing risk proof path ${entry?.path}.`);
    let proof;
    try { proof = JSON.parse(entry.bytes); } catch { continue; }
    requireValue(knownRiskIds.has(proof.riskId) || knownControlIds.has(proof.controlId), 'Unexpected risk or control reference in proof input.');
  }
  const usedEvidence = new Set();
  const riskRows = riskMap.risks.map((risk) => {
    const reasons = [...candidateIssues];
    const matched = [];
    let state = candidateIssues.length ? 'incomplete' : 'complete';
    if (!descriptor) state = 'incomplete';
    if (descriptor && !risk.relevantApiVersions.every((version) => descriptor.apiVersions?.includes(version))) {
      state = 'incomplete';
      reasons.push('Candidate descriptor does not declare every API version required by this risk.');
    }
    for (const required of risk.requiredScopes) {
      const matches = evidence.filter(({ record }) => record.repository === required.repository && record.scope?.id === required.scopeId);
      if (matches.length !== 1) {
        state = 'incomplete';
        reasons.push(matches.length ? `Scope ${required.repository}#${required.scopeId} is ambiguous across multiple runs.` : `Required scope ${required.repository}#${required.scopeId} is missing.`);
        continue;
      }
      const item = matches[0];
      usedEvidence.add(item);
      const context = riskMap.frameworkContexts.find((entry) => entry.repository === required.repository);
      const record = item.record;
      const receiptReasons = [];
      if (item.receiptErrors.length) receiptReasons.push(...item.receiptErrors);
      if (item.validationErrors.length) receiptReasons.push('Schema-v3 record is invalid.');
      if (record.sourceSha !== context?.sourceSha || item.bundle.run.sourceSha !== context?.sourceSha) {
        receiptReasons.push('Consumer framework source SHA does not match the explicit configured revision.');
      }
      if (!required.allowedProfiles.includes(record.target?.profile)) receiptReasons.push('Consumer evidence profile is not allowed for this risk.');
      if (descriptor && record.target?.fixtureVersion !== descriptor.fixtureVersion) receiptReasons.push('Consumer fixture version does not match the candidate descriptor.');
      const identity = record.target?.identity;
      const revision = record.target?.revision;
      const targetMatches = identity === descriptor?.imageDigest || revision === descriptor?.imageDigest
        || identity === `oci:${descriptor?.imageDigest}` || revision === `oci:${descriptor?.imageDigest}`;
      if (!targetMatches) receiptReasons.push('Consumer evidence is not bound to the candidate image digest; source-SHA-only targets cannot establish candidate identity.');
      const freshness = item.validationErrors.length ? { state: 'invalid', reasons: [] } : evidenceFreshness(record, now);
      if (record.execution.disposition !== 'failed' && freshness.state !== 'fresh') receiptReasons.push(`Consumer evidence freshness is ${freshness.state}.`);
      if (receiptReasons.length) {
        if (state !== 'blocked') state = 'incomplete';
        reasons.push(...receiptReasons.map((reason) => `${required.repository}#${required.scopeId}: ${reason}`));
      } else if (record.execution.disposition === 'failed') {
        state = 'blocked';
        reasons.push(`Required scope ${required.repository}#${required.scopeId} failed on the exact candidate.`);
      } else if (record.execution.disposition !== 'passed') {
        state = 'incomplete';
        reasons.push(`Required scope ${required.repository}#${required.scopeId} is ${record.execution.disposition}.`);
      }
      matched.push({
        repository: record.repository,
        sourceSha: record.sourceSha,
        frameworkRef: context?.ref,
        frameworkSourceSha: context?.sourceSha,
        runId: record.workflow.runId,
        attempt: record.workflow.attempt,
        runUrl: record.workflow.url,
        scopeId: record.scope.id,
        profile: record.target.profile,
        targetIdentity: targetMatches ? record.target.identity : 'non-candidate target identity omitted',
        targetRevision: targetMatches ? record.target.revision : 'non-candidate target revision omitted',
        fixtureVersion: record.target.fixtureVersion,
        disposition: record.execution.disposition,
        freshness: freshness.state,
        recordSha256: sha256(item.bytes),
        bundleArtifactId: item.bundle.artifactReceipt.artifactId,
        bundleArtifactUrl: item.bundle.receiptErrors.length ? null : item.bundle.artifactReceipt.artifactUrl,
        bundleArtifactSha256: item.bundle.artifactReceipt.artifactSha256,
        reasons: receiptReasons,
      });
    }
    const proofCandidates = proofEntries.filter((entry) => {
      if (!safeRelativePath(entry?.path) || typeof entry.bytes !== 'string') return false;
      try {
        const proof = JSON.parse(entry.bytes);
        return proof.riskId === risk.id || proof.controlId === risk.expectedFaultControl.id;
      } catch { return false; }
    });
    const proofResult = descriptor && candidateIssues.length === 0
      ? inspectFaultProof(proofCandidates[0], risk, descriptor, now)
      : { state: 'incomplete', reasons: ['Risk-specific fault proof cannot be matched without a valid verified candidate descriptor.'] };
    if (proofResult.state === 'blocked') state = 'blocked';
    else if (proofResult.state === 'incomplete' && state !== 'blocked') state = 'incomplete';
    reasons.push(...proofResult.reasons);
    return {
      id: risk.id,
      description: risk.description,
      ownerRepository: risk.ownerRepository,
      relevantApiVersions: risk.relevantApiVersions,
      verdict: state,
      expectedFaultControl: risk.expectedFaultControl.id,
      matchedEvidence: matched,
      faultControlProof: proofResult.proof ?? null,
      reasons: [...new Set(reasons)],
      residualLimitations: risk.residualLimitations,
    };
  });

  const unrelatedEvidence = evidence.filter((item) => !usedEvidence.has(item)).map(({ record, bundle, validationErrors, receiptErrors }) => ({
    repository: record.repository,
    sourceSha: record.sourceSha,
    runId: record.workflow.runId,
    attempt: record.workflow.attempt,
    runUrl: record.workflow.url,
    scopeId: record.scope.id,
    disposition: record.execution.disposition,
    impact: 'Unrelated scope; shown for context and does not prove or disprove a mapped risk.',
    targetIdentity: typeof record.target?.identity === 'string' && (SHA256.test(record.target.identity) || record.target.identity.startsWith('oci:sha256:'))
      ? record.target.identity : 'legacy/non-candidate target identity omitted',
    reasons: [...(validationErrors.length ? ['Schema-v3 record is invalid.'] : []), ...receiptErrors],
    artifactId: bundle.artifactReceipt.artifactId,
    artifactUrl: bundle.receiptErrors.length ? null : bundle.artifactReceipt.artifactUrl,
  }));
  const verdict = riskRows.some((risk) => risk.verdict === 'blocked')
    ? 'blocked'
    : riskRows.length > 0 && riskRows.every((risk) => risk.verdict === 'complete')
      ? 'ready-for-review'
      : 'incomplete';
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    verdict,
    decisionLimit: 'Ready for review is evidence for a human release review, not a safety certification or an automatic release decision.',
    candidate: descriptor && candidateIssues.length === 0 ? {
      repository: descriptor.repository,
      sourceSha: descriptor.sourceSha,
      imageDigest: descriptor.imageDigest,
      fixtureVersion: descriptor.fixtureVersion,
      apiVersions: descriptor.apiVersions,
      sourceRun: descriptor.sourceRun,
      generatedAt: descriptor.generatedAt,
      descriptorArtifact: input.descriptorReceipt ? {
        runId: input.descriptorReceipt.runId,
        attempt: input.descriptorReceipt.attempt,
        artifactId: input.descriptorReceipt.artifactId,
        artifactName: input.descriptorReceipt.artifactName,
        artifactUrl: input.descriptorReceipt.artifactUrl,
        artifactSha256: input.descriptorReceipt.artifactSha256,
        descriptorSha256: input.descriptorReceipt.descriptorSha256,
        expiresAt: input.descriptorReceipt.expiresAt,
      } : null,
    } : null,
    risks: riskRows,
    unrelatedEvidence,
    limitations: [
      'Bundle and artifact hashes prove byte integrity only; the caller must retrieve them through the approved read-only GitHub artifact verifier.',
      'Source-SHA-only consumer targets do not prove that the candidate image was exercised.',
      'Missing, stale, incompatible, or invalid evidence remains incomplete; a relevant detected failure blocks review.',
      'Authored offline fixtures demonstrate packet logic only and are not hosted release evidence.',
    ],
  };
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!['--risk-map', '--input', '--output'].includes(key) || !args[index + 1]) {
      throw new Error('Usage: node scripts/build-assurance-packet.mjs --risk-map <path> --input <path> --output <path>');
    }
    result[key.slice(2)] = args[index + 1];
    index += 1;
  }
  for (const key of ['risk-map', 'input', 'output']) requireValue(result[key], `Missing --${key}.`);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [riskMap, input, schema, repositoryRegistry] = await Promise.all([
    readFile(args['risk-map'], 'utf8').then(JSON.parse),
    readFile(args.input, 'utf8').then(JSON.parse),
    readFile(new URL('../portfolio/risk-map.schema.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../portfolio/repositories.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const packet = buildAssurancePacket({ riskMap, input, repositoryRegistry, schema });
  await writeFile(args.output, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`${args.output}: ${packet.verdict} (${packet.risks.length} risks)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
