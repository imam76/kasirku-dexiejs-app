use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DepartmentDto {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
