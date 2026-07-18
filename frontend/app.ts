/**
 * Frontend orchestrator — Hero Spotlight edition.
 *
 * Two visual modes, toggled on the #shell element:
 *   - hero   (idle):  centered full-height hero; search IS the screen.
 *   - active (results): hero collapses to a sticky topbar; results flow below.
 *
 * The two search inputs (#search-input in hero, #search-input-top in topbar)
 * are kept in sync via a setQuery() helper so typing in either works.
 */

import { wordsOf } from '../shared/query';
import { searchClient, ABORTED, type AddressRow } from './search';
import { addRecent, loadBookmarks, loadLang, loadRecents, loadTheme, saveLang, saveTheme, toggleBookmark, type BookmarkRow, type Lang, type Theme } from './storage';
import { copyCoords, hasCoords, shareAddress } from './share';
import { renderEmpty, renderPills, renderRow, renderSkeletons, esc } from './render';
import { addressMap } from './map';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const els = {
  shell: $('shell'),
  hero: $('hero'),
  topbar: $('topbar'),
  // Two inputs, kept in sync:
  inputHero: $<HTMLInputElement>('search-input'),
  inputTop: $<HTMLInputElement>('search-input-top'),
  locateBtn: $<HTMLButtonElement>('locate-btn'),
  locateBtnTop: $<HTMLButtonElement>('locate-btn-top'),
  tokens: $('tokens'),
  status: $<HTMLParagraphElement>('status'),
  clearBtn: $<HTMLButtonElement>('clear-btn'),
  results: $('results'),
  recents: $('recents'),
  recentsRow: $('recents-row'),
  bookmarks: $('bookmarks'),
  bookmarksRow: $('bookmarks-row'),
  heroBookmarks: $('hero-bookmarks'),
  heroBookmarksRow: $('hero-bookmarks-row'),
  toast: $('toast'),
  themeToggle: $<HTMLButtonElement>('theme-toggle'),
  langToggle: $<HTMLButtonElement>('lang-toggle'),
};

// Which input currently has focus / is the "authoritative" one for sync origin.
let activeInput: HTMLInputElement = els.inputHero;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
type Mode = 'idle' | 'searching' | 'located';
let mode: Mode = 'idle';
let results: AddressRow[] = [];
let selectedId: number | null = null;
let locateDistance: number | null = null;
let userLatLng: { lat: number; lng: number } | null = null;
let theme: Theme = loadTheme();
let lang: Lang = loadLang();

let debounce: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Mode switching: hero ↔ active
// ---------------------------------------------------------------------------
/**
 * Toggle the shell between the centered hero (idle) and the active results
 * layout (sticky topbar + results). Independent from the data `mode`.
 */
function setShell(active: boolean): void {
  els.shell.classList.toggle('shell--hero', !active);
  els.hero.classList.toggle('hidden', active);
  els.topbar.classList.toggle('hidden', !active);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  addressMap.setTheme(theme);
}
function toggleTheme(): void {
  theme = theme === 'dark' ? 'light' : 'dark';
  saveTheme(theme);
  applyTheme();
}

// ---------------------------------------------------------------------------
// Language (sets <html lang>/<dir> so crawlers + RTL users get the right signal)
// ---------------------------------------------------------------------------
function applyLang(): void {
  const html = document.documentElement;
  html.setAttribute('lang', lang);
  html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  els.langToggle.textContent = lang === 'ar' ? 'ع' : 'EN';
}
function toggleLang(): void {
  lang = lang === 'ar' ? 'en' : 'ar';
  saveLang(lang);
  applyLang();
}

// ---------------------------------------------------------------------------
// Toast + status
// ---------------------------------------------------------------------------
function showToast(message: string): void {
  if (!message) return;
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2200);
}
function setStatus(text: string): void {
  els.status.textContent = text;
  els.status.classList.toggle('hidden', text === '');
}

