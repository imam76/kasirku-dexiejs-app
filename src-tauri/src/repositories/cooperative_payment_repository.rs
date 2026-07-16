use crate::models::cooperative::{
    CooperativeLoanCollectionEventDto, CooperativeLoanInstallmentDto, CooperativeLoanPaymentDto,
    CooperativePaymentApprovalRequestDto, CooperativePaymentInstallmentReconciliationDto,
    CooperativePostingAccountDto, DecideCooperativePaymentApprovalInput,
    PostCooperativeLoanPaymentBatchOutcome, PostCooperativeLoanPaymentBatchResult,
    PostCooperativeLoanPaymentInput, PostCooperativeLoanPaymentOutcome,
    PostCooperativeLoanPaymentResult, RecordCooperativeLoanCollectionEventInput,
    RecordCooperativeLoanCollectionEventResult, RequestCooperativeLoanPaymentReversalInput,
};
use crate::repositories::{
    cooperative_repository, finance_transaction_repository, journal_entry_repository,
};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use thiserror::Error;
use uuid::Uuid;

const PAYMENT_PERMISSION: &str = "COOPERATIVE_PAYMENT_CREATE";
const PAYMENT_APPROVAL_PERMISSION: &str = "COOPERATIVE_PAYMENT_APPROVE";
const ALL_AREA_PERMISSION: &str = "COOPERATIVE_AREA_ALL";
const FINANCE_PERMISSION: &str = "FINANCE_ACCESS";
const RECEIVABLE_ACCOUNT_KEY: &str = "COOPERATIVE_LOAN_RECEIVABLE";
const INTEREST_ACCOUNT_KEY: &str = "COOPERATIVE_LOAN_INTEREST_INCOME";
const PENALTY_ACCOUNT_KEY: &str = "COOPERATIVE_LOAN_PENALTY_INCOME";
const IPTW_EXPENSE_ACCOUNT_KEY: &str = "COOPERATIVE_IPTW_EXPENSE";
const IPTW_FINANCE_CATEGORY: &str = "KSP_INSENTIF_PEMBAYARAN_TEPAT_WAKTU";
const IPTW_RATE: f64 = 0.05;
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
    principal_amount: f64,
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

#[derive(Debug, Clone)]
struct InstallmentPaymentAllocation {
    installment: CooperativeLoanInstallmentDto,
    principal_amount: f64,
    interest_amount: f64,
    penalty_amount: f64,
    total_amount: f64,
    remaining_total_amount: f64,
}

#[derive(Debug, Clone, FromRow)]
struct IptwPayout {
    id: String,
    amount: f64,
    cash_account_id: Option<String>,
    cash_account_code: Option<String>,
    cash_account_name: Option<String>,
    payment_method: Option<String>,
    payment_channel: Option<String>,
    account_id: Option<String>,
    account_code: Option<String>,
    account_name: Option<String>,
    account_type: Option<String>,
}

macro_rules! cooperative_payment_approval_select {
    () => {
        r#"
        SELECT
          id,
          action_type,
          status,
          payment_id,
          installment_id,
          idempotency_key,
          amount,
          payment_date::TEXT AS payment_date,
          payment_method,
          cash_account_id,
          payment_channel,
          collector_id,
          maker_reason,
          maker_user_id,
          maker_user_name,
          requested_at::TEXT AS requested_at,
          checker_user_id,
          checker_user_name,
          checker_notes,
          decided_at::TEXT AS decided_at,
          result_payment_id,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM cooperative_payment_approval_requests
        "#
    };
}

fn round_currency(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn is_positive_amount(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

fn allocate_payment_to_installments(
    installments: Vec<CooperativeLoanInstallmentDto>,
    amount: f64,
) -> Result<Vec<InstallmentPaymentAllocation>, CooperativeMutationError> {
    let mut unallocated = round_currency(amount);
    if !is_positive_amount(unallocated) {
        return Err(CooperativeMutationError::Invalid(
            "Nominal pembayaran wajib lebih dari 0.".to_string(),
        ));
    }

    let total_remaining = round_currency(installments.iter().fold(0.0, |sum, installment| {
        let remaining_penalty =
            round_currency((installment.penalty_amount - installment.paid_penalty_amount).max(0.0));
        let remaining_interest = round_currency(
            (installment.interest_amount - installment.paid_interest_amount).max(0.0),
        );
        let remaining_principal = round_currency(
            (installment.principal_amount - installment.paid_principal_amount).max(0.0),
        );
        sum + remaining_penalty + remaining_interest + remaining_principal
    }));

    if unallocated - total_remaining > AMOUNT_TOLERANCE {
        return Err(CooperativeMutationError::Conflict(
            "Nominal pembayaran melebihi total sisa pinjaman.".to_string(),
        ));
    }

    let mut allocations = Vec::new();
    for installment in installments {
        if unallocated <= AMOUNT_TOLERANCE {
            break;
        }

        let remaining_penalty =
            round_currency((installment.penalty_amount - installment.paid_penalty_amount).max(0.0));
        let remaining_interest = round_currency(
            (installment.interest_amount - installment.paid_interest_amount).max(0.0),
        );
        let remaining_principal = round_currency(
            (installment.principal_amount - installment.paid_principal_amount).max(0.0),
        );
        let remaining_total =
            round_currency(remaining_penalty + remaining_interest + remaining_principal);
        if remaining_total <= AMOUNT_TOLERANCE {
            continue;
        }

        let allocation_total = round_currency(unallocated.min(remaining_total));
        let mut installment_unallocated = allocation_total;
        let penalty_amount = round_currency(installment_unallocated.min(remaining_penalty));
        installment_unallocated = round_currency(installment_unallocated - penalty_amount);
        let interest_amount = round_currency(installment_unallocated.min(remaining_interest));
        installment_unallocated = round_currency(installment_unallocated - interest_amount);
        let principal_amount = round_currency(installment_unallocated.min(remaining_principal));
        installment_unallocated = round_currency(installment_unallocated - principal_amount);
        if installment_unallocated > AMOUNT_TOLERANCE {
            return Err(CooperativeMutationError::Invalid(
                "Alokasi pembayaran tidak valid.".to_string(),
            ));
        }

        allocations.push(InstallmentPaymentAllocation {
            installment,
            principal_amount,
            interest_amount,
            penalty_amount,
            total_amount: round_currency(principal_amount + interest_amount + penalty_amount),
            remaining_total_amount: round_currency(remaining_total - allocation_total),
        });
        unallocated = round_currency(unallocated - allocation_total);
    }

    if unallocated > AMOUNT_TOLERANCE {
        return Err(CooperativeMutationError::Invalid(
            "Alokasi pembayaran angsuran tidak valid.".to_string(),
        ));
    }
    if allocations.is_empty() {
        return Err(CooperativeMutationError::Conflict(
            "Tidak ada sisa angsuran yang dapat dialokasikan.".to_string(),
        ));
    }

    Ok(allocations)
}

fn cooperative_date(value: &str) -> Result<chrono::NaiveDate, CooperativeMutationError> {
    let jakarta_offset = FixedOffset::east_opt(7 * 60 * 60).ok_or_else(|| {
        CooperativeMutationError::Invalid("Zona waktu Asia/Jakarta tidak valid.".to_string())
    })?;
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&jakarta_offset).date_naive())
        .map_err(|_| CooperativeMutationError::Invalid("Tanggal angsuran tidak valid.".to_string()))
}

