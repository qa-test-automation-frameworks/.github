import './check-runtime.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const definition = JSON.parse(await readFile(new URL('../portfolio/repositories.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('../site/data/portfolio.json', import.meta.url), 'utf8'));

test('portfolio definition and snapshot use the same repository set', () => {
  assert.equal(definition.schemaVersion, 2);
  assert.equal(snapshot.schemaVersion, 3);
  assert.deepEqual(
    snapshot.repositories.map(({ name }) => name),
    definition.repositories.map(({ name }) => name),
  );
});

test('every repository exposes evidence metadata and an explicit state', () => {
  assert.ok(['available', 'unavailable'].includes(snapshot.refresh.status));
  assert.ok(snapshot.refresh.schedule?.status);
  for (const repository of snapshot.repositories) {
    assert.ok(repository.verificationUrl, repository.name);
    assert.ok(repository.evidenceClass, repository.name);
    assert.ok(['review-ready', 'evidence-stale', 'evidence-unavailable', 'work-in-progress'].includes(repository.evidenceState), repository.name);
    assert.ok(repository.publication?.status, repository.name);
    assert.ok(repository.evidenceSummary && Array.isArray(repository.evidenceRecords), repository.name);
    if (repository.evidenceState === 'review-ready') assert.equal(repository.workflow?.status, 'available');
  }
});

test('Selenium evidence distinguishes the controlled Grid from its vendor-operated target', async () => {
  const selenium = snapshot.repositories.find(({ name }) => name === 'selenium-testng-java-framework');
  assert.ok(selenium);
  assert.match(selenium.evidenceClass, /controlled Grid \+ vendor-operated target/);
  assert.match(selenium.description, /vendor-operated Sauce Demo service, not a controlled application/);
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.match(html, /Evidence class describes the test execution environment/);
});

test('static fallback reports its old snapshot and does not preserve stale green claims', async () => {
  assert.equal(snapshot.refresh.status, 'unavailable');
  assert.ok(snapshot.repositories.every((repository) => repository.evidenceState === 'evidence-unavailable'));
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.match(html, /Refresh unavailable; showing the last static snapshot/);
  assert.match(html, /Scheduled refresh: disabled_inactivity/);
  assert.match(html, /No verified published scope records/);
});
