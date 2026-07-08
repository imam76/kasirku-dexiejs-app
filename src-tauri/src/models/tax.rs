use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TaxDto {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub rate: f64,
    pub rate_type: String,
    pub calculation_mode: String,
    pub tax_flow: Option<String>,
    pub sales_tax_account_id: Option<String>,
    pub sales_tax_account_code: Option<String>,
    pub sales_tax_account_name: Option<String>,
    pub sales_tax_account_type: Option<String>,
    pub purchase_tax_account_id: Option<String>,
    pub purchase_tax_account_code: Option<String>,
    pub purchase_tax_account_name: Option<String>,
    pub purchase_tax_account_type: Option<String>,
    pub description: Option<String>,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
