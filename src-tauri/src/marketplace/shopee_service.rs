use super::{
    crypto::{token_aad, TokenCipher},
    shopee_client::{sanitize_payload, ShopeeApiClient, ShopeeConfig},
    state::{AuthorizationAttempt, MarketplaceRuntimeState},
    MarketplaceError, MarketplaceResult,
};
use crate::{
    models::marketplace::{
        MarketplaceAccountDto, MarketplaceIntegrationLogDto, MarketplaceOrderBundleDto,
        MarketplaceOrderItemUpsert, MarketplaceOrderListInput, MarketplaceOrderListResult,
        MarketplaceOrderUpsert, MarketplaceSyncSummary, ShopeeAuthorizationAttemptDto,
    },
    repositories::marketplace_repository,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, TimeZone, Utc};
use rand::RngCore;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::collections::HashSet;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    time::{timeout, Duration as TokioDuration},
};
use url::Url;
use uuid::Uuid;

const VIEW_PERMISSION: &str = "MARKETPLACE_VIEW";
const MANAGE_PERMISSION: &str = "MARKETPLACE_MANAGE";
const CALLBACK_ADDRESS: &str = "127.0.0.1:17654";
const CALLBACK_PATH: &str = "/marketplace/shopee/callback";
const AUTHORIZATION_TTL_MINUTES: i64 = 10;
const INITIAL_SYNC_DAYS: i64 = 15;
const SYNC_OVERLAP_MINUTES: i64 = 5;
const REFRESH_THRESHOLD_MINUTES: i64 = 5;
const ORDER_DETAIL_BATCH_SIZE: usize = 50;

#[derive(Debug, Clone)]
struct AccessContext {
    access_token: String,
    shop_id: i64,
}

pub async fn require_permission(
    pool: &PgPool,
    session_token: &str,
    permission: &str,
) -> MarketplaceResult<()> {
    if session_token.trim().is_empty()
        || !marketplace_repository::session_has_permission(pool, session_token, permission).await?
    {
        return Err(MarketplaceError::new(
            "MARKETPLACE_PERMISSION_DENIED",
            "Anda tidak memiliki izin untuk mengakses fitur Marketplace.",
        ));
    }
    Ok(())
}

pub async fn list_accounts(
    pool: &PgPool,
    session_token: &str,
) -> MarketplaceResult<Vec<MarketplaceAccountDto>> {
    require_permission(pool, session_token, VIEW_PERMISSION).await?;
    Ok(marketplace_repository::list_accounts(pool).await?)
}

pub async fn list_orders(
    pool: &PgPool,
    session_token: &str,
    input: MarketplaceOrderListInput,
) -> MarketplaceResult<MarketplaceOrderListResult> {
    require_permission(pool, session_token, VIEW_PERMISSION).await?;
    Ok(marketplace_repository::list_orders(pool, input).await?)
}

pub async fn get_order(
    pool: &PgPool,
    session_token: &str,
    id: &str,
) -> MarketplaceResult<MarketplaceOrderBundleDto> {
    require_permission(pool, session_token, VIEW_PERMISSION).await?;
    marketplace_repository::get_order_bundle(pool, id)
        .await?
        .ok_or_else(|| {
            MarketplaceError::new(
                "MARKETPLACE_ORDER_NOT_FOUND",
                "Pesanan Marketplace tidak ditemukan.",
            )
        })
}

pub async fn list_logs(
    pool: &PgPool,
    session_token: &str,
    account_id: Option<&str>,
    limit: i64,
) -> MarketplaceResult<Vec<MarketplaceIntegrationLogDto>> {
    require_permission(pool, session_token, VIEW_PERMISSION).await?;
    Ok(marketplace_repository::list_logs(pool, account_id, limit).await?)
}

pub async fn get_authorization_status(
    pool: &PgPool,
    runtime: &MarketplaceRuntimeState,
    session_token: &str,
    attempt_id: &str,
) -> MarketplaceResult<ShopeeAuthorizationAttemptDto> {
    require_permission(pool, session_token, MANAGE_PERMISSION).await?;
    runtime
        .get_attempt(attempt_id)
        .await
        .map(|attempt| attempt.to_dto())
        .ok_or_else(|| {
            MarketplaceError::new(
                "SHOPEE_AUTH_ATTEMPT_NOT_FOUND",
                "Proses otorisasi Shopee tidak ditemukan atau aplikasi telah dimulai ulang.",
            )
        })
}

