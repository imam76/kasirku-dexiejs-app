use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::warehouse::WarehouseDto,
    repositories::warehouse_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_warehouses(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<WarehouseDto>> {
    let pool = state.pool()?;
    Ok(warehouse_repository::list_warehouses(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_warehouse(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<WarehouseDto>> {
    let pool = state.pool()?;
    Ok(warehouse_repository::get_warehouse(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_warehouse(
    state: State<'_, PostgresState>,
    input: WarehouseDto,
) -> PostgresCommandResult<WarehouseDto> {
    let pool = state.pool()?;
    Ok(warehouse_repository::upsert_warehouse(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_warehouse(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<WarehouseDto>> {
    let pool = state.pool()?;
    Ok(warehouse_repository::delete_warehouse(&pool, id).await?)
}
