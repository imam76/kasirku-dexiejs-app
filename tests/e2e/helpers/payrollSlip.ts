import type { Page } from '@playwright/test';
import type { CompanyProfileSetting, Employee, PayrollRun, PayrollRunItem } from '../../../src/types';

export const payrollSlipFixtureIds = {
  paidRun: 'e2e-payroll-slip-paid',
  draftRun: 'e2e-payroll-slip-draft',
  approvedRun: 'e2e-payroll-slip-approved',
  voidedRun: 'e2e-payroll-slip-voided',
  firstEmployee: 'e2e-payroll-slip-employee-a',
  secondEmployee: 'e2e-payroll-slip-employee-b',
  draftEmployee: 'e2e-payroll-slip-employee-draft',
  approvedEmployee: 'e2e-payroll-slip-employee-approved',
  voidedEmployee: 'e2e-payroll-slip-employee-voided',
} as const;

const now = '2026-07-03T08:00:00.000+07:00';
const paidAt = '2026-07-03T09:00:00.000+07:00';

const createEmployee = (id: string, name: string, position: string): Employee => ({
  id,
  name,
  position,
  is_active: true,
  created_at: now,
  updated_at: now,
});

const createItem = ({
  runId,
  employee,
  baseSalary,
  allowance,
  bonus,
  otherDeduction,
  cashAdvanceDeduction,
}: {
  runId: string;
  employee: Employee;
  baseSalary: number;
  allowance: number;
  bonus: number;
  otherDeduction: number;
  cashAdvanceDeduction: number;
}): PayrollRunItem => {
  const gross = baseSalary + allowance + bonus;
  const deduction = otherDeduction + cashAdvanceDeduction;

  return {
    id: `${runId}:${employee.id}`,
    payroll_run_id: runId,
    employee_id: employee.id,
    employee_name: employee.name,
    employee_position: employee.position,
    base_salary: baseSalary,
    allowance_amount: allowance,
    bonus_amount: bonus,
    other_deduction_amount: otherDeduction,
    cash_advance_deduction_amount: cashAdvanceDeduction,
    deduction_amount: deduction,
    gross_amount: gross,
    net_amount: gross - deduction,
    notes: `Fixture slip ${employee.name}`,
    created_at: now,
    updated_at: now,
  };
};

const summarizeRun = (items: PayrollRunItem[]) => items.reduce((acc, item) => ({
  employee_count: acc.employee_count + 1,
  gross_amount: acc.gross_amount + item.gross_amount,
  allowance_amount: acc.allowance_amount + item.allowance_amount,
  bonus_amount: acc.bonus_amount + item.bonus_amount,
  other_deduction_amount: acc.other_deduction_amount + item.other_deduction_amount,
  cash_advance_deduction_amount: acc.cash_advance_deduction_amount + item.cash_advance_deduction_amount,
  deduction_amount: acc.deduction_amount + item.deduction_amount,
  net_amount: acc.net_amount + item.net_amount,
}), {
  employee_count: 0,
  gross_amount: 0,
  allowance_amount: 0,
  bonus_amount: 0,
  other_deduction_amount: 0,
  cash_advance_deduction_amount: 0,
  deduction_amount: 0,
  net_amount: 0,
});

const createRun = ({
  id,
  payrollNumber,
  status,
  items,
}: {
  id: string;
  payrollNumber: string;
  status: PayrollRun['status'];
  items: PayrollRunItem[];
}): PayrollRun => {
  const totals = summarizeRun(items);

  return {
    id,
    payroll_number: payrollNumber,
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    status,
    ...totals,
    payment_method: status === 'PAID' ? 'NON_TUNAI' : undefined,
    payment_channel: status === 'PAID' ? 'Transfer BCA' : undefined,
    cash_account_id: status === 'PAID' ? 'e2e-payroll-bank' : undefined,
    cash_account_code: status === 'PAID' ? '1020' : undefined,
    cash_account_name: status === 'PAID' ? 'Bank Operasional' : undefined,
    finance_transaction_id: status === 'PAID' ? 'e2e-payroll-finance-tx' : undefined,
    notes: `Fixture ${payrollNumber}`,
    approved_at: status === 'DRAFT' ? undefined : now,
    paid_at: status === 'PAID' ? paidAt : undefined,
    voided_at: status === 'VOIDED' ? now : undefined,
    created_by: 'e2e-owner',
    created_by_name: 'Owner E2E',
    updated_by: 'e2e-owner',
    updated_by_name: 'Owner E2E',
    created_at: now,
    updated_at: now,
    sync_status: 'synced',
  };
};