async fn require_actor(
    tx: &mut Transaction<'_, Postgres>,
    session_token: &str,
    permission: &str,
) -> Result<ActorAccess, CooperativeMutationError> {
    let actor = sqlx::query_as::<_, ActorAccess>(
        r#"
        SELECT
          COALESCE(auth_user.id, employee.id) AS user_id,
          COALESCE(auth_user.name, employee.name) AS user_name,
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
        WHERE session.token = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > NOW()
          AND (
            (session.user_id IS NOT NULL AND auth_user.id IS NOT NULL) OR
            (session.employee_id IS NOT NULL AND employee.id IS NOT NULL)
          )
          AND (
            COALESCE(auth_user.role_id, employee.login_role_id) IS NULL OR
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
                | ("ADMIN", "COOPERATIVE_PAYMENT_APPROVE")
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
            ALL_AREA_PERMISSION
                | FINANCE_PERMISSION
                | PAYMENT_PERMISSION
                | PAYMENT_APPROVAL_PERMISSION
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

async fn get_locked_payable_installments_for_loan(
    tx: &mut Transaction<'_, Postgres>,
    loan_id: &str,
) -> Result<Vec<CooperativeLoanInstallmentDto>, CooperativeMutationError> {
    Ok(sqlx::query_as::<_, CooperativeLoanInstallmentDto>(
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
        WHERE loan_id = $1
          AND status <> 'PAID'
        ORDER BY due_date ASC, installment_number ASC, created_at ASC, id ASC
        FOR UPDATE
        "#,
    )
    .bind(loan_id)
    .fetch_all(&mut **tx)
    .await?)
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
          principal_amount,
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

async fn get_locked_payment(
    tx: &mut Transaction<'_, Postgres>,
    payment_id: &str,
) -> Result<CooperativeLoanPaymentDto, CooperativeMutationError> {
    sqlx::query_as::<_, CooperativeLoanPaymentDto>(
        r#"
        SELECT
          id, payment_number, payment_type, payment_group_id, payment_group_number,
          payment_group_sequence, payment_group_total, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at::TEXT AS posted_at, finance_transaction_id,
          journal_entry_id, reversal_of_payment_id, reversal_payment_id,
          reversal_finance_transaction_id, reversal_journal_entry_id, reversed_at,
          reversal_reason, notes, created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at, created_by, created_by_name, updated_by,
          updated_by_name, idempotency_key
        FROM cooperative_loan_payments
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(payment_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::NotFound("Pembayaran angsuran tidak ditemukan.".to_string())
    })
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

async fn load_payment_batch_result(
    pool: &PgPool,
    payments: Vec<CooperativeLoanPaymentDto>,
    payment_group_id: Option<String>,
    payment_group_number: Option<String>,
) -> Result<PostCooperativeLoanPaymentBatchResult, CooperativeMutationError> {
    if payments.is_empty() {
        return Err(CooperativeMutationError::Invalid(
            "Batch pembayaran tidak memiliki baris pembayaran.".to_string(),
        ));
    }

    let mut loaded_results = Vec::with_capacity(payments.len());
    for payment in payments {
        loaded_results.push(load_payment_result(pool, payment).await?);
    }

    let loan = loaded_results
        .last()
        .map(|result| result.loan.clone())
        .ok_or_else(|| {
            CooperativeMutationError::NotFound("Pinjaman tidak ditemukan.".to_string())
        })?;

    Ok(PostCooperativeLoanPaymentBatchResult {
        payments: loaded_results
            .iter()
            .map(|result| result.payment.clone())
            .collect(),
        installments: loaded_results
            .iter()
            .map(|result| result.installment.clone())
            .collect(),
        loan,
        finance_transactions: loaded_results
            .iter()
            .map(|result| result.finance_transaction.clone())
            .collect(),
        journal_entries: loaded_results
            .into_iter()
            .map(|result| result.journal_entry)
            .collect(),
        payment_group_id,
        payment_group_number,
    })
}

async fn is_loan_eligible_for_iptw(
    tx: &mut Transaction<'_, Postgres>,
    loan_id: &str,
) -> Result<bool, CooperativeMutationError> {
    let installments = sqlx::query_as::<_, (String, String, Option<String>)>(
        r#"
        SELECT status, due_date, paid_at
        FROM cooperative_loan_installments
        WHERE loan_id = $1
        ORDER BY installment_number
        "#,
    )
    .bind(loan_id)
    .fetch_all(&mut **tx)
    .await?;

    if installments.is_empty() {
        return Ok(false);
    }

    for (status, due_date, paid_at) in installments {
        let Some(paid_at) = paid_at else {
            return Ok(false);
        };
        if status != "PAID" || cooperative_date(&paid_at)? > cooperative_date(&due_date)? {
            return Ok(false);
        }
    }

    Ok(true)
}

#[allow(clippy::too_many_arguments)]
async fn create_iptw_payout(
    tx: &mut Transaction<'_, Postgres>,
    loan: &LockedLoan,
    payment_id: &str,
    payment_number: &str,
    payment_date: &str,
    cash_account: &CooperativePostingAccountDto,
    expense_account: &CooperativePostingAccountDto,
    payment_method: &str,
    payment_channel: &Option<String>,
    actor: &ActorAccess,
    now_text: &str,
) -> Result<(), CooperativeMutationError> {
    let amount = round_currency(loan.principal_amount * IPTW_RATE);
    if amount <= AMOUNT_TOLERANCE {
        return Ok(());
    }

    let already_paid = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM finance_transactions
          WHERE category = $1
            AND type = 'EXPENSE'
            AND reference_id = $2
            AND deleted_at IS NULL
        )
        "#,
    )
    .bind(IPTW_FINANCE_CATEGORY)
    .bind(payment_id)
    .fetch_one(&mut **tx)
    .await?;
    if already_paid {
        return Ok(());
    }

    let finance_transaction_id = Uuid::new_v4().to_string();
    let journal_entry_id = Uuid::new_v4().to_string();
    let journal_number = format!(
        "JRN-{}-{}",
        Utc::now().format("%Y%m%d"),
        &journal_entry_id[..8]
    );
    let description = format!(
        "IPTW 5% pelunasan tepat waktu {} {} - {}",
        loan.loan_number, loan.member_number, loan.member_name
    );

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
          $1, 'EXPENSE', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, 1, $15, $16, $15, $16,
          $17::TIMESTAMPTZ, $18::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&finance_transaction_id)
    .bind(IPTW_FINANCE_CATEGORY)
    .bind(amount)
    .bind(&description)
    .bind(payment_id)
    .bind(&expense_account.id)
    .bind(&expense_account.code)
    .bind(&expense_account.name)
    .bind(&expense_account.account_type)
    .bind(payment_method)
    .bind(payment_channel)
    .bind(&cash_account.id)
    .bind(&cash_account.code)
    .bind(&cash_account.name)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(payment_date)
    .bind(now_text)
    .execute(&mut **tx)
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
          'COOPERATIVE_IPTW_PAID', $6, $7, $7, $8::TIMESTAMPTZ, 1,
          $9, $10, $9, $10, $8::TIMESTAMPTZ, $8::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&journal_entry_id)
    .bind(&journal_number)
    .bind(payment_date)
    .bind(&finance_transaction_id)
    .bind(payment_number)
    .bind(&description)
    .bind(amount)
    .bind(now_text)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .execute(&mut **tx)
    .await?;

    insert_journal_line(
        tx,
        &journal_entry_id,
        expense_account,
        amount,
        0.0,
        "Beban IPTW anggota",
        now_text,
    )
    .await?;
    insert_journal_line(
        tx,
        &journal_entry_id,
        cash_account,
        0.0,
        amount,
        "Kas/bank berkurang karena pembayaran IPTW",
        now_text,
    )
    .await?;

    Ok(())
}

pub async fn post_loan_payment(
    pool: &PgPool,
    input: PostCooperativeLoanPaymentInput,
) -> Result<PostCooperativeLoanPaymentOutcome, CooperativeMutationError> {
    post_loan_payment_internal(pool, input, None).await
}

pub async fn post_loan_payment_batch(
    pool: &PgPool,
    input: PostCooperativeLoanPaymentInput,
) -> Result<PostCooperativeLoanPaymentBatchOutcome, CooperativeMutationError> {
    post_loan_payment_batch_internal(pool, input, None).await
}

async fn post_loan_payment_batch_internal(
    pool: &PgPool,
    input: PostCooperativeLoanPaymentInput,
    approved_request_id: Option<&str>,
) -> Result<PostCooperativeLoanPaymentBatchOutcome, CooperativeMutationError> {
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

    let parsed_payment_date = DateTime::parse_from_rfc3339(&input.payment_date).map_err(|_| {
        CooperativeMutationError::Invalid("Tanggal pembayaran tidak valid.".to_string())
    })?;
    let payment_date = parsed_payment_date.with_timezone(&Utc);
    let now = Utc::now();

    let mut tx = pool.begin().await?;
    let required_permission = if approved_request_id.is_some() {
        PAYMENT_APPROVAL_PERMISSION
    } else {
        PAYMENT_PERMISSION
    };
    let actor = require_actor(&mut tx, &input.session_token, required_permission).await?;
    let can_access_all_areas = actor_has_permission(&mut tx, &actor, ALL_AREA_PERMISSION).await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(&input.idempotency_key)
        .execute(&mut *tx)
        .await?;

    let existing_group_payments = sqlx::query_as::<_, CooperativeLoanPaymentDto>(
        r#"
        SELECT
          id, payment_number, payment_type, payment_group_id, payment_group_number,
          payment_group_sequence, payment_group_total, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at::TEXT AS posted_at, finance_transaction_id,
          journal_entry_id, reversal_of_payment_id, reversal_payment_id,
          reversal_finance_transaction_id, reversal_journal_entry_id, reversed_at,
          reversal_reason, notes, created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at, created_by, created_by_name, updated_by,
          updated_by_name, idempotency_key
        FROM cooperative_loan_payments
        WHERE payment_group_id = $1
        ORDER BY payment_group_sequence ASC, created_at ASC
        "#,
    )
    .bind(&input.idempotency_key)
    .fetch_all(&mut *tx)
    .await?;
    if !existing_group_payments.is_empty() {
        let existing_loan = get_locked_loan(&mut tx, &existing_group_payments[0].loan_id).await?;
        assert_actor_scope(&actor, can_access_all_areas, &existing_loan)?;
        let anchor_installment = get_locked_installment(&mut tx, &input.installment_id).await?;
        let expected_collector_id = input
            .collector_id
            .clone()
            .or_else(|| existing_loan.officer_id.clone());
        let existing_amount = round_currency(
            existing_group_payments
                .iter()
                .map(|payment| payment.amount)
                .sum::<f64>(),
        );
        let first_payment = &existing_group_payments[0];
        let same_payment_date =
            sqlx::query_scalar::<_, bool>("SELECT $1::TIMESTAMPTZ = $2::TIMESTAMPTZ")
                .bind(&first_payment.payment_date)
                .bind(&input.payment_date)
                .fetch_one(&mut *tx)
                .await?;
        let request_matches = anchor_installment.loan_id == existing_loan.id
            && (existing_amount - round_currency(input.amount)).abs() <= AMOUNT_TOLERANCE
            && same_payment_date
            && first_payment.payment_method.as_deref() == Some(input.payment_method.as_str())
            && first_payment.cash_account_id.as_deref() == Some(input.cash_account_id.as_str())
            && first_payment.payment_channel == input.payment_channel
            && first_payment.collector_id == expected_collector_id
            && first_payment.notes == input.notes;
        if !request_matches {
            return Err(CooperativeMutationError::Conflict(
                "Idempotency key sudah digunakan untuk batch pembayaran yang berbeda.".to_string(),
            ));
        }
        let payment_group_number = existing_group_payments[0].payment_group_number.clone();
        tx.commit().await?;
        return Ok(PostCooperativeLoanPaymentBatchOutcome::Posted {
            result: load_payment_batch_result(
                pool,
                existing_group_payments,
                Some(input.idempotency_key.clone()),
                payment_group_number,
            )
            .await?,
        });
    }

    if let Some(existing_payment) = sqlx::query_as::<_, CooperativeLoanPaymentDto>(
        r#"
        SELECT
          id, payment_number, payment_type, payment_group_id, payment_group_number,
          payment_group_sequence, payment_group_total, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at::TEXT AS posted_at, finance_transaction_id,
          journal_entry_id, reversal_of_payment_id, reversal_payment_id,
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
        return Ok(PostCooperativeLoanPaymentBatchOutcome::Posted {
            result: load_payment_batch_result(pool, vec![existing_payment], None, None).await?,
        });
    }

    let existing_approval_request =
        sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
            cooperative_payment_approval_select!(),
            " WHERE action_type = 'BACKDATE' AND idempotency_key = $1"
        ))
        .bind(&input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(existing_request) = &existing_approval_request {
        if approved_request_id != Some(existing_request.id.as_str()) {
            tx.commit().await?;
            return Ok(PostCooperativeLoanPaymentBatchOutcome::PendingApproval {
                approval_request: existing_request.clone(),
            });
        }
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
    let is_backdated = parsed_payment_date.date_naive()
        < now.with_timezone(parsed_payment_date.offset()).date_naive();

    let anchor_installment = get_locked_installment(&mut tx, &input.installment_id).await?;
    if anchor_installment.status == "PAID" {
        return Err(CooperativeMutationError::Conflict(
            "Angsuran ini sudah lunas.".to_string(),
        ));
    }
    let loan = get_locked_loan(&mut tx, &anchor_installment.loan_id).await?;
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

    let payment_amount = round_currency(input.amount);
    let payable_installments = get_locked_payable_installments_for_loan(&mut tx, &loan.id).await?;
    let allocations = allocate_payment_to_installments(payable_installments, payment_amount)?;

    if let Some(request_id) = approved_request_id {
        let request = existing_approval_request.as_ref().ok_or_else(|| {
            CooperativeMutationError::NotFound(
                "Request approval backdate tidak ditemukan.".to_string(),
            )
        })?;
        let same_payment_date =
            sqlx::query_scalar::<_, bool>("SELECT $1::TIMESTAMPTZ = $2::TIMESTAMPTZ")
                .bind(&request.payment_date)
                .bind(&input.payment_date)
                .fetch_one(&mut *tx)
                .await?;
        let request_matches = request.id == request_id
            && request.action_type == "BACKDATE"
            && request.status == "APPROVED"
            && request.installment_id.as_deref() == Some(input.installment_id.as_str())
            && request
                .amount
                .is_some_and(|amount| (amount - payment_amount).abs() <= AMOUNT_TOLERANCE)
            && same_payment_date
            && request.payment_method.as_deref() == Some(input.payment_method.as_str())
            && request.cash_account_id.as_deref() == Some(input.cash_account_id.as_str())
            && request.payment_channel == input.payment_channel
            && request.collector_id == collector_id
            && request.maker_reason == input.notes.as_deref().unwrap_or_default();
        if !request_matches {
            return Err(CooperativeMutationError::Conflict(
                "Payload pembayaran tidak sama dengan request backdate yang disetujui.".to_string(),
            ));
        }
    } else if is_backdated {
        let maker_reason = input.notes.as_deref().map(str::trim).unwrap_or("");
        if maker_reason.len() < 3 {
            return Err(CooperativeMutationError::Invalid(
                "Alasan pembayaran backdate minimal 3 karakter dan wajib diisi pada catatan."
                    .to_string(),
            ));
        }

        let request_id = Uuid::new_v4().to_string();
        let now_text = now.to_rfc3339();
        sqlx::query(
            r#"
                INSERT INTO cooperative_payment_approval_requests (
                  id, action_type, status, installment_id, idempotency_key,
                  amount, payment_date, payment_method, cash_account_id,
                  payment_channel, collector_id, maker_reason, maker_user_id,
                  maker_user_name, requested_at, created_at, updated_at
                )
                VALUES (
                  $1, 'BACKDATE', 'PENDING', $2, $3, $4, $5::TIMESTAMPTZ,
                  $6, $7, $8, $9, $10, $11, $12, $13::TIMESTAMPTZ,
                  $13::TIMESTAMPTZ, $13::TIMESTAMPTZ
                )
                "#,
        )
        .bind(&request_id)
        .bind(&anchor_installment.id)
        .bind(&input.idempotency_key)
        .bind(payment_amount)
        .bind(&input.payment_date)
        .bind(&input.payment_method)
        .bind(&input.cash_account_id)
        .bind(&input.payment_channel)
        .bind(&collector_id)
        .bind(maker_reason)
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
                INSERT INTO activity_logs (
                  id, user_id, user_name, role, action, entity, entity_id,
                  description, created_at
                )
                VALUES (
                  $1, $2, $3, $4, 'COOPERATIVE_PAYMENT_BACKDATE_REQUESTED',
                  'cooperativePaymentApprovalRequests', $5, $6, $7::TIMESTAMPTZ
                )
                "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .bind(&actor.legacy_role)
        .bind(&request_id)
        .bind(format!(
            "{} meminta approval pembayaran backdate pinjaman {}.",
            actor.user_name, loan.loan_number
        ))
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;

        let request = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
            cooperative_payment_approval_select!(),
            " WHERE id = $1"
        ))
        .bind(&request_id)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(PostCooperativeLoanPaymentBatchOutcome::PendingApproval {
            approval_request: request,
        });
    }

    let now_text = now.to_rfc3339();
    let payment_date_text = payment_date.to_rfc3339();
    let payment_group_id = if allocations.len() > 1 {
        Some(input.idempotency_key.clone())
    } else {
        None
    };
    let payment_group_number = payment_group_id.as_ref().map(|group_id| {
        format!(
            "KSU-ANG-GRP-{}-{}",
            payment_date.format("%Y%m%d"),
            &group_id[..8].to_uppercase()
        )
    });
    let mut outstanding_principal = loan.outstanding_principal_amount;
    let mut outstanding_interest = loan.outstanding_interest_amount;
    let mut outstanding_penalty = loan.outstanding_penalty_amount;
    let mut payment_ids = Vec::with_capacity(allocations.len());
    let mut last_payment_id = String::new();
    let mut last_payment_number = String::new();

    for (index, allocation) in allocations.iter().enumerate() {
        let paid_principal = round_currency(
            allocation.installment.paid_principal_amount + allocation.principal_amount,
        );
        let paid_interest = round_currency(
            allocation.installment.paid_interest_amount + allocation.interest_amount,
        );
        let paid_penalty =
            round_currency(allocation.installment.paid_penalty_amount + allocation.penalty_amount);
        let installment_status = if allocation.remaining_total_amount <= AMOUNT_TOLERANCE {
            "PAID"
        } else {
            "PARTIAL"
        };

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
        .bind(&allocation.installment.id)
        .bind(paid_principal)
        .bind(paid_interest)
        .bind(paid_penalty)
        .bind(installment_status)
        .bind(&payment_date_text)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;

        outstanding_principal = round_currency(outstanding_principal - allocation.principal_amount);
        outstanding_interest = round_currency(outstanding_interest - allocation.interest_amount);
        outstanding_penalty = round_currency(outstanding_penalty - allocation.penalty_amount);
        if outstanding_principal < -AMOUNT_TOLERANCE
            || outstanding_interest < -AMOUNT_TOLERANCE
            || outstanding_penalty < -AMOUNT_TOLERANCE
        {
            return Err(CooperativeMutationError::Conflict(
                "Pembayaran membuat outstanding pinjaman negatif.".to_string(),
            ));
        }

        let payment_id = Uuid::new_v4().to_string();
        let finance_transaction_id = Uuid::new_v4().to_string();
        let journal_entry_id = Uuid::new_v4().to_string();
        let payment_number = format!(
            "KSU-ANG-{}-{}",
            payment_date.format("%Y%m%d"),
            &payment_id[..8]
        );
        let journal_number = format!(
            "JRN-{}-{}",
            payment_date.format("%Y%m%d"),
            &journal_entry_id[..8]
        );
        let payment_idempotency_key = if allocations.len() == 1 {
            input.idempotency_key.clone()
        } else {
            format!("{}:{}", input.idempotency_key, index + 1)
        };
        let description = format!(
            "Pembayaran angsuran {} {} - {}",
            loan.loan_number, loan.member_number, loan.member_name
        );

        sqlx::query(
            r#"
            INSERT INTO cooperative_loan_payments (
              id, payment_number, payment_type, payment_group_id, payment_group_number,
              payment_group_sequence, payment_group_total, loan_id, loan_number,
              installment_id, member_id, member_number, member_name, amount,
              principal_amount, interest_amount, penalty_amount, payment_date, status,
              cash_account_id, cash_account_code, cash_account_name, payment_method,
              payment_channel, collector_id, collector_name, collector_position,
              received_by, received_by_name, posted_at, finance_transaction_id,
              journal_entry_id, notes, created_at, updated_at, created_by,
              created_by_name, updated_by, updated_by_name, idempotency_key
            )
            VALUES (
              $1, $2, 'PAYMENT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, 'POSTED', $18, $19, $20, $21, $22, $23,
              $24, $25, $26, $27, $28::TIMESTAMPTZ, $29, $30, $31,
              $28::TIMESTAMPTZ, $28::TIMESTAMPTZ, $26, $27, $26, $27, $32
            )
            "#,
        )
        .bind(&payment_id)
        .bind(&payment_number)
        .bind(&payment_group_id)
        .bind(&payment_group_number)
        .bind(if payment_group_id.is_some() {
            Some((index + 1) as i32)
        } else {
            None
        })
        .bind(if payment_group_id.is_some() {
            Some(allocations.len() as i32)
        } else {
            None
        })
        .bind(&loan.id)
        .bind(&loan.loan_number)
        .bind(&allocation.installment.id)
        .bind(&loan.member_id)
        .bind(&loan.member_number)
        .bind(&loan.member_name)
        .bind(allocation.total_amount)
        .bind(allocation.principal_amount)
        .bind(allocation.interest_amount)
        .bind(allocation.penalty_amount)
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
        .bind(&payment_idempotency_key)
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
        .bind(allocation.total_amount)
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
        .bind(allocation.total_amount)
        .bind(&now_text)
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .execute(&mut *tx)
        .await?;

        insert_journal_line(
            &mut tx,
            &journal_entry_id,
            &cash_account,
            allocation.total_amount,
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
            allocation.principal_amount,
            "Piutang pinjaman anggota berkurang",
            &now_text,
        )
        .await?;
        if allocation.interest_amount > AMOUNT_TOLERANCE {
            insert_journal_line(
                &mut tx,
                &journal_entry_id,
                &interest_account,
                0.0,
                allocation.interest_amount,
                "Pendapatan bunga pinjaman anggota",
                &now_text,
            )
            .await?;
        }
        if allocation.penalty_amount > AMOUNT_TOLERANCE {
            insert_journal_line(
                &mut tx,
                &journal_entry_id,
                &penalty_account,
                0.0,
                allocation.penalty_amount,
                "Pendapatan denda pinjaman anggota",
                &now_text,
            )
            .await?;
        }

        last_payment_id = payment_id.clone();
        last_payment_number = payment_number;
        payment_ids.push(payment_id);
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

    if loan_status == "PAID_OFF" && is_loan_eligible_for_iptw(&mut tx, &loan.id).await? {
        let iptw_expense_account =
            get_posting_account_by_key(&mut tx, IPTW_EXPENSE_ACCOUNT_KEY, "EXPENSE").await?;
        create_iptw_payout(
            &mut tx,
            &loan,
            &last_payment_id,
            &last_payment_number,
            &payment_date_text,
            &cash_account,
            &iptw_expense_account,
            &input.payment_method,
            &input.payment_channel,
            &actor,
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
    .bind(payment_group_id.as_ref().unwrap_or(&last_payment_id))
    .bind(format!(
        "{} mencatat pembayaran {} sebesar {}.",
        actor.user_name,
        payment_group_number
            .as_deref()
            .unwrap_or(&last_payment_number),
        payment_amount
    ))
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;

    if let Some(request_id) = approved_request_id {
        sqlx::query(
            r#"
            UPDATE cooperative_payment_approval_requests
            SET result_payment_id = $2, updated_at = $3::TIMESTAMPTZ
            WHERE id = $1
              AND status = 'APPROVED'
            "#,
        )
        .bind(request_id)
        .bind(&last_payment_id)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let mut payments = Vec::with_capacity(payment_ids.len());
    for payment_id in payment_ids {
        let payment = cooperative_repository::get_cooperative_loan_payment(pool, payment_id)
            .await?
            .ok_or_else(|| {
                CooperativeMutationError::NotFound(
                    "Pembayaran yang baru diposting tidak ditemukan.".to_string(),
                )
            })?;
        payments.push(payment);
    }

    Ok(PostCooperativeLoanPaymentBatchOutcome::Posted {
        result: load_payment_batch_result(pool, payments, payment_group_id, payment_group_number)
            .await?,
    })
}

async fn post_loan_payment_internal(
    pool: &PgPool,
    input: PostCooperativeLoanPaymentInput,
    approved_request_id: Option<&str>,
) -> Result<PostCooperativeLoanPaymentOutcome, CooperativeMutationError> {
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

    let parsed_payment_date = DateTime::parse_from_rfc3339(&input.payment_date).map_err(|_| {
        CooperativeMutationError::Invalid("Tanggal pembayaran tidak valid.".to_string())
    })?;
    let payment_date = parsed_payment_date.with_timezone(&Utc);
    let now = Utc::now();

    let mut tx = pool.begin().await?;
    let required_permission = if approved_request_id.is_some() {
        PAYMENT_APPROVAL_PERMISSION
    } else {
        PAYMENT_PERMISSION
    };
    let actor = require_actor(&mut tx, &input.session_token, required_permission).await?;
    let can_access_all_areas = actor_has_permission(&mut tx, &actor, ALL_AREA_PERMISSION).await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(&input.idempotency_key)
        .execute(&mut *tx)
        .await?;

    if let Some(existing_payment) = sqlx::query_as::<_, CooperativeLoanPaymentDto>(
        r#"
        SELECT
          id, payment_number, payment_type, payment_group_id, payment_group_number,
          payment_group_sequence, payment_group_total, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at::TEXT AS posted_at, finance_transaction_id,
          journal_entry_id, reversal_of_payment_id, reversal_payment_id,
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
        return Ok(PostCooperativeLoanPaymentOutcome::Posted {
            result: load_payment_result(pool, existing_payment).await?,
        });
    }

    let existing_approval_request =
        sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
            cooperative_payment_approval_select!(),
            " WHERE action_type = 'BACKDATE' AND idempotency_key = $1"
        ))
        .bind(&input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(existing_request) = &existing_approval_request {
        if approved_request_id != Some(existing_request.id.as_str()) {
            tx.commit().await?;
            return Ok(PostCooperativeLoanPaymentOutcome::PendingApproval {
                approval_request: existing_request.clone(),
            });
        }
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
    let is_backdated = parsed_payment_date.date_naive()
        < now.with_timezone(parsed_payment_date.offset()).date_naive();

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

    if let Some(request_id) = approved_request_id {
        let request = existing_approval_request.as_ref().ok_or_else(|| {
            CooperativeMutationError::NotFound(
                "Request approval backdate tidak ditemukan.".to_string(),
            )
        })?;
        let same_payment_date =
            sqlx::query_scalar::<_, bool>("SELECT $1::TIMESTAMPTZ = $2::TIMESTAMPTZ")
                .bind(&request.payment_date)
                .bind(&input.payment_date)
                .fetch_one(&mut *tx)
                .await?;
        let request_matches = request.id == request_id
            && request.action_type == "BACKDATE"
            && request.status == "APPROVED"
            && request.installment_id.as_deref() == Some(input.installment_id.as_str())
            && request
                .amount
                .is_some_and(|amount| (amount - payment_amount).abs() <= AMOUNT_TOLERANCE)
            && same_payment_date
            && request.payment_method.as_deref() == Some(input.payment_method.as_str())
            && request.cash_account_id.as_deref() == Some(input.cash_account_id.as_str())
            && request.payment_channel == input.payment_channel
            && request.collector_id == collector_id
            && request.maker_reason == input.notes.as_deref().unwrap_or_default();
        if !request_matches {
            return Err(CooperativeMutationError::Conflict(
                "Payload pembayaran tidak sama dengan request backdate yang disetujui.".to_string(),
            ));
        }
    } else if is_backdated {
        let maker_reason = input.notes.as_deref().map(str::trim).unwrap_or("");
        if maker_reason.len() < 3 {
            return Err(CooperativeMutationError::Invalid(
                "Alasan pembayaran backdate minimal 3 karakter dan wajib diisi pada catatan."
                    .to_string(),
            ));
        }

        let request_id = Uuid::new_v4().to_string();
        let now_text = now.to_rfc3339();
        sqlx::query(
            r#"
                INSERT INTO cooperative_payment_approval_requests (
                  id, action_type, status, installment_id, idempotency_key,
                  amount, payment_date, payment_method, cash_account_id,
                  payment_channel, collector_id, maker_reason, maker_user_id,
                  maker_user_name, requested_at, created_at, updated_at
                )
                VALUES (
                  $1, 'BACKDATE', 'PENDING', $2, $3, $4, $5::TIMESTAMPTZ,
                  $6, $7, $8, $9, $10, $11, $12, $13::TIMESTAMPTZ,
                  $13::TIMESTAMPTZ, $13::TIMESTAMPTZ
                )
                "#,
        )
        .bind(&request_id)
        .bind(&installment.id)
        .bind(&input.idempotency_key)
        .bind(payment_amount)
        .bind(&input.payment_date)
        .bind(&input.payment_method)
        .bind(&input.cash_account_id)
        .bind(&input.payment_channel)
        .bind(&collector_id)
        .bind(maker_reason)
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
                INSERT INTO activity_logs (
                  id, user_id, user_name, role, action, entity, entity_id,
                  description, created_at
                )
                VALUES (
                  $1, $2, $3, $4, 'COOPERATIVE_PAYMENT_BACKDATE_REQUESTED',
                  'cooperativePaymentApprovalRequests', $5, $6, $7::TIMESTAMPTZ
                )
                "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .bind(&actor.legacy_role)
        .bind(&request_id)
        .bind(format!(
            "{} meminta approval pembayaran backdate pinjaman {}.",
            actor.user_name, loan.loan_number
        ))
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;

        let request = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
            cooperative_payment_approval_select!(),
            " WHERE id = $1"
        ))
        .bind(&request_id)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(PostCooperativeLoanPaymentOutcome::PendingApproval {
            approval_request: request,
        });
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
        "KSU-ANG-{}-{}",
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
    if loan_status == "PAID_OFF" && is_loan_eligible_for_iptw(&mut tx, &loan.id).await? {
        let iptw_expense_account =
            get_posting_account_by_key(&mut tx, IPTW_EXPENSE_ACCOUNT_KEY, "EXPENSE").await?;
        create_iptw_payout(
            &mut tx,
            &loan,
            &payment_id,
            &payment_number,
            &payment_date_text,
            &cash_account,
            &iptw_expense_account,
            &input.payment_method,
            &input.payment_channel,
            &actor,
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

    if let Some(request_id) = approved_request_id {
        sqlx::query(
            r#"
            UPDATE cooperative_payment_approval_requests
            SET result_payment_id = $2, updated_at = $3::TIMESTAMPTZ
            WHERE id = $1
              AND status = 'APPROVED'
            "#,
        )
        .bind(request_id)
        .bind(&payment_id)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let payment = cooperative_repository::get_cooperative_loan_payment(pool, payment_id)
        .await?
        .ok_or_else(|| {
            CooperativeMutationError::NotFound(
                "Pembayaran yang baru diposting tidak ditemukan.".to_string(),
            )
        })?;
    Ok(PostCooperativeLoanPaymentOutcome::Posted {
        result: load_payment_result(pool, payment).await?,
    })
}

pub async fn list_payment_approval_requests(
    pool: &PgPool,
    session_token: String,
) -> Result<Vec<CooperativePaymentApprovalRequestDto>, CooperativeMutationError> {
    let mut tx = pool.begin().await?;
    require_actor(&mut tx, &session_token, PAYMENT_APPROVAL_PERMISSION).await?;
    let requests = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
        cooperative_payment_approval_select!(),
        " ORDER BY requested_at DESC, created_at DESC"
    ))
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(requests)
}

pub async fn request_payment_reversal(
    pool: &PgPool,
    input: RequestCooperativeLoanPaymentReversalInput,
) -> Result<CooperativePaymentApprovalRequestDto, CooperativeMutationError> {
    let reason = input.reason.trim();
    if reason.len() < 3 {
        return Err(CooperativeMutationError::Invalid(
            "Alasan reversal minimal 3 karakter.".to_string(),
        ));
    }

    let mut tx = pool.begin().await?;
    let actor = require_actor(&mut tx, &input.session_token, PAYMENT_PERMISSION).await?;
    let can_access_all_areas = actor_has_permission(&mut tx, &actor, ALL_AREA_PERMISSION).await?;
    let payment = get_locked_payment(&mut tx, &input.payment_id).await?;
    if payment.status != "POSTED"
        || payment.payment_type.as_deref() == Some("REVERSAL")
        || payment.reversal_of_payment_id.is_some()
    {
        return Err(CooperativeMutationError::Conflict(
            "Hanya pembayaran aktif yang dapat dimintakan reversal.".to_string(),
        ));
    }
    let loan = get_locked_loan(&mut tx, &payment.loan_id).await?;
    assert_actor_scope(&actor, can_access_all_areas, &loan)?;

    if let Some(existing) = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
        cooperative_payment_approval_select!(),
        " WHERE action_type = 'REVERSAL' AND payment_id = $1 AND status = 'PENDING'"
    ))
    .bind(&payment.id)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.commit().await?;
        return Ok(existing);
    }

    let request_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO cooperative_payment_approval_requests (
          id, action_type, status, payment_id, installment_id, maker_reason,
          maker_user_id, maker_user_name, requested_at, created_at, updated_at
        )
        VALUES (
          $1, 'REVERSAL', 'PENDING', $2, $3, $4, $5, $6,
          $7::TIMESTAMPTZ, $7::TIMESTAMPTZ, $7::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&request_id)
    .bind(&payment.id)
    .bind(&payment.installment_id)
    .bind(reason)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO activity_logs (
          id, user_id, user_name, role, action, entity, entity_id,
          description, created_at
        )
        VALUES (
          $1, $2, $3, $4, 'COOPERATIVE_LOAN_PAYMENT_REVERSAL_REQUESTED',
          'cooperativePaymentApprovalRequests', $5, $6, $7::TIMESTAMPTZ
        )
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(&actor.legacy_role)
    .bind(&request_id)
    .bind(format!(
        "{} meminta reversal pembayaran {}.",
        actor.user_name, payment.payment_number
    ))
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    let request = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
        cooperative_payment_approval_select!(),
        " WHERE id = $1"
    ))
    .bind(&request_id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(request)
}

