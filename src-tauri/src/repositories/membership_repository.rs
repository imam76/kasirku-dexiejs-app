use crate::models::membership::MembershipDto;
use sqlx::PgPool;

pub async fn list_memberships(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<MembershipDto>, sqlx::Error> {
    sqlx::query_as::<_, MembershipDto>(
        r#"
        SELECT
            id,
            contact_id,
            member_number,
            name,
            phone,
            email,
            status,
            joined_at,
            points_balance,
            is_active,
            created_at,
            updated_at,
            deleted_at
        FROM memberships
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

pub async fn get_membership(
    pool: &PgPool,
    id: String,
) -> Result<Option<MembershipDto>, sqlx::Error> {
    sqlx::query_as::<_, MembershipDto>(
        r#"
        SELECT
            id,
            contact_id,
            member_number,
            name,
            phone,
            email,
            status,
            joined_at,
            points_balance,
            is_active,
            created_at,
            updated_at,
            deleted_at
        FROM memberships
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_membership_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<MembershipDto>, sqlx::Error> {
    sqlx::query_as::<_, MembershipDto>(
        r#"
        SELECT
            id,
            contact_id,
            member_number,
            name,
            phone,
            email,
            status,
            joined_at,
            points_balance,
            is_active,
            created_at,
            updated_at,
            deleted_at
        FROM memberships
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_membership(
    pool: &PgPool,
    input: MembershipDto,
) -> Result<MembershipDto, sqlx::Error> {
    let membership_id = input.id.clone();
    let upserted_membership = sqlx::query_as::<_, MembershipDto>(
        r#"
        INSERT INTO memberships (
            id,
            contact_id,
            member_number,
            name,
            phone,
            email,
            status,
            joined_at,
            points_balance,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9, $10, $11::TIMESTAMPTZ, $12::TIMESTAMPTZ, $13::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            contact_id = EXCLUDED.contact_id,
            member_number = EXCLUDED.member_number,
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            status = EXCLUDED.status,
            joined_at = EXCLUDED.joined_at,
            points_balance = EXCLUDED.points_balance,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= memberships.updated_at
        RETURNING
            id,
            contact_id,
            member_number,
            name,
            phone,
            email,
            status,
            joined_at,
            points_balance,
            is_active,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.contact_id)
    .bind(input.member_number)
    .bind(input.name)
    .bind(input.phone)
    .bind(input.email)
    .bind(input.status)
    .bind(input.joined_at)
    .bind(input.points_balance)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(membership) = upserted_membership {
        return Ok(membership);
    }

    get_membership_including_deleted(pool, membership_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_membership(
    pool: &PgPool,
    id: String,
) -> Result<Option<MembershipDto>, sqlx::Error> {
    let deleted_membership = sqlx::query_as::<_, MembershipDto>(
        r#"
        UPDATE memberships
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            contact_id,
            member_number,
            name,
            phone,
            email,
            status,
            joined_at,
            points_balance,
            is_active,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_membership.is_some() {
        return Ok(deleted_membership);
    }

    get_membership_including_deleted(pool, id).await
}