const employees = [
  createEmployee(payrollSlipFixtureIds.firstEmployee, 'Adi Payroll', 'Kasir'),
  createEmployee(payrollSlipFixtureIds.secondEmployee, 'Bela Payroll', 'Admin'),
  createEmployee(payrollSlipFixtureIds.draftEmployee, 'Citra Draft', 'Gudang'),
  createEmployee(payrollSlipFixtureIds.approvedEmployee, 'Doni Approved', 'Sales'),
  createEmployee(payrollSlipFixtureIds.voidedEmployee, 'Eka Void', 'Admin'),
];

const paidItems = [
  createItem({
    runId: payrollSlipFixtureIds.paidRun,
    employee: employees[0],
    baseSalary: 3_000_000,
    allowance: 500_000,
    bonus: 250_000,
    otherDeduction: 100_000,
    cashAdvanceDeduction: 200_000,
  }),
  createItem({
    runId: payrollSlipFixtureIds.paidRun,
    employee: employees[1],
    baseSalary: 2_800_000,
    allowance: 300_000,
    bonus: 0,
    otherDeduction: 50_000,
    cashAdvanceDeduction: 0,
  }),
];

const singleItemRuns = [
  {
    id: payrollSlipFixtureIds.draftRun,
    number: 'PYR-E2E-DRAFT',
    status: 'DRAFT' as const,
    employee: employees[2],
  },
  {
    id: payrollSlipFixtureIds.approvedRun,
    number: 'PYR-E2E-APPROVED',
    status: 'APPROVED' as const,
    employee: employees[3],
  },
  {
    id: payrollSlipFixtureIds.voidedRun,
    number: 'PYR-E2E-VOIDED',
    status: 'VOIDED' as const,
    employee: employees[4],
  },
];

const otherItems = singleItemRuns.map((run) => createItem({
  runId: run.id,
  employee: run.employee,
  baseSalary: 2_500_000,
  allowance: 100_000,
  bonus: 0,
  otherDeduction: 0,
  cashAdvanceDeduction: 0,
}));

const runs = [
  createRun({
    id: payrollSlipFixtureIds.paidRun,
    payrollNumber: 'PYR-E2E-PAID',
    status: 'PAID',
    items: paidItems,
  }),
  ...singleItemRuns.map((run, index) => createRun({
    id: run.id,
    payrollNumber: run.number,
    status: run.status,
    items: [otherItems[index]],
  })),
];

const companyProfile: CompanyProfileSetting = {
  id: 'default',
  company_name: 'KSU E2E Payroll',
  created_at: now,
  updated_at: now,
};

export async function seedPayrollSlipFixture(page: Page) {
  await page.evaluate(async (fixture) => {
    const recordsByStore = {
      companyProfileSetting: [fixture.companyProfile],
      employees: fixture.employees,
      payrollRuns: fixture.runs,
      payrollRunItems: fixture.items,
    };
    const storeNames = Object.keys(recordsByStore);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('KasirkuDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const missingStores = storeNames.filter(
          (storeName) => !database.objectStoreNames.contains(storeName),
        );

        if (missingStores.length > 0) {
          database.close();
          reject(new Error(
            `KasirkuDB belum siap. Object store tidak ditemukan: ${missingStores.join(', ')}`,
          ));
          return;
        }

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
    companyProfile,
    employees,
    runs,
    items: [...paidItems, ...otherItems],
  });

  await page.reload();
}
