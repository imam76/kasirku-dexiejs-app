use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BudgetDto {
    pub id: String,
    pub name: String,
    pub budget_type: String,
    pub category: String,
    pub period_type: String,
    pub period_key: String,
    pub planned_amount: f64,
    pub warning_threshold_percent: f64,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
