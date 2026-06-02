use crate::{models::tax::TaxDto, repositories::tax_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_taxes(pool: State<'_, PgPool>) -> Result<Vec<TaxDto>, String> {
    tax_repository::list_taxes(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_tax(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<TaxDto>, String> {
    tax_repository::get_tax(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_tax(pool: State<'_, PgPool>, input: TaxDto) -> Result<TaxDto, String> {
    tax_repository::upsert_tax(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_delete_tax(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<TaxDto>, String> {
    tax_repository::delete_tax(&pool, id)
        .await
        .map_err(|error| error.to_string())
}
