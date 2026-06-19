use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuthUserDto {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub role: String,
    pub role_id: Option<String>,
    pub role_name: Option<String>,
    pub employee_id: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RoleDto {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub is_system: bool,
    pub is_owner: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RolePermissionDto {
    pub id: String,
    pub role_id: String,
    pub permission_code: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticateServerSessionInput {
    pub email: String,
    pub pin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerAuthSessionDto {
    pub token: String,
    pub user: AuthUserDto,
    pub expires_at: String,
}