pub async fn start_authorization(
    app_handle: &AppHandle,
    pool: &PgPool,
    runtime: &MarketplaceRuntimeState,
    session_token: &str,
) -> MarketplaceResult<ShopeeAuthorizationAttemptDto> {
    require_permission(pool, session_token, MANAGE_PERMISSION).await?;
    if runtime.has_pending_authorization().await {
        return Err(MarketplaceError::new(
            "SHOPEE_AUTH_ALREADY_PENDING",
            "Otorisasi Shopee lain sedang berlangsung. Selesaikan atau tunggu hingga kedaluwarsa.",
        ));
    }

    let config = ShopeeConfig::from_env()?;
    let cipher = TokenCipher::from_base64_key(&ShopeeConfig::token_encryption_key()?)?;
    let listener = TcpListener::bind(CALLBACK_ADDRESS).await.map_err(|_| {
        MarketplaceError::new(
            "SHOPEE_CALLBACK_UNAVAILABLE",
            "Port callback Shopee sedang digunakan. Tutup proses lain lalu coba kembali.",
        )
    })?;

    let attempt_id = Uuid::new_v4().to_string();
    let mut state_bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut state_bytes);
    let csrf_state = URL_SAFE_NO_PAD.encode(state_bytes);
    let expires_at = Utc::now() + Duration::minutes(AUTHORIZATION_TTL_MINUTES);
    let authorization_url = config.build_authorization_url(&csrf_state)?;
    let attempt = AuthorizationAttempt {
        attempt_id: attempt_id.clone(),
        csrf_state,
        status: "PENDING".to_string(),
        expires_at,
        message: Some("Selesaikan otorisasi pada browser yang terbuka.".to_string()),
        marketplace_account_id: None,
    };
    runtime.insert_attempt(attempt.clone()).await;

    if app_handle
        .opener()
        .open_url(authorization_url, None::<&str>)
        .is_err()
    {
        runtime
            .fail_attempt(
                &attempt_id,
                "Browser tidak dapat dibuka. Periksa aplikasi browser default Anda.".to_string(),
            )
            .await;
        return Err(MarketplaceError::new(
            "SHOPEE_BROWSER_OPEN_FAILED",
            "Browser tidak dapat dibuka. Periksa aplikasi browser default Anda.",
        ));
    }

    let spawned_attempt_id = attempt_id.clone();
    let spawned_pool = pool.clone();
    let spawned_runtime = runtime.clone();
    tauri::async_runtime::spawn(async move {
        let result = handle_authorization_callback(
            listener,
            &spawned_pool,
            &spawned_runtime,
            &spawned_attempt_id,
            config,
            cipher,
        )
        .await;
        if let Err(error) = result {
            let _ = marketplace_repository::insert_log(
                &spawned_pool,
                None,
                "AUTHORIZE",
                "FAILED",
                Some(json!({ "attempt_id": &spawned_attempt_id })),
                Some(json!({ "error_code": &error.code })),
                Some(&error.message),
            )
            .await;
            spawned_runtime
                .fail_attempt(&spawned_attempt_id, error.message)
                .await;
        }
    });

    Ok(attempt.to_dto())
}

