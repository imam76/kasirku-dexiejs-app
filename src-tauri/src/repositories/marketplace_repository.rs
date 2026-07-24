use crate::models::marketplace::{
    MarketplaceAccountDto, MarketplaceAccountSecretDto, MarketplaceIntegrationLogDto,
    MarketplaceOrderBundleDto, MarketplaceOrderDto, MarketplaceOrderItemDto,
    MarketplaceOrderListInput, MarketplaceOrderListResult, MarketplaceOrderUpsert,
};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

const MARKETPLACE: &str = "SHOPEE";

pub async fn session_has_permission(
    pool: &PgPool,
    token: &str,
    permission: &str,
) -> Result<bool, sqlx::Error> {
    let allowed = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM server_auth_sessions session
          LEFT JOIN auth_users app_user
            ON app_user.id = session.user_id
           AND app_user.deleted_at IS NULL
           AND app_user.is_active = TRUE
          LEFT JOIN employees employee
            ON employee.id = session.employee_id
           AND employee.deleted_at IS NULL
           AND employee.is_active = TRUE
          LEFT JOIN roles actor_role
            ON actor_role.id = COALESCE(app_user.role_id, employee.login_role_id)
           AND actor_role.deleted_at IS NULL
           AND actor_role.is_active = TRUE
          WHERE session.token = $1
            AND session.revoked_at IS NULL
            AND session.expires_at > NOW()
            AND (app_user.id IS NOT NULL OR employee.id IS NOT NULL)
            AND (
              actor_role.is_owner = TRUE
              OR UPPER(COALESCE(actor_role.code, app_user.role, '')) IN ('OWNER', 'ADMIN')
              OR EXISTS (
                SELECT 1
                FROM role_permissions permission
                WHERE permission.role_id = actor_role.id
                  AND permission.permission_code = $2
                  AND permission.deleted_at IS NULL
              )
            )
        )
        "#,
    )
    .bind(token)
    .bind(permission)
    .fetch_one(pool)
    .await?;

    if allowed {
        sqlx::query(
            r#"
            UPDATE server_auth_sessions
            SET last_active_at = NOW()
            WHERE token = $1
              AND revoked_at IS NULL
              AND expires_at > NOW()
            "#,
        )
        .bind(token)
        .execute(pool)
        .await?;
    }

    Ok(allowed)
}

pub async fn list_accounts(pool: &PgPool) -> Result<Vec<MarketplaceAccountDto>, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceAccountDto>(
        r#"
        SELECT
          id,
          marketplace,
          shop_id::TEXT AS shop_id,
          shop_name,
          status,
          last_synced_at::TEXT AS last_synced_at,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM marketplace_accounts
        WHERE marketplace = $1
        ORDER BY shop_name ASC, created_at ASC
        "#,
    )
    .bind(MARKETPLACE)
    .fetch_all(pool)
    .await
}

pub async fn get_account_secret(
    pool: &PgPool,
    id: &str,
) -> Result<Option<MarketplaceAccountSecretDto>, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceAccountSecretDto>(
        r#"
        SELECT
          shop_id,
          access_token_encrypted,
          refresh_token_encrypted,
          token_expires_at::TEXT AS token_expires_at,
          status,
          last_synced_at::TEXT AS last_synced_at
        FROM marketplace_accounts
        WHERE id = $1 AND marketplace = $2
        "#,
    )
    .bind(id)
    .bind(MARKETPLACE)
    .fetch_optional(pool)
    .await
}

pub async fn lock_account_secret(
    transaction: &mut Transaction<'_, Postgres>,
    id: &str,
) -> Result<Option<MarketplaceAccountSecretDto>, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceAccountSecretDto>(
        r#"
        SELECT
          shop_id,
          access_token_encrypted,
          refresh_token_encrypted,
          token_expires_at::TEXT AS token_expires_at,
          status,
          last_synced_at::TEXT AS last_synced_at
        FROM marketplace_accounts
        WHERE id = $1 AND marketplace = $2
        FOR UPDATE
        "#,
    )
    .bind(id)
    .bind(MARKETPLACE)
    .fetch_optional(&mut **transaction)
    .await
}

