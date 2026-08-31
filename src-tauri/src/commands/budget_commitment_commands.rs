use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::budget_commitment::BudgetCommitmentDto,
    repositories::budget_commitment_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_budget_commitments(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<BudgetCommitmentDto>> {
    let pool = state.pool()?;
    Ok(budget_commitment_repository::list_budget_commitments(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_budget_commitment(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<BudgetCommitmentDto>> {
    let pool = state.pool()?;
    Ok(budget_commitment_repository::get_budget_commitment(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_budget_commitment(
    state: State<'_, PostgresState>,
    input: BudgetCommitmentDto,
) -> PostgresCommandResult<BudgetCommitmentDto> {
    let pool = state.pool()?;
    Ok(budget_commitment_repository::upsert_budget_commitment(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_budget_commitment(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<BudgetCommitmentDto>> {
    let pool = state.pool()?;
    Ok(budget_commitment_repository::delete_budget_commitment(&pool, id).await?)
}
