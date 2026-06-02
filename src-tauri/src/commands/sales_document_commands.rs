use crate::{
    models::sales_document::SalesDocumentBundleDto, repositories::sales_document_repository,
};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_sales_document_bundles(
    pool: State<'_, PgPool>,
) -> Result<Vec<SalesDocumentBundleDto>, String> {
    sales_document_repository::list_sales_document_bundles(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_sales_document_bundle(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<SalesDocumentBundleDto>, String> {
    sales_document_repository::get_sales_document_bundle(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_sales_document_bundle(
    pool: State<'_, PgPool>,
    input: SalesDocumentBundleDto,
) -> Result<SalesDocumentBundleDto, String> {
    sales_document_repository::upsert_sales_document_bundle(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
