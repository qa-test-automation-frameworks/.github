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

console.log(`Validated ${data.repositories.length} dashboard repositories.`);
