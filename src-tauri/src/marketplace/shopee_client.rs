use super::{MarketplaceError, MarketplaceResult};
use chrono::{Duration, TimeZone, Utc};
use hmac::{Hmac, Mac};
use reqwest::{Client, Method, StatusCode};
use serde_json::{json, Map, Value};
use sha2::Sha256;
use std::{env, fmt::Display, time::Duration as StdDuration};
use tokio::time::sleep;
use url::Url;

type HmacSha256 = Hmac<Sha256>;

const MAX_RETRIES: usize = 2;
const ACCESS_TOKEN_FALLBACK_SECONDS: i64 = 4 * 60 * 60;

#[derive(Clone)]
pub struct ShopeeConfig {
    pub partner_id: i64,
    partner_key: String,
    pub redirect_uri: String,
    auth_url: String,
    api_base_url: String,
}

impl ShopeeConfig {
    pub fn from_env() -> MarketplaceResult<Self> {
        let partner_id = env::var("SHOPEE_PARTNER_ID")
            .map_err(|_| MarketplaceError::configuration("SHOPEE_PARTNER_ID belum dikonfigurasi."))?
            .trim()
            .parse::<i64>()
            .map_err(|_| {
                MarketplaceError::configuration("SHOPEE_PARTNER_ID harus berupa angka.")
            })?;
        let partner_key = env::var("SHOPEE_PARTNER_KEY").map_err(|_| {
            MarketplaceError::configuration("SHOPEE_PARTNER_KEY belum dikonfigurasi.")
        })?;
        if partner_key.trim().is_empty() {
            return Err(MarketplaceError::configuration(
                "SHOPEE_PARTNER_KEY tidak boleh kosong.",
            ));
        }

        let redirect_uri = env::var("SHOPEE_REDIRECT_URI")
            .unwrap_or_else(|_| "http://127.0.0.1:17654/marketplace/shopee/callback".to_string());
        validate_loopback_redirect(&redirect_uri)?;

        let environment = env::var("SHOPEE_ENVIRONMENT")
            .unwrap_or_else(|_| "sandbox".to_string())
            .trim()
            .to_ascii_lowercase();
        let (auth_url, api_base_url) = match environment.as_str() {
            "production" | "live" => (
                "https://open.shopee.com/auth".to_string(),
                "https://partner.shopeemobile.com".to_string(),
            ),
            "sandbox" | "test" => (
                "https://open.sandbox.test-stable.shopee.com/auth".to_string(),
                "https://partner.test-stable.shopeemobile.com".to_string(),
            ),
            _ => {
                return Err(MarketplaceError::configuration(
                    "SHOPEE_ENVIRONMENT harus bernilai sandbox atau production.",
                ))
            }
        };

        Ok(Self {
            partner_id,
            partner_key,
            redirect_uri,
            auth_url,
            api_base_url,
        })
    }

    pub fn token_encryption_key() -> MarketplaceResult<String> {
        env::var("SHOPEE_TOKEN_ENCRYPTION_KEY").map_err(|_| {
            MarketplaceError::configuration("SHOPEE_TOKEN_ENCRYPTION_KEY belum dikonfigurasi.")
        })
    }

    pub fn build_authorization_url(&self, state: &str) -> MarketplaceResult<String> {
        let mut url = Url::parse(&self.auth_url)
            .map_err(|_| MarketplaceError::configuration("URL otorisasi Shopee tidak valid."))?;
        url.query_pairs_mut()
            .append_pair("partner_id", &self.partner_id.to_string())
            .append_pair("auth_type", "seller")
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("state", state);
        Ok(url.to_string())
    }
}

