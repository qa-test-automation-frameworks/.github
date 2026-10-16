import './check-runtime.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { validateEvidence } from './evidence-contract.mjs';

const metadataOptions = [
  'repository',
  'run-id',
  'attempt',
  'source-sha',
  'event',
  'branch',
  'workflow-name',
  'conclusion',
  'completed-at',
  'run-url',
];

function argumentsFrom(argv) {
  const values = new Map();
  const inputs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--input') {
      inputs.push(argv[index + 1]);
      index += 1;
    } else if (option.startsWith('--')) {
      values.set(option.slice(2), argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unexpected argument: ${option}`);
    }
  }
  const required = ['output'];
  if (!values.get('metadata-file')) required.push(...metadataOptions);
  const missing = required.filter((key) => !values.get(key));
  if (missing.length) throw new Error(`Missing required options: ${missing.join(', ')}`);
  if ((!inputs.length && !values.get('input-dir')) || inputs.some((input) => !input)) throw new Error('Provide --input files or --input-dir.');
  return { values, inputs };
}

export async function discoverEvidence(directory) {
  const found = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        let record;
        try {
          record = JSON.parse(await readFile(path, 'utf8'));
        } catch (error) {
          if (path.toLowerCase().includes('evidence')) throw new Error(`Unreadable evidence JSON ${path}: ${error.message}`);
          continue;
        }
        if (record?.schemaVersion === 3) found.push(path);
      }
      if (found.length > 1000) throw new Error('Artifact set exceeds the 1,000-record safety limit.');
    }
  }
  await walk(resolve(directory));
  if (!found.length) throw new Error(`No schema-v3 evidence records found under ${directory}.`);
  return found;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sensitiveText = /(?:SYNTHETIC[_ -]?SECRET|SECRET[_ -]?SENTINEL|REDACTION[_ -]?SENTINEL|DO[_ -]?NOT[_ -]?PUBLISH|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

function rejectSensitiveText(value, path = '$') {
  if (typeof value === 'string' && sensitiveText.test(value)) throw new Error(`Evidence contains a secret-like value or redaction sentinel at ${path}.`);
  if (Array.isArray(value)) value.forEach((item, index) => rejectSensitiveText(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) rejectSensitiveText(item, `${path}.${key}`);
  }
}

function sourceMetadata(values) {
  const repository = values.get('repository');
  const runId = values.get('run-id');
  const attempt = Number(values.get('attempt'));
  const sourceSha = values.get('source-sha');
  const runUrl = values.get('run-url');
  const completedAt = values.get('completed-at');
  if (!/^qa-test-automation-frameworks\/[a-z0-9][a-z0-9.-]*$/.test(repository)) throw new Error('Repository must be a qa-test-automation-frameworks owner/name.');
  if (!/^\d+$/.test(runId)) throw new Error('Run ID must be numeric.');
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('Attempt must be a positive integer.');
  if (!/^[a-f0-9]{40,64}$/i.test(sourceSha)) throw new Error('Source SHA must be a full 40–64 character hexadecimal hash.');
  const parsed = new URL(runUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.pathname !== `/${repository}/actions/runs/${runId}` || parsed.search || parsed.hash) {
    throw new Error('Run URL must identify the supplied repository and run ID.');
  }
  if (!Number.isFinite(Date.parse(completedAt)) || new Date(completedAt).toISOString() !== completedAt) throw new Error('Completion time must be an ISO UTC timestamp with milliseconds.');
  if (!['push', 'schedule', 'workflow_dispatch'].includes(values.get('event'))) throw new Error('Only trusted source workflow event types can be published.');
  if (values.get('branch') !== 'main') throw new Error('Only main-branch evidence can be published.');
  if (!['success', 'failure', 'cancelled', 'timed_out', 'action_required'].includes(values.get('conclusion'))) throw new Error('Unsupported source workflow conclusion.');
  if (!values.get('workflow-name') || values.get('workflow-name').length > 500) throw new Error('Workflow name must contain 1–500 characters.');
  return {
    repository,
    runId,
    attempt,
    sourceSha: sourceSha.toLowerCase(),
    event: values.get('event'),
    branch: values.get('branch'),
    workflowName: values.get('workflow-name'),
    conclusion: values.get('conclusion'),
    completedAt,
    runUrl,
  };
}

function latestWins(candidate, existing) {
  if (!existing) return true;
  if (candidate.runId === existing.runId) return candidate.attempt > existing.attempt;
  const time = Date.parse(candidate.completedAt) - Date.parse(existing.completedAt);
  return time > 0;
}

async function atomicFile(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, path);
}

export async function publishEvidence({ metadata, inputs, output, beforeLatest = async () => {} }) {
  rejectSensitiveText(metadata, 'source metadata');
  const records = [];
  const scopes = new Set();
  for (const input of inputs) {
    const bytes = await readFile(input);
    const record = JSON.parse(bytes.toString('utf8'));
    const errors = validateEvidence(record);
    if (errors.length) throw new Error(`${input}: invalid evidence record\n${errors.join('\n')}`);
    rejectSensitiveText(record, input);
    if (record.kind !== 'execution') throw new Error(`${input}: historical attestations cannot be published as current execution.`);
    if (
      record.repository !== metadata.repository ||
      record.workflow.runId !== metadata.runId ||
      record.workflow.attempt !== metadata.attempt ||
      record.sourceSha.toLowerCase() !== metadata.sourceSha ||
      record.workflow.trigger !== metadata.event ||
      record.workflow.branch !== metadata.branch
    ) throw new Error(`${input}: evidence identity does not match the trusted source run.`);
    if (scopes.has(record.scope.id)) throw new Error(`Duplicate scope ID in source run: ${record.scope.id}`);
    scopes.add(record.scope.id);
    records.push({ input, bytes, record, digest: sha256(bytes) });
  }

  const outputRoot = resolve(output);
  const [owner, name] = metadata.repository.split('/');
  const bundleRelative = join('repositories', owner, name, 'runs', metadata.runId, String(metadata.attempt));
  const bundlePath = join(outputRoot, bundleRelative);
  const temporaryBundle = `${bundlePath}.tmp-${process.pid}`;
  const bundleManifest = {
    schemaVersion: 1,
    repository: metadata.repository,
    run: {
      id: metadata.runId,
      attempt: metadata.attempt,
      sourceSha: metadata.sourceSha,
      event: metadata.event,
      branch: metadata.branch,
      workflowName: metadata.workflowName,
      conclusion: metadata.conclusion,
      completedAt: metadata.completedAt,
      url: metadata.runUrl,
    },
    records: records.map(({ record, digest }) => ({
      scope: record.scope.id,
      evidenceClass: record.scope.evidenceClass,
      execution: record.execution.disposition,
      integrity: record.execution.integrity,
      path: `records/${sha256(Buffer.from(record.scope.id)).slice(0, 24)}.json`,
      sha256: digest,
    })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(bundleManifest, null, 2)}\n`);
  const bundleDigest = sha256(manifestBytes);
  const finalLatestPath = join(outputRoot, 'repositories', owner, name, 'latest.json');
  let latest = { schemaVersion: 1, repository: metadata.repository, scopes: {} };
  try {
    latest = JSON.parse(await readFile(finalLatestPath, 'utf8'));
    if (latest.schemaVersion !== 1 || latest.repository !== metadata.repository || !latest.scopes || typeof latest.scopes !== 'object') {
      throw new Error('Existing latest index is malformed or belongs to another repository.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await mkdir(dirname(bundlePath), { recursive: true });
  await rm(temporaryBundle, { recursive: true, force: true });
  await mkdir(join(temporaryBundle, 'records'), { recursive: true });
  for (const { bytes, record } of records) {
    const recordPath = bundleManifest.records.find((entry) => entry.scope === record.scope.id).path;
    await writeFile(join(temporaryBundle, recordPath), bytes);
  }
  await writeFile(join(temporaryBundle, 'manifest.json'), manifestBytes);
  await writeFile(join(temporaryBundle, 'SHA256SUMS'), `${bundleManifest.records.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n')}\n${bundleDigest}  manifest.json\n`);
  try {
    await rename(temporaryBundle, bundlePath);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    const oldManifest = await readFile(join(bundlePath, 'manifest.json'));
    if (sha256(oldManifest) !== bundleDigest) throw new Error('Immutable run/attempt bundle already exists with different contents.');
    for (const entry of bundleManifest.records) {
      const oldRecord = await readFile(join(bundlePath, entry.path));
      if (sha256(oldRecord) !== entry.sha256) throw new Error(`Immutable bundle record is corrupt: ${entry.path}`);
    }
    await rm(temporaryBundle, { recursive: true, force: true });
  }

  const next = structuredClone(latest);
  for (const { record } of records) {
    const current = next.scopes[record.scope.id];
    const pointer = {
      runId: metadata.runId,
      attempt: metadata.attempt,
      completedAt: metadata.completedAt,
      sourceSha: metadata.sourceSha,
      execution: record.execution.disposition,
      workflowConclusion: metadata.conclusion,
      bundle: bundleRelative,
      manifestSha256: bundleDigest,
    };
    if (latestWins(pointer, current)) next.scopes[record.scope.id] = pointer;
  }
  await beforeLatest();
  await atomicFile(finalLatestPath, Buffer.from(`${JSON.stringify(next, null, 2)}\n`));
  return { bundlePath, latestPath: finalLatestPath, bundleDigest, scopes: [...scopes] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, inputs } = argumentsFrom(process.argv.slice(2));
  const metadataValues = values.get('metadata-file')
    ? new Map(Object.entries(JSON.parse(await readFile(values.get('metadata-file'), 'utf8'))))
    : values;
  const metadata = sourceMetadata(metadataValues);
  const output = values.get('output');
  try {
    const selectedInputs = values.get('input-dir') ? await discoverEvidence(values.get('input-dir')) : inputs;
    const result = await publishEvidence({ metadata, inputs: selectedInputs, output });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
