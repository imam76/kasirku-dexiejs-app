use crate::{models::contact::ContactDto, repositories::contact_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_contacts(pool: State<'_, PgPool>) -> Result<Vec<ContactDto>, String> {
    contact_repository::list_contacts(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_contact(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<ContactDto>, String> {
    contact_repository::get_contact(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_contact(
    pool: State<'_, PgPool>,
    input: ContactDto,
) -> Result<ContactDto, String> {
    contact_repository::upsert_contact(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_delete_contact(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<ContactDto>, String> {
    contact_repository::delete_contact(&pool, id)
        .await
        .map_err(|error| error.to_string())
}
