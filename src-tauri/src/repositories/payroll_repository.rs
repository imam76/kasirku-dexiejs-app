use crate::models::payroll::{
    EmployeeCashAdvanceBundleDto, EmployeeCashAdvanceDto, EmployeeCashAdvanceRepaymentDto,
    PayrollRunBundleDto, PayrollRunDto, PayrollRunItemDto,
};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

macro_rules! payroll_run_select {
    () => {
        r#"
        SELECT
            id,
            payroll_number,
            period_start::TEXT AS period_start,
            period_end::TEXT AS period_end,
            status,
            employee_count,
            gross_amount,
            allowance_amount,
            bonus_amount,
            other_deduction_amount,
            cash_advance_deduction_amount,
            deduction_amount,
            net_amount,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            approved_at::TEXT AS approved_at,
            paid_at::TEXT AS paid_at,
            voided_at::TEXT AS voided_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM payroll_runs
        "#
    };
}

macro_rules! payroll_run_item_select {
    () => {
        r#"
        SELECT
            id,
            payroll_run_id,
            employee_id,
            employee_name,
            employee_position,
            base_salary,
            allowance_amount,
            bonus_amount,
            other_deduction_amount,
            cash_advance_deduction_amount,
            deduction_amount,
            gross_amount,
            net_amount,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM payroll_run_items
        "#
    };
}

macro_rules! employee_cash_advance_select {
    () => {
        r#"
        SELECT
            id,
            advance_number,
            employee_id,
            employee_name,
            employee_position,
            amount,
            outstanding_amount,
            status,
            disbursed_at::TEXT AS disbursed_at,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            voided_at::TEXT AS voided_at,
            void_reason,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM employee_cash_advances
        "#
    };
}

macro_rules! employee_cash_advance_repayment_select {
    () => {
        r#"
        SELECT
            id,
            cash_advance_id,
            cash_advance_number,
            payroll_run_id,
            payroll_run_item_id,
            payroll_number,
            employee_id,
            employee_name,
            amount,
            status,
            allocated_at::TEXT AS allocated_at,
            posted_at::TEXT AS posted_at,
            voided_at::TEXT AS voided_at,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM employee_cash_advance_repayments
        "#
    };
}

pub async fn list_payroll_run_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<PayrollRunBundleDto>, sqlx::Error> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let runs = sqlx::query_as::<_, PayrollRunDto>(concat!(
        payroll_run_select!(),
        r#"
        WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ)
        ORDER BY updated_at ASC, created_at ASC, id ASC
        LIMIT $2
        "#
    ))
    .bind(updated_after)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let run_ids = runs.iter().map(|run| run.id.clone()).collect::<Vec<_>>();
    let items = list_payroll_run_items_for_runs(pool, run_ids.clone()).await?;
    let repayments = list_employee_cash_advance_repayments_for_runs(pool, run_ids).await?;

    let mut items_by_run_id = HashMap::<String, Vec<PayrollRunItemDto>>::new();
    for item in items {
        items_by_run_id
            .entry(item.payroll_run_id.clone())
            .or_default()
            .push(item);
    }

    let mut repayments_by_run_id = HashMap::<String, Vec<EmployeeCashAdvanceRepaymentDto>>::new();
    for repayment in repayments {
        repayments_by_run_id
            .entry(repayment.payroll_run_id.clone())
            .or_default()
            .push(repayment);
    }

    Ok(runs
        .into_iter()
        .map(|run| PayrollRunBundleDto {
            items: items_by_run_id.remove(&run.id).unwrap_or_default(),
            cash_advance_repayments: repayments_by_run_id.remove(&run.id).unwrap_or_default(),
            run,
        })
        .collect())
}

