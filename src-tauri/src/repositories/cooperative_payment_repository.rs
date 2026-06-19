use crate::models::cooperative::{
    CooperativeLoanCollectionEventDto, CooperativeLoanInstallmentDto, CooperativeLoanPaymentDto,
    CooperativePostingAccountDto, PostCooperativeLoanPaymentInput,
    PostCooperativeLoanPaymentResult, RecordCooperativeLoanCollectionEventInput,
    RecordCooperativeLoanCollectionEventResult,
};
use crate::repositories::{
    cooperative_repository, finance_transaction_repository, journal_entry_repository,
};
use chrono::{DateTime, Duration, Utc};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use thiserror::Error;
use uuid::Uuid;

const PAYMENT_PERMISSION: &str = "COOPERATIVE_PAYMENT_CREATE";
const ALL_AREA_PERMISSION: &str = "COOPERATIVE_AREA_ALL";
const FINANCE_PERMISSION: &str = "FINANCE_ACCESS";
const RECEIVABLE_ACCOUNT_KEY: &str = "COOPERATIVE_LOAN_RECEIVABLE";
const INTEREST_ACCOUNT_KEY: &str = "COOPERATIVE_LOAN_INTEREST_INCOME";
const PENALTY_ACCOUNT_KEY: &str = "COOPERATIVE_LOAN_PENALTY_INCOME";
const AMOUNT_TOLERANCE: f64 = 0.01;

#[derive(Debug, Error)]
pub enum CooperativeMutationError {
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, FromRow)]
struct ActorAccess {
    user_id: String,
    user_name: String,
    employee_id: Option<String>,
    role_id: Option<String>,
    legacy_role: String,
    is_owner: bool,
}

#[derive(Debug, Clone, FromRow)]
struct LockedLoan {
    id: String,
    loan_number: String,
    member_id: String,
    member_number: String,
    member_name: String,
    outstanding_principal_amount: f64,
    outstanding_interest_amount: f64,
    outstanding_penalty_amount: f64,
    status: String,
    officer_id: Option<String>,
    officer_name: Option<String>,
    officer_position: Option<String>,
    area_id: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
struct PaymentPolicy {
    max_backdate_days: i32,
    max_future_minutes: i32,
}

fn round_currency(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn is_positive_amount(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

async fn require_actor(
    tx: &mut Transaction<'_, Postgres>,
    session_token: &str,
    permission: &str,
) -> Result<ActorAccess, CooperativeMutationError> {
    let actor = sqlx::query_as::<_, ActorAccess>(
        r#"
        SELECT
          auth_user.id AS user_id,
          auth_user.name AS user_name,
          auth_user.employee_id,
          auth_user.role_id,
          auth_user.role AS legacy_role,
          COALESCE(role.is_owner, FALSE) OR auth_user.role = 'OWNER' AS is_owner
        FROM server_auth_sessions AS session
        JOIN auth_users AS auth_user
          ON auth_user.id = session.user_id
        LEFT JOIN roles AS role
          ON role.id = auth_user.role_id
         AND role.deleted_at IS NULL
        WHERE session.token = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > NOW()
          AND auth_user.deleted_at IS NULL
          AND auth_user.is_active = TRUE
          AND (
            auth_user.role_id IS NULL OR
            (role.id IS NOT NULL AND role.is_active = TRUE)
          )
        "#,
    )
    .bind(session_token)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::Unauthorized(
            "Sesi server tidak valid atau sudah kedaluwarsa. Silakan login ulang.".to_string(),
        )
    })?;

    let permitted = if actor.is_owner {
        true
    } else if let Some(role_id) = &actor.role_id {
        sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
              SELECT 1
              FROM role_permissions
              WHERE role_id = $1
                AND permission_code = $2
                AND deleted_at IS NULL
            )
            "#,
        )
        .bind(role_id)
        .bind(permission)
        .fetch_one(&mut **tx)
        .await?
    } else {
        matches!(
            (actor.legacy_role.as_str(), permission),
            ("OWNER", _)
                | ("ADMIN", "COOPERATIVE_PAYMENT_CREATE")
                | ("ADMIN", "COOPERATIVE_AREA_ALL")
                | ("ADMIN", "FINANCE_ACCESS")
        )
    };

    if !permitted {
        return Err(CooperativeMutationError::Unauthorized(
            "User tidak memiliki izin untuk aksi ini.".to_string(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE server_auth_sessions
        SET last_active_at = NOW()
        WHERE token = $1
        "#,
    )
    .bind(session_token)
    .execute(&mut **tx)
    .await?;

    Ok(actor)
}

async fn actor_has_permission(
    tx: &mut Transaction<'_, Postgres>,
    actor: &ActorAccess,
    permission: &str,
) -> Result<bool, CooperativeMutationError> {
    if actor.is_owner {
        return Ok(true);
    }
    if let Some(role_id) = &actor.role_id {
        return Ok(sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
              SELECT 1
              FROM role_permissions
              WHERE role_id = $1
                AND permission_code = $2
                AND deleted_at IS NULL
            )
            "#,
        )
        .bind(role_id)
        .bind(permission)
        .fetch_one(&mut **tx)
        .await?);
    }

    Ok(actor.legacy_role == "ADMIN"
        && matches!(
            permission,
            ALL_AREA_PERMISSION | FINANCE_PERMISSION | PAYMENT_PERMISSION
        ))
}

