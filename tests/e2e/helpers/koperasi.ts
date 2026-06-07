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
  await page.goto('/koperasi/anggota');
  await expect(page.getByText('Master Anggota Koperasi')).toBeVisible();

  await page.getByTestId('koperasi-member-add-button').click();
  await fillControlByTestId(page, 'koperasi-member-number-input', member.memberNumber);
  await fillControlByTestId(page, 'koperasi-member-name-input', member.name);
  await fillControlByTestId(page, 'koperasi-member-identity-input', member.identityNumber);
  await fillControlByTestId(page, 'koperasi-member-phone-input', member.phone);
  await fillControlByTestId(page, 'koperasi-member-address-input', member.address);
  await page.getByTestId('koperasi-member-submit-button').click();

  const row = memberRow(page, member.memberNumber);
  await expect(row).toContainText(member.name);
  await expect(row).toContainText('Aktif');
}

export async function expectDuplicateActiveMemberRejected(page: Page, member: DemoMemberInput) {
  await page.goto('/koperasi/anggota');
  await page.getByTestId('koperasi-member-add-button').click();
  await fillControlByTestId(page, 'koperasi-member-number-input', member.memberNumber);
  await fillControlByTestId(page, 'koperasi-member-name-input', `${member.name} Duplicate`);
  await fillControlByTestId(page, 'koperasi-member-identity-input', '3271010101019999');
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

export async function expectCooperativeReportSummary(page: Page) {
  await page.goto('/koperasi/laporan');

  await expect(page.getByRole('heading', { name: 'Laporan Koperasi' })).toBeVisible();
  await expect(page.getByText('Anggota Aktif').first()).toBeVisible();
  await expect(page.getByText('Total Simpanan').first()).toBeVisible();
  await expect(page.getByText('Outstanding Pinjaman').first()).toBeVisible();
  await expect(page.getByText('Rekonsiliasi').first()).toBeVisible();
}