async fn handle_authorization_callback(
    listener: TcpListener,
    pool: &PgPool,
    runtime: &MarketplaceRuntimeState,
    attempt_id: &str,
    config: ShopeeConfig,
    cipher: TokenCipher,
) -> MarketplaceResult<()> {
    let callback = timeout(TokioDuration::from_secs(10 * 60), async {
        loop {
            let (mut stream, _) = listener.accept().await.map_err(|_| {
                MarketplaceError::new(
                    "SHOPEE_CALLBACK_FAILED",
                    "Callback otorisasi Shopee tidak dapat diterima.",
                )
            })?;
            match read_callback(&mut stream, runtime, attempt_id).await {
                Ok(Some(callback)) => return Ok(callback),
                Ok(None) => continue,
                Err(error) => {
                    write_browser_response(&mut stream, false, &error.message).await;
                    return Err(error);
                }
            }
        }
    })
    .await
    .map_err(|_| {
        MarketplaceError::new(
            "SHOPEE_AUTH_EXPIRED",
            "Waktu otorisasi habis. Silakan hubungkan toko kembali.",
        )
    })??;

    let token_pair = match config_client(&config)?
        .exchange_code(&callback.code, callback.shop_id)
        .await
    {
        Ok(tokens) => tokens,
        Err(error) => return Err(error.into()),
    };
    if !token_pair.shop_id_list.is_empty() && !token_pair.shop_id_list.contains(&callback.shop_id) {
        return Err(MarketplaceError::new(
            "SHOPEE_SHOP_MISMATCH",
            "Toko pada callback tidak cocok dengan token Shopee.",
        ));
    }

    let client = config_client(&config)?;
    let shop_info = client
        .get_shop_info(&token_pair.access_token, callback.shop_id)
        .await
        .map_err(MarketplaceError::from)?;
    let account_status = if shop_info.status.eq_ignore_ascii_case("NORMAL") {
        "CONNECTED"
    } else {
        "RESTRICTED"
    };
    let access_encrypted = cipher.encrypt(
        &token_pair.access_token,
        &token_aad(callback.shop_id, "access"),
    )?;
    let refresh_encrypted = cipher.encrypt(
        &token_pair.refresh_token,
        &token_aad(callback.shop_id, "refresh"),
    )?;
    let account = marketplace_repository::upsert_account(
        pool,
        callback.shop_id,
        &shop_info.shop_name,
        &access_encrypted,
        &refresh_encrypted,
        &token_pair.expires_at,
        account_status,
    )
    .await?;

    let _ = marketplace_repository::insert_log(
        pool,
        Some(&account.id),
        "AUTHORIZE",
        "SUCCESS",
        Some(json!({ "shop_id": callback.shop_id.to_string(), "auth_type": "seller" })),
        Some(sanitize_payload(&json!({
            "shop_id": callback.shop_id.to_string(),
            "shop_name": shop_info.shop_name,
            "shop_status": shop_info.status,
            "shop_info": shop_info.raw,
        }))),
        None,
    )
    .await;

    let message = if account_status == "CONNECTED" {
        format!("Toko {} berhasil dihubungkan.", account.shop_name)
    } else {
        format!(
            "Toko {} terhubung, tetapi statusnya dibatasi oleh Shopee.",
            account.shop_name
        )
    };
    runtime
        .complete_attempt(attempt_id, account.id, message)
        .await;
    Ok(())
}

fn config_client(config: &ShopeeConfig) -> MarketplaceResult<ShopeeApiClient> {
    ShopeeApiClient::new(config.clone())
}

#[derive(Debug)]
struct OAuthCallback {
    code: String,
    shop_id: i64,
}

