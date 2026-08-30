use crate::models::budget::BudgetDto;
use sqlx::PgPool;

pub async fn list_budgets(pool: &PgPool) -> Result<Vec<BudgetDto>, sqlx::Error> {
    sqlx::query_as::<_, BudgetDto>(
        r#"
        SELECT
            id,
            name,
            budget_type,
            category,
            period_type,
            period_key,
            planned_amount,
            warning_threshold_percent,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        FROM budgets
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_budget(pool: &PgPool, id: String) -> Result<Option<BudgetDto>, sqlx::Error> {
    sqlx::query_as::<_, BudgetDto>(
        r#"
        SELECT
            id,
            name,
            budget_type,
            category,
            period_type,
            period_key,
            planned_amount,
            warning_threshold_percent,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        FROM budgets
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_budget_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<BudgetDto>, sqlx::Error> {
    sqlx::query_as::<_, BudgetDto>(
        r#"
        SELECT
            id,
            name,
            budget_type,
            category,
            period_type,
            period_key,
            planned_amount,
            warning_threshold_percent,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        FROM budgets
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_budget(pool: &PgPool, input: BudgetDto) -> Result<BudgetDto, sqlx::Error> {
    let budget_id = input.id.clone();
    let upserted_budget = sqlx::query_as::<_, BudgetDto>(
        r#"
        INSERT INTO budgets (
            id,
            name,
            budget_type,
            category,
            period_type,
            period_key,
            planned_amount,
            warning_threshold_percent,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11::TIMESTAMPTZ,
            $12::TIMESTAMPTZ,
            $13::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            budget_type = EXCLUDED.budget_type,
            category = EXCLUDED.category,
            period_type = EXCLUDED.period_type,
            period_key = EXCLUDED.period_key,
            planned_amount = EXCLUDED.planned_amount,
            warning_threshold_percent = EXCLUDED.warning_threshold_percent,
            notes = EXCLUDED.notes,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= budgets.updated_at
        RETURNING
            id,
            name,
            budget_type,
            category,
            period_type,
            period_key,
            planned_amount,
            warning_threshold_percent,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.budget_type)
    .bind(input.category)
    .bind(input.period_type)
    .bind(input.period_key)
    .bind(input.planned_amount)
    .bind(input.warning_threshold_percent)
    .bind(input.notes)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(budget) = upserted_budget {
        return Ok(budget);
    }

    get_budget_including_deleted(pool, budget_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_budget(pool: &PgPool, id: String) -> Result<Option<BudgetDto>, sqlx::Error> {
    let deleted_budget = sqlx::query_as::<_, BudgetDto>(
        r#"
        UPDATE budgets
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            name,
            budget_type,
            category,
            period_type,
            period_key,
            planned_amount,
            warning_threshold_percent,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_budget.is_some() {
        return Ok(deleted_budget);
    }

    get_budget_including_deleted(pool, id).await
}
