/**
 * GET /api/search?q=…
 *
 * Every normalized word must appear as a substring of searchable_text
 * (AND-substring), ordered by object_id, capped at SEARCH_LIMIT. Returns
 * `{ success: true, data: [...] }`.
 *
 * Two query paths:
 *   - FTS5 trigram fast path when every word is ≥3 chars (the common case).
 *     Reads only matching rows — cheap on D1's rows-read billing.
 *   - LIKE fallback when any word is <3 chars (trigram can't index those).
 *     LIMIT 20 bounds the cost; rare in practice.
 */
import type { Context } from 'hono';
import type { AddressRow, Env } from './types';
import { SEARCH_LIMIT, wordsOf } from '../../shared/query';

const COLUMNS =
  'object_id, building_no1, road_no, block_no, lat, lng, ' +
  'area_name_en, area_name_ar, formatted_en, formatted_ar';

/** Max raw query length — bounds work for abusive input. */
const MAX_QUERY_LEN = 200;

export async function searchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query('q') ?? '';
  if (raw.length > MAX_QUERY_LEN) {
    return c.json({ success: false, message: 'Query too long.' }, 400);
  }

  const words = wordsOf(raw);
  if (words.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const allLongEnough = words.every((w) => [...w].length >= 3);
  const rows = allLongEnough
    ? await searchFts(c.env.DB, words)
    : await searchLike(c.env.DB, words);

  return c.json({ success: true, data: rows });
}

/** FTS5 trigram fast path: each word wrapped as a quoted phrase → AND of substrings. */
async function searchFts(db: Env['DB'], words: string[]): Promise<AddressRow[]> {
  // Keep only [A-Za-z0-9] so FTS5 syntax chars (%, *, :, etc.) can't break the
  // MATCH expression; drop any word that normalizes to empty.
  const matchExpr = words
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter((w) => w.length > 0)
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(' ');
  const { results } = await db
    .prepare(
      `SELECT a.${COLUMNS.replaceAll(', ', ', a.')} ` +
        'FROM addresses a ' +
        'JOIN addresses_fts f ON f.rowid = a.object_id ' +
        'WHERE addresses_fts MATCH ?1 ' +
        'ORDER BY a.object_id LIMIT ?2',
    )
    .bind(matchExpr, SEARCH_LIMIT)
    .all<AddressRow>();
  return (results ?? []).map(coerceRow);
}

/** LIKE fallback — used for short (<3 char) words only (trigram can't index those). */
async function searchLike(db: Env['DB'], words: string[]): Promise<AddressRow[]> {
  // Build placeholders ?1, ?2, … and append LIMIT as the last bind.
  const clauses = words.map((_, i) => `searchable_text LIKE ?${i + 1}`).join(' AND ');
  const limitIdx = words.length + 1;
  const sql = `SELECT ${COLUMNS} FROM addresses WHERE ${clauses} ORDER BY object_id LIMIT ?${limitIdx}`;
  const stmt = db.prepare(sql);
  const binds: Array<string | number> = words.map((w) => `%${w}%`);
  binds.push(SEARCH_LIMIT);
  const { results } = await stmt.bind(...binds).all<AddressRow>();
  return (results ?? []).map(coerceRow);
}

/** Coerce a D1 row (typed) into our AddressRow, normalizing nulls/numbers. */
function coerceRow(r: Partial<AddressRow>): AddressRow {
  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v);
  const str = (v: unknown): string | null =>
    v === null || v === undefined || v === '' ? null : String(v);
  return {
    object_id: Number(r.object_id) | 0,
    building_no1: String(r.building_no1 ?? ''),
    road_no: num(r.road_no),
    block_no: num(r.block_no),
    lat: num(r.lat),
    lng: num(r.lng),
    area_name_en: str(r.area_name_en),
    area_name_ar: str(r.area_name_ar),
    formatted_en: String(r.formatted_en ?? ''),
    formatted_ar: String(r.formatted_ar ?? ''),
    searchable_text: str(r.searchable_text),
  };
}
