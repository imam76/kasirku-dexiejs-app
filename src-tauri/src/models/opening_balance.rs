use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OpeningBalanceBatchDto {
    pub id: String,
    pub module: String,
    pub cutoff_date: String,
    pub status: String,
    pub total_debit: f64,
    pub total_credit: f64,
    pub journal_entry_id: Option<String>,
    pub posted_at: Option<String>,
    pub skipped_at: Option<String>,
    pub notes: Option<String>,
    pub version: i32,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OpeningBalanceLineDto {
    pub id: String,
    pub batch_id: String,
    pub module: String,
    pub line_number: i32,
    pub contact_id: Option<String>,
    pub party_name: Option<String>,
    pub document_number: Option<String>,
    pub document_date: Option<String>,
    pub due_date: Option<String>,
    pub currency_code: Option<String>,
    pub currency_name: Option<String>,
    pub currency_symbol: Option<String>,
    pub base_currency_code: Option<String>,
    pub fx_rate: Option<f64>,
    pub amount: Option<f64>,
    pub base_amount: f64,
    pub paid_amount: Option<f64>,
    pub remaining_amount: Option<f64>,
    pub settlement_status: Option<String>,
    pub last_paid_at: Option<String>,
    pub account_id: Option<String>,
    pub account_code: Option<String>,
    pub account_name: Option<String>,
    pub counter_account_id: Option<String>,
    pub counter_account_code: Option<String>,
    pub counter_account_name: Option<String>,
    pub debit: f64,
    pub credit: f64,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpeningBalanceBundleDto {
    pub batch: OpeningBalanceBatchDto,
    pub lines: Vec<OpeningBalanceLineDto>,
}
