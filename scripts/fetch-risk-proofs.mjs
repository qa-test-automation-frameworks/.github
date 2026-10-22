import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fetchJson,
  fetchReleaseDescriptor,
  readBoundedBody,
  readDescriptorFromZip,
  verifyArtifact,
  verifyJobs,
  verifyRun,
} from './fetch-release-descriptor.mjs';

const REPOSITORY =
  'qa-test-automation-frameworks/quality-reference-application';
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const PROOF_ARTIFACT_NAME = 'qra-risk-proofs';
const DESCRIPTOR_ARTIFACT_NAME = 'qra-release-descriptor';
const API_VERSION = '2026-03-10';
const MAX_BYTES = 64 * 1024;
const RUN_ID = /^[1-9][0-9]*$/;
const SOURCE_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const RISK_MAP = JSON.parse(
  await readFile(
    new URL('../portfolio/risk-map.json', import.meta.url),
    'utf8',
  ),
);
const PROOF_KEYS = [
  'schemaVersion',
  'riskId',
  'controlId',
  'repository',
  'sourceSha',
  'candidateDigest',
  'detectorRepository',
  'detectorFrameworkSha',
  'expectedNativeTestIds',
  'cleanNativeTestIds',
  'observedNativeTestIds',
  'detectedNativeTestIds',
  'cleanNativeResultsSha256',
  'mutatedNativeResultsSha256',
  'cleanExitCode',
  'mutatedExitCode',
  'outcome',
  'generatedAt',
  'expiresAt',
  'mutation',
  'cleanRun',
  'mutatedRun',
];
const MUTATION_KEYS = [
  'cleanCandidateDigest',
  'derivedFromCandidateSha',
  'mutatedTargetSourceSha',
  'mutatedTargetDigest',
  'patchSha256',
  'controlledFaultConfig',
  'targetKind',
];
const RUN_KEYS = [
  'id',
  'attempt',
  'sourceSha',
  'jobName',
  'execution',
  'resultSha256',
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
  );
}

function validTimestamp(value, label, now, { future = false } = {}) {
  requireValue(
    typeof value === 'string' && value.endsWith('Z'),
    `${label} must be a UTC timestamp.`,
  );
  const time = Date.parse(value);
  requireValue(
    Number.isFinite(time) && (future ? time >= now : time <= now),
    `${label} is invalid or outside the accepted time window.`,
  );
  return time;
}

function verifyRiskProofJob(payload, run) {
  requireValue(Array.isArray(payload.jobs), 'QRA workflow jobs are missing.');
  const matches = payload.jobs.filter((job) => job.name === 'risk-proof');
  requireValue(
    matches.length === 1,
    'Workflow run must contain exactly one risk-proof job.',
  );
  const job = matches[0];
  requireValue(
    job.status === 'completed' &&
      job.conclusion === 'success' &&
      (job.run_attempt === undefined || job.run_attempt === run.run_attempt),
    'QRA risk-proof job did not pass on the selected run attempt.',
  );
}

