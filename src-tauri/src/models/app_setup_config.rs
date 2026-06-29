use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AppSetupConfigDto {
    pub enabled_modules: Vec<String>,
    pub configured_at: String,
    pub configured_by: String,
    pub module_catalog_version: i32,
}
