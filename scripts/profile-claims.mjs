import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function findProfileClaimViolations(files) {
  const errors = [];
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith('profile/')) continue;
    if (path === 'profile/README.md' && (/\/commit\/[a-f0-9]{7,40}/i.test(text) || /Current proof/i.test(text))) errors.push(`${path}: use live evidence links instead of static current proof SHAs`);
    if (/^profile\/assets\/[^/]+\.svg$/.test(path) && (/ALL GATES GREEN/i.test(text) || /\b(all|every)\b[^<]{0,20}\b(green|pass(ing|ed)?)\b/i.test(text))) errors.push(`${path}: static all-green claim`);
    if (/fails any doc that overclaims/i.test(text)) errors.push(`${path}: documentation checks must describe their bounded rules`);
  }
  return errors;
}

export async function readProfileFiles(root = new URL('../', import.meta.url)) {
  const files = { 'profile/README.md': await readFile(new URL('profile/README.md', root), 'utf8') };
  for (const name of await readdir(new URL('profile/assets/', root))) {
    if (name.endsWith('.svg')) files[`profile/assets/${name}`] = await readFile(new URL(`profile/assets/${name}`, root), 'utf8');
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = findProfileClaimViolations(await readProfileFiles());
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}