// ---------------------------------------------------------------------------
// Query sync between the two inputs
// ---------------------------------------------------------------------------
function setQuery(value: string, source?: HTMLInputElement): void {
  if (source !== els.inputHero) els.inputHero.value = value;
  if (source !== els.inputTop) els.inputTop.value = value;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderTokens(): void {
  const v = activeInput.value;
  const words = v.trim() ? wordsOf(v) : [];
  els.tokens.innerHTML = words.map((w) => `<span class="search__token">${esc(w)}</span>`).join('');
}

function renderResults(): void {
  if (mode === 'searching') {
    els.results.innerHTML = renderSkeletons(3);
    return;
  }
  if (results.length === 0) {
    if (mode === 'idle' && activeInput.value.trim() === '') {
      els.results.innerHTML = '';
    } else {
      els.results.innerHTML = renderEmpty('No addresses matched your search.');
    }
    return;
  }
  const bookmarks = loadBookmarks();
  els.results.innerHTML = results
    .map((row) => renderRow(row, {
      selected: row.object_id === selectedId,
      bookmarked: bookmarks.some((b) => b.object_id === row.object_id),
      distance: row.object_id === selectedId ? locateDistance : null,
    }))
    .join('');
  mountMapIfSelected();
}

function renderRecents(): void {
  const recents = loadRecents();
  const show = mode === 'idle' && els.inputHero.value.trim() === '' && recents.length > 0;
  els.recents.classList.toggle('hidden', !show);
  if (show) {
    els.recentsRow.innerHTML = renderPills(
      recents.map((r) => ({ label: r, value: r, removable: true })),
      'recent',
    );
  }
}

function renderBookmarks(): void {
  const bookmarks = loadBookmarks();
  const pills = bookmarks.map((b) => ({ label: b.formatted_en || b.formatted_ar || `#${b.object_id}`, value: String(b.object_id) }));
  const pillsHtml = renderPills(pills, 'bookmark');

  // Active-mode "Saved" section (below results).
  els.bookmarks.classList.toggle('hidden', bookmarks.length === 0 || mode === 'idle');
  if (bookmarks.length > 0 && mode !== 'idle') els.bookmarksRow.innerHTML = pillsHtml;

  // Hero "Saved" section (main page, idle state).
  els.heroBookmarks.classList.toggle('hidden', bookmarks.length === 0 || mode !== 'idle');
  if (bookmarks.length > 0 && mode === 'idle') els.heroBookmarksRow.innerHTML = pillsHtml;
}

function mountMapIfSelected(): void {
  if (selectedId === null) return;
  const row = results.find((r) => r.object_id === selectedId);
  if (!row || !hasCoords(row)) return;
  const container = document.getElementById('result-map');
  if (!container) return;
  addressMap.mount(container);
  addressMap.show({ address: { lat: row.lat, lng: row.lng }, user: userLatLng ?? undefined });
}

// ---------------------------------------------------------------------------
// Search flow
// ---------------------------------------------------------------------------
function onInput(source: HTMLInputElement): void {
  activeInput = source;
  setQuery(source.value, source);
  renderTokens();
  if (debounce) clearTimeout(debounce);
  const q = source.value;
  els.clearBtn.hidden = q.trim() === '';

  if (q.trim() === '') {
    if (mode !== 'located') {
      results = [];
      selectedId = null;
      locateDistance = null;
      mode = 'idle';
      setShell(false);
      renderResults();
    }
    renderRecents();
    setStatus('');
    return;
  }
  setShell(true);
  debounce = setTimeout(() => void runSearch(q), 150);
}

async function runSearch(q: string): Promise<void> {
  mode = 'searching';
  selectedId = null;
  locateDistance = null;
  userLatLng = null;
  renderResults();
  setStatus('Searching…');
  try {
    const rows = await searchClient.search(q);
    results = rows;
    mode = 'idle';
    addRecent(q);
    setShell(true);
    renderResults();
    renderRecents();
    renderBookmarks();
    setStatus(rows.length === 0 ? 'No matches.' : `${rows.length} result${rows.length === 1 ? '' : 's'}.`);
  } catch (err) {
    if (err instanceof Error && err.message === ABORTED) return;
    mode = 'idle';
    results = [];
    renderResults();
    setStatus(err instanceof Error ? err.message : 'Search failed.');
  }
}

// ---------------------------------------------------------------------------
// Locate flow
// ---------------------------------------------------------------------------
function onLocate(): void {
  if (!('geolocation' in navigator)) {
    setStatus('Geolocation is not supported by this browser.');
    return;
  }
  els.locateBtn.disabled = true;
  els.locateBtnTop.disabled = true;
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      els.locateBtn.disabled = false;
      els.locateBtnTop.disabled = false;
      const { latitude, longitude } = pos.coords;
      userLatLng = { lat: latitude, lng: longitude };
      try {
        const addr = await searchClient.reverse(latitude, longitude);
        if (addr === null) {
          results = [];
          selectedId = null;
          mode = 'idle';
          setShell(true);
          renderResults();
          renderEmptyInResults('No registered building within 5 km of your coordinates.');
          setStatus('No address found within 5 km.');
          return;
        }
        results = [addr];
        selectedId = addr.object_id;
        mode = 'located';
        if (hasCoords(addr)) {
          locateDistance = haversine(latitude, longitude, addr.lat, addr.lng);
        }
        setShell(true);
        renderResults();
        renderBookmarks();
        setStatus('Nearest building to your location.');
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Reverse geocode failed.');
      }
    },
    (err) => {
      els.locateBtn.disabled = false;
      els.locateBtnTop.disabled = false;
      const messages: Record<number, string> = {
        1: 'Location permission denied.',
        2: 'Position unavailable.',
        3: 'Finding your location timed out.',
      };
      setStatus(messages[err.code] ?? `Could not get your location (${err.message}).`);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  );
}

