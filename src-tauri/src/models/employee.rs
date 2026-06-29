use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeDto {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub position: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub login_role_id: Option<String>,
    pub field_cash_account_id: Option<String>,
    pub field_cash_account_code: Option<String>,
    pub field_cash_account_name: Option<String>,
    pub pin_hash: Option<String>,
    pub pin_salt: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeAreaDto {
    pub id: String,
    pub employee_id: String,
    pub area_id: String,
    pub area_name: String,
    pub area_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeCollectionScheduleDto {
    pub id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub employee_position: Option<String>,
    pub area_id: String,
    pub area_name: String,
    pub area_code: Option<String>,
    pub weekday: i32,
    pub effective_from: Option<String>,
    pub effective_until: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
