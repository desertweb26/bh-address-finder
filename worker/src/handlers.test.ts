import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AddressRow, Env } from './types';
import { searchHandler } from './search';
import { reverseHandler } from './reverse';

/**
 * Handler tests with a fake D1. These don't exercise real SQLite — they
 * verify routing, input validation, and that the handlers shape queries and
 * responses correctly. The query-normalization + distance math in
 * shared/query.ts and shared/geo.ts are exercised end-to-end through these handlers.
 */

// A tiny recorder-prepared-statement stub. `prepare(sql)` returns an object
// whose `.bind(...).all()` resolves to whatever the test seeded for that SQL.
function makeFakeDb(): {
  db: Env['DB'];
  /** Set the rows returned by `.all()` for the next prepare() with matching sql. */
  when: (sqlMatch: RegExp, rows: Array<Record<string, unknown>>) => void;
} {
  const stubs: Array<{ match: RegExp; rows: Array<Record<string, unknown>> }> = [];
  return {
    db: {
      prepare(sql: string) {
        return {
          bind(..._params: unknown[]) {
            return {
              async all<T>() {
                const hit = stubs.find((s) => s.match.test(sql));
                return { results: (hit?.rows ?? []) as unknown as T[], success: true, meta: {} };
              },
              async first<T>() {
                const hit = stubs.find((s) => s.match.test(sql));
                return (hit?.rows[0] ?? null) as unknown as T | null;
              },
              async run() {
                return { success: true, meta: {} };
              },
            };
          },
        } as unknown as ReturnType<Env['DB']['prepare']>;
      },
      async batch<T>(stmts: Array<{ all: () => Promise<{ results: T[] }> }>) {
        const out = [];
        for (const s of stmts) out.push(await s.all());
        return out as unknown as Awaited<ReturnType<Env['DB']['batch']>>;
      },
    } as unknown as Env['DB'],
    when(sqlMatch, rows) {
      stubs.push({ match: sqlMatch, rows });
    },
  };
}

function makeApp(db: Env['DB']): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  // Inject the fake DB via the binding shape the handlers read.
  app.use('*', async (c, next) => {
    c.env = { DB: db, ASSETS: undefined as unknown as Env['ASSETS'] };
    await next();
  });
  app.get('/api/search', searchHandler);
  app.get('/api/reverse', reverseHandler);
  return app;
}

// Fake address (no real building) — keeps the same field shape and formatting
// patterns so the handler tests exercise coercion, routing, and response shape.
const sampleAddress: AddressRow = {
  object_id: 1,
  building_no1: '9999',
  road_no: 8888,
  block_no: 777,
  lat: 26.0,
  lng: 50.0,
  area_name_en: 'TEST AREA',
  area_name_ar: 'منطقة عينة',
  formatted_en: 'Building 9999, Road 8888, Block 777, TEST AREA',
  formatted_ar: 'مبنى 9999، شارع 8888، مجمع 777، منطقة عينة',
  searchable_text: 'building 9999 road 8888 block 777 test area',
};

describe('GET /api/search', () => {
  it('returns 200 + empty data for an empty query', async () => {
    const { db } = makeFakeDb();
    const app = makeApp(db);
    const res = await app.request('/api/search?q=');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: [] });
  });

  it('rejects an over-long query with 400', async () => {
    const { db } = makeFakeDb();
    const app = makeApp(db);
    const res = await app.request('/api/search?q=' + 'a'.repeat(201));
    expect(res.status).toBe(400);
  });

  it('returns matching rows on the FTS path', async () => {
    const { db, when } = makeFakeDb();
    when(/addresses_fts/, [sampleAddress as unknown as Record<string, unknown>]);
    const app = makeApp(db);
    const res = await app.request('/api/search?q=building%209999');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: AddressRow[] };
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].formatted_en).toBe('Building 9999, Road 8888, Block 777, TEST AREA');
  });

  it('uses the LIKE fallback for short (<3 char) words', async () => {
    const { db, when } = makeFakeDb();
    // "33" is 2 chars → LIKE path. The handler should hit the LIKE SQL, not FTS.
    when(/LIKE/, [sampleAddress as unknown as Record<string, unknown>]);
    const app = makeApp(db);
    const res = await app.request('/api/search?q=33');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: AddressRow[] };
    expect(json.data).toHaveLength(1);
  });
});

describe('GET /api/reverse', () => {
  it('rejects missing coordinates with 400', async () => {
    const { db } = makeFakeDb();
    const app = makeApp(db);
    const res = await app.request('/api/reverse');
    expect(res.status).toBe(400);
  });

  it('rejects out-of-Bahrain coordinates with 400', async () => {
    const { db } = makeFakeDb();
    const app = makeApp(db);
    // London — clearly outside the Bahrain bounds guard.
    const res = await app.request('/api/reverse?lat=51.5&lng=-0.12');
    expect(res.status).toBe(400);
  });

  it('returns 404 when no candidate is within the box', async () => {
    const { db, when } = makeFakeDb();
    when(/BETWEEN/, []); // no candidates near the point
    const app = makeApp(db);
    const res = await app.request('/api/reverse?lat=26.19&lng=50.51');
    expect(res.status).toBe(404);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
