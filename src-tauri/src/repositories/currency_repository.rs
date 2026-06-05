use crate::models::currency::{CurrencyDto, CurrencyRateDto};
use sqlx::PgPool;

pub async fn list_currencies(pool: &PgPool) -> Result<Vec<CurrencyDto>, sqlx::Error> {
    sqlx::query_as::<_, CurrencyDto>(
        r#"
        SELECT
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_base,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM currencies
        WHERE deleted_at IS NULL
        ORDER BY is_base DESC, code ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_currency(pool: &PgPool, id: String) -> Result<Option<CurrencyDto>, sqlx::Error> {
    sqlx::query_as::<_, CurrencyDto>(
        r#"
        SELECT
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_base,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM currencies
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_currency_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<CurrencyDto>, sqlx::Error> {
    sqlx::query_as::<_, CurrencyDto>(
        r#"
        SELECT
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_base,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM currencies
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_currency(
    pool: &PgPool,
    input: CurrencyDto,
) -> Result<CurrencyDto, sqlx::Error> {
    let currency_id = input.id.clone();
    let upserted_currency = sqlx::query_as::<_, CurrencyDto>(
        r#"
        INSERT INTO currencies (
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_base,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            symbol = EXCLUDED.symbol,
            decimal_places = EXCLUDED.decimal_places,
            is_base = EXCLUDED.is_base,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= currencies.updated_at
        RETURNING
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_base,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.name)
    .bind(input.symbol)
    .bind(input.decimal_places)
    .bind(input.is_base)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(currency) = upserted_currency {
        return Ok(currency);
    }

    get_currency_including_deleted(pool, currency_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_currency(
    pool: &PgPool,
    id: String,
) -> Result<Option<CurrencyDto>, sqlx::Error> {
    let deleted_currency = sqlx::query_as::<_, CurrencyDto>(
        r#"
        UPDATE currencies
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL AND is_base = FALSE
        RETURNING
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_base,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_currency.is_some() {
        return Ok(deleted_currency);
    }

    get_currency_including_deleted(pool, id).await
}

pub async fn list_currency_rates(
    pool: &PgPool,
    base_currency_code: Option<String>,
) -> Result<Vec<CurrencyRateDto>, sqlx::Error> {
    sqlx::query_as::<_, CurrencyRateDto>(
        r#"
        SELECT
            id,
            currency_code,
            base_currency_code,
            rate_date,
            source,
            unit_amount,
            bi_buy_rate,
            bi_sell_rate,
            middle_rate,
            fetched_at::TEXT AS fetched_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM currency_rates
        WHERE deleted_at IS NULL
          AND ($1::TEXT IS NULL OR base_currency_code = $1)
        ORDER BY rate_date DESC, currency_code ASC
        "#,
    )
    .bind(base_currency_code)
    .fetch_all(pool)
    .await
}

pub async fn get_currency_rate(
    pool: &PgPool,
    id: String,
) -> Result<Option<CurrencyRateDto>, sqlx::Error> {
    sqlx::query_as::<_, CurrencyRateDto>(
        r#"
        SELECT
            id,
            currency_code,
            base_currency_code,
            rate_date,
            source,
            unit_amount,
            bi_buy_rate,
            bi_sell_rate,
            middle_rate,
            fetched_at::TEXT AS fetched_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM currency_rates
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_currency_rate_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<CurrencyRateDto>, sqlx::Error> {
    sqlx::query_as::<_, CurrencyRateDto>(
        r#"
        SELECT
            id,
            currency_code,
            base_currency_code,
            rate_date,
            source,
            unit_amount,
            bi_buy_rate,
            bi_sell_rate,
            middle_rate,
            fetched_at::TEXT AS fetched_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM currency_rates
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_currency_rate(
    pool: &PgPool,
    input: CurrencyRateDto,
) -> Result<CurrencyRateDto, sqlx::Error> {
    let rate_id = input.id.clone();
    let upserted_rate = sqlx::query_as::<_, CurrencyRateDto>(
        r#"
        INSERT INTO currency_rates (
            id,
            currency_code,
            base_currency_code,
            rate_date,
            source,
            unit_amount,
            bi_buy_rate,
            bi_sell_rate,
            middle_rate,
            fetched_at,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::TIMESTAMPTZ, $11::TIMESTAMPTZ, $12::TIMESTAMPTZ, $13::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            currency_code = EXCLUDED.currency_code,
            base_currency_code = EXCLUDED.base_currency_code,
            rate_date = EXCLUDED.rate_date,
            source = EXCLUDED.source,
            unit_amount = EXCLUDED.unit_amount,
            bi_buy_rate = EXCLUDED.bi_buy_rate,
            bi_sell_rate = EXCLUDED.bi_sell_rate,
            middle_rate = EXCLUDED.middle_rate,
            fetched_at = EXCLUDED.fetched_at,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= currency_rates.updated_at
        RETURNING
            id,
            currency_code,
            base_currency_code,
            rate_date,
            source,
            unit_amount,
            bi_buy_rate,
            bi_sell_rate,
            middle_rate,
            fetched_at::TEXT AS fetched_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.currency_code)
    .bind(input.base_currency_code)
    .bind(input.rate_date)
    .bind(input.source)
    .bind(input.unit_amount)
    .bind(input.bi_buy_rate)
    .bind(input.bi_sell_rate)
    .bind(input.middle_rate)
    .bind(input.fetched_at)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(rate) = upserted_rate {
        return Ok(rate);
    }

    get_currency_rate_including_deleted(pool, rate_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_currency_rate(
    pool: &PgPool,
    id: String,
) -> Result<Option<CurrencyRateDto>, sqlx::Error> {
    let deleted_rate = sqlx::query_as::<_, CurrencyRateDto>(
        r#"
        UPDATE currency_rates
        SET
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            currency_code,
            base_currency_code,
            rate_date,
            source,
            unit_amount,
            bi_buy_rate,
            bi_sell_rate,
            middle_rate,
            fetched_at::TEXT AS fetched_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_rate.is_some() {
        return Ok(deleted_rate);
    }

    get_currency_rate_including_deleted(pool, id).await
}
