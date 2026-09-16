import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('high-growth transaction list architecture', () => {
  test('POS history uses a date/id cursor instead of offset pagination', () => {
    const hookSource = readSource('src/hooks/useHistory.tsx');
    const serviceSource = readSource('src/services/transactionHistoryReadService.ts');

    expect(hookSource).toContain('useInfiniteQuery');
    expect(serviceSource).toContain("where('[created_at+id]')");
    expect(serviceSource).not.toContain('.offset(');
    expect(hookSource).not.toContain('db.transactions.count()');
    expect(hookSource).not.toContain("db.transactionItems.toArray()");
  });

  test('sales and purchase lists query one type and date range per cursor page', () => {
    const serviceSource = readSource('src/services/documentHistoryReadService.ts');
    const salesHookSource = readSource('src/hooks/useSalesDocuments.tsx');
    const purchaseHookSource = readSource('src/hooks/usePurchaseDocuments.tsx');

    expect(serviceSource).toContain("where('[type+document_date+id]')");
    expect(serviceSource).not.toContain('.offset(');
    expect(salesHookSource).not.toContain("db.salesDocuments.orderBy('created_at').reverse().toArray()");
    expect(purchaseHookSource).not.toContain("db.purchaseDocuments.orderBy('created_at').reverse().toArray()");
  });

  test('cash-bank history is period-bounded and account-aware', () => {
    const financeHookSource = readSource('src/hooks/useFinance.tsx');
    const financeServiceSource = readSource('src/services/financeHistoryReadService.ts');
    const reconciliationSource = readSource('src/services/cashBankReconciliationService.ts');

    expect(financeHookSource).not.toContain("db.financeTransactions.orderBy('created_at').reverse().toArray()");
    expect(financeServiceSource).toContain('[account_id+created_at+id]');
    expect(financeServiceSource).not.toContain('.offset(');
    expect(reconciliationSource).toContain("where('[cash_account_id+created_at+id]')");
    expect(reconciliationSource).toContain("'[cash_account_id+statement_date+id]'");
  });

  test('high-growth screens default to an explicit current-month range', () => {
    const historyView = readSource('src/view/History.tsx');
    const salesView = readSource('src/view/finance/sales/SalesDocumentsManagement.tsx');
    const purchaseView = readSource('src/view/finance/purchases/PurchaseDocumentsManagement.tsx');
    const financeView = readSource('src/view/finance/FinanceManagement.tsx');

    [historyView, salesView, purchaseView, financeView].forEach((source) => {
      expect(source).toContain("dayjs.tz().startOf('month')");
      expect(source).toContain('allowClear={false}');
    });
  });
});
