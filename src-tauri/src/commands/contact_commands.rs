use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::contact::ContactDto,
    repositories::contact_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_contacts(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<ContactDto>> {
    let pool = state.pool()?;
    Ok(contact_repository::list_contacts(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_contact(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ContactDto>> {
    let pool = state.pool()?;
    Ok(contact_repository::get_contact(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_contact(
    state: State<'_, PostgresState>,
    input: ContactDto,
) -> PostgresCommandResult<ContactDto> {
    let pool = state.pool()?;
    Ok(contact_repository::upsert_contact(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_contact(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ContactDto>> {
    let pool = state.pool()?;
    Ok(contact_repository::delete_contact(&pool, id).await?)
}
