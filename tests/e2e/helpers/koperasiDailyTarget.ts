import type { Page } from '@playwright/test';
import type {
  CooperativeArea,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeMember,
  CooperativeSavingTransaction,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
} from '../../../src/types';

export const dailyTargetFixtureIds = {
  employee: 'e2e-daily-target-employee',
  secondEmployee: 'e2e-daily-target-employee-second',
  mondayArea: 'e2e-daily-target-area-monday',
  thursdayArea: 'e2e-daily-target-area-thursday',
  wednesdayArea: 'e2e-daily-target-area-wednesday',
  mondaySchedule: 'e2e-daily-target-schedule-monday',
  thursdaySchedule: 'e2e-daily-target-schedule-thursday',
  wednesdaySchedule: 'e2e-daily-target-schedule-wednesday',
} as const;

const createdAt = '2026-01-01T08:00:00.000+07:00';
const iso = (date: string, hour = '09') => `${date}T${hour}:00:00.000+07:00`;

const employee: Employee = {
  id: dailyTargetFixtureIds.employee,
  name: 'Petugas Target',
  position: 'PDL Utama',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const secondEmployee: Employee = {
  id: dailyTargetFixtureIds.secondEmployee,
  name: 'Petugas Cadangan',
  position: 'PDL Kedua',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const areas: CooperativeArea[] = [
  {
    id: dailyTargetFixtureIds.mondayArea,
    code: 'SENIN',
    name: 'Area Senin',
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
  {
    id: dailyTargetFixtureIds.thursdayArea,
    code: 'KAMIS',
    name: 'Area Kamis',
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
  {
    id: dailyTargetFixtureIds.wednesdayArea,
    code: 'RABU',
    name: 'Area Rabu',
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
];

const employeeAreas: EmployeeArea[] = [
  ...areas.slice(0, 2).map((area) => ({
    id: `employee-${area.id}`,
    employee_id: employee.id,
    area_id: area.id,
    area_name: area.name,
    area_code: area.code,
    created_at: createdAt,
    updated_at: createdAt,
  })),
  {
    id: `employee-${areas[2].id}`,
    employee_id: secondEmployee.id,
    area_id: areas[2].id,
    area_name: areas[2].name,
    area_code: areas[2].code,
    created_at: createdAt,
    updated_at: createdAt,
  },
];

const schedules: EmployeeCollectionSchedule[] = [
  {
    id: dailyTargetFixtureIds.mondaySchedule,
    employee_id: employee.id,
    employee_name: employee.name,
    employee_position: employee.position,
    area_id: areas[0].id,
    area_name: areas[0].name,
    area_code: areas[0].code,
    weekday: 1,
    effective_from: iso('2026-01-01'),
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
  {
    id: dailyTargetFixtureIds.thursdaySchedule,
    employee_id: employee.id,
    employee_name: employee.name,
    employee_position: employee.position,
    area_id: areas[1].id,
    area_name: areas[1].name,
    area_code: areas[1].code,
    weekday: 4,
    effective_from: iso('2026-01-01'),
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
  {
    id: dailyTargetFixtureIds.wednesdaySchedule,
    employee_id: secondEmployee.id,
    employee_name: secondEmployee.name,
    employee_position: secondEmployee.position,
    area_id: areas[2].id,
    area_name: areas[2].name,
    area_code: areas[2].code,
    weekday: 3,
    effective_from: iso('2026-01-01'),
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
];

const createMember = (
  id: string,
  number: string,
  name: string,
  area: CooperativeArea,
  joinDate: string,
  officer: Employee = employee,
): CooperativeMember => ({
  id,
  member_number: number,
  name,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  officer_id: officer.id,
  officer_name: officer.name,
  officer_position: officer.position,
  join_date: iso(joinDate),
  status: 'ACTIVE',
  created_at: createdAt,
  updated_at: createdAt,
  sync_status: 'synced',
});

const members = {
  mondayExit: createMember('e2e-target-member-monday-exit', 'TH-001', 'Anggota Senin Keluar', areas[0], '2025-01-01'),
  mondayActive: createMember('e2e-target-member-monday-active', 'TH-002', 'Anggota Senin Aktif', areas[0], '2025-01-02'),
  mondayNew: createMember('e2e-target-member-monday-new', 'TH-003', 'Anggota Senin Baru', areas[0], '2026-06-01'),
  thursdayActive: createMember('e2e-target-member-thursday-active', 'TH-004', 'Anggota Kamis Aktif', areas[1], '2025-01-04'),
  thursdayNew: createMember('e2e-target-member-thursday-new', 'TH-005', 'Anggota Kamis Baru', areas[1], '2026-06-04'),
  secondEmployeeMember: createMember(
    'e2e-target-member-second-employee',
    'TH-006',
    'Anggota PDL Kedua',
    areas[2],
    '2025-01-05',
    secondEmployee,
  ),
};

type LoanFixtureInput = {
  id: string;
  number: string;
  member: CooperativeMember;
  area: CooperativeArea;
  weekday: 1 | 3 | 4;
  disbursedAt: string;
  principal: number;
  installmentAmount: number;
  status?: 'DISBURSED' | 'PAID_OFF';
  officer?: Employee;
};

const createLoan = ({
  id,
  number,
  member,
  area,
  weekday,
  disbursedAt,
  principal,
  installmentAmount,
  status = 'DISBURSED',
  officer = employee,
}: LoanFixtureInput) => {
  const installmentCount = 10;
  const totalPayable = installmentAmount * installmentCount;
  const totalInterest = Math.max(0, totalPayable - principal);
  const loan: CooperativeLoan = {
    id,
    loan_number: number,
    member_id: member.id,
    member_number: member.member_number,
    member_name: member.name,
    principal_amount: principal,
    interest_rate_per_month: 0,
    tenor_months: installmentCount,
    billing_frequency: 'WEEKLY',
    installment_count: installmentCount,
    total_interest_amount: totalInterest,
    total_payable_amount: totalPayable,
    outstanding_principal_amount: status === 'PAID_OFF' ? 0 : principal,
    outstanding_interest_amount: status === 'PAID_OFF' ? 0 : totalInterest,
    outstanding_penalty_amount: 0,
    status,
    application_date: iso(disbursedAt),
    disbursed_at: iso(disbursedAt),
    officer_id: officer.id,
    officer_name: officer.name,
    officer_position: officer.position,
    area_id: area.id,
    area_name: area.name,
    area_code: area.code,
    collection_schedule_id: weekday === 1
      ? dailyTargetFixtureIds.mondaySchedule
      : weekday === 4
        ? dailyTargetFixtureIds.thursdaySchedule
        : dailyTargetFixtureIds.wednesdaySchedule,
    collection_weekday: weekday,
    created_at: createdAt,
    updated_at: status === 'PAID_OFF' ? iso('2026-06-01', '11') : createdAt,
    sync_status: 'synced',
  };
  const principalInstallment = Math.min(principal, installmentAmount);
  const installment: CooperativeLoanInstallment = {
    id: `${id}-installment-1`,
    loan_id: id,
    loan_number: number,
    member_id: member.id,
    member_number: member.member_number,
    member_name: member.name,
    installment_number: 1,
    due_date: iso('2026-06-01'),
    principal_amount: principalInstallment,
    interest_amount: installmentAmount - principalInstallment,
    penalty_amount: 0,
    paid_principal_amount: status === 'PAID_OFF' ? principalInstallment : 0,
    paid_interest_amount: status === 'PAID_OFF' ? installmentAmount - principalInstallment : 0,
    paid_penalty_amount: 0,
    status: status === 'PAID_OFF' ? 'PAID' : 'UNPAID',
    paid_at: status === 'PAID_OFF' ? iso('2026-06-01', '11') : undefined,
    collection_status: 'NONE',
    created_at: createdAt,
    updated_at: createdAt,
    sync_status: 'synced',
  };
  return { loan, installment };
};

const loanFixtures = [
  createLoan({
    id: 'e2e-target-loan-monday-exit',
    number: 'TH-PJ-001',
    member: members.mondayExit,
    area: areas[0],
    weekday: 1,
    disbursedAt: '2025-01-06',
    principal: 700_000,
    installmentAmount: 70_000,
    status: 'PAID_OFF',
  }),
  createLoan({
    id: 'e2e-target-loan-monday-active',
    number: 'TH-PJ-002',
    member: members.mondayActive,
    area: areas[0],
    weekday: 1,
    disbursedAt: '2025-01-06',
    principal: 1_000_000,
    installmentAmount: 130_000,
  }),
  createLoan({
    id: 'e2e-target-loan-monday-new',
    number: 'TH-PJ-003',
    member: members.mondayNew,
    area: areas[0],
    weekday: 1,
    disbursedAt: '2026-06-01',
    principal: 100_000,
    installmentAmount: 50_000,
  }),
  createLoan({
    id: 'e2e-target-loan-thursday-active',
    number: 'TH-PJ-004',
    member: members.thursdayActive,
    area: areas[1],
    weekday: 4,
    disbursedAt: '2025-01-09',
    principal: 2_000_000,
    installmentAmount: 300_000,
  }),
  createLoan({
    id: 'e2e-target-loan-thursday-new',
    number: 'TH-PJ-005',
    member: members.thursdayNew,
    area: areas[1],
    weekday: 4,
    disbursedAt: '2026-06-04',
    principal: 200_000,
    installmentAmount: 40_000,
  }),
  createLoan({
    id: 'e2e-target-loan-second-employee',
    number: 'TH-PJ-006',
    member: members.secondEmployeeMember,
    area: areas[2],
    weekday: 3,
    disbursedAt: '2025-01-08',
    principal: 500_000,
    installmentAmount: 90_000,
    officer: secondEmployee,
  }),
];

const payments: CooperativeLoanPayment[] = [
  {
    id: 'e2e-target-payment-monday',
    payment_number: 'TH-ANG-001',
    payment_type: 'PAYMENT',
    loan_id: loanFixtures[0].loan.id,
    loan_number: loanFixtures[0].loan.loan_number,
    installment_id: loanFixtures[0].installment.id,
    member_id: members.mondayExit.id,
    member_number: members.mondayExit.member_number,
    member_name: members.mondayExit.name,
    amount: 180_000,
    principal_amount: 170_000,
    interest_amount: 10_000,
    penalty_amount: 0,
    payment_date: iso('2026-06-01', '11'),
    status: 'POSTED',
    payment_method: 'TUNAI',
    collector_id: employee.id,
    collector_name: employee.name,
    collector_position: employee.position,
    posted_at: iso('2026-06-01', '11'),
    created_at: createdAt,
    updated_at: createdAt,
    sync_status: 'synced',
  },
  {
    id: 'e2e-target-payment-thursday',
    payment_number: 'TH-ANG-002',
    payment_type: 'PAYMENT',
    loan_id: loanFixtures[3].loan.id,
    loan_number: loanFixtures[3].loan.loan_number,
    installment_id: loanFixtures[3].installment.id,
    member_id: members.thursdayActive.id,
    member_number: members.thursdayActive.member_number,
    member_name: members.thursdayActive.name,
    amount: 150_000,
    principal_amount: 140_000,
    interest_amount: 10_000,
    penalty_amount: 0,
    payment_date: iso('2026-06-04', '11'),
    status: 'POSTED',
    payment_method: 'NON_TUNAI',
    collector_id: employee.id,
    collector_name: employee.name,
    collector_position: employee.position,
    posted_at: iso('2026-06-04', '11'),
    created_at: createdAt,
    updated_at: createdAt,
    sync_status: 'synced',
  },
];

const savingTransactions: CooperativeSavingTransaction[] = [{
  id: 'e2e-target-saving-withdrawal',
  member_id: members.mondayActive.id,
  member_number: members.mondayActive.member_number,
  member_name: members.mondayActive.name,
  saving_type: 'SUKARELA',
  transaction_type: 'WITHDRAWAL',
  amount: 20_000,
  transaction_date: iso('2026-06-01', '12'),
  status: 'POSTED',
  payment_method: 'TUNAI',
  created_at: createdAt,
  updated_at: createdAt,
  sync_status: 'synced',
}];

const fixture = {
  cooperativeAreas: areas,
  employees: [employee, secondEmployee],
  employeeAreas,
  employeeCollectionSchedules: schedules,
  cooperativeMembers: Object.values(members),
  cooperativeLoans: loanFixtures.map((item) => item.loan),
  cooperativeLoanInstallments: loanFixtures.map((item) => item.installment),
  cooperativeLoanPayments: payments,
  cooperativeSavingTransactions: savingTransactions,
};

export async function seedDailyTargetFixture(page: Page) {
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
  }, fixture);

  await page.reload();
}
