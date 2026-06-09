use crate::models::auth::{ActivityLogDto, AuthUserDto, RoleDto, RolePermissionDto};
use sqlx::PgPool;

pub async fn list_auth_users(pool: &PgPool) -> Result<Vec<AuthUserDto>, sqlx::Error> {
    sqlx::query_as::<_, AuthUserDto>(
        r#"
        SELECT
            id,
            name,
            email,
            role,
            role_id,
            role_name,
            employee_id,
            pin_hash,
            pin_salt,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM auth_users
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_auth_user(pool: &PgPool, id: String) -> Result<Option<AuthUserDto>, sqlx::Error> {
    sqlx::query_as::<_, AuthUserDto>(
        r#"
        SELECT
            id,
            name,
            email,
            role,
            role_id,
            role_name,
            employee_id,
            pin_hash,
            pin_salt,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM auth_users
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_auth_user_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<AuthUserDto>, sqlx::Error> {
    sqlx::query_as::<_, AuthUserDto>(
        r#"
        SELECT
            id,
            name,
            email,
            role,
            role_id,
            role_name,
            employee_id,
            pin_hash,
            pin_salt,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM auth_users
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_auth_user(
    pool: &PgPool,
    input: AuthUserDto,
) -> Result<AuthUserDto, sqlx::Error> {
    let user_id = input.id.clone();
    let upserted_user = sqlx::query_as::<_, AuthUserDto>(
        r#"
        INSERT INTO auth_users (
            id,
            name,
            email,
            role,
            role_id,
            role_name,
            employee_id,
            pin_hash,
            pin_salt,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::TIMESTAMPTZ, $12::TIMESTAMPTZ, $13::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            role_id = EXCLUDED.role_id,
            role_name = EXCLUDED.role_name,
            employee_id = EXCLUDED.employee_id,
            pin_hash = EXCLUDED.pin_hash,
            pin_salt = EXCLUDED.pin_salt,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= auth_users.updated_at
        RETURNING
            id,
            name,
            email,
            role,
            role_id,
            role_name,
            employee_id,
            pin_hash,
            pin_salt,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.email)
    .bind(input.role)
    .bind(input.role_id)
    .bind(input.role_name)
    .bind(input.employee_id)
    .bind(input.pin_hash)
    .bind(input.pin_salt)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(user) = upserted_user {
        return Ok(user);
    }

    get_auth_user_including_deleted(pool, user_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_roles(pool: &PgPool) -> Result<Vec<RoleDto>, sqlx::Error> {
    sqlx::query_as::<_, RoleDto>(
        r#"
        SELECT
            id,
            name,
            code,
            description,
            is_system,
            is_owner,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM roles
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_role(pool: &PgPool, id: String) -> Result<Option<RoleDto>, sqlx::Error> {
    sqlx::query_as::<_, RoleDto>(
        r#"
        SELECT
            id,
            name,
            code,
            description,
            is_system,
            is_owner,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM roles
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_role_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<RoleDto>, sqlx::Error> {
    sqlx::query_as::<_, RoleDto>(
        r#"
        SELECT
            id,
            name,
            code,
            description,
            is_system,
            is_owner,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM roles
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_role(pool: &PgPool, input: RoleDto) -> Result<RoleDto, sqlx::Error> {
    let role_id = input.id.clone();
    let upserted_role = sqlx::query_as::<_, RoleDto>(
        r#"
        INSERT INTO roles (
            id,
            name,
            code,
            description,
            is_system,
            is_owner,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            description = EXCLUDED.description,
            is_system = EXCLUDED.is_system,
            is_owner = EXCLUDED.is_owner,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= roles.updated_at
        RETURNING
            id,
            name,
            code,
            description,
            is_system,
            is_owner,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.code)
    .bind(input.description)
    .bind(input.is_system)
    .bind(input.is_owner)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(role) = upserted_role {
        return Ok(role);
    }

    get_role_including_deleted(pool, role_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_role_permissions(pool: &PgPool) -> Result<Vec<RolePermissionDto>, sqlx::Error> {
    sqlx::query_as::<_, RolePermissionDto>(
        r#"
        SELECT
            id,
            role_id,
            permission_code,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM role_permissions
        WHERE deleted_at IS NULL
        ORDER BY role_id ASC, permission_code ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_role_permission(
    pool: &PgPool,
    id: String,
) -> Result<Option<RolePermissionDto>, sqlx::Error> {
    sqlx::query_as::<_, RolePermissionDto>(
        r#"
        SELECT
            id,
            role_id,
            permission_code,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM role_permissions
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_role_permission_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<RolePermissionDto>, sqlx::Error> {
    sqlx::query_as::<_, RolePermissionDto>(
        r#"
        SELECT
            id,
            role_id,
            permission_code,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM role_permissions
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_role_permission(
    pool: &PgPool,
    input: RolePermissionDto,
) -> Result<RolePermissionDto, sqlx::Error> {
    let permission_id = input.id.clone();
    let upserted_permission = sqlx::query_as::<_, RolePermissionDto>(
        r#"
        INSERT INTO role_permissions (
            id,
            role_id,
            permission_code,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4::TIMESTAMPTZ, $5::TIMESTAMPTZ, $6::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            role_id = EXCLUDED.role_id,
            permission_code = EXCLUDED.permission_code,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= role_permissions.updated_at
        RETURNING
            id,
            role_id,
            permission_code,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.role_id)
    .bind(input.permission_code)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(permission) = upserted_permission {
        return Ok(permission);
    }

    get_role_permission_including_deleted(pool, permission_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_activity_logs(
    pool: &PgPool,
    limit: i64,
) -> Result<Vec<ActivityLogDto>, sqlx::Error> {
    sqlx::query_as::<_, ActivityLogDto>(
        r#"
        SELECT
            id,
            user_id,
            user_name,
            role,
            action,
            entity,
            entity_id,
            description,
            created_at::TEXT AS created_at
        FROM activity_logs
        ORDER BY created_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
}

pub async fn upsert_activity_log(
    pool: &PgPool,
    input: ActivityLogDto,
) -> Result<ActivityLogDto, sqlx::Error> {
    let log_id = input.id.clone();
    let inserted_log = sqlx::query_as::<_, ActivityLogDto>(
        r#"
        INSERT INTO activity_logs (
            id,
            user_id,
            user_name,
            role,
            action,
            entity,
            entity_id,
            description,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::TIMESTAMPTZ)
        ON CONFLICT (id) DO NOTHING
        RETURNING
            id,
            user_id,
            user_name,
            role,
            action,
            entity,
            entity_id,
            description,
            created_at::TEXT AS created_at
        "#,
    )
    .bind(input.id)
    .bind(input.user_id)
    .bind(input.user_name)
    .bind(input.role)
    .bind(input.action)
    .bind(input.entity)
    .bind(input.entity_id)
    .bind(input.description)
    .bind(input.created_at)
    .fetch_optional(pool)
    .await?;

    if let Some(log) = inserted_log {
        return Ok(log);
    }

    sqlx::query_as::<_, ActivityLogDto>(
        r#"
        SELECT
            id,
            user_id,
            user_name,
            role,
            action,
            entity,
            entity_id,
            description,
            created_at::TEXT AS created_at
        FROM activity_logs
        WHERE id = $1
        "#,
    )
    .bind(log_id)
    .fetch_optional(pool)
    .await?
    .ok_or(sqlx::Error::RowNotFound)
}
