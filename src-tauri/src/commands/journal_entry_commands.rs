use crate::{models::journal_entry::JournalEntryBundleDto, repositories::journal_entry_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_journal_entry_bundles(
    pool: State<'_, PgPool>,
) -> Result<Vec<JournalEntryBundleDto>, String> {
    journal_entry_repository::list_journal_entry_bundles(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_journal_entry_bundle(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<JournalEntryBundleDto>, String> {
    journal_entry_repository::get_journal_entry_bundle(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_journal_entry_bundle(
    pool: State<'_, PgPool>,
    input: JournalEntryBundleDto,
) -> Result<JournalEntryBundleDto, String> {
    journal_entry_repository::upsert_journal_entry_bundle(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