async fn read_callback(
    stream: &mut TcpStream,
    runtime: &MarketplaceRuntimeState,
    attempt_id: &str,
) -> MarketplaceResult<Option<OAuthCallback>> {
    let mut buffer = [0u8; 8192];
    let bytes_read = stream.read(&mut buffer).await.map_err(|_| {
        MarketplaceError::new(
            "SHOPEE_CALLBACK_INVALID",
            "Callback Shopee tidak dapat dibaca.",
        )
    })?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let Some(request_line) = request.lines().next() else {
        write_browser_response(stream, false, "Permintaan callback tidak valid.").await;
        return Ok(None);
    };
    let mut request_parts = request_line.split_whitespace();
    if request_parts.next() != Some("GET") {
        write_browser_response(stream, false, "Metode callback tidak didukung.").await;
        return Ok(None);
    }
    let Some(target) = request_parts.next() else {
        write_browser_response(stream, false, "Permintaan callback tidak valid.").await;
        return Ok(None);
    };
    let parsed = Url::parse(&format!("http://{CALLBACK_ADDRESS}{target}")).map_err(|_| {
        MarketplaceError::new(
            "SHOPEE_CALLBACK_INVALID",
            "URL callback Shopee tidak valid.",
        )
    })?;
    if parsed.path() != CALLBACK_PATH {
        write_browser_response(stream, false, "Alamat callback tidak dikenal.").await;
        return Ok(None);
    }

    let attempt = runtime.get_attempt(attempt_id).await.ok_or_else(|| {
        MarketplaceError::new(
            "SHOPEE_AUTH_ATTEMPT_NOT_FOUND",
            "Proses otorisasi Shopee sudah tidak tersedia.",
        )
    })?;
    if attempt.expires_at <= Utc::now() || attempt.status != "PENDING" {
        return Err(MarketplaceError::new(
            "SHOPEE_AUTH_EXPIRED",
            "Waktu otorisasi Shopee telah habis.",
        ));
    }

    let query: std::collections::HashMap<String, String> =
        parsed.query_pairs().into_owned().collect();
    if query.contains_key("main_account_id") && !query.contains_key("shop_id") {
        return Err(MarketplaceError::new(
            "SHOPEE_MAIN_ACCOUNT_UNSUPPORTED",
            "Main account belum didukung. Login kembali menggunakan akun toko individual.",
        ));
    }
    if query.get("state") != Some(&attempt.csrf_state) {
        return Err(MarketplaceError::new(
            "SHOPEE_INVALID_STATE",
            "Validasi keamanan otorisasi gagal. Silakan hubungkan toko kembali.",
        ));
    }
    if let Some(error) = query.get("error") {
        return Err(MarketplaceError::new(
            "SHOPEE_AUTH_REJECTED",
            format!("Shopee menolak otorisasi: {error}."),
        ));
    }
    let code = query
        .get("code")
        .filter(|value| !value.is_empty())
        .cloned()
        .ok_or_else(|| {
            MarketplaceError::new(
                "SHOPEE_CALLBACK_INVALID",
                "Kode otorisasi tidak ditemukan pada callback Shopee.",
            )
        })?;
    let shop_id = query
        .get("shop_id")
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or_else(|| {
            MarketplaceError::new(
                "SHOPEE_CALLBACK_INVALID",
                "ID toko tidak ditemukan pada callback Shopee.",
            )
        })?;
    write_browser_response(
        stream,
        true,
        "Otorisasi diterima. Kembali ke aplikasi untuk melihat hasilnya.",
    )
    .await;
    Ok(Some(OAuthCallback { code, shop_id }))
}