pub async fn get_payroll_run_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<PayrollRunBundleDto>, sqlx::Error> {
    let run = sqlx::query_as::<_, PayrollRunDto>(concat!(payroll_run_select!(), " WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;

    if let Some(run) = run {
        let items = list_payroll_run_items(pool, &run.id).await?;
        let cash_advance_repayments =
            list_employee_cash_advance_repayments_for_run(pool, &run.id).await?;
        return Ok(Some(PayrollRunBundleDto {
            run,
            items,
            cash_advance_repayments,
        }));
    }

    Ok(None)
}

pub async fn upsert_payroll_run_bundle(
    pool: &PgPool,
    input: PayrollRunBundleDto,
) -> Result<PayrollRunBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let run_id = input.run.id.clone();

    let upserted_run = upsert_payroll_run(&mut tx, input.run).await?;
    if let Some(run) = upserted_run {
        replace_payroll_run_items(&mut tx, &run.id, input.items).await?;
        replace_employee_cash_advance_repayments_for_run(
            &mut tx,
            &run.id,
            input.cash_advance_repayments,
        )
        .await?;
        let items = list_payroll_run_items_in_tx(&mut tx, &run.id).await?;
        let cash_advance_repayments =
            list_employee_cash_advance_repayments_for_run_in_tx(&mut tx, &run.id).await?;
        tx.commit().await?;
        return Ok(PayrollRunBundleDto {
            run,
            items,
            cash_advance_repayments,
        });
    }

    let run = get_payroll_run_in_tx(&mut tx, &run_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let items = list_payroll_run_items_in_tx(&mut tx, &run.id).await?;
    let cash_advance_repayments =
        list_employee_cash_advance_repayments_for_run_in_tx(&mut tx, &run.id).await?;
    tx.commit().await?;

    Ok(PayrollRunBundleDto {
        run,
        items,
        cash_advance_repayments,
    })
}

pub async fn list_employee_cash_advance_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<EmployeeCashAdvanceBundleDto>, sqlx::Error> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let cash_advances = sqlx::query_as::<_, EmployeeCashAdvanceDto>(concat!(
        employee_cash_advance_select!(),
        r#"
        WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ)
        ORDER BY updated_at ASC, created_at ASC, id ASC
        LIMIT $2
        "#
    ))
    .bind(updated_after)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let cash_advance_ids = cash_advances
        .iter()
        .map(|cash_advance| cash_advance.id.clone())
        .collect::<Vec<_>>();
    let repayments =
        list_employee_cash_advance_repayments_for_advances(pool, cash_advance_ids).await?;

    let mut repayments_by_advance_id = HashMap::<String, Vec<EmployeeCashAdvanceRepaymentDto>>::new();
    for repayment in repayments {
        repayments_by_advance_id
            .entry(repayment.cash_advance_id.clone())
            .or_default()
            .push(repayment);
    }

    Ok(cash_advances
        .into_iter()
        .map(|cash_advance| EmployeeCashAdvanceBundleDto {
            repayments: repayments_by_advance_id
                .remove(&cash_advance.id)
                .unwrap_or_default(),
            cash_advance,
        })
        .collect())
}