export function validateRiskProofBundle(
  bundle,
  { run, descriptor, artifactReceipt, riskMap = RISK_MAP, now = Date.now() },
) {
  requireValue(
    Number.isFinite(now),
    'A finite verification clock is required.',
  );
  requireValue(
    SOURCE_SHA.test(run?.head_sha ?? '') &&
      SHA256.test(descriptor?.imageDigest ?? ''),
    'Candidate run SHA or descriptor image digest is invalid.',
  );
  requireValue(
    exactKeys(bundle, [
      'schemaVersion',
      'repository',
      'sourceRun',
      'sourceSha',
      'candidateDigest',
      'generatedAt',
      'proofs',
    ]) &&
      bundle.schemaVersion === 1 &&
      bundle.repository === REPOSITORY,
    'QRA risk-proof bundle schema or repository is invalid.',
  );
  requireValue(
    exactKeys(bundle.sourceRun, ['id', 'attempt']) &&
      String(bundle.sourceRun.id) === String(run.id) &&
      bundle.sourceRun.attempt === run.run_attempt &&
      bundle.sourceSha === run.head_sha &&
      bundle.candidateDigest === descriptor.imageDigest,
    'QRA risk-proof bundle is not bound to the selected candidate run and image.',
  );
  validTimestamp(bundle.generatedAt, 'Risk-proof bundle generatedAt', now);
  requireValue(
    Array.isArray(bundle.proofs) &&
      bundle.proofs.length === riskMap.risks.length,
    'Risk-proof bundle does not contain the complete configured risk set.',
  );
  requireValue(
    artifactReceipt?.schemaVersion === 1 &&
      artifactReceipt.repository === REPOSITORY &&
      artifactReceipt.workflowPath === WORKFLOW_PATH &&
      artifactReceipt.event === 'push' &&
      artifactReceipt.branch === 'main' &&
      artifactReceipt.conclusion === 'success' &&
      String(artifactReceipt.runId) === String(run.id) &&
      artifactReceipt.attempt === run.run_attempt &&
      artifactReceipt.sourceSha === run.head_sha &&
      artifactReceipt.artifactName === PROOF_ARTIFACT_NAME &&
      RUN_ID.test(String(artifactReceipt.artifactId ?? '')) &&
      SHA256.test(artifactReceipt.artifactSha256 ?? '') &&
      artifactReceipt.artifactFileName === 'risk-proofs.json' &&
      HEX_SHA256.test(artifactReceipt.artifactFileSha256 ?? '') &&
      artifactReceipt.artifactUrl ===
        `https://github.com/${REPOSITORY}/actions/runs/${run.id}/artifacts/${artifactReceipt.artifactId}`,
    'QRA risk-proof artifact receipt is missing.',
  );

  const entries = [];
  const seen = new Set();
  for (const [index, risk] of riskMap.risks.entries()) {
    const proof = bundle.proofs[index];
    requireValue(
      exactKeys(proof, PROOF_KEYS) && proof.schemaVersion === 1,
      `Risk proof ${risk.id} schema or fields are invalid.`,
    );
    requireValue(
      proof.riskId === risk.id &&
        proof.controlId === risk.expectedFaultControl.id &&
        proof.repository === REPOSITORY &&
        proof.detectorRepository ===
          risk.expectedFaultControl.detectorRepository &&
        proof.sourceSha === run.head_sha &&
        proof.candidateDigest === descriptor.imageDigest &&
        proof.detectorFrameworkSha === run.head_sha,
      `Risk proof ${risk.id} identity does not match its configured candidate and detector.`,
    );
    requireValue(
      JSON.stringify(proof.expectedNativeTestIds) ===
        JSON.stringify(risk.expectedFaultControl.nativeTestIds) &&
        JSON.stringify(proof.cleanNativeTestIds) ===
          JSON.stringify(risk.expectedFaultControl.nativeTestIds) &&
        JSON.stringify(proof.observedNativeTestIds) ===
          JSON.stringify(risk.expectedFaultControl.nativeTestIds),
      `Risk proof ${risk.id} omitted or reordered a required native testcase.`,
    );
    const detectingId =
      risk.id === 'API_V1_V2_CLAIM_LIMITS'
        ? risk.expectedFaultControl.nativeTestIds[1]
        : risk.expectedFaultControl.nativeTestIds[0];
    requireValue(
      proof.outcome === 'detected' &&
        Array.isArray(proof.detectedNativeTestIds) &&
        proof.detectedNativeTestIds.length === 1 &&
        proof.detectedNativeTestIds[0] === detectingId &&
        proof.cleanExitCode === 0 &&
        Number.isInteger(proof.mutatedExitCode) &&
        proof.mutatedExitCode !== 0,
      `Risk proof ${risk.id} did not show a clean pass and the exact expected mutation detection.`,
    );
    requireValue(
      HEX_SHA256.test(proof.cleanNativeResultsSha256) &&
        HEX_SHA256.test(proof.mutatedNativeResultsSha256) &&
        proof.cleanRun?.resultSha256 === proof.cleanNativeResultsSha256 &&
        proof.mutatedRun?.resultSha256 === proof.mutatedNativeResultsSha256,
      `Risk proof ${risk.id} native result hashes are invalid.`,
    );
    requireValue(
      exactKeys(proof.mutation, MUTATION_KEYS) &&
        proof.mutation.cleanCandidateDigest === descriptor.imageDigest &&
        proof.mutation.derivedFromCandidateSha === run.head_sha &&
        proof.mutation.mutatedTargetSourceSha === run.head_sha &&
        SHA256.test(proof.mutation.mutatedTargetDigest) &&
        proof.mutation.mutatedTargetDigest !== descriptor.imageDigest &&
        HEX_SHA256.test(proof.mutation.patchSha256) &&
        proof.mutation.targetKind === 'mutated-source-tree-v1' &&
        typeof proof.mutation.controlledFaultConfig === 'string' &&
        proof.mutation.controlledFaultConfig.trim().length > 0,
      `Risk proof ${risk.id} mutation target is not distinct and candidate-derived.`,
    );
    for (const [runIdentity, execution] of [
      [proof.cleanRun, 'clean-candidate'],
      [proof.mutatedRun, risk.expectedFaultControl.id],
    ]) {
      requireValue(
        exactKeys(runIdentity, RUN_KEYS) &&
          String(runIdentity.id) === String(run.id) &&
          runIdentity.attempt === run.run_attempt &&
          runIdentity.sourceSha === run.head_sha &&
          runIdentity.jobName === 'risk-proof' &&
          runIdentity.execution === execution &&
          HEX_SHA256.test(runIdentity.resultSha256),
        `Risk proof ${risk.id} clean/mutated invocation identity is invalid.`,
      );
    }
    const generated = validTimestamp(
      proof.generatedAt,
      `Risk proof ${risk.id} generatedAt`,
      now,
    );
    const expires = validTimestamp(
      proof.expiresAt,
      `Risk proof ${risk.id} expiresAt`,
      now,
      { future: true },
    );
    requireValue(
      bundle.generatedAt === proof.generatedAt &&
        expires > generated &&
        expires - generated <=
          risk.expectedFaultControl.proofMaxAgeHours * 3_600_000 &&
        now - generated <=
          risk.expectedFaultControl.proofMaxAgeHours * 3_600_000,
      `Risk proof ${risk.id} is expired or outside its configured freshness window.`,
    );
    requireValue(
      !seen.has(proof.riskId),
      `Duplicate risk proof ${proof.riskId}.`,
    );
    seen.add(proof.riskId);
    const bytes = `${JSON.stringify(proof, null, 2)}\n`;
    entries.push({
      path: `proofs/${risk.id.toLowerCase()}.json`,
      bytes,
      sha256: sha256(Buffer.from(bytes)),
      artifactReceipt,
    });
  }
  return entries;
}