pub async fn upsert_account(
    pool: &PgPool,
    shop_id: i64,
    shop_name: &str,
    access_token_encrypted: &str,
    refresh_token_encrypted: &str,
    token_expires_at: &str,
    status: &str,
) -> Result<MarketplaceAccountDto, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceAccountDto>(
        r#"
        INSERT INTO marketplace_accounts (
          id,
          marketplace,
          shop_id,
          shop_name,
          access_token_encrypted,
          refresh_token_encrypted,
          token_expires_at,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ, $8, NOW(), NOW())
        ON CONFLICT (marketplace, shop_id) DO UPDATE SET
          shop_name = EXCLUDED.shop_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING
          id,
          marketplace,
          shop_id::TEXT AS shop_id,
          shop_name,
          status,
          last_synced_at::TEXT AS last_synced_at,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(MARKETPLACE)
    .bind(shop_id)
    .bind(shop_name)
    .bind(access_token_encrypted)
    .bind(refresh_token_encrypted)
    .bind(token_expires_at)
    .bind(status)
    .fetch_one(pool)
    .await
}

pub async fn update_locked_tokens(
    transaction: &mut Transaction<'_, Postgres>,
    id: &str,
    access_token_encrypted: &str,
    refresh_token_encrypted: &str,
    token_expires_at: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE marketplace_accounts
        SET access_token_encrypted = $2,
            refresh_token_encrypted = $3,
            token_expires_at = $4::TIMESTAMPTZ,
            status = 'CONNECTED',
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(access_token_encrypted)
    .bind(refresh_token_encrypted)
    .bind(token_expires_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub async fn update_account_status(
    pool: &PgPool,
    id: &str,
    status: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE marketplace_accounts SET status = $2, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .bind(status)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_orders(
    pool: &PgPool,
    input: MarketplaceOrderListInput,
) -> Result<MarketplaceOrderListResult, sqlx::Error> {
    let limit = input.limit.unwrap_or(20).clamp(1, 100);
    let offset = input.offset.unwrap_or(0).max(0);
    let search = input
        .search
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let internal_status = input
        .internal_status
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let total = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM marketplace_orders marketplace_order
        INNER JOIN marketplace_accounts account
          ON account.id = marketplace_order.marketplace_account_id
        WHERE account.marketplace = $1
          AND ($2::TEXT IS NULL OR marketplace_order.marketplace_account_id = $2)
          AND (
            $3::TEXT IS NULL
            OR marketplace_order.order_sn ILIKE '%' || $3 || '%'
            OR COALESCE(marketplace_order.buyer_username, '') ILIKE '%' || $3 || '%'
          )
          AND ($4::TEXT IS NULL OR marketplace_order.internal_status = $4)
        "#,
    )
    .bind(MARKETPLACE)
    .bind(input.account_id.as_deref())
    .bind(search.as_deref())
    .bind(internal_status.as_deref())
    .fetch_one(pool)
    .await?;

    let rows = sqlx::query_as::<_, MarketplaceOrderDto>(
        r#"
        SELECT
          marketplace_order.id,
          marketplace_order.marketplace_account_id,
          account.shop_name,
          account.shop_id::TEXT AS shop_id,
          marketplace_order.order_sn,
          marketplace_order.buyer_username,
          marketplace_order.marketplace_status,
          marketplace_order.internal_status,
          marketplace_order.total_amount::TEXT AS total_amount,
          marketplace_order.currency,
          marketplace_order.order_created_at::TEXT AS order_created_at,
          marketplace_order.order_updated_at::TEXT AS order_updated_at,
          marketplace_order.created_at::TEXT AS created_at,
          marketplace_order.updated_at::TEXT AS updated_at
        FROM marketplace_orders marketplace_order
        INNER JOIN marketplace_accounts account
          ON account.id = marketplace_order.marketplace_account_id
        WHERE account.marketplace = $1
          AND ($2::TEXT IS NULL OR marketplace_order.marketplace_account_id = $2)
          AND (
            $3::TEXT IS NULL
            OR marketplace_order.order_sn ILIKE '%' || $3 || '%'
            OR COALESCE(marketplace_order.buyer_username, '') ILIKE '%' || $3 || '%'
          )
          AND ($4::TEXT IS NULL OR marketplace_order.internal_status = $4)
        ORDER BY marketplace_order.order_created_at DESC, marketplace_order.order_sn DESC
        LIMIT $5 OFFSET $6
        "#,
    )
    .bind(MARKETPLACE)
    .bind(input.account_id.as_deref())
    .bind(search.as_deref())
    .bind(internal_status.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(MarketplaceOrderListResult { rows, total })
}

pub async fn get_order_bundle(
    pool: &PgPool,
    id: &str,
) -> Result<Option<MarketplaceOrderBundleDto>, sqlx::Error> {
    let order = sqlx::query_as::<_, MarketplaceOrderDto>(
        r#"
        SELECT
          marketplace_order.id,
          marketplace_order.marketplace_account_id,
          account.shop_name,
          account.shop_id::TEXT AS shop_id,
          marketplace_order.order_sn,
          marketplace_order.buyer_username,
          marketplace_order.marketplace_status,
          marketplace_order.internal_status,
          marketplace_order.total_amount::TEXT AS total_amount,
          marketplace_order.currency,
          marketplace_order.order_created_at::TEXT AS order_created_at,
          marketplace_order.order_updated_at::TEXT AS order_updated_at,
          marketplace_order.created_at::TEXT AS created_at,
          marketplace_order.updated_at::TEXT AS updated_at
        FROM marketplace_orders marketplace_order
        INNER JOIN marketplace_accounts account
          ON account.id = marketplace_order.marketplace_account_id
        WHERE marketplace_order.id = $1 AND account.marketplace = $2
        "#,
    )
    .bind(id)
    .bind(MARKETPLACE)
    .fetch_optional(pool)
    .await?;

    let Some(order) = order else {
        return Ok(None);
    };

    let items = sqlx::query_as::<_, MarketplaceOrderItemDto>(
        r#"
        SELECT
          id,
          marketplace_order_id,
          item_id::TEXT AS item_id,
          model_id::TEXT AS model_id,
          item_name,
          sku,
          quantity,
          original_price::TEXT AS original_price,
          discounted_price::TEXT AS discounted_price
        FROM marketplace_order_items
        WHERE marketplace_order_id = $1
        ORDER BY item_name ASC, model_id ASC
        "#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(Some(MarketplaceOrderBundleDto { order, items }))
}

pub async fn list_logs(
    pool: &PgPool,
    account_id: Option<&str>,
    limit: i64,
) -> Result<Vec<MarketplaceIntegrationLogDto>, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceIntegrationLogDto>(
        r#"
        SELECT
          id,
          marketplace_account_id,
          action,
          status,
          request_payload,
          response_payload,
          error_message,
          created_at::TEXT AS created_at
        FROM marketplace_integration_logs
        WHERE ($1::TEXT IS NULL OR marketplace_account_id = $1)
        ORDER BY created_at DESC
        LIMIT $2
        "#,
    )
    .bind(account_id)
    .bind(limit.clamp(1, 100))
    .fetch_all(pool)
    .await
}

pub async fn insert_log(
    pool: &PgPool,
    account_id: Option<&str>,
    action: &str,
    status: &str,
    request_payload: Option<Value>,
    response_payload: Option<Value>,
    error_message: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO marketplace_integration_logs (
          id,
          marketplace_account_id,
          action,
          status,
          request_payload,
          response_payload,
          error_message,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(account_id)
    .bind(action)
    .bind(status)
    .bind(request_payload)
    .bind(response_payload)
    .bind(error_message)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn persist_orders(
    pool: &PgPool,
    account_id: &str,
    orders: &[MarketplaceOrderUpsert],
    synced_at: &str,
) -> Result<(usize, usize), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let mut item_count = 0usize;

    for order in orders {
        let generated_id = Uuid::new_v4().to_string();
        let order_id = sqlx::query_scalar::<_, String>(
            r#"
            INSERT INTO marketplace_orders (
              id,
              marketplace_account_id,
              order_sn,
              buyer_username,
              marketplace_status,
              internal_status,
              total_amount,
              currency,
              order_created_at,
              order_updated_at,
              raw_payload,
              created_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7::NUMERIC,
              $8, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ, $11, NOW(), NOW()
            )
            ON CONFLICT (marketplace_account_id, order_sn) DO UPDATE SET
              buyer_username = EXCLUDED.buyer_username,
              marketplace_status = EXCLUDED.marketplace_status,
              internal_status = EXCLUDED.internal_status,
              total_amount = EXCLUDED.total_amount,
              currency = EXCLUDED.currency,
              order_created_at = EXCLUDED.order_created_at,
              order_updated_at = EXCLUDED.order_updated_at,
              raw_payload = EXCLUDED.raw_payload,
              updated_at = NOW()
            RETURNING id
            "#,
        )
        .bind(generated_id)
        .bind(account_id)
        .bind(&order.order_sn)
        .bind(&order.buyer_username)
        .bind(&order.marketplace_status)
        .bind(&order.internal_status)
        .bind(order.total_amount.as_deref())
        .bind(&order.currency)
        .bind(&order.order_created_at)
        .bind(&order.order_updated_at)
        .bind(&order.raw_payload)
        .fetch_one(&mut *transaction)
        .await?;

        sqlx::query("DELETE FROM marketplace_order_items WHERE marketplace_order_id = $1")
            .bind(&order_id)
            .execute(&mut *transaction)
            .await?;

        for item in &order.items {
            sqlx::query(
                r#"
                INSERT INTO marketplace_order_items (
                  id,
                  marketplace_order_id,
                  item_id,
                  model_id,
                  item_name,
                  sku,
                  quantity,
                  original_price,
                  discounted_price,
                  raw_payload
                )
                VALUES (
                  $1, $2, $3, $4, $5, $6, $7,
                  $8::NUMERIC,
                  $9::NUMERIC,
                  $10
                )
                "#,
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&order_id)
            .bind(item.item_id)
            .bind(item.model_id)
            .bind(&item.item_name)
            .bind(&item.sku)
            .bind(item.quantity)
            .bind(item.original_price.as_deref())
            .bind(item.discounted_price.as_deref())
            .bind(&item.raw_payload)
            .execute(&mut *transaction)
            .await?;
            item_count += 1;
        }
    }

    sqlx::query(
        r#"
        UPDATE marketplace_accounts
        SET last_synced_at = $2::TIMESTAMPTZ,
            status = 'CONNECTED',
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(account_id)
    .bind(synced_at)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok((orders.len(), item_count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::marketplace::MarketplaceOrderItemUpsert;
    use chrono::{Duration, Utc};
    use serde_json::json;
    use sqlx::postgres::PgPoolOptions;

    fn order_with_items(items: Vec<MarketplaceOrderItemUpsert>) -> MarketplaceOrderUpsert {
        MarketplaceOrderUpsert {
            order_sn: "ORDER-IDEMPOTENT-1".to_string(),
            buyer_username: Some("buyer".to_string()),
            marketplace_status: "READY_TO_SHIP".to_string(),
            internal_status: "READY_TO_PROCESS".to_string(),
            total_amount: Some("12500.5000".to_string()),
            currency: "IDR".to_string(),
            order_created_at: "2026-07-01T00:00:00Z".to_string(),
            order_updated_at: "2026-07-01T01:00:00Z".to_string(),
            raw_payload: json!({ "order_sn": "ORDER-IDEMPOTENT-1" }),
            items,
        }
    }

    fn item(model_id: i64, quantity: i32, name: &str) -> MarketplaceOrderItemUpsert {
        MarketplaceOrderItemUpsert {
            item_id: 100,
            model_id,
            item_name: name.to_string(),
            sku: Some(format!("SKU-{model_id}")),
            quantity,
            original_price: Some("7000.0000".to_string()),
            discounted_price: Some("6250.2500".to_string()),
            raw_payload: json!({ "model_id": model_id }),
        }
    }

    #[tokio::test]
    async fn postgres_upsert_replaces_items_and_rolls_back_failed_sync() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            return;
        };
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("TEST_DATABASE_URL must point to a reachable disposable PostgreSQL database");
        sqlx::migrate!()
            .run(&pool)
            .await
            .expect("marketplace migration must succeed");
        sqlx::query("DELETE FROM marketplace_accounts WHERE marketplace = 'SHOPEE'")
            .execute(&pool)
            .await
            .unwrap();

        let token_expiry = (Utc::now() + Duration::hours(4)).to_rfc3339();
        let account = upsert_account(
            &pool,
            987654321,
            "Toko Integration Test",
            "encrypted-access",
            "encrypted-refresh",
            &token_expiry,
            "CONNECTED",
        )
        .await
        .unwrap();
        let reconnected = upsert_account(
            &pool,
            987654321,
            "Toko Integration Test Updated",
            "encrypted-access-2",
            "encrypted-refresh-2",
            &token_expiry,
            "CONNECTED",
        )
        .await
        .unwrap();
        assert_eq!(account.id, reconnected.id);

        persist_orders(
            &pool,
            &account.id,
            &[order_with_items(vec![
                item(1, 1, "Model Lama"),
                item(2, 2, "Model Hapus"),
            ])],
            "2026-07-02T00:00:00Z",
        )
        .await
        .unwrap();
        persist_orders(
            &pool,
            &account.id,
            &[order_with_items(vec![item(1, 3, "Model Baru")])],
            "2026-07-03T00:00:00Z",
        )
        .await
        .unwrap();

        let order_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM marketplace_orders WHERE marketplace_account_id = $1",
        )
        .bind(&account.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let item_rows: Vec<(i64, i32, String)> = sqlx::query_as(
            r#"
            SELECT item.model_id, item.quantity, item.item_name
            FROM marketplace_order_items item
            INNER JOIN marketplace_orders marketplace_order
              ON marketplace_order.id = item.marketplace_order_id
            WHERE marketplace_order.marketplace_account_id = $1
            "#,
        )
        .bind(&account.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(order_count, 1);
        assert_eq!(item_rows, vec![(1, 3, "Model Baru".to_string())]);

        let failed = persist_orders(
            &pool,
            &account.id,
            &[order_with_items(vec![item(1, -1, "Tidak Valid")])],
            "2026-07-04T00:00:00Z",
        )
        .await;
        assert!(failed.is_err());
        let last_synced_at: String = sqlx::query_scalar(
            "SELECT last_synced_at::TEXT FROM marketplace_accounts WHERE id = $1",
        )
        .bind(&account.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let preserved_quantity: i32 = sqlx::query_scalar(
            r#"
            SELECT item.quantity
            FROM marketplace_order_items item
            INNER JOIN marketplace_orders marketplace_order
              ON marketplace_order.id = item.marketplace_order_id
            WHERE marketplace_order.marketplace_account_id = $1
            "#,
        )
        .bind(&account.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(last_synced_at.starts_with("2026-07-03"));
        assert_eq!(preserved_quantity, 3);

        sqlx::query("DELETE FROM marketplace_accounts WHERE id = $1")
            .bind(&account.id)
            .execute(&pool)
            .await
            .unwrap();
    }
}
