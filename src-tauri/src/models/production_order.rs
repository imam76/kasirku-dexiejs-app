use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductionOrderDto {
    pub id: String,
    pub production_number: String,
    pub status: String,
    pub finished_product_id: String,
    pub finished_product_name: String,
    pub quantity_produced: f64,
    pub unit: String,
    pub material_cost: f64,
    pub additional_cost: f64,
    pub total_cost: f64,
    pub unit_cost: f64,
    pub produced_at: String,
    pub posted_at: Option<String>,
    pub voided_at: Option<String>,
    pub void_reason: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductionOrderItemDto {
    pub id: String,
    pub production_order_id: String,
    pub material_product_id: String,
    pub material_product_name: String,
    pub sku: Option<String>,
    pub quantity_used: f64,
    pub unit: String,
    pub stock_quantity_used: f64,
    pub stock_unit: String,
    pub cost_per_unit: f64,
    pub total_cost: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductionOrderCostDto {
    pub id: String,
    pub production_order_id: String,
    pub name: String,
    pub amount: f64,
    pub account_id: Option<String>,
    pub account_code: Option<String>,
    pub account_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionOrderBundleDto {
    pub order: ProductionOrderDto,
    pub items: Vec<ProductionOrderItemDto>,
    pub costs: Vec<ProductionOrderCostDto>,
}