pub async fn get_employee_cash_advance_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<EmployeeCashAdvanceBundleDto>, sqlx::Error> {
    let cash_advance = sqlx::query_as::<_, EmployeeCashAdvanceDto>(concat!(
        employee_cash_advance_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;

    if let Some(cash_advance) = cash_advance {
        let repayments =
            list_employee_cash_advance_repayments_for_advance(pool, &cash_advance.id).await?;
        return Ok(Some(EmployeeCashAdvanceBundleDto {
            cash_advance,
            repayments,
        }));
    }

    Ok(None)
}

pub async fn upsert_employee_cash_advance_bundle(
    pool: &PgPool,
    input: EmployeeCashAdvanceBundleDto,
) -> Result<EmployeeCashAdvanceBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let cash_advance_id = input.cash_advance.id.clone();

    let upserted_cash_advance = upsert_employee_cash_advance(&mut tx, input.cash_advance).await?;
    if let Some(cash_advance) = upserted_cash_advance {
        replace_employee_cash_advance_repayments_for_advance(
            &mut tx,
            &cash_advance.id,
            input.repayments,
        )
        .await?;
        let repayments =
            list_employee_cash_advance_repayments_for_advance_in_tx(&mut tx, &cash_advance.id)
                .await?;
        tx.commit().await?;
        return Ok(EmployeeCashAdvanceBundleDto {
            cash_advance,
            repayments,
        });
    }

    let cash_advance = get_employee_cash_advance_in_tx(&mut tx, &cash_advance_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let repayments =
        list_employee_cash_advance_repayments_for_advance_in_tx(&mut tx, &cash_advance.id).await?;
    tx.commit().await?;

    Ok(EmployeeCashAdvanceBundleDto {
        cash_advance,
        repayments,
    })
}

async fn list_payroll_run_items(
    pool: &PgPool,
    payroll_run_id: &str,
) -> Result<Vec<PayrollRunItemDto>, sqlx::Error> {
    sqlx::query_as::<_, PayrollRunItemDto>(concat!(
        payroll_run_item_select!(),
        " WHERE payroll_run_id = $1 ORDER BY employee_name ASC, id ASC"
    ))
    .bind(payroll_run_id)
    .fetch_all(pool)
    .await
}

async fn list_payroll_run_items_for_runs(
    pool: &PgPool,
    payroll_run_ids: Vec<String>,
) -> Result<Vec<PayrollRunItemDto>, sqlx::Error> {
    if payroll_run_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, PayrollRunItemDto>(concat!(
        payroll_run_item_select!(),
        " WHERE payroll_run_id = ANY($1) ORDER BY payroll_run_id ASC, employee_name ASC, id ASC"
    ))
    .bind(payroll_run_ids)
    .fetch_all(pool)
    .await
}

async fn list_payroll_run_items_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    payroll_run_id: &str,
) -> Result<Vec<PayrollRunItemDto>, sqlx::Error> {
    sqlx::query_as::<_, PayrollRunItemDto>(concat!(
        payroll_run_item_select!(),
        " WHERE payroll_run_id = $1 ORDER BY employee_name ASC, id ASC"
    ))
    .bind(payroll_run_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_payroll_run_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    payroll_run_id: &str,
) -> Result<Option<PayrollRunDto>, sqlx::Error> {
    sqlx::query_as::<_, PayrollRunDto>(concat!(payroll_run_select!(), " WHERE id = $1"))
        .bind(payroll_run_id)
        .fetch_optional(&mut **tx)
        .await
}

async fn upsert_payroll_run(
    tx: &mut Transaction<'_, Postgres>,
    input: PayrollRunDto,
) -> Result<Option<PayrollRunDto>, sqlx::Error> {
    sqlx::query_as::<_, PayrollRunDto>(
        r#"
        INSERT INTO payroll_runs (
            id,
            payroll_number,
            period_start,
            period_end,
            status,
            employee_count,
            gross_amount,
            allowance_amount,
            bonus_amount,
            other_deduction_amount,
            cash_advance_deduction_amount,
            deduction_amount,
            net_amount,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            approved_at,
            paid_at,
            voided_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at,
            updated_at
        )
        VALUES (
            $1,
            $2,
            $3::DATE,
            $4::DATE,
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
            $22::TIMESTAMPTZ,
            $23::TIMESTAMPTZ,
            $24,
            $25,
            $26,
            $27,
            $28::TIMESTAMPTZ,
            $29::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            payroll_number = EXCLUDED.payroll_number,
            period_start = EXCLUDED.period_start,
            period_end = EXCLUDED.period_end,
            status = EXCLUDED.status,
            employee_count = EXCLUDED.employee_count,
            gross_amount = EXCLUDED.gross_amount,
            allowance_amount = EXCLUDED.allowance_amount,
            bonus_amount = EXCLUDED.bonus_amount,
            other_deduction_amount = EXCLUDED.other_deduction_amount,
            cash_advance_deduction_amount = EXCLUDED.cash_advance_deduction_amount,
            deduction_amount = EXCLUDED.deduction_amount,
            net_amount = EXCLUDED.net_amount,
            payment_method = EXCLUDED.payment_method,
            payment_channel = EXCLUDED.payment_channel,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            finance_transaction_id = EXCLUDED.finance_transaction_id,
            notes = EXCLUDED.notes,
            approved_at = EXCLUDED.approved_at,
            paid_at = EXCLUDED.paid_at,
            voided_at = EXCLUDED.voided_at,
            created_by = COALESCE(payroll_runs.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(payroll_runs.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= payroll_runs.updated_at
        RETURNING
            id,
            payroll_number,
            period_start::TEXT AS period_start,
            period_end::TEXT AS period_end,
            status,
            employee_count,
            gross_amount,
            allowance_amount,
            bonus_amount,
            other_deduction_amount,
            cash_advance_deduction_amount,
            deduction_amount,
            net_amount,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            approved_at::TEXT AS approved_at,
            paid_at::TEXT AS paid_at,
            voided_at::TEXT AS voided_at,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        "#
    )
    .bind(input.id)
    .bind(input.payroll_number)
    .bind(input.period_start)
    .bind(input.period_end)
    .bind(input.status)
    .bind(input.employee_count)
    .bind(input.gross_amount)
    .bind(input.allowance_amount)
    .bind(input.bonus_amount)
    .bind(input.other_deduction_amount)
    .bind(input.cash_advance_deduction_amount)
    .bind(input.deduction_amount)
    .bind(input.net_amount)
    .bind(input.payment_method)
    .bind(input.payment_channel)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.finance_transaction_id)
    .bind(input.notes)
    .bind(input.approved_at)
    .bind(input.paid_at)
    .bind(input.voided_at)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_payroll_run_items(
    tx: &mut Transaction<'_, Postgres>,
    payroll_run_id: &str,
    items: Vec<PayrollRunItemDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM payroll_run_items WHERE payroll_run_id = $1")
        .bind(payroll_run_id)
        .execute(&mut **tx)
        .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO payroll_run_items (
                id,
                payroll_run_id,
                employee_id,
                employee_name,
                employee_position,
                base_salary,
                allowance_amount,
                bonus_amount,
                other_deduction_amount,
                cash_advance_deduction_amount,
                deduction_amount,
                gross_amount,
                net_amount,
                notes,
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
                $15::TIMESTAMPTZ,
                $16::TIMESTAMPTZ
            )
            ON CONFLICT (id) DO UPDATE SET
                payroll_run_id = EXCLUDED.payroll_run_id,
                employee_id = EXCLUDED.employee_id,
                employee_name = EXCLUDED.employee_name,
                employee_position = EXCLUDED.employee_position,
                base_salary = EXCLUDED.base_salary,
                allowance_amount = EXCLUDED.allowance_amount,
                bonus_amount = EXCLUDED.bonus_amount,
                other_deduction_amount = EXCLUDED.other_deduction_amount,
                cash_advance_deduction_amount = EXCLUDED.cash_advance_deduction_amount,
                deduction_amount = EXCLUDED.deduction_amount,
                gross_amount = EXCLUDED.gross_amount,
                net_amount = EXCLUDED.net_amount,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at
            "#
        )
        .bind(item.id)
        .bind(item.payroll_run_id)
        .bind(item.employee_id)
        .bind(item.employee_name)
        .bind(item.employee_position)
        .bind(item.base_salary)
        .bind(item.allowance_amount)
        .bind(item.bonus_amount)
        .bind(item.other_deduction_amount)
        .bind(item.cash_advance_deduction_amount)
        .bind(item.deduction_amount)
        .bind(item.gross_amount)
        .bind(item.net_amount)
        .bind(item.notes)
        .bind(item.created_at)
        .bind(item.updated_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn get_employee_cash_advance_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    cash_advance_id: &str,
) -> Result<Option<EmployeeCashAdvanceDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCashAdvanceDto>(concat!(
        employee_cash_advance_select!(),
        " WHERE id = $1"
    ))
    .bind(cash_advance_id)
    .fetch_optional(&mut **tx)
    .await
}

async fn upsert_employee_cash_advance(
    tx: &mut Transaction<'_, Postgres>,
    input: EmployeeCashAdvanceDto,
) -> Result<Option<EmployeeCashAdvanceDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCashAdvanceDto>(
        r#"
        INSERT INTO employee_cash_advances (
            id,
            advance_number,
            employee_id,
            employee_name,
            employee_position,
            amount,
            outstanding_amount,
            status,
            disbursed_at,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            voided_at,
            void_reason,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
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
            $9::TIMESTAMPTZ,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17::TIMESTAMPTZ,
            $18,
            $19,
            $20,
            $21,
            $22,
            $23::TIMESTAMPTZ,
            $24::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            advance_number = EXCLUDED.advance_number,
            employee_id = EXCLUDED.employee_id,
            employee_name = EXCLUDED.employee_name,
            employee_position = EXCLUDED.employee_position,
            amount = EXCLUDED.amount,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            disbursed_at = EXCLUDED.disbursed_at,
            payment_method = EXCLUDED.payment_method,
            payment_channel = EXCLUDED.payment_channel,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            finance_transaction_id = EXCLUDED.finance_transaction_id,
            notes = EXCLUDED.notes,
            voided_at = EXCLUDED.voided_at,
            void_reason = EXCLUDED.void_reason,
            created_by = COALESCE(employee_cash_advances.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(employee_cash_advances.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= employee_cash_advances.updated_at
        RETURNING
            id,
            advance_number,
            employee_id,
            employee_name,
            employee_position,
            amount,
            outstanding_amount,
            status,
            disbursed_at::TEXT AS disbursed_at,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            voided_at::TEXT AS voided_at,
            void_reason,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        "#
    )
    .bind(input.id)
    .bind(input.advance_number)
    .bind(input.employee_id)
    .bind(input.employee_name)
    .bind(input.employee_position)
    .bind(input.amount)
    .bind(input.outstanding_amount)
    .bind(input.status)
    .bind(input.disbursed_at)
    .bind(input.payment_method)
    .bind(input.payment_channel)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.finance_transaction_id)
    .bind(input.notes)
    .bind(input.voided_at)
    .bind(input.void_reason)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn list_employee_cash_advance_repayments_for_run(
    pool: &PgPool,
    payroll_run_id: &str,
) -> Result<Vec<EmployeeCashAdvanceRepaymentDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCashAdvanceRepaymentDto>(concat!(
        employee_cash_advance_repayment_select!(),
        " WHERE payroll_run_id = $1 ORDER BY employee_name ASC, cash_advance_number ASC, id ASC"
    ))
    .bind(payroll_run_id)
    .fetch_all(pool)
    .await
}

async fn list_employee_cash_advance_repayments_for_runs(
    pool: &PgPool,
    payroll_run_ids: Vec<String>,
) -> Result<Vec<EmployeeCashAdvanceRepaymentDto>, sqlx::Error> {
    if payroll_run_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, EmployeeCashAdvanceRepaymentDto>(concat!(
        employee_cash_advance_repayment_select!(),
        " WHERE payroll_run_id = ANY($1) ORDER BY payroll_run_id ASC, employee_name ASC, id ASC"
    ))
    .bind(payroll_run_ids)
    .fetch_all(pool)
    .await
}

async fn list_employee_cash_advance_repayments_for_run_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    payroll_run_id: &str,
) -> Result<Vec<EmployeeCashAdvanceRepaymentDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCashAdvanceRepaymentDto>(concat!(
        employee_cash_advance_repayment_select!(),
        " WHERE payroll_run_id = $1 ORDER BY employee_name ASC, cash_advance_number ASC, id ASC"
    ))
    .bind(payroll_run_id)
    .fetch_all(&mut **tx)
    .await
}

async fn list_employee_cash_advance_repayments_for_advance(
    pool: &PgPool,
    cash_advance_id: &str,
) -> Result<Vec<EmployeeCashAdvanceRepaymentDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCashAdvanceRepaymentDto>(concat!(
        employee_cash_advance_repayment_select!(),
        " WHERE cash_advance_id = $1 ORDER BY allocated_at ASC, payroll_number ASC, id ASC"
    ))
    .bind(cash_advance_id)
    .fetch_all(pool)
    .await
}

async fn list_employee_cash_advance_repayments_for_advances(
    pool: &PgPool,
    cash_advance_ids: Vec<String>,
) -> Result<Vec<EmployeeCashAdvanceRepaymentDto>, sqlx::Error> {
    if cash_advance_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, EmployeeCashAdvanceRepaymentDto>(concat!(
        employee_cash_advance_repayment_select!(),
        " WHERE cash_advance_id = ANY($1) ORDER BY cash_advance_id ASC, allocated_at ASC, id ASC"
    ))
    .bind(cash_advance_ids)
    .fetch_all(pool)
    .await
}

async fn list_employee_cash_advance_repayments_for_advance_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    cash_advance_id: &str,
) -> Result<Vec<EmployeeCashAdvanceRepaymentDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCashAdvanceRepaymentDto>(concat!(
        employee_cash_advance_repayment_select!(),
        " WHERE cash_advance_id = $1 ORDER BY allocated_at ASC, payroll_number ASC, id ASC"
    ))
    .bind(cash_advance_id)
    .fetch_all(&mut **tx)
    .await
}

