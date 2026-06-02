use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_health_check(pool: State<'_, PgPool>) -> Result<bool, String> {
    let value: i32 = sqlx::query_scalar("SELECT 1")
        .fetch_one(&*pool)
        .await
        .map_err(|error| error.to_string())?;

    Ok(value == 1)
}