async fn write_browser_response(stream: &mut TcpStream, success: bool, message: &str) {
    let safe_message = html_escape(message);
    let title = if success {
        "Otorisasi Shopee diterima"
    } else {
        "Otorisasi Shopee gagal"
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{title}</title></head><body style=\"font-family:system-ui;padding:40px;max-width:640px;margin:auto\"><h1>{title}</h1><p>{safe_message}</p><p>Jendela ini boleh ditutup.</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub async fn sync_orders(
    pool: &PgPool,
    runtime: &MarketplaceRuntimeState,
    session_token: &str,
    account_id: &str,
) -> MarketplaceResult<MarketplaceSyncSummary> {
    require_permission(pool, session_token, MANAGE_PERMISSION).await?;
    if !runtime.try_start_sync(account_id).await {
        return Err(MarketplaceError::new(
            "MARKETPLACE_SYNC_IN_PROGRESS",
            "Sinkronisasi toko ini sedang berjalan.",
        ));
    }

    let result = sync_orders_inner(pool, account_id).await;
    runtime.finish_sync(account_id).await;
    if let Err(error) = &result {
        let _ = marketplace_repository::insert_log(
            pool,
            Some(account_id),
            "SYNC_ORDERS",
            "FAILED",
            Some(json!({ "marketplace_account_id": account_id })),
            Some(json!({ "error_code": &error.code })),
            Some(&error.message),
        )
        .await;
    }
    result
}

async fn sync_orders_inner(
    pool: &PgPool,
    account_id: &str,
) -> MarketplaceResult<MarketplaceSyncSummary> {
    let account = marketplace_repository::get_account_secret(pool, account_id)
        .await?
        .ok_or_else(|| {
            MarketplaceError::new(
                "MARKETPLACE_ACCOUNT_NOT_FOUND",
                "Koneksi toko Shopee tidak ditemukan.",
            )
        })?;
    match account.status.as_str() {
        "REAUTH_REQUIRED" => {
            return Err(MarketplaceError::new(
                "SHOPEE_REAUTH_REQUIRED",
                "Sesi toko Shopee berakhir. Hubungkan ulang toko sebelum sinkronisasi.",
            ))
        }
        "RESTRICTED" => {
            return Err(MarketplaceError::new(
                "SHOPEE_SHOP_RESTRICTED",
                "Toko sedang dibatasi oleh Shopee dan belum dapat disinkronkan.",
            ))
        }
        "CONNECTED" => {}
        _ => {
            return Err(MarketplaceError::new(
                "MARKETPLACE_ACCOUNT_INVALID",
                "Status koneksi toko tidak valid.",
            ))
        }
    }

    let cutoff = Utc::now();
    let initial_floor = cutoff - Duration::days(INITIAL_SYNC_DAYS);
    let (time_range_field, time_from) = match account.last_synced_at.as_deref() {
        Some(last_synced_at) => {
            let last = parse_datetime(last_synced_at, "waktu sinkronisasi terakhir")?;
            (
                "update_time",
                std::cmp::max(
                    last - Duration::minutes(SYNC_OVERLAP_MINUTES),
                    initial_floor,
                ),
            )
        }
        None => ("create_time", initial_floor),
    };
    let request_summary = json!({
        "marketplace_account_id": account_id,
        "shop_id": account.shop_id.to_string(),
        "time_range_field": time_range_field,
        "time_from": time_from.timestamp(),
        "time_to": cutoff.timestamp(),
    });

    let config = ShopeeConfig::from_env()?;
    let client = ShopeeApiClient::new(config)?;
    let cipher = TokenCipher::from_base64_key(&ShopeeConfig::token_encryption_key()?)?;
    let mut access = ensure_access_token(pool, &client, &cipher, account_id, false).await?;
    let mut cursor = String::new();
    let mut order_sns = Vec::new();
    let mut seen = HashSet::new();
    let mut list_responses = Vec::new();

    loop {
        let list_result = client
            .get_order_list(
                &access.access_token,
                access.shop_id,
                time_range_field,
                time_from.timestamp(),
                cutoff.timestamp(),
                &cursor,
            )
            .await;
        let page = match list_result {
            Ok(page) => page,
            Err(error) if error.auth_error => {
                access = ensure_access_token(pool, &client, &cipher, account_id, true).await?;
                client
                    .get_order_list(
                        &access.access_token,
                        access.shop_id,
                        time_range_field,
                        time_from.timestamp(),
                        cutoff.timestamp(),
                        &cursor,
                    )
                    .await
                    .map_err(MarketplaceError::from)?
            }
            Err(error) => return Err(error.into()),
        };
        list_responses.push(sanitize_payload(&page.raw));
        for order_sn in page.order_sns {
            if seen.insert(order_sn.clone()) {
                order_sns.push(order_sn);
            }
        }
        if !page.more {
            break;
        }
        if page.next_cursor.is_empty() || page.next_cursor == cursor {
            return Err(MarketplaceError::new(
                "SHOPEE_INVALID_CURSOR",
                "Shopee mengembalikan cursor pagination yang tidak valid.",
            ));
        }
        cursor = page.next_cursor;
    }

    let mut order_payloads = Vec::with_capacity(order_sns.len());
    let mut detail_responses = Vec::new();
    for chunk in order_detail_batches(&order_sns) {
        let detail_result = client
            .get_order_detail(&access.access_token, access.shop_id, chunk)
            .await;
        let detail = match detail_result {
            Ok(detail) => detail,
            Err(error) if error.auth_error => {
                access = ensure_access_token(pool, &client, &cipher, account_id, true).await?;
                client
                    .get_order_detail(&access.access_token, access.shop_id, chunk)
                    .await
                    .map_err(MarketplaceError::from)?
            }
            Err(error) => return Err(error.into()),
        };
        if detail.orders.len() != chunk.len() {
            return Err(MarketplaceError::new(
                "SHOPEE_INCOMPLETE_ORDER_DETAIL",
                "Shopee tidak mengembalikan seluruh detail pesanan. Tidak ada data yang disimpan.",
            ));
        }
        detail_responses.push(sanitize_payload(&detail.raw));
        order_payloads.extend(detail.orders);
    }

    let parsed_orders = order_payloads
        .into_iter()
        .map(parse_order)
        .collect::<MarketplaceResult<Vec<_>>>();
    let orders = match parsed_orders {
        Ok(orders) => orders,
        Err(error) => {
            let _ = marketplace_repository::insert_log(
                pool,
                Some(account_id),
                "SYNC_ORDER_PARSE",
                "FAILED",
                Some(request_summary.clone()),
                Some(json!({
                    "order_detail_batches": detail_responses,
                    "error_code": &error.code,
                })),
                Some(&error.message),
            )
            .await;
            return Err(error);
        }
    };
    let (upserted_orders, upserted_items) =
        marketplace_repository::persist_orders(pool, account_id, &orders, &cutoff.to_rfc3339())
            .await?;

    let _ = marketplace_repository::insert_log(
        pool,
        Some(account_id),
        "SYNC_ORDERS",
        "SUCCESS",
        Some(request_summary),
        Some(json!({
            "order_list_pages": list_responses,
            "order_detail_batches": detail_responses,
            "fetched_orders": order_sns.len(),
            "upserted_orders": upserted_orders,
            "upserted_items": upserted_items,
        })),
        None,
    )
    .await;

    Ok(MarketplaceSyncSummary {
        marketplace_account_id: account_id.to_string(),
        fetched_orders: order_sns.len(),
        upserted_orders,
        upserted_items,
        synced_at: cutoff.to_rfc3339(),
    })
}

async fn ensure_access_token(
    pool: &PgPool,
    client: &ShopeeApiClient,
    cipher: &TokenCipher,
    account_id: &str,
    force_refresh: bool,
) -> MarketplaceResult<AccessContext> {
    let mut transaction = pool.begin().await?;
    let account = marketplace_repository::lock_account_secret(&mut transaction, account_id)
        .await?
        .ok_or_else(|| {
            MarketplaceError::new(
                "MARKETPLACE_ACCOUNT_NOT_FOUND",
                "Koneksi toko Shopee tidak ditemukan.",
            )
        })?;
    if account.status == "REAUTH_REQUIRED" {
        return Err(MarketplaceError::new(
            "SHOPEE_REAUTH_REQUIRED",
            "Sesi toko Shopee berakhir. Hubungkan ulang toko.",
        ));
    }
    if account.status == "RESTRICTED" {
        return Err(MarketplaceError::new(
            "SHOPEE_SHOP_RESTRICTED",
            "Toko sedang dibatasi oleh Shopee.",
        ));
    }

    let expires_at = parse_datetime(&account.token_expires_at, "masa berlaku token")?;
    if !force_refresh && expires_at > Utc::now() + Duration::minutes(REFRESH_THRESHOLD_MINUTES) {
        let access_token = cipher.decrypt(
            &account.access_token_encrypted,
            &token_aad(account.shop_id, "access"),
        )?;
        transaction.commit().await?;
        return Ok(AccessContext {
            access_token,
            shop_id: account.shop_id,
        });
    }

    let refresh_token = cipher.decrypt(
        &account.refresh_token_encrypted,
        &token_aad(account.shop_id, "refresh"),
    )?;
    let refreshed = match client
        .refresh_access_token(&refresh_token, account.shop_id)
        .await
    {
        Ok(tokens) => tokens,
        Err(error) => {
            transaction.rollback().await?;
            if error.auth_error {
                marketplace_repository::update_account_status(pool, account_id, "REAUTH_REQUIRED")
                    .await?;
            }
            let public_error = MarketplaceError::from(error);
            let _ = marketplace_repository::insert_log(
                pool,
                Some(account_id),
                "REFRESH_TOKEN",
                "FAILED",
                Some(json!({ "shop_id": account.shop_id.to_string() })),
                None,
                Some(&public_error.message),
            )
            .await;
            return Err(if public_error.code == "SHOPEE_AUTH_ERROR" {
                MarketplaceError::new(
                    "SHOPEE_REAUTH_REQUIRED",
                    "Token Shopee tidak dapat diperbarui. Hubungkan ulang toko.",
                )
            } else {
                public_error
            });
        }
    };
    let encrypted_access = cipher.encrypt(
        &refreshed.access_token,
        &token_aad(account.shop_id, "access"),
    )?;
    let encrypted_refresh = cipher.encrypt(
        &refreshed.refresh_token,
        &token_aad(account.shop_id, "refresh"),
    )?;
    marketplace_repository::update_locked_tokens(
        &mut transaction,
        account_id,
        &encrypted_access,
        &encrypted_refresh,
        &refreshed.expires_at,
    )
    .await?;
    transaction.commit().await?;
    let _ = marketplace_repository::insert_log(
        pool,
        Some(account_id),
        "REFRESH_TOKEN",
        "SUCCESS",
        Some(json!({ "shop_id": account.shop_id.to_string() })),
        Some(json!({ "expires_at": refreshed.expires_at })),
        None,
    )
    .await;

    Ok(AccessContext {
        access_token: refreshed.access_token,
        shop_id: account.shop_id,
    })
}

pub fn map_internal_status(marketplace_status: &str) -> MarketplaceResult<&'static str> {
    match marketplace_status {
        "UNPAID" => Ok("WAITING_PAYMENT"),
        "READY_TO_SHIP" | "PROCESSED" | "INVOICE_PENDING" => Ok("READY_TO_PROCESS"),
        "SHIPPED" => Ok("SHIPPED"),
        "COMPLETED" => Ok("COMPLETED"),
        "IN_CANCEL" | "CANCELLED" => Ok("CANCELLED"),
        _ => Err(MarketplaceError::new(
            "SHOPEE_UNKNOWN_ORDER_STATUS",
            format!(
                "Status pesanan Shopee '{marketplace_status}' belum dikenali. Sinkronisasi dibatalkan agar status tidak salah."
            ),
        )),
    }
}

