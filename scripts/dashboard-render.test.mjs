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

test('release rendering labels an older tag and links the immutable current source proof', () => {
  const sourceSha = 'a'.repeat(40);
  const html = renderRepositoryRows([{
    ...repository,
    name: 'playwright-typescript-framework',
    url: 'https://github.com/qa-test-automation-frameworks/playwright-typescript-framework',
    currentSha: sourceSha,
    release: {
      tag: 'v1.0.0',
      url: 'https://github.com/qa-test-automation-frameworks/playwright-typescript-framework/releases/tag/v1.0.0',
      sourceSha: 'b'.repeat(40),
      historical: true,
    },
  }]);
  assert.match(html, /Historical release v1\.0\.0/);
  assert.match(html, /Current proof: aaaaaaa/);
  assert.match(html, new RegExp(`/commit/${sourceSha}`));
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

test('last-success rendering distinguishes completed-at from updated-at fallback', () => {
  const completedHtml = renderRepositoryRows([{
    ...repository,
    workflow: {
      ...repository.workflow,
      lastSuccess: {
        runId: '123', attempt: 1, url: 'https://github.com/qa-test-automation-frameworks/framework/actions/runs/123',
        completedAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:05Z',
        lastSuccessTimestamp: '2026-10-16T00:00:00Z', lastSuccessTimestampLabel: 'Completed',
      },
    },
  }]);
  assert.match(completedHtml, /Completed <time/);

  const fallbackHtml = renderRepositoryRows([{
    ...repository,
    workflow: {
      ...repository.workflow,
      lastSuccess: {
        runId: '124', attempt: 1, url: 'https://github.com/qa-test-automation-frameworks/framework/actions/runs/124',
        completedAt: null, updatedAt: '2026-10-16T00:00:05Z',
        lastSuccessTimestamp: '2026-10-16T00:00:05Z', lastSuccessTimestampLabel: 'Last updated',
      },
    },
  }]);
  assert.match(fallbackHtml, /Last updated <time/);
  assert.doesNotMatch(fallbackHtml, /Completed <time/);
});

test('last-success fallback uses the same row renderer for static and enhanced pages', () => {
  const row = {
    ...repository,
    workflow: {
      ...repository.workflow,
      lastSuccess: {
        runId: '124', attempt: 1, url: 'https://github.com/qa-test-automation-frameworks/framework/actions/runs/124',
        completedAt: null, updatedAt: '2026-10-16T00:00:05Z',
        lastSuccessTimestamp: '2026-10-16T00:00:05Z', lastSuccessTimestampLabel: 'Last updated',
      },
    },
  };
  const direct = renderRepositoryRows([row]);
  const template = '<span id="freshness-state">old</span><span id="generated-at">old</span><span id="refresh-schedule-state">old</span><ol id="review-order" class="review-order"></ol><tbody id="repository-rows"></tbody>';
  const enhanced = renderDashboard(template, {
    generatedAt: '2026-10-16T00:00:00Z',
    refresh: { status: 'available', schedule: { status: 'enabled' } },
    repositories: [row],
    recommendedReviewOrder: [],
  });

  assert.match(direct, /Last updated <time/);
  assert.match(enhanced, /Last updated <time/);
  assert.match(renderRepositoryRows([{ ...repository, workflow: { ...repository.workflow, lastSuccess: null } }]), /No successful run found/);
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
