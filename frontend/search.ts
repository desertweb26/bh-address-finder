/**
 * Search client with stale-request cancellation.
 *
 * Each call to `search()` aborts any in-flight request (via AbortController)
 * before issuing the new one, so typing fast never renders an older response.
 * The promise rejects with 'aborted' for cancelled requests; callers should
 * catch and ignore that specific case.
 */

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
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/** Sentinel thrown when a newer search supersedes this one. */
export const ABORTED = 'aborted';

export class SearchClient {
  private controller: AbortController | null = null;

  async search(q: string): Promise<AddressRow[]> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (!r.ok) throw new Error(`Search failed (HTTP ${r.status})`);
      const json: ApiResponse<AddressRow[]> = await r.json();
      return json.data ?? [];
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw new Error(ABORTED);
      throw err;
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Reverse-geocode via the API. Returns null when no address is in range (404). */
  async reverse(lat: number, lng: number): Promise<AddressRow | null> {
    const r = await fetch(`/api/reverse?lat=${lat}&lng=${lng}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Reverse failed (HTTP ${r.status})`);
    const json: ApiResponse<AddressRow> = await r.json();
    return json.data ?? null;
  }
}

export const searchClient = new SearchClient();
