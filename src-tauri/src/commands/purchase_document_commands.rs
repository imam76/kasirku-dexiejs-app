use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::purchase_document::PurchaseDocumentBundleDto,
    repositories::purchase_document_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_purchase_document_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<PurchaseDocumentBundleDto>> {
    let pool = state.pool()?;
    Ok(
        purchase_document_repository::list_purchase_document_bundles(
            &pool,
            updated_after,
            cursor_id,
            limit,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn postgres_get_purchase_document_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PurchaseDocumentBundleDto>> {
    let pool = state.pool()?;
    Ok(purchase_document_repository::get_purchase_document_bundle(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_purchase_document_bundle(
    state: State<'_, PostgresState>,
    input: PurchaseDocumentBundleDto,
) -> PostgresCommandResult<PurchaseDocumentBundleDto> {
    let pool = state.pool()?;
    Ok(purchase_document_repository::upsert_purchase_document_bundle(&pool, input).await?)
}