pub async fn reject_payment_approval(
    pool: &PgPool,
    input: DecideCooperativePaymentApprovalInput,
) -> Result<CooperativePaymentApprovalRequestDto, CooperativeMutationError> {
    let notes = input.notes.as_deref().map(str::trim).unwrap_or("");
    if notes.len() < 3 {
        return Err(CooperativeMutationError::Invalid(
            "Alasan penolakan minimal 3 karakter.".to_string(),
        ));
    }

    let mut tx = pool.begin().await?;
    let checker = require_actor(&mut tx, &input.session_token, PAYMENT_APPROVAL_PERMISSION).await?;
    let request = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
        cooperative_payment_approval_select!(),
        " WHERE id = $1 FOR UPDATE"
    ))
    .bind(&input.request_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::NotFound(
            "Request approval pembayaran tidak ditemukan.".to_string(),
        )
    })?;
    if request.status != "PENDING"
        && !(request.status == "APPROVED" && request.result_payment_id.is_none())
    {
        return Err(CooperativeMutationError::Conflict(
            "Request approval sudah diproses.".to_string(),
        ));
    }
    if request.maker_user_id == checker.user_id {
        return Err(CooperativeMutationError::Unauthorized(
            "Maker tidak boleh menjadi checker untuk request yang sama.".to_string(),
        ));
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        UPDATE cooperative_payment_approval_requests
        SET status = 'REJECTED', checker_user_id = $2, checker_user_name = $3,
            checker_notes = $4, decided_at = $5::TIMESTAMPTZ,
            updated_at = $5::TIMESTAMPTZ
        WHERE id = $1
        "#,
    )
    .bind(&request.id)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .bind(notes)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(
        sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
            cooperative_payment_approval_select!(),
            " WHERE id = $1"
        ))
        .bind(&request.id)
        .fetch_one(pool)
        .await?,
    )
}

