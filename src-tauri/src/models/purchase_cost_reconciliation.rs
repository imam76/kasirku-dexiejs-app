use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseCostReconciliationDto {
    pub id: String,
    pub purchase_document_id: String,
    pub purchase_document_number: String,
    pub supplier_invoice_number: Option<String>,
    pub supplier_invoice_date: Option<String>,
    pub additional_cost_treatment: String,
    pub additional_cost_amount: f64,
    pub supplier_discount_amount: f64,
    pub supplier_tax_amount: f64,
    pub total_estimated_cost: f64,
    pub total_final_cost: f64,
    pub total_variance_amount: f64,
    pub sold_cost_variance_amount: f64,
    pub remaining_stock_variance_amount: f64,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseCostReconciliationItemDto {
    pub id: String,
    pub reconciliation_id: String,
    pub purchase_document_item_id: String,
    pub product_id: String,
    pub product_name: String,
    pub received_quantity: f64,
    pub invoiced_quantity: f64,
    pub quantity_variance: f64,
    pub sold_quantity_at_reconciliation: f64,
    pub remaining_quantity_at_reconciliation: f64,
    pub estimated_price: f64,
    pub final_price: f64,
    pub additional_cost_allocation: f64,
    pub supplier_discount_allocation: f64,
    pub supplier_tax_allocation: f64,
    pub final_landed_cost_per_unit: f64,
    pub variance_per_unit: f64,
    pub sold_cost_variance_amount: f64,
    pub remaining_stock_variance_amount: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseCostReconciliationBundleDto {
    pub reconciliation: PurchaseCostReconciliationDto,
    pub items: Vec<PurchaseCostReconciliationItemDto>,
}
