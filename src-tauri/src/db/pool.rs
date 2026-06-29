use serde::Serialize;
use sha2::{Digest, Sha384};
use sqlx::{
    migrate::{MigrateError, Migration, Migrator},
    postgres::{PgConnectOptions, PgPoolOptions},
    Executor, PgPool,
};
use std::{env, fs, io, path::PathBuf, str::FromStr, sync::RwLock, time::Duration};
use thiserror::Error;

const MAX_MIGRATION_REPAIR_ATTEMPTS: usize = 8;

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
    inner: RwLock<InnerPostgresState>,
}

#[derive(Debug, Clone)]
struct InnerPostgresState {
    pool: Option<PgPool>,
    status: PostgresStatus,
    message: Option<String>,
}

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

    pub fn unreachable(message: impl Into<String>) -> Self {
        Self::unavailable(PostgresStatus::Unreachable, message)
    }

    pub fn migration_failed(message: impl Into<String>) -> Self {
        Self::unavailable(PostgresStatus::MigrationFailed, message)
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

    let database_url = configured_database_url()?;
    create_pg_pool_from_database_url(&database_url).await
}

async fn create_pg_pool_from_database_url(
    database_url: &str,
) -> Result<PgPool, PostgresInitError> {
    // Supabase's transaction pooler (port 6543) and other PgBouncer-style poolers
    // reuse backend server connections across client sessions and do NOT support
    // cached/named prepared statements. With sqlx's default statement cache, the
    // first run prepares `sqlx_s_*` on a backend; after the app is closed and
    // reopened the pooler hands back a backend that still has those statements,
    // so the next PREPARE fails with "prepared statement already exists" — the
    // app connects once but cannot reconnect. Disabling the statement cache makes
    // sqlx use the unnamed prepared statement per query, which is pooler-safe.
    let connect_options = PgConnectOptions::from_str(&database_url)
        .map_err(PostgresInitError::Unreachable)?
        .statement_cache_capacity(0);

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(connect_options)
        .await
        .map_err(PostgresInitError::Unreachable)
}

pub fn configured_database_url() -> Result<String, PostgresInitError> {
    load_env();
    read_database_url()
}

pub async fn create_postgres_state() -> PostgresState {
    match create_pg_pool().await {
        Ok(pool) => create_migrated_postgres_state(pool).await,
        Err(PostgresInitError::DatabaseUrlMissing) => PostgresState::unconfigured(),
        Err(PostgresInitError::Unreachable(error)) => {
            PostgresState::unreachable(format!("PostgreSQL is unavailable: {}", error))
        }
    }
}

pub async fn create_postgres_state_from_database_url(database_url: &str) -> PostgresState {
    let trimmed = database_url.trim();
    if trimmed.is_empty() {
        return PostgresState::unconfigured();
    }

    match create_pg_pool_from_database_url(trimmed).await {
        Ok(pool) => create_migrated_postgres_state(pool).await,
        Err(PostgresInitError::DatabaseUrlMissing) => PostgresState::unconfigured(),
        Err(PostgresInitError::Unreachable(error)) => {
            PostgresState::unreachable(format!("PostgreSQL is unavailable: {}", error))
        }
    }
}

async fn create_migrated_postgres_state(pool: PgPool) -> PostgresState {
    // Advisory locks are session-scoped and unreliable through a transaction
    // pooler (each query may land on a different backend), so disable them.
    let mut migrator = sqlx::migrate!("./migrations");
    normalize_migration_checksums(&mut migrator);
    migrator.set_locking(false);
    match run_postgres_migrations(&pool, &migrator).await {
        Ok(()) => PostgresState::available(pool),
        Err(error) => {
            PostgresState::migration_failed(format!("PostgreSQL migration failed: {}", error))
        }
    }
}

fn normalize_migration_checksums(migrator: &mut Migrator) {
    for migration in migrator.migrations.to_mut() {
        migration.checksum = checksum_ignoring_carriage_returns(migration.sql.as_str()).into();
    }
}

fn checksum_ignoring_carriage_returns(sql: &str) -> Vec<u8> {
    let mut digest = Sha384::new();

    for fragment in sql.split('\r') {
        digest.update(fragment);
    }

    digest.finalize().to_vec()
}

fn line_ending_equivalent_checksums(sql: &str) -> [Vec<u8>; 3] {
    [
        checksum_sql(sql),
        checksum_ignoring_carriage_returns(sql),
        checksum_with_crlf_line_endings(sql),
    ]
}

fn checksum_sql(sql: &str) -> Vec<u8> {
    let mut digest = Sha384::new();
    digest.update(sql);
    digest.finalize().to_vec()
}

fn checksum_with_crlf_line_endings(sql: &str) -> Vec<u8> {
    let without_carriage_returns = sql.replace('\r', "");
    checksum_sql(&without_carriage_returns.replace('\n', "\r\n"))
}

