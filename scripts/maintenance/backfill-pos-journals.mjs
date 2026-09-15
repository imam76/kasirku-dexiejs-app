import { join } from 'node:path';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_FINANCE_ACCOUNT_MAPPINGS,
} from '../../src/constants/chartOfAccounts.ts';

const DATABASE_URL_PATH = join(process.env.APPDATA ?? '', 'frayukti', 'database_url.txt');
const DATABASE_URL = (await Bun.file(DATABASE_URL_PATH).text()).trim();
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const ROLLBACK_PREFIX = '__LEDGER_REPAIR_ROLLBACK__';
const TIME_ZONE = 'Asia/Jakarta';
const SOURCE_EVENTS = {
  sale: 'POS_SALE_POSTED',
  expense: 'POS_EXPENSE_POSTED',
  physicalStockFound: 'POS_PHYSICAL_STOCK_FOUND_POSTED',
  stockOpname: 'STOCK_OPNAME_POSTED',
};

if (!DATABASE_URL) throw new Error('Database URL is not configured.');

const sql = new Bun.SQL(DATABASE_URL, { max: 1 });

const getPreview = async (query) => {
  const [configuration] = await query`
    SELECT
      gl.is_ready,
      gl.cutoff_date,
      gl.inventory_policy,
      gl.activated_at,
      COALESCE(module.is_enabled, FALSE) AS module_enabled
    FROM general_ledger_setting gl
    LEFT JOIN enabled_modules module ON module.code = 'GENERAL_LEDGER'
    WHERE gl.id = 'default'
    LIMIT 1
  `;
  if (!configuration) throw new Error('General Ledger setting is missing.');

  const cutoffDate = String(configuration.cutoff_date ?? '').slice(0, 10);
  if (!configuration.is_ready || !configuration.module_enabled || !cutoffDate) {
    throw new Error('General Ledger is not ready for backfill.');
  }
  if (configuration.inventory_policy !== 'PERPETUAL_INVENTORY') {
    throw new Error('POS journal backfill requires PERPETUAL_INVENTORY.');
  }

  const accounts = await query`
    SELECT id, code, name, type, is_active, is_postable
    FROM chart_of_accounts
    WHERE deleted_at IS NULL
      AND is_active = TRUE
      AND is_postable = TRUE
    ORDER BY id
  `;

  const mappings = await query`
    SELECT key, category, account_id, account_code, account_name, account_type
    FROM finance_account_mappings
    ORDER BY key, category
  `;

  const existingPosJournalAccounts = await query`
    SELECT DISTINCT
      jel.account_id,
      jel.account_code,
      jel.account_name,
      jel.account_type
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.deleted_at IS NULL
      AND je.status = 'POSTED'
      AND je.source_type = 'POS_TRANSACTION'
    ORDER BY jel.account_type, jel.account_code, jel.account_id
  `;

  const candidates = await query`
    WITH item_totals AS (
      SELECT
        transaction_id,
        COUNT(*)::INT AS item_count,
        ROUND(SUM(ROUND((subtotal - profit)::NUMERIC, 2)), 2)::DOUBLE PRECISION AS cogs,
        ROUND(SUM(subtotal::NUMERIC), 2)::DOUBLE PRECISION AS item_total
      FROM pos_transaction_items
      GROUP BY transaction_id
    ), existing AS (
      SELECT source_id, source_event
      FROM journal_entries
      WHERE deleted_at IS NULL AND status = 'POSTED' AND source_type = 'POS_TRANSACTION'
    )
    SELECT
      CASE WHEN t.business_type = 'EXPENSE' THEN 'EXPENSE' ELSE 'SALE' END AS kind,
      COUNT(*)::INT AS transaction_count,
      ROUND(SUM(t.total_amount::NUMERIC), 2)::DOUBLE PRECISION AS transaction_total,
        ROUND(SUM(CASE
          WHEN t.business_type = 'EXPENSE' THEN 0
          ELSE COALESCE(i.cogs, 0)
        END::NUMERIC), 2)::DOUBLE PRECISION AS cogs,
      COUNT(*) FILTER (WHERE COALESCE(i.item_count, 0) = 0)::INT AS missing_item_count,
      COUNT(*) FILTER (WHERE ABS(t.total_amount - COALESCE(i.item_total, 0)) > 0.01)::INT AS item_total_mismatch_count
    FROM pos_transactions t
    LEFT JOIN item_totals i ON i.transaction_id = t.id
    LEFT JOIN existing e ON e.source_id = t.id
      AND e.source_event = CASE
        WHEN t.business_type = 'EXPENSE' THEN ${SOURCE_EVENTS.expense}
        ELSE ${SOURCE_EVENTS.sale}
      END
    WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
      AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
      AND e.source_id IS NULL
    GROUP BY CASE WHEN t.business_type = 'EXPENSE' THEN 'EXPENSE' ELSE 'SALE' END
    ORDER BY kind
  `;

  const paymentCoverage = await query`
    WITH missing_sales AS (
      SELECT t.id, t.total_amount, t.payment_posting_account_id
      FROM pos_transactions t
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status = 'POSTED'
            AND je.source_type = 'POS_TRANSACTION'
            AND je.source_id = t.id
            AND je.source_event = ${SOURCE_EVENTS.sale}
        )
    ), payments AS (
      SELECT
        reference_id AS transaction_id,
        ROUND(SUM(amount::NUMERIC), 2)::DOUBLE PRECISION AS payment_total,
        COUNT(*)::INT AS payment_count,
        COUNT(*) FILTER (WHERE cash_account_id IS NULL)::INT AS missing_account_count
      FROM finance_transactions
      WHERE deleted_at IS NULL AND type = 'INCOME' AND category = 'PENJUALAN'
      GROUP BY reference_id
    )
    SELECT
      COUNT(*)::INT AS transaction_count,
      COUNT(*) FILTER (WHERE p.transaction_id IS NULL)::INT AS missing_payment_rows,
      COUNT(*) FILTER (WHERE p.missing_account_count > 0)::INT AS missing_payment_accounts,
      COUNT(*) FILTER (WHERE p.transaction_id IS NOT NULL AND ABS(s.total_amount - p.payment_total) > 0.01)::INT AS payment_total_mismatches,
      COUNT(*) FILTER (WHERE p.transaction_id IS NULL AND s.payment_posting_account_id IS NULL)::INT AS needs_default_account
    FROM missing_sales s
    LEFT JOIN payments p ON p.transaction_id = s.id
  `;

  const paymentMismatchSamples = await query`
    WITH missing_sales AS (
      SELECT t.id, t.transaction_number, t.total_amount, t.payment_posting_account_id
      FROM pos_transactions t
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status = 'POSTED'
            AND je.source_type = 'POS_TRANSACTION'
            AND je.source_id = t.id
            AND je.source_event = ${SOURCE_EVENTS.sale}
        )
    ), payments AS (
      SELECT
        reference_id AS transaction_id,
        ROUND(SUM(amount::NUMERIC), 2)::DOUBLE PRECISION AS payment_total,
        COUNT(*)::INT AS payment_count,
        string_agg(DISTINCT COALESCE(cash_account_id, 'NULL'), ', ' ORDER BY COALESCE(cash_account_id, 'NULL')) AS account_ids
      FROM finance_transactions
      WHERE deleted_at IS NULL AND type = 'INCOME' AND category = 'PENJUALAN'
      GROUP BY reference_id
    )
    SELECT
      s.transaction_number,
      s.total_amount,
      p.payment_total,
      p.payment_count,
      p.account_ids,
      s.payment_posting_account_id
    FROM missing_sales s
    JOIN payments p ON p.transaction_id = s.id
    WHERE ABS(s.total_amount - p.payment_total) > 0.01
    ORDER BY ABS(s.total_amount - p.payment_total) DESC, s.transaction_number
    LIMIT 10
  `;
  const transactionAccountCoverage = await query`
    WITH missing_sales AS (
      SELECT t.id, t.payment_posting_account_id
      FROM pos_transactions t
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status = 'POSTED'
            AND je.source_type = 'POS_TRANSACTION'
            AND je.source_id = t.id
            AND je.source_event = ${SOURCE_EVENTS.sale}
        )
    ), remote_payment_accounts AS (
      SELECT
        f.reference_id AS transaction_id,
        COUNT(DISTINCT f.cash_account_id)::INT AS distinct_account_count,
        string_agg(DISTINCT f.cash_account_id, ', ' ORDER BY f.cash_account_id) AS account_ids
      FROM finance_transactions f
      JOIN missing_sales s ON s.id = f.reference_id
      WHERE f.deleted_at IS NULL
        AND f.type = 'INCOME'
        AND f.category = 'PENJUALAN'
        AND f.cash_account_id IS NOT NULL
      GROUP BY f.reference_id
    )
    SELECT
      COALESCE(s.payment_posting_account_id, 'NULL') AS transaction_account_id,
      COALESCE(p.distinct_account_count, 0)::INT AS remote_distinct_account_count,
      COALESCE(p.account_ids, 'NULL') AS remote_account_ids,
      COUNT(*)::INT AS transaction_count
    FROM missing_sales s
    LEFT JOIN remote_payment_accounts p ON p.transaction_id = s.id
    GROUP BY s.payment_posting_account_id, p.distinct_account_count, p.account_ids
    ORDER BY transaction_count DESC, transaction_account_id, remote_account_ids
  `;

  const baseAccountRows = await query`
    SELECT id, code, name, type, normal_balance, is_active, is_postable, deleted_at::TEXT AS deleted_at
    FROM chart_of_accounts
    WHERE id IN ('cash', 'bank', 'inventory', 'sales-pos', 'cogs', 'supplies-expense', 'other-expense')
    ORDER BY id
  `;
  const openingBalanceDetails = await query`
    SELECT
      je.entry_number,
      (je.entry_date AT TIME ZONE ${TIME_ZONE})::TEXT AS local_entry_date,
      jel.account_id,
      jel.account_code,
      jel.account_name,
      jel.account_type,
      jel.debit,
      jel.credit
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.deleted_at IS NULL
      AND je.status = 'POSTED'
      AND je.source_type = 'OPENING_BALANCE'
    ORDER BY je.entry_date, je.entry_number, jel.account_code, jel.account_id
  `;

  const inventorySnapshots = await query`
    SELECT
      (SELECT COUNT(*)::INT FROM products WHERE deleted_at IS NULL) AS active_product_count,
      (SELECT ROUND(SUM((stock * purchase_price)::NUMERIC), 2)::DOUBLE PRECISION
        FROM products WHERE deleted_at IS NULL) AS master_stock_value,
      (SELECT ROUND(SUM((quantity_remaining * cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION
        FROM inventory_lots) AS remaining_lot_value,
      (SELECT ROUND(SUM((quantity_received * cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION
        FROM inventory_lots) AS received_lot_value
  `;

  const inventoryLotCoverage = await query`
    SELECT
      source_type,
      COUNT(*)::INT AS lot_count,
      MIN(received_at) AS first_received_at,
      MAX(received_at) AS last_received_at,
      ROUND(SUM((quantity_received * cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS received_value,
      ROUND(SUM((quantity_remaining * cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS remaining_value
    FROM inventory_lots
    GROUP BY source_type
    ORDER BY source_type
  `;

  const inventoryAtCutoff = await query`
    WITH consumed AS (
      SELECT
        lot_id,
        SUM(quantity) FILTER (
          WHERE LEFT(created_at, 10) <= ${cutoffDate}
        ) AS consumed_through_cutoff
      FROM inventory_lot_consumptions
      GROUP BY lot_id
    )
    SELECT
      COUNT(*)::INT AS lot_count,
      ROUND(SUM((
        (lot.quantity_received - COALESCE(consumed.consumed_through_cutoff, 0)) * lot.cost_per_unit
      )::NUMERIC), 2)::DOUBLE PRECISION AS reconstructed_value
    FROM inventory_lots lot
    LEFT JOIN consumed ON consumed.lot_id = lot.id
    WHERE LEFT(lot.received_at, 10) <= ${cutoffDate}
  `;

  const openingBalanceBatches = await query`
    SELECT
      batch_number,
      module,
      cutoff_date,
      status,
      total_debit,
      total_credit,
      journal_entry_id,
      deleted_at::TEXT AS deleted_at
    FROM opening_balance_batches
    ORDER BY cutoff_date, module, batch_number
  `;

  const purchaseDocumentCoverage = await query`
    SELECT
      pd.type,
      pd.status,
      COUNT(*)::INT AS document_count,
      ROUND(SUM(COALESCE(pd.subtotal_amount, 0)::NUMERIC), 2)::DOUBLE PRECISION AS subtotal_amount,
      ROUND(SUM(COALESCE(pd.tax_amount, 0)::NUMERIC), 2)::DOUBLE PRECISION AS tax_amount,
      ROUND(SUM(COALESCE(pd.total_amount, 0)::NUMERIC), 2)::DOUBLE PRECISION AS total_amount,
      COUNT(*) FILTER (WHERE COALESCE(pd.tax_amount, 0) > 0)::INT AS taxed_document_count,
      COUNT(*) FILTER (WHERE je.id IS NULL)::INT AS missing_journal_count,
      MIN(COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ)) AS first_entry_at,
      MAX(COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ)) AS last_entry_at
    FROM purchase_documents pd
    LEFT JOIN journal_entries je
      ON je.deleted_at IS NULL
      AND je.status = 'POSTED'
      AND je.source_type = 'PURCHASE_INVOICE'
      AND je.source_id = pd.id
      AND je.source_event = CASE
        WHEN pd.type = 'PURCHASE_RETURN' THEN 'PURCHASE_RETURN_ISSUED'
        ELSE 'PURCHASE_INVOICE_ISSUED'
      END
    WHERE COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) >= ${cutoffDate}::DATE
    GROUP BY pd.type, pd.status
    ORDER BY pd.type, pd.status
  `;

  const stockOpnameCoverage = await query`
    SELECT
      so.status,
      COUNT(DISTINCT so.id)::INT AS opname_count,
      COUNT(soi.id)::INT AS item_count,
      ROUND(SUM(CASE WHEN soi.quantity_delta > 0 THEN soi.variance_value ELSE 0 END)::NUMERIC, 2)::DOUBLE PRECISION AS adjustment_in_value,
      ROUND(SUM(CASE WHEN soi.quantity_delta < 0 THEN ABS(soi.variance_value) ELSE 0 END)::NUMERIC, 2)::DOUBLE PRECISION AS adjustment_out_value,
      MIN(so.posted_at) AS first_posted_at,
      MAX(so.posted_at) AS last_posted_at
    FROM stock_opnames so
    LEFT JOIN stock_opname_items soi ON soi.opname_id = so.id
    WHERE so.posted_at >= ${cutoffDate}::DATE
    GROUP BY so.status
    ORDER BY so.status
  `;

  const purchasePaymentFinanceCoverage = await query`
    SELECT
      COUNT(*)::INT AS payment_count,
      ROUND(SUM(amount::NUMERIC), 2)::DOUBLE PRECISION AS payment_total,
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::INT AS active_payment_count,
      ROUND(SUM(amount::NUMERIC) FILTER (WHERE deleted_at IS NULL), 2)::DOUBLE PRECISION AS active_payment_total,
      MIN(created_at) FILTER (WHERE deleted_at IS NULL) AS first_active_payment_at,
      MAX(created_at) FILTER (WHERE deleted_at IS NULL) AS last_active_payment_at
    FROM finance_transactions
    WHERE category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
      AND created_at >= ${cutoffDate}::DATE
  `;

  const sourceTableColumns = await query`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'journal_entries',
        'journal_entry_lines',
        'purchase_documents',
        'stock_opnames',
        'stock_opname_items',
        'finance_transactions'
      )
    ORDER BY table_name, ordinal_position
  `;

  const financeCategoryCoverage = await query`
    SELECT
      type,
      category,
      COUNT(*)::INT AS transaction_count,
      ROUND(SUM(amount::NUMERIC), 2)::DOUBLE PRECISION AS amount,
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::INT AS active_count,
      ROUND(SUM(amount::NUMERIC) FILTER (WHERE deleted_at IS NULL), 2)::DOUBLE PRECISION AS active_amount,
      COUNT(DISTINCT reference_id) FILTER (WHERE deleted_at IS NULL)::INT AS active_reference_count
    FROM finance_transactions
    WHERE created_at >= ${cutoffDate}::DATE
    GROUP BY type, category
    ORDER BY type, category
  `;

  const inventoryConsumptionCoverage = await query`
    SELECT
      source_type,
      COUNT(*)::INT AS consumption_count,
      ROUND(SUM((quantity * cost_per_unit_at_consumption)::NUMERIC), 2)::DOUBLE PRECISION AS consumed_value,
      MIN(created_at) AS first_created_at,
      MAX(created_at) AS last_created_at
    FROM inventory_lot_consumptions
    WHERE LEFT(created_at, 10) >= ${cutoffDate}
    GROUP BY source_type
    ORDER BY source_type
  `;

  const purchaseCostReconciliationCoverage = await query`
    SELECT
      COUNT(*)::INT AS reconciliation_count,
      ROUND(SUM(total_estimated_cost::NUMERIC), 2)::DOUBLE PRECISION AS total_estimated_cost,
      ROUND(SUM(total_final_cost::NUMERIC), 2)::DOUBLE PRECISION AS total_final_cost,
      ROUND(SUM(total_variance_amount::NUMERIC), 2)::DOUBLE PRECISION AS total_variance_amount,
      ROUND(SUM(sold_cost_variance_amount::NUMERIC), 2)::DOUBLE PRECISION AS sold_cost_variance_amount,
      ROUND(SUM(remaining_stock_variance_amount::NUMERIC), 2)::DOUBLE PRECISION AS remaining_stock_variance_amount,
      COUNT(*) FILTER (WHERE je.id IS NULL)::INT AS missing_journal_count
    FROM purchase_cost_reconciliations pcr
    LEFT JOIN journal_entries je
      ON je.deleted_at IS NULL
      AND je.status = 'POSTED'
      AND je.source_type = 'PURCHASE_COST_RECONCILIATION'
      AND je.source_id = pcr.id
      AND je.source_event = 'PURCHASE_COST_RECONCILIATION_POSTED'
    WHERE LEFT(pcr.created_at, 10) >= ${cutoffDate}
  `;

  const activeSourceStatusCoverage = await query`
    SELECT 'payroll_runs' AS source, status, COUNT(*)::INT AS source_count,
      ROUND(SUM(net_amount::NUMERIC), 2)::DOUBLE PRECISION AS amount
    FROM payroll_runs
    WHERE created_at >= ${cutoffDate}::DATE
    GROUP BY status
    UNION ALL
    SELECT 'employee_cash_advances', status, COUNT(*)::INT,
      ROUND(SUM(amount::NUMERIC), 2)::DOUBLE PRECISION
    FROM employee_cash_advances
    WHERE created_at >= ${cutoffDate}::DATE
    GROUP BY status
    UNION ALL
    SELECT 'sales_documents', CONCAT(type, ':', status), COUNT(*)::INT,
      ROUND(SUM(COALESCE(total_amount, 0)::NUMERIC), 2)::DOUBLE PRECISION
    FROM sales_documents
    WHERE created_at >= ${cutoffDate}::DATE
    GROUP BY type, status
    ORDER BY source, status
  `;

  const purchaseInventoryReconciliation = await query`
    WITH document_totals AS (
      SELECT
        pd.id,
        pd.document_number,
        pd.status,
        ROUND(COALESCE(pd.total_amount, 0)::NUMERIC, 2)::DOUBLE PRECISION AS document_total,
        ROUND(COALESCE(SUM(pdi.total_amount), 0)::NUMERIC, 2)::DOUBLE PRECISION AS item_total
      FROM purchase_documents pd
      LEFT JOIN purchase_document_items pdi ON pdi.document_id = pd.id
      WHERE pd.type = 'PURCHASE_INVOICE'
        AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) >= ${cutoffDate}::DATE
      GROUP BY pd.id, pd.document_number, pd.status, pd.total_amount
    ), lot_totals AS (
      SELECT
        source_id AS document_id,
        ROUND(SUM((quantity_received * cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS lot_total
      FROM inventory_lots
      WHERE source_type = 'PURCHASE_INVOICE'
      GROUP BY source_id
    )
    SELECT
      d.status,
      COUNT(*)::INT AS document_count,
      ROUND(SUM(d.document_total)::NUMERIC, 2)::DOUBLE PRECISION AS document_total,
      ROUND(SUM(d.item_total)::NUMERIC, 2)::DOUBLE PRECISION AS item_total,
      ROUND(SUM(COALESCE(l.lot_total, 0))::NUMERIC, 2)::DOUBLE PRECISION AS lot_total,
      COUNT(*) FILTER (WHERE ABS(d.document_total - COALESCE(l.lot_total, 0)) > 0.01)::INT AS lot_mismatch_count
    FROM document_totals d
    LEFT JOIN lot_totals l ON l.document_id = d.id
    GROUP BY d.status
    ORDER BY d.status
  `;

  const purchaseInventoryMismatchSamples = await query`
    WITH lot_totals AS (
      SELECT
        source_id AS document_id,
        ROUND(SUM((quantity_received * cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS lot_total
      FROM inventory_lots
      WHERE source_type = 'PURCHASE_INVOICE'
      GROUP BY source_id
    )
    SELECT
      pd.document_number,
      pd.status,
      pd.total_amount,
      COALESCE(l.lot_total, 0)::DOUBLE PRECISION AS lot_total,
      ROUND((COALESCE(l.lot_total, 0) - COALESCE(pd.total_amount, 0))::NUMERIC, 2)::DOUBLE PRECISION AS difference
    FROM purchase_documents pd
    LEFT JOIN lot_totals l ON l.document_id = pd.id
    WHERE pd.type = 'PURCHASE_INVOICE'
      AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) >= ${cutoffDate}::DATE
      AND ABS(COALESCE(l.lot_total, 0) - COALESCE(pd.total_amount, 0)) > 0.01
    ORDER BY ABS(COALESCE(l.lot_total, 0) - COALESCE(pd.total_amount, 0)) DESC
    LIMIT 20
  `;

  const purchasePaymentSamples = await query`
    SELECT
      id,
      type,
      amount,
      description,
      reference_id,
      cash_account_id,
      created_at,
      deleted_at::TEXT AS deleted_at
    FROM finance_transactions
    WHERE category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
      AND created_at >= ${cutoffDate}::DATE
    ORDER BY created_at, id
  `;

  const duplicatePurchaseLots = await query`
    SELECT
      pd.document_number,
      lot.source_id,
      lot.source_line_id,
      lot.product_id,
      COUNT(*)::INT AS lot_count,
      ROUND(SUM((lot.quantity_received * lot.cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS received_value,
      ROUND(SUM((lot.quantity_remaining * lot.cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS remaining_value,
      string_agg(lot.id, ', ' ORDER BY lot.created_at, lot.id) AS lot_ids
    FROM inventory_lots lot
    JOIN purchase_documents pd ON pd.id = lot.source_id
    WHERE lot.source_type = 'PURCHASE_INVOICE'
    GROUP BY pd.document_number, lot.source_id, lot.source_line_id, lot.product_id
    HAVING COUNT(*) > 1
    ORDER BY pd.document_number, lot.source_line_id
  `;

  const duplicatePurchaseStockMutations = await query`
    SELECT
      pd.document_number,
      sm.source_id,
      sm.source_line_id,
      sm.product_id,
      COUNT(*)::INT AS mutation_count,
      ROUND(SUM(sm.quantity_delta::NUMERIC), 6)::DOUBLE PRECISION AS quantity_delta,
      string_agg(sm.id, ', ' ORDER BY sm.occurred_at, sm.id) AS mutation_ids
    FROM stock_mutations sm
    JOIN purchase_documents pd ON pd.id = sm.source_id
    WHERE sm.source_type = 'PURCHASE_INVOICE'
    GROUP BY pd.document_number, sm.source_id, sm.source_line_id, sm.product_id
    HAVING COUNT(*) > 1
    ORDER BY pd.document_number, sm.source_line_id
  `;

  const journalRepairCheckpoint = await query`
    SELECT
      COUNT(*)::INT AS entry_count,
      MAX(id) AS max_id,
      MAX(updated_at) AS max_updated_at
    FROM journal_entries
    WHERE id LIKE 'bf:%'
      AND updated_at = (
        SELECT MAX(updated_at) FROM journal_entries WHERE id LIKE 'bf:%'
      )
  `;


  const result = {
    configuration,
    cutoffDate,
    accountCount: accounts.length,
    mappingCount: mappings.length,
    existingPosJournalAccounts,
    candidates,
    paymentCoverage,
    paymentMismatchSamples,
    transactionAccountCoverage,
    baseAccountRows,
    openingBalanceDetails,
    inventorySnapshots,
    inventoryLotCoverage,
    inventoryAtCutoff,
    openingBalanceBatches,
    purchaseDocumentCoverage,
    stockOpnameCoverage,
    purchasePaymentFinanceCoverage,
    sourceTableColumns,
    financeCategoryCoverage,
    inventoryConsumptionCoverage,
    purchaseCostReconciliationCoverage,
    activeSourceStatusCoverage,
    purchaseInventoryReconciliation,
    purchaseInventoryMismatchSamples,
    purchasePaymentSamples,
    duplicatePurchaseLots,
    duplicatePurchaseStockMutations,
    journalRepairCheckpoint,
  };
  return result;
};

