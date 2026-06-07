use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct JournalEntryDto {
    pub id: String,
    pub entry_number: String,
    pub entry_date: String,
    pub status: String,
    pub source_type: String,
    pub source_id: Option<String>,
    pub source_number: Option<String>,
    pub source_event: Option<String>,
    pub description: String,
    pub total_debit: f64,
    pub total_credit: f64,
    pub posted_at: Option<String>,
    pub voided_at: Option<String>,
    pub reversed_entry_id: Option<String>,
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
pub struct JournalEntryLineDto {
    pub id: String,
    pub journal_entry_id: String,
    pub account_id: String,
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub debit: f64,
    pub credit: f64,
    pub description: Option<String>,
    pub department_id: Option<String>,
    pub project_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntryBundleDto {
    pub entry: JournalEntryDto,
    pub lines: Vec<JournalEntryLineDto>,
}
