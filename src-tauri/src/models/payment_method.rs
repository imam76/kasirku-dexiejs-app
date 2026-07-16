use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentMethodDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub category: String,
    pub posting_account_id: Option<String>,
    pub posting_account_code: Option<String>,
    pub posting_account_name: Option<String>,
    pub requires_reference: bool,
    pub is_system: bool,
    pub is_active: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