async fn run_postgres_migrations(pool: &PgPool, migrator: &Migrator) -> Result<(), MigrateError> {
    for _ in 0..MAX_MIGRATION_REPAIR_ATTEMPTS {
        match migrator.run(pool).await {
            Ok(()) => return Ok(()),
            Err(MigrateError::VersionMismatch(version)) => {
                repair_compatible_migration_mismatch(pool, migrator, version).await?;
            }
            Err(error) => return Err(error),
        }
    }

    migrator.run(pool).await
}

async fn repair_compatible_migration_mismatch(
    pool: &PgPool,
    migrator: &Migrator,
    version: i64,
) -> Result<(), MigrateError> {
    if repair_line_ending_only_migration_checksum(pool, migrator, version).await? {
        return Ok(());
    }

    if version == 1 && department_table_has_current_columns(pool).await? {
        return execute_current_migration_and_replace_row(pool, migrator, version).await;
    }

    if repair_legacy_migration_numbering(pool, migrator, version).await? {
        return Ok(());
    }

    if !is_current_migration_schema_compatible(pool, version).await? {
        return Err(MigrateError::VersionMismatch(version));
    }

    if matches!(version, 30 | 31 | 32 | 33 | 34 | 35) {
        return execute_current_migration_and_replace_row(pool, migrator, version).await;
    }

    update_applied_migration_checksum(pool, migrator, version).await
}

async fn repair_line_ending_only_migration_checksum(
    pool: &PgPool,
    migrator: &Migrator,
    version: i64,
) -> Result<bool, MigrateError> {
    let migration = migration_for_version(migrator, version)?;
    let Some(stored_checksum) = applied_migration_checksum(pool, version).await? else {
        return Ok(false);
    };

    let equivalent_checksums = line_ending_equivalent_checksums(migration.sql.as_str());
    if !equivalent_checksums
        .iter()
        .any(|checksum| checksum.as_slice() == stored_checksum.as_slice())
    {
        return Ok(false);
    }

    update_applied_migration_checksum(pool, migrator, version).await?;
    Ok(true)
}

