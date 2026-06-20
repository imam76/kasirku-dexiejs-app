import type { Page } from '@playwright/test';
import type { Employee, FinanceTransaction } from '../../../src/types';

export const cashReportFixtureIds = {
  employee: 'e2e-cash-report-employee',
  secondEmployee: 'e2e-cash-report-employee-second',
  cashAccount: 'e2e-cash-report-account',
  secondCashAccount: 'e2e-cash-report-account-second',
} as const;

const createEmployee = ({
  id,
  name,
  code,
  accountId,
}: {
  id: string;
  name: string;
  code: string;
  accountId: string;
}): Employee => ({
  id,
  name,
  position: 'PDL',
  field_cash_account_id: accountId,
  field_cash_account_code: code,
  field_cash_account_name: `Kas ${name}`,
  is_active: true,
  created_at: '2026-01-01T08:00:00.000+07:00',
  updated_at: '2026-01-01T08:00:00.000+07:00',
});

const createMovement = ({
  id,
  amount,
  type,
  kind,
  createdAt,
}: {
  id: string;
  amount: number;
  type: FinanceTransaction['type'];
  kind: NonNullable<FinanceTransaction['field_cash_movement_kind']>;
  createdAt: string;
}): FinanceTransaction => ({
  id,
  type,
  category: 'E2E_LAPORAN_TUNAI',
  amount,
  description: `Fixture ${kind}`,
  cash_account_id: cashReportFixtureIds.cashAccount,
  cash_account_code: 'KAS-PDL-01',
  cash_account_name: 'Kas Petugas Tunai',
  field_employee_id: cashReportFixtureIds.employee,
  field_employee_name: 'Petugas Tunai',
  field_cash_movement_kind: kind,
  created_at: createdAt,
});

export async function seedCashReportFixture(page: Page) {
  const createdAt = new Date().toISOString();
  const employees = [
    createEmployee({
      id: cashReportFixtureIds.employee,
      name: 'Petugas Tunai',
      code: 'KAS-PDL-01',
      accountId: cashReportFixtureIds.cashAccount,
    }),
    createEmployee({
      id: cashReportFixtureIds.secondEmployee,
      name: 'Petugas Cadangan Tunai',
      code: 'KAS-PDL-02',
      accountId: cashReportFixtureIds.secondCashAccount,
    }),
  ];
  const financeTransactions: FinanceTransaction[] = [
    createMovement({
      id: 'e2e-cash-report-storting-in',
      amount: 500_000,
      type: 'INCOME',
      kind: 'STORTING_LOAN_PAYMENT',
      createdAt,
    }),
    createMovement({
      id: 'e2e-cash-report-storting-out',
      amount: 200_000,
      type: 'EXPENSE',
      kind: 'DEPOSIT_TO_FINANCE',
      createdAt,
    }),
    createMovement({
      id: 'e2e-cash-report-dropping-in',
      amount: 1_000_000,
      type: 'INCOME',
      kind: 'DROPPING_FROM_FINANCE',
      createdAt,
    }),
    createMovement({
      id: 'e2e-cash-report-dropping-out',
      amount: 600_000,
      type: 'EXPENSE',
      kind: 'LOAN_DISBURSEMENT',
      createdAt,
    }),
    createMovement({
      id: 'e2e-cash-report-saving-in',
      amount: 100_000,
      type: 'INCOME',
      kind: 'STORTING_SAVING_DEPOSIT',
      createdAt,
    }),
    createMovement({
      id: 'e2e-cash-report-saving-out',
      amount: 50_000,
      type: 'EXPENSE',
      kind: 'SAVING_WITHDRAWAL',
      createdAt,
    }),
  ];

  await page.evaluate(async (fixture) => {
    const recordsByStore = {
      employees: fixture.employees,
      financeTransactions: fixture.financeTransactions,
    };
    const storeNames = Object.keys(recordsByStore);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('KasirkuDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };

        Object.entries(recordsByStore).forEach(([storeName, records]) => {
          const store = transaction.objectStore(storeName);
          records.forEach((record) => store.put(record));
        });
      };
    });
  }, { employees, financeTransactions });

  await page.reload();
}