pub fn parse_order(raw: Value) -> MarketplaceResult<MarketplaceOrderUpsert> {
    let order_sn = value_string(&raw, "order_sn").ok_or_else(|| invalid_order("order_sn"))?;
    let marketplace_status =
        value_string(&raw, "order_status").ok_or_else(|| invalid_order("order_status"))?;
    let internal_status = map_internal_status(&marketplace_status)?.to_string();
    let currency = value_string(&raw, "currency").unwrap_or_else(|| "IDR".to_string());
    let create_time = value_i64(&raw, "create_time").ok_or_else(|| invalid_order("create_time"))?;
    let update_time = value_i64(&raw, "update_time").unwrap_or(create_time);
    let item_values = raw
        .get("item_list")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_order("item_list"))?;
    let mut items = Vec::with_capacity(item_values.len());
    for item in item_values {
        let item_id = value_i64(item, "item_id").ok_or_else(|| invalid_order("item_id"))?;
        let model_id = value_i64(item, "model_id").unwrap_or(0);
        let item_name =
            value_string(item, "item_name").ok_or_else(|| invalid_order("item_name"))?;
        let sku = value_string(item, "model_sku")
            .filter(|value| !value.trim().is_empty())
            .or_else(|| value_string(item, "item_sku").filter(|value| !value.trim().is_empty()));
        let quantity = value_i64(item, "model_quantity_purchased")
            .or_else(|| value_i64(item, "quantity"))
            .unwrap_or(0);
        let quantity = i32::try_from(quantity).map_err(|_| invalid_order("quantity"))?;
        items.push(MarketplaceOrderItemUpsert {
            item_id,
            model_id,
            item_name,
            sku,
            quantity,
            original_price: value_decimal_string(item, "model_original_price")
                .or_else(|| value_decimal_string(item, "original_price")),
            discounted_price: value_decimal_string(item, "model_discounted_price")
                .or_else(|| value_decimal_string(item, "discounted_price")),
            raw_payload: item.clone(),
        });
    }

    Ok(MarketplaceOrderUpsert {
        order_sn,
        buyer_username: value_string(&raw, "buyer_username"),
        marketplace_status,
        internal_status,
        total_amount: value_decimal_string(&raw, "total_amount"),
        currency,
        order_created_at: timestamp_to_rfc3339(create_time, "create_time")?,
        order_updated_at: timestamp_to_rfc3339(update_time, "update_time")?,
        raw_payload: raw,
        items,
    })
}

