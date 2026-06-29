use crate::models::auth::{
    ActivityLogDto, AuthUserDto, RoleDto, RolePermissionDto, ServerAuthSessionDto,
};
use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

fn hash_pin(pin: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{salt}:{pin}").as_bytes());
    format!("{:x}", hasher.finalize())
}

#[derive(Debug, Clone, FromRow)]
struct EmployeeLoginCandidate {
    id: String,
    name: String,
    email: Option<String>,
    login_role_id: Option<String>,
    role_name: Option<String>,
    role_code: Option<String>,
    role_is_active: Option<bool>,
    pin_hash: Option<String>,
    pin_salt: Option<String>,
    is_active: bool,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

async fn create_server_session(
    pool: &PgPool,
    user: AuthUserDto,
    user_id: Option<String>,
    employee_id: Option<String>,
) -> Result<ServerAuthSessionDto, sqlx::Error> {
    let token = Uuid::new_v4().to_string();
    let now = Utc::now();
    let expires_at = now + Duration::hours(12);

    sqlx::query(
        r#"
        INSERT INTO server_auth_sessions (
          token,
          user_id,
          employee_id,
          created_at,
          last_active_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $4, $5)
        "#,
    )
    .bind(&token)
    .bind(user_id)
    .bind(employee_id)
    .bind(now)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(ServerAuthSessionDto {
        token,
        user,
        expires_at: expires_at.to_rfc3339(),
    })
}

pub async fn authenticate_server_session(
    pool: &PgPool,
    email: String,
    pin: String,
) -> Result<Option<ServerAuthSessionDto>, sqlx::Error> {
    let normalized_email = email.trim().to_lowercase();
    let mut user = sqlx::query_as::<_, AuthUserDto>(
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
          AND is_active = TRUE
          AND (
            LOWER(COALESCE(email, '')) = $1 OR
            (
              email IS NULL AND
              LOWER(REGEXP_REPLACE(BTRIM(name), '\s+', '', 'g') || '@frayukti.com') = $1
            )
          )
        LIMIT 1
        "#,
    )
    .bind(&normalized_email)
    .fetch_optional(pool)
    .await?;

    if let Some(user) = user.as_mut() {
        if hash_pin(&pin, &user.pin_salt) == user.pin_hash {
            if let Some(role_id) = &user.role_id {
                let role_is_active = sqlx::query_scalar::<_, bool>(
                    r#"
                    SELECT EXISTS (
                      SELECT 1
                      FROM roles
                      WHERE id = $1
                        AND is_active = TRUE
                        AND deleted_at IS NULL
                    )
                    "#,
                )
                .bind(role_id)
                .fetch_one(pool)
                .await?;

                if !role_is_active {
                    return Ok(None);
                }
            }

            user.actor_type = Some("USER".to_string());
            return create_server_session(
                pool,
                user.clone(),
                Some(user.id.clone()),
                None,
            )
            .await
            .map(Some);
        }
    }

    let employee_candidates = sqlx::query_as::<_, EmployeeLoginCandidate>(
        r#"
        SELECT
            employee.id,
            employee.name,
            employee.email,
            employee.login_role_id,
            role.name AS role_name,
            role.code AS role_code,
            role.is_active AS role_is_active,
            employee.pin_hash,
            employee.pin_salt,
            employee.is_active,
            employee.created_at::TEXT AS created_at,
            employee.updated_at::TEXT AS updated_at,
            employee.deleted_at::TEXT AS deleted_at
        FROM employees AS employee
        LEFT JOIN roles AS role
          ON role.id = employee.login_role_id
         AND role.deleted_at IS NULL
        WHERE employee.deleted_at IS NULL
          AND employee.is_active = TRUE
          AND employee.pin_hash IS NOT NULL
          AND employee.pin_salt IS NOT NULL
          AND LOWER(COALESCE(employee.email, '')) = $1
        ORDER BY employee.created_at DESC
        "#,
    )
    .bind(&normalized_email)
    .fetch_all(pool)
    .await?;

    for employee in employee_candidates {
        let (Some(pin_hash), Some(pin_salt)) = (
            employee.pin_hash.clone(),
            employee.pin_salt.clone(),
        ) else {
            continue;
        };
        if hash_pin(&pin, &pin_salt) != pin_hash.as_str() {
            continue;
        }
        if employee.login_role_id.is_some() && employee.role_is_active != Some(true) {
            return Ok(None);
        }

        let employee_id = employee.id.clone();
        let user = AuthUserDto {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            role: employee.role_code.unwrap_or_else(|| "KASIR".to_string()),
            role_id: employee.login_role_id,
            role_name: employee.role_name,
            employee_id: Some(employee_id.clone()),
            pin_hash,
            pin_salt,
            is_active: employee.is_active,
            created_at: employee.created_at,
            updated_at: employee.updated_at,
            deleted_at: employee.deleted_at,
            actor_type: Some("EMPLOYEE".to_string()),
        };

        return create_server_session(pool, user, None, Some(employee_id))
            .await
            .map(Some);
    }

    Ok(None)
}

pub async fn revoke_server_session(pool: &PgPool, token: String) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE server_auth_sessions
        SET revoked_at = NOW()
        WHERE token = $1
          AND revoked_at IS NULL
        "#,
    )
    .bind(token)
    .execute(pool)
    .await?;

    Ok(())
}

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