async fn replace_employee_cash_advance_repayments_for_run(
    tx: &mut Transaction<'_, Postgres>,
    payroll_run_id: &str,
    repayments: Vec<EmployeeCashAdvanceRepaymentDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM employee_cash_advance_repayments WHERE payroll_run_id = $1")
        .bind(payroll_run_id)
        .execute(&mut **tx)
        .await?;

    insert_employee_cash_advance_repayments(tx, repayments).await
}

async fn replace_employee_cash_advance_repayments_for_advance(
    tx: &mut Transaction<'_, Postgres>,
    cash_advance_id: &str,
    repayments: Vec<EmployeeCashAdvanceRepaymentDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM employee_cash_advance_repayments WHERE cash_advance_id = $1")
        .bind(cash_advance_id)
        .execute(&mut **tx)
        .await?;

    insert_employee_cash_advance_repayments(tx, repayments).await
}

async fn insert_employee_cash_advance_repayments(
    tx: &mut Transaction<'_, Postgres>,
    repayments: Vec<EmployeeCashAdvanceRepaymentDto>,
) -> Result<(), sqlx::Error> {
    for repayment in repayments {
        sqlx::query(
            r#"
            INSERT INTO employee_cash_advance_repayments (
                id,
                cash_advance_id,
                cash_advance_number,
                payroll_run_id,
                payroll_run_item_id,
                payroll_number,
                employee_id,
                employee_name,
                amount,
                status,
                allocated_at,
                posted_at,
                voided_at,
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
                $11::TIMESTAMPTZ,
                $12::TIMESTAMPTZ,
                $13::TIMESTAMPTZ,
                $14::TIMESTAMPTZ,
                $15::TIMESTAMPTZ
            )
            ON CONFLICT (id) DO UPDATE SET
                cash_advance_id = EXCLUDED.cash_advance_id,
                cash_advance_number = EXCLUDED.cash_advance_number,
                payroll_run_id = EXCLUDED.payroll_run_id,
                payroll_run_item_id = EXCLUDED.payroll_run_item_id,
                payroll_number = EXCLUDED.payroll_number,
                employee_id = EXCLUDED.employee_id,
                employee_name = EXCLUDED.employee_name,
                amount = EXCLUDED.amount,
                status = EXCLUDED.status,
                allocated_at = EXCLUDED.allocated_at,
                posted_at = EXCLUDED.posted_at,
                voided_at = EXCLUDED.voided_at,
                updated_at = EXCLUDED.updated_at
            WHERE EXCLUDED.updated_at >= employee_cash_advance_repayments.updated_at
            "#
        )
        .bind(repayment.id)
        .bind(repayment.cash_advance_id)
        .bind(repayment.cash_advance_number)
        .bind(repayment.payroll_run_id)
        .bind(repayment.payroll_run_item_id)
        .bind(repayment.payroll_number)
        .bind(repayment.employee_id)
        .bind(repayment.employee_name)
        .bind(repayment.amount)
        .bind(repayment.status)
        .bind(repayment.allocated_at)
        .bind(repayment.posted_at)
        .bind(repayment.voided_at)
        .bind(repayment.created_at)
        .bind(repayment.updated_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
