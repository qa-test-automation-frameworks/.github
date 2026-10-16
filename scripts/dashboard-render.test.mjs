import './check-runtime.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDashboard, renderRepositoryRows } from '../site/render.mjs';

const repository = {
  name: 'framework',
  label: '<img src=x onerror=alert(1)>',
  url: 'javascript:alert(1)',
  status: 'configured',
  evidenceState: 'evidence-unavailable',
  evidenceClass: 'controlled',
  reviewMinutes: 10,
  workflow: { status: 'unavailable', latestAttempt: null, lastSuccess: null, currentCodeCompatibility: false },
  publication: { status: 'not-published', indexStatus: 'not-published' },
  evidenceSummary: { requiredCount: 0, freshRequiredCount: 0 },
  evidenceRecords: [{
    id: 'scope',
    evidenceClass: 'controlled',
    freshnessPolicy: 'daily_gate_v1',
    state: 'invalid',
    reasons: ['</li><script>alert(1)</script>'],
    limitations: [],
  }],
  commitCount: 1,
  pullRequestCount: 0,
};

test('static row renderer escapes evidence metadata and rejects non-HTTPS links', () => {
  const html = renderRepositoryRows([repository]);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;\/li&gt;/);
});

test('latest attempt rendering exposes current-code compatibility', () => {
  const html = renderRepositoryRows([{
    ...repository,
    workflow: {
      ...repository.workflow,
      status: 'available',
      currentCodeCompatibility: true,
      latestAttempt: {
        runId: '123', attempt: 2, event: 'push', status: 'completed', conclusion: 'success',
        createdAt: '2026-10-16T00:00:00Z', url: 'https://github.com/qa-test-automation-frameworks/framework/actions/runs/123',
      },
    },
  }]);
  assert.match(html, /Source matches current default branch/);
});

test('static page and enhanced view share generated evidence, policy, and freshness states', () => {
  const data = {
    generatedAt: '2026-10-16T00:00:00.000Z',
    refresh: { status: 'unavailable', schedule: { status: 'disabled_inactivity' } },
    repositories: [repository],
    recommendedReviewOrder: ['framework'],
  };
  const template = '<span id="freshness-state">old</span><span id="generated-at">old</span><span id="refresh-schedule-state">old</span><ol id="review-order" class="review-order"></ol><tbody id="repository-rows"></tbody>';
  const html = renderDashboard(template, data);
  assert.match(html, /Refresh unavailable; showing the last static snapshot/);
  assert.match(html, /Scheduled refresh: disabled_inactivity/);
  assert.match(html, /daily_gate_v1/);
  assert.match(html, /not-published/);
});
