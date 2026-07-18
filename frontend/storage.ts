/**
 * Tiny typed localStorage wrappers for the three persisted preferences:
 *   - theme:        'dark' | 'light'
 *   - recents:      recent search query strings
 *   - bookmarks:    saved AddressRow objects, keyed by object_id
 *
 * All access is guarded so a disabled/throwing localStorage (private mode,
 * quota exceeded) degrades gracefully — the app still works, just without
 * persistence.
 */

export type Theme = 'dark' | 'light';
export type Lang = 'en' | 'ar';

const THEME_KEY = 'af:theme';
const LANG_KEY = 'af:lang';
const RECENTS_KEY = 'af:recents';
const BOOKMARKS_KEY = 'af:bookmarks';

const MAX_RECENTS = 8;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore quota */ }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
export function loadTheme(): Theme {
  const stored = safeGet(THEME_KEY);
  return stored === 'light' ? 'light' : 'dark';
}
export function saveTheme(theme: Theme): void {
  safeSet(THEME_KEY, theme);
}

// ---------------------------------------------------------------------------
// Language (affects <html lang/dir> for SEO + RTL layout)
// ---------------------------------------------------------------------------
export function loadLang(): Lang {
  const stored = safeGet(LANG_KEY);
  return stored === 'ar' ? 'ar' : 'en';
}
export function saveLang(lang: Lang): void {
  safeSet(LANG_KEY, lang);
}

// ---------------------------------------------------------------------------
// Recent searches (plain strings, most-recent-first, deduped, capped)
// ---------------------------------------------------------------------------
export function loadRecents(): string[] {
  const raw = safeGet(RECENTS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

export function addRecent(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecents();
  const recents = loadRecents().filter((r) => r !== q);
  recents.unshift(q);
  const capped = recents.slice(0, MAX_RECENTS);
  safeSet(RECENTS_KEY, JSON.stringify(capped));
  return capped;
}

export function clearRecents(): void {
  try { localStorage.removeItem(RECENTS_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Bookmarks (AddressRow objects, keyed by object_id)
// ---------------------------------------------------------------------------
export interface BookmarkRow {
  object_id: number;
  formatted_en: string;
  formatted_ar: string;
  lat: number | null;
  lng: number | null;
}

export function loadBookmarks(): BookmarkRow[] {
  const raw = safeGet(BOOKMARKS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as BookmarkRow[]) : [];
  } catch { return []; }
}

export function isBookmarked(objectId: number): boolean {
  return loadBookmarks().some((b) => b.object_id === objectId);
}

export function toggleBookmark(row: BookmarkRow): BookmarkRow[] {
  const current = loadBookmarks();
  const existing = current.some((b) => b.object_id === row.object_id);
  const next = existing
    ? current.filter((b) => b.object_id !== row.object_id)
    : [{ ...row }, ...current];
  safeSet(BOOKMARKS_KEY, JSON.stringify(next));
  return next;
}
