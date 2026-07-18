/**
 * Share + clipboard helpers. Google Maps links use no API key
 * (https://www.google.com/maps?q=LAT,LNG). Web Share API when available,
 * clipboard write with a toast fallback, prompt as last resort.
 */

import type { BookmarkRow } from './storage';
import { t } from './i18n';

/** A minimal address shape these helpers need. */
type Coords = Pick<BookmarkRow, 'lat' | 'lng'>;
type Shareable = Pick<BookmarkRow, 'lat' | 'lng' | 'formatted_en' | 'formatted_ar'>;

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function hasCoords(c: Coords): c is BookmarkRow & { lat: number; lng: number } {
  return c.lat !== null && c.lng !== null;
}

/** Copy "lat,lng" to the clipboard. Returns a user-facing message (or ''). */
export async function copyCoords(c: Coords): Promise<string> {
  if (!hasCoords(c)) return t('toast.noCoords');
  const text = `${c.lat},${c.lng}`;
  try {
    await navigator.clipboard.writeText(text);
    return t('toast.coordsCopied');
  } catch {
    window.prompt('Copy coordinates:', text);
    return '';
  }
}

/** Share an address (Web Share → clipboard → prompt). Returns a toast message or ''. */
export async function shareAddress(row: Shareable): Promise<string> {
  if (!hasCoords(row)) return t('toast.noCoords');
  const { lat, lng } = row;
  const label = row.formatted_en || row.formatted_ar || `${lat}, ${lng}`;
  const url = googleMapsUrl(lat, lng);

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bahrain address', text: label, url });
      return '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return '';
      // fall through to clipboard
    }
  }
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      return t('toast.linkCopied');
    } catch { /* last resort below */ }
  }
  window.prompt('Copy this link:', url);
  return '';
}
