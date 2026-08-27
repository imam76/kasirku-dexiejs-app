use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PromoDto {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub value: f64,
    pub applies_to: String,
    pub product_ids: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub min_qty: Option<f64>,
    pub min_total: Option<f64>,
    pub voucher_code: Option<String>,
    pub active: bool,
    pub priority: i32,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
