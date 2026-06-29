use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::app_setup_config::AppSetupConfigDto,
    repositories::app_setup_config_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_get_app_setup_config(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Option<AppSetupConfigDto>> {
    let pool = state.pool()?;
    Ok(app_setup_config_repository::get_app_setup_config(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_app_setup_config(
    state: State<'_, PostgresState>,
    input: AppSetupConfigDto,
) -> PostgresCommandResult<AppSetupConfigDto> {
    let pool = state.pool()?;
    Ok(app_setup_config_repository::upsert_app_setup_config(&pool, input).await?)
}
