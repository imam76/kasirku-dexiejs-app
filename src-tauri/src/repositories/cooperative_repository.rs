use crate::models::cooperative::{
    CooperativeLoanDto, CooperativeLoanInstallmentDto, CooperativeLoanPaymentDto,
    CooperativeMemberDto, CooperativeMemberSavingBalanceDto, CooperativeSavingTransactionDto,
};
use sqlx::PgPool;

macro_rules! cooperative_member_select {
    () => {
        r#"
        SELECT
            id,
            member_number,
            name,
            identity_number,
            phone,
            address,
            area_id,
            area_name,
            area_code,
            officer_id,
            officer_name,
            officer_position,
            join_date,
            status,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        FROM cooperative_members
        "#
    };
}

macro_rules! cooperative_saving_transaction_select {
    () => {
        r#"
        SELECT
            id,
            member_id,
            member_number,
            member_name,
            saving_type,
            transaction_type,
            amount,
            transaction_date,
            status,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            finance_transaction_id,
            journal_entry_id,
            reversal_of_transaction_id,
            reversal_transaction_id,
            reversal_finance_transaction_id,
            reversal_journal_entry_id,
            reversed_at,
            reversal_reason,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        FROM cooperative_saving_transactions
        "#
    };
}

macro_rules! cooperative_member_saving_balance_select {
    () => {
        r#"
        SELECT
            id,
            member_id,
            member_number,
            member_name,
            saving_type,
            balance,
            updated_at::TEXT AS updated_at
        FROM cooperative_member_saving_balances
        "#
    };
}

macro_rules! cooperative_loan_select {
    () => {
        r#"
        SELECT
            id,
            loan_number,
            member_id,
            member_number,
            member_name,
            principal_amount,
            interest_rate_per_month,
            tenor_months,
            interest_calculation_type,
            billing_frequency,
            installment_count,
            loan_service_rate,
            loan_service_amount,
            admin_fee_rate,
            admin_fee_amount,
            mandatory_saving_rate,
            mandatory_saving_amount,
            deduction_method,
            net_disbursement_amount,
            total_interest_amount,
            total_payable_amount,
            outstanding_principal_amount,
            outstanding_interest_amount,
            outstanding_penalty_amount,
            status,
            application_date,
            approved_at,
            approved_by,
            approved_by_name,
            approval_notes,
            rejected_at,
            rejected_by,
            rejected_by_name,
            rejection_reason,
            disbursed_at,
            officer_id,
            officer_name,
            officer_position,
            area_id,
            area_name,
            area_code,
            collection_schedule_id,
            collection_weekday,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            finance_transaction_id,
            journal_entry_id,
            disbursement_notes,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        FROM cooperative_loans
        "#
    };
}

macro_rules! cooperative_loan_installment_select {
    () => {
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
        "#
    };
}

macro_rules! cooperative_loan_payment_select {
    () => {
        r#"
        SELECT
            id,
            payment_number,
            payment_type,
            loan_id,
            loan_number,
            installment_id,
            member_id,
            member_number,
            member_name,
            amount,
            principal_amount,
            interest_amount,
            penalty_amount,
            payment_date,
            status,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            collector_id,
            collector_name,
            collector_position,
            received_by,
            received_by_name,
            posted_at,
            finance_transaction_id,
            journal_entry_id,
            reversal_of_payment_id,
            reversal_payment_id,
            reversal_finance_transaction_id,
            reversal_journal_entry_id,
            reversed_at,
            reversal_reason,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            idempotency_key
        FROM cooperative_loan_payments
        "#
    };
}

