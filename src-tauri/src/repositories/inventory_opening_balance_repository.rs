use crate::{
    models::opening_balance::InventoryOpeningBalancePostingBundleDto,
    repositories::{
        accounting_setting_repository, journal_entry_repository, opening_balance_repository,
        stock_mutation_repository,
    },
};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::{HashMap, HashSet};

const AMOUNT_TOLERANCE: f64 = 0.005;
const QUANTITY_TOLERANCE: f64 = 0.000001;
const INVENTORY_OPENING_SOURCE_EVENT: &str = "INVENTORY_OPENING_BALANCE_POSTED";

fn protocol_error(message: impl Into<String>) -> sqlx::Error {
    sqlx::Error::Protocol(message.into())
}

fn amount_matches(left: f64, right: f64) -> bool {
    left.is_finite() && right.is_finite() && (left - right).abs() <= AMOUNT_TOLERANCE
}

fn quantity_matches(left: f64, right: f64) -> bool {
    left.is_finite() && right.is_finite() && (left - right).abs() <= QUANTITY_TOLERANCE
}

fn validate_inventory_opening_posting_bundle(
    input: &InventoryOpeningBalancePostingBundleDto,
) -> Result<(), sqlx::Error> {
    let opening = &input.opening_balance;
    let batch = &opening.batch;
    let journal = &input.journal_entry;

    if batch.module != "INVENTORY" {
        return Err(protocol_error(
            "Posting komposit persediaan hanya menerima module INVENTORY.",
        ));
    }
    if batch.status != "POSTED" && batch.status != "LOCKED" {
        return Err(protocol_error(
            "Posting komposit persediaan wajib berstatus POSTED atau LOCKED.",
        ));
    }
    if opening.lines.is_empty() {
        return Err(protocol_error(
            "Posting komposit persediaan wajib memiliki minimal satu baris.",
        ));
    }

    let expected_journal_id = format!("{}:journal", batch.id);
    if journal.entry.id != expected_journal_id
        || batch.journal_entry_id.as_deref() != Some(journal.entry.id.as_str())
    {
        return Err(protocol_error(
            "ID jurnal posting persediaan tidak sesuai ID batch deterministik.",
        ));
    }
    if journal.entry.status != "POSTED"
        || journal.entry.source_type != "OPENING_BALANCE"
        || journal.entry.source_id.as_deref() != Some(batch.id.as_str())
        || journal.entry.source_event.as_deref() != Some(INVENTORY_OPENING_SOURCE_EVENT)
    {
        return Err(protocol_error(
            "Sumber jurnal posting persediaan tidak sesuai batch saldo awal.",
        ));
    }
    if !amount_matches(journal.entry.total_debit, journal.entry.total_credit)
        || !amount_matches(journal.entry.total_debit, batch.total_debit)
        || !amount_matches(journal.entry.total_credit, batch.total_credit)
    {
        return Err(protocol_error(
            "Total jurnal dan batch saldo awal persediaan tidak konsisten.",
        ));
    }

    let mut opening_lines_by_id = HashMap::new();
    let mut product_ids = HashSet::new();
    let mut opening_total = 0.0;
    let mut inventory_account_id: Option<&str> = None;
    let mut equity_account_id: Option<&str> = None;

    for line in &opening.lines {
        if line.batch_id != batch.id || line.module != "INVENTORY" {
            return Err(protocol_error(
                "Baris saldo awal persediaan mengacu ke batch atau module yang berbeda.",
            ));
        }

        let product_id = line
            .product_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| protocol_error("Baris saldo awal persediaan wajib memiliki produk."))?;
        let quantity = line
            .quantity
            .filter(|value| value.is_finite() && *value > 0.0)
            .ok_or_else(|| {
                protocol_error("Qty baris saldo awal persediaan harus positif dan valid.")
            })?;
        let unit_cost = line
            .unit_cost
            .filter(|value| value.is_finite() && *value > 0.0)
            .ok_or_else(|| {
                protocol_error("HPP baris saldo awal persediaan harus positif dan valid.")
            })?;
        let unit = line
            .unit
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| protocol_error("Satuan baris saldo awal persediaan wajib diisi."))?;
        let account_id = line
            .account_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| protocol_error("Akun persediaan pada baris wajib diisi."))?;
        let counter_account_id = line
            .counter_account_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| protocol_error("Akun ekuitas pada baris wajib diisi."))?;

        if !product_ids.insert(product_id) || opening_lines_by_id.insert(&line.id, line).is_some() {
            return Err(protocol_error(
                "Produk atau ID baris saldo awal persediaan muncul lebih dari satu kali.",
            ));
        }
        if inventory_account_id
            .replace(account_id)
            .is_some_and(|id| id != account_id)
            || equity_account_id
                .replace(counter_account_id)
                .is_some_and(|id| id != counter_account_id)
        {
            return Err(protocol_error(
                "Seluruh baris saldo awal persediaan harus memakai akun yang sama.",
            ));
        }

        let expected_lot_id = format!("{}:lot:{}", batch.id, product_id);
        if line.inventory_lot_id.as_deref() != Some(expected_lot_id.as_str()) {
            return Err(protocol_error(
                "ID lot saldo awal persediaan tidak deterministik.",
            ));
        }

        let calculated_amount = (quantity * unit_cost * 100.0).round() / 100.0;
        if !amount_matches(line.base_amount, calculated_amount)
            || !amount_matches(line.debit, line.base_amount)
            || !amount_matches(line.credit, 0.0)
        {
            return Err(protocol_error(
                "Nilai debit baris saldo awal persediaan tidak sesuai qty dan HPP.",
            ));
        }
        if unit.trim().is_empty() {
            return Err(protocol_error(
                "Satuan baris saldo awal persediaan wajib diisi.",
            ));
        }
        opening_total += line.base_amount;
    }

    if !amount_matches(opening_total, batch.total_debit)
        || !amount_matches(batch.total_debit, batch.total_credit)
    {
        return Err(protocol_error(
            "Total baris saldo awal persediaan tidak sesuai total batch.",
        ));
    }

    let journal_debit = journal.lines.iter().try_fold(0.0, |sum, line| {
        if line.journal_entry_id != journal.entry.id
            || !line.debit.is_finite()
            || !line.credit.is_finite()
            || line.debit < 0.0
            || line.credit < 0.0
            || (line.debit > 0.0 && line.credit > 0.0)
        {
            return Err(protocol_error(
                "Baris jurnal saldo awal persediaan tidak valid.",
            ));
        }
        Ok(sum + line.debit)
    })?;
    let journal_credit = journal.lines.iter().map(|line| line.credit).sum::<f64>();
    let inventory_debit = journal
        .lines
        .iter()
        .filter(|line| Some(line.account_id.as_str()) == inventory_account_id)
        .map(|line| line.debit)
        .sum::<f64>();
    let equity_credit = journal
        .lines
        .iter()
        .filter(|line| Some(line.account_id.as_str()) == equity_account_id)
        .map(|line| line.credit)
        .sum::<f64>();
    if !amount_matches(journal_debit, journal.entry.total_debit)
        || !amount_matches(journal_credit, journal.entry.total_credit)
        || !amount_matches(inventory_debit, batch.total_debit)
        || !amount_matches(equity_credit, batch.total_credit)
    {
        return Err(protocol_error(
            "Baris jurnal tidak merepresentasikan debit persediaan dan kredit ekuitas.",
        ));
    }

    if input.stock_snapshots.len() != opening.lines.len() {
        return Err(protocol_error(
            "Jumlah snapshot stok harus sama dengan jumlah baris saldo awal persediaan.",
        ));
    }

    let cutoff_date = batch
        .cutoff_date
        .get(0..10)
        .ok_or_else(|| protocol_error("Tanggal cutoff saldo awal persediaan tidak valid."))?;
    let mut snapshot_line_ids = HashSet::new();
    for snapshot in &input.stock_snapshots {
        let line = opening_lines_by_id
            .get(&snapshot.source_line_id)
            .ok_or_else(|| {
                protocol_error("Snapshot stok tidak memiliki pasangan baris saldo awal.")
            })?;
        let product_id = line.product_id.as_deref().unwrap_or_default();
        let quantity = line.quantity.unwrap_or_default();
        let unit = line.unit.as_deref().unwrap_or_default();
        let expected_mutation_id = format!("OPENING_BALANCE:{}:{}", batch.id, line.id);

        if !snapshot_line_ids.insert(snapshot.source_line_id.as_str())
            || snapshot.id != expected_mutation_id
            || snapshot.source_type != "OPENING_BALANCE"
            || snapshot.source_id != batch.id
            || snapshot.product_id != product_id
            || snapshot.unit != unit
            || snapshot.stock_unit != unit
            || snapshot.source_unit.as_deref() != Some(unit)
            || !quantity_matches(snapshot.quantity_delta, 0.0)
            || !snapshot
                .source_quantity
                .is_some_and(|value| quantity_matches(value, quantity) && value > 0.0)
            || snapshot.occurred_at.get(0..10) != Some(cutoff_date)
        {
            return Err(protocol_error(
                "Snapshot stok tidak konsisten dengan baris saldo awal persediaan.",
            ));
        }
    }

    if let Some(setting) = &input.general_ledger_setting {
        if setting.id != "default"
            || !setting.is_ready
            || setting.inventory_policy != "PERPETUAL_INVENTORY"
            || setting
                .cutoff_date
                .as_deref()
                .and_then(|value| value.get(0..10))
                != Some(cutoff_date)
        {
            return Err(protocol_error(
                "Setting General Ledger tidak konsisten dengan posting persediaan.",
            ));
        }
    }

    Ok(())
}