pub async fn approve_payment_request(
    pool: &PgPool,
    input: DecideCooperativePaymentApprovalInput,
) -> Result<CooperativePaymentApprovalRequestDto, CooperativeMutationError> {
    let mut tx = pool.begin().await?;
    let checker = require_actor(&mut tx, &input.session_token, PAYMENT_APPROVAL_PERMISSION).await?;
    let request = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
        cooperative_payment_approval_select!(),
        " WHERE id = $1 FOR UPDATE"
    ))
    .bind(&input.request_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| {
        CooperativeMutationError::NotFound(
            "Request approval pembayaran tidak ditemukan.".to_string(),
        )
    })?;
    if request.status == "APPROVED" && request.result_payment_id.is_some() {
        tx.commit().await?;
        return Ok(request);
    }
    if request.status != "PENDING" && request.status != "APPROVED" {
        return Err(CooperativeMutationError::Conflict(
            "Request approval sudah ditolak.".to_string(),
        ));
    }
    if request.maker_user_id == checker.user_id {
        return Err(CooperativeMutationError::Unauthorized(
            "Maker tidak boleh menjadi checker untuk request yang sama.".to_string(),
        ));
    }

    if request.status == "PENDING" {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE cooperative_payment_approval_requests
            SET status = 'APPROVED', checker_user_id = $2, checker_user_name = $3,
                checker_notes = $4, decided_at = $5::TIMESTAMPTZ,
                updated_at = $5::TIMESTAMPTZ
            WHERE id = $1
            "#,
        )
        .bind(&request.id)
        .bind(&checker.user_id)
        .bind(&checker.user_name)
        .bind(
            input
                .notes
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        )
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    if request.action_type == "BACKDATE" {
        let payment_input = PostCooperativeLoanPaymentInput {
            session_token: input.session_token.clone(),
            idempotency_key: request.idempotency_key.clone().ok_or_else(|| {
                CooperativeMutationError::Invalid(
                    "Request backdate tidak memiliki idempotency key.".to_string(),
                )
            })?,
            installment_id: request.installment_id.clone().ok_or_else(|| {
                CooperativeMutationError::Invalid(
                    "Request backdate tidak memiliki angsuran.".to_string(),
                )
            })?,
            amount: request.amount.ok_or_else(|| {
                CooperativeMutationError::Invalid(
                    "Request backdate tidak memiliki nominal.".to_string(),
                )
            })?,
            payment_date: request.payment_date.clone().ok_or_else(|| {
                CooperativeMutationError::Invalid(
                    "Request backdate tidak memiliki tanggal.".to_string(),
                )
            })?,
            payment_method: request.payment_method.clone().ok_or_else(|| {
                CooperativeMutationError::Invalid(
                    "Request backdate tidak memiliki metode pembayaran.".to_string(),
                )
            })?,
            cash_account_id: request.cash_account_id.clone().ok_or_else(|| {
                CooperativeMutationError::Invalid(
                    "Request backdate tidak memiliki akun kas/bank.".to_string(),
                )
            })?,
            payment_channel: request.payment_channel.clone(),
            collector_id: request.collector_id.clone(),
            notes: Some(request.maker_reason.clone()),
        };
        post_loan_payment_batch_internal(pool, payment_input, Some(&request.id)).await?;
    } else if request.action_type == "REVERSAL" {
        execute_approved_payment_reversal(pool, &input.session_token, &request.id).await?;
    } else {
        return Err(CooperativeMutationError::Invalid(
            "Tipe request approval tidak valid.".to_string(),
        ));
    }

    Ok(
        sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
            cooperative_payment_approval_select!(),
            " WHERE id = $1"
        ))
        .bind(&request.id)
        .fetch_one(pool)
        .await?,
    )
}

