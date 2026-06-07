use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::journal_entry::JournalEntryBundleDto,
    repositories::journal_entry_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_journal_entry_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<JournalEntryBundleDto>> {
    let pool = state.pool()?;
    Ok(journal_entry_repository::list_journal_entry_bundles(pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_journal_entry_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<JournalEntryBundleDto>> {
    let pool = state.pool()?;
    Ok(journal_entry_repository::get_journal_entry_bundle(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_journal_entry_bundle(
    state: State<'_, PostgresState>,
    input: JournalEntryBundleDto,
) -> PostgresCommandResult<JournalEntryBundleDto> {
    let pool = state.pool()?;
    Ok(journal_entry_repository::upsert_journal_entry_bundle(pool, input).await?)
}
