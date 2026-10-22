import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ORG = 'qa-test-automation-frameworks';
const REPOSITORY = `${ORG}/quality-reference-application`;
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const ARTIFACT_NAME = 'qra-release-descriptor';
const API_VERSION = '2026-03-10';
const MAX_BYTES = 64 * 1024;
const RUN_ID = /^[1-9][0-9]*$/;
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const FIXTURE_VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DESCRIPTOR_KEYS = [
  'apiVersions',
  'applicationVersion',
  'fixtureVersion',
  'generatedAt',
  'imageDigest',
  'repository',
  'schemaVersion',
  'sourceRun',
  'sourceSha',
];
const SOURCE_RUN_KEYS = ['attempt', 'id', 'url'];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function readUint16(bytes, offset, label) {
  requireValue(offset >= 0 && offset + 2 <= bytes.length, `Malformed ZIP ${label}.`);
  return bytes.readUInt16LE(offset);
}

function readUint32(bytes, offset, label) {
  requireValue(offset >= 0 && offset + 4 <= bytes.length, `Malformed ZIP ${label}.`);
  return bytes.readUInt32LE(offset);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

export async function readBoundedBody(response) {
  requireValue(response.body, 'Descriptor archive download has no response body.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Descriptor archive exceeds the 64 KiB limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function hasZip64Extra(bytes, start, length, label) {
  let offset = start;
  const end = start + length;
  requireValue(end <= bytes.length, `Malformed ZIP ${label} extra fields.`);
  while (offset < end) {
    requireValue(offset + 4 <= end, `Malformed ZIP ${label} extra fields.`);
    const id = readUint16(bytes, offset, `${label} extra ID`);
    const size = readUint16(bytes, offset + 2, `${label} extra size`);
    offset += 4;
    requireValue(offset + size <= end, `Malformed ZIP ${label} extra field.`);
    if (id === 0x0001) return true;
    offset += size;
  }
  return false;
}

export function readDescriptorFromZip(archive, expectedFileName = 'release-descriptor.json') {
  const bytes = Buffer.from(archive);
  requireValue(bytes.length > 0 && bytes.length <= MAX_BYTES, 'Descriptor archive exceeds the 64 KiB limit.');
  requireValue(bytes.length >= 22, 'Descriptor archive is too short to contain a ZIP end record.');

  const searchStart = Math.max(0, bytes.length - 22 - 65_535);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = readUint16(bytes, offset + 20, 'end-record comment length');
    if (offset + 22 + commentLength === bytes.length) {
      endRecord = offset;
      break;
    }
  }
  requireValue(endRecord >= 0, 'Descriptor archive has no valid ZIP end record.');
  requireValue(readUint16(bytes, endRecord + 4, 'disk number') === 0
    && readUint16(bytes, endRecord + 6, 'directory disk') === 0, 'Multi-disk descriptor archives are not allowed.');
  const entriesOnDisk = readUint16(bytes, endRecord + 8, 'entry count');
  const entryCount = readUint16(bytes, endRecord + 10, 'total entry count');
  const directorySize = readUint32(bytes, endRecord + 12, 'directory size');
  const directoryOffset = readUint32(bytes, endRecord + 16, 'directory offset');
  requireValue(entriesOnDisk === 1 && entryCount === 1, 'Descriptor archive must contain exactly one file.');
  requireValue(directoryOffset + directorySize === endRecord, 'Descriptor archive has an unexpected central directory layout.');
  requireValue(directoryOffset > 0, 'Descriptor archive has no local file header.');
  requireValue(directoryOffset + 46 <= endRecord && readUint32(bytes, directoryOffset, 'central header') === 0x02014b50,
    'Descriptor archive central directory is malformed.');

  const madeBy = readUint16(bytes, directoryOffset + 4, 'creator platform') >>> 8;
  const flags = readUint16(bytes, directoryOffset + 8, 'flags');
  const method = readUint16(bytes, directoryOffset + 10, 'compression method');
  const expectedCrc = readUint32(bytes, directoryOffset + 16, 'CRC');
  const compressedSize = readUint32(bytes, directoryOffset + 20, 'compressed size');
  const uncompressedSize = readUint32(bytes, directoryOffset + 24, 'uncompressed size');
  const nameLength = readUint16(bytes, directoryOffset + 28, 'file-name length');
  const extraLength = readUint16(bytes, directoryOffset + 30, 'extra-field length');
  const commentLength = readUint16(bytes, directoryOffset + 32, 'entry comment length');
  const externalAttributes = readUint32(bytes, directoryOffset + 38, 'external attributes');
  const localOffset = readUint32(bytes, directoryOffset + 42, 'local-header offset');
  const nameStart = directoryOffset + 46;
  const nameEnd = nameStart + nameLength;
  const extraStart = nameEnd;
  const commentStart = extraStart + extraLength;
  requireValue(commentStart + commentLength === endRecord, 'Descriptor archive contains trailing central-directory entries.');
  requireValue(!hasZip64Extra(bytes, extraStart, extraLength, 'central'), 'ZIP64 descriptor archives are not allowed.');
  const fileName = decodeUtf8(bytes.subarray(nameStart, nameEnd), 'Descriptor archive path');
  requireValue(fileName === expectedFileName, `Descriptor archive must contain only ${expectedFileName}.`);
  requireValue((flags & (0x0001 | 0x0040 | 0x2000)) === 0, 'Encrypted descriptor archives are not allowed.');
  requireValue(method === 0 || method === 8, 'Descriptor archive uses an unsupported compression method.');
  requireValue(compressedSize <= MAX_BYTES && uncompressedSize <= MAX_BYTES, 'Descriptor file exceeds the 64 KiB limit.');
  if (madeBy === 3) {
    const unixMode = externalAttributes >>> 16;
    const fileType = unixMode & 0o170000;
    requireValue(fileType === 0 || fileType === 0o100000, 'Descriptor archive contains a non-regular file.');
  }
  requireValue((externalAttributes & 0x10) === 0, 'Descriptor archive contains a directory.');

  requireValue(localOffset === 0 && localOffset + 30 <= directoryOffset
    && readUint32(bytes, localOffset, 'local header') === 0x04034b50,
    'Descriptor archive local header is malformed.');
  const localFlags = readUint16(bytes, localOffset + 6, 'local flags');
  const localMethod = readUint16(bytes, localOffset + 8, 'local compression method');
  const localNameLength = readUint16(bytes, localOffset + 26, 'local file-name length');
  const localExtraLength = readUint16(bytes, localOffset + 28, 'local extra-field length');
  const localNameStart = localOffset + 30;
  const localNameEnd = localNameStart + localNameLength;
  const localExtraStart = localNameEnd;
  const dataStart = localExtraStart + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  requireValue(localFlags === flags && localMethod === method, 'Descriptor archive local and central headers disagree.');
  requireValue(decodeUtf8(bytes.subarray(localNameStart, localNameEnd), 'Descriptor archive local path') === fileName,
    'Descriptor archive local path does not match its central directory.');
  requireValue(!hasZip64Extra(bytes, localExtraStart, localExtraLength, 'local'), 'ZIP64 descriptor archives are not allowed.');
  requireValue(dataEnd <= directoryOffset, 'Descriptor archive file data overlaps its central directory.');

  let contents;
  try {
    const compressed = bytes.subarray(dataStart, dataEnd);
    contents = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_BYTES });
  } catch {
    throw new Error('Descriptor archive file data is invalid.');
  }
  requireValue(contents.length === uncompressedSize && crc32(contents) === expectedCrc,
    'Descriptor archive file integrity check failed.');
  return contents;
}