async function downloadArtifact({
  artifactId,
  artifactName,
  base,
  run,
  token,
  fetchImpl,
  now,
}) {
  const artifact = await fetchJson(
    `${base}/actions/artifacts/${artifactId}`,
    token,
    fetchImpl,
    `QRA ${artifactName} artifact`,
  );
  verifyArtifact(artifact, run, artifactId, now, artifactName);
  let response;
  try {
    response = await fetchImpl(`${base}/actions/artifacts/${artifactId}/zip`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-github-api-version': API_VERSION,
      },
      redirect: 'follow',
    });
  } catch (error) {
    throw new Error(
      `QRA ${artifactName} archive download failed (${error.name}).`,
    );
  }
  requireValue(
    response.ok,
    `QRA ${artifactName} archive download returned HTTP ${response.status}.`,
  );
  const length = Number(response.headers.get('content-length'));
  requireValue(
    !Number.isFinite(length) || length <= MAX_BYTES,
    `QRA ${artifactName} archive exceeds the 64 KiB limit.`,
  );
  const archive = await readBoundedBody(response);
  requireValue(
    `sha256:${sha256(archive)}` === artifact.digest,
    `QRA ${artifactName} archive digest does not match GitHub metadata.`,
  );
  return { artifact, archive };
}

export async function fetchRiskProofs({
  runId,
  token,
  fetchImpl = fetch,
  now = Date.now(),
  riskMap = RISK_MAP,
}) {
  requireValue(
    Number.isFinite(now),
    'A finite verification clock is required.',
  );
  requireValue(
    RUN_ID.test(String(runId)) && Number.isSafeInteger(Number(runId)),
    'QRA run ID must be a positive numeric ID.',
  );
  requireValue(
    token === undefined || token === null || typeof token === 'string',
    'The QRA Actions token must be a string.',
  );
  const readToken =
    typeof token === 'string' && token.length > 0 ? token : null;
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const run = await fetchJson(
    `${base}/actions/runs/${runId}`,
    readToken,
    fetchImpl,
    'QRA workflow run',
  );
  verifyRun(run, runId);
  const jobs = await fetchJson(
    `${base}/actions/runs/${runId}/jobs?per_page=100&page=1`,
    readToken,
    fetchImpl,
    'QRA workflow jobs',
  );
  verifyJobs(jobs, run);
  verifyRiskProofJob(jobs, run);
  const artifactPage = await fetchJson(
    `${base}/actions/runs/${runId}/artifacts?per_page=100&page=1`,
    readToken,
    fetchImpl,
    'QRA workflow artifacts',
  );
  requireValue(
    Array.isArray(artifactPage.artifacts) &&
      artifactPage.total_count === artifactPage.artifacts.length &&
      artifactPage.total_count <= 100,
    'QRA workflow artifact listing is incomplete or malformed.',
  );
  const proofArtifacts = artifactPage.artifacts.filter(
    (artifact) =>
      artifact.name === PROOF_ARTIFACT_NAME &&
      (artifact.workflow_run?.run_attempt === undefined ||
        artifact.workflow_run.run_attempt === run.run_attempt),
  );
  const descriptorArtifacts = artifactPage.artifacts.filter(
    (artifact) =>
      artifact.name === DESCRIPTOR_ARTIFACT_NAME &&
      (artifact.workflow_run?.run_attempt === undefined ||
        artifact.workflow_run.run_attempt === run.run_attempt),
  );
  requireValue(
    proofArtifacts.length === 1,
    'QRA run must contain exactly one risk-proof artifact for the selected attempt.',
  );
  requireValue(
    descriptorArtifacts.length === 1,
    'QRA run must contain exactly one release-descriptor artifact for the selected attempt.',
  );

  const descriptorInput = await fetchReleaseDescriptor({
    runId,
    artifactId: descriptorArtifacts[0].id,
    token: readToken,
    fetchImpl,
    now,
  });
  const { artifact, archive } = await downloadArtifact({
    artifactId: proofArtifacts[0].id,
    artifactName: PROOF_ARTIFACT_NAME,
    base,
    run,
    token: readToken,
    fetchImpl,
    now,
  });
  const proofFileBytes = readDescriptorFromZip(archive, 'risk-proofs.json');
  requireValue(
    proofFileBytes.length > 0 && proofFileBytes.length <= MAX_BYTES,
    'QRA risk-proof file exceeds the 64 KiB limit.',
  );
  let proofBundle;
  try {
    proofBundle = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(proofFileBytes),
    );
  } catch {
    throw new Error('QRA risk-proof file is not valid UTF-8 JSON.');
  }
  const runUrl = `https://github.com/${REPOSITORY}/actions/runs/${run.id}`;
  const artifactReceipt = {
    schemaVersion: 1,
    repository: REPOSITORY,
    workflowPath: WORKFLOW_PATH,
    event: run.event,
    branch: run.head_branch,
    conclusion: run.conclusion,
    runId: String(run.id),
    attempt: run.run_attempt,
    sourceSha: run.head_sha,
    artifactId: String(artifact.id),
    artifactName: artifact.name,
    artifactUrl: `${runUrl}/artifacts/${artifact.id}`,
    artifactSha256: artifact.digest,
    artifactFileName: 'risk-proofs.json',
    artifactFileSha256: sha256(proofFileBytes),
    expiresAt: artifact.expires_at,
    verifiedAt: new Date(now).toISOString(),
  };
  const riskProofs = validateRiskProofBundle(proofBundle, {
    run,
    descriptor: descriptorInput.candidateDescriptor,
    artifactReceipt,
    riskMap,
    now,
  });
  return {
    schemaVersion: 1,
    candidateDescriptor: descriptorInput.candidateDescriptor,
    descriptorBytes: descriptorInput.descriptorBytes,
    descriptorReceipt: descriptorInput.descriptorReceipt,
    riskProofArtifactReceipt: artifactReceipt,
    riskProofBundleSha256: sha256(proofFileBytes),
    riskProofs,
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!['--run-id', '--output'].includes(key) || !args[index + 1]) {
      throw new Error(
        'Usage: node scripts/fetch-risk-proofs.mjs --run-id <id> --output <path>',
      );
    }
    parsed[key.slice(2)] = args[index + 1];
    index += 1;
  }
  for (const key of ['run-id', 'output'])
    requireValue(parsed[key], `Missing --${key}.`);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.QRA_ACTIONS_READ_TOKEN ?? process.env.GH_TOKEN;
  const input = await fetchRiskProofs({ runId: args['run-id'], token });
  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(input, null, 2)}\n`, {
    flag: 'wx',
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `source_sha=${input.candidateDescriptor.sourceSha}`,
        `image_digest=${input.candidateDescriptor.imageDigest}`,
        `risk_proof_artifact_id=${input.riskProofArtifactReceipt.artifactId}`,
        `risk_proof_artifact_sha256=${input.riskProofArtifactReceipt.artifactSha256}`,
      ].join('\n') + '\n',
    );
  }
  console.log(
    `Verified ${input.riskProofs.length} native risk proofs from QRA run ${input.riskProofArtifactReceipt.runId}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
