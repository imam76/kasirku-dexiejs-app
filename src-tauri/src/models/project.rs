use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectDto {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub status: String,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub department_id: Option<String>,
    pub department_code: Option<String>,
    pub department_name: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub budget_amount: Option<f64>,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
