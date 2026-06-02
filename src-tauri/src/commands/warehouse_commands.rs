use crate::{models::warehouse::WarehouseDto, repositories::warehouse_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_warehouses(
    pool: State<'_, PgPool>,
) -> Result<Vec<WarehouseDto>, String> {
    warehouse_repository::list_warehouses(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_warehouse(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<WarehouseDto>, String> {
    warehouse_repository::get_warehouse(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_warehouse(
    pool: State<'_, PgPool>,
    input: WarehouseDto,
) -> Result<WarehouseDto, String> {
    warehouse_repository::upsert_warehouse(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_delete_warehouse(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<WarehouseDto>, String> {
    warehouse_repository::delete_warehouse(&pool, id)
        .await
        .map_err(|error| error.to_string())
}
