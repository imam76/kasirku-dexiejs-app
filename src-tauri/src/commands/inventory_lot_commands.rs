use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::inventory_lot::{InventoryLotConsumptionDto, InventoryLotDto},
    repositories::inventory_lot_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_inventory_lots(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<InventoryLotDto>> {
    let pool = state.pool()?;
    Ok(inventory_lot_repository::list_inventory_lots(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_inventory_lot(
    state: State<'_, PostgresState>,
    input: InventoryLotDto,
) -> PostgresCommandResult<InventoryLotDto> {
    let pool = state.pool()?;
    Ok(inventory_lot_repository::upsert_inventory_lot(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_inventory_lot_consumptions(
    state: State<'_, PostgresState>,
    created_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<InventoryLotConsumptionDto>> {
    let pool = state.pool()?;
    Ok(
        inventory_lot_repository::list_inventory_lot_consumptions(&pool, created_after, limit)
            .await?,
    )
}

#[tauri::command]
pub async fn postgres_upsert_inventory_lot_consumption(
    state: State<'_, PostgresState>,
    input: InventoryLotConsumptionDto,
) -> PostgresCommandResult<InventoryLotConsumptionDto> {
    let pool = state.pool()?;
    Ok(inventory_lot_repository::upsert_inventory_lot_consumption(&pool, input).await?)
}
