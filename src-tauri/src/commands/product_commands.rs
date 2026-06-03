use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::product::ProductDto,
    repositories::product_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_products(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<ProductDto>> {
    let pool = state.pool()?;
    Ok(product_repository::list_products(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_product(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ProductDto>> {
    let pool = state.pool()?;
    Ok(product_repository::get_product(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_product(
    state: State<'_, PostgresState>,
    input: ProductDto,
) -> PostgresCommandResult<ProductDto> {
    let pool = state.pool()?;
    Ok(product_repository::upsert_product(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_product(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ProductDto>> {
    let pool = state.pool()?;
    Ok(product_repository::delete_product(pool, id).await?)
}
