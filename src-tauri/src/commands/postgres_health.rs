use crate::db::{self, PostgresHealth, PostgresState};
use std::env;
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
        sqlx::query_scalar("SELECT 1").fetch_one(&pool).await;

    let health = match health_result {
        Ok(1) => state.health(),
        Ok(_) | Err(_) => PostgresHealth::unreachable("PostgreSQL health check failed."),
    };

    Ok(health)
}

#[tauri::command]
pub async fn set_postgres_database_url(
    state: State<'_, PostgresState>,
    database_url: String,
) -> Result<PostgresHealth, String> {
    let trimmed = database_url.trim();

    if trimmed.is_empty() {
        db::remove_persisted_database_url()
            .map_err(|err| format!("Failed to clear stored database URL: {}", err))?;
        env::remove_var("DATABASE_URL");
    } else {
        db::persist_database_url(trimmed)
            .map_err(|err| format!("Failed to save database URL: {}", err))?;
        env::set_var("DATABASE_URL", trimmed);
    }

    let new_state = db::create_postgres_state().await;
    state.update_from(new_state);

    Ok(state.health())
}
