use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::purchase_cost_reconciliation::PurchaseCostReconciliationBundleDto,
    repositories::purchase_cost_reconciliation_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_purchase_cost_reconciliation_bundles(
    state: State<'_, PostgresState>,
    created_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<PurchaseCostReconciliationBundleDto>> {
    let pool = state.pool()?;
    Ok(
        purchase_cost_reconciliation_repository::list_purchase_cost_reconciliation_bundles(
            &pool,
            created_after,
            limit,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn postgres_get_purchase_cost_reconciliation_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PurchaseCostReconciliationBundleDto>> {
    let pool = state.pool()?;
    Ok(
        purchase_cost_reconciliation_repository::get_purchase_cost_reconciliation_bundle(
            &pool, id,
        )
        .await?,
    )
}

#[tauri::command]
pub async fn postgres_upsert_purchase_cost_reconciliation_bundle(
    state: State<'_, PostgresState>,
    input: PurchaseCostReconciliationBundleDto,
) -> PostgresCommandResult<PurchaseCostReconciliationBundleDto> {
    let pool = state.pool()?;
    Ok(
        purchase_cost_reconciliation_repository::upsert_purchase_cost_reconciliation_bundle(
            &pool, input,
        )
        .await?,
    )
}
