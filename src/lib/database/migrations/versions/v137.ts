import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Keyset indexes for the high-growth transaction screens.
 *
 * The date and id pair gives every row a stable position even when several
 * records share the same timestamp/date. This lets the UI request the next
 * slice without an OFFSET walk over all preceding records.
 */
export function registerMigrationV137(db: KasirkuDB) {
  db.version(137).stores({
    salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, currency_code, sync_status, updated_at, created_at, [type+document_date+id]',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, reversal_of_transfer_group_id, sync_status, updated_at, created_at, reference_id, [created_at+id], [type+created_at+id], [account_id+created_at+id], [cash_account_id+created_at+id]',
    cashBankReconciliations: 'id, reconciliation_number, cash_account_id, statement_date, status, sync_status, updated_at, created_at, [statement_date+id], [cash_account_id+statement_date+id]',
  });
}
