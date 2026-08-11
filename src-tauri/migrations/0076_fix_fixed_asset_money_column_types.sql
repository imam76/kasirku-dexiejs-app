-- Migration 0061 created fixed asset money columns as NUMERIC(19, 2), but the Rust DTOs
-- (FixedAssetDto, FixedAssetDepreciationRunDto, FixedAssetDepreciationRunLineDto) decode
-- them as f64, and sqlx's Postgres decoder does not support NUMERIC -> f64. Every other
-- money column in this schema uses DOUBLE PRECISION for that exact reason, so align these
-- columns with the rest of the codebase instead of introducing NUMERIC decoding support.

ALTER TABLE fixed_assets
    ALTER COLUMN acquisition_cost TYPE DOUBLE PRECISION USING acquisition_cost::DOUBLE PRECISION,
    ALTER COLUMN residual_value TYPE DOUBLE PRECISION USING residual_value::DOUBLE PRECISION,
    ALTER COLUMN regular_depreciation_amount TYPE DOUBLE PRECISION USING regular_depreciation_amount::DOUBLE PRECISION,
    ALTER COLUMN opening_accumulated_depreciation TYPE DOUBLE PRECISION USING opening_accumulated_depreciation::DOUBLE PRECISION;

ALTER TABLE fixed_asset_depreciation_runs
    ALTER COLUMN total_depreciation TYPE DOUBLE PRECISION USING total_depreciation::DOUBLE PRECISION;

ALTER TABLE fixed_asset_depreciation_run_lines
    ALTER COLUMN acquisition_cost TYPE DOUBLE PRECISION USING acquisition_cost::DOUBLE PRECISION,
    ALTER COLUMN residual_value TYPE DOUBLE PRECISION USING residual_value::DOUBLE PRECISION,
    ALTER COLUMN regular_depreciation_amount TYPE DOUBLE PRECISION USING regular_depreciation_amount::DOUBLE PRECISION,
    ALTER COLUMN opening_accumulated_depreciation TYPE DOUBLE PRECISION USING opening_accumulated_depreciation::DOUBLE PRECISION,
    ALTER COLUMN opening_book_value TYPE DOUBLE PRECISION USING opening_book_value::DOUBLE PRECISION,
    ALTER COLUMN depreciation_amount TYPE DOUBLE PRECISION USING depreciation_amount::DOUBLE PRECISION,
    ALTER COLUMN closing_accumulated_depreciation TYPE DOUBLE PRECISION USING closing_accumulated_depreciation::DOUBLE PRECISION,
    ALTER COLUMN closing_book_value TYPE DOUBLE PRECISION USING closing_book_value::DOUBLE PRECISION;
