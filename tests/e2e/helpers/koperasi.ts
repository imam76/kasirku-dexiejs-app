import { expect, type Locator, type Page } from '@playwright/test';
import { fillControlByTestId, selectAntdOptionByTestId, closeTopDialog } from './ui';

export interface DemoMemberInput {
  memberNumber: string;
  name: string;
  identityNumber: string;
  phone: string;
  address: string;
}

type SavingType = 'POKOK' | 'WAJIB' | 'SUKARELA';
type SavingTransactionType = 'DEPOSIT' | 'WITHDRAWAL';

const savingTypeLabels: Record<SavingType, string> = {
  POKOK: 'Pokok',
  WAJIB: 'Wajib',
  SUKARELA: 'Sukarela',
};

const savingTransactionTypeLabels: Record<SavingTransactionType, string> = {
  DEPOSIT: 'Setoran',
  WITHDRAWAL: 'Penarikan',
};

const formatCurrency = (value: number) => value.toLocaleString('id-ID');
const defaultArea = {
  code: 'E2E',
  name: 'Area Demo E2E',
};

async function ensureDefaultArea(page: Page) {
  await page.goto('/master-data/areas');
  await expect(page.getByText('Master Data Area')).toBeVisible();

  if (await page.getByText(defaultArea.name, { exact: true }).isVisible()) return;

  await page.getByTestId('area-add-button').click();
  await fillControlByTestId(page, 'area-name-input', defaultArea.name);
  await fillControlByTestId(page, 'area-code-input', defaultArea.code);
  await page.getByTestId('area-submit-button').click();
  await expect(page.getByText(defaultArea.name, { exact: true })).toBeVisible();
}

