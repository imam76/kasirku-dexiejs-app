use crate::models::accounting_setting::{
    AccountingInitialSetupSettingDto, AccountingProfileSettingDto, EnabledModuleDto,
    FinanceAccountMappingDto, GeneralLedgerSettingDto,
};
use sqlx::{PgPool, Postgres, Transaction};

const ACCOUNTING_INITIAL_SETUP_SETTING_ID: &str = "default";
const ACCOUNTING_PROFILE_SETTING_ID: &str = "default";
const GENERAL_LEDGER_SETTING_ID: &str = "default";

fn protocol_error(message: impl Into<String>) -> sqlx::Error {
    sqlx::Error::Protocol(message.into())
}

fn cutoff_date_key(value: Option<&str>) -> Option<&str> {
    value.and_then(|date| date.get(0..10))
}

// ---- Finance account mappings ----

pub async fn list_finance_account_mappings(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<FinanceAccountMappingDto>, sqlx::Error> {
    sqlx::query_as::<_, FinanceAccountMappingDto>(
        r#"
        SELECT
            id,
            key,
            category,
            account_id,
            account_code,
            account_name,
            account_type,
            is_system,
            created_at,
            updated_at
        FROM finance_account_mappings
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

pub async fn upsert_finance_account_mapping(
    pool: &PgPool,
    input: FinanceAccountMappingDto,
) -> Result<FinanceAccountMappingDto, sqlx::Error> {
    let mapping_id = input.id.clone();
    let upserted = sqlx::query_as::<_, FinanceAccountMappingDto>(
        r#"
        INSERT INTO finance_account_mappings (
            id, key, category, account_id, account_code, account_name,
            account_type, is_system, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            key = EXCLUDED.key,
            category = EXCLUDED.category,
            account_id = EXCLUDED.account_id,
            account_code = EXCLUDED.account_code,
            account_name = EXCLUDED.account_name,
            account_type = EXCLUDED.account_type,
            is_system = EXCLUDED.is_system,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= finance_account_mappings.updated_at
        RETURNING
            id, key, category, account_id, account_code, account_name,
            account_type, is_system,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.key)
    .bind(input.category)
    .bind(input.account_id)
    .bind(input.account_code)
    .bind(input.account_name)
    .bind(input.account_type)
    .bind(input.is_system)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(mapping) = upserted {
        return Ok(mapping);
    }

    sqlx::query_as::<_, FinanceAccountMappingDto>(
        r#"
        SELECT
            id, key, category, account_id, account_code, account_name,
            account_type, is_system,
            created_at,
            updated_at
        FROM finance_account_mappings
        WHERE id = $1
        "#,
    )
    .bind(mapping_id)
    .fetch_optional(pool)
    .await?
    .ok_or(sqlx::Error::RowNotFound)
}

// ---- Accounting profile setting (singleton) ----

pub async fn get_accounting_profile_setting(
    pool: &PgPool,
) -> Result<Option<AccountingProfileSettingDto>, sqlx::Error> {
    sqlx::query_as::<_, AccountingProfileSettingDto>(
        r#"
        SELECT
            id,
            accounting_profile,
            industry_extension,
            template_id,
            locked_after_transaction,
            created_at,
            updated_at
        FROM accounting_profile_setting
        WHERE id = $1
        "#,
    )
    .bind(ACCOUNTING_PROFILE_SETTING_ID)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_accounting_profile_setting(
    pool: &PgPool,
    input: AccountingProfileSettingDto,
) -> Result<AccountingProfileSettingDto, sqlx::Error> {
    let upserted = sqlx::query_as::<_, AccountingProfileSettingDto>(
        r#"
        INSERT INTO accounting_profile_setting (
            id, accounting_profile, industry_extension, template_id,
            locked_after_transaction, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::TIMESTAMPTZ, $7::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            accounting_profile = EXCLUDED.accounting_profile,
            industry_extension = EXCLUDED.industry_extension,
            template_id = EXCLUDED.template_id,
            locked_after_transaction = EXCLUDED.locked_after_transaction,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= accounting_profile_setting.updated_at
        RETURNING
            id, accounting_profile, industry_extension, template_id,
            locked_after_transaction,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.accounting_profile)
    .bind(input.industry_extension)
    .bind(input.template_id)
    .bind(input.locked_after_transaction)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(setting) = upserted {
        return Ok(setting);
    }

    get_accounting_profile_setting(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

// ---- Enabled modules ----

pub async fn list_enabled_modules(pool: &PgPool) -> Result<Vec<EnabledModuleDto>, sqlx::Error> {
    sqlx::query_as::<_, EnabledModuleDto>(
        r#"
        SELECT
            id,
            code,
            is_enabled,
            source,
            requires_profile,
            requires_extension,
            created_at,
            updated_at
        FROM enabled_modules
        ORDER BY code ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_enabled_module(
    pool: &PgPool,
    input: EnabledModuleDto,
) -> Result<EnabledModuleDto, sqlx::Error> {
    let module_id = input.id.clone();
    let upserted = sqlx::query_as::<_, EnabledModuleDto>(
        r#"
        INSERT INTO enabled_modules (
            id, code, is_enabled, source, requires_profile, requires_extension,
            created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            is_enabled = EXCLUDED.is_enabled,
            source = EXCLUDED.source,
            requires_profile = EXCLUDED.requires_profile,
            requires_extension = EXCLUDED.requires_extension,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= enabled_modules.updated_at
        RETURNING
            id, code, is_enabled, source, requires_profile, requires_extension,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.is_enabled)
    .bind(input.source)
    .bind(input.requires_profile)
    .bind(input.requires_extension)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(module) = upserted {
        return Ok(module);
    }

    sqlx::query_as::<_, EnabledModuleDto>(
        r#"
        SELECT
            id, code, is_enabled, source, requires_profile, requires_extension,
            created_at,
            updated_at
        FROM enabled_modules
        WHERE id = $1
        "#,
    )
    .bind(module_id)
    .fetch_optional(pool)
    .await?
    .ok_or(sqlx::Error::RowNotFound)
}

// ---- General ledger setting (singleton) ----

pub async fn get_general_ledger_setting(
    pool: &PgPool,
) -> Result<Option<GeneralLedgerSettingDto>, sqlx::Error> {
    sqlx::query_as::<_, GeneralLedgerSettingDto>(
        r#"
        SELECT
            id,
            is_ready,
            cutoff_date,
            inventory_policy,
            opening_balance_journal_id,
            activated_at,
            created_at,
            updated_at
        FROM general_ledger_setting
        WHERE id = $1
        "#,
    )
    .bind(GENERAL_LEDGER_SETTING_ID)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_general_ledger_setting(
    pool: &PgPool,
    input: GeneralLedgerSettingDto,
) -> Result<GeneralLedgerSettingDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let result = upsert_general_ledger_setting_in_tx(&mut tx, input).await?;
    tx.commit().await?;
    Ok(result)
}

async fn assert_terminal_perpetual_opening_modules_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    cutoff_date: &str,
) -> Result<(), sqlx::Error> {
    let module_rows = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT module, status
        FROM opening_balance_batches
        WHERE module IN ('ACCOUNT', 'INVENTORY')
          AND cutoff_date::DATE = $1::TIMESTAMPTZ::DATE
          AND deleted_at IS NULL
        ORDER BY
            module ASC,
            revision_number DESC NULLS LAST,
            version DESC,
            updated_at DESC,
            id ASC
        FOR UPDATE
        "#,
    )
    .bind(cutoff_date)
    .fetch_all(&mut **tx)
    .await?;

    let mut account_status: Option<&str> = None;
    let mut inventory_status: Option<&str> = None;
    for (module, status) in &module_rows {
        match module.as_str() {
            "ACCOUNT" if account_status.is_none() => account_status = Some(status),
            "INVENTORY" if inventory_status.is_none() => inventory_status = Some(status),
            _ => {}
        }
    }

    let is_terminal =
        |status: Option<&str>| matches!(status, Some("POSTED" | "LOCKED" | "SKIPPED"));
    if !is_terminal(account_status) || !is_terminal(inventory_status) {
        return Err(protocol_error(
            "General Ledger perpetual belum dapat diaktifkan: batch ACCOUNT dan INVENTORY pada cutoff yang sama harus terminal di server.",
        ));
    }

    Ok(())
}

pub(crate) async fn upsert_general_ledger_setting_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: GeneralLedgerSettingDto,
) -> Result<GeneralLedgerSettingDto, sqlx::Error> {
    if input.id != GENERAL_LEDGER_SETTING_ID {
        return Err(protocol_error("ID setting General Ledger tidak valid."));
    }

    if input.is_ready && input.inventory_policy == "PERPETUAL_INVENTORY" {
        let cutoff_date = input
            .cutoff_date
            .as_deref()
            .filter(|date| !date.trim().is_empty())
            .ok_or_else(|| {
                protocol_error("Aktivasi General Ledger perpetual wajib memiliki tanggal cutoff.")
            })?;
        assert_terminal_perpetual_opening_modules_in_tx(tx, cutoff_date).await?;
    }

    // Lock the singleton after the opening-balance prerequisite rows. The
    // composite posting takes locks in the same order, avoiding lock inversion.
    let existing_setting = sqlx::query_as::<_, GeneralLedgerSettingDto>(
        r#"
        SELECT
            id,
            is_ready,
            cutoff_date,
            inventory_policy,
            opening_balance_journal_id,
            activated_at,
            created_at,
            updated_at
        FROM general_ledger_setting
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(GENERAL_LEDGER_SETTING_ID)
    .fetch_optional(&mut **tx)
    .await?;

    if input.is_ready
        && existing_setting.as_ref().is_some_and(|existing| {
            existing.is_ready
                && (existing.inventory_policy != input.inventory_policy
                    || cutoff_date_key(existing.cutoff_date.as_deref())
                        != cutoff_date_key(input.cutoff_date.as_deref()))
        })
    {
        return Err(protocol_error(
            "General Ledger sudah aktif dengan cutoff atau kebijakan persediaan yang berbeda.",
        ));
    }

    let upserted = sqlx::query_as::<_, GeneralLedgerSettingDto>(
        r#"
        INSERT INTO general_ledger_setting (
            id, is_ready, cutoff_date, inventory_policy,
            opening_balance_journal_id, activated_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            -- Readiness is a one-way activation. A stale device must never
            -- deactivate an already-live ledger, while an activation command
            -- must not be rejected only because its local clock is behind.
            is_ready = general_ledger_setting.is_ready OR EXCLUDED.is_ready,
            cutoff_date = CASE
                WHEN general_ledger_setting.is_ready
                    THEN general_ledger_setting.cutoff_date
                ELSE EXCLUDED.cutoff_date
            END,
            inventory_policy = CASE
                WHEN general_ledger_setting.is_ready
                    THEN general_ledger_setting.inventory_policy
                ELSE EXCLUDED.inventory_policy
            END,
            opening_balance_journal_id = CASE
                WHEN general_ledger_setting.is_ready
                    THEN COALESCE(
                        general_ledger_setting.opening_balance_journal_id,
                        EXCLUDED.opening_balance_journal_id
                    )
                ELSE EXCLUDED.opening_balance_journal_id
            END,
            activated_at = CASE
                WHEN general_ledger_setting.is_ready
                    THEN COALESCE(
                        general_ledger_setting.activated_at,
                        EXCLUDED.activated_at
                    )
                WHEN EXCLUDED.is_ready
                    THEN COALESCE(
                        EXCLUDED.activated_at,
                        general_ledger_setting.activated_at
                    )
                ELSE EXCLUDED.activated_at
            END,
            updated_at = GREATEST(
                general_ledger_setting.updated_at,
                EXCLUDED.updated_at
            )
        WHERE
            EXCLUDED.is_ready
            OR EXCLUDED.updated_at >= general_ledger_setting.updated_at
        RETURNING
            id, is_ready, cutoff_date, inventory_policy,
            opening_balance_journal_id, activated_at,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.is_ready)
    .bind(input.cutoff_date)
    .bind(input.inventory_policy)
    .bind(input.opening_balance_journal_id)
    .bind(input.activated_at)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(setting) = upserted {
        return Ok(setting);
    }

    sqlx::query_as::<_, GeneralLedgerSettingDto>(
        r#"
        SELECT
            id,
            is_ready,
            cutoff_date,
            inventory_policy,
            opening_balance_journal_id,
            activated_at,
            created_at,
            updated_at
        FROM general_ledger_setting
        WHERE id = $1
        "#,
    )
    .bind(GENERAL_LEDGER_SETTING_ID)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(sqlx::Error::RowNotFound)
}

// ---- Accounting initial setup setting (singleton) ----

pub async fn get_accounting_initial_setup_setting(
    pool: &PgPool,
) -> Result<Option<AccountingInitialSetupSettingDto>, sqlx::Error> {
    sqlx::query_as::<_, AccountingInitialSetupSettingDto>(
        r#"
        SELECT
            id,
            business_template_code,
            accounting_profile,
            industry_extension,
            template_id,
            cutoff_date::TEXT AS cutoff_date,
            fiscal_period_start::TEXT AS fiscal_period_start,
            fiscal_period_end::TEXT AS fiscal_period_end,
            current_period_start::TEXT AS current_period_start,
            current_period_end::TEXT AS current_period_end,
            current_period_id,
            base_currency_code,
            inventory_policy,
            setup_completed_at,
            setup_completed_by,
            setup_completed_by_name,
            version,
            created_at,
            updated_at
        FROM accounting_initial_setup_setting
        WHERE id = $1
        "#,
    )
    .bind(ACCOUNTING_INITIAL_SETUP_SETTING_ID)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_accounting_initial_setup_setting(
    pool: &PgPool,
    input: AccountingInitialSetupSettingDto,
) -> Result<AccountingInitialSetupSettingDto, sqlx::Error> {
    let upserted = sqlx::query_as::<_, AccountingInitialSetupSettingDto>(
        r#"
        INSERT INTO accounting_initial_setup_setting (
            id,
            business_template_code,
            accounting_profile,
            industry_extension,
            template_id,
            cutoff_date,
            fiscal_period_start,
            fiscal_period_end,
            current_period_start,
            current_period_end,
            current_period_id,
            base_currency_code,
            inventory_policy,
            setup_completed_at,
            setup_completed_by,
            setup_completed_by_name,
            version,
            created_at,
            updated_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::DATE,
            $7::DATE,
            $8::DATE,
            $9::DATE,
            $10::DATE,
            $11,
            $12,
            $13,
            $14::TIMESTAMPTZ,
            $15,
            $16,
            $17,
            $18::TIMESTAMPTZ,
            $19::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            business_template_code = EXCLUDED.business_template_code,
            accounting_profile = EXCLUDED.accounting_profile,
            industry_extension = EXCLUDED.industry_extension,
            template_id = EXCLUDED.template_id,
            cutoff_date = EXCLUDED.cutoff_date,
            fiscal_period_start = EXCLUDED.fiscal_period_start,
            fiscal_period_end = EXCLUDED.fiscal_period_end,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            current_period_id = EXCLUDED.current_period_id,
            base_currency_code = EXCLUDED.base_currency_code,
            inventory_policy = EXCLUDED.inventory_policy,
            setup_completed_at = EXCLUDED.setup_completed_at,
            setup_completed_by = EXCLUDED.setup_completed_by,
            setup_completed_by_name = EXCLUDED.setup_completed_by_name,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= accounting_initial_setup_setting.updated_at
        RETURNING
            id,
            business_template_code,
            accounting_profile,
            industry_extension,
            template_id,
            cutoff_date::TEXT AS cutoff_date,
            fiscal_period_start::TEXT AS fiscal_period_start,
            fiscal_period_end::TEXT AS fiscal_period_end,
            current_period_start::TEXT AS current_period_start,
            current_period_end::TEXT AS current_period_end,
            current_period_id,
            base_currency_code,
            inventory_policy,
            setup_completed_at,
            setup_completed_by,
            setup_completed_by_name,
            version,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.business_template_code)
    .bind(input.accounting_profile)
    .bind(input.industry_extension)
    .bind(input.template_id)
    .bind(input.cutoff_date)
    .bind(input.fiscal_period_start)
    .bind(input.fiscal_period_end)
    .bind(input.current_period_start)
    .bind(input.current_period_end)
    .bind(input.current_period_id)
    .bind(input.base_currency_code)
    .bind(input.inventory_policy)
    .bind(input.setup_completed_at)
    .bind(input.setup_completed_by)
    .bind(input.setup_completed_by_name)
    .bind(input.version)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(setting) = upserted {
        return Ok(setting);
    }

    get_accounting_initial_setup_setting(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
