import { readFile } from 'node:fs/promises';

const data = JSON.parse(
  await readFile(new URL('../site/data/portfolio.json', import.meta.url), 'utf8'),
);

if (data.schemaVersion !== 2 || !data.generatedAt || !Array.isArray(data.repositories)) {
  throw new Error('Dashboard snapshot does not match schema version 2.');
}

const freshnessHours = 36;
const ageHours = (timestamp) => (Date.now() - new Date(timestamp).getTime()) / 3_600_000;
if (ageHours(data.generatedAt) > freshnessHours) {
  console.warn(`Dashboard snapshot is older than ${freshnessHours} hours; publication is stale until refreshed.`);
}
for (const repository of data.repositories) {
  for (const field of ['name', 'label', 'status', 'url', 'docsUrl', 'verificationUrl', 'limitationsUrl', 'evidenceClass', 'evidenceState']) {
    if (!repository[field]) throw new Error(`${repository.name ?? 'unknown'} is missing ${field}`);
  }
  if (repository.evidenceState === 'review-ready') {
    if (repository.workflow?.branch !== 'main' || repository.workflow?.conclusion !== 'success' || !repository.workflow?.headSha || !repository.workflow?.url) {
      throw new Error(`${repository.name} is review-ready without complete workflow provenance`);
    }
    const manifest = repository.evidenceManifest;
    if (!manifest || manifest.verifiedSha !== repository.workflow.headSha || manifest.workflow?.runId !== repository.workflow.runId || manifest.workflow?.conclusion !== 'success') {
      throw new Error(`${repository.name} is review-ready without matching verification manifest`);
    }
    if (ageHours(repository.workflow.updatedAt) > freshnessHours) {
      throw new Error(`${repository.name} is review-ready with stale workflow evidence`);
    }
  }
  if (repository.evidenceState === 'evidence-unavailable' && repository.workflow?.conclusion === 'success' && repository.workflow?.sampleSize === 0) {
    console.warn(`${repository.name} has a configured workflow but no measured completed sample.`);
  }
}

const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
for (const repository of data.repositories) {
  if (!html.includes(repository.url) || !html.includes(repository.label)) {
    throw new Error(`Static dashboard fallback is missing ${repository.name}`);
  }
}
if (html.includes('Loading evidence') || html.includes('<tbody id="repository-rows"></tbody>')) {
  throw new Error('Dashboard still depends on JavaScript for its initial evidence view.');
}

console.log(`Validated ${data.repositories.length} dashboard repositories.`);
