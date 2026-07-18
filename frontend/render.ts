/**
 * Pure HTML-string builders. Each function returns a string; the orchestrator
 * (app.ts) assigns to innerHTML and then wires up event handlers. Kept free of
 * side effects so the structure is easy to audit.
 */
import type { AddressRow } from './search';
import { googleMapsDirectionsUrl, googleMapsUrl, hasCoords } from './share';
import { t } from './i18n';

function esc(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export { esc };

/** Structured chips for building / road / block. */
export function renderChips(row: AddressRow): string {
  const chips: string[] = [];
  if (row.building_no1) chips.push(`<span class="chip"><span class="chip__icon">🏢</span>${esc(row.building_no1)}</span>`);
  if (row.road_no !== null) chips.push(`<span class="chip"><span class="chip__icon">🛣</span>${row.road_no}</span>`);
  if (row.block_no !== null) chips.push(`<span class="chip"><span class="chip__icon">🧱</span>${row.block_no}</span>`);
  return chips.length ? `<div class="result__chips">${chips.join('')}</div>` : '';
}

/** One result card. `selected` shows the map panel + accent styling. */
export function renderRow(
  row: AddressRow,
  opts: { selected: boolean; bookmarked: boolean; distance?: number | null },
): string {
  const { selected, bookmarked } = opts;
  const coords = hasCoords(row) ? `${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}` : '';
  const dist = typeof opts.distance === 'number' && Number.isFinite(opts.distance)
    ? `<span class="result__dist">≈ ${Math.round(opts.distance)} m away</span>` : '';

  const maps = hasCoords(row) ? googleMapsUrl(row.lat, row.lng) : null;
  const dir = hasCoords(row) ? googleMapsDirectionsUrl(row.lat, row.lng) : null;

  const actions = [
    `<button class="btn btn--share" type="button" data-share="${row.object_id}"${hasCoords(row) ? '' : ' disabled'}>${t('result.share')}</button>`,
    `<button class="btn btn--ghost" type="button" data-copycoords="${row.object_id}"${hasCoords(row) ? '' : ' disabled'}>${t('result.copyCoords')}</button>`,
    maps ? `<a class="btn btn--ghost" href="${maps}" target="_blank" rel="noopener noreferrer">${t('result.googleMaps')}</a>` : '',
    dir ? `<a class="btn btn--ghost" href="${dir}" target="_blank" rel="noopener noreferrer">${t('result.directions')}</a>` : '',
    `<button class="result__star${bookmarked ? ' is-saved' : ''}" type="button" data-star="${row.object_id}" title="${bookmarked ? t('result.remove') : t('result.save')}" aria-label="${bookmarked ? t('result.remove') : t('result.save')}">${bookmarked ? '★' : '☆'}</button>`,
  ].join('');

  // The map panel mounts only inside the selected card; map.ts fills #result-map.
  const mapPanel = selected && hasCoords(row)
    ? `<div id="result-map" class="result__map"></div>` : '';

  return `
    <article class="result${selected ? ' result--selected' : ''}" data-object-id="${row.object_id}" data-result-row>
      ${renderChips(row)}
      <p class="result__en" dir="auto">${esc(row.formatted_en || '—')}</p>
      ${row.formatted_ar ? `<p class="result__ar" dir="auto">${esc(row.formatted_ar)}</p>` : ''}
      ${coords ? `<p class="result__coords">${coords}${dist}</p>` : ''}
      <div class="result__actions">${actions}</div>
      ${mapPanel}
    </article>`;
}

/** Loading skeleton cards (3 of them) shown while a search is pending. */
export function renderSkeletons(count = 3): string {
  const one = `
    <div class="skeleton">
      <div class="skeleton__line skeleton__line--w40"></div>
      <div class="skeleton__line skeleton__line--w70"></div>
      <div class="skeleton__line skeleton__line--w40"></div>
    </div>`;
  return one.repeat(count);
}

export function renderEmpty(message: string): string {
  return `<div class="result__empty">${esc(message)}</div>`;
}

/** A recent-searches or bookmark pill row. */
export function renderPills(
  items: Array<{ label: string; value: string; removable?: boolean }>,
  kind: 'recent' | 'bookmark',
): string {
  if (items.length === 0) return '';
  return items
    .map((it) => {
      const remove = it.removable
        ? `<span class="pill__remove" data-remove="${esc(it.value)}" role="button" aria-label="Remove">✕</span>`
        : '';
      return `<button class="pill ${kind === 'bookmark' ? 'pill--bookmark' : ''}" data-pill="${esc(it.value)}" type="button">${esc(it.label)}${remove}</button>`;
    })
    .join('');
}
