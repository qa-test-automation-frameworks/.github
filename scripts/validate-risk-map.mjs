import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ORG = 'qa-test-automation-frameworks';
const APP_REPOSITORY = `${ORG}/quality-reference-application`;
const FRAMEWORKS = new Set([
  `${ORG}/aria-api-framework`,
  `${ORG}/playwright-typescript-framework`,
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function check(value, rule, root, path, errors) {
  if (rule.$ref) {
    if (!rule.$ref.startsWith('#/$defs/')) throw new Error(`Unsupported schema reference ${rule.$ref}`);
    const definition = root.$defs?.[rule.$ref.slice('#/$defs/'.length)];
    if (!definition) throw new Error(`Unresolved schema reference ${rule.$ref}`);
    check(value, definition, root, path, errors);
    return;
  }
  const expectedTypes = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
  if (expectedTypes.length) {
    const matches = {
      object: isObject(value),
      array: Array.isArray(value),
      string: typeof value === 'string',
      integer: Number.isSafeInteger(value),
      boolean: typeof value === 'boolean',
      null: value === null,
    };
    if (!expectedTypes.some((type) => matches[type])) {
      errors.push(`${path}: expected ${expectedTypes.join(' or ')}`);
      return;
    }
  }
  if (Object.hasOwn(rule, 'const') && value !== rule.const) errors.push(`${path}: expected ${rule.const}`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${path}: unsupported value`);
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(`${path}: too short`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(`${path}: too long`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${path}: invalid format`);
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${path}: below minimum`);
    if (rule.maximum !== undefined && value > rule.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(`${path}: too few items`);
    if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(`${path}: too many items`);
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: duplicate items`);
    if (rule.items) value.forEach((item, index) => check(item, rule.items, root, `${path}[${index}]`, errors));
  }
  if (isObject(value)) {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(rule.properties ?? {}, key)) check(item, rule.properties[key], root, `${path}.${key}`, errors);
      else if (rule.additionalProperties === false) errors.push(`${path}.${key}: unexpected property`);
    }
  }
}

export function validateRiskMap(riskMap, repositoryRegistry, schema) {
  const errors = [];
  check(riskMap, schema, schema, '$', errors);
  if (errors.length) return errors;

  const contexts = new Map();
  for (const context of riskMap.frameworkContexts) {
    if (contexts.has(context.repository)) errors.push(`duplicate framework context ${context.repository}`);
    contexts.set(context.repository, context);
  }
  const riskIds = new Set();
  const knownScopes = new Map((repositoryRegistry?.repositories ?? []).map((repository) => [
    `${ORG}/${repository.name}`,
    new Set(repository.requiredScopeIds ?? []),
  ]));
  for (const risk of riskMap.risks) {
    if (riskIds.has(risk.id)) errors.push(`duplicate risk ID ${risk.id}`);
    riskIds.add(risk.id);
    if (risk.relevantApiVersions.some((version) => !riskMap.application.apiVersions.includes(version))) {
      errors.push(`${risk.id}: relevant API version is not declared by the application`);
    }
    const scopeKeys = new Set();
    for (const scope of risk.requiredScopes) {
      const key = `${scope.repository}#${scope.scopeId}`;
      if (scopeKeys.has(key)) errors.push(`${risk.id}: duplicate required scope ${key}`);
      scopeKeys.add(key);
      if (!FRAMEWORKS.has(scope.repository)) errors.push(`${risk.id}: unsupported consumer repository ${scope.repository}`);
      if (!contexts.has(scope.repository)) errors.push(`${risk.id}: missing explicit framework context for ${scope.repository}`);
      if (!knownScopes.get(scope.repository)?.has(scope.scopeId)) errors.push(`${risk.id}: unknown portfolio scope ${key}`);
    }
    if (risk.expectedFaultControl.detectorRepository !== APP_REPOSITORY) {
      errors.push(`${risk.id}: detector repository must be the configured application repository`);
    }
  }
  if (!contexts.has(`${ORG}/aria-api-framework`) || !contexts.has(`${ORG}/playwright-typescript-framework`)) {
    errors.push('initial risk map must keep the selected ARIA and Playwright consumer contexts explicit');
  }
  return errors;
}

async function main() {
  const riskMapPath = process.argv[2] ?? 'portfolio/risk-map.json';
  const schemaPath = process.argv[3] ?? 'portfolio/risk-map.schema.json';
  const [riskMap, schema, repositoryRegistry] = await Promise.all([
    readFile(riskMapPath, 'utf8').then(JSON.parse),
    readFile(schemaPath, 'utf8').then(JSON.parse),
    readFile('portfolio/repositories.json', 'utf8').then(JSON.parse),
  ]);
  const errors = validateRiskMap(riskMap, repositoryRegistry, schema);
  if (errors.length) {
    console.error(`${riskMapPath}: invalid\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`${riskMapPath}: valid (${riskMap.risks.length} risks, ${riskMap.frameworkContexts.length} explicit framework contexts)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
