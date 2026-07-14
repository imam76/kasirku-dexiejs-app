use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::opening_balance::OpeningBalanceBundleDto,
    repositories::opening_balance_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_opening_balance_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<OpeningBalanceBundleDto>> {
    let pool = state.pool()?;
    Ok(
        opening_balance_repository::list_opening_balance_bundles(&pool, updated_after, limit)
            .await?,
    )
}

#[tauri::command]
pub async fn postgres_get_opening_balance_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<OpeningBalanceBundleDto>> {
    let pool = state.pool()?;
    Ok(opening_balance_repository::get_opening_balance_bundle(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_opening_balance_bundle(
    state: State<'_, PostgresState>,
    input: OpeningBalanceBundleDto,
) -> PostgresCommandResult<OpeningBalanceBundleDto> {
    let pool = state.pool()?;
    Ok(opening_balance_repository::upsert_opening_balance_bundle(&pool, input).await?)
}
