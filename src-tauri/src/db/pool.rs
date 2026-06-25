use serde::Serialize;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::{env, fs, io, path::PathBuf, sync::RwLock, time::Duration};
use thiserror::Error;

#[derive(Debug, Clone, Serialize)]
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
    inner: RwLock<InnerPostgresState>,
}

#[derive(Debug, Clone)]
struct InnerPostgresState {
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
            inner: RwLock::new(InnerPostgresState {
                pool: Some(pool),
                status: PostgresStatus::Available,
                message: None,
            }),
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
            inner: RwLock::new(InnerPostgresState {
                pool: None,
                status,
                message: Some(message.into()),
            }),
        }
    }

    pub fn pool(&self) -> PostgresCommandResult<PgPool> {
        let inner = self.inner.read().unwrap();
        inner.pool.clone().ok_or_else(|| PostgresCommandError {
            code: "postgres_unavailable",
            status: Some(inner.status.clone()),
            message: inner
                .message
                .clone()
                .unwrap_or_else(|| "PostgreSQL is unavailable.".to_string()),
        })
    }

    pub fn health(&self) -> PostgresHealth {
        let inner = self.inner.read().unwrap();
        PostgresHealth {
            available: matches!(inner.status, PostgresStatus::Available) && inner.pool.is_some(),
            status: inner.status.clone(),
            message: inner.message.clone(),
        }
    }

    pub fn update_from(&self, other: PostgresState) {
        let new_inner = other.inner.into_inner().unwrap();
        let mut inner = self.inner.write().unwrap();
        *inner = new_inner;
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

    let database_url = read_database_url()?;

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await
        .map_err(PostgresInitError::Unreachable)
}

pub async fn create_postgres_state() -> PostgresState {
    match create_pg_pool().await {
        Ok(pool) => {
            let migration_result = sqlx::migrate!("./migrations").run(&pool).await;
            if migration_result.is_ok() {
                PostgresState::available(pool)
            } else {
                PostgresState::migration_failed()
            }
        }
        Err(PostgresInitError::DatabaseUrlMissing) => PostgresState::unconfigured(),
        Err(PostgresInitError::Unreachable(_)) => PostgresState::unreachable(),
    }
}

fn load_env() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest_dir.join(".env"));
}

fn read_database_url() -> Result<String, PostgresInitError> {
    env::var("DATABASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(read_database_url_from_storage)
        .or_else(|| {
            option_env!("KASIRKU_DATABASE_URL")
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty())
        })
        .ok_or(PostgresInitError::DatabaseUrlMissing)
}

fn read_database_url_from_storage() -> Option<String> {
    database_url_path()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn persist_database_url(database_url: &str) -> io::Result<()> {
    let path = database_url_path().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "failed to resolve application config directory",
        )
    })?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(path, database_url)
}

pub fn remove_persisted_database_url() -> io::Result<()> {
    if let Some(path) = database_url_path() {
        if path.exists() {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn database_url_path() -> Option<PathBuf> {
    app_config_dir().map(|dir| dir.join("database_url.txt"))
}

fn app_config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        env::var_os("APPDATA").map(|appdata| PathBuf::from(appdata).join("frayukti"))
    }

    #[cfg(target_os = "macos")]
    {
        env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("frayukti")
        })
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| env::var_os("HOME").map(PathBuf::from).map(|home| home.join(".config")))
            .map(|config_dir| config_dir.join("frayukti"))
    }
}