fn assert_actor_scope(
    actor: &ActorAccess,
    can_access_all_areas: bool,
    loan: &LockedLoan,
) -> Result<(), CooperativeMutationError> {
    if can_access_all_areas {
        return Ok(());
    }

    let actor_employee_id = actor.employee_id.as_deref().unwrap_or(&actor.user_id);
    if loan.officer_id.as_deref() != Some(actor_employee_id) {
        return Err(CooperativeMutationError::Unauthorized(
            "Pinjaman berada di luar scope petugas yang sedang login.".to_string(),
        ));
    }

    if loan.area_id.is_none() {
        return Err(CooperativeMutationError::Invalid(
            "Pinjaman belum memiliki snapshot area penagihan.".to_string(),
        ));
    }

    Ok(())
}

async fn get_locked_installment(
    tx: &mut Transaction<'_, Postgres>,
    installment_id: &str,
) -> Result<CooperativeLoanInstallmentDto, CooperativeMutationError> {
    sqlx::query_as::<_, CooperativeLoanInstallmentDto>(
        r#"
        SELECT
          id,
          loan_id,
          loan_number,
          member_id,
          member_number,
          member_name,
          installment_number,
          due_date,
          principal_amount,
          interest_amount,
          penalty_amount,
          paid_principal_amount,
          paid_interest_amount,
          paid_penalty_amount,
          status,
          paid_at,
          collection_status,
          follow_up_date,
          collection_notes,
          last_contacted_at,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM cooperative_loan_installments
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(installment_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::NotFound("Jadwal angsuran tidak ditemukan.".to_string())
    })
}

async fn get_locked_loan(
    tx: &mut Transaction<'_, Postgres>,
    loan_id: &str,
) -> Result<LockedLoan, CooperativeMutationError> {
    sqlx::query_as::<_, LockedLoan>(
        r#"
        SELECT
          id,
          loan_number,
          member_id,
          member_number,
          member_name,
          outstanding_principal_amount,
          outstanding_interest_amount,
          outstanding_penalty_amount,
          status,
          officer_id,
          officer_name,
          officer_position,
          area_id
        FROM cooperative_loans
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(loan_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| CooperativeMutationError::NotFound("Pinjaman tidak ditemukan.".to_string()))
}

async fn get_posting_account_by_id(
    tx: &mut Transaction<'_, Postgres>,
    account_id: &str,
) -> Result<CooperativePostingAccountDto, CooperativeMutationError> {
    let account = sqlx::query_as::<_, CooperativePostingAccountDto>(
        r#"
        SELECT
          id,
          account_key,
          code,
          name,
          account_type,
          is_postable,
          is_active,
          is_cash_or_bank,
          updated_at::TEXT AS updated_at
        FROM cooperative_posting_accounts
        WHERE id = $1
        FOR SHARE
        "#,
    )
    .bind(account_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::Invalid(
            "Akun pembayaran belum terdaftar pada registry posting server.".to_string(),
        )
    })?;

    if !account.is_active
        || !account.is_postable
        || !account.is_cash_or_bank
        || account.account_type != "ASSET"
    {
        return Err(CooperativeMutationError::Invalid(
            "Akun pembayaran harus terdaftar sebagai kas/bank aktif dan postable.".to_string(),
        ));
    }

    Ok(account)
}

async fn get_posting_account_by_key(
    tx: &mut Transaction<'_, Postgres>,
    account_key: &str,
    expected_type: &str,
) -> Result<CooperativePostingAccountDto, CooperativeMutationError> {
    let account = sqlx::query_as::<_, CooperativePostingAccountDto>(
        r#"
        SELECT
          id,
          account_key,
          code,
          name,
          account_type,
          is_postable,
          is_active,
          is_cash_or_bank,
          updated_at::TEXT AS updated_at
        FROM cooperative_posting_accounts
        WHERE account_key = $1
        FOR SHARE
        "#,
    )
    .bind(account_key)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::Invalid(format!(
            "Akun posting {account_key} belum terdaftar pada server."
        ))
    })?;

    if !account.is_active || !account.is_postable || account.account_type != expected_type {
        return Err(CooperativeMutationError::Invalid(format!(
            "Akun posting {account_key} tidak valid."
        )));
    }

    Ok(account)
}

