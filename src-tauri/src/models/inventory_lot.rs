use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct InventoryLotDto {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub sku: Option<String>,
    pub source_type: String,
    pub source_id: Option<String>,
    pub source_line_id: Option<String>,
    pub quantity_received: f64,
    pub quantity_remaining: f64,
    pub cost_per_unit: f64,
    pub cost_status: Option<String>,
    pub estimate_source: Option<String>,
    pub estimated_cost_per_unit: Option<f64>,
    pub final_cost_per_unit: Option<f64>,
    pub cost_finalized_at: Option<String>,
    pub cost_reconciliation_id: Option<String>,
    pub received_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct InventoryLotConsumptionDto {
    pub id: String,
    pub lot_id: String,
    pub product_id: String,
    pub product_name: String,
    pub source_type: String,
    pub source_id: String,
    pub source_line_id: String,
    pub quantity: f64,
    pub cost_per_unit_at_consumption: f64,
    pub cost_status_at_consumption: String,
    pub created_at: String,
}
