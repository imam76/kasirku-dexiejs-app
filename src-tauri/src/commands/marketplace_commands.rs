use crate::{
    db::PostgresState,
    marketplace::{
        shopee_service, state::MarketplaceRuntimeState, MarketplaceError, MarketplaceResult,
    },
    models::marketplace::{
        MarketplaceAccountDto, MarketplaceIntegrationLogDto, MarketplaceOrderBundleDto,
        MarketplaceOrderListInput, MarketplaceOrderListResult, MarketplaceSyncSummary,
        ShopeeAuthorizationAttemptDto,
    },
};
use sqlx::PgPool;
use tauri::{AppHandle, State};

fn marketplace_pool(state: &State<'_, PostgresState>) -> MarketplaceResult<PgPool> {
    state.pool().map_err(|error| {
        MarketplaceError::new(
            "POSTGRES_UNAVAILABLE",
            format!("PostgreSQL belum tersedia: {}", error.message),
        )
    })
}

#[tauri::command]
pub async fn marketplace_list_accounts(
    state: State<'_, PostgresState>,
    session_token: String,
) -> MarketplaceResult<Vec<MarketplaceAccountDto>> {
    let pool = marketplace_pool(&state)?;
    shopee_service::list_accounts(&pool, &session_token).await
}

#[tauri::command]
pub async fn shopee_start_authorization(
    app_handle: AppHandle,
    state: State<'_, PostgresState>,
    runtime: State<'_, MarketplaceRuntimeState>,
    session_token: String,
) -> MarketplaceResult<ShopeeAuthorizationAttemptDto> {
    let pool = marketplace_pool(&state)?;
    shopee_service::start_authorization(&app_handle, &pool, &runtime, &session_token).await
}

#[tauri::command]
pub async fn shopee_get_authorization_status(
    state: State<'_, PostgresState>,
    runtime: State<'_, MarketplaceRuntimeState>,
    session_token: String,
    attempt_id: String,
) -> MarketplaceResult<ShopeeAuthorizationAttemptDto> {
    let pool = marketplace_pool(&state)?;
    shopee_service::get_authorization_status(&pool, &runtime, &session_token, &attempt_id).await
}

#[tauri::command]
pub async fn marketplace_sync_orders(
    state: State<'_, PostgresState>,
    runtime: State<'_, MarketplaceRuntimeState>,
    session_token: String,
    marketplace_account_id: String,
) -> MarketplaceResult<MarketplaceSyncSummary> {
    let pool = marketplace_pool(&state)?;
    shopee_service::sync_orders(&pool, &runtime, &session_token, &marketplace_account_id).await
}

#[tauri::command]
pub async fn marketplace_list_orders(
    state: State<'_, PostgresState>,
    session_token: String,
    input: MarketplaceOrderListInput,
) -> MarketplaceResult<MarketplaceOrderListResult> {
    let pool = marketplace_pool(&state)?;
    shopee_service::list_orders(&pool, &session_token, input).await
}

#[tauri::command]
pub async fn marketplace_get_order(
    state: State<'_, PostgresState>,
    session_token: String,
    id: String,
) -> MarketplaceResult<MarketplaceOrderBundleDto> {
    let pool = marketplace_pool(&state)?;
    shopee_service::get_order(&pool, &session_token, &id).await
}

#[tauri::command]
pub async fn marketplace_list_integration_logs(
    state: State<'_, PostgresState>,
    session_token: String,
    marketplace_account_id: Option<String>,
    limit: Option<i64>,
) -> MarketplaceResult<Vec<MarketplaceIntegrationLogDto>> {
    let pool = marketplace_pool(&state)?;
    shopee_service::list_logs(
        &pool,
        &session_token,
        marketplace_account_id.as_deref(),
        limit.unwrap_or(20),
    )
    .await
}
