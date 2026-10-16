import './check-runtime.mjs';
import { evidenceFreshness, validateEvidence } from './evidence-contract.mjs';

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
  const result = evidenceFreshness(record, now);
  return { ...result, reasons: [...result.reasons, policies[record.scope.freshnessPolicy].rationale] };
}

export function summarizeEvidence(records, context) {
  if (!Array.isArray(records) || !records.length) {
    return { state: 'evidence-unavailable', requiredCount: 0, freshRequiredCount: 0, scopes: [] };
  }
  const ids = new Set();
  const scopes = records.map((record) => {
    const result = assessEvidenceRecord(record, context);
    const scope = record?.scope ?? {};
    const execution = record?.execution ?? {};
    const workflow = record?.workflow ?? {};
    const publication = record?.publication ?? {};
    const id = scope.id ?? 'unknown';
    if (ids.has(id)) return { id, state: 'invalid', reasons: ['Duplicate latest scope record'] };
    ids.add(id);
    return {
      id,
      evidenceClass: scope.evidenceClass ?? 'unknown',
      required: scope.required === true,
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
    };
  });
  const required = scopes.filter((scope) => scope.required);
  if (!required.length) return { state: 'evidence-unavailable', requiredCount: 0, freshRequiredCount: 0, scopes };
  const state = required.some((scope) => ['failed', 'cancelled'].includes(scope.state))
    ? 'failed'
    : required.some((scope) => scope.state === 'code-mismatch')
      ? 'code-mismatch'
      : required.some((scope) => scope.state === 'stale')
        ? 'evidence-stale'
        : required.every((scope) => scope.state === 'fresh')
          ? 'review-ready'
          : required.some((scope) => scope.state === 'historical')
            ? 'historical'
            : 'evidence-unavailable';
  return {
    state,
    requiredCount: required.length,
    freshRequiredCount: required.filter((scope) => scope.state === 'fresh').length,
    scopes,
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
