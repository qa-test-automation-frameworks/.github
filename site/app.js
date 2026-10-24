import { renderRepositoryRows, renderReviewOrder, renderScheduledTriage } from './render.mjs';

const freshnessState = document.querySelector('#freshness-state');
try {
  const response = await fetch('data/portfolio.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Portfolio data returned ${response.status}`);
  const data = await response.json();
  if (data.schemaVersion !== 3 || !Array.isArray(data.repositories)) throw new Error('Unsupported portfolio data schema.');

  const generatedAt = new Date(data.generatedAt);
  const ageHours = (Date.now() - generatedAt.getTime()) / 3_600_000;
  const current = data.refresh?.status === 'available' && Number.isFinite(ageHours) && ageHours <= 36;
  freshnessState.textContent = current
    ? 'Snapshot refreshed; see per-repository evidence and publication states'
    : 'Refresh unavailable or stale; per-repository evidence states remain explicit';
  freshnessState.classList.add(current ? 'success' : 'warning');
  document.querySelector('#generated-at').textContent = Number.isFinite(generatedAt.getTime())
    ? generatedAt.toLocaleString()
    : 'Refresh time unavailable';
  document.querySelector('#refresh-schedule-state').textContent = `Scheduled refresh: ${data.refresh?.schedule?.status ?? 'unavailable'}`;

  document.querySelector('#review-order').innerHTML = renderReviewOrder(data.repositories, data.recommendedReviewOrder);
  document.querySelector('#repository-rows').innerHTML = renderRepositoryRows(data.repositories);
  document.querySelector('#scheduled-triage').innerHTML = renderScheduledTriage(data);
} catch (error) {
  freshnessState.textContent = 'Dynamic refresh unavailable; showing the static evidence snapshot';
  freshnessState.classList.add('warning');
  console.warn('Dynamic portfolio refresh unavailable; retaining static snapshot.', error);
}
