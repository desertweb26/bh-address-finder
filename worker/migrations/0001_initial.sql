-- D1 schema for the Bahrain address finder.
-- One row per building in the national registry; the searchable_text blob is
-- a denormalized EN+AR+slug search index built from each row's fields.

CREATE TABLE IF NOT EXISTS addresses (
  object_id       INTEGER PRIMARY KEY,
  building_no1    TEXT,
  road_no         INTEGER,
  block_no        INTEGER,
  lat             REAL,
  lng             REAL,
  area_name_en    TEXT,
  area_name_ar    TEXT,
  formatted_en    TEXT,
  formatted_ar    TEXT,
  searchable_text TEXT
);

-- Trigram FTS5: indexed substring match, equivalent to LIKE '%word%' but
-- index-accelerated (D1 bills on rows scanned, so this is essential).
-- D1 requires lowercase 'fts5' and supports the trigram tokenizer.
-- (Without this, every search scans all 306K rows — unaffordable on D1's
-- rows-read billing. The FTS index keeps searches to ~20 rows read.)
CREATE VIRTUAL TABLE IF NOT EXISTS addresses_fts USING fts5(
  searchable_text,
  content='addresses',
  content_rowid='object_id',
  tokenize='trigram'
);

-- Bounding-box prefilter for reverse geocode: cheap range scans on lat, lng.
CREATE INDEX IF NOT EXISTS idx_addresses_lat ON addresses(lat);
CREATE INDEX IF NOT EXISTS idx_addresses_lng ON addresses(lng);
