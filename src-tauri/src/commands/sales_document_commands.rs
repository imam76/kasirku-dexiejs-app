use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::sales_document::SalesDocumentBundleDto,
    repositories::sales_document_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_sales_document_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<SalesDocumentBundleDto>> {
    let pool = state.pool()?;
    Ok(sales_document_repository::list_sales_document_bundles(pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_sales_document_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<SalesDocumentBundleDto>> {
    let pool = state.pool()?;
    Ok(sales_document_repository::get_sales_document_bundle(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_sales_document_bundle(
    state: State<'_, PostgresState>,
    input: SalesDocumentBundleDto,
) -> PostgresCommandResult<SalesDocumentBundleDto> {
    let pool = state.pool()?;
    Ok(sales_document_repository::upsert_sales_document_bundle(pool, input).await?)
}
