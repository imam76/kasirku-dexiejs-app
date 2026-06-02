use sqlx::{postgres::PgPoolOptions, PgPool};
use std::{env, path::PathBuf, time::Duration};

pub type PgPoolState = PgPool;

pub async fn create_pg_pool() -> Result<PgPool, sqlx::Error> {
    load_env();

    let database_url =
        env::var("DATABASE_URL").expect("DATABASE_URL must be set in src-tauri/.env");

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await
}

fn load_env() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest_dir.join(".env"));
}
