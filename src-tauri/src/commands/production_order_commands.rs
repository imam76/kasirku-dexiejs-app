use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::production_order::ProductionOrderBundleDto,
    repositories::production_order_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_production_order_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<ProductionOrderBundleDto>> {
    let pool = state.pool()?;
    Ok(production_order_repository::list_production_order_bundles(pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_production_order_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ProductionOrderBundleDto>> {
    let pool = state.pool()?;
    Ok(production_order_repository::get_production_order_bundle(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_production_order_bundle(
    state: State<'_, PostgresState>,
    input: ProductionOrderBundleDto,
) -> PostgresCommandResult<ProductionOrderBundleDto> {
    let pool = state.pool()?;
    Ok(production_order_repository::upsert_production_order_bundle(pool, input).await?)
}