function validateDescriptor(bytes, run, now) {
  requireValue(bytes.length > 0 && bytes.length <= MAX_BYTES, 'Release descriptor exceeds the 64 KiB limit.');
  let descriptor;
  try {
    descriptor = JSON.parse(decodeUtf8(bytes, 'Release descriptor'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Release descriptor is not valid JSON.');
    throw error;
  }
  requireValue(exactKeys(descriptor, DESCRIPTOR_KEYS) && descriptor.schemaVersion === 1,
    'Release descriptor schema or fields are invalid.');
  requireValue(descriptor.repository === REPOSITORY && descriptor.sourceSha === run.head_sha
    && SHA1.test(descriptor.sourceSha), 'Release descriptor repository or source revision does not match its workflow run.');
  requireValue(VERSION.test(descriptor.applicationVersion ?? ''), 'Release descriptor application version is invalid.');
  requireValue(FIXTURE_VERSION.test(descriptor.fixtureVersion ?? ''), 'Release descriptor fixture version is invalid.');
  requireValue(SHA256.test(descriptor.imageDigest ?? ''), 'Release descriptor image digest is not immutable sha256.');
  requireValue(Array.isArray(descriptor.apiVersions) && descriptor.apiVersions.length > 0
    && descriptor.apiVersions.every((version) => ['v1', 'v2'].includes(version))
    && new Set(descriptor.apiVersions).size === descriptor.apiVersions.length,
  'Release descriptor supported API versions are invalid.');
  requireValue(exactKeys(descriptor.sourceRun, SOURCE_RUN_KEYS)
    && String(descriptor.sourceRun.id) === String(run.id)
    && descriptor.sourceRun.attempt === run.run_attempt
    && descriptor.sourceRun.url === `https://github.com/${REPOSITORY}/actions/runs/${run.id}`,
  'Release descriptor run identity does not match its workflow run.');
  const generated = Date.parse(descriptor.generatedAt);
  requireValue(typeof descriptor.generatedAt === 'string' && descriptor.generatedAt.endsWith('Z')
    && Number.isFinite(generated) && generated <= now,
  'Release descriptor generation time is invalid or in the future.');
  return descriptor;
}

export async function fetchJson(url, token, fetchImpl, label) {
  let response;
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': API_VERSION,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: 'error',
    });
  } catch (error) {
    throw new Error(`${label} request failed (${error.name}).`);
  }
  requireValue(response.ok, `${label} request returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} response is not valid JSON.`);
  }
}

