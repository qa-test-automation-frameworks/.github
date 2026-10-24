import test from 'node:test';
import assert from 'node:assert/strict';
import { maxGapHours } from './cron-cadence.mjs';

for (const [expression, gap] of [
  ['23 5 * * *', 24], ['0 6 * * 1-5', 72], ['17 */4 * * *', 4],
  ['0 0 * * 0', 168], ['0 6 1 1,4,7,10 *', 2208], ['0 0 * * 7', 168],
  ['0 0,12 * * *', 12],
]) test(`maximum UTC gap for ${expression}`, () => assert.equal(maxGapHours(expression), gap));

for (const expression of ['*/5 * * * *', '0 6 * * MON', '60 6 * * *', '0 24 * * *', '0 */0 * * *', '0 6 0 * *', '0 6 * 13 *', '0 6 * * 9', '0 6 * * 5-1', '', '0 6 30 2 *']) {
  test(`rejects unsupported or non-firing cron ${expression}`, () => assert.throws(() => maxGapHours(expression), /Unsupported cron expression/));
}
