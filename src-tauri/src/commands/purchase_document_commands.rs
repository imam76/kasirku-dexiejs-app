use crate::{
    models::purchase_document::PurchaseDocumentBundleDto,
    repositories::purchase_document_repository,
};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_purchase_document_bundles(
    pool: State<'_, PgPool>,
) -> Result<Vec<PurchaseDocumentBundleDto>, String> {
    purchase_document_repository::list_purchase_document_bundles(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_purchase_document_bundle(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<PurchaseDocumentBundleDto>, String> {
    purchase_document_repository::get_purchase_document_bundle(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_purchase_document_bundle(
    pool: State<'_, PgPool>,
    input: PurchaseDocumentBundleDto,
) -> Result<PurchaseDocumentBundleDto, String> {
    purchase_document_repository::upsert_purchase_document_bundle(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
