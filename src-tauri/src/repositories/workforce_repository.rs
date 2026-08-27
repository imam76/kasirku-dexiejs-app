use crate::models::workforce::{
    AuthorizedCompanyCalendarDayDto, AuthorizedEmployeeWorkScheduleAssignmentDto,
    AuthorizedLeaveBalanceLedgerDto, AuthorizedLeaveTypeDto, CancelApprovedLeaveRequestDto,
    CollectionCoverageWriteDto, CompanyCalendarDayWriteDto, EmployeeAvailabilityWriteDto,
    EmployeeWorkScheduleAssignmentWriteDto, FinalizeLeaveRequestDto, LeaveBalanceLedgerWriteDto,
    LeaveRequestActionWriteDto, LeaveRequestWriteDto, LeaveTypeWriteDto,
    ResolveCollectionCoverageDto, UpsertLeaveWorkflowDto, WorkScheduleDayWriteDto,
    WorkScheduleTemplateBundleDto, WorkScheduleTemplateWriteDto, WorkforceStateDto,
};
use sqlx::{FromRow, PgPool, Postgres, Transaction};

#[derive(Debug, FromRow)]
struct WorkforceActor {
    user_id: String,
    employee_id: Option<String>,
    role_id: Option<String>,
    legacy_role: String,
    is_owner: bool,
}

#[derive(Debug, FromRow)]
struct CoverageScope {
    status: String,
    area_id: String,
    original_employee_id: String,
    collection_date: chrono::NaiveDate,
}

async fn load_actor(
    tx: &mut Transaction<'_, Postgres>,
    session_token: &str,
) -> Result<WorkforceActor, sqlx::Error> {
    let actor = sqlx::query_as::<_, WorkforceActor>(
        r#"
        SELECT
          COALESCE(auth_user.id, employee.id) AS user_id,
          CASE
            WHEN employee.id IS NOT NULL THEN employee.id
            ELSE auth_user.employee_id
          END AS employee_id,
          COALESCE(auth_user.role_id, employee.login_role_id) AS role_id,
          COALESCE(auth_user.role, role.code, 'KASIR') AS legacy_role,
          COALESCE(role.is_owner, FALSE) OR COALESCE(auth_user.role = 'OWNER', FALSE) AS is_owner
        FROM server_auth_sessions AS session
        LEFT JOIN auth_users AS auth_user
          ON auth_user.id = session.user_id
         AND auth_user.deleted_at IS NULL
         AND auth_user.is_active = TRUE
        LEFT JOIN employees AS employee
          ON employee.id = session.employee_id
         AND employee.deleted_at IS NULL
         AND employee.is_active = TRUE
        LEFT JOIN roles AS role
          ON role.id = COALESCE(auth_user.role_id, employee.login_role_id)
         AND role.deleted_at IS NULL
         AND role.is_active = TRUE
        WHERE session.token = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > NOW()
          AND (
            (session.user_id IS NOT NULL AND auth_user.id IS NOT NULL) OR
            (session.employee_id IS NOT NULL AND employee.id IS NOT NULL)
          )
        "#,
    )
    .bind(session_token)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| {
        sqlx::Error::Protocol("Sesi server tidak valid atau kedaluwarsa.".to_string())
    })?;
    sqlx::query("UPDATE server_auth_sessions SET last_active_at = NOW() WHERE token = $1")
        .bind(session_token)
        .execute(&mut **tx)
        .await?;
    Ok(actor)
}

async fn actor_has_permission(
    tx: &mut Transaction<'_, Postgres>,
    actor: &WorkforceActor,
    permission: &str,
) -> Result<bool, sqlx::Error> {
    if actor.is_owner || actor.legacy_role == "OWNER" {
        return Ok(true);
    }
    if let Some(role_id) = &actor.role_id {
        return sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
              SELECT 1 FROM role_permissions
              WHERE role_id = $1
                AND permission_code = $2
                AND deleted_at IS NULL
            )
            "#,
        )
        .bind(role_id)
        .bind(permission)
        .fetch_one(&mut **tx)
        .await;
    }
    Ok(false)
}

async fn require_actor_permission(
    tx: &mut Transaction<'_, Postgres>,
    session_token: &str,
    permission: &str,
) -> Result<WorkforceActor, sqlx::Error> {
    let actor = load_actor(tx, session_token).await?;
    let permitted = actor_has_permission(tx, &actor, permission).await?;
    if !permitted {
        return Err(sqlx::Error::Protocol(
            "User tidak memiliki permission untuk aksi ini.".to_string(),
        ));
    }
    Ok(actor)
}

