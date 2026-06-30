-- ───────────────────────────────────────────────────────────────────────────
-- ai-search activation migration (RAG: «Подобрать вино из погреба»)
--
-- Apply this ONCE on the target database (psql -f or any client) AFTER pgvector
-- is installed in the PostgreSQL instance. It is idempotent.
--
-- pgvector install: this DB (PG 17) does not have it yet. Either install the
-- pgvector binaries into the existing instance, or run the bundled
-- docker-compose.pgvector.yml which boots PG17 + pgvector with the same creds.
--
-- Embedding dimension below (1024) must match the embedding model. Default model
-- is Voyage voyage-3.5 (1024 dims). If you switch models/dims, change vector(N)
-- here and re-embed everything.
-- ───────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- New free-text columns on the cellar bottle (the primary user-side search signal).
ALTER TABLE cellar_item ADD COLUMN IF NOT EXISTS user_description   text;
ALTER TABLE cellar_item ADD COLUMN IF NOT EXISTS seller_description text;

-- Book knowledge base: one row per fine-grained chunk (see knowledge/books/_index).
CREATE TABLE IF NOT EXISTS kb_chunk (
  id            text PRIMARY KEY,            -- "{book_id}:p{png}:{idx}"
  book_id       text        NOT NULL,
  printed_page  int,
  png           int,
  sections      text[]      NOT NULL DEFAULT '{}',
  heading       text,
  content_hash  text        NOT NULL,        -- skip re-embedding unchanged chunks
  text          text        NOT NULL,
  embedding     vector(1024),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kb_chunk_book_idx ON kb_chunk (book_id);
CREATE INDEX IF NOT EXISTS kb_chunk_embedding_idx
  ON kb_chunk USING hnsw (embedding vector_cosine_ops);

-- Per-bottle description chunks (owner-scoped vector search over user_description).
CREATE TABLE IF NOT EXISTS wine_desc_chunk (
  id             text PRIMARY KEY,           -- "{cellar_item_id}:{source}:{idx}"
  cellar_item_id uuid        NOT NULL REFERENCES cellar_item(id) ON DELETE CASCADE,
  owner_id       uuid        NOT NULL,        -- denormalized for cheap user filtering
  source         text        NOT NULL,        -- 'user' | 'seller'
  content_hash   text        NOT NULL,
  text           text        NOT NULL,
  embedding      vector(1024),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wine_desc_chunk_owner_idx ON wine_desc_chunk (owner_id);
CREATE INDEX IF NOT EXISTS wine_desc_chunk_item_idx  ON wine_desc_chunk (cellar_item_id);
CREATE INDEX IF NOT EXISTS wine_desc_chunk_embedding_idx
  ON wine_desc_chunk USING hnsw (embedding vector_cosine_ops);
