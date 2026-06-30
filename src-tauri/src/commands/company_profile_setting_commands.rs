use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::company_profile_setting::CompanyProfileSettingDto,
    repositories::company_profile_setting_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_get_company_profile_setting(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Option<CompanyProfileSettingDto>> {
    let pool = state.pool()?;
    Ok(company_profile_setting_repository::get_company_profile_setting(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_company_profile_setting(
    state: State<'_, PostgresState>,
    input: CompanyProfileSettingDto,
) -> PostgresCommandResult<CompanyProfileSettingDto> {
    let pool = state.pool()?;
    Ok(company_profile_setting_repository::upsert_company_profile_setting(&pool, input).await?)
}
