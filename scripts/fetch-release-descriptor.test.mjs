import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { fetchReleaseDescriptor, readDescriptorFromZip } from './fetch-release-descriptor.mjs';

const repository = 'qa-test-automation-frameworks/quality-reference-application';
const runId = 12345;
const artifactId = 67890;
const now = Date.parse('2026-10-22T16:00:00.000Z');
const sourceSha = 'a'.repeat(40);
const imageDigest = `sha256:${'b'.repeat(64)}`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, bytes, method = 8, mode = 0o100644 } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(bytes);
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE((mode * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

function makeDescriptor() {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    repository,
    sourceSha,
    applicationVersion: '0.2.0',
    imageDigest,
    fixtureVersion: 'v0.1.0',
    apiVersions: ['v1', 'v2'],
    sourceRun: {
      id: String(runId),
      attempt: 2,
      url: `https://github.com/${repository}/actions/runs/${runId}`,
    },
    generatedAt: new Date(now - 600_000).toISOString(),
  }, null, 2)}\n`);
}

function fixture({ archiveEntries, runChanges = {}, jobChanges = {}, artifactChanges = {} } = {}) {
  const descriptorBytes = makeDescriptor();
  const archive = makeZip(archiveEntries ?? [{ name: 'release-descriptor.json', bytes: descriptorBytes }]);
  const run = {
    id: runId,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    head_sha: sourceSha,
    run_attempt: 2,
    status: 'completed',
    conclusion: 'success',
    repository: { id: 100, full_name: repository },
    head_repository: { id: 100, full_name: repository },
    ...runChanges,
  };
  const jobs = {
    total_count: 2,
    jobs: [
      { name: 'verify', status: 'completed', conclusion: 'success', run_attempt: 2 },
      { name: 'publish', status: 'completed', conclusion: 'success', run_attempt: 2 },
    ].map((job) => ({ ...job, ...(jobChanges[job.name] ?? {}) })),
  };
  const artifact = {
    id: artifactId,
    name: 'qra-release-descriptor',
    expired: false,
    expires_at: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
    size_in_bytes: archive.length,
    digest: `sha256:${hash(archive)}`,
    workflow_run: {
      id: runId,
      repository_id: 100,
      head_repository_id: 100,
      head_sha: sourceSha,
      head_branch: 'main',
    },
    ...artifactChanges,
  };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path.endsWith(`/actions/runs/${runId}`)) {
      return new Response(JSON.stringify(run), { status: 200 });
    }
    if (path.endsWith(`/actions/runs/${runId}/jobs`)) {
      return new Response(JSON.stringify(jobs), { status: 200 });
    }
    if (path.endsWith(`/actions/artifacts/${artifactId}`)) {
      return new Response(JSON.stringify(artifact), { status: 200 });
    }
    if (path.endsWith(`/actions/artifacts/${artifactId}/zip`)) {
      return new Response(archive, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  return { archive, calls, descriptorBytes, fetchImpl, run, jobs, artifact };
}

test('reads exactly one bounded descriptor file from a deflated or stored archive', () => {
  const descriptor = makeDescriptor();
  assert.deepEqual(readDescriptorFromZip(makeZip([{ name: 'release-descriptor.json', bytes: descriptor }])), descriptor);
  assert.deepEqual(readDescriptorFromZip(makeZip([{ name: 'release-descriptor.json', bytes: descriptor, method: 0 }])), descriptor);
});

test('rejects extra files, traversal paths, symlinks, and corrupt ZIP data', () => {
  const descriptor = makeDescriptor();
  assert.throws(() => readDescriptorFromZip(makeZip([
    { name: 'release-descriptor.json', bytes: descriptor },
    { name: 'extra.txt', bytes: 'extra' },
  ])), /exactly one file/);
  assert.throws(() => readDescriptorFromZip(makeZip([{ name: '../release-descriptor.json', bytes: descriptor }])), /only release-descriptor/);
  assert.throws(() => readDescriptorFromZip(makeZip([{ name: 'release-descriptor.json', bytes: descriptor, mode: 0o120777 }])), /non-regular file/);
  const corrupt = makeZip([{ name: 'release-descriptor.json', bytes: descriptor }]);
  corrupt[40] ^= 0xff;
  assert.throws(() => readDescriptorFromZip(corrupt));
});

test('fetches and verifies the exact successful QRA run, required jobs, artifact digest, and descriptor', async () => {
  const mock = fixture();
  const input = await fetchReleaseDescriptor({ runId, artifactId, token: 'read-only-token', fetchImpl: mock.fetchImpl, now });
  assert.equal(input.schemaVersion, 1);
  assert.equal(input.candidateDescriptor.imageDigest, imageDigest);
  assert.equal(input.candidateDescriptor.sourceSha, sourceSha);
  assert.equal(input.descriptorReceipt.artifactSha256, mock.artifact.digest);
  assert.equal(input.descriptorReceipt.descriptorSha256, hash(mock.descriptorBytes));
  assert.equal(input.descriptorReceipt.artifactUrl, `https://github.com/${repository}/actions/runs/${runId}/artifacts/${artifactId}`);
  assert.equal(JSON.stringify(input).includes('read-only-token'), false);
  assert.equal(JSON.stringify(input).includes('downloadUrl'), false);
  assert.ok(mock.calls.every(({ options }) => options.headers.authorization === 'Bearer read-only-token'));

  const publicMock = fixture();
  const publicInput = await fetchReleaseDescriptor({ runId, artifactId, fetchImpl: publicMock.fetchImpl, now });
  assert.equal(publicInput.candidateDescriptor.imageDigest, imageDigest);
  assert.ok(publicMock.calls.every(({ options }) => !Object.hasOwn(options.headers, 'authorization')));
});