async fn upsert_coverage(
    tx: &mut Transaction<'_, Postgres>,
    row: &CollectionCoverageWriteDto,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO collection_coverage_exceptions (
            id, collection_schedule_id, area_id, area_name,
            original_employee_id, original_employee_name, collection_date,
            source_leave_request_id, status, resolution_type,
            replacement_employee_id, replacement_employee_name, rescheduled_date,
            reason, resolved_at, resolved_by, resolved_by_name,
            created_at, updated_at, deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7::DATE, $8, $9, $10,
            $11, $12, $13::DATE, $14, $15::TIMESTAMPTZ, $16, $17,
            $18::TIMESTAMPTZ, $19::TIMESTAMPTZ, NULL
        )
        ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            resolution_type = EXCLUDED.resolution_type,
            replacement_employee_id = EXCLUDED.replacement_employee_id,
            replacement_employee_name = EXCLUDED.replacement_employee_name,
            rescheduled_date = EXCLUDED.rescheduled_date,
            reason = EXCLUDED.reason,
            resolved_at = EXCLUDED.resolved_at,
            resolved_by = EXCLUDED.resolved_by,
            resolved_by_name = EXCLUDED.resolved_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&row.id)
    .bind(&row.collection_schedule_id)
    .bind(&row.area_id)
    .bind(&row.area_name)
    .bind(&row.original_employee_id)
    .bind(&row.original_employee_name)
    .bind(&row.collection_date)
    .bind(&row.source_leave_request_id)
    .bind(&row.status)
    .bind(&row.resolution_type)
    .bind(&row.replacement_employee_id)
    .bind(&row.replacement_employee_name)
    .bind(&row.rescheduled_date)
    .bind(&row.reason)
    .bind(&row.resolved_at)
    .bind(&row.resolved_by)
    .bind(&row.resolved_by_name)
    .bind(&row.created_at)
    .bind(&row.updated_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn list_workforce_state(pool: &PgPool) -> Result<WorkforceStateDto, sqlx::Error> {
    let work_schedule_templates = sqlx::query_as::<_, WorkScheduleTemplateWriteDto>(
        r#"
        SELECT id, code, name, timezone, is_active,
               created_at, updated_at
        FROM work_schedule_templates
        WHERE deleted_at IS NULL
        ORDER BY code
        "#,
    )
    .fetch_all(pool)
    .await?;
    let work_schedule_days = sqlx::query_as::<_, WorkScheduleDayWriteDto>(
        r#"
        SELECT id, template_id, weekday, is_working_day,
               start_time::TEXT AS start_time, end_time::TEXT AS end_time,
               created_at, updated_at
        FROM work_schedule_days
        WHERE deleted_at IS NULL
        ORDER BY template_id, weekday
        "#,
    )
    .fetch_all(pool)
    .await?;
    let employee_work_schedule_assignments =
        sqlx::query_as::<_, EmployeeWorkScheduleAssignmentWriteDto>(
            r#"
            SELECT id, employee_id, template_id, template_name,
                   effective_from::TEXT AS effective_from,
                   effective_until::TEXT AS effective_until,
                   created_at, updated_at
            FROM employee_work_schedule_assignments
            WHERE deleted_at IS NULL
            ORDER BY employee_id, effective_from
            "#,
        )
        .fetch_all(pool)
        .await?;
    let company_calendar_days = sqlx::query_as::<_, CompanyCalendarDayWriteDto>(
        r#"
        SELECT id, date::TEXT AS date, kind, name,
               created_at, updated_at
        FROM company_calendar_days
        WHERE deleted_at IS NULL
        ORDER BY date
        "#,
    )
    .fetch_all(pool)
    .await?;
    let leave_types = sqlx::query_as::<_, LeaveTypeWriteDto>(
        r#"
        SELECT id, code, name, is_paid, requires_balance, annual_quota_days,
               is_active, created_at, updated_at
        FROM leave_types
        WHERE deleted_at IS NULL
        ORDER BY code
        "#,
    )
    .fetch_all(pool)
    .await?;
    let leave_requests = sqlx::query_as::<_, LeaveRequestWriteDto>(
        r#"
        SELECT id, employee_id, employee_name, leave_type_id, leave_type_name,
               start_date::TEXT AS start_date, end_date::TEXT AS end_date,
               day_count, reason, status, supervisor_id, supervisor_name,
               submitted_at,
               supervisor_decided_at,
               hr_decided_at,
               decided_by, decided_by_name, decision_notes,
               created_at, updated_at
        FROM leave_requests
        WHERE deleted_at IS NULL
        ORDER BY updated_at
        "#,
    )
    .fetch_all(pool)
    .await?;
    let leave_request_actions = sqlx::query_as::<_, LeaveRequestActionWriteDto>(
        r#"
        SELECT id, leave_request_id, action, actor_user_id, actor_name, notes,
               created_at
        FROM leave_request_actions
        ORDER BY created_at
        "#,
    )
    .fetch_all(pool)
    .await?;
    let leave_balance_ledger = sqlx::query_as::<_, LeaveBalanceLedgerWriteDto>(
        r#"
        SELECT id, employee_id, leave_type_id, year, movement_kind,
               available_delta, reserved_delta, used_delta, leave_request_id,
               notes, created_at, created_by, created_by_name
        FROM leave_balance_ledger
        ORDER BY created_at
        "#,
    )
    .fetch_all(pool)
    .await?;
    let availability = sqlx::query_as::<_, EmployeeAvailabilityWriteDto>(
        r#"
        SELECT id, employee_id, date::TEXT AS date, source_type, source_id, reason,
               created_at, updated_at
        FROM employee_availability_exceptions
        WHERE deleted_at IS NULL
        ORDER BY date
        "#,
    )
    .fetch_all(pool)
    .await?;
    let coverage = sqlx::query_as::<_, CollectionCoverageWriteDto>(
        r#"
        SELECT id, collection_schedule_id, area_id, area_name,
               original_employee_id, original_employee_name,
               collection_date::TEXT AS collection_date, source_leave_request_id,
               status, resolution_type, replacement_employee_id,
               replacement_employee_name, rescheduled_date::TEXT AS rescheduled_date,
               reason, resolved_at, resolved_by,
               resolved_by_name, created_at,
               updated_at
        FROM collection_coverage_exceptions
        WHERE deleted_at IS NULL
        ORDER BY collection_date
        "#,
    )
    .fetch_all(pool)
    .await?;
    Ok(WorkforceStateDto {
        work_schedule_templates,
        work_schedule_days,
        employee_work_schedule_assignments,
        company_calendar_days,
        leave_types,
        leave_requests,
        leave_request_actions,
        leave_balance_ledger,
        availability,
        coverage,
    })
}

pub async fn upsert_work_schedule_template_bundle(
    pool: &PgPool,
    input: WorkScheduleTemplateBundleDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    require_actor_permission(&mut tx, &input.session_token, "hr.schedule.manage").await?;
    let template = &input.template;
    sqlx::query(
        r#"
        INSERT INTO work_schedule_templates (
            id, code, name, timezone, is_active, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::TIMESTAMPTZ, $7::TIMESTAMPTZ, NULL)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            timezone = EXCLUDED.timezone,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&template.id)
    .bind(&template.code)
    .bind(&template.name)
    .bind(&template.timezone)
    .bind(template.is_active)
    .bind(&template.created_at)
    .bind(&template.updated_at)
    .execute(&mut *tx)
    .await?;
    for day in &input.days {
        sqlx::query(
            r#"
            INSERT INTO work_schedule_days (
                id, template_id, weekday, is_working_day, start_time, end_time,
                created_at, updated_at, deleted_at
            )
            VALUES ($1, $2, $3, $4, $5::TIME, $6::TIME, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ, NULL)
            ON CONFLICT (id) DO UPDATE SET
                is_working_day = EXCLUDED.is_working_day,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                updated_at = EXCLUDED.updated_at,
                deleted_at = NULL
            "#,
        )
        .bind(&day.id)
        .bind(&day.template_id)
        .bind(day.weekday)
        .bind(day.is_working_day)
        .bind(&day.start_time)
        .bind(&day.end_time)
        .bind(&day.created_at)
        .bind(&day.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn upsert_employee_work_schedule_assignment(
    pool: &PgPool,
    input: AuthorizedEmployeeWorkScheduleAssignmentDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    require_actor_permission(&mut tx, &input.session_token, "hr.schedule.manage").await?;
    let row = &input.assignment;
    sqlx::query(
        r#"
        INSERT INTO employee_work_schedule_assignments (
            id, employee_id, template_id, template_name, effective_from,
            effective_until, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5::DATE, $6::DATE, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ, NULL)
        ON CONFLICT (id) DO UPDATE SET
            template_id = EXCLUDED.template_id,
            template_name = EXCLUDED.template_name,
            effective_from = EXCLUDED.effective_from,
            effective_until = EXCLUDED.effective_until,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&row.id)
    .bind(&row.employee_id)
    .bind(&row.template_id)
    .bind(&row.template_name)
    .bind(&row.effective_from)
    .bind(&row.effective_until)
    .bind(&row.created_at)
    .bind(&row.updated_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn upsert_company_calendar_day(
    pool: &PgPool,
    input: AuthorizedCompanyCalendarDayDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    require_actor_permission(&mut tx, &input.session_token, "hr.schedule.manage").await?;
    let row = &input.calendar_day;
    sqlx::query(
        r#"
        INSERT INTO company_calendar_days (
            id, date, kind, name, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2::DATE, $3, $4, $5::TIMESTAMPTZ, $6::TIMESTAMPTZ, NULL)
        ON CONFLICT (id) DO UPDATE SET
            date = EXCLUDED.date,
            kind = EXCLUDED.kind,
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&row.id)
    .bind(&row.date)
    .bind(&row.kind)
    .bind(&row.name)
    .bind(&row.created_at)
    .bind(&row.updated_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn upsert_leave_type(
    pool: &PgPool,
    input: AuthorizedLeaveTypeDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    require_actor_permission(&mut tx, &input.session_token, "hr.leave.policy.manage").await?;
    let row = &input.leave_type;
    sqlx::query(
        r#"
        INSERT INTO leave_types (
            id, code, name, is_paid, requires_balance, annual_quota_days,
            is_active, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, NULL)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            is_paid = EXCLUDED.is_paid,
            requires_balance = EXCLUDED.requires_balance,
            annual_quota_days = EXCLUDED.annual_quota_days,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&row.id)
    .bind(&row.code)
    .bind(&row.name)
    .bind(row.is_paid)
    .bind(row.requires_balance)
    .bind(row.annual_quota_days)
    .bind(row.is_active)
    .bind(&row.created_at)
    .bind(&row.updated_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn upsert_leave_balance_ledger(
    pool: &PgPool,
    input: AuthorizedLeaveBalanceLedgerDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    require_actor_permission(&mut tx, &input.session_token, "hr.leave.policy.manage").await?;
    let row = &input.ledger;
    sqlx::query(
        r#"
        INSERT INTO leave_balance_ledger (
            id, employee_id, leave_type_id, year, movement_kind,
            available_delta, reserved_delta, used_delta, leave_request_id,
            notes, created_at, created_by, created_by_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::TIMESTAMPTZ, $12, $13)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(&row.id)
    .bind(&row.employee_id)
    .bind(&row.leave_type_id)
    .bind(row.year)
    .bind(&row.movement_kind)
    .bind(row.available_delta)
    .bind(row.reserved_delta)
    .bind(row.used_delta)
    .bind(&row.leave_request_id)
    .bind(&row.notes)
    .bind(&row.created_at)
    .bind(&row.created_by)
    .bind(&row.created_by_name)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn upsert_leave_workflow(
    pool: &PgPool,
    input: UpsertLeaveWorkflowDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let actor = load_actor(&mut tx, &input.session_token).await?;
    let request = &input.workflow.request;
    if request.status == "APPROVED" {
        return Err(sqlx::Error::Protocol(
            "Approval final hanya boleh melalui transaksi approval HR.".to_string(),
        ));
    }

    let is_owner = actor.is_owner || actor.legacy_role == "OWNER";
    let is_self = actor.employee_id.as_deref() == Some(request.employee_id.as_str())
        && actor_has_permission(&mut tx, &actor, "hr.leave.self_service").await?;
    let is_direct_supervisor = actor.employee_id.as_deref() == request.supervisor_id.as_deref()
        && actor_has_permission(&mut tx, &actor, "hr.leave.supervisor_approve").await?;
    let is_hr = actor_has_permission(&mut tx, &actor, "hr.leave.hr_approve").await?;
    if !is_owner && !is_self && !is_direct_supervisor && !is_hr {
        return Err(sqlx::Error::Protocol(
            "User tidak berwenang menyinkronkan workflow cuti ini.".to_string(),
        ));
    }
    if is_self
        && !is_owner
        && !is_hr
        && !matches!(
            request.status.as_str(),
            "DRAFT" | "PENDING_SUPERVISOR" | "PENDING_HR" | "CANCELLED"
        )
    {
        return Err(sqlx::Error::Protocol(
            "Karyawan tidak boleh menetapkan hasil approval pengajuannya sendiri.".to_string(),
        ));
    }
    if is_direct_supervisor
        && !is_owner
        && !is_hr
        && request.status != "PENDING_HR"
        && request.status != "REJECTED"
    {
        return Err(sqlx::Error::Protocol(
            "Atasan hanya boleh menyetujui atau menolak pengajuan bawahannya.".to_string(),
        ));
    }

    if input
        .workflow
        .actions
        .iter()
        .any(|action| action.leave_request_id != request.id)
        || input
            .workflow
            .ledger
            .iter()
            .any(|ledger| ledger.leave_request_id.as_deref() != Some(request.id.as_str()))
    {
        return Err(sqlx::Error::Protocol(
            "Bundle workflow cuti memuat referensi request yang tidak konsisten.".to_string(),
        ));
    }

    let required_action = match request.status.as_str() {
        "DRAFT" => Some("CREATED"),
        "PENDING_SUPERVISOR" => Some("SUBMITTED"),
        "PENDING_HR" => {
            if input
                .workflow
                .actions
                .iter()
                .any(|action| action.action == "SUPERVISOR_APPROVED")
            {
                Some("SUPERVISOR_APPROVED")
            } else {
                Some("SUPERVISOR_SKIPPED")
            }
        }
        "REJECTED" => Some("REJECTED"),
        "CANCELLED" => Some("CANCELLED"),
        _ => None,
    };
    let required_action = required_action.ok_or_else(|| {
        sqlx::Error::Protocol("Status workflow cuti tidak valid untuk sinkronisasi.".to_string())
    })?;
    if !input
        .workflow
        .actions
        .iter()
        .any(|action| action.action == required_action)
    {
        return Err(sqlx::Error::Protocol(format!(
            "Audit {required_action} tidak ditemukan pada workflow cuti."
        )));
    }
    if let Some(supervisor_action) = input
        .workflow
        .actions
        .iter()
        .find(|action| action.action == "SUPERVISOR_APPROVED")
    {
        let valid_supervisor = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
              SELECT 1
              FROM auth_users auth_user
              LEFT JOIN roles role
                ON role.id = auth_user.role_id
               AND role.deleted_at IS NULL
               AND role.is_active = TRUE
              WHERE auth_user.id = $1
                AND auth_user.employee_id = $2
                AND auth_user.is_active = TRUE
                AND auth_user.deleted_at IS NULL
                AND (
                  COALESCE(role.is_owner, FALSE)
                  OR auth_user.role = 'OWNER'
                  OR EXISTS (
                    SELECT 1
                    FROM role_permissions permission
                    WHERE permission.role_id = auth_user.role_id
                      AND permission.permission_code = 'hr.leave.supervisor_approve'
                      AND permission.deleted_at IS NULL
                  )
                )
            )
            "#,
        )
        .bind(&supervisor_action.actor_user_id)
        .bind(&request.supervisor_id)
        .fetch_one(&mut *tx)
        .await?;
        if !valid_supervisor {
            return Err(sqlx::Error::Protocol(
                "Audit approval atasan tidak berasal dari atasan aktif yang berizin.".to_string(),
            ));
        }
    } else if input
        .workflow
        .actions
        .iter()
        .any(|action| action.action == "SUPERVISOR_SKIPPED")
    {
        let has_valid_supervisor = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
              SELECT 1
              FROM auth_users auth_user
              LEFT JOIN roles role
                ON role.id = auth_user.role_id
               AND role.deleted_at IS NULL
               AND role.is_active = TRUE
              WHERE auth_user.employee_id = $1
                AND auth_user.is_active = TRUE
                AND auth_user.deleted_at IS NULL
                AND (
                  COALESCE(role.is_owner, FALSE)
                  OR auth_user.role = 'OWNER'
                  OR EXISTS (
                    SELECT 1
                    FROM role_permissions permission
                    WHERE permission.role_id = auth_user.role_id
                      AND permission.permission_code = 'hr.leave.supervisor_approve'
                      AND permission.deleted_at IS NULL
                  )
                )
            )
            "#,
        )
        .bind(&request.supervisor_id)
        .fetch_one(&mut *tx)
        .await?;
        if has_valid_supervisor {
            return Err(sqlx::Error::Protocol(
                "Tahap atasan tidak boleh dilewati karena atasan aktif berizin ditemukan."
                    .to_string(),
            ));
        }
    }

    let current_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM leave_requests WHERE id = $1 FOR UPDATE",
    )
    .bind(&request.id)
    .fetch_optional(&mut *tx)
    .await?;
    let transition_allowed = match current_status.as_deref() {
        None => true,
        Some("DRAFT") => matches!(
            request.status.as_str(),
            "DRAFT" | "PENDING_SUPERVISOR" | "PENDING_HR" | "CANCELLED"
        ),
        Some("PENDING_SUPERVISOR") => matches!(
            request.status.as_str(),
            "PENDING_SUPERVISOR" | "PENDING_HR" | "REJECTED" | "CANCELLED"
        ),
        Some("PENDING_HR") => matches!(
            request.status.as_str(),
            "PENDING_HR" | "REJECTED" | "CANCELLED"
        ),
        Some("REJECTED") => request.status == "REJECTED",
        Some("CANCELLED") => request.status == "CANCELLED",
        Some("APPROVED") => false,
        Some(_) => false,
    };
    if !transition_allowed {
        return Err(sqlx::Error::Protocol(format!(
            "Transisi workflow cuti dari {} ke {} tidak valid.",
            current_status.as_deref().unwrap_or("BARU"),
            request.status
        )));
    }

    sqlx::query(
        r#"
        INSERT INTO leave_requests (
            id, employee_id, employee_name, leave_type_id, leave_type_name,
            start_date, end_date, day_count, reason, status,
            supervisor_id, supervisor_name, submitted_at, supervisor_decided_at,
            hr_decided_at, decided_by, decided_by_name, decision_notes,
            created_at, updated_at, deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6::DATE, $7::DATE, $8, $9, $10,
            $11, $12, $13::TIMESTAMPTZ, $14::TIMESTAMPTZ, $15::TIMESTAMPTZ,
            $16, $17, $18, $19::TIMESTAMPTZ, $20::TIMESTAMPTZ, NULL
        )
        ON CONFLICT (id) DO UPDATE SET
            employee_name = EXCLUDED.employee_name,
            leave_type_name = EXCLUDED.leave_type_name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            day_count = EXCLUDED.day_count,
            reason = EXCLUDED.reason,
            status = EXCLUDED.status,
            supervisor_id = EXCLUDED.supervisor_id,
            supervisor_name = EXCLUDED.supervisor_name,
            submitted_at = EXCLUDED.submitted_at,
            supervisor_decided_at = EXCLUDED.supervisor_decided_at,
            decided_by = EXCLUDED.decided_by,
            decided_by_name = EXCLUDED.decided_by_name,
            decision_notes = EXCLUDED.decision_notes,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        WHERE leave_requests.updated_at <= EXCLUDED.updated_at
        "#,
    )
    .bind(&request.id)
    .bind(&request.employee_id)
    .bind(&request.employee_name)
    .bind(&request.leave_type_id)
    .bind(&request.leave_type_name)
    .bind(&request.start_date)
    .bind(&request.end_date)
    .bind(request.day_count)
    .bind(&request.reason)
    .bind(&request.status)
    .bind(&request.supervisor_id)
    .bind(&request.supervisor_name)
    .bind(&request.submitted_at)
    .bind(&request.supervisor_decided_at)
    .bind(&request.hr_decided_at)
    .bind(&request.decided_by)
    .bind(&request.decided_by_name)
    .bind(&request.decision_notes)
    .bind(&request.created_at)
    .bind(&request.updated_at)
    .execute(&mut *tx)
    .await?;

    for action in &input.workflow.actions {
        sqlx::query(
            r#"
            INSERT INTO leave_request_actions (
                id, leave_request_id, action, actor_user_id, actor_name, notes, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(&action.id)
        .bind(&action.leave_request_id)
        .bind(&action.action)
        .bind(&action.actor_user_id)
        .bind(&action.actor_name)
        .bind(&action.notes)
        .bind(&action.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for ledger in &input.workflow.ledger {
        sqlx::query(
            r#"
            INSERT INTO leave_balance_ledger (
                id, employee_id, leave_type_id, year, movement_kind,
                available_delta, reserved_delta, used_delta, leave_request_id,
                notes, created_at, created_by, created_by_name
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::TIMESTAMPTZ, $12, $13)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(&ledger.id)
        .bind(&ledger.employee_id)
        .bind(&ledger.leave_type_id)
        .bind(ledger.year)
        .bind(&ledger.movement_kind)
        .bind(ledger.available_delta)
        .bind(ledger.reserved_delta)
        .bind(ledger.used_delta)
        .bind(&ledger.leave_request_id)
        .bind(&ledger.notes)
        .bind(&ledger.created_at)
        .bind(&ledger.created_by)
        .bind(&ledger.created_by_name)
        .execute(&mut *tx)
        .await?;
    }

    let requires_balance = sqlx::query_scalar::<_, bool>(
        "SELECT requires_balance FROM leave_types WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(&request.leave_type_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| sqlx::Error::Protocol("Jenis cuti tidak ditemukan di server.".to_string()))?;
    if requires_balance {
        let year = request
            .start_date
            .get(0..4)
            .and_then(|value| value.parse::<i32>().ok())
            .unwrap_or_default();
        let balance = sqlx::query_as::<_, (f64, f64)>(
            r#"
            SELECT
              COALESCE(SUM(available_delta), 0)::DOUBLE PRECISION,
              COALESCE(SUM(reserved_delta), 0)::DOUBLE PRECISION
            FROM leave_balance_ledger
            WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3
            "#,
        )
        .bind(&request.employee_id)
        .bind(&request.leave_type_id)
        .bind(year)
        .fetch_one(&mut *tx)
        .await?;
        if balance.0 < 0.0 || balance.1 < 0.0 {
            return Err(sqlx::Error::Protocol(
                "Saldo cuti tidak mencukupi atau reservasi tidak konsisten.".to_string(),
            ));
        }
    }

    tx.commit().await?;
    Ok(())
}

pub async fn finalize_leave_request(
    pool: &PgPool,
    input: FinalizeLeaveRequestDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let actor =
        require_actor_permission(&mut tx, &input.session_token, "hr.leave.hr_approve").await?;
    let request = &input.request;
    if actor.employee_id.as_deref() == Some(request.employee_id.as_str()) {
        if !actor.is_owner && actor.legacy_role != "OWNER" {
            return Err(sqlx::Error::Protocol(
                "Pengaju tidak boleh memberi approval final untuk cutinya sendiri.".to_string(),
            ));
        }
        if request
            .decision_notes
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
        {
            return Err(sqlx::Error::Protocol(
                "Owner wajib mengisi alasan ketika melakukan self-approval.".to_string(),
            ));
        }
    }
    let has_supervisor_audit = input.actions.iter().any(|action| {
        action.action == "SUPERVISOR_APPROVED" || action.action == "SUPERVISOR_SKIPPED"
    });
    if !has_supervisor_audit {
        return Err(sqlx::Error::Protocol(
            "Audit approval atasan atau alasan supervisor dilewati tidak ditemukan.".to_string(),
        ));
    }

    let current_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM leave_requests WHERE id = $1 FOR UPDATE",
    )
    .bind(&request.id)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(status) = current_status {
        if status != "PENDING_HR" && status != "APPROVED" {
            return Err(sqlx::Error::Protocol(format!(
                "Pengajuan tidak dapat di-approve dari status {status}."
            )));
        }
    }

    sqlx::query(
        r#"
        INSERT INTO leave_types (
            id, code, name, is_paid, requires_balance, annual_quota_days,
            is_active, created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, NULL)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            is_paid = EXCLUDED.is_paid,
            requires_balance = EXCLUDED.requires_balance,
            annual_quota_days = EXCLUDED.annual_quota_days,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&input.leave_type.id)
    .bind(&input.leave_type.code)
    .bind(&input.leave_type.name)
    .bind(input.leave_type.is_paid)
    .bind(input.leave_type.requires_balance)
    .bind(input.leave_type.annual_quota_days)
    .bind(input.leave_type.is_active)
    .bind(&input.leave_type.created_at)
    .bind(&input.leave_type.updated_at)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO leave_requests (
            id, employee_id, employee_name, leave_type_id, leave_type_name,
            start_date, end_date, day_count, reason, status,
            supervisor_id, supervisor_name, submitted_at, supervisor_decided_at,
            hr_decided_at, decided_by, decided_by_name, decision_notes,
            created_at, updated_at, deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6::DATE, $7::DATE, $8, $9, $10,
            $11, $12, $13::TIMESTAMPTZ, $14::TIMESTAMPTZ, $15::TIMESTAMPTZ,
            $16, $17, $18, $19::TIMESTAMPTZ, $20::TIMESTAMPTZ, NULL
        )
        ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            supervisor_decided_at = EXCLUDED.supervisor_decided_at,
            hr_decided_at = EXCLUDED.hr_decided_at,
            decided_by = EXCLUDED.decided_by,
            decided_by_name = EXCLUDED.decided_by_name,
            decision_notes = EXCLUDED.decision_notes,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
        "#,
    )
    .bind(&request.id)
    .bind(&request.employee_id)
    .bind(&request.employee_name)
    .bind(&request.leave_type_id)
    .bind(&request.leave_type_name)
    .bind(&request.start_date)
    .bind(&request.end_date)
    .bind(request.day_count)
    .bind(&request.reason)
    .bind(&request.status)
    .bind(&request.supervisor_id)
    .bind(&request.supervisor_name)
    .bind(&request.submitted_at)
    .bind(&request.supervisor_decided_at)
    .bind(&request.hr_decided_at)
    .bind(&request.decided_by)
    .bind(&request.decided_by_name)
    .bind(&request.decision_notes)
    .bind(&request.created_at)
    .bind(&request.updated_at)
    .execute(&mut *tx)
    .await?;

    for action in &input.actions {
        sqlx::query(
            r#"
            INSERT INTO leave_request_actions (
                id, leave_request_id, action, actor_user_id, actor_name, notes, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(&action.id)
        .bind(&action.leave_request_id)
        .bind(&action.action)
        .bind(&action.actor_user_id)
        .bind(&action.actor_name)
        .bind(&action.notes)
        .bind(&action.created_at)
        .execute(&mut *tx)
        .await?;
    }

    for ledger in &input.ledger {
        sqlx::query(
            r#"
            INSERT INTO leave_balance_ledger (
                id, employee_id, leave_type_id, year, movement_kind,
                available_delta, reserved_delta, used_delta, leave_request_id,
                notes, created_at, created_by, created_by_name
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::TIMESTAMPTZ, $12, $13)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(&ledger.id)
        .bind(&ledger.employee_id)
        .bind(&ledger.leave_type_id)
        .bind(ledger.year)
        .bind(&ledger.movement_kind)
        .bind(ledger.available_delta)
        .bind(ledger.reserved_delta)
        .bind(ledger.used_delta)
        .bind(&ledger.leave_request_id)
        .bind(&ledger.notes)
        .bind(&ledger.created_at)
        .bind(&ledger.created_by)
        .bind(&ledger.created_by_name)
        .execute(&mut *tx)
        .await?;
    }

    if input.leave_type.requires_balance {
        let balance = sqlx::query_as::<_, (f64, f64)>(
            r#"
            SELECT
              COALESCE(SUM(available_delta), 0)::DOUBLE PRECISION,
              COALESCE(SUM(reserved_delta), 0)::DOUBLE PRECISION
            FROM leave_balance_ledger
            WHERE employee_id = $1
              AND leave_type_id = $2
              AND year = $3
            "#,
        )
        .bind(&input.request.employee_id)
        .bind(&input.request.leave_type_id)
        .bind(
            input
                .request
                .start_date
                .get(0..4)
                .and_then(|year| year.parse::<i32>().ok())
                .unwrap_or_default(),
        )
        .fetch_one(&mut *tx)
        .await?;
        if balance.0 < 0.0 || balance.1 < 0.0 {
            return Err(sqlx::Error::Protocol(
                "Saldo cuti tidak mencukupi atau reservasi tidak konsisten.".to_string(),
            ));
        }
    }

    for row in &input.availability {
        sqlx::query(
            r#"
            INSERT INTO employee_availability_exceptions (
                id, employee_id, date, source_type, source_id, reason,
                created_at, updated_at, deleted_at
            )
            VALUES ($1, $2, $3::DATE, $4, $5, $6, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ, NULL)
            ON CONFLICT (id) DO UPDATE SET
                reason = EXCLUDED.reason,
                updated_at = EXCLUDED.updated_at,
                deleted_at = NULL
            "#,
        )
        .bind(&row.id)
        .bind(&row.employee_id)
        .bind(&row.date)
        .bind(&row.source_type)
        .bind(&row.source_id)
        .bind(&row.reason)
        .bind(&row.created_at)
        .bind(&row.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for row in &input.coverage {
        upsert_coverage(&mut tx, row).await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn resolve_collection_coverage(
    pool: &PgPool,
    input: ResolveCollectionCoverageDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let actor = require_actor_permission(
        &mut tx,
        &input.session_token,
        "cooperative.collection.coverage.manage",
    )
    .await?;
    let coverage = &input.coverage;
    if coverage.resolved_by.as_deref() != Some(actor.user_id.as_str()) {
        return Err(sqlx::Error::Protocol(
            "Actor penyelesaian coverage tidak sesuai dengan sesi server.".to_string(),
        ));
    }
    let current = sqlx::query_as::<_, CoverageScope>(
        r#"
        SELECT status, area_id, original_employee_id, collection_date
        FROM collection_coverage_exceptions
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(&coverage.id)
    .fetch_optional(&mut *tx)
    .await?;
    let current = current
        .ok_or_else(|| sqlx::Error::Protocol("Konflik coverage tidak ditemukan.".to_string()))?;
    if current.status != "OPEN" && current.status != "RESOLVED" {
        return Err(sqlx::Error::Protocol(
            "Konflik coverage tidak ditemukan atau sudah dibatalkan.".to_string(),
        ));
    }
    match coverage.resolution_type.as_deref() {
        Some("SUBSTITUTE") => {
            let replacement_id = coverage.replacement_employee_id.as_deref().ok_or_else(|| {
                sqlx::Error::Protocol("Petugas pengganti wajib dipilih.".to_string())
            })?;
            if replacement_id == current.original_employee_id {
                return Err(sqlx::Error::Protocol(
                    "Petugas pengganti harus berbeda dari petugas asal.".to_string(),
                ));
            }
            let valid = sqlx::query_scalar::<_, bool>(
                r#"
                SELECT EXISTS (
                  SELECT 1
                  FROM employees employee
                  JOIN employee_areas assignment
                    ON assignment.employee_id = employee.id
                   AND assignment.area_id = $2
                   AND assignment.deleted_at IS NULL
                   AND COALESCE(assignment.effective_from, assignment.created_at::DATE) <= $3
                   AND (assignment.effective_until IS NULL OR assignment.effective_until >= $3)
                  WHERE employee.id = $1
                    AND employee.is_active = TRUE
                    AND employee.deleted_at IS NULL
                    AND NOT EXISTS (
                      SELECT 1 FROM employee_availability_exceptions unavailable
                      WHERE unavailable.employee_id = employee.id
                        AND unavailable.date = $3
                        AND unavailable.deleted_at IS NULL
                    )
                )
                "#,
            )
            .bind(replacement_id)
            .bind(&current.area_id)
            .bind(current.collection_date)
            .fetch_one(&mut *tx)
            .await?;
            if !valid {
                return Err(sqlx::Error::Protocol(
                    "Petugas pengganti tidak aktif, tidak tersedia, atau tidak memiliki assignment area.".to_string(),
                ));
            }
        }
        Some("RESCHEDULE") => {
            let rescheduled_date = coverage.rescheduled_date.as_deref().ok_or_else(|| {
                sqlx::Error::Protocol("Tanggal pengganti wajib dipilih.".to_string())
            })?;
            let valid = sqlx::query_scalar::<_, bool>(
                r#"
                SELECT
                  $4::DATE > $3
                  AND EXISTS (
                    SELECT 1
                    FROM employees employee
                    JOIN employee_areas assignment
                      ON assignment.employee_id = employee.id
                     AND assignment.area_id = $2
                     AND assignment.deleted_at IS NULL
                     AND COALESCE(assignment.effective_from, assignment.created_at::DATE) <= $4::DATE
                     AND (assignment.effective_until IS NULL OR assignment.effective_until >= $4::DATE)
                    WHERE employee.id = $1
                      AND employee.is_active = TRUE
                      AND employee.deleted_at IS NULL
                      AND NOT EXISTS (
                        SELECT 1 FROM employee_availability_exceptions unavailable
                        WHERE unavailable.employee_id = employee.id
                          AND unavailable.date = $4::DATE
                          AND unavailable.deleted_at IS NULL
                      )
                  )
                "#,
            )
            .bind(&current.original_employee_id)
            .bind(&current.area_id)
            .bind(current.collection_date)
            .bind(rescheduled_date)
            .fetch_one(&mut *tx)
            .await?;
            if !valid {
                return Err(sqlx::Error::Protocol(
                    "Tanggal pengganti atau ketersediaan petugas asal tidak valid.".to_string(),
                ));
            }
        }
        _ => {
            return Err(sqlx::Error::Protocol(
                "Resolusi coverage tidak valid.".to_string(),
            ));
        }
    }
    upsert_coverage(&mut tx, coverage).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn cancel_approved_leave_request(
    pool: &PgPool,
    input: CancelApprovedLeaveRequestDto,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    require_actor_permission(&mut tx, &input.session_token, "hr.leave.hr_approve").await?;
    let current_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM leave_requests WHERE id = $1 FOR UPDATE",
    )
    .bind(&input.request.id)
    .fetch_optional(&mut *tx)
    .await?;
    if current_status.as_deref() != Some("APPROVED")
        && current_status.as_deref() != Some("CANCELLED")
    {
        return Err(sqlx::Error::Protocol(
            "Hanya cuti approved yang dapat dibatalkan melalui transaksi ini.".to_string(),
        ));
    }

    let executed_coverage = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM collection_coverage_exceptions
          WHERE source_leave_request_id = $1
            AND status = 'RESOLVED'
            AND collection_date < (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
            AND deleted_at IS NULL
        )
        "#,
    )
    .bind(&input.request.id)
    .fetch_one(&mut *tx)
    .await?;
    if executed_coverage {
        return Err(sqlx::Error::Protocol(
            "Coverage yang sudah berjalan harus dikoreksi dengan record baru.".to_string(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE leave_requests
        SET status = 'CANCELLED',
            decision_notes = $2,
            updated_at = $3::TIMESTAMPTZ
        WHERE id = $1
        "#,
    )
    .bind(&input.request.id)
    .bind(&input.request.decision_notes)
    .bind(&input.request.updated_at)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO leave_request_actions (
            id, leave_request_id, action, actor_user_id, actor_name, notes, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(&input.action.id)
    .bind(&input.action.leave_request_id)
    .bind(&input.action.action)
    .bind(&input.action.actor_user_id)
    .bind(&input.action.actor_name)
    .bind(&input.action.notes)
    .bind(&input.action.created_at)
    .execute(&mut *tx)
    .await?;

    if let Some(ledger) = &input.ledger {
        sqlx::query(
            r#"
            INSERT INTO leave_balance_ledger (
                id, employee_id, leave_type_id, year, movement_kind,
                available_delta, reserved_delta, used_delta, leave_request_id,
                notes, created_at, created_by, created_by_name
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::TIMESTAMPTZ, $12, $13)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(&ledger.id)
        .bind(&ledger.employee_id)
        .bind(&ledger.leave_type_id)
        .bind(ledger.year)
        .bind(&ledger.movement_kind)
        .bind(ledger.available_delta)
        .bind(ledger.reserved_delta)
        .bind(ledger.used_delta)
        .bind(&ledger.leave_request_id)
        .bind(&ledger.notes)
        .bind(&ledger.created_at)
        .bind(&ledger.created_by)
        .bind(&ledger.created_by_name)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        UPDATE employee_availability_exceptions
        SET deleted_at = $2::TIMESTAMPTZ,
            updated_at = $2::TIMESTAMPTZ
        WHERE source_type = 'LEAVE'
          AND source_id = $1
          AND deleted_at IS NULL
        "#,
    )
    .bind(&input.request.id)
    .bind(&input.request.updated_at)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        UPDATE collection_coverage_exceptions
        SET status = 'CANCELLED',
            updated_at = $2::TIMESTAMPTZ
        WHERE source_leave_request_id = $1
          AND status <> 'CANCELLED'
          AND deleted_at IS NULL
        "#,
    )
    .bind(&input.request.id)
    .bind(&input.request.updated_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}