const applyRepair = async () => sql.begin(async (query) => {
  await query`SELECT pg_advisory_xact_lock(hashtext('frayukti:general-ledger-backfill:v1'))`;

  const [configuration] = await query`
    SELECT
      gl.is_ready,
      gl.cutoff_date,
      gl.inventory_policy,
      COALESCE(module.is_enabled, FALSE) AS module_enabled
    FROM general_ledger_setting gl
    LEFT JOIN enabled_modules module ON module.code = 'GENERAL_LEDGER'
    WHERE gl.id = 'default'
    LIMIT 1
    FOR UPDATE OF gl
  `;
  const cutoffDate = String(configuration?.cutoff_date ?? '').slice(0, 10);
  if (
    !configuration?.is_ready ||
    !configuration?.module_enabled ||
    configuration?.inventory_policy !== 'PERPETUAL_INVENTORY' ||
    !cutoffDate
  ) {
    throw new Error('General Ledger configuration changed; repair was cancelled.');
  }

  const [clock] = await query`SELECT clock_timestamp() AS repair_started_at`;
  const repairStartedAt = clock.repair_started_at;
  let insertedAccounts = 0;
  let insertedMappings = 0;

  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    const inserted = await query`
      INSERT INTO chart_of_accounts (
        id, code, name, type, normal_balance,
        parent_id, parent_code, parent_name,
        is_postable, is_system, is_active, description,
        created_at, updated_at, deleted_at
      ) VALUES (
        ${account.id}, ${account.code}, ${account.name}, ${account.type}, ${account.normal_balance},
        ${account.parent_id ?? null}, ${account.parent_code ?? null}, ${account.parent_name ?? null},
        ${account.is_postable}, ${account.is_system}, ${account.is_active}, ${account.description ?? null},
        ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    insertedAccounts += inserted.length;
  }

  for (const mapping of DEFAULT_FINANCE_ACCOUNT_MAPPINGS) {
    const inserted = await query`
      INSERT INTO finance_account_mappings (
        id, key, category, account_id, account_code, account_name,
        account_type, is_system, created_at, updated_at
      ) VALUES (
        ${mapping.key}, ${mapping.key}, ${mapping.category ?? null},
        ${mapping.account_id}, ${mapping.account_code}, ${mapping.account_name},
        ${mapping.account_type}, ${mapping.is_system},
        ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    insertedMappings += inserted.length;
  }

  const [duplicateValidation] = await query`
    WITH duplicate_groups AS (
      SELECT
        ft.reference_id,
        COUNT(*)::INT AS row_count,
        BOOL_AND(ABS(ft.amount - t.total_amount) <= 0.01) AS amounts_match,
        COUNT(DISTINCT ft.cash_account_id)::INT AS account_count,
        BOOL_AND(ft.cash_account_id = t.payment_posting_account_id) AS accounts_match
      FROM finance_transactions ft
      JOIN pos_transactions t ON t.id = ft.reference_id
      WHERE ft.deleted_at IS NULL
        AND ft.type = 'INCOME'
        AND ft.category = 'PENJUALAN'
        AND COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY ft.reference_id
      HAVING COUNT(*) > 1
    )
    SELECT
      COUNT(*)::INT AS duplicate_group_count,
      COALESCE(SUM(row_count - 1), 0)::INT AS duplicate_row_count,
      COUNT(*) FILTER (
        WHERE NOT amounts_match OR account_count <> 1 OR NOT accounts_match
      )::INT AS invalid_group_count
    FROM duplicate_groups
  `;
  if (Number(duplicateValidation.invalid_group_count) > 0) {
    throw new Error('Found non-identical POS finance rows; automatic duplicate cleanup was cancelled.');
  }

  const deletedFinanceDuplicates = await query`
    WITH ranked AS (
      SELECT
        ft.id,
        ROW_NUMBER() OVER (
          PARTITION BY ft.reference_id
          ORDER BY ft.created_at DESC, ft.updated_at DESC, ft.id DESC
        ) AS row_number
      FROM finance_transactions ft
      JOIN pos_transactions t ON t.id = ft.reference_id
      WHERE ft.deleted_at IS NULL
        AND ft.type = 'INCOME'
        AND ft.category = 'PENJUALAN'
        AND COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
    )
    UPDATE finance_transactions ft
    SET
      version = GREATEST(ft.version, 1) + 1,
      updated_by = 'system-ledger-repair',
      updated_by_name = 'System GL Repair',
      updated_at = ${repairStartedAt}::TIMESTAMPTZ,
      deleted_at = ${repairStartedAt}::TIMESTAMPTZ
    FROM ranked
    WHERE ft.id = ranked.id
      AND ranked.row_number > 1
    RETURNING ft.id
  `;
  if (deletedFinanceDuplicates.length !== Number(duplicateValidation.duplicate_row_count)) {
    throw new Error('POS finance duplicate count changed during repair; transaction was cancelled.');
  }

  const insertedPosSales = await query`
    WITH item_totals AS (
      SELECT
        transaction_id,
        ROUND(SUM(ROUND((subtotal - profit)::NUMERIC, 2)), 2)::DOUBLE PRECISION AS cogs
      FROM pos_transaction_items
      GROUP BY transaction_id
    ), candidates AS (
      SELECT t.*, COALESCE(i.cogs, 0) AS cogs
      FROM pos_transactions t
      JOIN item_totals i ON i.transaction_id = t.id
      JOIN chart_of_accounts payment_account
        ON payment_account.id = t.payment_posting_account_id
        AND payment_account.deleted_at IS NULL
        AND payment_account.is_active = TRUE
        AND payment_account.is_postable = TRUE
        AND payment_account.type = 'ASSET'
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND t.total_amount > 0
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
        AND NOT EXISTS (
          SELECT 1
          FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status IN ('POSTED', 'REVERSED')
            AND je.source_type = 'POS_TRANSACTION'
            AND je.source_id = t.id
            AND je.source_event = ${SOURCE_EVENTS.sale}
        )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:pos-sale:' || id,
      'BF-POS-' || UPPER(LEFT(MD5(id), 12)),
      created_at,
      'POSTED',
      'POS_TRANSACTION', id, transaction_number, ${SOURCE_EVENTS.sale},
      'Penjualan POS ' || transaction_number,
      ROUND((total_amount + cogs)::NUMERIC, 2)::DOUBLE PRECISION,
      ROUND((total_amount + cogs)::NUMERIC, 2)::DOUBLE PRECISION,
      ${repairStartedAt}::TIMESTAMPTZ,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPosSaleLines = await query`
    WITH item_totals AS (
      SELECT
        transaction_id,
        ROUND(SUM(ROUND((subtotal - profit)::NUMERIC, 2)), 2)::DOUBLE PRECISION AS cogs
      FROM pos_transaction_items
      GROUP BY transaction_id
    ), sources AS (
      SELECT t.*, COALESCE(i.cogs, 0) AS cogs, je.id AS journal_id
      FROM pos_transactions t
      JOIN item_totals i ON i.transaction_id = t.id
      JOIN journal_entries je ON je.id = 'bf:pos-sale:' || t.id
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND t.total_amount > 0
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
    ), lines AS (
      SELECT
        journal_id || ':payment' AS id, journal_id,
        payment.id AS account_id, payment.code AS account_code,
        payment.name AS account_name, payment.type AS account_type,
        total_amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Penerimaan kas/bank dari POS' AS description
      FROM sources
      JOIN chart_of_accounts payment ON payment.id = sources.payment_posting_account_id
      UNION ALL
      SELECT
        journal_id || ':revenue', journal_id,
        revenue.id, revenue.code, revenue.name, revenue.type,
        0, total_amount, 'Pendapatan penjualan POS'
      FROM sources
      CROSS JOIN chart_of_accounts revenue
      WHERE revenue.id = 'sales-pos'
      UNION ALL
      SELECT
        journal_id || ':cogs', journal_id,
        cogs_account.id, cogs_account.code, cogs_account.name, cogs_account.type,
        cogs, 0, 'HPP penjualan POS'
      FROM sources
      CROSS JOIN chart_of_accounts cogs_account
      WHERE cogs_account.id = 'cogs' AND cogs > 0
      UNION ALL
      SELECT
        journal_id || ':inventory', journal_id,
        inventory.id, inventory.code, inventory.name, inventory.type,
        0, cogs, 'Persediaan keluar karena penjualan POS'
      FROM sources
      CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory' AND cogs > 0
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, created_at
    )
    SELECT
      id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPosExpenses = await query`
    WITH item_totals AS (
      SELECT
        transaction_id,
        ROUND(SUM(subtotal::NUMERIC), 2)::DOUBLE PRECISION AS expense_amount
      FROM pos_transaction_items
      GROUP BY transaction_id
    ), candidates AS (
      SELECT t.*, i.expense_amount
      FROM pos_transactions t
      JOIN item_totals i ON i.transaction_id = t.id
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND t.business_type = 'EXPENSE'
        AND i.expense_amount > 0
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status IN ('POSTED', 'REVERSED')
            AND je.source_type = 'POS_TRANSACTION'
            AND je.source_id = t.id
            AND je.source_event = ${SOURCE_EVENTS.expense}
        )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:pos-expense:' || id,
      'BF-EXP-' || UPPER(LEFT(MD5(id), 12)),
      created_at, 'POSTED',
      'POS_TRANSACTION', id, transaction_number, ${SOURCE_EVENTS.expense},
      'Pemakaian internal POS ' || transaction_number,
      expense_amount, expense_amount, ${repairStartedAt}::TIMESTAMPTZ,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPosExpenseLines = await query`
    WITH item_totals AS (
      SELECT transaction_id, ROUND(SUM(subtotal::NUMERIC), 2)::DOUBLE PRECISION AS expense_amount
      FROM pos_transaction_items
      GROUP BY transaction_id
    ), sources AS (
      SELECT t.id, i.expense_amount, je.id AS journal_id
      FROM pos_transactions t
      JOIN item_totals i ON i.transaction_id = t.id
      JOIN journal_entries je ON je.id = 'bf:pos-expense:' || t.id
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND t.business_type = 'EXPENSE'
        AND i.expense_amount > 0
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
    ), lines AS (
      SELECT
        journal_id || ':expense' AS id, journal_id,
        expense.id AS account_id, expense.code AS account_code,
        expense.name AS account_name, expense.type AS account_type,
        expense_amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Beban pemakaian internal dari persediaan' AS description
      FROM sources
      CROSS JOIN chart_of_accounts expense
      WHERE expense.id = 'other-expense'
      UNION ALL
      SELECT
        journal_id || ':inventory', journal_id,
        inventory.id, inventory.code, inventory.name, inventory.type,
        0, expense_amount, 'Persediaan keluar untuk pemakaian internal'
      FROM sources
      CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory'
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPhysicalStockFound = await query`
    WITH source_values AS (
      SELECT
        discrepancy.transaction_id,
        MAX(discrepancy.transaction_number) AS transaction_number,
        MAX(t.created_at) AS entry_date,
        ROUND(SUM((lot.quantity_received * lot.cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS amount
      FROM pos_stock_discrepancies discrepancy
      JOIN pos_transactions t ON t.id = discrepancy.transaction_id
      JOIN inventory_lots lot
        ON lot.source_type = 'POS_PHYSICAL_STOCK_FOUND'
        AND lot.source_id = discrepancy.id
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY discrepancy.transaction_id
      HAVING SUM(lot.quantity_received * lot.cost_per_unit) > 0
    ), candidates AS (
      SELECT source_values.*
      FROM source_values
      WHERE NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.deleted_at IS NULL
          AND je.status IN ('POSTED', 'REVERSED')
          AND je.source_type = 'POS_TRANSACTION'
          AND je.source_id = source_values.transaction_id
          AND je.source_event = ${SOURCE_EVENTS.physicalStockFound}
      )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:pos-physical-stock:' || transaction_id,
      'BF-PHY-' || UPPER(LEFT(MD5(transaction_id), 12)),
      entry_date, 'POSTED',
      'POS_TRANSACTION', transaction_id, transaction_number, ${SOURCE_EVENTS.physicalStockFound},
      'Stok fisik ditemukan saat transaksi ' || transaction_number,
      amount, amount, ${repairStartedAt}::TIMESTAMPTZ,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPhysicalStockFoundLines = await query`
    WITH sources AS (
      SELECT
        discrepancy.transaction_id,
        je.id AS journal_id,
        ROUND(SUM((lot.quantity_received * lot.cost_per_unit)::NUMERIC), 2)::DOUBLE PRECISION AS amount
      FROM pos_stock_discrepancies discrepancy
      JOIN pos_transactions t ON t.id = discrepancy.transaction_id
      JOIN inventory_lots lot
        ON lot.source_type = 'POS_PHYSICAL_STOCK_FOUND'
        AND lot.source_id = discrepancy.id
      JOIN journal_entries je ON je.id = 'bf:pos-physical-stock:' || discrepancy.transaction_id
      WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY discrepancy.transaction_id, je.id
      HAVING SUM(lot.quantity_received * lot.cost_per_unit) > 0
    ), lines AS (
      SELECT
        journal_id || ':inventory' AS id, journal_id,
        inventory.id AS account_id, inventory.code AS account_code,
        inventory.name AS account_name, inventory.type AS account_type,
        amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Persediaan fisik yang belum tercatat ditemukan di POS' AS description
      FROM sources
      CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory'
      UNION ALL
      SELECT
        journal_id || ':income', journal_id,
        income.id, income.code, income.name, income.type,
        0, amount, 'Pendapatan selisih persediaan yang ditemukan di POS'
      FROM sources
      CROSS JOIN chart_of_accounts income
      WHERE income.id = 'other-income'
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedStockOpnames = await query`
    WITH source_values AS (
      SELECT
        so.id,
        so.opname_number,
        so.posted_at,
        ROUND(SUM(CASE WHEN item.quantity_delta > 0 THEN ABS(item.variance_value) ELSE 0 END)::NUMERIC, 2)::DOUBLE PRECISION AS adjustment_in,
        ROUND(SUM(CASE WHEN item.quantity_delta < 0 THEN ABS(item.variance_value) ELSE 0 END)::NUMERIC, 2)::DOUBLE PRECISION AS adjustment_out
      FROM stock_opnames so
      JOIN stock_opname_items item ON item.opname_id = so.id
      WHERE so.status = 'POSTED'
        AND so.posted_at IS NOT NULL
        AND (so.posted_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND so.posted_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY so.id, so.opname_number, so.posted_at
      HAVING SUM(ABS(item.variance_value)) > 0
    ), candidates AS (
      SELECT source_values.*
      FROM source_values
      WHERE NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.deleted_at IS NULL
          AND je.status IN ('POSTED', 'REVERSED')
          AND je.source_type = 'STOCK_OPNAME'
          AND je.source_id = source_values.id
          AND je.source_event = ${SOURCE_EVENTS.stockOpname}
      )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:stock-opname:' || id,
      'BF-SO-' || UPPER(LEFT(MD5(id), 12)),
      posted_at, 'POSTED',
      'STOCK_OPNAME', id, opname_number, ${SOURCE_EVENTS.stockOpname},
      'Penyesuaian persediaan dari stock opname ' || opname_number,
      ROUND((adjustment_in + adjustment_out)::NUMERIC, 2)::DOUBLE PRECISION,
      ROUND((adjustment_in + adjustment_out)::NUMERIC, 2)::DOUBLE PRECISION,
      ${repairStartedAt}::TIMESTAMPTZ,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedStockOpnameLines = await query`
    WITH sources AS (
      SELECT
        so.id,
        je.id AS journal_id,
        ROUND(SUM(CASE WHEN item.quantity_delta > 0 THEN ABS(item.variance_value) ELSE 0 END)::NUMERIC, 2)::DOUBLE PRECISION AS adjustment_in,
        ROUND(SUM(CASE WHEN item.quantity_delta < 0 THEN ABS(item.variance_value) ELSE 0 END)::NUMERIC, 2)::DOUBLE PRECISION AS adjustment_out
      FROM stock_opnames so
      JOIN stock_opname_items item ON item.opname_id = so.id
      JOIN journal_entries je ON je.id = 'bf:stock-opname:' || so.id
      WHERE so.status = 'POSTED'
        AND so.posted_at IS NOT NULL
        AND (so.posted_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND so.posted_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY so.id, je.id
    ), lines AS (
      SELECT journal_id || ':inventory-in' AS id, journal_id,
        inventory.id AS account_id, inventory.code AS account_code,
        inventory.name AS account_name, inventory.type AS account_type,
        adjustment_in AS debit, 0::DOUBLE PRECISION AS credit,
        'Persediaan bertambah dari stock opname' AS description
      FROM sources CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory' AND adjustment_in > 0
      UNION ALL
      SELECT journal_id || ':income', journal_id,
        income.id, income.code, income.name, income.type,
        0, adjustment_in, 'Pendapatan selisih lebih stock opname'
      FROM sources CROSS JOIN chart_of_accounts income
      WHERE income.id = 'other-income' AND adjustment_in > 0
      UNION ALL
      SELECT journal_id || ':expense', journal_id,
        expense.id, expense.code, expense.name, expense.type,
        adjustment_out, 0, 'Beban selisih kurang stock opname'
      FROM sources CROSS JOIN chart_of_accounts expense
      WHERE expense.id = 'other-expense' AND adjustment_out > 0
      UNION ALL
      SELECT journal_id || ':inventory-out', journal_id,
        inventory.id, inventory.code, inventory.name, inventory.type,
        0, adjustment_out, 'Persediaan berkurang dari stock opname'
      FROM sources CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory' AND adjustment_out > 0
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const [purchaseValidation] = await query`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(tax_amount, 0) > 0)::INT AS taxed_document_count,
      COUNT(*) FILTER (WHERE COALESCE(total_amount, 0) <= 0)::INT AS invalid_total_count
    FROM purchase_documents
    WHERE type IN ('PURCHASE_INVOICE', 'PURCHASE_RETURN')
      AND status = 'ISSUED'
      AND COALESCE(issued_at, document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
      AND (COALESCE(issued_at, document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
  `;
  if (Number(purchaseValidation.taxed_document_count) > 0 || Number(purchaseValidation.invalid_total_count) > 0) {
    throw new Error('Purchase source contains tax or invalid totals outside this verified repair path.');
  }

  const insertedPurchaseInvoices = await query`
    WITH candidates AS (
      SELECT pd.*, COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AS entry_date
      FROM purchase_documents pd
      WHERE pd.type = 'PURCHASE_INVOICE'
        AND pd.status = 'ISSUED'
        AND pd.total_amount > 0
        AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
        AND (COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status IN ('POSTED', 'REVERSED')
            AND je.source_type = 'PURCHASE_INVOICE'
            AND je.source_id = pd.id
            AND je.source_event = 'PURCHASE_INVOICE_ISSUED'
        )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:purchase-invoice:' || id,
      'BF-PI-' || UPPER(LEFT(MD5(id), 12)),
      entry_date, 'POSTED',
      'PURCHASE_INVOICE', id, document_number, 'PURCHASE_INVOICE_ISSUED',
      'Purchase invoice ' || document_number || ' diterbitkan',
      total_amount, total_amount, ${repairStartedAt}::TIMESTAMPTZ,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPurchaseInvoiceLines = await query`
    WITH sources AS (
      SELECT pd.id, pd.total_amount, pd.department_id, pd.project_id, je.id AS journal_id
      FROM purchase_documents pd
      JOIN journal_entries je ON je.id = 'bf:purchase-invoice:' || pd.id
      WHERE pd.type = 'PURCHASE_INVOICE'
        AND pd.status = 'ISSUED'
        AND pd.total_amount > 0
        AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
        AND (COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
    ), lines AS (
      SELECT journal_id || ':inventory' AS id, journal_id,
        inventory.id AS account_id, inventory.code AS account_code,
        inventory.name AS account_name, inventory.type AS account_type,
        total_amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Persediaan dari purchase invoice' AS description,
        department_id, project_id
      FROM sources CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory'
      UNION ALL
      SELECT journal_id || ':payable', journal_id,
        payable.id, payable.code, payable.name, payable.type,
        0, total_amount, 'Hutang purchase invoice', department_id, project_id
      FROM sources CROSS JOIN chart_of_accounts payable
      WHERE payable.id = 'accounts-payable'
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, department_id, project_id, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, department_id, project_id,
      ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPurchaseReturns = await query`
    WITH candidates AS (
      SELECT pd.*, COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AS entry_date
      FROM purchase_documents pd
      WHERE pd.type = 'PURCHASE_RETURN'
        AND pd.status = 'ISSUED'
        AND pd.total_amount > 0
        AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
        AND (COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status IN ('POSTED', 'REVERSED')
            AND je.source_type = 'PURCHASE_INVOICE'
            AND je.source_id = pd.id
            AND je.source_event = 'PURCHASE_RETURN_ISSUED'
        )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:purchase-return:' || id,
      'BF-PR-' || UPPER(LEFT(MD5(id), 12)),
      entry_date, 'POSTED',
      'PURCHASE_INVOICE', id, document_number, 'PURCHASE_RETURN_ISSUED',
      'Purchase return ' || document_number || ' diterbitkan',
      total_amount, total_amount, ${repairStartedAt}::TIMESTAMPTZ,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPurchaseReturnLines = await query`
    WITH sources AS (
      SELECT pd.id, pd.total_amount, pd.department_id, pd.project_id, je.id AS journal_id
      FROM purchase_documents pd
      JOIN journal_entries je ON je.id = 'bf:purchase-return:' || pd.id
      WHERE pd.type = 'PURCHASE_RETURN'
        AND pd.status = 'ISSUED'
        AND pd.total_amount > 0
        AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
        AND (COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
    ), lines AS (
      SELECT journal_id || ':payable' AS id, journal_id,
        payable.id AS account_id, payable.code AS account_code,
        payable.name AS account_name, payable.type AS account_type,
        total_amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Purchase return mengurangi hutang' AS description,
        department_id, project_id
      FROM sources CROSS JOIN chart_of_accounts payable
      WHERE payable.id = 'accounts-payable'
      UNION ALL
      SELECT journal_id || ':inventory', journal_id,
        inventory.id, inventory.code, inventory.name, inventory.type,
        0, total_amount, 'Persediaan keluar karena purchase return', department_id, project_id
      FROM sources CROSS JOIN chart_of_accounts inventory
      WHERE inventory.id = 'inventory'
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, department_id, project_id, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, department_id, project_id,
      ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const [paymentValidation] = await query`
    WITH payment_groups AS (
      SELECT reference_id, type, COUNT(*)::INT AS row_count
      FROM finance_transactions
      WHERE deleted_at IS NULL
        AND category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
        AND created_at >= ${cutoffDate}::DATE
        AND created_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY reference_id, type
    )
    SELECT COUNT(*) FILTER (WHERE row_count > 1)::INT AS duplicate_group_count
    FROM payment_groups
  `;
  if (Number(paymentValidation.duplicate_group_count) > 0) {
    throw new Error('Duplicate purchase payment source rows found; repair was cancelled.');
  }

  const insertedPurchasePayments = await query`
    WITH candidates AS (
      SELECT
        ft.*,
        REGEXP_REPLACE(ft.description, '^Pembayaran purchase invoice ', '') AS document_number,
        EXISTS (
          SELECT 1 FROM finance_transactions reversal
          WHERE reversal.deleted_at IS NULL
            AND reversal.category = ft.category
            AND reversal.type = 'INCOME'
            AND reversal.reference_id = ft.reference_id
        ) AS was_reversed
      FROM finance_transactions ft
      JOIN chart_of_accounts cash_account
        ON cash_account.id = ft.cash_account_id
        AND cash_account.deleted_at IS NULL
        AND cash_account.is_active = TRUE
        AND cash_account.is_postable = TRUE
        AND cash_account.type = 'ASSET'
      WHERE ft.deleted_at IS NULL
        AND ft.category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
        AND ft.type = 'EXPENSE'
        AND ft.amount > 0
        AND ft.created_at >= ${cutoffDate}::DATE
        AND ft.created_at < ${repairStartedAt}::TIMESTAMPTZ
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status IN ('POSTED', 'REVERSED')
            AND je.source_type = 'PURCHASE_INVOICE_PAYMENT'
            AND je.source_id = ft.reference_id
            AND je.source_event = 'PURCHASE_INVOICE_PAYMENT_POSTED'
        )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at, reversed_entry_id,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:purchase-payment:' || reference_id,
      'BF-PP-' || UPPER(LEFT(MD5(reference_id), 12)),
      created_at,
      CASE WHEN was_reversed THEN 'REVERSED' ELSE 'POSTED' END,
      'PURCHASE_INVOICE_PAYMENT', reference_id, document_number, 'PURCHASE_INVOICE_PAYMENT_POSTED',
      description, amount, amount, ${repairStartedAt}::TIMESTAMPTZ,
      CASE WHEN was_reversed THEN 'bf:purchase-payment-reversal:' || reference_id ELSE NULL END,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPurchasePaymentLines = await query`
    WITH sources AS (
      SELECT ft.*, je.id AS journal_id
      FROM finance_transactions ft
      JOIN journal_entries je ON je.id = 'bf:purchase-payment:' || ft.reference_id
      WHERE ft.deleted_at IS NULL
        AND ft.category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
        AND ft.type = 'EXPENSE'
        AND ft.amount > 0
        AND ft.created_at >= ${cutoffDate}::DATE
        AND ft.created_at < ${repairStartedAt}::TIMESTAMPTZ
    ), lines AS (
      SELECT journal_id || ':payable' AS id, journal_id,
        payable.id AS account_id, payable.code AS account_code,
        payable.name AS account_name, payable.type AS account_type,
        amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Pelunasan hutang purchase invoice' AS description
      FROM sources CROSS JOIN chart_of_accounts payable
      WHERE payable.id = 'accounts-payable'
      UNION ALL
      SELECT journal_id || ':cash', journal_id,
        cash.id, cash.code, cash.name, cash.type,
        0, amount, 'Kas keluar untuk pembayaran purchase invoice'
      FROM sources JOIN chart_of_accounts cash ON cash.id = sources.cash_account_id
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPurchasePaymentReversals = await query`
    WITH candidates AS (
      SELECT
        reversal.*,
        original.amount AS original_amount,
        original.cash_account_id AS original_cash_account_id,
        REGEXP_REPLACE(original.description, '^Pembayaran purchase invoice ', '') AS document_number,
        'bf:purchase-payment:' || original.reference_id AS original_journal_id
      FROM finance_transactions reversal
      JOIN finance_transactions original
        ON original.deleted_at IS NULL
        AND original.category = reversal.category
        AND original.type = 'EXPENSE'
        AND original.reference_id = reversal.reference_id
      JOIN journal_entries original_journal
        ON original_journal.id = 'bf:purchase-payment:' || original.reference_id
      WHERE reversal.deleted_at IS NULL
        AND reversal.category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
        AND reversal.type = 'INCOME'
        AND reversal.created_at >= ${cutoffDate}::DATE
        AND reversal.created_at < ${repairStartedAt}::TIMESTAMPTZ
        AND ABS(reversal.amount - original.amount) <= 0.01
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.deleted_at IS NULL
            AND je.status = 'POSTED'
            AND je.source_type = 'PURCHASE_INVOICE_PAYMENT'
            AND je.source_id = reversal.reference_id
            AND je.source_event = 'PURCHASE_INVOICE_PAYMENT_POSTED:REVERSAL'
        )
    )
    INSERT INTO journal_entries (
      id, entry_number, entry_date, status,
      source_type, source_id, source_number, source_event,
      description, total_debit, total_credit, posted_at, reversed_entry_id,
      version, created_by, created_by_name, updated_by, updated_by_name,
      created_at, updated_at, deleted_at
    )
    SELECT
      'bf:purchase-payment-reversal:' || reference_id,
      'BF-PPR-' || UPPER(LEFT(MD5(reference_id), 12)),
      created_at, 'POSTED',
      'PURCHASE_INVOICE_PAYMENT', reference_id, document_number,
      'PURCHASE_INVOICE_PAYMENT_POSTED:REVERSAL',
      description, amount, amount, ${repairStartedAt}::TIMESTAMPTZ, original_journal_id,
      1, 'system-ledger-repair', 'System GL Repair', 'system-ledger-repair', 'System GL Repair',
      ${repairStartedAt}::TIMESTAMPTZ, ${repairStartedAt}::TIMESTAMPTZ, NULL
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const insertedPurchasePaymentReversalLines = await query`
    WITH sources AS (
      SELECT reversal.*, je.id AS journal_id
      FROM finance_transactions reversal
      JOIN journal_entries je ON je.id = 'bf:purchase-payment-reversal:' || reversal.reference_id
      WHERE reversal.deleted_at IS NULL
        AND reversal.category = 'PEMBAYARAN_INVOICE_PEMBELIAN'
        AND reversal.type = 'INCOME'
        AND reversal.created_at >= ${cutoffDate}::DATE
        AND reversal.created_at < ${repairStartedAt}::TIMESTAMPTZ
    ), lines AS (
      SELECT journal_id || ':cash' AS id, journal_id,
        cash.id AS account_id, cash.code AS account_code,
        cash.name AS account_name, cash.type AS account_type,
        amount AS debit, 0::DOUBLE PRECISION AS credit,
        'Pembalikan kas keluar pembayaran purchase invoice' AS description
      FROM sources JOIN chart_of_accounts cash ON cash.id = sources.cash_account_id
      UNION ALL
      SELECT journal_id || ':payable', journal_id,
        payable.id, payable.code, payable.name, payable.type,
        0, amount, 'Pemulihan hutang purchase invoice dari void pembayaran'
      FROM sources CROSS JOIN chart_of_accounts payable
      WHERE payable.id = 'accounts-payable'
    )
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      account_type, debit, credit, description, created_at
    )
    SELECT id, journal_id, account_id, account_code, account_name,
      account_type, debit, credit, description, ${repairStartedAt}::TIMESTAMPTZ
    FROM lines
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const invalidRepairJournals = await query`
    SELECT
      je.id,
      je.entry_number,
      je.total_debit,
      je.total_credit,
      COUNT(line.id)::INT AS line_count,
      ROUND(COALESCE(SUM(line.debit), 0)::NUMERIC, 2)::DOUBLE PRECISION AS line_debit,
      ROUND(COALESCE(SUM(line.credit), 0)::NUMERIC, 2)::DOUBLE PRECISION AS line_credit
    FROM journal_entries je
    LEFT JOIN journal_entry_lines line ON line.journal_entry_id = je.id
    WHERE je.id LIKE 'bf:%'
      AND je.deleted_at IS NULL
    GROUP BY je.id
    HAVING COUNT(line.id) < 2
      OR ABS(je.total_debit - je.total_credit) > 0.01
      OR ABS(je.total_debit - COALESCE(SUM(line.debit), 0)) > 0.01
      OR ABS(je.total_credit - COALESCE(SUM(line.credit), 0)) > 0.01
  `;
  if (invalidRepairJournals.length > 0) {
    throw new Error(`Repair generated ${invalidRepairJournals.length} invalid journal(s); transaction was cancelled.`);
  }

  const [remainingDuplicates] = await query`
    SELECT COUNT(*)::INT AS duplicate_group_count
    FROM (
      SELECT ft.reference_id
      FROM finance_transactions ft
      JOIN pos_transactions t ON t.id = ft.reference_id
      WHERE ft.deleted_at IS NULL
        AND ft.type = 'INCOME'
        AND ft.category = 'PENJUALAN'
        AND COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
        AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
        AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
        AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
      GROUP BY ft.reference_id
      HAVING COUNT(*) > 1
    ) duplicate_groups
  `;
  if (Number(remainingDuplicates.duplicate_group_count) > 0) {
    throw new Error('POS finance duplicates remain after cleanup; transaction was cancelled.');
  }

  const [remainingSources] = await query`
    SELECT
      (
        SELECT COUNT(*) FROM pos_transactions t
        WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
          AND COALESCE(t.business_type, 'SALE') <> 'EXPENSE'
          AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
          AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.deleted_at IS NULL AND je.status IN ('POSTED', 'REVERSED')
              AND je.source_type = 'POS_TRANSACTION' AND je.source_id = t.id
              AND je.source_event = ${SOURCE_EVENTS.sale}
          )
      )::INT AS missing_pos_sales,
      (
        SELECT COUNT(*) FROM pos_transactions t
        WHERE COALESCE(t.status, 'COMPLETED') <> 'VOIDED'
          AND t.business_type = 'EXPENSE'
          AND (t.created_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
          AND t.created_at < ${repairStartedAt}::TIMESTAMPTZ
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.deleted_at IS NULL AND je.status IN ('POSTED', 'REVERSED')
              AND je.source_type = 'POS_TRANSACTION' AND je.source_id = t.id
              AND je.source_event = ${SOURCE_EVENTS.expense}
          )
      )::INT AS missing_pos_expenses,
      (
        SELECT COUNT(*) FROM purchase_documents pd
        WHERE pd.type = 'PURCHASE_INVOICE' AND pd.status = 'ISSUED'
          AND (COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
          AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.deleted_at IS NULL AND je.status IN ('POSTED', 'REVERSED')
              AND je.source_type = 'PURCHASE_INVOICE' AND je.source_id = pd.id
              AND je.source_event = 'PURCHASE_INVOICE_ISSUED'
          )
      )::INT AS missing_purchase_invoices,
      (
        SELECT COUNT(*) FROM purchase_documents pd
        WHERE pd.type = 'PURCHASE_RETURN' AND pd.status = 'ISSUED'
          AND (COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
          AND COALESCE(pd.issued_at, pd.document_date::TIMESTAMPTZ) < ${repairStartedAt}::TIMESTAMPTZ
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.deleted_at IS NULL AND je.status IN ('POSTED', 'REVERSED')
              AND je.source_type = 'PURCHASE_INVOICE' AND je.source_id = pd.id
              AND je.source_event = 'PURCHASE_RETURN_ISSUED'
          )
      )::INT AS missing_purchase_returns,
      (
        SELECT COUNT(*) FROM stock_opnames so
        WHERE so.status = 'POSTED' AND so.posted_at IS NOT NULL
          AND (so.posted_at AT TIME ZONE ${TIME_ZONE})::DATE >= ${cutoffDate}::DATE
          AND so.posted_at < ${repairStartedAt}::TIMESTAMPTZ
          AND EXISTS (SELECT 1 FROM stock_opname_items item WHERE item.opname_id = so.id AND item.variance_value <> 0)
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.deleted_at IS NULL AND je.status IN ('POSTED', 'REVERSED')
              AND je.source_type = 'STOCK_OPNAME' AND je.source_id = so.id
              AND je.source_event = ${SOURCE_EVENTS.stockOpname}
          )
      )::INT AS missing_stock_opnames
  `;
  if (Object.values(remainingSources).some((value) => Number(value) > 0)) {
    throw new Error(`Accounting sources remain unjournaled: ${JSON.stringify(remainingSources)}`);
  }

  const getIncomeStatement = async (startDate, endDate) => {
    const [report] = await query`
      WITH report_lines AS (
        SELECT line.*
        FROM journal_entries je
        JOIN journal_entry_lines line ON line.journal_entry_id = je.id
        WHERE je.deleted_at IS NULL
          AND je.status IN ('POSTED', 'REVERSED')
          AND (je.entry_date AT TIME ZONE ${TIME_ZONE})::DATE BETWEEN ${startDate}::DATE AND ${endDate}::DATE
          AND COALESCE(je.source_event, '') NOT LIKE 'YEAR_END_CLOSING%'
      )
      SELECT
        ROUND(COALESCE(SUM(credit - debit) FILTER (WHERE account_type = 'REVENUE'), 0)::NUMERIC, 2)::DOUBLE PRECISION AS revenue,
        ROUND(COALESCE(SUM(debit - credit) FILTER (WHERE account_type = 'CONTRA_REVENUE'), 0)::NUMERIC, 2)::DOUBLE PRECISION AS contra_revenue,
        ROUND(COALESCE(SUM(debit - credit) FILTER (
          WHERE account_type = 'EXPENSE' AND (account_id = 'cogs' OR account_code LIKE '5%')
        ), 0)::NUMERIC, 2)::DOUBLE PRECISION AS cogs,
        ROUND(COALESCE(SUM(debit - credit) FILTER (
          WHERE account_type = 'EXPENSE' AND NOT (account_id = 'cogs' OR account_code LIKE '5%')
        ), 0)::NUMERIC, 2)::DOUBLE PRECISION AS other_expense,
        ROUND((
          COALESCE(SUM(credit - debit) FILTER (WHERE account_type = 'REVENUE'), 0)
          - COALESCE(SUM(debit - credit) FILTER (WHERE account_type = 'CONTRA_REVENUE'), 0)
          - COALESCE(SUM(debit - credit) FILTER (WHERE account_type = 'EXPENSE'), 0)
        )::NUMERIC, 2)::DOUBLE PRECISION AS net_income
      FROM report_lines
    `;
    return { startDate, endDate, ...report };
  };

  const [inventoryReconciliation] = await query`
    SELECT
      ROUND(COALESCE(SUM(line.debit - line.credit), 0)::NUMERIC, 2)::DOUBLE PRECISION AS general_ledger_inventory,
      (
        SELECT ROUND(COALESCE(SUM(quantity_remaining * cost_per_unit), 0)::NUMERIC, 2)::DOUBLE PRECISION
        FROM inventory_lots
      ) AS inventory_lot_value
    FROM journal_entries je
    JOIN journal_entry_lines line ON line.journal_entry_id = je.id
    WHERE je.deleted_at IS NULL
      AND je.status IN ('POSTED', 'REVERSED')
      AND line.account_id = 'inventory'
  `;

  const result = {
    repairStartedAt,
    cutoffDate,
    insertedAccounts,
    insertedMappings,
    financeDuplicateGroups: Number(duplicateValidation.duplicate_group_count),
    softDeletedFinanceDuplicates: deletedFinanceDuplicates.length,
    journals: {
      posSales: insertedPosSales.length,
      posExpenses: insertedPosExpenses.length,
      physicalStockFound: insertedPhysicalStockFound.length,
      stockOpnames: insertedStockOpnames.length,
      purchaseInvoices: insertedPurchaseInvoices.length,
      purchaseReturns: insertedPurchaseReturns.length,
      purchasePayments: insertedPurchasePayments.length,
      purchasePaymentReversals: insertedPurchasePaymentReversals.length,
      total: insertedPosSales.length + insertedPosExpenses.length + insertedPhysicalStockFound.length
        + insertedStockOpnames.length + insertedPurchaseInvoices.length + insertedPurchaseReturns.length
        + insertedPurchasePayments.length + insertedPurchasePaymentReversals.length,
    },
    lines: {
      posSales: insertedPosSaleLines.length,
      posExpenses: insertedPosExpenseLines.length,
      physicalStockFound: insertedPhysicalStockFoundLines.length,
      stockOpnames: insertedStockOpnameLines.length,
      purchaseInvoices: insertedPurchaseInvoiceLines.length,
      purchaseReturns: insertedPurchaseReturnLines.length,
      purchasePayments: insertedPurchasePaymentLines.length,
      purchasePaymentReversals: insertedPurchasePaymentReversalLines.length,
    },
    remainingSources,
    incomeStatements: {
      august2026: await getIncomeStatement('2026-08-01', '2026-08-31'),
      screenshotRange: await getIncomeStatement('2026-08-01', '2026-09-30'),
    },
    inventoryReconciliation: {
      ...inventoryReconciliation,
      difference: Math.round((
        Number(inventoryReconciliation.inventory_lot_value)
        - Number(inventoryReconciliation.general_ledger_inventory)
      ) * 100) / 100,
    },
  };
  if (ROLLBACK) {
    throw new Error(`${ROLLBACK_PREFIX}${JSON.stringify(result)}`);
  }
  return result;
});

try {
  if (APPLY) {
    try {
      const result = await applyRepair();
      console.log(JSON.stringify({ mode: 'apply', result }, null, 2));
    } catch (error) {
      if (ROLLBACK && error instanceof Error && error.message.startsWith(ROLLBACK_PREFIX)) {
        const result = JSON.parse(error.message.slice(ROLLBACK_PREFIX.length));
        console.log(JSON.stringify({ mode: 'rollback', result }, null, 2));
      } else {
        throw error;
      }
    }
  } else {
    const preview = await getPreview(sql);
    console.log(JSON.stringify({ mode: 'preview', preview }, null, 2));
  }
} finally {
  await sql.close();
}
