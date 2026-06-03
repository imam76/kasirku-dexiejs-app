use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::stock_mutation::StockMutationDto,
    repositories::stock_mutation_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_stock_mutations(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<StockMutationDto>> {
    let pool = state.pool()?;
    Ok(stock_mutation_repository::list_stock_mutations(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_stock_mutation(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<StockMutationDto>> {
    let pool = state.pool()?;
    Ok(stock_mutation_repository::get_stock_mutation(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_stock_mutation(
    state: State<'_, PostgresState>,
    input: StockMutationDto,
) -> PostgresCommandResult<StockMutationDto> {
    let pool = state.pool()?;
    Ok(stock_mutation_repository::upsert_stock_mutation(pool, input).await?)
}
