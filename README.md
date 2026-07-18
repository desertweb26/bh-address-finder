# Bahrain Address Finder

Search Bahrain's national address registry, share a Google Maps link for any
address, and reverse-geocode your GPS position to the nearest registered
building. Runs on **Cloudflare Workers + D1**, with a plain-TS + Tailwind
frontend — no React, no client-side database, no per-load data download.

## Architecture

```
Browser (plain TS + Tailwind page, ~15 KB JS)
   │  fetch /api/search?q=…   fetch /api/reverse?lat&lng
   ▼
Hono app (Worker)  ─── Static Assets (frontend-dist/) for the page
   │  env.DB (D1 binding)
   ▼
D1: addresses + addresses_fts (fts5 trigram) + lat/lng indexes
```

One Worker serves both the page and the JSON API from a single origin (no CORS).
Search uses an **FTS5 trigram index** for indexed substring matching; reverse
geocode uses a lat/lng bounding-box prefilter + exact haversine, with a 5 km
cutoff beyond which "no address found" is returned.

## Stack

- **Hono** — runtime-agnostic routing. Only the `env.DB` (D1) calls are
  Cloudflare-specific; the routes themselves port to Node/Bun/Deno.
- **Cloudflare D1** — managed SQLite with FTS5. Free tier (5M rows read/day,
  5 GB storage) covers this comfortably.
- **Tailwind v4** — config-free (`@tailwindcss/vite` plugin), with `@theme`
  tokens + `@apply` component classes for the Hero Spotlight UI.
- **Plain TypeScript** frontend — no framework. State is module variables;
  `render()` rebuilds the DOM.
- **Leaflet 1.9** (CDN) — lazy-loaded map inside the selected result card.

## Features

- **Search** in English or Arabic — Arabic-Indic & Persian digits auto-folded,
  glued shorthand (`b9999`) extracted, substring-matched against building,
  road, block, and area. Token-preview chips under the input show the
  normalized query.
- **Share** each result — native Web Share on mobile, clipboard copy
  elsewhere, plus *Open in Google Maps* and *Directions* links. **No API key**
  (`https://www.google.com/maps?q=LAT,LNG`).
- **Locate me** — `navigator.geolocation` → nearest registered building within
  the 5 km cutoff, shown on a Leaflet map with a line to your GPS point.
- **Recents & bookmarks** — persisted to `localStorage`; saved addresses show
  on the main page.
- **Dark/light theme** toggle (persisted); map tiles swap with the theme.
- **Keyboard** — `⌘K`/`Ctrl+K` focuses search, `↑`/`↓` navigate results,
  `Enter` opens the highlighted row in Maps, `Esc` clears.

## Project layout

```
address-finder/
├── frontend/                 plain TS page (no framework)
│   ├── index.html            hero composition (idle) + topbar (active)
│   ├── app.ts                orchestration: state, render, events, geolocation
│   ├── app.css               Tailwind v4: @theme tokens + @apply components
│   ├── search.ts             AbortController-raced fetch client
│   ├── render.ts             pure HTML builders (cards, chips, skeletons)
│   ├── map.ts                Leaflet wrapper (lazy init, theme-synced tiles)
│   ├── share.ts              Web Share / clipboard / Maps URLs
│   └── storage.ts            localStorage: theme, recents, bookmarks
├── worker/
│   ├── src/
│   │   ├── index.ts          Hono app: routes + static-asset fallback
│   │   ├── search.ts         FTS5 trigram + LIKE fallback
│   │   ├── reverse.ts        bounding-box + haversine + 5 km cutoff
│   │   ├── types.ts          Env (D1 + ASSETS), AddressRow
│   │   └── handlers.test.ts  routing/validation tests (fake D1)
│   ├── migrations/0001_initial.sql
│   └── wrangler.jsonc        database_id uses the ${D1_DATABASE_ID} env var
├── shared/
│   ├── query.ts              wordsOf, normalizeDigits, SEARCH_LIMIT
│   └── geo.ts                haversineMeters, EARTH_RADIUS_METRES, MAX_REVERSE_DISTANCE_METERS
├── .github/workflows/deploy.yml   CI deploy pipeline
├── vite.config.ts            frontend dev (HMR + /api proxy)
├── vitest.config.ts
└── package.json
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/search?q=…` | Free-text search (EN/AR). Returns `{ success, data: AddressRow[] }`. |
| `GET /api/reverse?lat=&lng=` | Nearest building within 5 km. Returns `{ success, data: AddressRow }` or 404. |
| `GET /api/health` | Liveness + row count. |

## Notes & constraints

- **FTS5 is load-bearing on D1.** D1 bills on rows scanned; a `LIKE '%word%'`
  scan over ~300K rows would exhaust the free tier quickly. The trigram index
  keeps a search to ~20 rows read instead.
- **Reverse geocode has no PostGIS on D1.** A lat/lng bounding-box prefilter
  (indexed) narrows candidates to a few dozen rows; exact haversine in JS picks
  the nearest, with the 5 km cutoff.
- **`database_id` is read from the `D1_DATABASE_ID` env var.** Export it in
  your shell (`export D1_DATABASE_ID=…`) before any `wrangler` command; in CI
  it comes from a repository secret. The real id never enters source.
- **Production domain.** Set `VITE_SITE_URL` (e.g. `VITE_SITE_URL=https://your-domain.example npm run build`)
  so the generated `sitemap.xml` / `robots.txt` point at your real origin.
  Defaults to the `bh-address-finder.workers.dev` subdomain if unset.
- **Security headers.** The Worker sets a Content-Security-Policy (allowing the
  Leaflet CDN + CARTO map tiles), plus `X-Content-Type-Options`,
  `Referrer-Policy`, and `X-Frame-Options` on every response.
