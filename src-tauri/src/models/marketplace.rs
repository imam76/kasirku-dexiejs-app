use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MarketplaceAccountDto {
    pub id: String,
    pub marketplace: String,
    pub shop_id: String,
    pub shop_name: String,
    pub status: String,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MarketplaceAccountSecretDto {
    pub shop_id: i64,
    pub access_token_encrypted: String,
    pub refresh_token_encrypted: String,
    pub token_expires_at: String,
    pub status: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MarketplaceOrderDto {
    pub id: String,
    pub marketplace_account_id: String,
    pub shop_name: String,
    pub shop_id: String,
    pub order_sn: String,
    pub buyer_username: Option<String>,
    pub marketplace_status: String,
    pub internal_status: String,
    pub total_amount: Option<String>,
    pub currency: String,
    pub order_created_at: String,
    pub order_updated_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MarketplaceOrderItemDto {
    pub id: String,
    pub marketplace_order_id: String,
    pub item_id: String,
    pub model_id: String,
    pub item_name: String,
    pub sku: Option<String>,
    pub quantity: i32,
    pub original_price: Option<String>,
    pub discounted_price: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceOrderBundleDto {
    pub order: MarketplaceOrderDto,
    pub items: Vec<MarketplaceOrderItemDto>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MarketplaceIntegrationLogDto {
    pub id: String,
    pub marketplace_account_id: Option<String>,
    pub action: String,
    pub status: String,
    pub request_payload: Option<Value>,
    pub response_payload: Option<Value>,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceOrderListInput {
    pub account_id: Option<String>,
    pub search: Option<String>,
    pub internal_status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceOrderListResult {
    pub rows: Vec<MarketplaceOrderDto>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceSyncSummary {
    pub marketplace_account_id: String,
    pub fetched_orders: usize,
    pub upserted_orders: usize,
    pub upserted_items: usize,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShopeeAuthorizationAttemptDto {
    pub attempt_id: String,
    pub status: String,
    pub expires_at: String,
    pub message: Option<String>,
    pub marketplace_account_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MarketplaceOrderUpsert {
    pub order_sn: String,
    pub buyer_username: Option<String>,
    pub marketplace_status: String,
    pub internal_status: String,
    pub total_amount: Option<String>,
    pub currency: String,
    pub order_created_at: String,
    pub order_updated_at: String,
    pub raw_payload: Value,
    pub items: Vec<MarketplaceOrderItemUpsert>,
}

#[derive(Debug, Clone)]
pub struct MarketplaceOrderItemUpsert {
    pub item_id: i64,
    pub model_id: i64,
    pub item_name: String,
    pub sku: Option<String>,
    pub quantity: i32,
    pub original_price: Option<String>,
    pub discounted_price: Option<String>,
    pub raw_payload: Value,
}
