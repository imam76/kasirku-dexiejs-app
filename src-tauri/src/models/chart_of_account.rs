use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChartOfAccountDto {
    pub id: String,
    pub code: String,
    pub name: String,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub r#type: String,
    pub normal_balance: String,
    pub parent_id: Option<String>,
    pub parent_code: Option<String>,
    pub parent_name: Option<String>,
    pub is_postable: bool,
    pub is_system: bool,
    pub is_active: bool,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
