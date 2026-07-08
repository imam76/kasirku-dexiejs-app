import type { Page } from '@playwright/test';
import type {
  CooperativeMember,
  CooperativeSavingTransaction,
  Employee,
} from '../../../src/types';

export const savingMovementFixtureIds = {
  employeeA: 'e2e-saving-movement-employee-a',
  employeeB: 'e2e-saving-movement-employee-b',
  cashAccountA: 'e2e-saving-movement-cash-a',
  memberA: 'e2e-saving-movement-member-a',
  memberB: 'e2e-saving-movement-member-b',
  memberReversed: 'e2e-saving-movement-member-reversed',
} as const;

export const savingMovementFixtureExpected = {
  incomingTotal: 430_000,
  incomingJune3Total: 350_000,
  incomingEmployeeATotal: 350_000,
  incomingVoluntaryTotal: 250_000,
  outgoingTotal: 70_000,
  outgoingJune5Total: 70_000,
} as const;

const createdAt = '2026-01-01T08:00:00.000+07:00';
const iso = (date: string, hour = '09') => `${date}T${hour}:00:00.000+07:00`;

const employeeA: Employee = {
  id: savingMovementFixtureIds.employeeA,
  name: 'Petugas Tabungan A',
  position: 'PDL A',
  field_cash_account_id: savingMovementFixtureIds.cashAccountA,
  field_cash_account_code: 'KAS-A',
  field_cash_account_name: 'Kas Petugas A',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const employeeB: Employee = {
  id: savingMovementFixtureIds.employeeB,
  name: 'Petugas Tabungan B',
  position: 'PDL B',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const createMember = (
  id: string,
  memberNumber: string,
  name: string,
  officer: Employee,
): CooperativeMember => ({
  id,
  member_number: memberNumber,
  name,
  officer_id: officer.id,
  officer_name: officer.name,
  officer_position: officer.position,
  join_date: iso('2026-01-01'),
  status: 'ACTIVE',
  created_at: createdAt,
  updated_at: createdAt,
  sync_status: 'synced',
});

const members = {
  a: createMember(
    savingMovementFixtureIds.memberA,
    'SM-001',
    'Anggota Tabungan A',
    employeeA,
  ),
  b: createMember(
    savingMovementFixtureIds.memberB,
    'SM-002',
    'Anggota Tabungan B',
    employeeB,
  ),
  reversed: createMember(
    savingMovementFixtureIds.memberReversed,
    'SM-099',
    'Anggota Reversal',
    employeeA,
  ),
};

const createSavingTransaction = ({
  id,
  member,
  savingType,
  transactionType,
  amount,
  transactionDate,
  status = 'POSTED',
  withdrawalSource,
  cashAccountId,
  reversalOfTransactionId,
  reversalTransactionId,
  notes,
}: {
  id: string;
  member: CooperativeMember;
  savingType: CooperativeSavingTransaction['saving_type'];
  transactionType: CooperativeSavingTransaction['transaction_type'];
  amount: number;
  transactionDate: string;
  status?: CooperativeSavingTransaction['status'];
  withdrawalSource?: CooperativeSavingTransaction['withdrawal_source'];
  cashAccountId?: string;
  reversalOfTransactionId?: string;
  reversalTransactionId?: string;
  notes?: string;
}): CooperativeSavingTransaction => ({
  id,
  member_id: member.id,
  member_number: member.member_number,
  member_name: member.name,
  saving_type: savingType,
  transaction_type: transactionType,
  withdrawal_source: withdrawalSource,
  amount,
  transaction_date: transactionDate,
  status,
  cash_account_id: cashAccountId,
  cash_account_code: cashAccountId === savingMovementFixtureIds.cashAccountA ? 'KAS-A' : undefined,
  cash_account_name: cashAccountId === savingMovementFixtureIds.cashAccountA ? 'Kas Petugas A' : undefined,
  payment_method: 'TUNAI',
  reversal_of_transaction_id: reversalOfTransactionId,
  reversal_transaction_id: reversalTransactionId,
  notes,
  created_at: transactionDate,
  updated_at: transactionDate,
  sync_status: 'synced',
});

const transactions: CooperativeSavingTransaction[] = [
  createSavingTransaction({
    id: 'e2e-saving-in-pokok-a',
    member: members.a,
    savingType: 'POKOK',
    transactionType: 'DEPOSIT',
    amount: 100_000,
    transactionDate: iso('2026-06-03', '09'),
    notes: 'Setoran pokok anggota A',
  }),
  createSavingTransaction({
    id: 'e2e-saving-in-sukarela-b-cash-a',
    member: members.b,
    savingType: 'SUKARELA',
    transactionType: 'DEPOSIT',
    amount: 250_000,
    transactionDate: iso('2026-06-03', '10'),
    cashAccountId: savingMovementFixtureIds.cashAccountA,
    notes: 'Setoran sukarela lewat kas petugas A',
  }),
  createSavingTransaction({
    id: 'e2e-saving-in-wajib-b',
    member: members.b,
    savingType: 'WAJIB',
    transactionType: 'DEPOSIT',
    amount: 80_000,
    transactionDate: iso('2026-06-04', '09'),
    notes: 'Setoran wajib anggota B',
  }),
  createSavingTransaction({
    id: 'e2e-saving-out-a',
    member: members.a,
    savingType: 'SUKARELA',
    transactionType: 'WITHDRAWAL',
    withdrawalSource: 'SAVING',
    amount: 40_000,
    transactionDate: iso('2026-06-05', '11'),
    notes: 'Penarikan sukarela anggota A',
  }),
  createSavingTransaction({
    id: 'e2e-saving-out-interest-b',
    member: members.b,
    savingType: 'SUKARELA',
    transactionType: 'WITHDRAWAL',
    withdrawalSource: 'INTEREST',
    amount: 30_000,
    transactionDate: iso('2026-06-05', '12'),
    notes: 'Penarikan jasa anggota B',
  }),
  createSavingTransaction({
    id: 'e2e-saving-outside-month',
    member: members.a,
    savingType: 'SUKARELA',
    transactionType: 'DEPOSIT',
    amount: 999_000,
    transactionDate: iso('2026-07-01', '09'),
    notes: 'Setoran luar bulan',
  }),
  createSavingTransaction({
    id: 'e2e-saving-reversed-original',
    member: members.reversed,
    savingType: 'SUKARELA',
    transactionType: 'DEPOSIT',
    amount: 500_000,
    transactionDate: iso('2026-06-06', '09'),
    status: 'REVERSED',
    reversalTransactionId: 'e2e-saving-reversal-transaction',
    notes: 'Setoran yang sudah direversal',
  }),
  createSavingTransaction({
    id: 'e2e-saving-reversal-transaction',
    member: members.reversed,
    savingType: 'SUKARELA',
    transactionType: 'REVERSAL',
    amount: 500_000,
    transactionDate: iso('2026-06-06', '10'),
    reversalOfTransactionId: 'e2e-saving-reversed-original',
    notes: 'Reversal setoran',
  }),
  createSavingTransaction({
    id: 'e2e-saving-reversed-withdrawal',
    member: members.reversed,
    savingType: 'SUKARELA',
    transactionType: 'WITHDRAWAL',
    withdrawalSource: 'SAVING',
    amount: 90_000,
    transactionDate: iso('2026-06-07', '10'),
    status: 'REVERSED',
    reversalTransactionId: 'e2e-saving-withdrawal-reversal',
    notes: 'Penarikan yang sudah direversal',
  }),
  createSavingTransaction({
    id: 'e2e-saving-withdrawal-reversal',
    member: members.reversed,
    savingType: 'SUKARELA',
    transactionType: 'REVERSAL',
    withdrawalSource: 'SAVING',
    amount: 90_000,
    transactionDate: iso('2026-06-07', '11'),
    reversalOfTransactionId: 'e2e-saving-reversed-withdrawal',
    notes: 'Reversal penarikan',
  }),
];

const fixture = {
  employees: [employeeA, employeeB],
  cooperativeMembers: Object.values(members),
  cooperativeSavingTransactions: transactions,
};

export async function seedSavingMovementReportFixture(page: Page) {
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
