use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::stock_opname::StockOpnameBundleDto,
    repositories::stock_opname_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_stock_opname_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<StockOpnameBundleDto>> {
    let pool = state.pool()?;
    Ok(stock_opname_repository::list_stock_opname_bundles(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_stock_opname_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<StockOpnameBundleDto>> {
    let pool = state.pool()?;
    Ok(stock_opname_repository::get_stock_opname_bundle(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_stock_opname_bundle(
    state: State<'_, PostgresState>,
    input: StockOpnameBundleDto,
) -> PostgresCommandResult<StockOpnameBundleDto> {
    let pool = state.pool()?;
    Ok(stock_opname_repository::upsert_stock_opname_bundle(&pool, input).await?)
}
