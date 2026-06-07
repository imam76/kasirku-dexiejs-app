use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::tax::TaxDto,
    repositories::tax_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_taxes(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<TaxDto>> {
    let pool = state.pool()?;
    Ok(tax_repository::list_taxes(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_tax(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<TaxDto>> {
    let pool = state.pool()?;
    Ok(tax_repository::get_tax(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_tax(
    state: State<'_, PostgresState>,
    input: TaxDto,
) -> PostgresCommandResult<TaxDto> {
    let pool = state.pool()?;
    Ok(tax_repository::upsert_tax(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_tax(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<TaxDto>> {
    let pool = state.pool()?;
    Ok(tax_repository::delete_tax(pool, id).await?)
}
