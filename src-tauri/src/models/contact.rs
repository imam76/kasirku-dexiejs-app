use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ContactDto {
    pub id: String,
    pub name: String,
    pub contact_type: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub company_name: Option<String>,
    pub tax_number: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