fn validate_loopback_redirect(redirect_uri: &str) -> MarketplaceResult<()> {
    let parsed = Url::parse(redirect_uri)
        .map_err(|_| MarketplaceError::configuration("SHOPEE_REDIRECT_URI tidak valid."))?;
    if parsed.scheme() != "http"
        || parsed.host_str() != Some("127.0.0.1")
        || parsed.port() != Some(17654)
        || parsed.path() != "/marketplace/shopee/callback"
    {
        return Err(MarketplaceError::configuration(
            "SHOPEE_REDIRECT_URI harus tepat http://127.0.0.1:17654/marketplace/shopee/callback.",
        ));
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct ShopeeApiError {
    pub code: String,
    pub message: String,
    pub request_id: Option<String>,
    pub auth_error: bool,
}

impl Display for ShopeeApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.request_id {
            Some(request_id) => write!(
                formatter,
                "Shopee {}: {} (request_id: {})",
                self.code, self.message, request_id
            ),
            None => write!(formatter, "Shopee {}: {}", self.code, self.message),
        }
    }
}

impl std::error::Error for ShopeeApiError {}

impl From<ShopeeApiError> for MarketplaceError {
    fn from(error: ShopeeApiError) -> Self {
        let code = if error.auth_error {
            "SHOPEE_AUTH_ERROR"
        } else if error.code.contains("rate_limit") || error.code == "error_limit" {
            "SHOPEE_RATE_LIMIT"
        } else if error.code == "error_partner_key_expired" {
            "SHOPEE_PARTNER_KEY_EXPIRED"
        } else {
            "SHOPEE_API_ERROR"
        };
        MarketplaceError::new(code, error.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct ShopeeTokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: String,
    pub shop_id_list: Vec<i64>,
}

#[derive(Debug, Clone)]
pub struct ShopeeShopInfo {
    pub shop_name: String,
    pub status: String,
    pub raw: Value,
}

#[derive(Debug, Clone)]
pub struct ShopeeOrderListPage {
    pub order_sns: Vec<String>,
    pub more: bool,
    pub next_cursor: String,
    pub raw: Value,
}

#[derive(Debug, Clone)]
pub struct ShopeeOrderDetailPage {
    pub orders: Vec<Value>,
    pub raw: Value,
}

#[derive(Clone)]
pub struct ShopeeApiClient {
    config: ShopeeConfig,
    http: Client,
}

impl ShopeeApiClient {
    pub fn new(config: ShopeeConfig) -> MarketplaceResult<Self> {
        let http = Client::builder()
            .timeout(StdDuration::from_secs(30))
            .build()
            .map_err(|_| MarketplaceError::configuration("HTTP client Shopee gagal dibuat."))?;
        Ok(Self { config, http })
    }

    pub async fn exchange_code(
        &self,
        code: &str,
        shop_id: i64,
    ) -> Result<ShopeeTokenPair, ShopeeApiError> {
        let path = "/api/v2/auth/token/get";
        let body = json!({
            "code": code,
            "shop_id": shop_id,
            "partner_id": self.config.partner_id,
        });
        let value = self.public_post(path, body).await?;
        parse_token_response(value)
    }

    pub async fn refresh_access_token(
        &self,
        refresh_token: &str,
        shop_id: i64,
    ) -> Result<ShopeeTokenPair, ShopeeApiError> {
        let path = "/api/v2/auth/access_token/get";
        let body = json!({
            "refresh_token": refresh_token,
            "shop_id": shop_id,
            "partner_id": self.config.partner_id,
        });
        let value = self.public_post(path, body).await?;
        parse_token_response(value)
    }

    pub async fn get_shop_info(
        &self,
        access_token: &str,
        shop_id: i64,
    ) -> Result<ShopeeShopInfo, ShopeeApiError> {
        let value = self
            .shop_get(
                "/api/v2/shop/get_shop_info",
                access_token,
                shop_id,
                Vec::new(),
            )
            .await?;
        let response = value.get("response").unwrap_or(&value);
        let shop_name = required_string(response, "shop_name")?;
        let status = required_string(response, "status")?;
        Ok(ShopeeShopInfo {
            shop_name,
            status,
            raw: value,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn get_order_list(
        &self,
        access_token: &str,
        shop_id: i64,
        time_range_field: &str,
        time_from: i64,
        time_to: i64,
        cursor: &str,
    ) -> Result<ShopeeOrderListPage, ShopeeApiError> {
        let params = vec![
            ("time_range_field".to_string(), time_range_field.to_string()),
            ("time_from".to_string(), time_from.to_string()),
            ("time_to".to_string(), time_to.to_string()),
            ("page_size".to_string(), "100".to_string()),
            ("cursor".to_string(), cursor.to_string()),
            (
                "response_optional_fields".to_string(),
                "order_status".to_string(),
            ),
            (
                "request_order_status_pending".to_string(),
                "false".to_string(),
            ),
        ];
        let raw = self
            .shop_get(
                "/api/v2/order/get_order_list",
                access_token,
                shop_id,
                params,
            )
            .await?;
        let response = raw
            .get("response")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                parse_error(
                    "SHOPEE_INVALID_RESPONSE",
                    "Response daftar order tidak lengkap.",
                    &raw,
                )
            })?;
        let order_sns = response
            .get("order_list")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                parse_error(
                    "SHOPEE_INVALID_RESPONSE",
                    "Daftar order Shopee tidak ditemukan.",
                    &raw,
                )
            })?
            .iter()
            .filter_map(|order| order.get("order_sn").and_then(Value::as_str))
            .map(ToOwned::to_owned)
            .collect();

        Ok(ShopeeOrderListPage {
            order_sns,
            more: response
                .get("more")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            next_cursor: response
                .get("next_cursor")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            raw,
        })
    }

    pub async fn get_order_detail(
        &self,
        access_token: &str,
        shop_id: i64,
        order_sns: &[String],
    ) -> Result<ShopeeOrderDetailPage, ShopeeApiError> {
        let params = vec![
            ("order_sn_list".to_string(), order_sns.join(",")),
            (
                "response_optional_fields".to_string(),
                "buyer_username,total_amount,item_list".to_string(),
            ),
            (
                "request_order_status_pending".to_string(),
                "false".to_string(),
            ),
        ];
        let raw = self
            .shop_get(
                "/api/v2/order/get_order_detail",
                access_token,
                shop_id,
                params,
            )
            .await?;
        let orders = raw
            .get("response")
            .and_then(|response| response.get("order_list"))
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| {
                parse_error(
                    "SHOPEE_INVALID_RESPONSE",
                    "Detail order Shopee tidak lengkap.",
                    &raw,
                )
            })?;
        Ok(ShopeeOrderDetailPage { orders, raw })
    }

