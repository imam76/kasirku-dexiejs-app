use sqlx::PgPool;
use uuid::Uuid;

const APP_INSTANCE_ID: &str = "default";

/// Returns the host's permanent identity, creating it on first contact.
/// Used by the client to detect that the configured host has been swapped.
pub async fn ensure_app_instance_id(pool: &PgPool) -> Result<String, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        r#"
        WITH inserted AS (
            INSERT INTO app_instance (id, instance_id)
            VALUES ($1, $2)
            ON CONFLICT (id) DO NOTHING
            RETURNING instance_id
        )
        SELECT instance_id FROM inserted
        UNION ALL
        SELECT instance_id FROM app_instance WHERE id = $1
        LIMIT 1
        "#,
    )
    .bind(APP_INSTANCE_ID)
    .bind(Uuid::new_v4().to_string())
    .fetch_one(pool)
    .await
}
