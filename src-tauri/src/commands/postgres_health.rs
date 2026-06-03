use crate::db::{PostgresHealth, PostgresState};
use tauri::State;

#[tauri::command]
pub async fn postgres_health_check(
    state: State<'_, PostgresState>,
) -> Result<PostgresHealth, String> {
    let pool = match state.pool() {
        Ok(pool) => pool,
        Err(_) => return Ok(state.health()),
    };

    let health_result: Result<i32, sqlx::Error> =
        sqlx::query_scalar("SELECT 1").fetch_one(pool).await;

    let health = match health_result {
        Ok(1) => state.health(),
        Ok(_) | Err(_) => PostgresHealth::unreachable("PostgreSQL health check failed."),
    };

    Ok(health)
}
