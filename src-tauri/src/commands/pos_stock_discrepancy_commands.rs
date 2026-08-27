use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::pos_stock_discrepancy::PosStockDiscrepancyDto,
    repositories::pos_stock_discrepancy_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_pos_stock_discrepancies(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<PosStockDiscrepancyDto>> {
    let pool = state.pool()?;
    Ok(pos_stock_discrepancy_repository::list(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_pos_stock_discrepancy(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PosStockDiscrepancyDto>> {
    let pool = state.pool()?;
    Ok(pos_stock_discrepancy_repository::get(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_pos_stock_discrepancy(
    state: State<'_, PostgresState>,
    input: PosStockDiscrepancyDto,
) -> PostgresCommandResult<PosStockDiscrepancyDto> {
    let pool = state.pool()?;
    Ok(pos_stock_discrepancy_repository::upsert(&pool, input).await?)
}
