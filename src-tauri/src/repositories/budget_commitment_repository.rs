use crate::models::budget_commitment::BudgetCommitmentDto;
use sqlx::PgPool;

pub async fn list_budget_commitments(
    pool: &PgPool,
) -> Result<Vec<BudgetCommitmentDto>, sqlx::Error> {
    sqlx::query_as::<_, BudgetCommitmentDto>(
        r#"
        SELECT
            id,
            budget_id,
            description,
            amount,
            status,
            notes,
            resolved_at,
            created_at,
            updated_at
        FROM budget_commitments
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_budget_commitment(
    pool: &PgPool,
    id: String,
) -> Result<Option<BudgetCommitmentDto>, sqlx::Error> {
    sqlx::query_as::<_, BudgetCommitmentDto>(
        r#"
        SELECT
            id,
            budget_id,
            description,
            amount,
            status,
            notes,
            resolved_at,
            created_at,
            updated_at
        FROM budget_commitments
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_budget_commitment(
    pool: &PgPool,
    input: BudgetCommitmentDto,
) -> Result<BudgetCommitmentDto, sqlx::Error> {
    let commitment_id = input.id.clone();
    let upserted_commitment = sqlx::query_as::<_, BudgetCommitmentDto>(
        r#"
        INSERT INTO budget_commitments (
            id,
            budget_id,
            description,
            amount,
            status,
            notes,
            resolved_at,
            created_at,
            updated_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::TIMESTAMPTZ,
            $8::TIMESTAMPTZ,
            $9::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            budget_id = EXCLUDED.budget_id,
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            resolved_at = EXCLUDED.resolved_at,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= budget_commitments.updated_at
        RETURNING
            id,
            budget_id,
            description,
            amount,
            status,
            notes,
            resolved_at,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.budget_id)
    .bind(input.description)
    .bind(input.amount)
    .bind(input.status)
    .bind(input.notes)
    .bind(input.resolved_at)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(commitment) = upserted_commitment {
        return Ok(commitment);
    }

    get_budget_commitment(pool, commitment_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_budget_commitment(
    pool: &PgPool,
    id: String,
) -> Result<Option<BudgetCommitmentDto>, sqlx::Error> {
    sqlx::query_as::<_, BudgetCommitmentDto>(
        r#"
        DELETE FROM budget_commitments
        WHERE id = $1
        RETURNING
            id,
            budget_id,
            description,
            amount,
            status,
            notes,
            resolved_at,
            created_at,
            updated_at
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}