test('rejects untrusted runs, failed required jobs, expired artifacts, and mismatched archive digests', async () => {
  const untrustedRun = fixture({ runChanges: { head_branch: 'feature' } });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: untrustedRun.fetchImpl, now }), /successful completed QRA main push/);

  const failedPublish = fixture({ jobChanges: { publish: { conclusion: 'failure' } } });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: failedPublish.fetchImpl, now }), /publish job did not pass/);

  const expiredArtifact = fixture({ artifactChanges: { expires_at: new Date(now - 1).toISOString() } });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: expiredArtifact.fetchImpl, now }), /expired/);

  const badDigest = fixture({ artifactChanges: { digest: `sha256:${'0'.repeat(64)}` } });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: badDigest.fetchImpl, now }), /does not match the GitHub artifact digest/);

  const wrongWorkflow = fixture({ runChanges: { path: '.github/workflows/other.yml@main' } });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: wrongWorkflow.fetchImpl, now }), /successful completed QRA main push/);

  const documentedWorkflowPath = fixture({ runChanges: { path: '.github/workflows/ci.yml@main' } });
  const acceptedPath = await fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: documentedWorkflowPath.fetchImpl, now });
  assert.equal(acceptedPath.descriptorReceipt.workflowPath, '.github/workflows/ci.yml');
});

test('rejects unsupported descriptors and mismatched artifact run identities', async () => {
  const mismatch = fixture({ artifactChanges: { workflow_run: { id: runId + 1 } } });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: mismatch.fetchImpl, now }), /does not match the selected/);

  const extraDescriptor = Buffer.from(`${JSON.stringify({ ...JSON.parse(makeDescriptor()), extra: 'not allowed' })}\n`);
  const extra = fixture({ archiveEntries: [{ name: 'release-descriptor.json', bytes: extraDescriptor }] });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: extra.fetchImpl, now }), /schema or fields are invalid/);

  const invalidVersion = JSON.parse(makeDescriptor());
  invalidVersion.applicationVersion = 'latest';
  const invalidVersionBytes = Buffer.from(`${JSON.stringify(invalidVersion)}\n`);
  const invalidVersionFixture = fixture({ archiveEntries: [{ name: 'release-descriptor.json', bytes: invalidVersionBytes }] });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: invalidVersionFixture.fetchImpl, now }), /application version is invalid/);

  const oversized = fixture({
    archiveEntries: [{ name: 'release-descriptor.json', bytes: Buffer.alloc(65_537, 0x61), method: 0 }],
    artifactChanges: { size_in_bytes: 1 },
  });
  await assert.rejects(fetchReleaseDescriptor({ runId, artifactId, token: 't', fetchImpl: oversized.fetchImpl, now }), /exceeds the 64 KiB limit/);

  await assert.rejects(fetchReleaseDescriptor({ runId: '9007199254740993', artifactId, token: 't', fetchImpl: fixture().fetchImpl, now }), /safe integer/);
});
