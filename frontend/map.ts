/**
 * Leaflet wrapper. Lazy-initialized: nothing loads until the first map is
 * shown. Tile theme (CARTO dark / voyager) syncs with the app theme.
 *
 * Leaflet is loaded from CDN as a global `window.L` (see index.html), so this
 * module has no static import — it references `window.L` at call time.
 */
import type { Theme } from './storage';

type LatLng = { lat: number; lng: number };
type ShowOpts = {
  /** The address marker (the selected/located building). */
  address: LatLng;
  /** Optional user location (for "locate me": shows the GPS dot + a line). */
  user?: LatLng;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type LeafletMap = any;
type LeafletLayer = any;

class AddressMap {
  private map: LeafletMap = null;
  private tileLayer: LeafletLayer = null;
  private addressMarker: LeafletLayer = null;
  private userMarker: LeafletLayer = null;
  private line: LeafletLayer = null;
  private theme: Theme = 'dark';

  /** Tile URL for the current theme. CARTO basemaps — free, no API key. */
  private tileUrl(): string {
    return this.theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  }
  private tileAttribution(): string {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  }

  /** Set the theme; if a map is live, swap the tile layer. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.map && this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
      this.tileLayer = this.L().tileLayer(this.tileUrl(), {
        attribution: this.tileAttribution(),
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(this.map);
    }
  }

  /** Lazily get the Leaflet global (loaded via CDN script tag). */
  private L(): any {
    const L = (window as any).L;
    if (!L) throw new Error('Leaflet not loaded');
    return L;
  }

  /** Mount the map into the given container (created per-selection by render.ts). */
  mount(container: HTMLElement): void {
    if (this.map) this.destroy();
    const L = this.L();
    this.map = L.map(container, { scrollWheelZoom: false, zoomControl: true });
    this.tileLayer = L.tileLayer(this.tileUrl(), {
      attribution: this.tileAttribution(),
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(this.map);
  }

  /** Show markers and fit bounds. Call after mount(). */
  show(opts: ShowOpts): void {
    if (!this.map) return;
    const L = this.L();

    // Clear previous overlays.
    [this.addressMarker, this.userMarker, this.line].forEach((m) => { if (m) this.map.removeLayer(m); });

    this.addressMarker = L.marker([opts.address.lat, opts.address.lng]).addTo(this.map);

    if (opts.user) {
      // Blue-circle user marker via SVG divIcon.
      const userIcon = L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4);"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      });
      this.userMarker = L.marker([opts.user.lat, opts.user.lng], { icon: userIcon }).addTo(this.map);
      this.line = L.polyline(
        [[opts.user.lat, opts.user.lng], [opts.address.lat, opts.address.lng]],
        { color: '#3b82f6', weight: 2, dashArray: '4 6' },
      ).addTo(this.map);
      this.map.fitBounds(this.line.getBounds(), { padding: [30, 30], maxZoom: 16 });
    } else {
      this.map.setView([opts.address.lat, opts.address.lng], 15);
    }

    // Leaflet needs a nudge to render correctly when its container was hidden
    // or just inserted into the DOM.
    setTimeout(() => this.map?.invalidateSize(), 60);
  }

  destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.tileLayer = null;
      this.addressMarker = null;
      this.userMarker = null;
      this.line = null;
    }
  }
}

export const addressMap = new AddressMap();
