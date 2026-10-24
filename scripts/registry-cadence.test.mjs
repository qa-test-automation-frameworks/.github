import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registryProducerMismatches } from './verify-producers.mjs';
import { renderProducerTable } from './render-producer-table.mjs';

const registry = JSON.parse(await readFile(new URL('../portfolio/repositories.json', import.meta.url), 'utf8'));
const { policies } = JSON.parse(await readFile(new URL('../portfolio/evidence/freshness-policies.json', import.meta.url), 'utf8'));
const valid = () => structuredClone(registry.repositories.find((repo) => repo.name === 'aria-api-framework'));

test('every live registry scope has one producer with enough freshness margin', () => {
  for (const repo of registry.repositories) assert.deepEqual(registryProducerMismatches(repo, policies), [], repo.name);
  const table = renderProducerTable(registry, policies);
  for (const repo of registry.repositories) for (const id of repo.requiredScopeIds) assert.ok(table.includes(`| ${id} | yes |`));
});

for (const [name, mutate, message] of [
  ['missing scope', (repo) => repo.producers[0].scopes.pop(), /R1 scope/],
  ['duplicate scope', (repo) => repo.producers[0].scopes.push(repo.producers[0].scopes[0]), /R1 scope/],
  ['missing schedule', (repo) => { delete repo.producers[0].schedule; }, /R2/],
  ['weekly producer', (repo) => { repo.producers[0].schedule = '0 6 * * 0'; }, /aria-api-framework.*168h.*36h/],
  ['filtered main', (repo) => { repo.producers[0].pushToMain = 'filtered'; }, /R2/],
  ['historical policy', (repo) => { repo.requiredFreshnessPolicy = 'manual_case_study_v1'; }, /R4/],
  ['unknown policy', (repo) => { repo.requiredFreshnessPolicy = 'unknown'; }, /R4/],
  ['missing job', (repo) => { repo.producers[0].scopes[0].job = ''; }, /R5/],
  ['duplicate workflow', (repo) => repo.producers.push(structuredClone(repo.producers[0])), /R5/],
  ['missing producers', (repo) => { delete repo.producers; }, /R1/],
]) test(`registry rejects ${name}`, () => {
  const repo = valid();
  mutate(repo);
  assert.match(registryProducerMismatches(repo, policies).join('\n'), message);
});

test('control raw and verifier scopes must both be mapped', () => {
  const repo = structuredClone(registry.repositories.find((entry) => entry.name === 'verity-policy-coverage-eval-framework'));
  repo.producers[0].scopes = repo.producers[0].scopes.filter((scope) => scope.id !== repo.controlPairs[0].rawScopeId);
  assert.match(registryProducerMismatches(repo, policies).join('\n'), /R1 scope verity.failure-control-py3.12.15/);
});
