-- Migration 0060 created marketplace money columns as NUMERIC(19, 4). No Rust model
-- consumes them yet, but every money column in this schema uses DOUBLE PRECISION because
-- sqlx's Postgres decoder does not support NUMERIC -> f64 (see migration 0076 for the
-- fixed asset bug this caused). Align these columns now so the same trap isn't waiting
-- for whoever wires up the Shopee integration.

ALTER TABLE marketplace_orders
    ALTER COLUMN total_amount TYPE DOUBLE PRECISION USING total_amount::DOUBLE PRECISION;

ALTER TABLE marketplace_order_items
    ALTER COLUMN original_price TYPE DOUBLE PRECISION USING original_price::DOUBLE PRECISION,
    ALTER COLUMN discounted_price TYPE DOUBLE PRECISION USING discounted_price::DOUBLE PRECISION;