async function clickCooperativeReportTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(tab).toBeVisible();
  await tab.scrollIntoViewIfNeeded();
  await tab.click({ force: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export async function expectCooperativeOverview(page: Page) {
  await page.goto('/koperasi');

  await expect(page.getByRole('heading', { name: 'Koperasi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Anggota', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Simpanan', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pinjaman', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Angsuran', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Laporan', exact: true })).toBeVisible();
}

export async function createActiveMember(page: Page, member: DemoMemberInput) {
  await ensureDefaultArea(page);
  await page.goto('/koperasi/anggota');
  await expect(page.getByText('Master Anggota Koperasi')).toBeVisible();

  await page.getByTestId('koperasi-member-add-button').click();
  await fillControlByTestId(page, 'koperasi-member-number-input', member.memberNumber);
  await fillControlByTestId(page, 'koperasi-member-name-input', member.name);
  await fillControlByTestId(page, 'koperasi-member-identity-input', member.identityNumber);
  await fillControlByTestId(page, 'koperasi-member-phone-input', member.phone);
  await fillControlByTestId(page, 'koperasi-member-address-input', member.address);
  await selectAntdOptionByTestId(
    page,
    'koperasi-member-area-select',
    `${defaultArea.code} - ${defaultArea.name}`,
  );
  await page.getByTestId('koperasi-member-submit-button').click();

  const row = memberRow(page, member.memberNumber);
  await expect(row).toContainText(member.name);
  await expect(row).toContainText('Aktif');
}

export async function expectDuplicateActiveMemberRejected(page: Page, member: DemoMemberInput) {
  await ensureDefaultArea(page);
  await page.goto('/koperasi/anggota');
  await page.getByTestId('koperasi-member-add-button').click();
  await fillControlByTestId(page, 'koperasi-member-number-input', member.memberNumber);
  await fillControlByTestId(page, 'koperasi-member-name-input', `${member.name} Duplicate`);
  await fillControlByTestId(page, 'koperasi-member-identity-input', '3271010101019999');
  await selectAntdOptionByTestId(
    page,
    'koperasi-member-area-select',
    `${defaultArea.code} - ${defaultArea.name}`,
  );
  await page.getByTestId('koperasi-member-submit-button').click();

  await expect(page.getByText('Nomor anggota sudah dipakai anggota aktif lain.')).toBeVisible();
  await closeTopDialog(page);
}

export function memberRow(page: Page, memberNumber: string): Locator {
  return page.getByTestId(`koperasi-member-row-${memberNumber}`);
}

export async function recordSaving(page: Page, input: {
  member: DemoMemberInput;
  transactionType: SavingTransactionType;
  savingType: SavingType;
  amount: number;
  expectedError?: string;
}) {
  await page.goto('/koperasi/simpanan');
  await expect(page.getByText('Simpanan Anggota')).toBeVisible();

  await page.getByTestId('koperasi-saving-add-button').click();
  await selectAntdOptionByTestId(page, 'koperasi-saving-member-select', `${input.member.memberNumber} - ${input.member.name}`);
  await selectAntdOptionByTestId(
    page,
    'koperasi-saving-transaction-type-select',
    savingTransactionTypeLabels[input.transactionType],
  );
  await selectAntdOptionByTestId(page, 'koperasi-saving-type-select', savingTypeLabels[input.savingType]);
  await fillControlByTestId(page, 'koperasi-saving-amount-input', String(input.amount));
  await page.getByTestId('koperasi-saving-submit-button').click();

  if (input.expectedError) {
    await expect(page.getByText(input.expectedError)).toBeVisible();
    await closeTopDialog(page);
    return;
  }

  await expect(savingMutationRow(page, input.member.name, input.savingType, input.transactionType, input.amount)).toBeVisible();
}

export function savingMutationRow(
  page: Page,
  memberName: string,
  savingType: SavingType,
  transactionType: SavingTransactionType,
  amount: number,
) {
  return page
    .locator('tr')
    .filter({ hasText: memberName })
    .filter({ hasText: savingTypeLabels[savingType] })
    .filter({ hasText: savingTransactionTypeLabels[transactionType] })
    .filter({ hasText: `Rp ${formatCurrency(amount)}` })
    .first();
}

export async function expectSavingBalance(page: Page, member: DemoMemberInput, savingType: SavingType, amount: number) {
  await page.goto('/koperasi/simpanan');
  await page.getByRole('tab', { name: 'Saldo' }).click();

  const row = page.getByTestId(`koperasi-saving-balance-row-${member.memberNumber}-${savingType}`);
  await expect(row).toContainText(member.name);
  await expect(row).toContainText(savingTypeLabels[savingType]);
  await expect(row).toContainText(`Rp ${formatCurrency(amount)}`);
}

export async function createLoanApplication(page: Page, member: DemoMemberInput) {
  await page.goto('/koperasi/pinjaman');
  await expect(page.getByText('Pinjaman Anggota', { exact: true })).toBeVisible();

  await page.getByTestId('koperasi-loan-add-button').click();
  await selectAntdOptionByTestId(page, 'koperasi-loan-member-select', `${member.memberNumber} - ${member.name}`);
  await fillControlByTestId(page, 'koperasi-loan-principal-input', '3000000');
  await fillControlByTestId(page, 'koperasi-loan-interest-input', '1');
  await fillControlByTestId(page, 'koperasi-loan-tenor-input', '6');
  await page.getByTestId('koperasi-loan-submit-button').click();

  const row = loanRow(page, member.memberNumber);
  await expect(row).toContainText(member.name);
  await expect(row).toContainText('Submitted');
  await expect(row).toContainText('Rp 3.180.000');

  const rowText = await row.innerText();
  const loanNumber = rowText.match(/KSP-PJ-\d{8}-\d{4}/)?.[0];
  if (!loanNumber) {
    throw new Error(`Nomor pinjaman tidak ditemukan di row ${member.memberNumber}.`);
  }

  return loanNumber;
}

export async function approveLoan(page: Page, member: DemoMemberInput) {
  const row = loanRow(page, member.memberNumber);
  await row.getByRole('button', { name: 'Approve' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Approve pinjaman?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Approve' }).click();

  await expect(row).toContainText('Approved');
}

export async function disburseLoan(page: Page, member: DemoMemberInput) {
  const row = loanRow(page, member.memberNumber);
  await row.getByRole('button', { name: 'Cairkan' }).click();

  await expect(page.getByRole('dialog').filter({ hasText: 'Pencairan Pinjaman' })).toBeVisible();
  await page.getByTestId('koperasi-loan-disbursement-submit-button').click();

  await expect(row).toContainText('Disbursed');
}

export function loanRow(page: Page, memberNumber: string): Locator {
  return page.getByTestId(`koperasi-loan-row-${memberNumber}`).first();
}

export function migrationLoanRow(page: Page, memberNumber: string): Locator {
  return page.getByTestId(`koperasi-loan-migration-row-${memberNumber}`).first();
}

interface MigrateLoanInput {
  principal?: string;
  ratePercent?: string;
  tenor?: string;
  settledThrough?: string;
  /** ISO weekday (1=Mon..7=Sun) the officer collects on; disbursement date must land on it. */
  disbursementWeekday?: number;
  expectedOutstanding: string;
}

/**
 * Opens the "Migrasi Pinjaman" modal and fills the form (member, historical dates on the officer's
 * collection weekday, scheme fields, and "paid through installment N") WITHOUT submitting.
 * Shared by the happy-path {@link migrateLoan} and the invalid-input rejection test.
 */
async function openAndFillMigrationForm(
  page: Page,
  member: Pick<DemoMemberInput, 'memberNumber' | 'name'>,
  input: Pick<MigrateLoanInput, 'principal' | 'ratePercent' | 'tenor' | 'settledThrough' | 'disbursementWeekday'>,
) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const isoWeekday = (date: Date) => (date.getDay() === 0 ? 7 : date.getDay());
  const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  while (isoWeekday(past) !== (input.disbursementWeekday ?? 1)) {
    past.setDate(past.getDate() - 1);
  }
  const migrationDate = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())} 09:00:00`;

  await page.goto('/koperasi/migrasi-pinjaman');
  await expect(page.getByTestId('koperasi-loan-migration-add-button')).toBeVisible();

  await page.getByTestId('koperasi-loan-migration-add-button').click();
  await selectAntdOptionByTestId(page, 'koperasi-loan-migration-member-select', `${member.memberNumber} - ${member.name}`);
  // AntD DatePicker does not forward data-testid onto the <input>; target it by its label.
  const applicationInput = page.getByRole('textbox', { name: 'Tanggal Pengajuan' });
  await applicationInput.click();
  await applicationInput.fill(migrationDate);
  await page.keyboard.press('Enter');
  const disbursementInput = page.getByRole('textbox', { name: 'Tanggal Pencairan' });
  await disbursementInput.click();
  await disbursementInput.fill(migrationDate);
  await page.keyboard.press('Enter');
  await fillControlByTestId(page, 'koperasi-loan-migration-principal-input', input.principal ?? '1200000');
  await fillControlByTestId(page, 'koperasi-loan-migration-interest-input', input.ratePercent ?? '1');
  await fillControlByTestId(page, 'koperasi-loan-migration-tenor-input', input.tenor ?? '12');
  await fillControlByTestId(page, 'koperasi-loan-migration-settled-installment-input', input.settledThrough ?? '4');
}

/**
 * Records a migration loan (running loan carried over at cut-off) via the dedicated
 * "Migrasi Pinjaman" menu. Picks a past disbursement date on the officer's collection weekday
 * (historical fallback requires it) and before today, so the migration posts no journal.
 * Returns the loan number.
 */
export async function migrateLoan(page: Page, member: Pick<DemoMemberInput, 'memberNumber' | 'name'>, input: MigrateLoanInput) {
  await openAndFillMigrationForm(page, member, input);
  await page.getByTestId('koperasi-loan-migration-submit-button').click();

  const row = migrationLoanRow(page, member.memberNumber);
  await expect(row).toContainText(member.name);
  await expect(row).toContainText('Disbursed');
  await expect(row).toContainText(input.expectedOutstanding);

  const rowText = await row.innerText();
  const loanNumber = rowText.match(/KSP-PJ-\d{8}-\d{4}/)?.[0];
  if (!loanNumber) {
    throw new Error(`Nomor pinjaman migrasi tidak ditemukan di row ${member.memberNumber}.`);
  }

  return loanNumber;
}

/**
 * Attempts a migration with an out-of-range "paid through installment N" (greater than the tenor),
 * asserts the validation error blocks the submit, and confirms no partial migration loan is left
 * behind. Guards the migration-input hardening + atomic-flow acceptance criteria.
 */
export async function expectMigrationRejectedForInvalidSettledInstallment(
  page: Page,
  member: Pick<DemoMemberInput, 'memberNumber' | 'name'>,
  input: { tenor: string; settledThrough: string; disbursementWeekday?: number },
) {
  await openAndFillMigrationForm(page, member, {
    tenor: input.tenor,
    settledThrough: input.settledThrough,
    disbursementWeekday: input.disbursementWeekday,
  });
  await page.getByTestId('koperasi-loan-migration-submit-button').click();

  await expect(
    page.getByText(`Tidak boleh lebih dari ${input.tenor} angsuran.`),
  ).toBeVisible();

  await closeTopDialog(page);
  // Atomic: percobaan yang ditolak tidak meninggalkan pinjaman migrasi parsial.
  await expect(migrationLoanRow(page, member.memberNumber)).toBeHidden();
}

export async function expectInstallmentSchedule(page: Page, member: DemoMemberInput) {
  await page.goto('/koperasi/angsuran');
  await expect(page.getByText('Pembayaran Angsuran', { exact: true })).toBeVisible();

  for (const installmentNumber of [1, 2, 3, 4, 5, 6]) {
    const row = page.getByTestId(`koperasi-installment-row-${member.memberNumber}-${installmentNumber}`);
    await expect(row).toContainText(member.name);
    await expect(row).toContainText('Rp 530.000');
  }
}

export async function payFirstInstallment(page: Page, member: DemoMemberInput) {
  await page.goto('/koperasi/angsuran');
  const firstInstallmentRow = page.getByTestId(`koperasi-installment-row-${member.memberNumber}-1`);
  await firstInstallmentRow.getByRole('button', { name: 'Bayar' }).click();

  await expect(page.getByRole('dialog').filter({ hasText: 'Catat Pembayaran Angsuran' })).toBeVisible();
  await page.getByTestId('koperasi-installment-payment-submit-button').click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Catat Pembayaran Angsuran' })).toBeHidden();

  await page.getByRole('tab', { name: 'Riwayat Pembayaran', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'No. Pembayaran' })).toBeVisible();
  const paymentRow = page
    .locator('tr:visible')
    .filter({ hasText: 'KSP-ANG' })
    .filter({ hasText: member.name })
    .filter({ hasText: 'Rp 530.000' })
    .first();
  await expect(paymentRow).toContainText('Posted');
}

export async function payFlexibleInstallmentAmount(page: Page, member: DemoMemberInput, amount: number) {
  await page.goto('/koperasi/angsuran');
  const firstInstallmentRow = page.getByTestId(`koperasi-installment-row-${member.memberNumber}-1`);
  await firstInstallmentRow.getByRole('button', { name: 'Bayar' }).click();

  await expect(page.getByRole('dialog').filter({ hasText: 'Catat Pembayaran Angsuran' })).toBeVisible();
  await fillControlByTestId(page, 'koperasi-installment-payment-amount-input', String(amount));
  await expect(page.getByText('Preview Alokasi Pembayaran')).toBeVisible();
  await expect(page.getByText('#1 -')).toBeVisible();
  await expect(page.getByText('#2 -')).toBeVisible();
  await page.getByTestId('koperasi-installment-payment-submit-button').click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Catat Pembayaran Angsuran' })).toBeHidden();
}

export async function expectFlexibleInstallmentAllocation(page: Page, member: DemoMemberInput) {
  await page.goto('/koperasi/angsuran');

  await expect(page.getByTestId(`koperasi-installment-row-${member.memberNumber}-1`)).toBeHidden();
  const secondInstallmentRow = page.getByTestId(`koperasi-installment-row-${member.memberNumber}-2`);
  await expect(secondInstallmentRow).toContainText('Partial');
  await expect(secondInstallmentRow).toContainText('Rp 265.000');

  await page.getByRole('tab', { name: 'Riwayat Pembayaran', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'No. Pembayaran' })).toBeVisible();
  await expect(page.locator('tr:visible').filter({ hasText: member.name }).filter({ hasText: 'Rp 530.000' }).first())
    .toContainText('KSP-ANG-GRP');
  await expect(page.locator('tr:visible').filter({ hasText: member.name }).filter({ hasText: 'Rp 265.000' }).first())
    .toContainText('KSP-ANG-GRP');
}

export async function payRemainingInstallments(page: Page, member: DemoMemberInput) {
  await page.goto('/koperasi/angsuran');

  for (const installmentNumber of [2, 3, 4, 5, 6]) {
    const installmentRow = page.getByTestId(
      `koperasi-installment-row-${member.memberNumber}-${installmentNumber}`,
    );
    await installmentRow.getByRole('button', { name: 'Bayar' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Catat Pembayaran Angsuran' })).toBeVisible();
    await page.getByTestId('koperasi-installment-payment-submit-button').click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Catat Pembayaran Angsuran' })).toBeHidden();
  }
}

export async function expectCooperativeReportSummary(page: Page) {
  await page.goto('/koperasi/laporan');

  await expect(page.getByRole('heading', { name: 'Laporan Koperasi' })).toBeVisible();
  await expect(page.getByText('Anggota Aktif').first()).toBeVisible();
  await expect(page.getByText('Total Simpanan').first()).toBeVisible();
  await expect(page.getByText('Outstanding Pinjaman').first()).toBeVisible();
  await expect(page.getByText('Rekonsiliasi').first()).toBeVisible();

  await expect(page.getByRole('tab', { name: 'Neraca' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Perhitungan SHU' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Arus Kas' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Perubahan Ekuitas' })).toBeVisible();

  await clickCooperativeReportTab(page, 'Perhitungan SHU');
  await expect(page.getByTestId('koperasi-shu-report')).toContainText('SHU Periode');
  await expect(page.getByTestId('koperasi-shu-report')).toContainText('Rp 30.000');

  await clickCooperativeReportTab(page, 'Arus Kas');
  await expect(page.getByTestId('koperasi-cash-flow-operating-net')).toContainText('Rp -2.470.000');
  await expect(page.getByTestId('koperasi-cash-flow-financing-net')).toContainText('Rp 0');

  await clickCooperativeReportTab(page, 'Neraca');
  await expect(page.getByTestId('koperasi-balance-sheet-report')).toContainText('Rp 15.030.000');
  await expect(page.getByTestId('koperasi-balance-sheet-report')).toContainText('Rp 0');

  await clickCooperativeReportTab(page, 'Perubahan Ekuitas');
  await expect(page.getByTestId('koperasi-equity-change-report')).toContainText('SHU Periode');
  await expect(page.getByTestId('koperasi-equity-change-report')).toContainText('Rp 30.000');
}

export async function expectCooperativeFinancialReportsGated(page: Page) {
  await page.goto('/koperasi/laporan');

  await expect(page.getByRole('heading', { name: 'Laporan Koperasi' })).toBeVisible();
  await clickCooperativeReportTab(page, 'Perhitungan SHU');
  await expect(page.getByTestId('koperasi-financial-readiness-alert')).toBeVisible();
  await expect(page.getByTestId('koperasi-shu-report')).toBeHidden();
}
