use crate::models::journal_entry::{JournalEntryBundleDto, JournalEntryDto, JournalEntryLineDto};
use sqlx::{PgPool, Postgres, Transaction};

macro_rules! journal_entry_select {
    () => {
        r#"
        SELECT
            id,
            entry_number,
            entry_date::TEXT AS entry_date,
            status,
            source_type,
            source_id,
            source_number,
            source_event,
            description,
            total_debit,
            total_credit,
            posted_at::TEXT AS posted_at,
            voided_at::TEXT AS voided_at,
            reversed_entry_id,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM journal_entries
        "#
    };
}

macro_rules! journal_entry_line_select {
    () => {
        r#"
        SELECT
            id,
            journal_entry_id,
            account_id,
            account_code,
            account_name,
            account_type,
            debit,
            credit,
            description,
            department_id,
            project_id,
            created_at::TEXT AS created_at
        FROM journal_entry_lines
        "#
    };
}

pub async fn list_journal_entry_bundles(
    pool: &PgPool,
) -> Result<Vec<JournalEntryBundleDto>, sqlx::Error> {
    let entries = sqlx::query_as::<_, JournalEntryDto>(concat!(
        journal_entry_select!(),
        " ORDER BY entry_date DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await?;

    let mut bundles = Vec::with_capacity(entries.len());
    for entry in entries {
        let lines = list_journal_entry_lines(pool, &entry.id).await?;
        bundles.push(JournalEntryBundleDto { entry, lines });
    }

    Ok(bundles)
}

pub async fn get_journal_entry_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<JournalEntryBundleDto>, sqlx::Error> {
    let entry =
        sqlx::query_as::<_, JournalEntryDto>(concat!(journal_entry_select!(), " WHERE id = $1"))
            .bind(id)
            .fetch_optional(pool)
            .await?;

    if let Some(entry) = entry {
        let lines = list_journal_entry_lines(pool, &entry.id).await?;
        return Ok(Some(JournalEntryBundleDto { entry, lines }));
    }

    Ok(None)
}

pub async fn upsert_journal_entry_bundle(
    pool: &PgPool,
    input: JournalEntryBundleDto,
) -> Result<JournalEntryBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let entry_id = input.entry.id.clone();

    let upserted_entry = upsert_journal_entry(&mut tx, input.entry).await?;
    if let Some(entry) = upserted_entry {
        replace_journal_entry_lines(&mut tx, &entry.id, input.lines).await?;
        let lines = list_journal_entry_lines_in_tx(&mut tx, &entry.id).await?;
        tx.commit().await?;
        return Ok(JournalEntryBundleDto { entry, lines });
    }

    let entry = get_journal_entry_in_tx(&mut tx, &entry_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let lines = list_journal_entry_lines_in_tx(&mut tx, &entry.id).await?;
    tx.commit().await?;

    Ok(JournalEntryBundleDto { entry, lines })
}

async fn list_journal_entry_lines(
    pool: &PgPool,
    entry_id: &str,
) -> Result<Vec<JournalEntryLineDto>, sqlx::Error> {
    sqlx::query_as::<_, JournalEntryLineDto>(concat!(
        journal_entry_line_select!(),
        " WHERE journal_entry_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(entry_id)
    .fetch_all(pool)
    .await
}

async fn list_journal_entry_lines_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    entry_id: &str,
) -> Result<Vec<JournalEntryLineDto>, sqlx::Error> {
    sqlx::query_as::<_, JournalEntryLineDto>(concat!(
        journal_entry_line_select!(),
        " WHERE journal_entry_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(entry_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_journal_entry_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    entry_id: &str,
) -> Result<Option<JournalEntryDto>, sqlx::Error> {
    sqlx::query_as::<_, JournalEntryDto>(concat!(journal_entry_select!(), " WHERE id = $1"))
        .bind(entry_id)
        .fetch_optional(&mut **tx)
        .await
}

async fn upsert_journal_entry(
    tx: &mut Transaction<'_, Postgres>,
    input: JournalEntryDto,
) -> Result<Option<JournalEntryDto>, sqlx::Error> {
    sqlx::query_as::<_, JournalEntryDto>(
        r#"
        INSERT INTO journal_entries (
            id,
            entry_number,
            entry_date,
            status,
            source_type,
            source_id,
            source_number,
            source_event,
            description,
            total_debit,
            total_credit,
            posted_at,
            voided_at,
            reversed_entry_id,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1,
            $2,
            $3::TIMESTAMPTZ,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12::TIMESTAMPTZ,
            $13::TIMESTAMPTZ,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20::TIMESTAMPTZ,
            $21::TIMESTAMPTZ,
            $22::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            entry_number = EXCLUDED.entry_number,
            entry_date = EXCLUDED.entry_date,
            status = EXCLUDED.status,
            source_type = EXCLUDED.source_type,
            source_id = EXCLUDED.source_id,
            source_number = EXCLUDED.source_number,
            source_event = EXCLUDED.source_event,
            description = EXCLUDED.description,
            total_debit = EXCLUDED.total_debit,
            total_credit = EXCLUDED.total_credit,
            posted_at = EXCLUDED.posted_at,
            voided_at = EXCLUDED.voided_at,
            reversed_entry_id = EXCLUDED.reversed_entry_id,
            version = EXCLUDED.version,
            created_by = COALESCE(journal_entries.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(journal_entries.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > journal_entries.version OR
            (
                EXCLUDED.version = journal_entries.version AND
                EXCLUDED.updated_at >= journal_entries.updated_at
            )
        RETURNING
            id,
            entry_number,
            entry_date::TEXT AS entry_date,
            status,
            source_type,
            source_id,
            source_number,
            source_event,
            description,
            total_debit,
            total_credit,
            posted_at::TEXT AS posted_at,
            voided_at::TEXT AS voided_at,
            reversed_entry_id,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.entry_number)
    .bind(input.entry_date)
    .bind(input.status)
    .bind(input.source_type)
    .bind(input.source_id)
    .bind(input.source_number)
    .bind(input.source_event)
    .bind(input.description)
    .bind(input.total_debit)
    .bind(input.total_credit)
    .bind(input.posted_at)
    .bind(input.voided_at)
    .bind(input.reversed_entry_id)
    .bind(input.version)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_journal_entry_lines(
    tx: &mut Transaction<'_, Postgres>,
    entry_id: &str,
    lines: Vec<JournalEntryLineDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM journal_entry_lines WHERE journal_entry_id = $1")
        .bind(entry_id)
        .execute(&mut **tx)
        .await?;

    for line in lines {
        sqlx::query(
            r#"
            INSERT INTO journal_entry_lines (
                id,
                journal_entry_id,
                account_id,
                account_code,
                account_name,
                account_type,
                debit,
                credit,
                description,
                department_id,
                project_id,
                created_at
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
                $11,
                $12::TIMESTAMPTZ
            )
            "#,
        )
        .bind(line.id)
        .bind(line.journal_entry_id)
        .bind(line.account_id)
        .bind(line.account_code)
        .bind(line.account_name)
        .bind(line.account_type)
        .bind(line.debit)
        .bind(line.credit)
        .bind(line.description)
        .bind(line.department_id)
        .bind(line.project_id)
        .bind(line.created_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
