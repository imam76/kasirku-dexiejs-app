use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::membership::MembershipDto,
    repositories::membership_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_memberships(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<MembershipDto>> {
    let pool = state.pool()?;
    Ok(membership_repository::list_memberships(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_membership(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<MembershipDto>> {
    let pool = state.pool()?;
    Ok(membership_repository::get_membership(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_membership(
    state: State<'_, PostgresState>,
    input: MembershipDto,
) -> PostgresCommandResult<MembershipDto> {
    let pool = state.pool()?;
    Ok(membership_repository::upsert_membership(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_membership(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<MembershipDto>> {
    let pool = state.pool()?;
    Ok(membership_repository::delete_membership(&pool, id).await?)
}
