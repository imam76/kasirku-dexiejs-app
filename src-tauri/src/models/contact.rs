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
    #[serde(default)]
    pub is_member: bool,
    pub membership_number: Option<String>,
    pub membership_status: Option<String>,
    pub membership_joined_at: Option<String>,
    #[serde(default)]
    pub membership_points_balance: f64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