    async fn public_post(&self, path: &str, body: Value) -> Result<Value, ShopeeApiError> {
        for attempt in 0..=MAX_RETRIES {
            let timestamp = Utc::now().timestamp();
            let sign = sign_public(
                self.config.partner_id,
                path,
                timestamp,
                &self.config.partner_key,
            );
            let response = self
                .http
                .request(
                    Method::POST,
                    format!("{}{}", self.config.api_base_url, path),
                )
                .query(&[
                    ("partner_id", self.config.partner_id.to_string()),
                    ("timestamp", timestamp.to_string()),
                    ("sign", sign),
                ])
                .json(&body)
                .send()
                .await;

            match parse_http_response(response).await {
                Ok(value) => match response_error(&value) {
                    Some(error) if is_retryable_api_error(&error.code) && attempt < MAX_RETRIES => {
                        retry_delay(attempt).await;
                    }
                    Some(error) => return Err(error),
                    None => return Ok(value),
                },
                Err(error) if is_retryable_api_error(&error.code) && attempt < MAX_RETRIES => {
                    retry_delay(attempt).await;
                }
                Err(error) => return Err(error),
            }
        }
        unreachable!()
    }

    async fn shop_get(
        &self,
        path: &str,
        access_token: &str,
        shop_id: i64,
        params: Vec<(String, String)>,
    ) -> Result<Value, ShopeeApiError> {
        for attempt in 0..=MAX_RETRIES {
            let timestamp = Utc::now().timestamp();
            let sign = sign_shop(
                self.config.partner_id,
                path,
                timestamp,
                access_token,
                shop_id,
                &self.config.partner_key,
            );
            let mut query = params.clone();
            query.extend([
                ("partner_id".to_string(), self.config.partner_id.to_string()),
                ("timestamp".to_string(), timestamp.to_string()),
                ("access_token".to_string(), access_token.to_string()),
                ("shop_id".to_string(), shop_id.to_string()),
                ("sign".to_string(), sign),
            ]);
            let response = self
                .http
                .request(Method::GET, format!("{}{}", self.config.api_base_url, path))
                .query(&query)
                .send()
                .await;

            match parse_http_response(response).await {
                Ok(value) => match response_error(&value) {
                    Some(error) if is_retryable_api_error(&error.code) && attempt < MAX_RETRIES => {
                        retry_delay(attempt).await;
                    }
                    Some(error) => return Err(error),
                    None => return Ok(value),
                },
                Err(error) if is_retryable_api_error(&error.code) && attempt < MAX_RETRIES => {
                    retry_delay(attempt).await;
                }
                Err(error) => return Err(error),
            }
        }
        unreachable!()
    }
}

