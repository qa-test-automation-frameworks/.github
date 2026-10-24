import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { maxGapHours } from './cron-cadence.mjs';

export function renderProducerTable(registry, policies) {
  const rows = [
    '| Repo | Scope | Required | Producer workflow | Job | Schedule (UTC) | Max gap (h) | Policy (max age h) |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const repository of registry.repositories) {
    for (const producer of repository.producers) {
      for (const scope of producer.scopes) {
        rows.push(`| ${repository.name} | ${scope.id} | ${repository.requiredScopeIds.includes(scope.id) ? 'yes' : 'no (control)'} | ${producer.workflow} | ${scope.job} | \`${producer.schedule}\` | ${maxGapHours(producer.schedule)} | ${repository.requiredFreshnessPolicy} (${policies[repository.requiredFreshnessPolicy].maxAgeHours}) |`);
      }
    }
  }
  return rows.join('\n');
}

async function main() {
  const registry = JSON.parse(await readFile(new URL('../portfolio/repositories.json', import.meta.url), 'utf8'));
  const { policies } = JSON.parse(await readFile(new URL('../portfolio/evidence/freshness-policies.json', import.meta.url), 'utf8'));
  const path = new URL('../docs/PORTFOLIO_EVIDENCE_STANDARD.md', import.meta.url);
  const original = await readFile(path, 'utf8');
  const start = '<!-- producer-table:begin -->';
  const end = '<!-- producer-table:end -->';
  if (original.split(start).length !== 2 || original.split(end).length !== 2 || original.indexOf(start) > original.indexOf(end)) throw new Error('Producer table markers must appear once in order.');
  const generated = `${original.slice(0, original.indexOf(start) + start.length)}\n${renderProducerTable(registry, policies)}\n${original.slice(original.indexOf(end))}`;
  if (process.argv.includes('--check')) {
    if (generated !== original) throw new Error('Producer table differs; run node scripts/render-producer-table.mjs.');
  } else await writeFile(path, generated);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
