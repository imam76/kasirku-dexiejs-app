use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MembershipDto {
    pub id: String,
    pub contact_id: Option<String>,
    pub member_number: String,
    pub name: Option<String>,
    pub phone: String,
    pub email: Option<String>,
    pub status: String,
    pub joined_at: DateTime<Utc>,
    pub points_balance: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
