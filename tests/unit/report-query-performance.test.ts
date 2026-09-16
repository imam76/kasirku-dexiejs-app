import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const generalLedgerSource = readFileSync(
  new URL('../../src/services/generalLedgerService.ts', import.meta.url),
  'utf8',
);
const ledgerReportSource = readFileSync(
  new URL('../../src/services/ledgerReportService.ts', import.meta.url),
  'utf8',
);
const reportsSource = readFileSync(
  new URL('../../src/hooks/useReports.tsx', import.meta.url),
  'utf8',
);
const generalLedgerViewSource = readFileSync(
  new URL('../../src/view/finance/general-ledger/GeneralLedgerManagement.tsx', import.meta.url),
  'utf8',
);

describe('bounded ledger and report reads', () => {
  test('seeks journal headers and lines through date/account indexes', () => {
    const readBody = generalLedgerSource.slice(
      generalLedgerSource.indexOf('const getDateMatchedJournalEntries'),
      generalLedgerSource.indexOf('const getPostedReportLines'),
    );

    expect(readBody).toContain("where('entry_date')");
    expect(readBody).toContain("where('[account_id+entry_date+id]')");
    expect(readBody).toContain("where('journal_entry_id')");
    expect(readBody).not.toContain('db.journalEntryLines.toArray()');
  });

  test('pushes an explicit ledger account range into the indexed line read', () => {
    const reportBody = ledgerReportSource.slice(
      ledgerReportSource.indexOf('export const getLedgerReportData'),
    );

    expect(reportBody).toContain('accountIds: selectedAccountIds ? [...selectedAccountIds] : undefined');
  });

  test('does not full-scan stock purchases or POS transactions for dated reports', () => {
    const purchaseBody = reportsSource.slice(
      reportsSource.indexOf('export const usePurchaseReport'),
      reportsSource.indexOf('export const useExpenseReport'),
    );
    const expenseBody = reportsSource.slice(
      reportsSource.indexOf('export const useExpenseReport'),
      reportsSource.indexOf('export const useIncomeReport'),
    );

    expect(purchaseBody).toContain('getStockPurchasesInRange(startDate, endDate)');
    expect(purchaseBody).not.toContain('db.stockPurchases.toArray()');
    expect(expenseBody).toContain('getPosTransactionsInRange(startDate, endDate)');
    expect(expenseBody).not.toContain('db.transactions.toArray()');
  });

  test('uses the compound type/date index for finance reports', () => {
    expect(reportsSource).toContain("where('[type+created_at+id]')");
    expect(reportsSource).toContain("getFinanceTransactionsByTypeInRange('EXPENSE'");
    expect(reportsSource).toContain("getFinanceTransactionsByTypeInRange('INCOME'");
  });

  test('opens the general-ledger workspace on a bounded current-month range', () => {
    expect(generalLedgerViewSource).toContain("dayjs.tz().startOf('month')");
    expect(generalLedgerViewSource).toContain("dayjs.tz().endOf('day')");
    expect(generalLedgerViewSource).not.toContain(
      'useState<[Dayjs, Dayjs] | null>(null)',
    );
  });
});
