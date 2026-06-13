use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StockOpnameDto {
    pub id: String,
    pub opname_number: String,
    pub status: String,
    pub counted_at: String,
    pub reviewed_at: Option<String>,
    pub posted_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub warehouse_id: Option<String>,
    pub warehouse_code: Option<String>,
    pub warehouse_name: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub reviewed_by: Option<String>,
    pub reviewed_by_name: Option<String>,
    pub posted_by: Option<String>,
    pub posted_by_name: Option<String>,
    pub cancelled_by: Option<String>,
    pub cancelled_by_name: Option<String>,
    pub cancel_reason: Option<String>,
    pub total_items: i32,
    pub total_adjustment_in: f64,
    pub total_adjustment_out: f64,
    pub total_variance_value: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StockOpnameItemDto {
    pub id: String,
    pub opname_id: String,
    pub product_id: String,
    pub product_name: String,
    pub sku: Option<String>,
    pub category: Option<String>,
    pub system_quantity: f64,
    pub counted_quantity: Option<f64>,
    pub quantity_delta: f64,
    pub unit: String,
    pub cost_per_unit: f64,
    pub variance_value: f64,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockOpnameBundleDto {
    pub opname: StockOpnameDto,
    pub items: Vec<StockOpnameItemDto>,
}
