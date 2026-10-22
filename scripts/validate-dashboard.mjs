import './check-runtime.mjs';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../site/data/portfolio.json', import.meta.url), 'utf8'));
const allowedEvidenceStates = new Set([
  'review-ready',
  'evidence-stale',
  'evidence-unavailable',
  'code-mismatch',
  'failed',
  'cancelled',
  'historical',
]);
const trustedEvents = new Set(['push', 'schedule', 'workflow_dispatch']);

if (data.schemaVersion !== 3 || !data.generatedAt || !Array.isArray(data.repositories)) {
  throw new Error('Dashboard snapshot does not match schema version 3.');
}
if (!Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Dashboard snapshot has an invalid generatedAt timestamp.');
if (!data.refresh || !['available', 'unavailable'].includes(data.refresh.status)) {
  throw new Error('Dashboard must expose the status of its last refresh.');
}
if (!data.refresh.schedule || typeof data.refresh.schedule.status !== 'string') {
  throw new Error('Dashboard must expose the scheduled refresh health state.');
}

for (const repository of data.repositories) {
  for (const field of ['name', 'label', 'status', 'url', 'docsUrl', 'verificationUrl', 'limitationsUrl', 'evidenceClass', 'evidenceState', 'publication', 'evidenceSummary']) {
    if (!repository[field]) throw new Error(`${repository.name ?? 'unknown'} is missing ${field}`);
  }
  if (!allowedEvidenceStates.has(repository.evidenceState)) throw new Error(`${repository.name} has unsupported evidence state ${repository.evidenceState}`);
  if (!['available', 'unavailable', 'not-published'].includes(repository.publication.indexStatus)) {
    throw new Error(`${repository.name} has unsupported publication index status.`);
  }

  const latest = repository.workflow?.latestAttempt;
  if (repository.workflow?.status === 'available') {
    if (!latest || latest.branch !== repository.defaultBranch || !trustedEvents.has(latest.event) || !/^\d+$/.test(latest.runId)) {
      throw new Error(`${repository.name} has a latest workflow attempt without trusted provenance.`);
    }
    const url = new URL(latest.url);
    if (url.hostname !== 'github.com' || url.pathname !== `/${data.organization}/${repository.name}/actions/runs/${latest.runId}`) {
      throw new Error(`${repository.name} has an unsafe workflow URL.`);
    }
  }
  if (repository.workflow?.status === 'unavailable' && repository.evidenceState === 'review-ready') {
    throw new Error(`${repository.name} cannot appear review-ready while current workflow data is unavailable.`);
  }
  if (repository.evidenceState === 'review-ready') {
    if (!repository.currentSha || repository.evidenceSummary.requiredCount === 0 || repository.evidenceSummary.freshRequiredCount !== repository.evidenceSummary.requiredCount) {
      throw new Error(`${repository.name} is review-ready without current, fresh required evidence.`);
    }
    if (repository.workflow?.status !== 'available') throw new Error(`${repository.name} is review-ready without an available workflow query.`);
  }
  if (repository.publication.status === 'published' && (repository.publication.indexStatus !== 'available' || repository.publication.scopeCount < 1)) {
    throw new Error(`${repository.name} claims publication without verified records.`);
  }
  if (repository.release) {
    if (!/^[a-f0-9]{40}$/.test(repository.release.sourceSha ?? '') || !/^[a-f0-9]{40}$/.test(repository.currentSha ?? '')) {
      throw new Error(`${repository.name} release proof is missing an exact tag or current source SHA.`);
    }
    if (typeof repository.release.historical !== 'boolean') {
      throw new Error(`${repository.name} release must identify whether its tag differs from current source.`);
    }
    if (repository.release.historical !== (repository.release.sourceSha !== repository.currentSha)) {
      throw new Error(`${repository.name} release history label does not match its exact source SHAs.`);
    }
  }
  for (const scope of repository.evidenceRecords ?? []) {
    if (!scope.id || !scope.state || !scope.evidenceClass || !scope.freshnessPolicy || !Array.isArray(scope.reasons)) {
      throw new Error(`${repository.name} contains an incomplete evidence-scope state.`);
    }
    if (scope.workflowUrl) {
      const url = new URL(scope.workflowUrl);
      if (url.hostname !== 'github.com') throw new Error(`${repository.name} has an unsafe scope workflow URL.`);
    }
  }
}

const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
for (const repository of data.repositories) {
  if (!html.includes(repository.url) || !html.includes(repository.label)) {
    throw new Error(`Static dashboard fallback is missing ${repository.name}`);
  }
  if (repository.release) {
    const proofUrl = `https://github.com/${data.organization}/${repository.name}/commit/${repository.currentSha}`;
    const releaseLabel = repository.release.historical
      ? `Historical release ${repository.release.tag}`
      : `Current release ${repository.release.tag}`;
    if (!html.includes(repository.release.url) || !html.includes(releaseLabel) || !html.includes(proofUrl)) {
      throw new Error(`Static dashboard fallback is missing the release or current proof for ${repository.name}`);
    }
  }
}
if (html.includes('Loading evidence') || html.includes('<tbody id="repository-rows"></tbody>')) {
  throw new Error('Dashboard still depends on JavaScript for its initial evidence view.');
}
if (!html.includes('id="generated-at"') || !html.includes('id="freshness-state"') || !html.includes('id="refresh-schedule-state"')) {
  throw new Error('Static dashboard is missing refresh freshness or scheduler state.');
}

console.log(`Validated ${data.repositories.length} dashboard repositories at schema v3.`);
