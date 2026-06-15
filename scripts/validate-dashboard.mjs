import { readFile } from 'node:fs/promises';

const data = JSON.parse(
  await readFile(new URL('../site/data/portfolio.json', import.meta.url), 'utf8'),
);

if (data.schemaVersion !== 1 || !data.generatedAt || !Array.isArray(data.repositories)) {
  throw new Error('Dashboard snapshot does not match schema version 1.');
}

for (const repository of data.repositories) {
  for (const field of ['name', 'label', 'status', 'url', 'docsUrl']) {
    if (!repository[field]) throw new Error(`${repository.name ?? 'unknown'} is missing ${field}`);
  }
  if (repository.status === 'review-ready' && !repository.workflow) {
    throw new Error(`${repository.name} is review-ready without workflow evidence`);
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
