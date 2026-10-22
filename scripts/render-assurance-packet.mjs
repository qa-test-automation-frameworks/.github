import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 1024 * 1024;
const VERDICTS = new Set(['ready-for-review', 'blocked', 'incomplete']);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}

function githubLink(value, label = value) {
  if (typeof value !== 'string') return escapeHtml(label);
  let url;
  try {
    url = new URL(value);
  } catch {
    return escapeHtml(label);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return escapeHtml(label);
  }
  return `<a href="${escapeHtml(url.toString())}" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function list(items) {
  if (!Array.isArray(items) || items.length === 0)
    return '<p>None recorded.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function runIdentity(run) {
  if (!run) return 'Unavailable';
  const identity = `run ${run.id ?? 'unknown'}, attempt ${run.attempt ?? 'unknown'}`;
  return run.url ? githubLink(run.url, identity) : escapeHtml(identity);
}

function renderCandidate(candidate) {
  if (!candidate)
    return '<p class="empty">No verified release descriptor is available.</p>';
  const descriptor = candidate.descriptorArtifact
    ? `${githubLink(candidate.descriptorArtifact.artifactUrl, `artifact ${candidate.descriptorArtifact.artifactId}`)} · sha256 ${escapeHtml(candidate.descriptorArtifact.artifactSha256)}`
    : 'Unavailable';
  const rows = [
    ['Repository', candidate.repository],
    ['Source revision', candidate.sourceSha],
    ['Application version', candidate.applicationVersion],
    ['Immutable image digest', candidate.imageDigest],
    ['Fixture version', candidate.fixtureVersion],
    [
      'Supported API versions',
      Array.isArray(candidate.apiVersions)
        ? candidate.apiVersions.join(', ')
        : 'Unavailable',
    ],
    ['Source workflow', runIdentity(candidate.sourceRun)],
    ['Descriptor artifact', descriptor],
  ];
  return `<dl class="identity">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function renderRollbackEvidence(rollbackEvidence) {
  if (!rollbackEvidence || rollbackEvidence.state !== 'complete') {
    const reasons = list(rollbackEvidence?.reasons);
    return `<p class="empty">Retained rollback proof is ${escapeHtml(rollbackEvidence?.state ?? 'missing')}.</p>${reasons}`;
  }
  const run = rollbackEvidence.workflowRun;
  const job = rollbackEvidence.rollbackJob;
  const receipt = rollbackEvidence.artifactReceipt;
  const summary = rollbackEvidence.summary;
  const rows = [
    ['Outcome', summary?.outcome],
    ['Prior image digest', summary?.digest],
    ['Prior image source revision', summary?.sourceRevision],
    ['Fixture version', summary?.fixtureVersion],
    ['Rollback started', summary?.startedAt],
    ['Rollback completed', summary?.completedAt],
    ['Summary SHA-256', rollbackEvidence.summarySha256],
    ['Artifact archive SHA-256', receipt?.artifactSha256],
    ['Artifact file SHA-256', receipt?.artifactFileSha256],
  ];
  const checks = Array.isArray(summary?.checks)
    ? `<ul>${summary.checks.map((check) => `<li>${escapeHtml(check?.name)}: ${escapeHtml(check?.status)}</li>`).join('')}</ul>`
    : '<p>None recorded.</p>';
  const workflow = run?.url
    ? githubLink(run.url, `run ${escapeHtml(run.id)} · attempt ${escapeHtml(run.attempt)}`)
    : 'Unavailable';
  const rollbackJob = job?.url
    ? githubLink(job.url, `job ${escapeHtml(job.id)} · ${escapeHtml(job.conclusion)}`)
    : 'Unavailable';
  const artifact = receipt?.artifactUrl
    ? githubLink(receipt.artifactUrl, `artifact ${escapeHtml(receipt.artifactId)}`)
    : 'Unavailable';
  return `<p><strong>Rollback job:</strong> ${rollbackJob}</p>
    <p><strong>Workflow:</strong> ${workflow} · workflow conclusion: ${escapeHtml(run?.conclusion)}; rollback job conclusion: ${escapeHtml(job?.conclusion)}.</p>
    <p><strong>Retained proof:</strong> ${artifact} · expires ${escapeHtml(receipt?.expiresAt)}</p>
    <dl class="identity">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value ?? 'Unavailable')}</code></dd></div>`).join('')}</dl>
    <h4>Rollback checks</h4>${checks}`;
}

function renderEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0)
    return '<p class="empty">No consumer evidence matched this risk.</p>';
  const rows = evidence
    .map(
      (item) => `<tr>
    <td>${escapeHtml(item.repository)}<br><code>${escapeHtml(item.scopeId)}</code></td>
    <td>${escapeHtml(item.disposition)}<br>${escapeHtml(item.freshness)}</td>
    <td><code>${escapeHtml(item.frameworkSourceSha ?? item.sourceSha)}</code></td>
    <td>${item.runUrl ? githubLink(item.runUrl, `run ${escapeHtml(item.runId)} · attempt ${escapeHtml(item.attempt)}`) : 'Unavailable'}</td>
    <td>${item.bundleArtifactUrl ? githubLink(item.bundleArtifactUrl, `artifact ${escapeHtml(item.bundleArtifactId)}`) : 'Unavailable'}</td>
  </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Consumer scope</th><th>Result</th><th>Framework source</th><th>Workflow</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderProof(proof) {
  if (!proof)
    return '<p class="empty">No valid candidate-bound native fault proof is available.</p>';
  const rows = [
    ['Control', proof.controlId],
    ['Detector revision', proof.detectorFrameworkSha],
    ['Clean candidate digest', proof.cleanCandidateDigest],
    ['Mutated target digest', proof.mutatedTargetDigest],
    ['Mutated target type', proof.mutatedTargetKind],
    ['Mutation patch SHA-256', proof.patchSha256],
    ['Clean test result SHA-256', proof.cleanNativeResultsSha256],
    ['Mutated test result SHA-256', proof.mutatedNativeResultsSha256],
    ['Risk-proof artifact file SHA-256', proof.artifactFileSha256],
  ];
  const tests = `<div class="two-col"><section><h4>Clean native tests</h4>${list(proof.cleanNativeTestIds)}</section><section><h4>Detected mutated tests</h4>${list(proof.detectedNativeTestIds)}</section></div>`;
  const runs = `<p><strong>Clean invocation:</strong> ${runIdentity(proof.cleanRun)}</p><p><strong>Mutated invocation:</strong> ${runIdentity(proof.mutatedRun)}</p>`;
  const artifact = proof.artifactUrl
    ? `<p><strong>Native proof artifact:</strong> ${githubLink(proof.artifactUrl, `artifact ${proof.artifactId}`)} · archive sha256 ${escapeHtml(proof.artifactSha256)}</p>`
    : '';
  return `<dl class="identity">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value ?? 'Unavailable')}</code></dd></div>`).join('')}</dl>${tests}${runs}${artifact}`;
}

function renderRisk(risk) {
  const reasons = list(risk.reasons);
  const limits = list(risk.residualLimitations);
  return `<section class="risk">
    <header><div><h3>${escapeHtml(risk.id)}</h3><p>${escapeHtml(risk.description)}</p></div><span class="badge ${escapeHtml(risk.verdict)}">${escapeHtml(risk.verdict)}</span></header>
    <p><strong>Expected control:</strong> <code>${escapeHtml(risk.expectedFaultControl)}</code></p>
    <h4>Consumer evidence</h4>${renderEvidence(risk.matchedEvidence)}
    <h4>Native fault proof</h4>${renderProof(risk.faultControlProof)}
    <details><summary>Reasons and limits</summary><h4>Reasons</h4>${reasons}<h4>Residual limitations</h4>${limits}</details>
  </section>`;
}

export function renderAssurancePacket(packet) {
  requireValue(
    packet && packet.schemaVersion === 1 && VERDICTS.has(packet.verdict),
    'Assurance packet schema or verdict is invalid.',
  );
  requireValue(
    Array.isArray(packet.risks),
    'Assurance packet risk rows are missing.',
  );
  const risks = packet.risks.map(renderRisk).join('\n');
  const unrelated = Array.isArray(packet.unrelatedEvidence)
    ? packet.unrelatedEvidence
    : [];
  const unrelatedRows = unrelated.length
    ? `<div class="table-wrap"><table><thead><tr><th>Repository and scope</th><th>Run</th><th>Disposition</th><th>Context</th></tr></thead><tbody>${unrelated.map((item) => `<tr><td>${escapeHtml(item.repository)}<br><code>${escapeHtml(item.scopeId)}</code></td><td>${item.runUrl ? githubLink(item.runUrl, `run ${escapeHtml(item.runId)} · attempt ${escapeHtml(item.attempt)}`) : 'Unavailable'}</td><td>${escapeHtml(item.disposition)}</td><td>${escapeHtml(item.impact)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p>None recorded.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Release assurance packet review</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #17202a; background: #f4f6f8; }
    body { margin: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 2rem 1rem 4rem; }
    h1, h2, h3, h4 { line-height: 1.2; }
    h1 { margin-bottom: .25rem; }
    h2 { margin-top: 2rem; }
    a { color: #075cb5; overflow-wrap: anywhere; }
    code { overflow-wrap: anywhere; }
    .summary, .risk, .identity { background: white; border: 1px solid #d8dee5; border-radius: .6rem; }
    .summary { padding: 1rem 1.25rem; }
    .badge { display: inline-block; padding: .2rem .65rem; border-radius: 1rem; font-weight: 700; white-space: nowrap; }
    .ready-for-review { color: #14532d; background: #dcfce7; }
    .blocked { color: #7f1d1d; background: #fee2e2; }
    .incomplete { color: #78350f; background: #fef3c7; }
    .identity { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: .75rem; padding: .75rem; }
    .identity div { min-width: 0; }
    dt { font-size: .85rem; color: #536273; }
    dd { margin: .1rem 0 0; overflow-wrap: anywhere; }
    .risk { margin: 1rem 0; padding: 1rem 1.25rem; }
    .risk > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .risk > header h3 { margin: .15rem 0; }
    .risk > header p { margin: .25rem 0; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { text-align: left; vertical-align: top; padding: .55rem; border: 1px solid #d8dee5; }
    th { background: #edf1f5; }
    .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
    .empty { color: #5b6570; font-style: italic; }
    details { margin-top: 1rem; }
    summary { cursor: pointer; font-weight: 650; }
    .limit { margin-top: 2rem; padding: 1rem; border-left: .25rem solid #65758b; background: #edf1f5; }
    @media print { :root { background: white; } main { max-width: none; padding: 0; } .risk, .summary { break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <header class="summary">
      <p>Generated ${escapeHtml(packet.generatedAt)}</p>
      <h1>Release assurance review</h1>
      <p><span class="badge ${escapeHtml(packet.verdict)}">${escapeHtml(packet.verdict)}</span></p>
      ${renderCandidate(packet.candidate)}
    </header>
    <h2>Retained rollback evidence</h2>
    ${renderRollbackEvidence(packet.rollbackEvidence)}
    <h2>Business risks</h2>
    ${risks || '<p class="empty">No configured risks are present.</p>'}
    <h2>Unrelated evidence</h2>
    ${unrelatedRows}
    <h2>Packet limitations</h2>
    ${list(packet.limitations)}
    <p class="limit">${escapeHtml(packet.decisionLimit)}</p>
  </main>
</body>
</html>
`;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!['--input', '--output'].includes(key) || !args[index + 1]) {
      throw new Error(
        'Usage: node scripts/render-assurance-packet.mjs --input <packet.json> --output <review.html>',
      );
    }
    parsed[key.slice(2)] = args[index + 1];
    index += 1;
  }
  for (const key of ['input', 'output'])
    requireValue(parsed[key], `Missing --${key}.`);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = await readFile(args.input);
  requireValue(
    input.length > 0 && input.length <= MAX_INPUT_BYTES,
    'Assurance packet exceeds the 1 MiB limit.',
  );
  const packet = JSON.parse(input.toString('utf8'));
  await writeFile(args.output, renderAssurancePacket(packet));
  console.log(`${args.output}: rendered static review for ${packet.verdict}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
