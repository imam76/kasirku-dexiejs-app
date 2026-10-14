use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::membership::{MembershipDto, MembershipPointTransactionDto, MembershipUpsertInputDto},
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
    input: MembershipUpsertInputDto,
) -> PostgresCommandResult<MembershipDto> {
    let pool = state.pool()?;
    Ok(membership_repository::upsert_membership(
        &pool,
        input.membership,
        input.preserve_points_balance,
    )
    .await?)
}

#[tauri::command]
pub async fn postgres_delete_membership(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<MembershipDto>> {
    let pool = state.pool()?;
    Ok(membership_repository::delete_membership(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_list_membership_point_transactions(
    state: State<'_, PostgresState>,
    server_created_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<MembershipPointTransactionDto>> {
    let pool = state.pool()?;
    Ok(membership_repository::list_membership_point_transactions(
        &pool,
        server_created_after,
        cursor_id,
        limit,
    )
    .await?)
}

#[tauri::command]
pub async fn postgres_upsert_membership_point_transaction(
    state: State<'_, PostgresState>,
    input: MembershipPointTransactionDto,
) -> PostgresCommandResult<MembershipPointTransactionDto> {
    let pool = state.pool()?;
    Ok(membership_repository::upsert_membership_point_transaction(&pool, input).await?)
}
