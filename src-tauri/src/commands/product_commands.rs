use crate::{models::product::ProductDto, repositories::product_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_products(pool: State<'_, PgPool>) -> Result<Vec<ProductDto>, String> {
    product_repository::list_products(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_product(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<ProductDto>, String> {
    product_repository::get_product(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_product(
    pool: State<'_, PgPool>,
    input: ProductDto,
) -> Result<ProductDto, String> {
    product_repository::upsert_product(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_delete_product(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<ProductDto>, String> {
    product_repository::delete_product(&pool, id)
        .await
        .map_err(|error| error.to_string())
}
