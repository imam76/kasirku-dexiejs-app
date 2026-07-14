use crate::{
    db::{self, PostgresHealth, PostgresState},
    postgres_realtime::PostgresRealtimeState,
};
use std::env;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn postgres_health_check(
    app_handle: AppHandle,
    state: State<'_, PostgresState>,
    realtime_state: State<'_, PostgresRealtimeState>,
) -> Result<PostgresHealth, String> {
    let pool = match state.pool() {
        Ok(pool) => pool,
        Err(_) => {
            let health = reconnect_postgres_state(app_handle, &state, &realtime_state).await;
            return Ok(health);
        }
    };

    let health_result: Result<i32, sqlx::Error> =
        sqlx::query_scalar("SELECT 1").fetch_one(&pool).await;

    let health = match health_result {
        Ok(1) => state.health(),
        Ok(_) | Err(_) => reconnect_postgres_state(app_handle, &state, &realtime_state).await,
    };

    Ok(health)
}

async fn reconnect_postgres_state(
    app_handle: AppHandle,
    state: &State<'_, PostgresState>,
    realtime_state: &State<'_, PostgresRealtimeState>,
) -> PostgresHealth {
    let new_state = db::create_postgres_state().await;
    let health = new_state.health();
    state.update_from(new_state);
    realtime_state.restart(app_handle, health.available);

    health
}

#[tauri::command]
pub async fn set_postgres_database_url(
    app_handle: AppHandle,
    state: State<'_, PostgresState>,
    realtime_state: State<'_, PostgresRealtimeState>,
    database_url: String,
) -> Result<PostgresHealth, String> {
    let trimmed = database_url.trim();

    if trimmed.is_empty() {
        db::remove_persisted_database_url()
            .map_err(|err| format!("Failed to clear stored database URL: {}", err))?;
        env::remove_var("DATABASE_URL");
        state.update_from(PostgresState::unconfigured());
        let health = state.health();
        realtime_state.restart(app_handle, health.available);

        return Ok(health);
    }

    let new_state = db::create_postgres_state_from_database_url(trimmed).await;
    let health = new_state.health();
    if !health.available {
        return Ok(health);
    }

    db::persist_database_url(trimmed)
        .map_err(|err| format!("Failed to save database URL: {}", err))?;
    env::set_var("DATABASE_URL", trimmed);

    state.update_from(new_state);
    let health = state.health();
    realtime_state.restart(app_handle, health.available);

    Ok(health)
}
