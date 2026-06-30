use crate::models::app_setup_config::AppSetupConfigDto;
use sqlx::PgPool;

const APP_SETUP_CONFIG_ID: &str = "default";

pub async fn get_app_setup_config(pool: &PgPool) -> Result<Option<AppSetupConfigDto>, sqlx::Error> {
    sqlx::query_as::<_, AppSetupConfigDto>(
        r#"
        SELECT
            enabled_modules,
            configured_at::TEXT AS configured_at,
            configured_by,
            module_catalog_version
        FROM app_setup_config
        WHERE id = $1
        "#,
    )
    .bind(APP_SETUP_CONFIG_ID)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_app_setup_config(
    pool: &PgPool,
    input: AppSetupConfigDto,
) -> Result<AppSetupConfigDto, sqlx::Error> {
    sqlx::query_as::<_, AppSetupConfigDto>(
        r#"
        INSERT INTO app_setup_config (
            id,
            enabled_modules,
            configured_at,
            configured_by,
            module_catalog_version,
            updated_at
        )
        VALUES ($1, $2, $3::TIMESTAMPTZ, $4, $5, NOW())
        ON CONFLICT (id) DO UPDATE SET
            enabled_modules = EXCLUDED.enabled_modules,
            configured_at = EXCLUDED.configured_at,
            configured_by = EXCLUDED.configured_by,
            module_catalog_version = EXCLUDED.module_catalog_version,
            updated_at = NOW()
        RETURNING
            enabled_modules,
            configured_at::TEXT AS configured_at,
            configured_by,
            module_catalog_version
        "#,
    )
    .bind(APP_SETUP_CONFIG_ID)
    .bind(input.enabled_modules)
    .bind(input.configured_at)
    .bind(input.configured_by)
    .bind(input.module_catalog_version)
    .fetch_one(pool)
    .await
}