pub async fn register_posting_accounts(
    pool: &PgPool,
    session_token: String,
    accounts: Vec<CooperativePostingAccountDto>,
) -> Result<Vec<CooperativePostingAccountDto>, CooperativeMutationError> {
    let mut tx = pool.begin().await?;
    let actor = require_actor(&mut tx, &session_token, FINANCE_PERMISSION).await?;

    for account in &accounts {
        if account.id.trim().is_empty()
            || account.code.trim().is_empty()
            || account.name.trim().is_empty()
        {
            return Err(CooperativeMutationError::Invalid(
                "Data registry akun tidak lengkap.".to_string(),
            ));
        }
        if !matches!(
            account.account_type.as_str(),
            "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "CONTRA_REVENUE" | "EXPENSE"
        ) {
            return Err(CooperativeMutationError::Invalid(
                "Tipe akun registry tidak valid.".to_string(),
            ));
        }

        if let Some(account_key) = &account.account_key {
            sqlx::query(
                r#"
                UPDATE cooperative_posting_accounts
                SET account_key = NULL
                WHERE account_key = $1
                  AND id <> $2
                "#,
            )
            .bind(account_key)
            .bind(&account.id)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query(
            r#"
            INSERT INTO cooperative_posting_accounts (
              id,
              account_key,
              code,
              name,
              account_type,
              is_postable,
              is_active,
              is_cash_or_bank,
              updated_at,
              updated_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::TIMESTAMPTZ, $10)
            ON CONFLICT (id) DO UPDATE SET
              account_key = EXCLUDED.account_key,
              code = EXCLUDED.code,
              name = EXCLUDED.name,
              account_type = EXCLUDED.account_type,
              is_postable = EXCLUDED.is_postable,
              is_active = EXCLUDED.is_active,
              is_cash_or_bank = EXCLUDED.is_cash_or_bank,
              updated_at = EXCLUDED.updated_at,
              updated_by = EXCLUDED.updated_by
            WHERE EXCLUDED.updated_at >= cooperative_posting_accounts.updated_at
            "#,
        )
        .bind(&account.id)
        .bind(&account.account_key)
        .bind(&account.code)
        .bind(&account.name)
        .bind(&account.account_type)
        .bind(account.is_postable)
        .bind(account.is_active)
        .bind(account.is_cash_or_bank)
        .bind(&account.updated_at)
        .bind(&actor.user_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(accounts)
}

async fn load_payment_result(
    pool: &PgPool,
    payment: CooperativeLoanPaymentDto,
) -> Result<PostCooperativeLoanPaymentResult, CooperativeMutationError> {
    let installment_id = payment.installment_id.clone().ok_or_else(|| {
        CooperativeMutationError::Invalid(
            "Pembayaran tidak memiliki referensi angsuran.".to_string(),
        )
    })?;
    let finance_transaction_id = payment.finance_transaction_id.clone().ok_or_else(|| {
        CooperativeMutationError::Invalid(
            "Pembayaran tidak memiliki transaksi finance.".to_string(),
        )
    })?;
    let journal_entry_id = payment.journal_entry_id.clone().ok_or_else(|| {
        CooperativeMutationError::Invalid("Pembayaran tidak memiliki jurnal.".to_string())
    })?;

    let installment =
        cooperative_repository::get_cooperative_loan_installment(pool, installment_id)
            .await?
            .ok_or_else(|| {
                CooperativeMutationError::NotFound("Angsuran tidak ditemukan.".to_string())
            })?;
    let loan = cooperative_repository::get_cooperative_loan(pool, payment.loan_id.clone())
        .await?
        .ok_or_else(|| {
            CooperativeMutationError::NotFound("Pinjaman tidak ditemukan.".to_string())
        })?;
    let finance_transaction =
        finance_transaction_repository::get_finance_transaction(pool, finance_transaction_id)
            .await?
            .ok_or_else(|| {
                CooperativeMutationError::NotFound(
                    "Transaksi finance pembayaran tidak ditemukan.".to_string(),
                )
            })?;
    let journal_entry = journal_entry_repository::get_journal_entry_bundle(pool, journal_entry_id)
        .await?
        .ok_or_else(|| {
            CooperativeMutationError::NotFound("Jurnal pembayaran tidak ditemukan.".to_string())
        })?;

    Ok(PostCooperativeLoanPaymentResult {
        payment,
        installment,
        loan,
        finance_transaction,
        journal_entry,
    })
}

pub async fn post_loan_payment(
    pool: &PgPool,
    input: PostCooperativeLoanPaymentInput,
) -> Result<PostCooperativeLoanPaymentResult, CooperativeMutationError> {
    if input.idempotency_key.trim().is_empty() {
        return Err(CooperativeMutationError::Invalid(
            "Idempotency key pembayaran wajib diisi.".to_string(),
        ));
    }
    if !is_positive_amount(input.amount) {
        return Err(CooperativeMutationError::Invalid(
            "Nominal pembayaran wajib lebih dari 0.".to_string(),
        ));
    }
    if !matches!(input.payment_method.as_str(), "TUNAI" | "NON_TUNAI") {
        return Err(CooperativeMutationError::Invalid(
            "Metode pembayaran tidak valid.".to_string(),
        ));
    }

    let payment_date = DateTime::parse_from_rfc3339(&input.payment_date)
        .map_err(|_| {
            CooperativeMutationError::Invalid("Tanggal pembayaran tidak valid.".to_string())
        })?
        .with_timezone(&Utc);
    let now = Utc::now();

    let mut tx = pool.begin().await?;
    let actor = require_actor(&mut tx, &input.session_token, PAYMENT_PERMISSION).await?;
    let can_access_all_areas = actor_has_permission(&mut tx, &actor, ALL_AREA_PERMISSION).await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(&input.idempotency_key)
        .execute(&mut *tx)
        .await?;

    if let Some(existing_payment) = sqlx::query_as::<_, CooperativeLoanPaymentDto>(
        r#"
        SELECT
          id, payment_number, payment_type, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at, finance_transaction_id, journal_entry_id,
          reversal_of_payment_id, reversal_payment_id,
          reversal_finance_transaction_id, reversal_journal_entry_id, reversed_at,
          reversal_reason, notes, created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at, created_by, created_by_name, updated_by,
          updated_by_name, idempotency_key
        FROM cooperative_loan_payments
        WHERE idempotency_key = $1
        "#,
    )
    .bind(&input.idempotency_key)
    .fetch_optional(&mut *tx)
    .await?
    {
        let existing_loan = get_locked_loan(&mut tx, &existing_payment.loan_id).await?;
        assert_actor_scope(&actor, can_access_all_areas, &existing_loan)?;
        let expected_collector_id = input
            .collector_id
            .clone()
            .or_else(|| existing_loan.officer_id.clone());
        let same_payment_date =
            sqlx::query_scalar::<_, bool>("SELECT $1::TIMESTAMPTZ = $2::TIMESTAMPTZ")
                .bind(&existing_payment.payment_date)
                .bind(&input.payment_date)
                .fetch_one(&mut *tx)
                .await?;
        let request_matches = existing_payment.installment_id.as_deref()
            == Some(input.installment_id.as_str())
            && (existing_payment.amount - round_currency(input.amount)).abs() <= AMOUNT_TOLERANCE
            && same_payment_date
            && existing_payment.payment_method.as_deref() == Some(input.payment_method.as_str())
            && existing_payment.cash_account_id.as_deref() == Some(input.cash_account_id.as_str())
            && existing_payment.payment_channel == input.payment_channel
            && existing_payment.collector_id == expected_collector_id
            && existing_payment.notes == input.notes;
        if !request_matches {
            return Err(CooperativeMutationError::Conflict(
                "Idempotency key sudah digunakan untuk request pembayaran yang berbeda."
                    .to_string(),
            ));
        }

        tx.commit().await?;
        return load_payment_result(pool, existing_payment).await;
    }

    let policy = sqlx::query_as::<_, PaymentPolicy>(
        r#"
        SELECT max_backdate_days, max_future_minutes
        FROM cooperative_payment_policy
        WHERE id = 'default'
        "#,
    )
    .fetch_one(&mut *tx)
    .await?;
    if payment_date < now - Duration::days(i64::from(policy.max_backdate_days)) {
        return Err(CooperativeMutationError::Invalid(format!(
            "Tanggal pembayaran melewati batas backdate {} hari.",
            policy.max_backdate_days
        )));
    }
    if payment_date > now + Duration::minutes(i64::from(policy.max_future_minutes)) {
        return Err(CooperativeMutationError::Invalid(
            "Tanggal pembayaran tidak boleh berada di masa depan.".to_string(),
        ));
    }

    let installment = get_locked_installment(&mut tx, &input.installment_id).await?;
    if installment.status == "PAID" {
        return Err(CooperativeMutationError::Conflict(
            "Angsuran ini sudah lunas.".to_string(),
        ));
    }
    let loan = get_locked_loan(&mut tx, &installment.loan_id).await?;
    if loan.status != "DISBURSED" {
        return Err(CooperativeMutationError::Conflict(
            "Pembayaran hanya dapat diposting untuk pinjaman aktif.".to_string(),
        ));
    }
    assert_actor_scope(&actor, can_access_all_areas, &loan)?;

    let collector_id = input
        .collector_id
        .clone()
        .or_else(|| loan.officer_id.clone());
    if loan.officer_id.is_none() && collector_id.is_some() {
        return Err(CooperativeMutationError::Invalid(
            "Kolektor tidak dapat diverifikasi karena pinjaman tidak memiliki snapshot petugas."
                .to_string(),
        ));
    }
    if loan.officer_id.is_some() && collector_id != loan.officer_id {
        return Err(CooperativeMutationError::Invalid(
            "Kolektor harus sesuai dengan snapshot petugas pinjaman.".to_string(),
        ));
    }

    let cash_account = get_posting_account_by_id(&mut tx, &input.cash_account_id).await?;
    let receivable_account =
        get_posting_account_by_key(&mut tx, RECEIVABLE_ACCOUNT_KEY, "ASSET").await?;
    let interest_account =
        get_posting_account_by_key(&mut tx, INTEREST_ACCOUNT_KEY, "REVENUE").await?;
    let penalty_account =
        get_posting_account_by_key(&mut tx, PENALTY_ACCOUNT_KEY, "REVENUE").await?;

    let remaining_penalty =
        round_currency((installment.penalty_amount - installment.paid_penalty_amount).max(0.0));
    let remaining_interest =
        round_currency((installment.interest_amount - installment.paid_interest_amount).max(0.0));
    let remaining_principal =
        round_currency((installment.principal_amount - installment.paid_principal_amount).max(0.0));
    let remaining_total =
        round_currency(remaining_penalty + remaining_interest + remaining_principal);
    let payment_amount = round_currency(input.amount);
    if payment_amount - remaining_total > AMOUNT_TOLERANCE {
        return Err(CooperativeMutationError::Conflict(
            "Nominal pembayaran melebihi sisa tagihan angsuran.".to_string(),
        ));
    }

    let mut unallocated = payment_amount;
    let penalty_amount = round_currency(unallocated.min(remaining_penalty));
    unallocated = round_currency(unallocated - penalty_amount);
    let interest_amount = round_currency(unallocated.min(remaining_interest));
    unallocated = round_currency(unallocated - interest_amount);
    let principal_amount = round_currency(unallocated.min(remaining_principal));
    unallocated = round_currency(unallocated - principal_amount);
    if unallocated > AMOUNT_TOLERANCE {
        return Err(CooperativeMutationError::Invalid(
            "Alokasi pembayaran tidak valid.".to_string(),
        ));
    }

    let paid_principal = round_currency(installment.paid_principal_amount + principal_amount);
    let paid_interest = round_currency(installment.paid_interest_amount + interest_amount);
    let paid_penalty = round_currency(installment.paid_penalty_amount + penalty_amount);
    let next_remaining = round_currency(remaining_total - payment_amount);
    let installment_status = if next_remaining <= AMOUNT_TOLERANCE {
        "PAID"
    } else {
        "PARTIAL"
    };
    let now_text = now.to_rfc3339();
    let payment_date_text = payment_date.to_rfc3339();

    sqlx::query(
        r#"
        UPDATE cooperative_loan_installments
        SET
          paid_principal_amount = $2,
          paid_interest_amount = $3,
          paid_penalty_amount = $4,
          status = $5,
          paid_at = CASE WHEN $5 = 'PAID' THEN $6 ELSE NULL END,
          collection_status = CASE WHEN $5 = 'PAID' THEN 'NONE' ELSE collection_status END,
          follow_up_date = CASE WHEN $5 = 'PAID' THEN NULL ELSE follow_up_date END,
          collection_notes = CASE WHEN $5 = 'PAID' THEN NULL ELSE collection_notes END,
          last_contacted_at = CASE WHEN $5 = 'PAID' THEN NULL ELSE last_contacted_at END,
          updated_at = $7::TIMESTAMPTZ
        WHERE id = $1
        "#,
    )
    .bind(&installment.id)
    .bind(paid_principal)
    .bind(paid_interest)
    .bind(paid_penalty)
    .bind(installment_status)
    .bind(&payment_date_text)
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;

    let outstanding_principal =
        round_currency(loan.outstanding_principal_amount - principal_amount);
    let outstanding_interest = round_currency(loan.outstanding_interest_amount - interest_amount);
    let outstanding_penalty = round_currency(loan.outstanding_penalty_amount - penalty_amount);
    if outstanding_principal < -AMOUNT_TOLERANCE
        || outstanding_interest < -AMOUNT_TOLERANCE
        || outstanding_penalty < -AMOUNT_TOLERANCE
    {
        return Err(CooperativeMutationError::Conflict(
            "Pembayaran membuat outstanding pinjaman negatif.".to_string(),
        ));
    }

    let unpaid_installment_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM cooperative_loan_installments
        WHERE loan_id = $1
          AND status <> 'PAID'
        "#,
    )
    .bind(&loan.id)
    .fetch_one(&mut *tx)
    .await?;
    let loan_status = if outstanding_principal <= AMOUNT_TOLERANCE
        && outstanding_interest <= AMOUNT_TOLERANCE
        && outstanding_penalty <= AMOUNT_TOLERANCE
        && unpaid_installment_count == 0
    {
        "PAID_OFF"
    } else {
        "DISBURSED"
    };

    sqlx::query(
        r#"
        UPDATE cooperative_loans
        SET
          outstanding_principal_amount = $2,
          outstanding_interest_amount = $3,
          outstanding_penalty_amount = $4,
          status = $5,
          updated_at = $6::TIMESTAMPTZ,
          updated_by = $7,
          updated_by_name = $8
        WHERE id = $1
        "#,
    )
    .bind(&loan.id)
    .bind(outstanding_principal.max(0.0))
    .bind(outstanding_interest.max(0.0))
    .bind(outstanding_penalty.max(0.0))
    .bind(loan_status)
    .bind(&now_text)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .execute(&mut *tx)
    .await?;

    let payment_id = Uuid::new_v4().to_string();
    let finance_transaction_id = Uuid::new_v4().to_string();
    let journal_entry_id = Uuid::new_v4().to_string();
    let payment_number = format!(
        "KSP-ANG-{}-{}",
        payment_date.format("%Y%m%d"),
        &payment_id[..8]
    );
    let journal_number = format!(
        "JRN-{}-{}",
        payment_date.format("%Y%m%d"),
        &journal_entry_id[..8]
    );
    let description = format!(
        "Pembayaran angsuran {} {} - {}",
        loan.loan_number, loan.member_number, loan.member_name
    );

    sqlx::query(
        r#"
        INSERT INTO cooperative_loan_payments (
          id, payment_number, payment_type, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at, finance_transaction_id, journal_entry_id,
          notes, created_at, updated_at, created_by, created_by_name, updated_by,
          updated_by_name, idempotency_key
        )
        VALUES (
          $1, $2, 'PAYMENT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, 'POSTED', $14, $15, $16, $17, $18, $19, $20, $21,
          $22, $23, $24::TIMESTAMPTZ, $25, $26, $27, $24::TIMESTAMPTZ,
          $24::TIMESTAMPTZ, $22, $23, $22, $23, $28
        )
        "#,
    )
    .bind(&payment_id)
    .bind(&payment_number)
    .bind(&loan.id)
    .bind(&loan.loan_number)
    .bind(&installment.id)
    .bind(&loan.member_id)
    .bind(&loan.member_number)
    .bind(&loan.member_name)
    .bind(payment_amount)
    .bind(principal_amount)
    .bind(interest_amount)
    .bind(penalty_amount)
    .bind(&payment_date_text)
    .bind(&cash_account.id)
    .bind(&cash_account.code)
    .bind(&cash_account.name)
    .bind(&input.payment_method)
    .bind(&input.payment_channel)
    .bind(&collector_id)
    .bind(&loan.officer_name)
    .bind(&loan.officer_position)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(&now_text)
    .bind(&finance_transaction_id)
    .bind(&journal_entry_id)
    .bind(&input.notes)
    .bind(&input.idempotency_key)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO finance_transactions (
          id, type, category, amount, description, reference_id, account_id,
          account_code, account_name, account_type, payment_method,
          payment_channel, cash_account_id, cash_account_code, cash_account_name,
          version, created_by, created_by_name, updated_by, updated_by_name,
          created_at, updated_at
        )
        VALUES (
          $1, 'INCOME', 'KSP_PEMBAYARAN_ANGSURAN', $2, $3, $4, $5, $6, $7,
          'ASSET', $8, $9, $5, $6, $7, 1, $10, $11, $10, $11,
          $12::TIMESTAMPTZ, $13::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&finance_transaction_id)
    .bind(payment_amount)
    .bind(&description)
    .bind(&payment_id)
    .bind(&cash_account.id)
    .bind(&cash_account.code)
    .bind(&cash_account.name)
    .bind(&input.payment_method)
    .bind(&input.payment_channel)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(&payment_date_text)
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO journal_entries (
          id, entry_number, entry_date, status, source_type, source_id,
          source_number, source_event, description, total_debit, total_credit,
          posted_at, version, created_by, created_by_name, updated_by,
          updated_by_name, created_at, updated_at
        )
        VALUES (
          $1, $2, $3::TIMESTAMPTZ, 'POSTED', 'COOPERATIVE_LOAN', $4, $5,
          'COOPERATIVE_LOAN_PAYMENT_POSTED', $6, $7, $7, $8::TIMESTAMPTZ, 1,
          $9, $10, $9, $10, $8::TIMESTAMPTZ, $8::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&journal_entry_id)
    .bind(&journal_number)
    .bind(&payment_date_text)
    .bind(&payment_id)
    .bind(&payment_number)
    .bind(format!(
        "Pembayaran angsuran {} untuk {}",
        payment_number, loan.loan_number
    ))
    .bind(payment_amount)
    .bind(&now_text)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .execute(&mut *tx)
    .await?;

    insert_journal_line(
        &mut tx,
        &journal_entry_id,
        &cash_account,
        payment_amount,
        0.0,
        "Kas/bank bertambah dari pembayaran angsuran",
        &now_text,
    )
    .await?;
    insert_journal_line(
        &mut tx,
        &journal_entry_id,
        &receivable_account,
        0.0,
        principal_amount,
        "Piutang pinjaman anggota berkurang",
        &now_text,
    )
    .await?;
    if interest_amount > AMOUNT_TOLERANCE {
        insert_journal_line(
            &mut tx,
            &journal_entry_id,
            &interest_account,
            0.0,
            interest_amount,
            "Pendapatan bunga pinjaman anggota",
            &now_text,
        )
        .await?;
    }
    if penalty_amount > AMOUNT_TOLERANCE {
        insert_journal_line(
            &mut tx,
            &journal_entry_id,
            &penalty_account,
            0.0,
            penalty_amount,
            "Pendapatan denda pinjaman anggota",
            &now_text,
        )
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO activity_logs (
          id, user_id, user_name, role, action, entity, entity_id, description,
          created_at
        )
        VALUES ($1, $2, $3, $4, 'COOPERATIVE_LOAN_PAYMENT_RECORDED',
          'cooperativeLoanPayments', $5, $6, $7::TIMESTAMPTZ)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(&actor.legacy_role)
    .bind(&payment_id)
    .bind(format!(
        "{} mencatat pembayaran {} sebesar {}.",
        actor.user_name, payment_number, payment_amount
    ))
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let payment = cooperative_repository::get_cooperative_loan_payment(pool, payment_id)
        .await?
        .ok_or_else(|| {
            CooperativeMutationError::NotFound(
                "Pembayaran yang baru diposting tidak ditemukan.".to_string(),
            )
        })?;
    load_payment_result(pool, payment).await
}

async fn insert_journal_line(
    tx: &mut Transaction<'_, Postgres>,
    journal_entry_id: &str,
    account: &CooperativePostingAccountDto,
    debit: f64,
    credit: f64,
    description: &str,
    created_at: &str,
) -> Result<(), CooperativeMutationError> {
    if debit <= AMOUNT_TOLERANCE && credit <= AMOUNT_TOLERANCE {
        return Ok(());
    }

    sqlx::query(
        r#"
        INSERT INTO journal_entry_lines (
          id, journal_entry_id, account_id, account_code, account_name,
          account_type, debit, credit, description, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::TIMESTAMPTZ)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(journal_entry_id)
    .bind(&account.id)
    .bind(&account.code)
    .bind(&account.name)
    .bind(&account.account_type)
    .bind(round_currency(debit))
    .bind(round_currency(credit))
    .bind(description)
    .bind(created_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn list_collection_events(
    pool: &PgPool,
) -> Result<Vec<CooperativeLoanCollectionEventDto>, CooperativeMutationError> {
    Ok(sqlx::query_as::<_, CooperativeLoanCollectionEventDto>(
        r#"
        SELECT
          id,
          installment_id,
          loan_id,
          loan_number,
          member_id,
          member_number,
          member_name,
          collection_status,
          follow_up_date::TEXT AS follow_up_date,
          collection_notes,
          contacted_at::TEXT AS contacted_at,
          actor_user_id,
          actor_user_name,
          actor_employee_id,
          created_at::TEXT AS created_at
        FROM cooperative_loan_collection_events
        ORDER BY contacted_at DESC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?)
}

pub async fn record_collection_event(
    pool: &PgPool,
    input: RecordCooperativeLoanCollectionEventInput,
) -> Result<RecordCooperativeLoanCollectionEventResult, CooperativeMutationError> {
    if input.event_id.trim().is_empty() {
        return Err(CooperativeMutationError::Invalid(
            "ID event penagihan wajib diisi.".to_string(),
        ));
    }
    if !matches!(
        input.collection_status.as_str(),
        "PROMISED_TO_PAY" | "UNABLE_TO_PAY" | "FOLLOW_UP"
    ) {
        return Err(CooperativeMutationError::Invalid(
            "Status tindak lanjut tidak valid.".to_string(),
        ));
    }
    let notes = input.collection_notes.trim();
    if notes.len() < 3 {
        return Err(CooperativeMutationError::Invalid(
            "Catatan tindak lanjut minimal 3 karakter.".to_string(),
        ));
    }
    if input.collection_status != "UNABLE_TO_PAY" && input.follow_up_date.is_none() {
        return Err(CooperativeMutationError::Invalid(
            "Tanggal follow-up wajib diisi.".to_string(),
        ));
    }
    if let Some(follow_up_date) = &input.follow_up_date {
        DateTime::parse_from_rfc3339(follow_up_date).map_err(|_| {
            CooperativeMutationError::Invalid("Tanggal follow-up tidak valid.".to_string())
        })?;
    }

    let mut tx = pool.begin().await?;
    let actor = require_actor(&mut tx, &input.session_token, PAYMENT_PERMISSION).await?;
    let can_access_all_areas = actor_has_permission(&mut tx, &actor, ALL_AREA_PERMISSION).await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(&input.event_id)
        .execute(&mut *tx)
        .await?;

    if let Some(existing_event) = sqlx::query_as::<_, CooperativeLoanCollectionEventDto>(
        r#"
        SELECT
          id, installment_id, loan_id, loan_number, member_id, member_number,
          member_name, collection_status, follow_up_date::TEXT AS follow_up_date,
          collection_notes, contacted_at::TEXT AS contacted_at, actor_user_id,
          actor_user_name, actor_employee_id, created_at::TEXT AS created_at
        FROM cooperative_loan_collection_events
        WHERE id = $1
        "#,
    )
    .bind(&input.event_id)
    .fetch_optional(&mut *tx)
    .await?
    {
        let existing_loan = get_locked_loan(&mut tx, &existing_event.loan_id).await?;
        assert_actor_scope(&actor, can_access_all_areas, &existing_loan)?;
        let same_follow_up_date = sqlx::query_scalar::<_, bool>(
            "SELECT $1::TIMESTAMPTZ IS NOT DISTINCT FROM $2::TIMESTAMPTZ",
        )
        .bind(&existing_event.follow_up_date)
        .bind(&input.follow_up_date)
        .fetch_one(&mut *tx)
        .await?;
        let request_matches = existing_event.installment_id == input.installment_id
            && existing_event.collection_status == input.collection_status
            && existing_event.collection_notes == notes
            && same_follow_up_date;
        if !request_matches {
            return Err(CooperativeMutationError::Conflict(
                "ID event sudah digunakan untuk tindak lanjut yang berbeda.".to_string(),
            ));
        }

        tx.commit().await?;
        let installment = cooperative_repository::get_cooperative_loan_installment(
            pool,
            existing_event.installment_id.clone(),
        )
        .await?
        .ok_or_else(|| {
            CooperativeMutationError::NotFound("Angsuran tidak ditemukan.".to_string())
        })?;
        return Ok(RecordCooperativeLoanCollectionEventResult {
            event: existing_event,
            installment,
        });
    }

    let installment = get_locked_installment(&mut tx, &input.installment_id).await?;
    if installment.status == "PAID" {
        return Err(CooperativeMutationError::Conflict(
            "Angsuran yang sudah lunas tidak dapat ditindaklanjuti.".to_string(),
        ));
    }
    let loan = get_locked_loan(&mut tx, &installment.loan_id).await?;
    if loan.status != "DISBURSED" {
        return Err(CooperativeMutationError::Conflict(
            "Tindak lanjut hanya dapat dicatat untuk pinjaman aktif.".to_string(),
        ));
    }
    assert_actor_scope(&actor, can_access_all_areas, &loan)?;

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO cooperative_loan_collection_events (
          id, installment_id, loan_id, loan_number, member_id, member_number,
          member_name, collection_status, follow_up_date, collection_notes,
          contacted_at, actor_user_id, actor_user_name, actor_employee_id,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::TIMESTAMPTZ, $10,
          $11::TIMESTAMPTZ, $12, $13, $14, $11::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&input.event_id)
    .bind(&installment.id)
    .bind(&loan.id)
    .bind(&loan.loan_number)
    .bind(&loan.member_id)
    .bind(&loan.member_number)
    .bind(&loan.member_name)
    .bind(&input.collection_status)
    .bind(&input.follow_up_date)
    .bind(notes)
    .bind(&now)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(actor.employee_id.as_deref().unwrap_or(&actor.user_id))
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE cooperative_loan_installments
        SET
          collection_status = $2,
          follow_up_date = $3,
          collection_notes = $4,
          last_contacted_at = $5,
          updated_at = $5::TIMESTAMPTZ
        WHERE id = $1
        "#,
    )
    .bind(&installment.id)
    .bind(&input.collection_status)
    .bind(&input.follow_up_date)
    .bind(notes)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO activity_logs (
          id, user_id, user_name, role, action, entity, entity_id, description,
          created_at
        )
        VALUES ($1, $2, $3, $4,
          'COOPERATIVE_LOAN_INSTALLMENT_COLLECTION_RECORDED',
          'cooperativeLoanCollectionEvents', $5, $6, $7::TIMESTAMPTZ)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(&actor.legacy_role)
    .bind(&input.event_id)
    .bind(format!(
        "{} mencatat tindak lanjut {} angsuran {} dengan status {}.",
        actor.user_name, loan.loan_number, installment.installment_number, input.collection_status
    ))
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let event = sqlx::query_as::<_, CooperativeLoanCollectionEventDto>(
        r#"
        SELECT
          id, installment_id, loan_id, loan_number, member_id, member_number,
          member_name, collection_status, follow_up_date::TEXT AS follow_up_date,
          collection_notes, contacted_at::TEXT AS contacted_at, actor_user_id,
          actor_user_name, actor_employee_id, created_at::TEXT AS created_at
        FROM cooperative_loan_collection_events
        WHERE id = $1
        "#,
    )
    .bind(&input.event_id)
    .fetch_one(pool)
    .await?;
    let installment =
        cooperative_repository::get_cooperative_loan_installment(pool, input.installment_id)
            .await?
            .ok_or_else(|| {
                CooperativeMutationError::NotFound("Angsuran tidak ditemukan.".to_string())
            })?;

    Ok(RecordCooperativeLoanCollectionEventResult { event, installment })
}
