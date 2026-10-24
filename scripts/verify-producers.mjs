import { maxGapHours } from './cron-cadence.mjs';

export function registryProducerMismatches(repository, policies) {
  const errors = [];
  const fail = (message) => errors.push(`${repository.name}: ${message}`);
  const policy = policies[repository.requiredFreshnessPolicy];
  if (!policy || !Number.isFinite(policy.maxAgeHours) || policy.maxAgeHours <= 0) fail('R4 requires a finite freshness policy');
  const needed = new Set(repository.requiredScopeIds ?? []);
  for (const pair of repository.controlPairs ?? []) {
    needed.add(pair.rawScopeId);
    needed.add(pair.verifierScopeId);
  }
  const scopes = new Map();
  const workflows = new Set();
  if (!Array.isArray(repository.producers) || repository.producers.length === 0) fail('R1 requires producers');
  for (const producer of repository.producers ?? []) {
    const label = producer.workflow ?? '<missing workflow>';
    if (typeof producer.workflow !== 'string' || !/^[\w-]+\.ya?ml$/.test(producer.workflow) || workflows.has(producer.workflow)) fail(`${label}: R5 requires unique workflow names`);
    workflows.add(producer.workflow);
    if (!Array.isArray(producer.scopes) || producer.scopes.length === 0) fail(`${label}: R1 requires scope mappings`);
    let governed = false;
    for (const scope of producer.scopes ?? []) {
      if (typeof scope.id !== 'string' || !scope.id.trim() || typeof scope.job !== 'string' || !/^[\w-]+$/.test(scope.job)) fail(`${label}: R5 requires scope IDs and job keys`);
      scopes.set(scope.id, (scopes.get(scope.id) ?? 0) + 1);
      governed ||= needed.has(scope.id);
    }
    if (governed) {
      if (producer.pushToMain !== 'unfiltered' || !producer.schedule) fail(`${label}: R2 requires an unfiltered main push and schedule`);
      try {
        const gap = maxGapHours(producer.schedule);
        if (policy && gap + 12 > policy.maxAgeHours) fail(`${label}: R3 ${gap}h gap + 12h exceeds ${policy.maxAgeHours}h freshness`);
      } catch (error) { fail(`${label}: R3 ${error.message}`); }
    }
  }
  for (const id of needed) if (scopes.get(id) !== 1) fail(`R1 scope ${id} must have exactly one producer`);
  return errors;
}

function block(lines, index) {
  const indent = lines[index].search(/\S/);
  let end = index + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() && !line.trimStart().startsWith('#') && line.search(/\S/) <= indent) break;
    end += 1;
  }
  return lines.slice(index + 1, end);
}

export function inspectProducerWorkflow(source, producer) {
  const errors = [];
  const lines = source.split(/\r?\n/);
  const on = lines.findIndex((line) => /^on:\s*(?:#.*)?$/.test(line));
  if (on < 0) return ['R6b unrecognised trigger layout'];
  const triggers = block(lines, on);
  const schedule = triggers.findIndex((line) => /^  schedule:\s*$/.test(line));
  const crons = schedule < 0 ? [] : block(triggers, schedule);
  const escaped = String(producer.schedule).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!crons.some((line) => new RegExp(`^\\s*-\\s*cron:\\s*['"]${escaped}['"]\\s*(?:#.*)?$`).test(line))) errors.push('R6a declared schedule is missing');
  if (producer.pushToMain === 'unfiltered') {
    const push = triggers.findIndex((line) => /^  push:\s*$/.test(line));
    if (push < 0) errors.push('R6b unrecognised trigger layout');
    else {
      const pushLines = block(triggers, push);
      const branches = pushLines.findIndex((line) => /^    branches:\s*(?:\[.*\])?\s*$/.test(line));
      let main = false;
      if (branches >= 0) {
        const flow = /^    branches:\s*\[([^\]]+)\]\s*$/.exec(pushLines[branches]);
        main = flow ? flow[1].split(',').some((value) => /^['"]?main['"]?$/.test(value.trim()))
          : block(pushLines, branches).some((line) => /^\s*-\s*['"]?main['"]?\s*$/.test(line));
      }
      if (!main) errors.push('R6b push must explicitly include main');
      if (pushLines.some((line) => /^\s+paths(?:-ignore)?:/.test(line))) errors.push('R6b main push must not have path filters');
      if (pushLines.some((line) => /^    branches-ignore:/.test(line))) errors.push('R6b unrecognised trigger layout');
    }
  }
  const jobs = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  const jobLines = jobs < 0 ? [] : block(lines, jobs);
  for (const { job } of producer.scopes ?? []) {
    if (!jobLines.some((line) => line === `  ${job}:` || new RegExp(`^  ${job}:\\s*(?:#.*)?$`).test(line))) errors.push(`R6c missing job ${job}`);
  }
  return [...new Set(errors)];
}

export async function verifyProducers(repository, policies, github) {
  const errors = registryProducerMismatches(repository, policies);
  for (const producer of repository.producers ?? []) {
    const label = `${repository.name}/${producer.workflow}`;
    try {
      const base = `/repos/qa-test-automation-frameworks/${repository.name}`;
      const path = encodeURIComponent(producer.workflow);
      const [file, workflow] = await Promise.all([
        github(`${base}/contents/.github/workflows/${path}?ref=main`),
        github(`${base}/actions/workflows/${path}`),
      ]);
      if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('R6a workflow contents are unavailable');
      const source = Buffer.from(file.content, 'base64').toString('utf8');
      errors.push(...inspectProducerWorkflow(source, producer).map((message) => `${label}: ${message}`));
      if (workflow.state !== 'active') errors.push(`${label}: R6d workflow is ${workflow.state ?? 'unknown'}`);
    } catch (error) { errors.push(`${label}: producer verification unavailable: ${error.message}`); }
  }
  return errors;
}
