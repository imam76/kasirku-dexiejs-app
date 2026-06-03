use serde::Serialize;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::{env, path::PathBuf, time::Duration};
use thiserror::Error;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PostgresStatus {
    Available,
    Unconfigured,
    Unreachable,
    MigrationFailed,
}

#[derive(Debug, Clone, Serialize)]
pub struct PostgresHealth {
    pub available: bool,
    pub status: PostgresStatus,
    pub message: Option<String>,
}

#[derive(Debug)]
pub struct PostgresState {
    pool: Option<PgPool>,
    status: PostgresStatus,
    message: Option<String>,
}

pub type PgPoolState = PostgresState;

#[derive(Debug, Error)]
pub enum PostgresInitError {
    #[error("DATABASE_URL is not configured")]
    DatabaseUrlMissing,
    #[error("PostgreSQL is unreachable")]
    Unreachable(#[from] sqlx::Error),
}

#[derive(Debug, Serialize)]
pub struct PostgresCommandError {
    pub code: &'static str,
    pub status: Option<PostgresStatus>,
    pub message: String,
}

pub type PostgresCommandResult<T> = Result<T, PostgresCommandError>;

impl PostgresState {
    pub fn available(pool: PgPool) -> Self {
        Self {
            pool: Some(pool),
            status: PostgresStatus::Available,
            message: None,
        }
    }

    pub fn unconfigured() -> Self {
        Self::unavailable(
            PostgresStatus::Unconfigured,
            "DATABASE_URL is not configured.",
        )
    }

    pub fn unreachable() -> Self {
        Self::unavailable(PostgresStatus::Unreachable, "PostgreSQL is unavailable.")
    }

    pub fn migration_failed() -> Self {
        Self::unavailable(
            PostgresStatus::MigrationFailed,
            "PostgreSQL migration failed.",
        )
    }

    pub fn unavailable(status: PostgresStatus, message: impl Into<String>) -> Self {
        Self {
            pool: None,
            status,
            message: Some(message.into()),
        }
    }

    pub fn pool(&self) -> PostgresCommandResult<&PgPool> {
        self.pool.as_ref().ok_or_else(|| PostgresCommandError {
            code: "postgres_unavailable",
            status: Some(self.status.clone()),
            message: self
                .message
                .clone()
                .unwrap_or_else(|| "PostgreSQL is unavailable.".to_string()),
        })
    }

    pub fn health(&self) -> PostgresHealth {
        PostgresHealth {
            available: matches!(self.status, PostgresStatus::Available) && self.pool.is_some(),
            status: self.status.clone(),
            message: self.message.clone(),
        }
    }
}

impl PostgresHealth {
    pub fn unreachable(message: impl Into<String>) -> Self {
        Self {
            available: false,
            status: PostgresStatus::Unreachable,
            message: Some(message.into()),
        }
    }
}

impl From<sqlx::Error> for PostgresCommandError {
    fn from(_error: sqlx::Error) -> Self {
        Self {
            code: "postgres_error",
            status: None,
            message: "PostgreSQL command failed.".to_string(),
        }
    }
}

pub async fn create_pg_pool() -> Result<PgPool, PostgresInitError> {
    load_env();

    let database_url =
        env::var("DATABASE_URL").map_err(|_| PostgresInitError::DatabaseUrlMissing)?;

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await
        .map_err(PostgresInitError::Unreachable)
}

fn load_env() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest_dir.join(".env"));
}