fn value_string(value: &Value, field: &str) -> Option<String> {
    match value.get(field)? {
        Value::String(value) if !value.is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn value_i64(value: &Value, field: &str) -> Option<i64> {
    match value.get(field)? {
        Value::Number(value) => value.as_i64(),
        Value::String(value) => value.parse().ok(),
        _ => None,
    }
}

fn value_decimal_string(value: &Value, field: &str) -> Option<String> {
    match value.get(field)? {
        Value::Number(value) => Some(value.to_string()),
        Value::String(value) if is_decimal(value) => Some(value.clone()),
        _ => None,
    }
}

fn is_decimal(value: &str) -> bool {
    let unsigned = value
        .strip_prefix('-')
        .or_else(|| value.strip_prefix('+'))
        .unwrap_or(value);
    let mut parts = unsigned.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    !integer.is_empty()
        && integer.bytes().all(|byte| byte.is_ascii_digit())
        && fraction
            .map(|digits| !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit()))
            .unwrap_or(true)
        && parts.next().is_none()
}

fn parse_datetime(value: &str, label: &str) -> MarketplaceResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| {
            MarketplaceError::new(
                "MARKETPLACE_INVALID_TIMESTAMP",
                format!("Format {label} tidak valid."),
            )
        })
}

fn timestamp_to_rfc3339(timestamp: i64, field: &str) -> MarketplaceResult<String> {
    Utc.timestamp_opt(timestamp, 0)
        .single()
        .map(|value| value.to_rfc3339())
        .ok_or_else(|| invalid_order(field))
}

