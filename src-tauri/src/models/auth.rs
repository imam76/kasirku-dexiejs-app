use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuthUserDto {
    pub id: String,
    pub name: String,
    pub role: String,
    pub pin_hash: String,
    pub pin_salt: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ActivityLogDto {
    pub id: String,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub role: Option<String>,
    pub action: String,
    pub entity: String,
    pub entity_id: Option<String>,
    pub description: String,
    pub created_at: String,
}
