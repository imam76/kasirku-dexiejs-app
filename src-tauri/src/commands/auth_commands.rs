use crate::{
    models::auth::{ActivityLogDto, AuthUserDto},
    repositories::auth_repository,
};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_auth_users(pool: State<'_, PgPool>) -> Result<Vec<AuthUserDto>, String> {
    auth_repository::list_auth_users(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_auth_user(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<AuthUserDto>, String> {
    auth_repository::get_auth_user(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_auth_user(
    pool: State<'_, PgPool>,
    input: AuthUserDto,
) -> Result<AuthUserDto, String> {
    auth_repository::upsert_auth_user(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_list_activity_logs(
    pool: State<'_, PgPool>,
    limit: i64,
) -> Result<Vec<ActivityLogDto>, String> {
    auth_repository::list_activity_logs(&pool, limit)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_activity_log(
    pool: State<'_, PgPool>,
    input: ActivityLogDto,
) -> Result<ActivityLogDto, String> {
    auth_repository::upsert_activity_log(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
