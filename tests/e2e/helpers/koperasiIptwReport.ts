import type { Page } from '@playwright/test';
import type {
  CooperativeLoanPayment,
  CooperativeMember,
  Employee,
  FinanceTransaction,
} from '../../../src/types';

export const iptwReportFixtureIds = {
  member: 'e2e-iptw-member',
  firstEmployee: 'e2e-iptw-employee-a',
  secondEmployee: 'e2e-iptw-employee-b',
  firstPayment: 'e2e-iptw-payment-a',
  secondPayment: 'e2e-iptw-payment-b',
  firstPayout: 'e2e-iptw-payout-a',
  secondPayout: 'e2e-iptw-payout-b',
  reversal: 'e2e-iptw-reversal-a',
} as const;

const now = new Date().toISOString();

const employees: Employee[] = [
  {
    id: iptwReportFixtureIds.firstEmployee,
    name: 'Karyawan IPTW A',
    position: 'PDL',
    field_cash_account_id: 'e2e-iptw-cash-a',
    field_cash_account_code: 'KAS-IPTW-A',
    field_cash_account_name: 'Kas IPTW A',
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: iptwReportFixtureIds.secondEmployee,
    name: 'Karyawan IPTW B',
    position: 'Kolektor',
    field_cash_account_id: 'e2e-iptw-cash-b',
    field_cash_account_code: 'KAS-IPTW-B',
    field_cash_account_name: 'Kas IPTW B',
    is_active: true,
    created_at: now,
    updated_at: now,
  },
];

const member: CooperativeMember = {
  id: iptwReportFixtureIds.member,
  member_number: 'AGT-IPTW-001',
  name: 'Anggota Penerima IPTW',
  address: 'Jl. Laporan Koperasi No. 1',
  join_date: now,
  status: 'ACTIVE',
  created_at: now,
  updated_at: now,
};

const createPayment = (
  id: string,
  employee: Employee,
): CooperativeLoanPayment => ({
  id,
  payment_number: `PAY-${id}`,
  payment_type: 'PAYMENT',
  loan_id: `LOAN-${id}`,
  loan_number: `PJM-${id}`,
  member_id: member.id,
  member_number: member.member_number,
  member_name: member.name,
  amount: 1_000_000,
  principal_amount: 900_000,
  interest_amount: 100_000,
  penalty_amount: 0,
  payment_date: now,
  status: 'POSTED',
  cash_account_id: employee.field_cash_account_id,
  cash_account_code: employee.field_cash_account_code,
  cash_account_name: employee.field_cash_account_name,
  payment_method: 'TUNAI',
  collector_id: employee.id,
  collector_name: employee.name,
  collector_position: employee.position,
  created_at: now,
  updated_at: now,
});

const payments = [
  createPayment(iptwReportFixtureIds.firstPayment, employees[0]),
  createPayment(iptwReportFixtureIds.secondPayment, employees[1]),
];

const createPayout = (
  id: string,
  payment: CooperativeLoanPayment,
  employee: Employee,
  amount: number,
): FinanceTransaction => ({
  id,
  type: 'EXPENSE',
  category: 'KSP_INSENTIF_PEMBAYARAN_TEPAT_WAKTU',
  amount,
  description: `Fixture IPTW ${payment.member_number}`,
  reference_id: payment.id,
  cash_account_id: employee.field_cash_account_id,
  cash_account_code: employee.field_cash_account_code,
  cash_account_name: employee.field_cash_account_name,
  field_employee_id: employee.id,
  field_employee_name: employee.name,
  field_cash_movement_kind: 'IPTW_PAYOUT',
  created_at: now,
});

const firstPayout = createPayout(
  iptwReportFixtureIds.firstPayout,
  payments[0],
  employees[0],
  50_000,
);
const financeTransactions: FinanceTransaction[] = [
  firstPayout,
  createPayout(
    iptwReportFixtureIds.secondPayout,
    payments[1],
    employees[1],
    30_000,
  ),
  {
    ...firstPayout,
    id: iptwReportFixtureIds.reversal,
    type: 'INCOME',
    amount: 10_000,
    description: 'Reversal fixture IPTW',
    reference_id: firstPayout.id,
  },
];

export async function seedIptwReportFixture(page: Page) {
  await page.evaluate(async (recordsByStore) => {
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
  }, {
    employees,
    cooperativeMembers: [member],
    cooperativeLoanPayments: payments,
    financeTransactions,
  });

  await page.reload();
}
