import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const TRIAGE_CLASSES = Object.freeze([
  'product',
  'infrastructure',
  'policy',
  'expected-control',
  'unclassified',
]);

const OWNER = 'qa-test-automation-frameworks';
const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTime(value, label, nowMs, { optional = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (optional) return null;
    throw new Error(`${label} is required.`);
  }
  assert(typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value), `${label} must be an ISO timestamp with a timezone.`);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds), `${label} is not a valid timestamp.`);
  assert(milliseconds <= nowMs, `${label} is in the future.`);
  return milliseconds;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function normalizeConclusion(status, conclusion) {
  if (status !== 'completed') return 'unavailable';
  if (conclusion === 'success') return 'pass';
  if (conclusion === 'cancelled') return 'cancel';
  if (FAILURE_CONCLUSIONS.has(conclusion)) return 'fail';
  return 'unavailable';
}

function parseRepo(repository) {
  assert(typeof repository === 'string', 'repository must be a string.');
  const match = /^([^/]+)\/([^/]+)$/.exec(repository);
  assert(match && match[1].toLowerCase() === OWNER, `repository must be in ${OWNER}/name form.`);
  return repository;
}

function isTrustedGithubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname.startsWith(`/${OWNER}/`)
      && !url.pathname.split('/').some((segment) => segment === '.' || segment === '..');
  } catch {
    return false;
  }
}

function sourceState(source) {
  const supplied = source.evidenceObservations ?? [];
  assert(Array.isArray(supplied), 'evidenceObservations must be an array when supplied.');
  return supplied.map((item, index) => {
    assert(isObject(item), `evidenceObservations[${index}] must be an object.`);
    parseRepo(item.repository);
    assert(typeof item.state === 'string' && item.state.length > 0, `evidenceObservations[${index}].state is required.`);
    const required = item.requiredScopes ?? null;
    const fresh = item.freshRequiredScopes ?? null;
    if (required !== null) assert(Number.isInteger(required) && required >= 0, `evidenceObservations[${index}].requiredScopes must be a non-negative integer or null.`);
    if (fresh !== null) assert(Number.isInteger(fresh) && fresh >= 0, `evidenceObservations[${index}].freshRequiredScopes must be a non-negative integer or null.`);
    if (required !== null && fresh !== null) assert(fresh <= required, `evidenceObservations[${index}] has more fresh than required scopes.`);
    return {
      repository: item.repository,
      state: item.state,
      freshRequiredScopes: fresh,
      requiredScopes: required,
      reasons: Array.isArray(item.reasons) ? item.reasons.filter((reason) => typeof reason === 'string') : [],
    };
  });
}

