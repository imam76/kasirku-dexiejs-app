import type { Page } from '@playwright/test';
import type {
  CooperativeArea,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeMember,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
} from '../../../src/types';

export const installmentBookFixtureIds = {
  area: 'e2e-installment-book-area-monday',
  employee: 'e2e-installment-book-employee-monday',
  employeeArea: 'e2e-installment-book-employee-area-monday',
  collectionSchedule: 'e2e-installment-book-schedule-monday',
  currentMember: 'e2e-installment-book-member-current',
  watchlistMember: 'e2e-installment-book-member-watchlist',
  delinquentMember: 'e2e-installment-book-member-delinquent',
  currentLoan: 'e2e-installment-book-loan-current',
  watchlistLoan: 'e2e-installment-book-loan-watchlist',
  delinquentLoan: 'e2e-installment-book-loan-delinquent',
} as const;

export const installmentBookFixtureExpected = {
  reportMonth: '2026-06',
  collectionWeekday: 1,
  collectionDates: [1, 8, 15, 22, 29],
  summary: {
    rowCount: 3,
    principalAmount: 9_000_000,
    openingBalance: 9_540_000,
    installmentAmount: 1_590_000,
    endingBalance: 7_950_000,
  },
  current: {
    memberNumber: 'E2E-BA-001',
    memberName: 'Anggota Lancar',
    installmentAmount: 1_060_000,
    endingBalance: 2_120_000,
  },
  watchlist: {
    memberNumber: 'E2E-BA-002',
    memberName: 'Anggota Calon Macet',
    installmentAmount: 530_000,
    endingBalance: 2_650_000,
  },
  delinquent: {
    memberNumber: 'E2E-BA-003',
    memberName: 'Anggota Macet',
    installmentAmount: 0,
    endingBalance: 3_180_000,
  },
} as const;

interface InstallmentBookFixture {
  areas: CooperativeArea[];
  employees: Employee[];
  employeeAreas: EmployeeArea[];
  employeeCollectionSchedules: EmployeeCollectionSchedule[];
  members: CooperativeMember[];
  loans: CooperativeLoan[];
  installments: CooperativeLoanInstallment[];
  payments: CooperativeLoanPayment[];
}

interface FixtureLoanInput {
  id: string;
  loanNumber: string;
  member: CooperativeMember;
  disbursedAt: string;
  dueDates: string[];
  paymentDates: string[];
}

const createdAt = '2026-01-01T00:00:00.000+07:00';
const principalAmount = 3_000_000;
const totalInterestAmount = 180_000;
const totalPayableAmount = 3_180_000;
const installmentPrincipalAmount = 500_000;
const installmentInterestAmount = 30_000;
const installmentTotalAmount = 530_000;

const toJakartaIso = (date: string) => `${date}T09:00:00.000+07:00`;

