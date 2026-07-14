use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FinanceAccountMappingDto {
    pub id: String,
    pub key: String,
    pub category: Option<String>,
    pub account_id: String,
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub is_system: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountingProfileSettingDto {
    pub id: String,
    pub accounting_profile: String,
    pub industry_extension: String,
    pub template_id: Option<String>,
    pub locked_after_transaction: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EnabledModuleDto {
    pub id: String,
    pub code: String,
    pub is_enabled: bool,
    pub source: String,
    pub requires_profile: Option<String>,
    pub requires_extension: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GeneralLedgerSettingDto {
    pub id: String,
    pub is_ready: bool,
    pub cutoff_date: Option<String>,
    pub inventory_policy: String,
    pub opening_balance_journal_id: Option<String>,
    pub activated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountingInitialSetupSettingDto {
    pub id: String,
    pub business_template_code: String,
    pub accounting_profile: String,
    pub industry_extension: String,
    pub template_id: String,
    pub cutoff_date: String,
    pub fiscal_period_start: String,
    pub fiscal_period_end: String,
    pub current_period_start: String,
    pub current_period_end: String,
    pub current_period_id: Option<String>,
    pub base_currency_code: String,
    pub inventory_policy: String,
    pub setup_completed_at: Option<String>,
    pub setup_completed_by: Option<String>,
    pub setup_completed_by_name: Option<String>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
}