async fn parse_http_response(
    response: Result<reqwest::Response, reqwest::Error>,
) -> Result<Value, ShopeeApiError> {
    let response = response.map_err(|_| ShopeeApiError {
        code: "SHOPEE_NETWORK_ERROR".to_string(),
        message: "Tidak dapat menghubungi layanan Shopee.".to_string(),
        request_id: None,
        auth_error: false,
    })?;
    let status = response.status();
    if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        return Err(ShopeeApiError {
            code: if status == StatusCode::TOO_MANY_REQUESTS {
                "error_rate_limit".to_string()
            } else {
                "SHOPEE_NETWORK_ERROR".to_string()
            },
            message: format!("Shopee mengembalikan HTTP {status}."),
            request_id: None,
            auth_error: false,
        });
    }
    if !status.is_success() {
        let authentication_error =
            matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN);
        return Err(ShopeeApiError {
            code: if authentication_error {
                "error_access_token_http".to_string()
            } else {
                "SHOPEE_HTTP_ERROR".to_string()
            },
            message: format!("Shopee mengembalikan HTTP {status}."),
            request_id: None,
            auth_error: authentication_error,
        });
    }
    response.json::<Value>().await.map_err(|_| ShopeeApiError {
        code: "SHOPEE_INVALID_RESPONSE".to_string(),
        message: "Response Shopee tidak dapat dibaca.".to_string(),
        request_id: None,
        auth_error: false,
    })
}

fn response_error(value: &Value) -> Option<ShopeeApiError> {
    let code = value
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if code.is_empty() {
        return None;
    }
    Some(parse_error(
        code,
        value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Shopee menolak permintaan."),
        value,
    ))
}

fn parse_error(code: &str, message: &str, value: &Value) -> ShopeeApiError {
    let normalized = code.to_ascii_lowercase();
    ShopeeApiError {
        code: code.to_string(),
        message: message.to_string(),
        request_id: value
            .get("request_id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        auth_error: normalized.contains("auth")
            || normalized.contains("access_token")
            || normalized.contains("acceess_token")
            || normalized.contains("refresh_token")
            || normalized.contains("invalid_token")
            || normalized == "shop_no_linked"
            || normalized == "partner_shop_no_link",
    }
}

fn parse_token_response(value: Value) -> Result<ShopeeTokenPair, ShopeeApiError> {
    let access_token = required_string(&value, "access_token")?;
    let refresh_token = required_string(&value, "refresh_token")?;
    let expire_in = value
        .get("expire_in")
        .and_then(Value::as_i64)
        .unwrap_or(ACCESS_TOKEN_FALLBACK_SECONDS);
    let now = Utc::now();
    let expires_at = if expire_in > now.timestamp() {
        Utc.timestamp_opt(expire_in, 0)
            .single()
            .unwrap_or(now + Duration::hours(4))
    } else {
        now + Duration::seconds(expire_in.max(60))
    };
    let shop_id_list = value
        .get("shop_id_list")
        .and_then(Value::as_array)
        .map(|ids| ids.iter().filter_map(Value::as_i64).collect())
        .unwrap_or_default();

    Ok(ShopeeTokenPair {
        access_token,
        refresh_token,
        expires_at: expires_at.to_rfc3339(),
        shop_id_list,
    })
}

fn required_string(value: &Value, field: &str) -> Result<String, ShopeeApiError> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|field_value| !field_value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            parse_error(
                "SHOPEE_INVALID_RESPONSE",
                &format!("Field {field} tidak tersedia pada response Shopee."),
                value,
            )
        })
}

