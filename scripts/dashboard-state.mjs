import './check-runtime.mjs';
import { evidenceFreshness, validateEvidence } from './evidence-contract.mjs';

function validUtcTime(value, now) {
  const match = typeof value === 'string' &&
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (!match) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  const date = new Date(timestamp);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second
  ) return null;
  return value;
}

export function normalizeRunSummary(run, now) {
  if (!run) return null;
  if (!Number.isFinite(now)) throw new Error('A finite controlled clock is required');
  const completedAt = run.completed_at ?? null;
  const updatedAt = run.updated_at ?? null;
  const completed = validUtcTime(completedAt, now);
  const updated = validUtcTime(updatedAt, now);
  return {
    runId: run.id === undefined || run.id === null ? null : String(run.id),
    attempt: run.run_attempt ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    event: run.event ?? null,
    branch: run.head_branch ?? null,
    headSha: run.head_sha ?? null,
    createdAt: run.created_at ?? null,
    startedAt: run.run_started_at ?? null,
    completedAt,
    updatedAt,
    lastSuccessTimestamp: completed ?? updated,
    lastSuccessTimestampLabel: completed ? 'Completed' : updated ? 'Last updated' : null,
    url: run.html_url ?? null,
  };
}

export function assessEvidenceRecord(record, { repository, currentSha, now, policies }) {
  const errors = validateEvidence(record);
  if (errors.length) return { state: 'invalid', reasons: errors };
  if (record.kind !== 'execution' || record.repository !== repository) {
    return { state: 'invalid', reasons: ['Record kind or repository does not match the portfolio entry'] };
  }
  if (record.execution.disposition !== 'passed') {
    return { state: record.execution.disposition, reasons: [record.execution.reason ?? 'Execution did not pass'] };
  }
  if (!currentSha || record.sourceSha !== currentSha) {
    return { state: 'code-mismatch', reasons: ['Evidence source SHA differs from the current default branch'] };
  }
  if (!Object.hasOwn(policies, record.scope.freshnessPolicy)) {
    return { state: 'invalid', reasons: ['Freshness policy is not declared'] };
  }
  return evidenceFreshness(record, now);
}

