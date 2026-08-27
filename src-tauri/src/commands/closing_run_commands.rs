use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::closing_run::ClosingRunDto,
    repositories::closing_run_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_closing_runs(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<ClosingRunDto>> {
    let pool = state.pool()?;
    Ok(closing_run_repository::list_closing_runs(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_closing_run(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ClosingRunDto>> {
    let pool = state.pool()?;
    Ok(closing_run_repository::get_closing_run(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_closing_run(
    state: State<'_, PostgresState>,
    input: ClosingRunDto,
) -> PostgresCommandResult<ClosingRunDto> {
    let pool = state.pool()?;
    Ok(closing_run_repository::upsert_closing_run(&pool, input).await?)
}