pub async fn list_cooperative_members(
    pool: &PgPool,
) -> Result<Vec<CooperativeMemberDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeMemberDto>(concat!(
        cooperative_member_select!(),
        " ORDER BY updated_at DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_cooperative_member(
    pool: &PgPool,
    id: String,
) -> Result<Option<CooperativeMemberDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeMemberDto>(concat!(
        cooperative_member_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cooperative_member(
    pool: &PgPool,
    input: CooperativeMemberDto,
) -> Result<CooperativeMemberDto, sqlx::Error> {
    let id = input.id.clone();
    let upserted = sqlx::query_as::<_, CooperativeMemberDto>(
        r#"
        INSERT INTO cooperative_members (
            id,
            member_number,
            name,
            identity_number,
            phone,
            address,
            area_id,
            area_name,
            area_code,
            officer_id,
            officer_name,
            officer_position,
            join_date,
            status,
            notes,
            created_at,
            updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16::TIMESTAMPTZ,
            $17::TIMESTAMPTZ,
            $18,
            $19,
            $20,
            $21
        )
        ON CONFLICT (id) DO UPDATE SET
            member_number = EXCLUDED.member_number,
            name = EXCLUDED.name,
            identity_number = EXCLUDED.identity_number,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address,
            area_id = EXCLUDED.area_id,
            area_name = EXCLUDED.area_name,
            area_code = EXCLUDED.area_code,
            officer_id = EXCLUDED.officer_id,
            officer_name = EXCLUDED.officer_name,
            officer_position = EXCLUDED.officer_position,
            join_date = EXCLUDED.join_date,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            created_by = COALESCE(cooperative_members.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(cooperative_members.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= cooperative_members.updated_at
        RETURNING
            id,
            member_number,
            name,
            identity_number,
            phone,
            address,
            area_id,
            area_name,
            area_code,
            officer_id,
            officer_name,
            officer_position,
            join_date,
            status,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        "#,
    )
    .bind(input.id)
    .bind(input.member_number)
    .bind(input.name)
    .bind(input.identity_number)
    .bind(input.phone)
    .bind(input.address)
    .bind(input.area_id)
    .bind(input.area_name)
    .bind(input.area_code)
    .bind(input.officer_id)
    .bind(input.officer_name)
    .bind(input.officer_position)
    .bind(input.join_date)
    .bind(input.status)
    .bind(input.notes)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .fetch_optional(pool)
    .await?;

    if let Some(member) = upserted {
        return Ok(member);
    }

    get_cooperative_member(pool, id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_cooperative_saving_transactions(
    pool: &PgPool,
) -> Result<Vec<CooperativeSavingTransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeSavingTransactionDto>(concat!(
        cooperative_saving_transaction_select!(),
        " ORDER BY updated_at DESC, transaction_date DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_cooperative_saving_transaction(
    pool: &PgPool,
    id: String,
) -> Result<Option<CooperativeSavingTransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeSavingTransactionDto>(concat!(
        cooperative_saving_transaction_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cooperative_saving_transaction(
    pool: &PgPool,
    input: CooperativeSavingTransactionDto,
) -> Result<CooperativeSavingTransactionDto, sqlx::Error> {
    let id = input.id.clone();
    let upserted = sqlx::query_as::<_, CooperativeSavingTransactionDto>(
        r#"
        INSERT INTO cooperative_saving_transactions (
            id,
            member_id,
            member_number,
            member_name,
            saving_type,
            transaction_type,
            amount,
            transaction_date,
            status,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            finance_transaction_id,
            journal_entry_id,
            reversal_of_transaction_id,
            reversal_transaction_id,
            reversal_finance_transaction_id,
            reversal_journal_entry_id,
            reversed_at,
            reversal_reason,
            notes,
            created_at,
            updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21,
            $22,
            $23,
            $24::TIMESTAMPTZ,
            $25::TIMESTAMPTZ,
            $26,
            $27,
            $28,
            $29
        )
        ON CONFLICT (id) DO UPDATE SET
            member_id = EXCLUDED.member_id,
            member_number = EXCLUDED.member_number,
            member_name = EXCLUDED.member_name,
            saving_type = EXCLUDED.saving_type,
            transaction_type = EXCLUDED.transaction_type,
            amount = EXCLUDED.amount,
            transaction_date = EXCLUDED.transaction_date,
            status = EXCLUDED.status,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            payment_method = EXCLUDED.payment_method,
            payment_channel = EXCLUDED.payment_channel,
            finance_transaction_id = EXCLUDED.finance_transaction_id,
            journal_entry_id = EXCLUDED.journal_entry_id,
            reversal_of_transaction_id = EXCLUDED.reversal_of_transaction_id,
            reversal_transaction_id = EXCLUDED.reversal_transaction_id,
            reversal_finance_transaction_id = EXCLUDED.reversal_finance_transaction_id,
            reversal_journal_entry_id = EXCLUDED.reversal_journal_entry_id,
            reversed_at = EXCLUDED.reversed_at,
            reversal_reason = EXCLUDED.reversal_reason,
            notes = EXCLUDED.notes,
            created_by = COALESCE(cooperative_saving_transactions.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(cooperative_saving_transactions.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= cooperative_saving_transactions.updated_at
        RETURNING
            id,
            member_id,
            member_number,
            member_name,
            saving_type,
            transaction_type,
            amount,
            transaction_date,
            status,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            finance_transaction_id,
            journal_entry_id,
            reversal_of_transaction_id,
            reversal_transaction_id,
            reversal_finance_transaction_id,
            reversal_journal_entry_id,
            reversed_at,
            reversal_reason,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        "#,
    )
    .bind(input.id)
    .bind(input.member_id)
    .bind(input.member_number)
    .bind(input.member_name)
    .bind(input.saving_type)
    .bind(input.transaction_type)
    .bind(input.amount)
    .bind(input.transaction_date)
    .bind(input.status)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.payment_method)
    .bind(input.payment_channel)
    .bind(input.finance_transaction_id)
    .bind(input.journal_entry_id)
    .bind(input.reversal_of_transaction_id)
    .bind(input.reversal_transaction_id)
    .bind(input.reversal_finance_transaction_id)
    .bind(input.reversal_journal_entry_id)
    .bind(input.reversed_at)
    .bind(input.reversal_reason)
    .bind(input.notes)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .fetch_optional(pool)
    .await?;

    if let Some(transaction) = upserted {
        return Ok(transaction);
    }

    get_cooperative_saving_transaction(pool, id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_cooperative_member_saving_balances(
    pool: &PgPool,
) -> Result<Vec<CooperativeMemberSavingBalanceDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeMemberSavingBalanceDto>(concat!(
        cooperative_member_saving_balance_select!(),
        " ORDER BY updated_at DESC, member_number ASC, saving_type ASC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_cooperative_member_saving_balance(
    pool: &PgPool,
    id: String,
) -> Result<Option<CooperativeMemberSavingBalanceDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeMemberSavingBalanceDto>(concat!(
        cooperative_member_saving_balance_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cooperative_member_saving_balance(
    pool: &PgPool,
    input: CooperativeMemberSavingBalanceDto,
) -> Result<CooperativeMemberSavingBalanceDto, sqlx::Error> {
    let id = input.id.clone();
    let upserted = sqlx::query_as::<_, CooperativeMemberSavingBalanceDto>(
        r#"
        INSERT INTO cooperative_member_saving_balances (
            id,
            member_id,
            member_number,
            member_name,
            saving_type,
            balance,
            updated_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            member_id = EXCLUDED.member_id,
            member_number = EXCLUDED.member_number,
            member_name = EXCLUDED.member_name,
            saving_type = EXCLUDED.saving_type,
            balance = EXCLUDED.balance,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= cooperative_member_saving_balances.updated_at
        RETURNING
            id,
            member_id,
            member_number,
            member_name,
            saving_type,
            balance,
            updated_at::TEXT AS updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.member_id)
    .bind(input.member_number)
    .bind(input.member_name)
    .bind(input.saving_type)
    .bind(input.balance)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(balance) = upserted {
        return Ok(balance);
    }

    get_cooperative_member_saving_balance(pool, id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_cooperative_loans(pool: &PgPool) -> Result<Vec<CooperativeLoanDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeLoanDto>(concat!(
        cooperative_loan_select!(),
        " ORDER BY updated_at DESC, application_date DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_cooperative_loan(
    pool: &PgPool,
    id: String,
) -> Result<Option<CooperativeLoanDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeLoanDto>(concat!(
        cooperative_loan_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cooperative_loan(
    pool: &PgPool,
    input: CooperativeLoanDto,
) -> Result<CooperativeLoanDto, sqlx::Error> {
    let id = input.id.clone();
    let upserted = sqlx::query_as::<_, CooperativeLoanDto>(
        r#"
        INSERT INTO cooperative_loans (
            id,
            loan_number,
            member_id,
            member_number,
            member_name,
            principal_amount,
            interest_rate_per_month,
            tenor_months,
            interest_calculation_type,
            billing_frequency,
            installment_count,
            loan_service_rate,
            loan_service_amount,
            admin_fee_rate,
            admin_fee_amount,
            mandatory_saving_rate,
            mandatory_saving_amount,
            deduction_method,
            net_disbursement_amount,
            total_interest_amount,
            total_payable_amount,
            outstanding_principal_amount,
            outstanding_interest_amount,
            outstanding_penalty_amount,
            status,
            application_date,
            approved_at,
            approved_by,
            approved_by_name,
            approval_notes,
            rejected_at,
            rejected_by,
            rejected_by_name,
            rejection_reason,
            disbursed_at,
            officer_id,
            officer_name,
            officer_position,
            area_id,
            area_name,
            area_code,
            collection_schedule_id,
            collection_weekday,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            finance_transaction_id,
            journal_entry_id,
            disbursement_notes,
            notes,
            created_at,
            updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21,
            $22,
            $23,
            $24,
            $25,
            $26,
            $27,
            $28,
            $29,
            $30,
            $31,
            $32,
            $33,
            $34,
            $35,
            $36,
            $37,
            $38,
            $39,
            $40,
            $41,
            $42,
            $43,
            $44,
            $45,
            $46,
            $47,
            $48,
            $49,
            $50,
            $51,
            $52,
            $53::TIMESTAMPTZ,
            $54::TIMESTAMPTZ,
            $55,
            $56,
            $57,
            $58
        )
        ON CONFLICT (id) DO UPDATE SET
            loan_number = EXCLUDED.loan_number,
            member_id = EXCLUDED.member_id,
            member_number = EXCLUDED.member_number,
            member_name = EXCLUDED.member_name,
            principal_amount = EXCLUDED.principal_amount,
            interest_rate_per_month = EXCLUDED.interest_rate_per_month,
            tenor_months = EXCLUDED.tenor_months,
            interest_calculation_type = EXCLUDED.interest_calculation_type,
            billing_frequency = EXCLUDED.billing_frequency,
            installment_count = EXCLUDED.installment_count,
            loan_service_rate = EXCLUDED.loan_service_rate,
            loan_service_amount = EXCLUDED.loan_service_amount,
            admin_fee_rate = EXCLUDED.admin_fee_rate,
            admin_fee_amount = EXCLUDED.admin_fee_amount,
            mandatory_saving_rate = EXCLUDED.mandatory_saving_rate,
            mandatory_saving_amount = EXCLUDED.mandatory_saving_amount,
            deduction_method = EXCLUDED.deduction_method,
            net_disbursement_amount = EXCLUDED.net_disbursement_amount,
            total_interest_amount = EXCLUDED.total_interest_amount,
            total_payable_amount = EXCLUDED.total_payable_amount,
            outstanding_principal_amount = EXCLUDED.outstanding_principal_amount,
            outstanding_interest_amount = EXCLUDED.outstanding_interest_amount,
            outstanding_penalty_amount = EXCLUDED.outstanding_penalty_amount,
            status = EXCLUDED.status,
            application_date = EXCLUDED.application_date,
            approved_at = EXCLUDED.approved_at,
            approved_by = EXCLUDED.approved_by,
            approved_by_name = EXCLUDED.approved_by_name,
            approval_notes = EXCLUDED.approval_notes,
            rejected_at = EXCLUDED.rejected_at,
            rejected_by = EXCLUDED.rejected_by,
            rejected_by_name = EXCLUDED.rejected_by_name,
            rejection_reason = EXCLUDED.rejection_reason,
            disbursed_at = EXCLUDED.disbursed_at,
            officer_id = EXCLUDED.officer_id,
            officer_name = EXCLUDED.officer_name,
            officer_position = EXCLUDED.officer_position,
            area_id = EXCLUDED.area_id,
            area_name = EXCLUDED.area_name,
            area_code = EXCLUDED.area_code,
            collection_schedule_id = EXCLUDED.collection_schedule_id,
            collection_weekday = EXCLUDED.collection_weekday,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            payment_method = EXCLUDED.payment_method,
            payment_channel = EXCLUDED.payment_channel,
            finance_transaction_id = EXCLUDED.finance_transaction_id,
            journal_entry_id = EXCLUDED.journal_entry_id,
            disbursement_notes = EXCLUDED.disbursement_notes,
            notes = EXCLUDED.notes,
            created_by = COALESCE(cooperative_loans.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(cooperative_loans.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= cooperative_loans.updated_at
          AND cooperative_loans.status NOT IN ('DISBURSED', 'PAID_OFF')
        RETURNING
            id,
            loan_number,
            member_id,
            member_number,
            member_name,
            principal_amount,
            interest_rate_per_month,
            tenor_months,
            interest_calculation_type,
            billing_frequency,
            installment_count,
            loan_service_rate,
            loan_service_amount,
            admin_fee_rate,
            admin_fee_amount,
            mandatory_saving_rate,
            mandatory_saving_amount,
            deduction_method,
            net_disbursement_amount,
            total_interest_amount,
            total_payable_amount,
            outstanding_principal_amount,
            outstanding_interest_amount,
            outstanding_penalty_amount,
            status,
            application_date,
            approved_at,
            approved_by,
            approved_by_name,
            approval_notes,
            rejected_at,
            rejected_by,
            rejected_by_name,
            rejection_reason,
            disbursed_at,
            officer_id,
            officer_name,
            officer_position,
            area_id,
            area_name,
            area_code,
            collection_schedule_id,
            collection_weekday,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            payment_method,
            payment_channel,
            finance_transaction_id,
            journal_entry_id,
            disbursement_notes,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name
        "#,
    )
    .bind(input.id)
    .bind(input.loan_number)
    .bind(input.member_id)
    .bind(input.member_number)
    .bind(input.member_name)
    .bind(input.principal_amount)
    .bind(input.interest_rate_per_month)
    .bind(input.tenor_months)
    .bind(input.interest_calculation_type)
    .bind(input.billing_frequency)
    .bind(input.installment_count)
    .bind(input.loan_service_rate)
    .bind(input.loan_service_amount)
    .bind(input.admin_fee_rate)
    .bind(input.admin_fee_amount)
    .bind(input.mandatory_saving_rate)
    .bind(input.mandatory_saving_amount)
    .bind(input.deduction_method)
    .bind(input.net_disbursement_amount)
    .bind(input.total_interest_amount)
    .bind(input.total_payable_amount)
    .bind(input.outstanding_principal_amount)
    .bind(input.outstanding_interest_amount)
    .bind(input.outstanding_penalty_amount)
    .bind(input.status)
    .bind(input.application_date)
    .bind(input.approved_at)
    .bind(input.approved_by)
    .bind(input.approved_by_name)
    .bind(input.approval_notes)
    .bind(input.rejected_at)
    .bind(input.rejected_by)
    .bind(input.rejected_by_name)
    .bind(input.rejection_reason)
    .bind(input.disbursed_at)
    .bind(input.officer_id)
    .bind(input.officer_name)
    .bind(input.officer_position)
    .bind(input.area_id)
    .bind(input.area_name)
    .bind(input.area_code)
    .bind(input.collection_schedule_id)
    .bind(input.collection_weekday)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.payment_method)
    .bind(input.payment_channel)
    .bind(input.finance_transaction_id)
    .bind(input.journal_entry_id)
    .bind(input.disbursement_notes)
    .bind(input.notes)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .fetch_optional(pool)
    .await?;

    if let Some(loan) = upserted {
        return Ok(loan);
    }

    get_cooperative_loan(pool, id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_cooperative_loan_installments(
    pool: &PgPool,
) -> Result<Vec<CooperativeLoanInstallmentDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeLoanInstallmentDto>(concat!(
        cooperative_loan_installment_select!(),
        " ORDER BY updated_at DESC, due_date ASC, installment_number ASC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_cooperative_loan_installment(
    pool: &PgPool,
    id: String,
) -> Result<Option<CooperativeLoanInstallmentDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeLoanInstallmentDto>(concat!(
        cooperative_loan_installment_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cooperative_loan_installment(
    pool: &PgPool,
    input: CooperativeLoanInstallmentDto,
) -> Result<CooperativeLoanInstallmentDto, sqlx::Error> {
    let id = input.id.clone();
    let upserted = sqlx::query_as::<_, CooperativeLoanInstallmentDto>(
        r#"
        INSERT INTO cooperative_loan_installments (
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
            created_at,
            updated_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21::TIMESTAMPTZ,
            $22::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            loan_id = EXCLUDED.loan_id,
            loan_number = EXCLUDED.loan_number,
            member_id = EXCLUDED.member_id,
            member_number = EXCLUDED.member_number,
            member_name = EXCLUDED.member_name,
            installment_number = EXCLUDED.installment_number,
            due_date = EXCLUDED.due_date,
            principal_amount = EXCLUDED.principal_amount,
            interest_amount = EXCLUDED.interest_amount,
            penalty_amount = EXCLUDED.penalty_amount,
            paid_principal_amount = EXCLUDED.paid_principal_amount,
            paid_interest_amount = EXCLUDED.paid_interest_amount,
            paid_penalty_amount = EXCLUDED.paid_penalty_amount,
            status = EXCLUDED.status,
            paid_at = EXCLUDED.paid_at,
            collection_status = EXCLUDED.collection_status,
            follow_up_date = EXCLUDED.follow_up_date,
            collection_notes = EXCLUDED.collection_notes,
            last_contacted_at = EXCLUDED.last_contacted_at,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= cooperative_loan_installments.updated_at
          AND NOT EXISTS (
            SELECT 1
            FROM cooperative_loans AS protected_loan
            WHERE protected_loan.id = cooperative_loan_installments.loan_id
              AND protected_loan.status IN ('DISBURSED', 'PAID_OFF')
          )
        RETURNING
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
        "#,
    )
    .bind(input.id)
    .bind(input.loan_id)
    .bind(input.loan_number)
    .bind(input.member_id)
    .bind(input.member_number)
    .bind(input.member_name)
    .bind(input.installment_number)
    .bind(input.due_date)
    .bind(input.principal_amount)
    .bind(input.interest_amount)
    .bind(input.penalty_amount)
    .bind(input.paid_principal_amount)
    .bind(input.paid_interest_amount)
    .bind(input.paid_penalty_amount)
    .bind(input.status)
    .bind(input.paid_at)
    .bind(input.collection_status)
    .bind(input.follow_up_date)
    .bind(input.collection_notes)
    .bind(input.last_contacted_at)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(installment) = upserted {
        return Ok(installment);
    }

    get_cooperative_loan_installment(pool, id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_cooperative_loan_payments(
    pool: &PgPool,
) -> Result<Vec<CooperativeLoanPaymentDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeLoanPaymentDto>(concat!(
        cooperative_loan_payment_select!(),
        " ORDER BY updated_at DESC, payment_date DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_cooperative_loan_payment(
    pool: &PgPool,
    id: String,
) -> Result<Option<CooperativeLoanPaymentDto>, sqlx::Error> {
    sqlx::query_as::<_, CooperativeLoanPaymentDto>(concat!(
        cooperative_loan_payment_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}
