import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReusablePins, findReusablePinViolations } from './check-reusable-pins.mjs';
const name = 'publish-evidence.yml';
const sha = '7960801249c036ef56370f54abdf79570b5a7bd8';
const source = `    uses: qa-test-automation-frameworks/.github/.github/workflows/${name}@${sha}\n`;
const check = (value) => findReusablePinViolations(value, 'fixture', name, sha);

test('matching full reusable pin passes', () => assert.deepEqual(check(source), []));
for (const [label, value] of [
  ['older pin', source.replace(sha, '1'.repeat(40))], ['short pin', source.replace(sha, sha.slice(0, 7))],
  ['duplicate pin', source + source], ['missing pin', 'jobs: {}'],
]) test(`rejects ${label}`, () => assert.match(check(value).join('\n'), /Reusable workflow pin drift: fixture/));

test('live checker reads the caller on main and fails closed on API errors', async () => {
  const config = { schemaVersion: 1, pins: { [name]: sha } };
  const paths = [];
  assert.deepEqual(await checkReusablePins({ name: 'fixture' }, config, async (path) => {
    paths.push(path);
    return { encoding: 'base64', content: Buffer.from(source).toString('base64') };
  }), []);
  assert.match(paths[0], /publish-portfolio-evidence.yml\?ref=main$/);
  const errors = await checkReusablePins({ name: 'fixture' }, config, async () => { throw new Error('403'); });
  assert.match(errors[0], /verification unavailable: 403/);
  assert.ok((await checkReusablePins({ name: 'fixture' }, { schemaVersion: 1, pins: {} }, async () => ({}))).length);
});
