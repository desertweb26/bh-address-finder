/**
 * GET /api/reverse?lat=&lng=
 *
 * Returns the nearest registered building to the coordinates, but only if
 * within MAX_REVERSE_DISTANCE_METRES. Returns `{ success: true, data: {...} }`,
 * or `{ success: false, message }` (404) when beyond the 5 km cutoff.
 *
 * D1 has no PostGIS, so we use a two-stage strategy:
 *   1. Fetch candidates inside a small lat/lng bounding box (indexed range
 *      scans on idx_addresses_lat / idx_addresses_lng) — a few dozen rows.
 *   2. Exact haversine in JS over the candidates; pick the nearest.
 * Bahrain spans ~0.6°, so a ~0.05° box (~5.5 km) safely contains anything
 * within the 5 km cutoff.
 */
import type { Context } from 'hono';
import type { AddressRow, Env, ReverseResult } from './types';
import { MAX_REVERSE_DISTANCE_METERS, haversineMeters } from '../../shared/geo';

/** Half-width of the candidate bounding box, in degrees (~6.3 km at this latitude).
 *  Wider than the 5 km cutoff so the prefilter always contains anything within
 *  range; exact haversine still enforces the real 5 km limit. */
const BOX_DEGREES = 0.07;

interface CandidateRow {
  object_id: number;
  lat: number;
  lng: number;
}

export async function reverseHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const lat = parseNumber(c.req.query('lat'));
  const lng = parseNumber(c.req.query('lng'));
  if (lat === null || lng === null || !inBahrain(lat, lng)) {
    return c.json({ success: false, message: 'Invalid or out-of-range coordinates.' }, 400);
  }

  const result = await reverseNearest(c.env.DB, lat, lng);

  if (!result || result.address === null) {
    return c.json(
      { success: false, message: 'No address found near these coordinates' },
      404,
    );
  }
  return c.json({ success: true, data: result.address });
}

/** Find the nearest address to (lat,lng), applying the 5 km cutoff. */
export async function reverseNearest(db: Env['DB'], lat: number, lng: number): Promise<ReverseResult | null> {
  // Stage 1: cheap bounding-box candidate fetch via indexed range scans.
  const { results } = await db
    .prepare(
      'SELECT object_id, lat, lng FROM addresses ' +
        'WHERE lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4',
    )
    .bind(lat - BOX_DEGREES, lat + BOX_DEGREES, lng - BOX_DEGREES, lng + BOX_DEGREES)
    .all<CandidateRow>();

  const candidates = results ?? [];
  if (candidates.length === 0) return { address: null, distance: Infinity };

  // Stage 2: exact haversine over the small candidate set.
  let bestId: number | null = null;
  let bestDist = Infinity;
  for (const cand of candidates) {
    const d = haversineMeters(lat, lng, cand.lat, cand.lng);
    if (d < bestDist) {
      bestDist = d;
      bestId = cand.object_id;
    }
  }
  if (bestId === null) return null;

  // Apply the threshold: beyond 5 km ⇒ treat as not found.
  if (bestDist > MAX_REVERSE_DISTANCE_METERS) {
    return { address: null, distance: bestDist };
  }

  const { results: addrRows } = await db
    .prepare(
      'SELECT object_id, building_no1, road_no, block_no, lat, lng, ' +
        'area_name_en, area_name_ar, formatted_en, formatted_ar, searchable_text ' +
        'FROM addresses WHERE object_id = ?1',
    )
    .bind(bestId)
    .all<AddressRow>();
  const address = addrRows?.[0] ?? null;
  return { address, distance: bestDist };
}

/** Parse a query-string number, returning null for missing/garbage input. */
function parseNumber(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coarse guard: reject coordinates clearly outside Bahrain's bounds. */
function inBahrain(lat: number, lng: number): boolean {
  return lat >= 25.5 && lat <= 26.8 && lng >= 50.2 && lng <= 51.0;
}
