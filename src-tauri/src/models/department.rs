use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DepartmentDto {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    #[serde(default)]
    #[sqlx(default)]
    pub head_employee_id: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub head_employee_name: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub parent_department_id: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub parent_department_code: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub parent_department_name: Option<String>,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