export function verifyRun(run, runId) {
  requireValue(run.id === Number(runId) && run.repository?.full_name === REPOSITORY
    && run.head_repository?.full_name === REPOSITORY,
  'Workflow run does not belong to the configured QRA repository.');
  requireValue([WORKFLOW_PATH, `${WORKFLOW_PATH}@main`, `${WORKFLOW_PATH}@refs/heads/main`].includes(run.path)
    && run.event === 'push' && run.head_branch === 'main'
    && run.status === 'completed' && run.conclusion === 'success',
  'Workflow run is not a successful completed QRA main push.');
  requireValue(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 && SHA1.test(run.head_sha ?? ''),
    'Workflow run attempt or source SHA is invalid.');
}

export function verifyJobs(payload, run) {
  requireValue(Array.isArray(payload.jobs) && Number.isSafeInteger(payload.total_count)
    && payload.total_count === payload.jobs.length,
  'Workflow job list is incomplete or malformed.');
  for (const requiredName of ['verify', 'publish']) {
    const matches = payload.jobs.filter((job) => job.name === requiredName);
    requireValue(matches.length === 1, `Workflow run must contain exactly one ${requiredName} job.`);
    const job = matches[0];
    requireValue(job.status === 'completed' && job.conclusion === 'success'
      && (job.run_attempt === undefined || job.run_attempt === run.run_attempt),
    `QRA ${requiredName} job did not pass on the selected run attempt.`);
  }
}

export function verifyArtifact(artifact, run, artifactId, now, artifactName = ARTIFACT_NAME) {
  requireValue(artifact.id === Number(artifactId) && artifact.name === artifactName
    && artifact.expired === false && artifact.workflow_run?.id === run.id
    && artifact.workflow_run?.head_sha === run.head_sha
    && artifact.workflow_run?.head_branch === 'main'
    && artifact.workflow_run?.repository_id === run.repository?.id
    && artifact.workflow_run?.head_repository_id === run.head_repository?.id
    && (artifact.workflow_run?.run_attempt === undefined || artifact.workflow_run.run_attempt === run.run_attempt),
  'Artifact identity does not match the selected successful QRA workflow run.');
  requireValue(SHA256.test(artifact.digest ?? ''), 'Artifact digest is missing or invalid.');
  requireValue(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0
    && artifact.size_in_bytes <= MAX_BYTES,
  'Descriptor artifact archive exceeds the 64 KiB limit.');
  const expiresAt = Date.parse(artifact.expires_at);
  requireValue(Number.isFinite(expiresAt) && expiresAt > now, 'Descriptor artifact is expired or has no valid expiry.');
}