fn invalid_order(field: &str) -> MarketplaceError {
    MarketplaceError::new(
        "SHOPEE_INVALID_ORDER_DETAIL",
        format!("Detail pesanan Shopee tidak memiliki field {field} yang valid."),
    )
}

fn order_detail_batches(order_sns: &[String]) -> impl Iterator<Item = &[String]> {
    order_sns.chunks(ORDER_DETAIL_BATCH_SIZE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_every_supported_status_and_rejects_unknown_status() {
        assert_eq!(map_internal_status("UNPAID").unwrap(), "WAITING_PAYMENT");
        for status in ["READY_TO_SHIP", "PROCESSED", "INVOICE_PENDING"] {
            assert_eq!(map_internal_status(status).unwrap(), "READY_TO_PROCESS");
        }
        assert_eq!(map_internal_status("SHIPPED").unwrap(), "SHIPPED");
        assert_eq!(map_internal_status("COMPLETED").unwrap(), "COMPLETED");
        for status in ["IN_CANCEL", "CANCELLED"] {
            assert_eq!(map_internal_status(status).unwrap(), "CANCELLED");
        }
        assert!(map_internal_status("NEW_STATUS").is_err());
    }

    #[test]
    fn parses_order_items_and_prefers_model_sku() {
        let parsed = parse_order(json!({
            "order_sn": "ORDER-1",
            "buyer_username": "buyer",
            "order_status": "READY_TO_SHIP",
            "total_amount": "12500.50",
            "currency": "IDR",
            "create_time": 1_700_000_000,
            "update_time": 1_700_000_100,
            "item_list": [{
                "item_id": 9007199254740991_i64,
                "model_id": "44",
                "item_name": "Produk",
                "item_sku": "ITEM-SKU",
                "model_sku": "MODEL-SKU",
                "model_quantity_purchased": 2,
                "model_original_price": "7000",
                "model_discounted_price": 6250.25
            }]
        }))
        .unwrap();

        assert_eq!(parsed.internal_status, "READY_TO_PROCESS");
        assert_eq!(parsed.total_amount.as_deref(), Some("12500.50"));
        assert_eq!(parsed.items.len(), 1);
        assert_eq!(parsed.items[0].sku.as_deref(), Some("MODEL-SKU"));
        assert_eq!(parsed.items[0].quantity, 2);
    }

    #[test]
    fn splits_order_details_into_batches_of_fifty() {
        let order_sns = (0..121)
            .map(|index| format!("ORDER-{index}"))
            .collect::<Vec<_>>();
        let sizes = order_detail_batches(&order_sns)
            .map(<[String]>::len)
            .collect::<Vec<_>>();

        assert_eq!(sizes, vec![50, 50, 21]);
    }
}
