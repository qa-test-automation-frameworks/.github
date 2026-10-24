import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildOperationSummary, renderOperationMarkdown } from './operation-summary.mjs';
import { buildAssurancePacket } from './build-assurance-packet.mjs';
import { renderAssurancePacket } from './render-assurance-packet.mjs';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function retainedPath(root, value) {
  requireValue(typeof value === 'string' && value.length > 0
    && !value.startsWith('/') && !value.includes('\\')
    && value.split('/').every((part) => part && part !== '.' && part !== '..'), 'Invalid retained sample path.');
  return resolve(root, value);
}

export async function readIndex(root, directory, fields, discoveryPattern, primary) {
  const entries = JSON.parse(await readFile(join(root, directory, 'index.json'), 'utf8'));
  requireValue(Array.isArray(entries) && entries.length > 0, `Empty retained sample index: ${directory}`);
  const indexed = new Set();
  for (const entry of entries) {
    requireValue(entry && fields.every((field) => typeof entry[field] === 'string'), 'Invalid retained sample entry.');
    requireValue(!indexed.has(entry[primary]), `Duplicate retained sample: ${entry[primary]}`);
    for (const field of fields) await readFile(retainedPath(root, entry[field]));
    requireValue(dirname(entry[primary]) === directory, `Retained input must be in ${directory}.`);
    indexed.add(entry[primary]);
  }
  for (const name of await readdir(join(root, directory))) {
    if (discoveryPattern.test(name)) requireValue(indexed.has(`${directory}/${name}`), `unindexed retained sample: ${directory}/${name}`);
  }
  return entries;
}

// Replay at the last recorded retrieval, never at an invented fresh timestamp.
// The live packet builder and dashboard retain their wall-clock freshness checks.
export function retainedReplayTime(input) {
  const times = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'verifiedAt')) {
      const time = Date.parse(value.verifiedAt);
      requireValue(typeof value.verifiedAt === 'string' && Number.isFinite(time), 'Invalid retained receipt time.');
      times.push(time);
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(input);
  requireValue(times.length > 0, 'Retained packet needs a recorded receipt time.');
  return Math.max(...times);
}

export async function checkRetainedSamples(root, output) {
  const operations = await readIndex(root, 'portfolio/operation-samples', ['window', 'summary', 'report'], /^window-.*\.json$/, 'window');
  const packets = await readIndex(root, 'portfolio/release-assurance', ['input'], /^packet-input-.*\.json$/, 'input');
  await mkdir(output, { recursive: true });
  for (const entry of operations) {
    const bytes = await readFile(retainedPath(root, entry.window));
    const report = buildOperationSummary(JSON.parse(bytes), { snapshotSha256: createHash('sha256').update(bytes).digest('hex') });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = renderOperationMarkdown(report);
    requireValue(json === await readFile(retainedPath(root, entry.summary), 'utf8'), `Retained summary differs: ${entry.summary}`);
    requireValue(markdown === await readFile(retainedPath(root, entry.report), 'utf8'), `Retained report differs: ${entry.report}`);
    await writeFile(join(output, entry.summary.split('/').at(-1)), json);
  }
  const load = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
  const [riskMap, schema, repositoryRegistry] = await Promise.all([
    load('portfolio/risk-map.json'), load('portfolio/risk-map.schema.json'), load('portfolio/repositories.json'),
  ]);
  for (const entry of packets) {
    const input = await load(entry.input);
    const packet = buildAssurancePacket({ riskMap, input, schema, repositoryRegistry, now: retainedReplayTime(input) });
    requireValue(packet.verdict === 'ready-for-review', `Retained packet is ${packet.verdict}: ${entry.input}`);
    packet.limitations.unshift('Historical replay at the last recorded artifact retrieval; this is not current release evidence.');
    const name = entry.input.split('/').at(-1).replace(/^packet-input-/, '').replace(/\.json$/, '');
    const directory = join(output, `release-assurance-review-${name}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`);
    await writeFile(join(directory, 'review.html'), renderAssurancePacket(packet));
    console.log(`Historical replay: ${entry.input} at ${packet.generatedAt}; ${packet.verdict}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv[2], 'Usage: node scripts/check-retained-samples.mjs <output-directory>');
    await checkRetainedSamples(process.cwd(), resolve(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
