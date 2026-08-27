use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::promo::PromoDto,
    repositories::promo_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_promos(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<PromoDto>> {
    let pool = state.pool()?;
    Ok(promo_repository::list_promos(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_promo(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PromoDto>> {
    let pool = state.pool()?;
    Ok(promo_repository::get_promo(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_promo(
    state: State<'_, PostgresState>,
    input: PromoDto,
) -> PostgresCommandResult<PromoDto> {
    let pool = state.pool()?;
    Ok(promo_repository::upsert_promo(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_promo(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PromoDto>> {
    let pool = state.pool()?;
    Ok(promo_repository::delete_promo(&pool, id).await?)
}
