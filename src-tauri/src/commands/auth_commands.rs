use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::auth::{ActivityLogDto, AuthUserDto},
    repositories::auth_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_auth_users(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<AuthUserDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::list_auth_users(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_auth_user(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<AuthUserDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::get_auth_user(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_auth_user(
    state: State<'_, PostgresState>,
    input: AuthUserDto,
) -> PostgresCommandResult<AuthUserDto> {
    let pool = state.pool()?;
    Ok(auth_repository::upsert_auth_user(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_activity_logs(
    state: State<'_, PostgresState>,
    limit: i64,
) -> PostgresCommandResult<Vec<ActivityLogDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::list_activity_logs(pool, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_activity_log(
    state: State<'_, PostgresState>,
    input: ActivityLogDto,
) -> PostgresCommandResult<ActivityLogDto> {
    let pool = state.pool()?;
    Ok(auth_repository::upsert_activity_log(pool, input).await?)
}
