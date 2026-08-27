use crate::models::lottery::LotteryDto;
use sqlx::PgPool;

pub async fn list_lotteries(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LotteryDto>, sqlx::Error> {
    sqlx::query_as::<_, LotteryDto>(
        r#"
        SELECT
            id,
            name,
            min_total,
            max_total,
            start_at,
            end_at,
            active,
            created_by,
            created_at,
            updated_at,
            deleted_at
        FROM lotteries
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at, id
        LIMIT $3
        "#,
    )
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn get_lottery(pool: &PgPool, id: String) -> Result<Option<LotteryDto>, sqlx::Error> {
    sqlx::query_as::<_, LotteryDto>(
        r#"
        SELECT
            id,
            name,
            min_total,
            max_total,
            start_at,
            end_at,
            active,
            created_by,
            created_at,
            updated_at,
            deleted_at
        FROM lotteries
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_lottery_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<LotteryDto>, sqlx::Error> {
    sqlx::query_as::<_, LotteryDto>(
        r#"
        SELECT
            id,
            name,
            min_total,
            max_total,
            start_at,
            end_at,
            active,
            created_by,
            created_at,
            updated_at,
            deleted_at
        FROM lotteries
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_lottery(pool: &PgPool, input: LotteryDto) -> Result<LotteryDto, sqlx::Error> {
    let lottery_id = input.id.clone();
    let upserted_lottery = sqlx::query_as::<_, LotteryDto>(
        r#"
        INSERT INTO lotteries (
            id,
            name,
            min_total,
            max_total,
            start_at,
            end_at,
            active,
            created_by,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5::TIMESTAMPTZ, $6::TIMESTAMPTZ,
            $7, $8, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ, $11::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            min_total = EXCLUDED.min_total,
            max_total = EXCLUDED.max_total,
            start_at = EXCLUDED.start_at,
            end_at = EXCLUDED.end_at,
            active = EXCLUDED.active,
            created_by = EXCLUDED.created_by,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= lotteries.updated_at
        RETURNING
            id,
            name,
            min_total,
            max_total,
            start_at,
            end_at,
            active,
            created_by,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.min_total)
    .bind(input.max_total)
    .bind(input.start_at)
    .bind(input.end_at)
    .bind(input.active)
    .bind(input.created_by)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(lottery) = upserted_lottery {
        return Ok(lottery);
    }

    get_lottery_including_deleted(pool, lottery_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_lottery(pool: &PgPool, id: String) -> Result<Option<LotteryDto>, sqlx::Error> {
    let deleted_lottery = sqlx::query_as::<_, LotteryDto>(
        r#"
        UPDATE lotteries
        SET
            active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            name,
            min_total,
            max_total,
            start_at,
            end_at,
            active,
            created_by,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_lottery.is_some() {
        return Ok(deleted_lottery);
    }

    get_lottery_including_deleted(pool, id).await
}