function normalizeSource(source, windowStart, windowEnd, nowMs) {
  assert(isObject(source), 'Each source must be an object.');
  const repository = parseRepo(source.repository);
  assert(typeof source.workflow === 'string' && source.workflow.trim(), 'source.workflow is required.');
  assert(typeof source.workflowFile === 'string' && /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(source.workflowFile), 'source.workflowFile must be a workflow path inside .github/workflows.');
  assert(Array.isArray(source.runs), 'source.runs must be an array.');
  const expectedOpportunities = source.expectedOpportunities ?? null;
  assert(expectedOpportunities === null || (Number.isInteger(expectedOpportunities) && expectedOpportunities >= 0), 'expectedOpportunities must be a non-negative integer or null.');
  const runsByIdentity = new Map();
  const runs = [];

  for (const [runIndex, run] of source.runs.entries()) {
    assert(isObject(run), `runs[${runIndex}] must be an object.`);
    const id = String(run.id ?? '');
    assert(/^\d+$/.test(id), `runs[${runIndex}].id must be a numeric GitHub run ID.`);
    assert(Number.isInteger(run.run_attempt) && run.run_attempt >= 1, `runs[${runIndex}].run_attempt must be a positive integer.`);
    assert(Number.isInteger(run.run_number) && run.run_number >= 1, `runs[${runIndex}].run_number must be a positive integer.`);
    assert(typeof run.event === 'string' && run.event.trim(), `runs[${runIndex}].event is required.`);
    assert(typeof run.status === 'string' && run.status.trim(), `runs[${runIndex}].status is required.`);
    assert(run.conclusion === null || typeof run.conclusion === 'string', `runs[${runIndex}].conclusion must be a string or null.`);
    assert(typeof run.head_sha === 'string' && /^[0-9a-f]{40}$/i.test(run.head_sha), `runs[${runIndex}].head_sha must be a full Git commit SHA.`);
    const url = run.html_url;
    assert(isTrustedGithubUrl(url), `runs[${runIndex}].html_url must be an organization GitHub URL without credentials or query data.`);
    const createdAt = parseTime(run.created_at, `runs[${runIndex}].created_at`, nowMs);
    const startedAt = parseTime(run.run_started_at, `runs[${runIndex}].run_started_at`, nowMs, { optional: true });
    const updatedAt = parseTime(run.updated_at, `runs[${runIndex}].updated_at`, nowMs, { optional: true });
    const completedAt = parseTime(run.completed_at, `runs[${runIndex}].completed_at`, nowMs, { optional: true });
    const identityTime = startedAt ?? createdAt;
    if (identityTime < windowStart || identityTime > windowEnd) continue;
    if (completedAt !== null && startedAt !== null) assert(completedAt >= startedAt, `runs[${runIndex}] completes before it starts.`);
    if (updatedAt !== null && completedAt !== null) assert(updatedAt >= completedAt, `runs[${runIndex}].updated_at precedes completion.`);
    assert(Array.isArray(run.jobs ?? []), `runs[${runIndex}].jobs must be an array.`);

    const jobsById = new Map();
    const jobs = [];
    for (const [jobIndex, job] of (run.jobs ?? []).entries()) {
      assert(isObject(job), `runs[${runIndex}].jobs[${jobIndex}] must be an object.`);
      const jobId = String(job.id ?? '');
      assert(/^\d+$/.test(jobId), `runs[${runIndex}].jobs[${jobIndex}].id must be a numeric GitHub job ID.`);
      assert(typeof job.name === 'string' && job.name.trim(), `runs[${runIndex}].jobs[${jobIndex}].name is required.`);
      assert(typeof job.status === 'string' && job.status.trim(), `runs[${runIndex}].jobs[${jobIndex}].status is required.`);
      assert(job.conclusion === null || typeof job.conclusion === 'string', `runs[${runIndex}].jobs[${jobIndex}].conclusion must be a string or null.`);
      const jobStart = parseTime(job.started_at, `runs[${runIndex}].jobs[${jobIndex}].started_at`, nowMs, { optional: true });
      const jobEnd = parseTime(job.completed_at, `runs[${runIndex}].jobs[${jobIndex}].completed_at`, nowMs, { optional: true });
      if (jobStart !== null && jobEnd !== null) assert(jobEnd >= jobStart, `runs[${runIndex}].jobs[${jobIndex}] completes before it starts.`);
      const normalized = {
        id: jobId,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: jobStart,
        completedAt: jobEnd,
        outcome: normalizeConclusion(job.status, job.conclusion),
      };
      if (jobsById.has(jobId)) {
        assert(stableJson(jobsById.get(jobId)) === stableJson(normalized), `Conflicting duplicate job ${jobId} in run ${id}, attempt ${run.run_attempt}.`);
        continue;
      }
      jobsById.set(jobId, normalized);
      jobs.push(normalized);
    }

    const reportGeneratedAt = parseTime(run.report_generated_at, `runs[${runIndex}].report_generated_at`, nowMs, { optional: true });
    const publishedAt = parseTime(run.published_at, `runs[${runIndex}].published_at`, nowMs, { optional: true });
    if (reportGeneratedAt !== null && publishedAt !== null) assert(publishedAt >= reportGeneratedAt, `runs[${runIndex}] is published before its report is generated.`);
    const normalized = {
      id,
      runNumber: run.run_number,
      attempt: run.run_attempt,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      outcome: normalizeConclusion(run.status, run.conclusion),
      headSha: run.head_sha.toLowerCase(),
      branch: typeof run.head_branch === 'string' ? run.head_branch : null,
      url,
      createdAt,
      startedAt,
      updatedAt,
      completedAt,
      reportGeneratedAt,
      publishedAt,
      jobs,
    };
    const identity = `${id}#${run.run_attempt}`;
    if (runsByIdentity.has(identity)) {
      assert(stableJson(runsByIdentity.get(identity)) === stableJson(normalized), `Conflicting duplicate run ${identity}.`);
      continue;
    }
    runsByIdentity.set(identity, normalized);
    runs.push(normalized);
  }

  const totalCount = source.totalCount ?? null;
  assert(totalCount === null || (Number.isInteger(totalCount) && totalCount >= 0), 'source.totalCount must be a non-negative integer or null.');
  const truncated = source.paginationIncomplete === true || (totalCount !== null && totalCount > source.runs.length);
  const artifactObservations = source.artifactObservations ?? [];
  assert(Array.isArray(artifactObservations), 'artifactObservations must be an array when supplied.');
  const artifacts = artifactObservations.map((artifact, index) => {
    assert(isObject(artifact), `artifactObservations[${index}] must be an object.`);
    assert(/^\d+$/.test(String(artifact.id ?? '')), `artifactObservations[${index}].id must be numeric.`);
    assert(typeof artifact.name === 'string' && artifact.name.trim(), `artifactObservations[${index}].name is required.`);
    assert(typeof artifact.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(artifact.sha256), `artifactObservations[${index}].sha256 must be a SHA-256 digest.`);
    const createdAt = parseTime(artifact.created_at, `artifactObservations[${index}].created_at`, nowMs);
    return { id: String(artifact.id), name: artifact.name, sha256: artifact.sha256.toLowerCase(), createdAt: new Date(createdAt).toISOString() };
  });
  return {
    repository,
    workflow: source.workflow,
    workflowFile: source.workflowFile,
    expectedOpportunities,
    totalCount,
    paginationIncomplete: truncated,
    runs,
    evidenceObservations: sourceState(source),
    artifactObservations: artifacts,
  };
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function triageKey(source, record) {
  return `${source.repository}\0${source.workflowFile}\0${record.run_id}\0${record.attempt}\0${record.job_id ?? 'run'}`;
}

function makeTriage(sources, records) {
  if (records === null || records === undefined) {
    return {
      status: 'unknown',
      counts: null,
      failureDisposition: 'unknown',
      untriagedFailureCount: null,
      records: [],
      reason: 'No triage records were supplied; incident counts are unknown, not zero.',
    };
  }
  assert(Array.isArray(records), 'triageRecords must be an array when supplied.');
  const knownSources = new Map(sources.map((source) => [`${source.repository}\0${source.workflowFile}`, source]));
  const seen = new Set();
  const normalized = [];
  const counts = Object.fromEntries(TRIAGE_CLASSES.map((category) => [category, 0]));
  for (const [index, record] of records.entries()) {
    assert(isObject(record), `triageRecords[${index}] must be an object.`);
    const repository = parseRepo(record.repository);
    assert(typeof record.workflowFile === 'string', `triageRecords[${index}].workflowFile is required.`);
    assert(typeof record.run_id === 'string' || typeof record.run_id === 'number', `triageRecords[${index}].run_id is required.`);
    assert(Number.isInteger(record.attempt) && record.attempt >= 1, `triageRecords[${index}].attempt must be a positive integer.`);
    assert(record.job_id === null || typeof record.job_id === 'string' || typeof record.job_id === 'number', `triageRecords[${index}].job_id must be numeric or null.`);
    assert(TRIAGE_CLASSES.includes(record.classification), `triageRecords[${index}].classification must be one of: ${TRIAGE_CLASSES.join(', ')}.`);
    assert(typeof record.reason === 'string' && record.reason.trim(), `triageRecords[${index}].reason is required.`);
    const source = knownSources.get(`${repository}\0${record.workflowFile}`);
    assert(source, `triageRecords[${index}] references a source that is not in the snapshot.`);
    const runId = String(record.run_id);
    const run = source.runs.find((item) => item.id === runId && item.attempt === record.attempt);
    assert(run, `triageRecords[${index}] references an unknown run attempt.`);
    if (record.job_id !== null) assert(run.jobs.some((job) => job.id === String(record.job_id)), `triageRecords[${index}] references an unknown job.`);
    const normalizedRecord = {
      repository,
      workflowFile: record.workflowFile,
      run_id: runId,
      attempt: record.attempt,
      job_id: record.job_id === null ? null : String(record.job_id),
      classification: record.classification,
      reason: record.reason.trim(),
    };
    const key = triageKey(source, normalizedRecord);
    assert(!seen.has(key), `Duplicate triage record for run ${runId}, attempt ${record.attempt}.`);
    seen.add(key);
    counts[record.classification] += 1;
    normalized.push(normalizedRecord);
  }

  const failureKeys = new Set();
  for (const source of sources) {
    for (const run of source.runs) {
      const failedJobs = run.jobs.filter((job) => job.outcome === 'fail' || job.outcome === 'cancel');
      if (failedJobs.length > 0) {
        for (const job of failedJobs) failureKeys.add(`${source.repository}\0${source.workflowFile}\0${run.id}\0${run.attempt}\0${job.id}`);
      } else if (run.outcome === 'fail' || run.outcome === 'cancel') {
        failureKeys.add(`${source.repository}\0${source.workflowFile}\0${run.id}\0${run.attempt}\0run`);
      }
    }
  }
  const triagedFailureKeys = new Set(normalized.map((item) => {
    const source = knownSources.get(`${item.repository}\0${item.workflowFile}`);
    return triageKey(source, item);
  }));
  let untriagedFailureCount = 0;
  for (const key of failureKeys) if (!triagedFailureKeys.has(key)) untriagedFailureCount += 1;
  return {
    status: 'provided',
    counts,
    failureDisposition: untriagedFailureCount > 0 ? 'some-failures-untriaged' : 'triage-records-provided',
    untriagedFailureCount,
    records: normalized,
    reason: untriagedFailureCount > 0 ? 'Failures without a matching run/job/attempt triage remain unclassified.' : null,
  };
}

function summarizeSource(source) {
  const firstAttempt = { pass: 0, fail: 0, cancel: 0, unavailable: 0 };
  const logicalRuns = new Map();
  const jobDurations = [];
  const publicationDelays = [];
  let jobsMissingTimestamps = 0;
  for (const run of source.runs) {
    if (run.attempt === 1) firstAttempt[run.outcome] += 1;
    const attempts = logicalRuns.get(run.id) ?? [];
    attempts.push(run);
    logicalRuns.set(run.id, attempts);
    for (const job of run.jobs) {
      if (job.startedAt === null || job.completedAt === null) {
        jobsMissingTimestamps += 1;
        continue;
      }
      jobDurations.push((job.completedAt - job.startedAt) / 1000);
    }
    if (run.reportGeneratedAt !== null && run.publishedAt !== null) {
      publicationDelays.push((run.publishedAt - run.reportGeneratedAt) / 1000);
    }
  }
  let retriedLogicalRuns = 0;
  let recoveredAfterFailureOrCancel = 0;
  let unresolvedAfterFailureOrCancel = 0;
  let otherRetryOutcomes = 0;
  for (const attempts of logicalRuns.values()) {
    attempts.sort((a, b) => a.attempt - b.attempt);
    if (!attempts.some((attempt) => attempt.attempt > 1)) continue;
    retriedLogicalRuns += 1;
    const initial = attempts.find((attempt) => attempt.attempt === 1);
    const later = attempts.filter((attempt) => attempt.attempt > 1);
    if (initial && (initial.outcome === 'fail' || initial.outcome === 'cancel')) {
      if (later.some((attempt) => attempt.outcome === 'pass')) recoveredAfterFailureOrCancel += 1;
      else unresolvedAfterFailureOrCancel += 1;
    } else {
      otherRetryOutcomes += 1;
    }
  }
  return {
    repository: source.repository,
    workflow: source.workflow,
    workflowFile: source.workflowFile,
    expectedOpportunities: source.expectedOpportunities,
    observedRunAttempts: source.runs.length,
    uniqueLogicalRuns: logicalRuns.size,
    firstAttempt,
    retryRecovery: {
      retriedLogicalRuns,
      recoveredAfterFailureOrCancel,
      unresolvedAfterFailureOrCancel,
      otherRetryOutcomes,
    },
    jobElapsed: {
      sampleCount: jobDurations.length,
      p50Seconds: nearestRank(jobDurations, 0.5),
      p95Seconds: nearestRank(jobDurations, 0.95),
      sumJobElapsedSeconds: jobDurations.reduce((sum, duration) => sum + duration, 0),
      jobsMissingTimestamps,
    },
    publicationDelay: {
      sampleCount: publicationDelays.length,
      p50Seconds: nearestRank(publicationDelays, 0.5),
      p95Seconds: nearestRank(publicationDelays, 0.95),
    },
    paginationIncomplete: source.paginationIncomplete,
    totalCount: source.totalCount,
    evidenceObservations: source.evidenceObservations,
    artifactObservations: source.artifactObservations,
  };
}

function normalizeBilling(billing, nowMs) {
  if (billing === null || billing === undefined) {
    return { amount: null, currency: null, source: null, asOf: null, reason: 'No dated billing amount was supplied; elapsed job time is not a cost measure.' };
  }
  assert(isObject(billing), 'billing must be an object when supplied.');
  assert(typeof billing.source === 'string' && billing.source.trim(), 'billing.source is required for a reported currency amount.');
  const asOf = parseTime(billing.asOf, 'billing.asOf', nowMs);
  assert(typeof billing.currency === 'string' && /^[A-Z]{3}$/.test(billing.currency), 'billing.currency must be an uppercase ISO currency code.');
  if (billing.amount === null || billing.amount === undefined) {
    return { amount: null, currency: null, source: billing.source, asOf: new Date(asOf).toISOString(), reason: 'A dated rate or source was supplied without an observed billing total; no cost was calculated.' };
  }
  assert(typeof billing.amount === 'number' && Number.isFinite(billing.amount) && billing.amount >= 0, 'billing.amount must be a non-negative observed amount; a rate alone is insufficient.');
  return { amount: billing.amount, currency: billing.currency, source: billing.source, asOf: new Date(asOf).toISOString(), reason: null };
}

export function buildOperationSummary(snapshot, {
  triageRecords = undefined,
  now = new Date(),
  snapshotSha256 = null,
  triageSha256 = null,
} = {}) {
  assert(isObject(snapshot), 'snapshot must be an object.');
  assert(snapshot.schemaVersion === 1, 'snapshot.schemaVersion must be 1.');
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  assert(Number.isFinite(nowMs), 'now must be a valid timestamp.');
  const window = snapshot.window;
  assert(isObject(window), 'snapshot.window is required.');
  const windowStart = parseTime(window.start, 'window.start', nowMs);
  const windowEnd = parseTime(window.end, 'window.end', nowMs);
  assert(windowEnd >= windowStart, 'window.end must not precede window.start.');
  const generatedAt = parseTime(snapshot.report_generated_at, 'report_generated_at', nowMs, { optional: true });
  assert(Array.isArray(snapshot.sources), 'snapshot.sources must be an array.');
  const sources = snapshot.sources.map((source) => normalizeSource(source, windowStart, windowEnd, nowMs));
  const sourceKeys = new Set();
  for (const source of sources) {
    const key = `${source.repository}\0${source.workflowFile}`;
    assert(!sourceKeys.has(key), `Duplicate source ${source.repository} ${source.workflowFile}.`);
    sourceKeys.add(key);
  }
  const summaries = sources.map(summarizeSource);
  const allRuns = sources.flatMap((source) => source.runs);
  const denominator = sources.reduce((sum, source) => source.expectedOpportunities === null ? sum : sum + source.expectedOpportunities, 0);
  const denominatorKnown = sources.length > 0 && sources.every((source) => source.expectedOpportunities !== null);
  const evidenceStates = summaries.flatMap((source) => source.evidenceObservations);
  const evidenceCounts = Object.create(null);
  for (const observation of evidenceStates) evidenceCounts[observation.state] = (evidenceCounts[observation.state] ?? 0) + 1;
  const incompleteSources = summaries.filter((source) => source.paginationIncomplete).map((source) => ({ repository: source.repository, workflowFile: source.workflowFile, totalCount: source.totalCount, capturedRunAttempts: source.observedRunAttempts }));
  const triage = makeTriage(sources, triageRecords);
  const failures = summaries.reduce((sum, source) => sum + source.firstAttempt.fail, 0);
  const cancellations = summaries.reduce((sum, source) => sum + source.firstAttempt.cancel, 0);
  const unavailable = summaries.reduce((sum, source) => sum + source.firstAttempt.unavailable, 0);
  const hasProblems = failures > 0 || cancellations > 0 || unavailable > 0 || incompleteSources.length > 0 || evidenceStates.some((item) => !['review-ready', 'fresh', 'passed'].includes(item.state));
  const status = allRuns.length === 0 ? 'insufficient-data' : incompleteSources.length > 0 ? 'incomplete' : hasProblems ? 'observed-issues' : 'observed-success';
  const decision = snapshot.decision ?? null;
  if (decision !== null) {
    assert(isObject(decision), 'decision must be an object when supplied.');
    assert(typeof decision.statement === 'string' && decision.statement.trim(), 'decision.statement is required.');
    assert(typeof decision.rationale === 'string' && decision.rationale.trim(), 'decision.rationale is required.');
  }
  return {
    schemaVersion: 1,
    generatedAt: generatedAt === null ? (now instanceof Date ? now.toISOString() : new Date(nowMs).toISOString()) : new Date(generatedAt).toISOString(),
    window: { start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString() },
    status,
    sourceHashes: { snapshotSha256, triageSha256 },
    sources: summaries,
    totals: {
      uniqueLogicalRuns: new Set(sources.flatMap((source) => source.runs.map((run) => `${source.repository}\0${source.workflowFile}\0${run.id}`))).size,
      uniqueRunAttempts: allRuns.length,
      firstAttempt: {
        pass: summaries.reduce((sum, source) => sum + source.firstAttempt.pass, 0),
        fail: failures,
        cancel: cancellations,
        unavailable,
      },
      expectedOpportunities: denominatorKnown ? denominator : null,
      opportunityDenominator: denominatorKnown ? 'known' : 'unknown',
    },
    triage,
    incompleteSources,
    evidenceStates: { observations: evidenceStates, counts: evidenceCounts },
    currencyCost: normalizeBilling(snapshot.billing, nowMs),
    decision: decision ? { statement: decision.statement.trim(), rationale: decision.rationale.trim(), source: decision.source ?? null } : null,
    limitations: [
      'Sum of job elapsed time is the sum of wall-clock durations for jobs and can include overlap; it is not CPU time or billed minutes.',
      'A missing opportunity denominator, triage set, duration timestamp, or billing amount remains unknown and is not reported as zero.',
      'This report describes the supplied run window only and does not establish reduced cost or improved reliability.',
    ],
  };
}

export function renderOperationMarkdown(report) {
  const fmt = (value) => value === null || value === undefined ? 'Not recorded' : String(value);
  const seconds = (value) => value === null || value === undefined ? 'Not recorded' : `${Number(value.toFixed(2))} s`;
  const escape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# Operation and maintenance decision',
    '',
    `**Status:** ${report.status}`, '',
    `**Window:** ${report.window.start} through ${report.window.end} (UTC)`,
    `**Generated:** ${report.generatedAt}`,
    `**Input snapshot SHA-256:** ${fmt(report.sourceHashes.snapshotSha256)}`,
    `**Triage input SHA-256:** ${fmt(report.sourceHashes.triageSha256)}`,
    `**Observed runs / attempts:** ${report.totals.uniqueLogicalRuns} / ${report.totals.uniqueRunAttempts}`,
    `**Expected opportunities:** ${report.totals.opportunityDenominator === 'known' ? report.totals.expectedOpportunities : 'Not recorded'}`,
    '',
    '## Sources',
    '',
    '| Repository | Workflow | Captured attempts | First attempt pass / fail / cancel / unavailable | Incomplete capture | Artifact SHA-256 |',
    '| --- | --- | ---: | --- | --- | --- |',
  ];
  for (const source of report.sources) {
    const f = source.firstAttempt;
    const hashes = source.artifactObservations.map((artifact) => `${artifact.name}: ${artifact.sha256}`).join('<br>') || 'Not recorded';
    lines.push(`| ${escape(source.repository)} | ${escape(source.workflow)} | ${source.observedRunAttempts} | ${f.pass} / ${f.fail} / ${f.cancel} / ${f.unavailable} | ${source.paginationIncomplete ? 'Yes' : 'No'} | ${escape(hashes)} |`);
  }
  if (report.sources.length === 0) lines.push('| Not recorded | Not recorded | 0 | Not recorded | No | Not recorded |');
  lines.push('', '## Durations and retries', '', '| Repository | Workflow | Job duration samples | p50 | p95 | Sum of job elapsed time | Retry recoveries | Publication delay samples |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const source of report.sources) {
    lines.push(`| ${escape(source.repository)} | ${escape(source.workflow)} | ${source.jobElapsed.sampleCount} | ${seconds(source.jobElapsed.p50Seconds)} | ${seconds(source.jobElapsed.p95Seconds)} | ${seconds(source.jobElapsed.sumJobElapsedSeconds)} | ${source.retryRecovery.recoveredAfterFailureOrCancel} | ${source.publicationDelay.sampleCount} |`);
  }
  if (report.sources.length === 0) lines.push('| Not recorded | Not recorded | 0 | Not recorded | Not recorded | Not recorded | 0 | 0 |');
  lines.push('', 'Job-duration percentiles use the nearest-rank method. Sum of job elapsed time can include overlapping jobs; it is not CPU time or billed minutes.', '', '## Evidence and triage', '');
  lines.push(`Triage status: **${report.triage.status}**. ${report.triage.reason ?? ''}`.trim());
  if (report.triage.counts) lines.push(`Triage counts: ${TRIAGE_CLASSES.map((kind) => `${kind} ${report.triage.counts[kind]}`).join(', ')}; untriaged failure observations: ${report.triage.untriagedFailureCount}.`);
  lines.push(`Evidence states: ${Object.keys(report.evidenceStates.counts).length ? Object.entries(report.evidenceStates.counts).map(([state, count]) => `${escape(state)} ${count}`).join(', ') : 'Not recorded'}.`);
  for (const source of report.sources) {
    for (const observation of source.evidenceObservations) {
      lines.push(`- ${escape(observation.repository)}: ${escape(observation.state)} (${fmt(observation.freshRequiredScopes)}/${fmt(observation.requiredScopes)} required scopes fresh).`);
      for (const reason of observation.reasons) lines.push(`  - ${escape(reason)}`);
    }
  }
  if (report.incompleteSources.length) lines.push(`Incomplete captures: ${report.incompleteSources.map((source) => `${source.repository} ${source.workflowFile} (${source.capturedRunAttempts}/${source.totalCount ?? 'unknown'} run attempts)`).join('; ')}.`);
  lines.push('', '## Currency cost', '', report.currencyCost.amount === null
    ? `Not recorded. ${report.currencyCost.reason}`
    : `${report.currencyCost.amount} ${report.currencyCost.currency} from ${escape(report.currencyCost.source)} as of ${report.currencyCost.asOf}.`);
  lines.push('', '## Engineering decision', '');
  if (report.decision) {
    lines.push(`**${escape(report.decision.statement)}**`, '', escape(report.decision.rationale));
    if (report.decision.source) lines.push('', `Source: ${escape(report.decision.source)}`);
  } else {
    lines.push('Not recorded.');
  }
  lines.push('', '## Limits', '', ...report.limitations.map((item) => `- ${item}`), '');
  return lines.join('\n');
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    assert(['--input', '--triage', '--json-out', '--markdown-out'].includes(key), `Unknown argument: ${key}`);
    const value = args[index + 1];
    assert(value && !value.startsWith('--'), `${key} requires a path.`);
    options[key] = value;
    index += 1;
  }
  assert(options['--input'], 'Usage: node scripts/operation-summary.mjs --input snapshot.json [--triage triage.json] [--json-out report.json] [--markdown-out report.md]');
  return options;
}

async function runCli(args) {
  const options = parseArgs(args);
  const snapshotBytes = await readFile(options['--input']);
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
  let triageRecords;
  let triageBytes;
  if (options['--triage']) {
    triageBytes = await readFile(options['--triage']);
    triageRecords = JSON.parse(triageBytes.toString('utf8'));
  }
  const report = buildOperationSummary(snapshot, {
    triageRecords,
    snapshotSha256: createHash('sha256').update(snapshotBytes).digest('hex'),
    triageSha256: triageBytes ? createHash('sha256').update(triageBytes).digest('hex') : null,
  });
  if (options['--json-out']) await writeFile(options['--json-out'], `${JSON.stringify(report, null, 2)}\n`);
  if (options['--markdown-out']) await writeFile(options['--markdown-out'], renderOperationMarkdown(report));
  if (!options['--json-out'] && !options['--markdown-out']) process.stdout.write(`${renderOperationMarkdown(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
