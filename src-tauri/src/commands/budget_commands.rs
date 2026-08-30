use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::budget::BudgetDto,
    repositories::budget_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_budgets(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<BudgetDto>> {
    let pool = state.pool()?;
    Ok(budget_repository::list_budgets(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_budget(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<BudgetDto>> {
    let pool = state.pool()?;
    Ok(budget_repository::get_budget(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_budget(
    state: State<'_, PostgresState>,
    input: BudgetDto,
) -> PostgresCommandResult<BudgetDto> {
    let pool = state.pool()?;
    Ok(budget_repository::upsert_budget(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_budget(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<BudgetDto>> {
    let pool = state.pool()?;
    Ok(budget_repository::delete_budget(&pool, id).await?)
}
