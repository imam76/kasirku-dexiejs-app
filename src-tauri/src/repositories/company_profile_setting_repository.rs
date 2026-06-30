use crate::models::company_profile_setting::CompanyProfileSettingDto;
use sqlx::PgPool;

const COMPANY_PROFILE_SETTING_ID: &str = "default";

pub async fn get_company_profile_setting(
    pool: &PgPool,
) -> Result<Option<CompanyProfileSettingDto>, sqlx::Error> {
    sqlx::query_as::<_, CompanyProfileSettingDto>(
        r#"
        SELECT
            id,
            company_name,
            logo_data_url,
            logo_file_name,
            logo_mime_type,
            logo_size,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM company_profile_setting
        WHERE id = $1
        "#,
    )
    .bind(COMPANY_PROFILE_SETTING_ID)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_company_profile_setting(
    pool: &PgPool,
    input: CompanyProfileSettingDto,
) -> Result<CompanyProfileSettingDto, sqlx::Error> {
    let upserted_setting = sqlx::query_as::<_, CompanyProfileSettingDto>(
        r#"
        INSERT INTO company_profile_setting (
            id,
            company_name,
            logo_data_url,
            logo_file_name,
            logo_mime_type,
            logo_size,
            created_at,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            logo_data_url = EXCLUDED.logo_data_url,
            logo_file_name = EXCLUDED.logo_file_name,
            logo_mime_type = EXCLUDED.logo_mime_type,
            logo_size = EXCLUDED.logo_size,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= company_profile_setting.updated_at
        RETURNING
            id,
            company_name,
            logo_data_url,
            logo_file_name,
            logo_mime_type,
            logo_size,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.company_name)
    .bind(input.logo_data_url)
    .bind(input.logo_file_name)
    .bind(input.logo_mime_type)
    .bind(input.logo_size)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(setting) = upserted_setting {
        return Ok(setting);
    }

    get_company_profile_setting(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
