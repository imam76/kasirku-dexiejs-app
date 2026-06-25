use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::auth::{
        ActivityLogDto, AuthUserDto, AuthenticateServerSessionInput, RoleDto, RolePermissionDto,
        ServerAuthSessionDto,
    },
    repositories::auth_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_authenticate_server_session(
    state: State<'_, PostgresState>,
    input: AuthenticateServerSessionInput,
) -> PostgresCommandResult<ServerAuthSessionDto> {
    let pool = state.pool()?;
    auth_repository::authenticate_server_session(&pool, input.email, input.pin)
        .await?
        .ok_or(crate::db::PostgresCommandError {
            code: "invalid_credentials",
            status: None,
            message: "Email atau PIN tidak valid atau user tidak aktif.".to_string(),
        })
}

#[tauri::command]
pub async fn postgres_revoke_server_session(
    state: State<'_, PostgresState>,
    token: String,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    auth_repository::revoke_server_session(&pool, token).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_list_auth_users(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<AuthUserDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::list_auth_users(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_auth_user(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<AuthUserDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::get_auth_user(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_auth_user(
    state: State<'_, PostgresState>,
    input: AuthUserDto,
) -> PostgresCommandResult<AuthUserDto> {
    let pool = state.pool()?;
    Ok(auth_repository::upsert_auth_user(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_roles(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<RoleDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::list_roles(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_role(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<RoleDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::get_role(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_role(
    state: State<'_, PostgresState>,
    input: RoleDto,
) -> PostgresCommandResult<RoleDto> {
    let pool = state.pool()?;
    Ok(auth_repository::upsert_role(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_role_permissions(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<RolePermissionDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::list_role_permissions(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_role_permission(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<RolePermissionDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::get_role_permission(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_role_permission(
    state: State<'_, PostgresState>,
    input: RolePermissionDto,
) -> PostgresCommandResult<RolePermissionDto> {
    let pool = state.pool()?;
    Ok(auth_repository::upsert_role_permission(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_activity_logs(
    state: State<'_, PostgresState>,
    limit: i64,
) -> PostgresCommandResult<Vec<ActivityLogDto>> {
    let pool = state.pool()?;
    Ok(auth_repository::list_activity_logs(&pool, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_activity_log(
    state: State<'_, PostgresState>,
    input: ActivityLogDto,
) -> PostgresCommandResult<ActivityLogDto> {
    let pool = state.pool()?;
    Ok(auth_repository::upsert_activity_log(&pool, input).await?)
}
