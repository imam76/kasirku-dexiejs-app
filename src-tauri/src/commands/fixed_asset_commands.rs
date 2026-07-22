use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::fixed_asset::{FixedAssetDepreciationRunBundleDto, FixedAssetDto},
    repositories::fixed_asset_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_fixed_assets(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<FixedAssetDto>> {
    let pool = state.pool()?;
    Ok(fixed_asset_repository::list_fixed_assets(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_fixed_asset(
    state: State<'_, PostgresState>,
    input: FixedAssetDto,
) -> PostgresCommandResult<FixedAssetDto> {
    let pool = state.pool()?;
    Ok(fixed_asset_repository::upsert_fixed_asset(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_fixed_asset_depreciation_run_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<FixedAssetDepreciationRunBundleDto>> {
    let pool = state.pool()?;
    Ok(fixed_asset_repository::list_run_bundles(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_fixed_asset_depreciation_run_bundle(
    state: State<'_, PostgresState>,
    input: FixedAssetDepreciationRunBundleDto,
) -> PostgresCommandResult<FixedAssetDepreciationRunBundleDto> {
    let pool = state.pool()?;
    Ok(fixed_asset_repository::upsert_run_bundle(&pool, input).await?)
}
