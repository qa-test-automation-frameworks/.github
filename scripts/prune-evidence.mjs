import './check-runtime.mjs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const DAY = 86_400_000;

async function fileBytes(path) {
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const item = join(path, entry.name);
    if (entry.isDirectory()) total += await fileBytes(item);
    else if (entry.isFile()) total += (await stat(item)).size;
    else throw new Error(`Unsupported non-regular entry in evidence tree: ${item}`);
  }
  return total;
}

async function findFiles(root, filename, found = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await findFiles(path, filename, found);
    else if (entry.isFile() && entry.name === filename) found.push(path);
  }
  return found;
}

async function protectedBundles(root) {
  const protectedPaths = new Set();
  for (const indexPath of await findFiles(join(root, 'repositories'), 'latest.json')) {
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    const repositoryRoot = dirname(indexPath);
    const repository = relative(join(root, 'repositories'), repositoryRoot).split(sep).join('/');
    if (index.schemaVersion !== 1 || index.repository !== repository || !index.scopes || typeof index.scopes !== 'object') {
      throw new Error(`Malformed latest index: ${indexPath}`);
    }
    for (const pointer of Object.values(index.scopes ?? {})) {
      const bundle = resolve(root, pointer.bundle);
      const relativeBundle = relative(repositoryRoot, bundle);
      if (relativeBundle.startsWith(`runs${sep}`) && !relativeBundle.split(sep).includes('..')) {
        protectedPaths.add(bundle);
      } else {
        throw new Error(`Latest index contains an unsafe bundle path: ${pointer.bundle}`);
      }
    }
  }
  return protectedPaths;
}

export async function pruneEvidence(rootPath, { now = Date.now(), retentionDays = 365, maxBytes = 500 * 1024 * 1024 } = {}) {
  const root = resolve(rootPath);
  const repositoryRoot = join(root, 'repositories');
  const keep = await protectedBundles(root);
  const bundles = [];
  for (const manifestPath of await findFiles(repositoryRoot, 'manifest.json')) {
    const directory = dirname(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1 || !manifest.run?.completedAt) throw new Error(`Malformed bundle manifest: ${manifestPath}`);
    const pathParts = relative(repositoryRoot, directory).split(sep);
    if (
      pathParts.length !== 5 ||
      pathParts[2] !== 'runs' ||
      manifest.repository !== `${pathParts[0]}/${pathParts[1]}` ||
      manifest.run.id !== pathParts[3] ||
      String(manifest.run.attempt) !== pathParts[4]
    ) throw new Error(`Bundle path does not match its manifest: ${manifestPath}`);
    const completedAt = Date.parse(manifest.run.completedAt);
    if (!Number.isFinite(completedAt)) throw new Error(`Invalid bundle completion time: ${manifestPath}`);
    bundles.push({ path: directory, completedAt, bytes: await fileBytes(directory), latest: keep.has(directory) });
  }

  const removed = [];
  const remove = async (bundle) => {
    await rm(bundle.path, { recursive: true, force: true });
    removed.push(relative(root, bundle.path).split(sep).join('/'));
  };
  const expiry = now - retentionDays * DAY;
  for (const bundle of bundles.filter((item) => !item.latest && item.completedAt < expiry)) await remove(bundle);

  let usedBytes = await fileBytes(repositoryRoot);
  const oldestUnprotected = bundles
    .filter((item) => !item.latest && !removed.includes(relative(root, item.path).split(sep).join('/')))
    .sort((a, b) => a.completedAt - b.completedAt);
  for (const bundle of oldestUnprotected) {
    if (usedBytes <= maxBytes) break;
    await remove(bundle);
    usedBytes = await fileBytes(repositoryRoot);
  }
  if (usedBytes > maxBytes) throw new Error(`Latest evidence alone exceeds the ${maxBytes}-byte retention budget (${usedBytes} bytes).`);
  return { removed, usedBytes, maxBytes, retentionDays };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2];
  if (!root) {
    console.error('Usage: node scripts/prune-evidence.mjs <evidence-branch-root>');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await pruneEvidence(root)));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