export async function fetchReleaseDescriptor({ runId, artifactId, token, fetchImpl = fetch, now = Date.now() }) {
  requireValue(Number.isFinite(now), 'A finite verification clock is required.');
  requireValue(RUN_ID.test(String(runId)) && RUN_ID.test(String(artifactId)),
    'QRA run and artifact IDs must be positive numeric IDs.');
  requireValue(Number.isSafeInteger(Number(runId)) && Number.isSafeInteger(Number(artifactId)),
    'QRA run and artifact IDs must fit a safe integer.');
  requireValue(token === undefined || token === null || typeof token === 'string', 'The QRA Actions token must be a string.');
  const readToken = typeof token === 'string' && token.length > 0 ? token : null;

  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const run = await fetchJson(`${base}/actions/runs/${runId}`, readToken, fetchImpl, 'QRA workflow run');
  verifyRun(run, runId);
  const jobs = await fetchJson(`${base}/actions/runs/${runId}/jobs?per_page=100&page=1`, readToken, fetchImpl, 'QRA workflow jobs');
  verifyJobs(jobs, run);
  const artifact = await fetchJson(`${base}/actions/artifacts/${artifactId}`, readToken, fetchImpl, 'QRA descriptor artifact');
  verifyArtifact(artifact, run, artifactId, now);
  const downloadUrl = `${base}/actions/artifacts/${artifactId}/zip`;
  let download;
  try {
    download = await fetchImpl(downloadUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(readToken ? { authorization: `Bearer ${readToken}` } : {}),
        'x-github-api-version': API_VERSION,
      },
      redirect: 'follow',
    });
  } catch (error) {
    throw new Error(`QRA descriptor archive download failed (${error.name}).`);
  }
  requireValue(download.ok, `QRA descriptor archive download returned HTTP ${download.status}.`);
  const reportedLength = Number(download.headers.get('content-length'));
  if (Number.isFinite(reportedLength) && reportedLength > MAX_BYTES) {
    throw new Error('Descriptor archive exceeds the 64 KiB limit.');
  }
  let archive;
  try {
    archive = await readBoundedBody(download);
  } catch (error) {
    if (/^Descriptor archive/.test(error.message) || /no response body/.test(error.message)) throw error;
    throw new Error(`QRA descriptor archive could not be read (${error.name}).`);
  }
  requireValue(`sha256:${sha256(archive)}` === artifact.digest, 'Descriptor archive does not match the GitHub artifact digest.');
  const descriptorBytes = readDescriptorFromZip(archive);
  const descriptor = validateDescriptor(descriptorBytes, run, now);
  const runUrl = `https://github.com/${REPOSITORY}/actions/runs/${run.id}`;
  return {
    schemaVersion: 1,
    candidateDescriptor: descriptor,
    descriptorBytes: decodeUtf8(descriptorBytes, 'Release descriptor'),
    descriptorReceipt: {
      schemaVersion: 1,
      repository: REPOSITORY,
      workflowPath: WORKFLOW_PATH,
      event: run.event,
      branch: run.head_branch,
      conclusion: run.conclusion,
      runId: String(run.id),
      attempt: run.run_attempt,
      sourceSha: run.head_sha,
      runUrl,
      artifactId: String(artifact.id),
      artifactName: artifact.name,
      artifactUrl: `${runUrl}/artifacts/${artifact.id}`,
      artifactSha256: artifact.digest,
      descriptorSha256: sha256(descriptorBytes),
      expiresAt: artifact.expires_at,
      verifiedAt: new Date(now).toISOString(),
    },
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!['--run-id', '--artifact-id', '--output'].includes(key) || !args[index + 1]) {
      throw new Error('Usage: node scripts/fetch-release-descriptor.mjs --run-id <id> --artifact-id <id> --output <path>');
    }
    parsed[key.slice(2)] = args[index + 1];
    index += 1;
  }
  for (const key of ['run-id', 'artifact-id', 'output']) requireValue(parsed[key], `Missing --${key}.`);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.QRA_ACTIONS_READ_TOKEN ?? process.env.GH_TOKEN;
  const input = await fetchReleaseDescriptor({ runId: args['run-id'], artifactId: args['artifact-id'], token });
  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(input, null, 2)}\n`, { flag: 'wx' });
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const descriptor = input.candidateDescriptor;
    await appendFile(outputPath, [
      `image_digest=${descriptor.imageDigest}`,
      `source_sha=${descriptor.sourceSha}`,
      `fixture_version=${descriptor.fixtureVersion}`,
      `application_version=${descriptor.applicationVersion}`,
      `api_versions=${descriptor.apiVersions.join(',')}`,
    ].join('\n') + '\n');
  }
  console.log(`Verified QRA release descriptor from run ${input.descriptorReceipt.runId}, artifact ${input.descriptorReceipt.artifactId}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
