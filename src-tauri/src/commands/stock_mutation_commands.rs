use crate::{models::stock_mutation::StockMutationDto, repositories::stock_mutation_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_stock_mutations(
    pool: State<'_, PgPool>,
) -> Result<Vec<StockMutationDto>, String> {
    stock_mutation_repository::list_stock_mutations(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_stock_mutation(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<StockMutationDto>, String> {
    stock_mutation_repository::get_stock_mutation(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_stock_mutation(
    pool: State<'_, PgPool>,
    input: StockMutationDto,
) -> Result<StockMutationDto, String> {
    stock_mutation_repository::upsert_stock_mutation(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
