use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StockMutationDto {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub sku: Option<String>,
    pub warehouse_id: Option<String>,
    pub warehouse_code: Option<String>,
    pub warehouse_name: Option<String>,
    pub source_type: String,
    pub source_id: String,
    pub source_number: Option<String>,
    pub source_line_id: String,
    pub quantity_delta: f64,
    pub unit: String,
    pub stock_unit: String,
    pub source_quantity: Option<f64>,
    pub source_unit: Option<String>,
    pub reason: Option<String>,
    pub actor_user_id: Option<String>,
    pub actor_user_name: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
}