async fn reverse_iptw_payout(
    tx: &mut Transaction<'_, Postgres>,
    payment: &CooperativeLoanPaymentDto,
    reason: &str,
    actor: &ActorAccess,
    now: &DateTime<Utc>,
    now_text: &str,
) -> Result<(), CooperativeMutationError> {
    let payout = sqlx::query_as::<_, IptwPayout>(
        r#"
        SELECT
          id, amount, cash_account_id, cash_account_code,
          cash_account_name, payment_method, payment_channel, account_id,
          account_code, account_name, account_type
        FROM finance_transactions
        WHERE category = $1
          AND type = 'EXPENSE'
          AND reference_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
        "#,
    )
    .bind(IPTW_FINANCE_CATEGORY)
    .bind(&payment.id)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(payout) = payout else {
        return Ok(());
    };

    let already_reversed = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM finance_transactions
          WHERE category = $1
            AND type = 'INCOME'
            AND reference_id = $2
            AND deleted_at IS NULL
        )
        "#,
    )
    .bind(IPTW_FINANCE_CATEGORY)
    .bind(&payout.id)
    .fetch_one(&mut **tx)
    .await?;
    if already_reversed {
        return Ok(());
    }

    let original_journal_id = sqlx::query_scalar::<_, String>(
        r#"
        SELECT id
        FROM journal_entries
        WHERE source_type = 'COOPERATIVE_LOAN'
          AND source_id = $1
          AND source_event = 'COOPERATIVE_IPTW_PAID'
          AND status = 'POSTED'
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        "#,
    )
    .bind(&payout.id)
    .fetch_optional(&mut **tx)
    .await?;

    let reversal_finance_id = Uuid::new_v4().to_string();
    let reversal_description = format!(
        "Reversal IPTW pembayaran {}. {}",
        payment.payment_number, reason
    );
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
          $1, 'INCOME', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, 1, $15, $16, $15, $16,
          $17::TIMESTAMPTZ, $17::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&reversal_finance_id)
    .bind(IPTW_FINANCE_CATEGORY)
    .bind(payout.amount)
    .bind(&reversal_description)
    .bind(&payout.id)
    .bind(&payout.account_id)
    .bind(&payout.account_code)
    .bind(&payout.account_name)
    .bind(&payout.account_type)
    .bind(&payout.payment_method)
    .bind(&payout.payment_channel)
    .bind(&payout.cash_account_id)
    .bind(&payout.cash_account_code)
    .bind(&payout.cash_account_name)
    .bind(&actor.user_id)
    .bind(&actor.user_name)
    .bind(now_text)
    .execute(&mut **tx)
    .await?;

    if let Some(original_journal_id) = original_journal_id {
        let original_lines =
            sqlx::query_as::<_, (String, String, String, String, f64, f64, Option<String>)>(
                r#"
                SELECT account_id, account_code, account_name, account_type,
                       debit, credit, description
                FROM journal_entry_lines
                WHERE journal_entry_id = $1
                ORDER BY id
                "#,
            )
            .bind(&original_journal_id)
            .fetch_all(&mut **tx)
            .await?;
        let reversal_journal_id = Uuid::new_v4().to_string();
        let reversal_journal_number =
            format!("JRN-{}-{}", now.format("%Y%m%d"), &reversal_journal_id[..8]);
        sqlx::query(
            r#"
            INSERT INTO journal_entries (
              id, entry_number, entry_date, status, source_type, source_id,
              source_number, source_event, description, total_debit, total_credit,
              posted_at, reversed_entry_id, version, created_by, created_by_name,
              updated_by, updated_by_name, created_at, updated_at
            )
            VALUES (
              $1, $2, $3::TIMESTAMPTZ, 'POSTED', 'COOPERATIVE_LOAN', $4, $5,
              'COOPERATIVE_IPTW_REVERSED', $6, $7, $7, $3::TIMESTAMPTZ,
              $8, 1, $9, $10, $9, $10, $3::TIMESTAMPTZ, $3::TIMESTAMPTZ
            )
            "#,
        )
        .bind(&reversal_journal_id)
        .bind(&reversal_journal_number)
        .bind(now_text)
        .bind(&reversal_finance_id)
        .bind(&payment.payment_number)
        .bind(&reversal_description)
        .bind(payout.amount)
        .bind(&original_journal_id)
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .execute(&mut **tx)
        .await?;

        for (account_id, account_code, account_name, account_type, debit, credit, description) in
            original_lines
        {
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
            .bind(&reversal_journal_id)
            .bind(account_id)
            .bind(account_code)
            .bind(account_name)
            .bind(account_type)
            .bind(credit)
            .bind(debit)
            .bind(description)
            .bind(now_text)
            .execute(&mut **tx)
            .await?;
        }

        sqlx::query(
            r#"
            UPDATE journal_entries
            SET status = 'REVERSED', reversed_entry_id = $2,
                updated_at = $3::TIMESTAMPTZ, updated_by = $4,
                updated_by_name = $5, version = version + 1
            WHERE id = $1
              AND status = 'POSTED'
            "#,
        )
        .bind(&original_journal_id)
        .bind(&reversal_journal_id)
        .bind(now_text)
        .bind(&actor.user_id)
        .bind(&actor.user_name)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn execute_approved_payment_reversal(
    pool: &PgPool,
    session_token: &str,
    request_id: &str,
) -> Result<(), CooperativeMutationError> {
    let mut tx = pool.begin().await?;
    let checker = require_actor(&mut tx, session_token, PAYMENT_APPROVAL_PERMISSION).await?;
    let request = sqlx::query_as::<_, CooperativePaymentApprovalRequestDto>(concat!(
        cooperative_payment_approval_select!(),
        " WHERE id = $1 FOR UPDATE"
    ))
    .bind(request_id)
    .fetch_one(&mut *tx)
    .await?;
    if request.status != "APPROVED" || request.action_type != "REVERSAL" {
        return Err(CooperativeMutationError::Conflict(
            "Request reversal belum disetujui.".to_string(),
        ));
    }
    if request.result_payment_id.is_some() {
        tx.commit().await?;
        return Ok(());
    }

    let payment_id = request.payment_id.as_deref().ok_or_else(|| {
        CooperativeMutationError::Invalid("Request reversal tidak memiliki pembayaran.".to_string())
    })?;
    let payment = get_locked_payment(&mut tx, payment_id).await?;
    if payment.status != "POSTED"
        || payment.payment_type.as_deref() == Some("REVERSAL")
        || payment.reversal_of_payment_id.is_some()
    {
        return Err(CooperativeMutationError::Conflict(
            "Pembayaran sudah tidak dapat direversal.".to_string(),
        ));
    }
    let installment_id = payment.installment_id.as_deref().ok_or_else(|| {
        CooperativeMutationError::Invalid("Pembayaran tidak memiliki angsuran.".to_string())
    })?;
    let installment = get_locked_installment(&mut tx, installment_id).await?;
    let loan = get_locked_loan(&mut tx, &payment.loan_id).await?;

    let paid_principal =
        round_currency(installment.paid_principal_amount - payment.principal_amount);
    let paid_interest = round_currency(installment.paid_interest_amount - payment.interest_amount);
    let paid_penalty = round_currency(installment.paid_penalty_amount - payment.penalty_amount);
    if paid_principal < -AMOUNT_TOLERANCE
        || paid_interest < -AMOUNT_TOLERANCE
        || paid_penalty < -AMOUNT_TOLERANCE
    {
        return Err(CooperativeMutationError::Conflict(
            "Reversal membuat paid amount angsuran negatif.".to_string(),
        ));
    }
    let paid_total = paid_principal.max(0.0) + paid_interest.max(0.0) + paid_penalty.max(0.0);
    let installment_status = if paid_total <= AMOUNT_TOLERANCE {
        "UNPAID"
    } else {
        "PARTIAL"
    };
    let now = Utc::now();
    let now_text = now.to_rfc3339();
    sqlx::query(
        r#"
        UPDATE cooperative_loan_installments
        SET paid_principal_amount = $2, paid_interest_amount = $3,
            paid_penalty_amount = $4, status = $5, paid_at = NULL,
            updated_at = $6::TIMESTAMPTZ
        WHERE id = $1
        "#,
    )
    .bind(&installment.id)
    .bind(paid_principal.max(0.0))
    .bind(paid_interest.max(0.0))
    .bind(paid_penalty.max(0.0))
    .bind(installment_status)
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE cooperative_loans
        SET outstanding_principal_amount = LEAST(principal_amount, outstanding_principal_amount + $2),
            outstanding_interest_amount = LEAST(total_interest_amount, outstanding_interest_amount + $3),
            outstanding_penalty_amount = GREATEST(0, outstanding_penalty_amount + $4),
            status = 'DISBURSED', updated_at = $5::TIMESTAMPTZ,
            updated_by = $6, updated_by_name = $7
        WHERE id = $1
        "#,
    )
    .bind(&loan.id)
    .bind(payment.principal_amount)
    .bind(payment.interest_amount)
    .bind(payment.penalty_amount)
    .bind(&now_text)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .execute(&mut *tx)
    .await?;

    let reversal_payment_id = Uuid::new_v4().to_string();
    let reversal_finance_id = Uuid::new_v4().to_string();
    let reversal_journal_id = Uuid::new_v4().to_string();
    let reversal_payment_number = format!(
        "KSU-ANG-{}-{}",
        now.format("%Y%m%d"),
        &reversal_payment_id[..8]
    );
    let reason = request.maker_reason.clone();
    sqlx::query(
        r#"
        INSERT INTO cooperative_loan_payments (
          id, payment_number, payment_type, loan_id, loan_number, installment_id,
          member_id, member_number, member_name, amount, principal_amount,
          interest_amount, penalty_amount, payment_date, status, cash_account_id,
          cash_account_code, cash_account_name, payment_method, payment_channel,
          collector_id, collector_name, collector_position, received_by,
          received_by_name, posted_at, finance_transaction_id, journal_entry_id,
          reversal_of_payment_id, notes, created_at, updated_at, created_by,
          created_by_name, updated_by, updated_by_name
        )
        VALUES (
          $1, $2, 'REVERSAL', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13::TIMESTAMPTZ, 'POSTED', $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $13::TIMESTAMPTZ, $24, $25, $26, $27,
          $13::TIMESTAMPTZ, $13::TIMESTAMPTZ, $22, $23, $22, $23
        )
        "#,
    )
    .bind(&reversal_payment_id)
    .bind(&reversal_payment_number)
    .bind(&payment.loan_id)
    .bind(&payment.loan_number)
    .bind(&payment.installment_id)
    .bind(&payment.member_id)
    .bind(&payment.member_number)
    .bind(&payment.member_name)
    .bind(payment.amount)
    .bind(payment.principal_amount)
    .bind(payment.interest_amount)
    .bind(payment.penalty_amount)
    .bind(&now_text)
    .bind(&payment.cash_account_id)
    .bind(&payment.cash_account_code)
    .bind(&payment.cash_account_name)
    .bind(&payment.payment_method)
    .bind(&payment.payment_channel)
    .bind(&payment.collector_id)
    .bind(&payment.collector_name)
    .bind(&payment.collector_position)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .bind(&reversal_finance_id)
    .bind(&reversal_journal_id)
    .bind(&payment.id)
    .bind(&reason)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE cooperative_loan_payments
        SET status = 'REVERSED', reversal_payment_id = $2,
            reversal_finance_transaction_id = $3, reversal_journal_entry_id = $4,
            reversed_at = $5::TIMESTAMPTZ, reversal_reason = $6,
            updated_at = $5::TIMESTAMPTZ, updated_by = $7, updated_by_name = $8
        WHERE id = $1
        "#,
    )
    .bind(&payment.id)
    .bind(&reversal_payment_id)
    .bind(&reversal_finance_id)
    .bind(&reversal_journal_id)
    .bind(&now_text)
    .bind(&reason)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
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
          $1, 'EXPENSE', 'KSP_PEMBAYARAN_ANGSURAN', $2, $3, $4, $5, $6, $7,
          'ASSET', $8, $9, $5, $6, $7, 1, $10, $11, $10, $11,
          $12::TIMESTAMPTZ, $12::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&reversal_finance_id)
    .bind(payment.amount)
    .bind(format!(
        "Reversal pembayaran angsuran {}. {}",
        payment.payment_number, reason
    ))
    .bind(&reversal_payment_id)
    .bind(&payment.cash_account_id)
    .bind(&payment.cash_account_code)
    .bind(&payment.cash_account_name)
    .bind(&payment.payment_method)
    .bind(&payment.payment_channel)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;

    let original_journal_id = payment.journal_entry_id.as_deref().ok_or_else(|| {
        CooperativeMutationError::Conflict(
            "Pembayaran tidak memiliki jurnal untuk direversal.".to_string(),
        )
    })?;
    let original_lines =
        sqlx::query_as::<_, (String, String, String, String, f64, f64, Option<String>)>(
            r#"
        SELECT account_id, account_code, account_name, account_type,
               debit, credit, description
        FROM journal_entry_lines
        WHERE journal_entry_id = $1
        ORDER BY id
        "#,
        )
        .bind(original_journal_id)
        .fetch_all(&mut *tx)
        .await?;
    if original_lines.is_empty() {
        return Err(CooperativeMutationError::Conflict(
            "Baris jurnal pembayaran tidak ditemukan.".to_string(),
        ));
    }
    let reversal_journal_number =
        format!("JRN-{}-{}", now.format("%Y%m%d"), &reversal_journal_id[..8]);
    sqlx::query(
        r#"
        INSERT INTO journal_entries (
          id, entry_number, entry_date, status, source_type, source_id,
          source_number, source_event, description, total_debit, total_credit,
          posted_at, reversed_entry_id, version, created_by, created_by_name,
          updated_by, updated_by_name, created_at, updated_at
        )
        VALUES (
          $1, $2, $3::TIMESTAMPTZ, 'POSTED', 'COOPERATIVE_LOAN', $4, $5,
          'COOPERATIVE_LOAN_PAYMENT_REVERSED', $6, $7, $7, $3::TIMESTAMPTZ,
          $8, 1, $9, $10, $9, $10, $3::TIMESTAMPTZ, $3::TIMESTAMPTZ
        )
        "#,
    )
    .bind(&reversal_journal_id)
    .bind(&reversal_journal_number)
    .bind(&now_text)
    .bind(&reversal_payment_id)
    .bind(&reversal_payment_number)
    .bind(format!(
        "Reversal pembayaran {}: {}",
        payment.payment_number, reason
    ))
    .bind(payment.amount)
    .bind(original_journal_id)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .execute(&mut *tx)
    .await?;
    for (account_id, account_code, account_name, account_type, debit, credit, description) in
        original_lines
    {
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
        .bind(&reversal_journal_id)
        .bind(account_id)
        .bind(account_code)
        .bind(account_name)
        .bind(account_type)
        .bind(credit)
        .bind(debit)
        .bind(description)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        r#"
        UPDATE journal_entries
        SET status = 'REVERSED', reversed_entry_id = $2,
            updated_at = $3::TIMESTAMPTZ, updated_by = $4, updated_by_name = $5,
            version = version + 1
        WHERE id = $1
          AND status = 'POSTED'
        "#,
    )
    .bind(original_journal_id)
    .bind(&reversal_journal_id)
    .bind(&now_text)
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .execute(&mut *tx)
    .await?;

    reverse_iptw_payout(&mut tx, &payment, &reason, &checker, &now, &now_text).await?;

    sqlx::query(
        r#"
        UPDATE cooperative_payment_approval_requests
        SET result_payment_id = $2, updated_at = $3::TIMESTAMPTZ
        WHERE id = $1
        "#,
    )
    .bind(&request.id)
    .bind(&reversal_payment_id)
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO activity_logs (
          id, user_id, user_name, role, action, entity, entity_id,
          description, created_at
        )
        VALUES (
          $1, $2, $3, $4, 'COOPERATIVE_LOAN_PAYMENT_REVERSED',
          'cooperativeLoanPayments', $5, $6, $7::TIMESTAMPTZ
        )
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&checker.user_id)
    .bind(&checker.user_name)
    .bind(&checker.legacy_role)
    .bind(&payment.id)
    .bind(format!(
        "{} menyetujui reversal pembayaran {}.",
        checker.user_name, payment.payment_number
    ))
    .bind(&now_text)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn list_payment_installment_reconciliation(
    pool: &PgPool,
    session_token: String,
) -> Result<Vec<CooperativePaymentInstallmentReconciliationDto>, CooperativeMutationError> {
    let mut tx = pool.begin().await?;
    require_actor(&mut tx, &session_token, PAYMENT_APPROVAL_PERMISSION).await?;
    let rows = sqlx::query_as::<_, CooperativePaymentInstallmentReconciliationDto>(
        r#"
        WITH payment_totals AS (
          SELECT
            installment_id,
            SUM(principal_amount) AS principal_amount,
            SUM(interest_amount) AS interest_amount,
            SUM(penalty_amount) AS penalty_amount
          FROM cooperative_loan_payments
          WHERE COALESCE(payment_type, 'PAYMENT') = 'PAYMENT'
            AND status = 'POSTED'
          GROUP BY installment_id
        )
        SELECT
          installment.id AS installment_id,
          installment.loan_id,
          installment.loan_number,
          installment.installment_number,
          COALESCE(payment.principal_amount, 0) AS expected_principal_amount,
          installment.paid_principal_amount AS actual_principal_amount,
          COALESCE(payment.interest_amount, 0) AS expected_interest_amount,
          installment.paid_interest_amount AS actual_interest_amount,
          COALESCE(payment.penalty_amount, 0) AS expected_penalty_amount,
          installment.paid_penalty_amount AS actual_penalty_amount,
          (
            installment.paid_principal_amount + installment.paid_interest_amount +
            installment.paid_penalty_amount - COALESCE(payment.principal_amount, 0) -
            COALESCE(payment.interest_amount, 0) - COALESCE(payment.penalty_amount, 0)
          ) AS difference_amount
        FROM cooperative_loan_installments AS installment
        LEFT JOIN payment_totals AS payment
          ON payment.installment_id = installment.id
        WHERE
          ABS(installment.paid_principal_amount - COALESCE(payment.principal_amount, 0)) > 0.01 OR
          ABS(installment.paid_interest_amount - COALESCE(payment.interest_amount, 0)) > 0.01 OR
          ABS(installment.paid_penalty_amount - COALESCE(payment.penalty_amount, 0)) > 0.01
        UNION ALL
        SELECT
          COALESCE(payment.installment_id, 'ORPHAN:' || payment.id) AS installment_id,
          payment.loan_id,
          payment.loan_number,
          0 AS installment_number,
          payment.principal_amount AS expected_principal_amount,
          0 AS actual_principal_amount,
          payment.interest_amount AS expected_interest_amount,
          0 AS actual_interest_amount,
          payment.penalty_amount AS expected_penalty_amount,
          0 AS actual_penalty_amount,
          -payment.amount AS difference_amount
        FROM cooperative_loan_payments AS payment
        LEFT JOIN cooperative_loan_installments AS installment
          ON installment.id = payment.installment_id
        WHERE COALESCE(payment.payment_type, 'PAYMENT') = 'PAYMENT'
          AND payment.status = 'POSTED'
          AND installment.id IS NULL
        ORDER BY loan_number, installment_number
        "#,
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
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
