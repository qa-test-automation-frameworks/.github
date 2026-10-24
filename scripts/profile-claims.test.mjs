import test from 'node:test';
import assert from 'node:assert/strict';
import { findProfileClaimViolations, readProfileFiles } from './profile-claims.mjs';

for (const [path, text] of [
  ['profile/README.md', '[proof](https://github.com/o/r/commit/abcdef1234)'],
  ['profile/README.md', 'Current proof abcdef1'],
  ['profile/assets/test.svg', '<text>ALL GATES GREEN</text>'],
  ['profile/assets/test.svg', '<svg aria-label="Every gate passed">'],
  ['profile/assets/test.svg', '<text>all tests passing</text>'],
  ['profile/README.md', 'CI fails any doc that overclaims'],
]) test(`flags unsupported profile claim ${text}`, () => assert.ok(findProfileClaimViolations({ [path]: text }).length));

test('live evidence links and bounded statements pass', () => {
  assert.deepEqual(findProfileClaimViolations({
    'profile/README.md': '[Live evidence](https://qa-test-automation-frameworks.github.io/.github/#repo-fixture)',
    'profile/assets/test.svg': '<text>CI rejects listed self-assessment phrases</text>',
  }), []);
});

test('the actual profile is free of static gate and current-proof claims', async () => {
  assert.deepEqual(findProfileClaimViolations(await readProfileFiles()), []);
});
