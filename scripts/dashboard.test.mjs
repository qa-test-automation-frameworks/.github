import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const definition = JSON.parse(await readFile(new URL('../portfolio/repositories.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('../site/data/portfolio.json', import.meta.url), 'utf8'));

test('portfolio definition and snapshot use the same repository set', () => {
  assert.equal(definition.schemaVersion, 2);
  assert.equal(snapshot.schemaVersion, 2);
  assert.deepEqual(
    snapshot.repositories.map(({ name }) => name),
    definition.repositories.map(({ name }) => name),
  );
});

test('every repository exposes evidence metadata and an explicit state', () => {
  for (const repository of snapshot.repositories) {
    assert.ok(repository.verificationUrl, repository.name);
    assert.ok(repository.evidenceClass, repository.name);
    assert.ok(['review-ready', 'evidence-stale', 'evidence-unavailable', 'work-in-progress'].includes(repository.evidenceState), repository.name);
    if (repository.evidenceState === 'review-ready') {
      assert.equal(repository.workflow?.conclusion, 'success');
      assert.ok(repository.workflow?.headSha, repository.name);
    }
  }
});
