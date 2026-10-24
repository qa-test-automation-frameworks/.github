export function findReusablePinViolations(source, repository, name, expected) {
  const pattern = /qa-test-automation-frameworks\/\.github\/\.github\/workflows\/([\w-]+\.yml)@([^\s#]+)/g;
  const matches = [...source.matchAll(pattern)].filter((match) => match[1] === name);
  if (!/^[a-f0-9]{40}$/.test(expected)) return [`Reusable workflow pin drift: ${repository} has an invalid expected pin for ${name}`];
  if (matches.length !== 1) return [`Reusable workflow pin drift: ${repository} must reference ${name} exactly once; found ${matches.length}`];
  const actual = matches[0][2];
  if (!/^[a-f0-9]{40}$/.test(actual) || actual !== expected) return [`Reusable workflow pin drift: ${repository} uses ${name}@${actual}; expected ${expected}`];
  return [];
}

export async function checkReusablePins(repository, config, github) {
  const errors = [];
  if (config.schemaVersion !== 1 || !config.pins || Object.keys(config.pins).length === 0) return [`Reusable workflow pin drift: ${repository.name} has invalid pin configuration`];
  for (const [name, expected] of Object.entries(config.pins)) {
    const path = name === 'publish-evidence.yml' ? 'publish-portfolio-evidence.yml' : name;
    try {
      const file = await github(`/repos/qa-test-automation-frameworks/${repository.name}/contents/.github/workflows/${encodeURIComponent(path)}?ref=main`);
      if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('workflow contents unavailable');
      errors.push(...findReusablePinViolations(Buffer.from(file.content, 'base64').toString('utf8'), repository.name, name, expected));
    } catch (error) { errors.push(`Reusable workflow pin drift: ${repository.name}/${name} verification unavailable: ${error.message}`); }
  }
  return errors;
}
