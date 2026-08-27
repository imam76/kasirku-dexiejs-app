use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CompanyProfileSettingDto {
    pub id: String,
    pub company_name: Option<String>,
    pub logo_data_url: Option<String>,
    pub logo_file_name: Option<String>,
    pub logo_mime_type: Option<String>,
    pub logo_size: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
