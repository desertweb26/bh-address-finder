/**
 * Hono app entry. One Worker serves:
 *   - GET /api/search?q=…     → address search (FTS5 trigram)
 *   - GET /api/reverse?lat&lng → nearest-building reverse geocode
 *   - GET /api/health          → liveness + row count
 *   - *                        → the built frontend (Static Assets)
 *
 * Hono's routing is runtime-agnostic; only the `env.DB`/`env.ASSETS` bindings
 * are Cloudflare-specific (in search.ts / reverse.ts / the asset fallback).
 */
import { Hono } from 'hono';
import type { Env } from './types';
import { searchHandler } from './search';
import { reverseHandler } from './reverse';

const app = new Hono<{ Bindings: Env }>();

// Security headers on every response (API + static assets).
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net; " +
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "img-src 'self' https://*.basemaps.cartocdn.com data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};
app.use('*', async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
});

app.get('/api/health', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT count(*) AS n FROM addresses',
    ).all<{ n: number }>();
    return c.json({ ok: true, rows: results?.[0]?.n ?? 0 });
  } catch {
    return c.json({ ok: true, rows: null }, 200);
  }
});

app.get('/api/search', searchHandler);
app.get('/api/reverse', reverseHandler);

// Everything else → the built SPA / static page. The ASSETS binding returns a
// runtime Response; cast through unknown to satisfy the DOM-vs-workers-types
// Response mismatch in the type layer.
app.all('*', async (c) => (await c.env.ASSETS.fetch(c.req.raw)) as unknown as Response);

export default app;
