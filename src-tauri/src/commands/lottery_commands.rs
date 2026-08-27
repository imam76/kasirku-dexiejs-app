use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::lottery::LotteryDto,
    repositories::lottery_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_lotteries(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<LotteryDto>> {
    let pool = state.pool()?;
    Ok(lottery_repository::list_lotteries(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_lottery(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<LotteryDto>> {
    let pool = state.pool()?;
    Ok(lottery_repository::get_lottery(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_lottery(
    state: State<'_, PostgresState>,
    input: LotteryDto,
) -> PostgresCommandResult<LotteryDto> {
    let pool = state.pool()?;
    Ok(lottery_repository::upsert_lottery(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_lottery(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<LotteryDto>> {
    let pool = state.pool()?;
    Ok(lottery_repository::delete_lottery(&pool, id).await?)
}
