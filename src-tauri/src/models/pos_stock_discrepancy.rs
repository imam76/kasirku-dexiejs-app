use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PosStockDiscrepancyDto {
    pub id: String,
    pub transaction_id: String,
    pub transaction_number: String,
    pub transaction_item_id: String,
    pub cashier_session_id: Option<String>,
    pub restaurant_session_id: Option<String>,
    pub product_id: String,
    pub product_name: String,
    pub sku: Option<String>,
    pub system_quantity_snapshot: f64,
    pub requested_quantity: f64,
    pub shortage_quantity: f64,
    pub stock_unit: String,
    pub observation: String,
    pub cashier_note: Option<String>,
    pub cashier_user_id: Option<String>,
    pub cashier_user_name: Option<String>,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewed_by_name: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub investigation_cause: Option<String>,
    pub investigation_note: Option<String>,
    pub stock_opname_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