export function summarizeEvidence(records, context) {
  const configuredIds = context.requiredScopeIds;
  const requiredScopeIds = Array.isArray(configuredIds)
    ? [...new Set(configuredIds.filter((id) => typeof id === 'string' && id.trim()))]
    : [];
  const registryValid = Array.isArray(configuredIds) &&
    configuredIds.length === requiredScopeIds.length && requiredScopeIds.length > 0;
  const requiredIds = new Set(requiredScopeIds);
  const input = Array.isArray(records) ? records : [];
  const countsById = new Map();
  for (const record of input) {
    const id = record?.scope?.id ?? 'unknown';
    countsById.set(id, (countsById.get(id) ?? 0) + 1);
  }

  const policyMismatches = [];
  if (!registryValid) policyMismatches.push('Repository must declare unique requiredScopeIds');
  const scopes = input.map((record) => {
    const scope = record?.scope ?? {};
    const execution = record?.execution ?? {};
    const workflow = record?.workflow ?? {};
    const publication = record?.publication ?? {};
    const id = scope.id ?? 'unknown';
    const duplicate = countsById.get(id) > 1;
    const result = duplicate
      ? { state: 'invalid', reasons: ['Duplicate latest scope record'] }
      : assessEvidenceRecord(record, context);
    const reasons = [...result.reasons];
    if (scope.required === true && !requiredIds.has(id)) {
      policyMismatches.push(`Incoming required scope ${id} is absent from the repository registry`);
      reasons.push('Incoming required scope is not declared by repository policy');
    }
    if (scope.required === false && requiredIds.has(id)) {
      reasons.push('Repository policy requires this scope despite the record declaration');
    }
    return {
      id,
      evidenceClass: scope.evidenceClass ?? 'unknown',
      required: requiredIds.has(id),
      declaredRequired: scope.required === true,
      freshnessPolicy: scope.freshnessPolicy ?? 'unknown',
      disposition: execution.disposition ?? 'unavailable',
      runId: workflow.runId ?? null,
      attempt: workflow.attempt ?? null,
      sourceSha: record?.sourceSha ?? null,
      completedAt: execution.completedAt ?? null,
      workflowUrl: workflow.url ?? null,
      reportUrl: publication.reportUrl ?? null,
      limitations: Array.isArray(record?.limitations) ? record.limitations : [],
      counts: execution.counts ?? null,
      ...result,
      reasons,
    };
  });

  for (const id of requiredScopeIds) {
    if (!countsById.has(id)) {
      scopes.push({
        id,
        evidenceClass: 'unknown',
        required: true,
        declaredRequired: false,
        freshnessPolicy: 'unknown',
        disposition: 'unavailable',
        runId: null,
        attempt: null,
        sourceSha: null,
        completedAt: null,
        workflowUrl: null,
        reportUrl: null,
        limitations: [],
        counts: null,
        state: 'evidence-unavailable',
        reasons: ['Required scope has no published record'],
      });
    }
  }

  const configuredPairs = Array.isArray(context.controlPairs) ? context.controlPairs : [];
  if (!Array.isArray(context.controlPairs)) {
    policyMismatches.push('Repository controlPairs must be an array');
  }
  const controlPairs = configuredPairs.map((pair) => {
    const pairValid = pair && typeof pair === 'object' &&
      typeof pair.rawScopeId === 'string' && pair.rawScopeId.trim() &&
      typeof pair.verifierScopeId === 'string' && pair.verifierScopeId.trim() &&
      pair.rawScopeId !== pair.verifierScopeId &&
      typeof pair.label === 'string' && pair.label.trim() &&
      !requiredIds.has(pair.rawScopeId) && requiredIds.has(pair.verifierScopeId);
    if (!pairValid) policyMismatches.push('Control-pair registry entry is incomplete');
    if (!pairValid) {
      return {
        id: 'invalid-control-pair',
        label: 'Invalid control-pair mapping',
        rawScopeId: null,
        verifierScopeId: null,
        state: 'unverified',
        message: 'The repository control-pair mapping is incomplete.',
      };
    }
    const raw = input.filter((record) => record?.scope?.id === pair.rawScopeId);
    const verifier = input.filter((record) => record?.scope?.id === pair.verifierScopeId);
    const rawRecord = raw.length === 1 ? raw[0] : null;
    const verifierRecord = verifier.length === 1 ? verifier[0] : null;
    const rawCounts = rawRecord?.execution?.counts;
    const verifierCounts = verifierRecord?.execution?.counts;
    const rawIdentity = rawRecord?.workflow ?? {};
    const verifierIdentity = verifierRecord?.workflow ?? {};
    const rawScopeState = scopes.find((scope) => scope.id === pair.rawScopeId)?.state;
    const verifierScopeState = scopes.find((scope) => scope.id === pair.verifierScopeId)?.state;
    const sameExecution = Boolean(
      rawRecord && verifierRecord &&
      rawRecord.repository === context.repository && verifierRecord.repository === context.repository &&
      rawRecord.sourceSha === context.currentSha && verifierRecord.sourceSha === context.currentSha &&
      rawRecord.sourceSha === verifierRecord.sourceSha &&
      rawIdentity.runId && rawIdentity.runId === verifierIdentity.runId &&
      Number.isSafeInteger(rawIdentity.attempt) && rawIdentity.attempt === verifierIdentity.attempt,
    );
    const rawIsOneRealFailure = Boolean(
      rawRecord && rawRecord.scope.required === false &&
      rawScopeState === 'failed' &&
      rawRecord.execution.disposition === 'failed' && rawRecord.execution.integrity === 'complete' &&
      rawCounts?.selected === 1 && rawCounts?.executed === 1 && rawCounts?.passed === 0 &&
      rawCounts?.failed === 1 && rawCounts?.skipped === 0,
    );
    const verifierIsOnePass = Boolean(
      verifierRecord && verifierScopeState === 'fresh' &&
      verifierRecord.execution.disposition === 'passed' &&
      verifierRecord.execution.integrity === 'complete' && verifierCounts?.selected === 1 &&
      verifierCounts?.executed === 1 && verifierCounts?.passed === 1 &&
      verifierCounts?.failed === 0 && verifierCounts?.skipped === 0,
    );
    const verified = sameExecution && rawIsOneRealFailure && verifierIsOnePass;
    if (!verified) {
      policyMismatches.push(`Control pair ${pair.id ?? pair.label ?? 'unknown'} is not bound to one current execution`);
    }
    return {
      id: pair.id ?? pair.label ?? 'control-pair',
      label: pair.label ?? 'Failure control',
      rawScopeId: pair.rawScopeId,
      verifierScopeId: pair.verifierScopeId,
      state: verified ? 'verified' : 'unverified',
      message: verified
        ? `Expected failure detected; native control failed ${rawCounts.failed}; verifier passed ${verifierCounts.passed}.`
        : 'The raw failure and verifier are missing, invalid, or do not share the current repository, source, run, and attempt.',
    };
  });

  const required = requiredScopeIds.map((id) => scopes.find((scope) => scope.id === id));
  const allRequiredFresh = required.length > 0 && required.every((scope) => scope?.state === 'fresh');
  const controlsVerified = controlPairs.every((pair) => pair.state === 'verified');
  const state = required.some((scope) => ['failed', 'cancelled'].includes(scope?.state))
    ? 'failed'
    : required.some((scope) => scope?.state === 'code-mismatch')
      ? 'code-mismatch'
      : required.some((scope) => scope?.state === 'stale')
        ? 'evidence-stale'
        : allRequiredFresh && controlsVerified && policyMismatches.length === 0
          ? 'review-ready'
          : required.some((scope) => scope?.state === 'historical')
            ? 'historical'
            : 'evidence-unavailable';
  return {
    state,
    requiredScopeIds,
    requiredCount: requiredScopeIds.length,
    freshRequiredCount: required.filter((scope) => scope?.state === 'fresh').length,
    scopes,
    controlPairs,
    policyMismatches,
  };
}

export function publicationState(index, indexStatus, latestAttempt) {
  if (!latestAttempt) return 'evidence-unavailable';
  if (latestAttempt.status === 'in_progress' || latestAttempt.status === 'queued') return 'awaiting-publication';
  if (indexStatus !== 'available') return indexStatus;
  const matching = Object.values(index?.scopes ?? {}).some(
    (scope) => String(scope.runId) === String(latestAttempt.runId) && scope.attempt === latestAttempt.attempt,
  );
  return matching ? 'published' : 'not-published-for-latest-attempt';
}