async fn repair_legacy_migration_numbering(
    pool: &PgPool,
    migrator: &Migrator,
    version: i64,
) -> Result<bool, MigrateError> {
    match version {
        30 if !is_current_migration_schema_compatible(pool, 30).await?
            && is_current_migration_schema_compatible(pool, 31).await? =>
        {
            execute_current_migration_and_replace_row(pool, migrator, 30).await?;
            insert_applied_migration_if_missing(pool, migrator, 31).await?;
            Ok(true)
        }
        31 if !is_current_migration_schema_compatible(pool, 31).await?
            && is_current_migration_schema_compatible(pool, 32).await? =>
        {
            move_legacy_area_migration_row(pool, migrator).await?;
            Ok(true)
        }
        32 if !is_current_migration_schema_compatible(pool, 32).await?
            && function_exists(pool, "kasirku_notify_data_change").await? =>
        {
            delete_applied_migration_row(pool, 32).await?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

async fn execute_current_migration_and_replace_row(
    pool: &PgPool,
    migrator: &Migrator,
    version: i64,
) -> Result<(), MigrateError> {
    let migration = migration_for_version(migrator, version)?;
    let mut tx = pool.begin().await?;

    tx.execute(migration.sql.clone())
        .await
        .map_err(|error| MigrateError::ExecuteMigration(error, version))?;

    sqlx::query(
        r#"
        UPDATE _sqlx_migrations
        SET description = $1, checksum = $2, success = TRUE
        WHERE version = $3
        "#,
    )
    .bind(migration.description.as_ref())
    .bind(migration.checksum.as_ref())
    .bind(version)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

async fn move_legacy_area_migration_row(
    pool: &PgPool,
    migrator: &Migrator,
) -> Result<(), MigrateError> {
    let area_migration = migration_for_version(migrator, 32)?;
    let has_current_area_row =
        applied_migration_checksum_matches(pool, 32, area_migration.checksum.as_ref()).await?;
    let mut tx = pool.begin().await?;

    if has_current_area_row {
        sqlx::query("DELETE FROM _sqlx_migrations WHERE version = 31")
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("DELETE FROM _sqlx_migrations WHERE version = 32")
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            r#"
            UPDATE _sqlx_migrations
            SET version = 32, description = $1, checksum = $2, success = TRUE
            WHERE version = 31
            "#,
        )
        .bind(area_migration.description.as_ref())
        .bind(area_migration.checksum.as_ref())
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

async fn update_applied_migration_checksum(
    pool: &PgPool,
    migrator: &Migrator,
    version: i64,
) -> Result<(), MigrateError> {
    let migration = migration_for_version(migrator, version)?;

    sqlx::query(
        r#"
        UPDATE _sqlx_migrations
        SET description = $1, checksum = $2, success = TRUE
        WHERE version = $3
        "#,
    )
    .bind(migration.description.as_ref())
    .bind(migration.checksum.as_ref())
    .bind(version)
    .execute(pool)
    .await?;

    Ok(())
}

async fn insert_applied_migration_if_missing(
    pool: &PgPool,
    migrator: &Migrator,
    version: i64,
) -> Result<(), MigrateError> {
    let migration = migration_for_version(migrator, version)?;

    sqlx::query(
        r#"
        INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
        VALUES ($1, $2, TRUE, $3, -1)
        ON CONFLICT (version) DO NOTHING
        "#,
    )
    .bind(version)
    .bind(migration.description.as_ref())
    .bind(migration.checksum.as_ref())
    .execute(pool)
    .await?;

    Ok(())
}

async fn delete_applied_migration_row(pool: &PgPool, version: i64) -> Result<(), MigrateError> {
    sqlx::query("DELETE FROM _sqlx_migrations WHERE version = $1")
        .bind(version)
        .execute(pool)
        .await?;

    Ok(())
}

async fn applied_migration_checksum_matches(
    pool: &PgPool,
    version: i64,
    checksum: &[u8],
) -> Result<bool, sqlx::Error> {
    let stored_checksum = applied_migration_checksum(pool, version).await?;

    Ok(stored_checksum
        .as_deref()
        .is_some_and(|stored_checksum| stored_checksum == checksum))
}

async fn applied_migration_checksum(
    pool: &PgPool,
    version: i64,
) -> Result<Option<Vec<u8>>, sqlx::Error> {
    sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = $1")
        .bind(version)
        .fetch_optional(pool)
        .await
}

fn migration_for_version(migrator: &Migrator, version: i64) -> Result<&Migration, MigrateError> {
    migrator
        .iter()
        .find(|migration| migration.version == version)
        .ok_or(MigrateError::VersionNotPresent(version))
}

async fn is_current_migration_schema_compatible(
    pool: &PgPool,
    version: i64,
) -> Result<bool, sqlx::Error> {
    match version {
        1 => Ok(department_table_has_current_columns(pool).await?
            && indexes_exist(pool, &["idx_departments_name", "idx_departments_is_active"]).await?),
        16 | 35 => column_exists(pool, "auth_users", "email").await,
        30 => {
            tables_exist(
                pool,
                &[
                    "employees",
                    "employee_areas",
                    "employee_collection_schedules",
                ],
            )
            .await
        }
        31 => {
            tables_exist(
                pool,
                &[
                    "payroll_runs",
                    "payroll_run_items",
                    "employee_cash_advances",
                    "employee_cash_advance_repayments",
                ],
            )
            .await
        }
        32 => table_exists(pool, "cooperative_areas").await,
        33 => column_exists(pool, "server_auth_sessions", "employee_id").await,
        34 => function_exists(pool, "kasirku_notify_data_change").await,
        _ => Ok(false),
    }
}

async fn department_table_has_current_columns(pool: &PgPool) -> Result<bool, sqlx::Error> {
    table_has_columns(
        pool,
        "departments",
        &[
            "id",
            "code",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "deleted_at",
        ],
    )
    .await
}

async fn tables_exist(pool: &PgPool, tables: &[&str]) -> Result<bool, sqlx::Error> {
    for table in tables {
        if !table_exists(pool, table).await? {
            return Ok(false);
        }
    }

    Ok(true)
}

async fn indexes_exist(pool: &PgPool, indexes: &[&str]) -> Result<bool, sqlx::Error> {
    for index in indexes {
        if !relation_exists(pool, index).await? {
            return Ok(false);
        }
    }

    Ok(true)
}

async fn table_has_columns(
    pool: &PgPool,
    table: &str,
    columns: &[&str],
) -> Result<bool, sqlx::Error> {
    if !table_exists(pool, table).await? {
        return Ok(false);
    }

    for column in columns {
        if !column_exists(pool, table, column).await? {
            return Ok(false);
        }
    }

    Ok(true)
}

async fn table_exists(pool: &PgPool, table: &str) -> Result<bool, sqlx::Error> {
    relation_exists(pool, table).await
}

async fn relation_exists(pool: &PgPool, relation: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar("SELECT to_regclass($1) IS NOT NULL")
        .bind(format!("public.{}", relation))
        .fetch_one(pool)
        .await
}

async fn column_exists(pool: &PgPool, table: &str, column: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
        )
        "#,
    )
    .bind(table)
    .bind(column)
    .fetch_one(pool)
    .await
}

async fn function_exists(pool: &PgPool, function_name: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM pg_proc
            JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
            WHERE pg_namespace.nspname = 'public'
              AND pg_proc.proname = $1
        )
        "#,
    )
    .bind(function_name)
    .fetch_one(pool)
    .await
}

fn load_env() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest_dir.join(".env"));
}

fn read_database_url() -> Result<String, PostgresInitError> {
    // The database host is configured from the frontend (developer setup),
    // so the value persisted there is authoritative. DATABASE_URL from the
    // environment / .env is only a dev fallback and must not shadow it.
    read_database_url_from_storage()
        .or_else(|| {
            env::var("DATABASE_URL")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
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
