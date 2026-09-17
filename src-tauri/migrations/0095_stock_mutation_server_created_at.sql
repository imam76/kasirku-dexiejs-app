-- `created_at` is assigned by the originating device and may reach PostgreSQL much later.
-- Cursor on a server-owned ingestion timestamp so delayed offline mutations cannot be skipped.

ALTER TABLE stock_mutations
    ADD COLUMN IF NOT EXISTS server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_stock_mutations_server_created_at_id
    ON stock_mutations (server_created_at, id);
