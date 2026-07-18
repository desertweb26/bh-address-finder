/**
 * Worker types: the D1 + Static Assets bindings and the address row shape.
 */
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Static Assets binding. Typed locally (not via workers-types' Fetcher) to
 * avoid the Response/Request type conflicts between the Workers runtime types
 * and the DOM lib. At runtime this is Cloudflare's ASSETS binding, whose
 * `.fetch()` returns a Response the Worker can return directly.
 */
export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

/** Bindings declared in worker/wrangler.jsonc. */
export interface Env {
  /** The D1 database holding `addresses` + `addresses_fts`. */
  DB: D1Database;
  /** Static Assets binding serving the built frontend (frontend-dist/). */
  ASSETS: AssetFetcher;
}

/** A single address row, as read from D1. */
export interface AddressRow {
  object_id: number;
  building_no1: string;
  road_no: number | null;
  block_no: number | null;
  lat: number | null;
  lng: number | null;
  area_name_en: string | null;
  area_name_ar: string | null;
  formatted_en: string;
  formatted_ar: string;
  searchable_text: string | null;
}

/** Reverse-geocode result: nearest address (or null if out of range) + distance. */
export interface ReverseResult {
  address: AddressRow | null;
  distance: number;
}
