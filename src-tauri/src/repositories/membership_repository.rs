use crate::models::membership::{MembershipDto, MembershipPointTransactionDto};
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

/// With `preserve_points_balance` the snapshot never writes the balance: point events in
/// membership_point_transactions own it (see upsert_membership_point_transaction). Profile
/// fields stay last-write-wins on `profile_updated_at`, because `updated_at` is also bumped by
/// point events from other devices and would otherwise reject a legitimately newer edit.
/// Legacy snapshots (flag absent) keep their old absolute-balance meaning, but may only win
/// against a row no point event has touched since, so they cannot erase a newer delta.
pub async fn upsert_membership(
    pool: &PgPool,
    input: MembershipDto,
    preserve_points_balance: bool,
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
            profile_updated_at,
            deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ,
            -- A ledger-owned member starts empty; its queued point events add the balance once.
            CASE WHEN $14::BOOLEAN THEN 0::DOUBLE PRECISION ELSE $9 END,
            $10, $11::TIMESTAMPTZ, $12::TIMESTAMPTZ, $12::TIMESTAMPTZ, $13::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            contact_id = EXCLUDED.contact_id,
            member_number = EXCLUDED.member_number,
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            status = EXCLUDED.status,
            joined_at = EXCLUDED.joined_at,
            points_balance = CASE
                WHEN $14::BOOLEAN THEN memberships.points_balance
                ELSE EXCLUDED.points_balance
            END,
            is_active = EXCLUDED.is_active,
            profile_updated_at = EXCLUDED.profile_updated_at,
            -- Never move the pull cursor backwards past a point event's bump.
            updated_at = GREATEST(memberships.updated_at, EXCLUDED.updated_at, clock_timestamp())
                + INTERVAL '1 microsecond',
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.profile_updated_at >= memberships.profile_updated_at
            AND ($14::BOOLEAN OR EXCLUDED.updated_at >= memberships.updated_at)
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
    .bind(preserve_points_balance)
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
            status = 'INACTIVE',
            profile_updated_at = GREATEST(profile_updated_at, clock_timestamp()),
            updated_at = GREATEST(updated_at, clock_timestamp()) + INTERVAL '1 microsecond',
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

macro_rules! membership_point_transaction_columns {
    () => {
        r#"
            id,
            membership_id,
            membership_number,
            member_name,
            transaction_id,
            transaction_number,
            type,
            points_delta,
            amount_value,
            balance_after,
            reason,
            created_by,
            created_by_name,
            created_at,
            server_created_at
        "#
    };
}

/// Delta fetch for the append-only point ledger, cursored on server arrival order for the
/// same reason as stock_mutation_repository::list_stock_mutations.
pub async fn list_membership_point_transactions(
    pool: &PgPool,
    server_created_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<MembershipPointTransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, MembershipPointTransactionDto>(concat!(
        "SELECT ",
        membership_point_transaction_columns!(),
        r#"
        FROM membership_point_transactions
        WHERE ($1::TIMESTAMPTZ IS NULL
            OR (server_created_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY server_created_at, id
        LIMIT $3
        "#
    ))
    .bind(server_created_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

/// Insert the immutable point event once, then apply it as an additive change on the
/// member, so concurrent events from different terminals sum instead of one clobbering the
/// other. A retried event is a no-op. Not clamped at zero: two offline terminals can both
/// redeem the same points before either sees the other, and the ledger must record that debt
/// rather than hide it.
pub async fn upsert_membership_point_transaction(
    pool: &PgPool,
    input: MembershipPointTransactionDto,
) -> Result<MembershipPointTransactionDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let event_id = input.id.clone();
    let membership_id = input.membership_id.clone();
    let points_delta = input.points_delta;
    let occurred_at = input.created_at;

    let inserted_event = sqlx::query_as::<_, MembershipPointTransactionDto>(concat!(
        r#"
        INSERT INTO membership_point_transactions (
            id, membership_id, membership_number, member_name, transaction_id,
            transaction_number, type, points_delta, amount_value, balance_after, reason,
            created_by, created_by_name, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::TIMESTAMPTZ)
        ON CONFLICT (id) DO NOTHING
        RETURNING
        "#,
        membership_point_transaction_columns!()
    ))
    .bind(input.id)
    .bind(input.membership_id)
    .bind(input.membership_number)
    .bind(input.member_name)
    .bind(input.transaction_id)
    .bind(input.transaction_number)
    .bind(input.r#type)
    .bind(input.points_delta)
    .bind(input.amount_value)
    .bind(input.balance_after)
    .bind(input.reason)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.created_at)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(inserted_event) = inserted_event {
        let updated_members = sqlx::query(
            r#"
            UPDATE memberships
            SET
                points_balance = points_balance + $1,
                -- Same rule as a stock event on products: always a strictly newer version,
                -- even when the originating device clock runs ahead of PostgreSQL.
                updated_at = GREATEST(updated_at, $2::TIMESTAMPTZ, clock_timestamp())
                    + INTERVAL '1 microsecond'
            WHERE id = $3
            "#,
        )
        .bind(points_delta)
        .bind(occurred_at)
        .bind(membership_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();

        // Dropping `tx` rolls the event back, so a retry after the member arrives applies it.
        if updated_members == 0 {
            return Err(sqlx::Error::RowNotFound);
        }

        tx.commit().await?;
        return Ok(inserted_event);
    }

    let existing_event = sqlx::query_as::<_, MembershipPointTransactionDto>(concat!(
        "SELECT ",
        membership_point_transaction_columns!(),
        " FROM membership_point_transactions WHERE id = $1"
    ))
    .bind(event_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(sqlx::Error::RowNotFound)?;

    tx.commit().await?;
    Ok(existing_event)
}
