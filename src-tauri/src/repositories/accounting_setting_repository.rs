use crate::models::accounting_setting::{
    AccountingProfileSettingDto, EnabledModuleDto, FinanceAccountMappingDto, GeneralLedgerSettingDto,
};
use sqlx::PgPool;

const ACCOUNTING_PROFILE_SETTING_ID: &str = "default";
const GENERAL_LEDGER_SETTING_ID: &str = "default";

// ---- Finance account mappings ----

pub async fn list_finance_account_mappings(
    pool: &PgPool,
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM finance_account_mappings
        ORDER BY key ASC
        "#,
    )
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
    let upserted = sqlx::query_as::<_, GeneralLedgerSettingDto>(
        r#"
        INSERT INTO general_ledger_setting (
            id, is_ready, cutoff_date, inventory_policy,
            opening_balance_journal_id, activated_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            is_ready = EXCLUDED.is_ready,
            cutoff_date = EXCLUDED.cutoff_date,
            inventory_policy = EXCLUDED.inventory_policy,
            opening_balance_journal_id = EXCLUDED.opening_balance_journal_id,
            activated_at = EXCLUDED.activated_at,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= general_ledger_setting.updated_at
        RETURNING
            id, is_ready, cutoff_date, inventory_policy,
            opening_balance_journal_id, activated_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
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
    .fetch_optional(pool)
    .await?;

    if let Some(setting) = upserted {
        return Ok(setting);
    }

    get_general_ledger_setting(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