const area: CooperativeArea = {
  id: installmentBookFixtureIds.area,
  code: 'E2E-AREA-01',
  name: 'Area Senin',
  description: 'Area fixture Buku Angsuran',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const employee: Employee = {
  id: installmentBookFixtureIds.employee,
  name: 'Petugas Senin',
  position: 'Resort Senin',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const employeeArea: EmployeeArea = {
  id: installmentBookFixtureIds.employeeArea,
  employee_id: employee.id,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  created_at: createdAt,
  updated_at: createdAt,
};

const collectionSchedule: EmployeeCollectionSchedule = {
  id: installmentBookFixtureIds.collectionSchedule,
  employee_id: employee.id,
  employee_name: employee.name,
  employee_position: employee.position,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  weekday: 1,
  effective_from: toJakartaIso('2026-01-01'),
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const createMember = ({
  id,
  memberNumber,
  name,
  joinDate,
}: {
  id: string;
  memberNumber: string;
  name: string;
  joinDate: string;
}): CooperativeMember => ({
  id,
  member_number: memberNumber,
  name,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  officer_id: employee.id,
  officer_name: employee.name,
  officer_position: employee.position,
  join_date: toJakartaIso(joinDate),
  status: 'ACTIVE',
  notes: 'Fixture E2E Buku Angsuran',
  created_at: createdAt,
  updated_at: createdAt,
  sync_status: 'synced',
});

const members = {
  current: createMember({
    id: installmentBookFixtureIds.currentMember,
    memberNumber: installmentBookFixtureExpected.current.memberNumber,
    name: installmentBookFixtureExpected.current.memberName,
    joinDate: '2026-03-02',
  }),
  watchlist: createMember({
    id: installmentBookFixtureIds.watchlistMember,
    memberNumber: installmentBookFixtureExpected.watchlist.memberNumber,
    name: installmentBookFixtureExpected.watchlist.memberName,
    joinDate: '2026-02-02',
  }),
  delinquent: createMember({
    id: installmentBookFixtureIds.delinquentMember,
    memberNumber: installmentBookFixtureExpected.delinquent.memberNumber,
    name: installmentBookFixtureExpected.delinquent.memberName,
    joinDate: '2026-01-05',
  }),
};

const createLoanFixture = ({
  id,
  loanNumber,
  member,
  disbursedAt,
  dueDates,
  paymentDates,
}: FixtureLoanInput) => {
  const disbursementDate = toJakartaIso(disbursedAt);
  const paidPrincipalAmount = paymentDates.length * installmentPrincipalAmount;
  const paidInterestAmount = paymentDates.length * installmentInterestAmount;
  const loan: CooperativeLoan = {
    id,
    loan_number: loanNumber,
    member_id: member.id,
    member_number: member.member_number,
    member_name: member.name,
    principal_amount: principalAmount,
    interest_rate_per_month: 1,
    tenor_months: 6,
    interest_calculation_type: 'MONTHLY_RATE',
    billing_frequency: 'MONTHLY',
    installment_count: 6,
    loan_service_rate: 1,
    loan_service_amount: totalInterestAmount,
    admin_fee_rate: 0,
    admin_fee_amount: 0,
    mandatory_saving_rate: 0,
    mandatory_saving_amount: 0,
    deduction_method: 'NONE',
    net_disbursement_amount: principalAmount,
    total_interest_amount: totalInterestAmount,
    total_payable_amount: totalPayableAmount,
    outstanding_principal_amount: principalAmount - paidPrincipalAmount,
    outstanding_interest_amount: totalInterestAmount - paidInterestAmount,
    outstanding_penalty_amount: 0,
    status: 'DISBURSED',
    application_date: disbursementDate,
    approved_at: disbursementDate,
    approved_by_name: 'E2E Owner',
    disbursed_at: disbursementDate,
    officer_id: employee.id,
    officer_name: employee.name,
    officer_position: employee.position,
    area_id: area.id,
    area_name: area.name,
    area_code: area.code,
    collection_schedule_id: collectionSchedule.id,
    collection_weekday: 1,
    payment_method: 'TUNAI',
    notes: 'Fixture E2E Buku Angsuran',
    created_at: createdAt,
    updated_at: createdAt,
    sync_status: 'synced',
  };

  const installments: CooperativeLoanInstallment[] = dueDates.map((dueDate, index) => {
    const installmentNumber = index + 1;
    const paymentDate = paymentDates[index];
    const isPaid = Boolean(paymentDate);
    const isOverdueAtEndOfReportMonth = dueDate <= '2026-06-30';

    return {
      id: `${id}-installment-${installmentNumber}`,
      loan_id: loan.id,
      loan_number: loan.loan_number,
      member_id: member.id,
      member_number: member.member_number,
      member_name: member.name,
      installment_number: installmentNumber,
      due_date: toJakartaIso(dueDate),
      principal_amount: installmentPrincipalAmount,
      interest_amount: installmentInterestAmount,
      penalty_amount: 0,
      paid_principal_amount: isPaid ? installmentPrincipalAmount : 0,
      paid_interest_amount: isPaid ? installmentInterestAmount : 0,
      paid_penalty_amount: 0,
      status: isPaid ? 'PAID' : isOverdueAtEndOfReportMonth ? 'OVERDUE' : 'UNPAID',
      paid_at: paymentDate ? toJakartaIso(paymentDate) : undefined,
      collection_status: 'NONE',
      created_at: createdAt,
      updated_at: createdAt,
      sync_status: 'synced',
    };
  });

  const payments: CooperativeLoanPayment[] = paymentDates.map((paymentDate, index) => {
    const paymentNumber = index + 1;
    const timestamp = toJakartaIso(paymentDate);

    return {
      id: `${id}-payment-${paymentNumber}`,
      payment_number: `E2E-ANG-${loanNumber}-${String(paymentNumber).padStart(2, '0')}`,
      payment_type: 'PAYMENT',
      loan_id: loan.id,
      loan_number: loan.loan_number,
      installment_id: installments[index].id,
      member_id: member.id,
      member_number: member.member_number,
      member_name: member.name,
      amount: installmentTotalAmount,
      principal_amount: installmentPrincipalAmount,
      interest_amount: installmentInterestAmount,
      penalty_amount: 0,
      payment_date: timestamp,
      status: 'POSTED',
      payment_method: 'TUNAI',
      collector_id: employee.id,
      collector_name: employee.name,
      collector_position: employee.position,
      posted_at: timestamp,
      notes: 'Fixture E2E Buku Angsuran',
      created_at: timestamp,
      updated_at: timestamp,
      sync_status: 'synced',
    };
  });

  return { loan, installments, payments };
};

const currentLoanFixture = createLoanFixture({
  id: installmentBookFixtureIds.currentLoan,
  loanNumber: 'E2E-PJ-BA-001',
  member: members.current,
  disbursedAt: '2026-03-02',
  dueDates: [
    '2026-04-06',
    '2026-05-11',
    '2026-06-08',
    '2026-07-06',
    '2026-08-10',
    '2026-09-07',
  ],
  paymentDates: ['2026-06-01', '2026-06-08'],
});

const watchlistLoanFixture = createLoanFixture({
  id: installmentBookFixtureIds.watchlistLoan,
  loanNumber: 'E2E-PJ-BA-002',
  member: members.watchlist,
  disbursedAt: '2026-02-02',
  dueDates: [
    '2026-03-02',
    '2026-04-06',
    '2026-05-04',
    '2026-06-08',
    '2026-07-06',
    '2026-08-03',
  ],
  paymentDates: ['2026-06-15'],
});

const delinquentLoanFixture = createLoanFixture({
  id: installmentBookFixtureIds.delinquentLoan,
  loanNumber: 'E2E-PJ-BA-003',
  member: members.delinquent,
  disbursedAt: '2026-01-05',
  dueDates: [
    '2026-02-09',
    '2026-03-09',
    '2026-04-13',
    '2026-05-11',
    '2026-06-15',
    '2026-07-13',
  ],
  paymentDates: [],
});

export const installmentBookFixture: InstallmentBookFixture = {
  areas: [area],
  employees: [employee],
  employeeAreas: [employeeArea],
  employeeCollectionSchedules: [collectionSchedule],
  members: Object.values(members),
  loans: [
    currentLoanFixture.loan,
    watchlistLoanFixture.loan,
    delinquentLoanFixture.loan,
  ],
  installments: [
    ...currentLoanFixture.installments,
    ...watchlistLoanFixture.installments,
    ...delinquentLoanFixture.installments,
  ],
  payments: [
    ...currentLoanFixture.payments,
    ...watchlistLoanFixture.payments,
  ],
};

export async function seedInstallmentBookFixture(page: Page) {
  await page.evaluate(async (fixture) => {
    const recordsByStore = {
      cooperativeAreas: fixture.areas,
      employees: fixture.employees,
      employeeAreas: fixture.employeeAreas,
      employeeCollectionSchedules: fixture.employeeCollectionSchedules,
      cooperativeMembers: fixture.members,
      cooperativeLoans: fixture.loans,
      cooperativeLoanInstallments: fixture.installments,
      cooperativeLoanPayments: fixture.payments,
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
  }, installmentBookFixture);

  await page.reload();
}