async fn lock_terminal_account_opening_balance_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    cutoff_date: &str,
) -> Result<(), sqlx::Error> {
    let account_batch_id = sqlx::query_scalar::<_, String>(
        r#"
        SELECT id
        FROM opening_balance_batches
        WHERE module = 'ACCOUNT'
          AND cutoff_date::DATE = $1::TIMESTAMPTZ::DATE
          AND status IN ('POSTED', 'LOCKED', 'SKIPPED')
          AND deleted_at IS NULL
        ORDER BY updated_at DESC, id ASC
        LIMIT 1
        FOR UPDATE
        "#,
    )
    .bind(cutoff_date)
    .fetch_optional(&mut **tx)
    .await?;

    if account_batch_id.is_none() {
        return Err(protocol_error(
            "Saldo awal akun pada cutoff yang sama belum terminal di server. Sinkronkan modul ACCOUNT lalu retry.",
        ));
    }

    Ok(())
}

pub async fn post_inventory_opening_balance_bundle(
    pool: &PgPool,
    input: InventoryOpeningBalancePostingBundleDto,
) -> Result<InventoryOpeningBalancePostingBundleDto, sqlx::Error> {
    validate_inventory_opening_posting_bundle(&input)?;

    let InventoryOpeningBalancePostingBundleDto {
        opening_balance,
        journal_entry,
        mut stock_snapshots,
        general_ledger_setting,
    } = input;
    let batch_id = opening_balance.batch.id.clone();
    let cutoff_date = opening_balance.batch.cutoff_date.clone();
    let mut tx = pool.begin().await?;

    // The batch lock serializes the whole composite across devices. The regular
    // opening-balance repository uses the same key, so a stale standalone draft
    // cannot interleave with this terminal posting.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(&batch_id)
        .execute(&mut *tx)
        .await?;

    if general_ledger_setting.is_some() {
        // ACCOUNT only needs to be terminal when this composite also activates
        // the ledger. Inventory may be posted first and GL activated later by
        // its standalone queue after both remote modules are terminal.
        lock_terminal_account_opening_balance_in_tx(&mut tx, &cutoff_date).await?;
    }

    let opening_balance =
        opening_balance_repository::upsert_opening_balance_bundle_in_tx(&mut tx, opening_balance)
            .await?;
    let journal_entry =
        journal_entry_repository::upsert_journal_entry_bundle_in_tx(&mut tx, journal_entry).await?;

    // Stable product order prevents two different cutoff bundles from taking
    // product row locks in opposite order.
    stock_snapshots.sort_by(|left, right| {
        left.product_id
            .cmp(&right.product_id)
            .then_with(|| left.id.cmp(&right.id))
    });
    let mut persisted_snapshots = Vec::with_capacity(stock_snapshots.len());
    for snapshot in stock_snapshots {
        persisted_snapshots
            .push(stock_mutation_repository::upsert_stock_mutation_in_tx(&mut tx, snapshot).await?);
    }

    if (opening_balance.batch.status != "POSTED" && opening_balance.batch.status != "LOCKED")
        || journal_entry.entry.status != "POSTED"
    {
        return Err(protocol_error(
            "Posting komposit ditolak karena batch atau jurnal server bukan status posted.",
        ));
    }

    let general_ledger_setting = match general_ledger_setting {
        Some(setting) => {
            let setting = accounting_setting_repository::upsert_general_ledger_setting_in_tx(
                &mut tx, setting,
            )
            .await?;
            if !setting.is_ready
                || setting.inventory_policy != "PERPETUAL_INVENTORY"
                || setting
                    .cutoff_date
                    .as_deref()
                    .and_then(|value| value.get(0..10))
                    != cutoff_date.get(0..10)
            {
                return Err(protocol_error(
                    "Aktivasi General Ledger server tidak konvergen dengan cutoff dan kebijakan persediaan.",
                ));
            }
            Some(setting)
        }
        None => None,
    };

    tx.commit().await?;
    Ok(InventoryOpeningBalancePostingBundleDto {
        opening_balance,
        journal_entry,
        stock_snapshots: persisted_snapshots,
        general_ledger_setting,
    })
}