function renderEmptyInResults(message: string): void {
  els.results.innerHTML = renderEmpty(message);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Result actions (delegated)
// ---------------------------------------------------------------------------
function findRow(objectId: number): AddressRow | undefined {
  return results.find((r) => r.object_id === objectId);
}
function toBookmark(row: AddressRow): BookmarkRow {
  return { object_id: row.object_id, formatted_en: row.formatted_en, formatted_ar: row.formatted_ar, lat: row.lat, lng: row.lng };
}

els.results.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const card = target.closest<HTMLElement>('[data-result-row]');
  const shareId = target.closest('[data-share]')?.getAttribute('data-share');
  const copyId = target.closest('[data-copycoords]')?.getAttribute('data-copycoords');
  const starId = target.closest('[data-star]')?.getAttribute('data-star');

  if (shareId) { const row = findRow(Number(shareId)); if (row) showToast(await shareAddress(row)); return; }
  if (copyId)  { const row = findRow(Number(copyId));  if (row) showToast(await copyCoords(row)); return; }
  if (starId)  { const row = findRow(Number(starId));  if (row) { toggleBookmark(toBookmark(row)); renderResults(); renderBookmarks(); } return; }
  if (card && !target.closest('a,button')) {
    selectedId = Number(card.dataset.objectId);
    locateDistance = null;
    userLatLng = null;
    renderResults();
  }
});

// Recents (in hero): click to re-run, ✕ to remove
els.recentsRow.addEventListener('click', (e) => {
  const remove = (e.target as HTMLElement).closest('[data-remove]');
  if (remove) {
    const value = remove.getAttribute('data-remove')!;
    const next = loadRecents().filter((r) => r !== value);
    try { localStorage.setItem('af:recents', JSON.stringify(next)); } catch { /* ignore */ }
    renderRecents();
    return;
  }
  const pill = (e.target as HTMLElement).closest('[data-pill]');
  if (pill) { setQuery(pill.getAttribute('data-pill')!); onInput(activeInput); }
});

// Bookmarks: click to view (wired to both the active-mode row and the hero row)
function onBookmarkClick(e: MouseEvent): void {
  const pill = (e.target as HTMLElement).closest('[data-pill]');
  if (!pill) return;
  const objectId = Number(pill.getAttribute('data-pill'));
  const existing = results.find((r) => r.object_id === objectId);
  if (existing) { selectedId = objectId; renderResults(); return; }
  const bm = loadBookmarks().find((b) => b.object_id === objectId);
  if (bm) {
    results = [{
      object_id: bm.object_id, building_no1: '', road_no: null, block_no: null,
      lat: bm.lat, lng: bm.lng, area_name_en: null, area_name_ar: null,
      formatted_en: bm.formatted_en, formatted_ar: bm.formatted_ar,
    }];
    selectedId = bm.object_id;
    mode = 'located';
    setShell(true);
    renderResults();
  }
}
els.bookmarksRow.addEventListener('click', onBookmarkClick);
els.heroBookmarksRow.addEventListener('click', onBookmarkClick);

// ---------------------------------------------------------------------------
// Keyboard navigation (works on whichever input is focused)
// ---------------------------------------------------------------------------
function onKeyDown(e: KeyboardEvent): void {
  // ⌘K / Ctrl+K focuses the active search from anywhere.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    activeInput.focus();
    activeInput.select();
    return;
  }
  if (results.length === 0) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const idx = results.findIndex((r) => r.object_id === selectedId);
    let next = idx;
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : Math.min(idx + 1, results.length - 1);
    if (e.key === 'ArrowUp') next = idx <= 0 ? 0 : idx - 1;
    selectedId = results[next]?.object_id ?? null;
    locateDistance = null; userLatLng = null;
    renderResults();
    document.querySelector<HTMLElement>('.result--selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (e.key === 'Enter' && selectedId !== null) {
    const row = findRow(selectedId);
    if (row && hasCoords(row)) window.open(`https://www.google.com/maps?q=${row.lat},${row.lng}`, '_blank', 'noopener');
    return;
  }
  if (e.key === 'Escape') { setQuery(''); onInput(activeInput); activeInput.blur(); }
}

// ---------------------------------------------------------------------------
// Wiring + boot
// ---------------------------------------------------------------------------
els.inputHero.addEventListener('input', () => onInput(els.inputHero));
els.inputTop.addEventListener('input', () => onInput(els.inputTop));
els.inputHero.addEventListener('focus', () => { activeInput = els.inputHero; });
els.inputTop.addEventListener('focus', () => { activeInput = els.inputTop; });
els.locateBtn.addEventListener('click', onLocate);
els.locateBtnTop.addEventListener('click', onLocate);
els.clearBtn.addEventListener('click', () => { setQuery(''); onInput(activeInput); activeInput.focus(); });
els.themeToggle.addEventListener('click', toggleTheme);
els.langToggle.addEventListener('click', toggleLang);
document.addEventListener('keydown', onKeyDown);

applyTheme();
applyLang();
setShell(false);

// Deep-link support: ?q=... pre-fills and runs a search (shareable + indexable).
const initialQuery = new URLSearchParams(location.search).get('q');
if (initialQuery) {
  setQuery(initialQuery);
  onInput(activeInput);
}

renderRecents();
renderBookmarks();
// Auto-focus the hero search after the entrance animation.
setTimeout(() => els.inputHero.focus(), 350);
