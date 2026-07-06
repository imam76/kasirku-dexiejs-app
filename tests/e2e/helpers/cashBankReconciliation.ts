import { expect, type Page } from '@playwright/test';
import type {
  CashBankReconciliation,
  ChartOfAccount,
  FinanceTransaction,
  JournalEntry,
} from '../../../src/types';

export const cashBankReconciliationFixtureIds = {
  account: 'e2e-cash-bank-reconciliation-bank',
  income: 'e2e-cash-bank-reconciliation-income',
  expense: 'e2e-cash-bank-reconciliation-expense',
  difference: 'e2e-cash-bank-reconciliation-difference',
} as const;

export interface CashBankReconciliationFixtureState {
  reconciliations: CashBankReconciliation[];
  financeTransactions: FinanceTransaction[];
  journalEntries: JournalEntry[];
}

const createTransaction = ({
  id,
  type,
  amount,
  description,
  createdAt,
}: {
  id: string;
  type: FinanceTransaction['type'];
  amount: number;
  description: string;
  createdAt: string;
}): FinanceTransaction => ({
  id,
  type,
  category: type === 'EXPENSE' ? 'OPERASIONAL' : 'PENJUALAN',
  amount,
  description,
  created_at: createdAt,
  cash_account_id: cashBankReconciliationFixtureIds.account,
  cash_account_code: '1020-E2E',
  cash_account_name: 'Bank E2E Rekonsiliasi',
  version: 1,
  sync_status: 'pending',
});

export async function seedCashBankReconciliationFixture(page: Page) {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 60_000).toISOString();
  const account: ChartOfAccount = {
    id: cashBankReconciliationFixtureIds.account,
    code: '1020-E2E',
    name: 'Bank E2E Rekonsiliasi',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_postable: true,
    is_system: false,
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
    sync_status: 'pending',
  };
  const financeTransactions: FinanceTransaction[] = [
    createTransaction({
      id: cashBankReconciliationFixtureIds.income,
      type: 'INCOME',
      amount: 1_000_000,
      description: 'E2E setoran bank masuk',
      createdAt,
    }),
    createTransaction({
      id: cashBankReconciliationFixtureIds.expense,
      type: 'EXPENSE',
      amount: 250_000,
      description: 'E2E biaya admin bank',
      createdAt,
    }),
    createTransaction({
      id: cashBankReconciliationFixtureIds.difference,
      type: 'INCOME',
      amount: 100_000,
      description: 'E2E transaksi selisih',
      createdAt,
    }),
  ];

  await page.evaluate(async (fixture) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('KasirkuDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(['chartOfAccounts', 'financeTransactions'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };

        transaction.objectStore('chartOfAccounts').put(fixture.account);
        fixture.financeTransactions.forEach((record) => {
          transaction.objectStore('financeTransactions').put(record);
        });
      };
    });
  }, { account, financeTransactions });
}

export async function selectCashBankReconciliationCandidate(page: Page, transactionId: string) {
  const row = page.getByTestId(`cash-bank-reconciliation-candidate-row-${transactionId}`);
  await expect(row).toBeVisible();
  await row.locator('input[type="checkbox"]').check({ force: true });
}

export async function fillStatementEndingBalance(page: Page, amount: number) {
  const control = page.getByTestId('cash-bank-reconciliation-statement-balance');
  const nestedInput = control.locator('input').first();
  const input = await nestedInput.count() > 0 ? nestedInput : control;

  await input.fill(String(amount));
}

export async function getCashBankReconciliationFixtureState(
  page: Page,
): Promise<CashBankReconciliationFixtureState> {
  return page.evaluate(async (fixtureIds) => new Promise<CashBankReconciliationFixtureState>((resolve, reject) => {
    const request = indexedDB.open('KasirkuDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction([
        'cashBankReconciliations',
        'financeTransactions',
        'journalEntries',
      ], 'readonly');
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      const reconciliationRequest = transaction.objectStore('cashBankReconciliations').getAll();
      const financeTransactionRequest = transaction.objectStore('financeTransactions').getAll();
      const journalEntryRequest = transaction.objectStore('journalEntries').getAll();

      transaction.oncomplete = () => {
        const fixtureTransactionIds = new Set(Object.values(fixtureIds));
        const fixtureReconciliations = (reconciliationRequest.result as CashBankReconciliation[])
          .filter((record) => record.cash_account_id === fixtureIds.account);
        const fixtureTransactions = (financeTransactionRequest.result as FinanceTransaction[])
          .filter((record) => fixtureTransactionIds.has(record.id));

        database.close();
        resolve({
          reconciliations: fixtureReconciliations,
          financeTransactions: fixtureTransactions,
          journalEntries: journalEntryRequest.result as JournalEntry[],
        });
      };
    };
  }), cashBankReconciliationFixtureIds);
}