fn is_retryable_api_error(code: &str) -> bool {
    matches!(
        code,
        "SHOPEE_NETWORK_ERROR"
            | "error_rate_limit"
            | "error_limit"
            | "error_server"
            | "error_network"
    )
}

async fn retry_delay(attempt: usize) {
    let millis = if attempt == 0 { 500 } else { 1_500 };
    sleep(StdDuration::from_millis(millis)).await;
}

pub fn sign_public(partner_id: i64, path: &str, timestamp: i64, partner_key: &str) -> String {
    sign(&format!("{partner_id}{path}{timestamp}"), partner_key)
}

pub fn sign_shop(
    partner_id: i64,
    path: &str,
    timestamp: i64,
    access_token: &str,
    shop_id: i64,
    partner_key: &str,
) -> String {
    sign(
        &format!("{partner_id}{path}{timestamp}{access_token}{shop_id}"),
        partner_key,
    )
}

fn sign(base: &str, partner_key: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(partner_key.as_bytes())
        .expect("HMAC accepts partner keys of any size");
    mac.update(base.as_bytes());
    hex_lower(&mac.finalize().into_bytes())
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn sanitize_payload(value: &Value) -> Value {
    match value {
        Value::Object(object) => {
            let mut sanitized = Map::new();
            for (key, child) in object {
                let normalized = key.to_ascii_lowercase();
                if normalized.contains("token")
                    || normalized == "sign"
                    || normalized.contains("partner_key")
                    || normalized == "code"
                {
                    sanitized.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    sanitized.insert(key.clone(), sanitize_payload(child));
                }
            }
            Value::Object(sanitized)
        }
        Value::Array(values) => Value::Array(values.iter().map(sanitize_payload).collect()),
        _ => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::DateTime;
    use std::sync::{Arc, Mutex};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    async fn mock_http_server(
        responses: Vec<(u16, &'static str)>,
    ) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured_requests = Arc::clone(&requests);
        tokio::spawn(async move {
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buffer = vec![0u8; 16 * 1024];
                let bytes_read = stream.read(&mut buffer).await.unwrap();
                captured_requests
                    .lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&buffer[..bytes_read]).into_owned());
                let reason = if status == 200 {
                    "OK"
                } else {
                    "Too Many Requests"
                };
                let response = format!(
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(response.as_bytes()).await.unwrap();
            }
        });
        (format!("http://{address}"), requests)
    }

    fn test_client(api_base_url: String) -> ShopeeApiClient {
        ShopeeApiClient::new(ShopeeConfig {
            partner_id: 123,
            partner_key: "partner-key".to_string(),
            redirect_uri: "http://127.0.0.1:17654/marketplace/shopee/callback".to_string(),
            auth_url: "http://127.0.0.1/auth".to_string(),
            api_base_url,
        })
        .unwrap()
    }

    #[test]
    fn signature_is_lowercase_and_deterministic() {
        let signature = sign_public(
            123456,
            "/api/v2/auth/token/get",
            1_700_000_000,
            "partner-secret",
        );
        assert_eq!(signature.len(), 64);
        assert_eq!(
            signature,
            sign_public(
                123456,
                "/api/v2/auth/token/get",
                1_700_000_000,
                "partner-secret"
            )
        );
        assert!(signature
            .chars()
            .all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn shop_signature_changes_with_token_and_shop() {
        let first = sign_shop(1, "/path", 2, "token-a", 3, "key");
        let second = sign_shop(1, "/path", 2, "token-b", 3, "key");
        let third = sign_shop(1, "/path", 2, "token-a", 4, "key");
        assert_ne!(first, second);
        assert_ne!(first, third);
    }

    #[test]
    fn sensitive_payload_fields_are_redacted_recursively() {
        let value = json!({
            "access_token": "access",
            "nested": {"refresh_token": "refresh", "sign": "signature", "safe": 42},
            "code": "oauth-code"
        });
        let sanitized = sanitize_payload(&value);
        let serialized = sanitized.to_string();
        assert!(!serialized.contains("\"access\""));
        assert!(!serialized.contains("\"refresh\""));
        assert!(!serialized.contains("\"signature\""));
        assert!(!serialized.contains("oauth-code"));
        assert_eq!(sanitized["access_token"], "[REDACTED]");
        assert_eq!(sanitized["nested"]["refresh_token"], "[REDACTED]");
        assert_eq!(sanitized["nested"]["safe"], 42);
    }

    #[test]
    fn parses_token_expiry_and_rotated_refresh_token() {
        let parsed = parse_token_response(json!({
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "expire_in": 3600,
            "shop_id_list": [123]
        }))
        .unwrap();
        let expires_at = DateTime::parse_from_rfc3339(&parsed.expires_at).unwrap();

        assert_eq!(parsed.access_token, "new-access");
        assert_eq!(parsed.refresh_token, "new-refresh");
        assert_eq!(parsed.shop_id_list, vec![123]);
        assert!(expires_at > Utc::now() + Duration::minutes(59));
    }

    #[test]
    fn refresh_token_errors_are_classified_as_authentication_errors() {
        let error = response_error(&json!({
            "error": "error_invalid_refresh_token",
            "message": "invalid",
            "request_id": "request-1"
        }))
        .unwrap();
        assert!(error.auth_error);
        assert_eq!(error.request_id.as_deref(), Some("request-1"));
    }

    #[tokio::test]
    async fn order_list_uses_cursor_and_maximum_page_size() {
        let (base_url, requests) = mock_http_server(vec![(
            200,
            r#"{"error":"","response":{"more":true,"next_cursor":"next","order_list":[{"order_sn":"ORDER-1"}]},"request_id":"request-1"}"#,
        )])
        .await;
        let page = test_client(base_url)
            .get_order_list("access", 456, "update_time", 10, 20, "cursor-1")
            .await
            .unwrap();

        assert_eq!(page.order_sns, vec!["ORDER-1"]);
        assert!(page.more);
        assert_eq!(page.next_cursor, "next");
        let request = requests.lock().unwrap()[0].clone();
        assert!(request.contains("page_size=100"));
        assert!(request.contains("cursor=cursor-1"));
        assert!(request.contains("time_range_field=update_time"));
    }

    #[tokio::test]
    async fn rate_limit_is_retried_and_nested_shop_response_is_parsed() {
        let (base_url, requests) = mock_http_server(vec![
            (429, r#"{"error":"error_rate_limit"}"#),
            (
                200,
                r#"{"error":"","response":{"shop_name":"Toko Uji","status":"NORMAL"},"request_id":"request-2"}"#,
            ),
        ])
        .await;
        let shop = test_client(base_url)
            .get_shop_info("access", 456)
            .await
            .unwrap();

        assert_eq!(shop.shop_name, "Toko Uji");
        assert_eq!(shop.status, "NORMAL");
        assert_eq!(requests.lock().unwrap().len(), 2);
    }
}
