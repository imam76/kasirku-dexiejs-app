import { db } from '@/lib/db';

export interface AccountingSetupLockSignalResult {
  hasSignal: boolean;
  labels: string[];
}

export const getAccountingSetupLockSignals = async (): Promise<AccountingSetupLockSignalResult> => {
  const checks = await Promise.all([
    db.salesDocuments.count().then((count) => ['dokumen sales', count] as const),
    db.purchaseDocuments.count().then((count) => ['dokumen purchase', count] as const),
    db.transactions.count().then((count) => ['transaksi POS', count] as const),
    db.financeTransactions.count().then((count) => ['transaksi finance', count] as const),
    db.journalEntries.count().then((count) => ['jurnal', count] as const),
    db.salesInvoicePayments.count().then((count) => ['pembayaran sales invoice', count] as const),
    db.purchaseInvoicePayments.count().then((count) => ['pembayaran purchase invoice', count] as const),
    db.payrollRuns.count().then((count) => ['payroll', count] as const),
    db.employeeCashAdvances.count().then((count) => ['kasbon karyawan', count] as const),
    db.employeeCashAdvanceRepayments.count().then((count) => ['pelunasan kasbon', count] as const),
    db.cooperativeSavingTransactions.count().then((count) => ['transaksi simpanan koperasi', count] as const),
    db.cooperativeLoans.count().then((count) => ['pinjaman koperasi', count] as const),
    db.cooperativeLoanPayments.count().then((count) => ['pembayaran pinjaman koperasi', count] as const),
    db.cooperativeFieldCashSessions.count().then((count) => ['kas petugas koperasi', count] as const),
    db.stockPurchases.count().then((count) => ['pembelian stok legacy', count] as const),
    db.stockOpnames.count().then((count) => ['stock opname', count] as const),
    db.productionOrders.count().then((count) => ['produksi', count] as const),
    db.generalLedgerSetting
      .get('default')
      .then((setting) => ['opening balance', setting?.opening_balance_journal_id ? 1 : 0] as const),
  ]);
  const labels = checks
    .filter(([, count]) => count > 0)
    .map(([label]) => label);

  return {
    hasSignal: labels.length > 0,
    labels,
  };
};
