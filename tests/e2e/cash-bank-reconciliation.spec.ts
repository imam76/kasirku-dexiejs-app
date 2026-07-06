import { expect, test, type Page } from '@playwright/test';
import type { CashBankReconciliation } from '../../src/types';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  cashBankReconciliationFixtureIds,
  fillStatementEndingBalance,
  getCashBankReconciliationFixtureState,
  seedCashBankReconciliationFixture,
  selectCashBankReconciliationCandidate,
} from './helpers/cashBankReconciliation';

async function openSeededReconciliationPage(page: Page) {
  await loginAsBootstrappedOwner(page);
  await seedCashBankReconciliationFixture(page);
  const initialState = await getCashBankReconciliationFixtureState(page);

  await page.goto('/finance/cash-bank-reconciliation');
  await expect(page.getByRole('heading', { name: 'Rekonsiliasi Cash & Bank' })).toBeVisible();

  return initialState;
}

async function waitForReconciliationStatus(
  page: Page,
  status: CashBankReconciliation['status'],
) {
  await expect.poll(async () => {
    const state = await getCashBankReconciliationFixtureState(page);
    return state.reconciliations.filter((record) => record.status === status).length;
  }).toBe(1);

  const state = await getCashBankReconciliationFixtureState(page);
  const reconciliation = state.reconciliations.find((record) => record.status === status);
  expect(reconciliation).toBeTruthy();

  return reconciliation as CashBankReconciliation;
}

async function createBalancedReconciliation(page: Page) {
  await fillStatementEndingBalance(page, 750_000);
  await selectCashBankReconciliationCandidate(page, cashBankReconciliationFixtureIds.income);
  await selectCashBankReconciliationCandidate(page, cashBankReconciliationFixtureIds.expense);
  await expect(page.getByTestId('cash-bank-reconciliation-selected-total')).toContainText('Rp 750.000');
  await expect(page.getByTestId('cash-bank-reconciliation-cleared-balance')).toContainText('Rp 750.000');
  await expect(page.getByTestId('cash-bank-reconciliation-difference')).toContainText('Rp 0');

  await page.getByTestId('cash-bank-reconciliation-save-button').click();

  return waitForReconciliationStatus(page, 'BALANCED');
}

test('rekonsiliasi cash & bank menyimpan status balanced dan melindungi kandidat aktif', async ({ page }) => {
  await openSeededReconciliationPage(page);

  const balancedReconciliation = await createBalancedReconciliation(page);
  await expect(page.getByTestId('cash-bank-reconciliation-history-table')).toContainText('Balanced');
  await expect(
    page.getByTestId(`cash-bank-reconciliation-candidate-row-${cashBankReconciliationFixtureIds.income}`),
  ).toHaveCount(0);
  await expect(
    page.getByTestId(`cash-bank-reconciliation-candidate-row-${cashBankReconciliationFixtureIds.expense}`),
  ).toHaveCount(0);

  const state = await getCashBankReconciliationFixtureState(page);
  expect(balancedReconciliation.difference_amount).toBe(0);
  expect(
    state.financeTransactions.find((record) => record.id === cashBankReconciliationFixtureIds.income)
      ?.cash_bank_reconciliation_id,
  ).toBe(balancedReconciliation.id);
  expect(
    state.financeTransactions.find((record) => record.id === cashBankReconciliationFixtureIds.expense)
      ?.cash_bank_reconciliation_id,
  ).toBe(balancedReconciliation.id);
});

test('rekonsiliasi cash & bank menyimpan selisih tanpa membuat adjustment', async ({ page }) => {
  const initialState = await openSeededReconciliationPage(page);

  await fillStatementEndingBalance(page, 950_000);
  await selectCashBankReconciliationCandidate(page, cashBankReconciliationFixtureIds.income);
  await expect(page.getByTestId('cash-bank-reconciliation-difference')).toContainText('Rp -50.000');
  await page.getByTestId('cash-bank-reconciliation-save-button').click();

  const differenceReconciliation = await waitForReconciliationStatus(page, 'DIFFERENCE');
  await expect(page.getByTestId('cash-bank-reconciliation-history-table')).toContainText('Selisih');

  const state = await getCashBankReconciliationFixtureState(page);
  expect(differenceReconciliation.difference_amount).toBe(-50_000);
  expect(state.financeTransactions).toHaveLength(initialState.financeTransactions.length);
  expect(state.journalEntries).toHaveLength(initialState.journalEntries.length);
});

test('void rekonsiliasi cash & bank membuka kembali transaksi kandidat', async ({ page }) => {
  await openSeededReconciliationPage(page);
  const balancedReconciliation = await createBalancedReconciliation(page);

  const balancedHistoryRow = page
    .locator('[data-testid^="cash-bank-reconciliation-history-row-"]')
    .filter({ hasText: 'Balanced' })
    .first();
  await expect(balancedHistoryRow).toBeVisible();
  await balancedHistoryRow.getByRole('button', { name: 'Void' }).click();

  const voidDialog = page.getByRole('dialog').filter({ hasText: 'Void Rekonsiliasi' });
  await expect(voidDialog).toBeVisible();
  await voidDialog.getByTestId('cash-bank-reconciliation-void-reason').fill('E2E buka ulang kandidat');
  await voidDialog.getByRole('button', { name: 'Void' }).click();

  await expect.poll(async () => {
    const state = await getCashBankReconciliationFixtureState(page);
    return state.reconciliations.find((record) => record.id === balancedReconciliation.id)?.status;
  }).toBe('VOIDED');
  await expect(
    page.getByTestId(`cash-bank-reconciliation-candidate-row-${cashBankReconciliationFixtureIds.income}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`cash-bank-reconciliation-candidate-row-${cashBankReconciliationFixtureIds.expense}`),
  ).toBeVisible();

  const state = await getCashBankReconciliationFixtureState(page);
  expect(
    state.financeTransactions.find((record) => record.id === cashBankReconciliationFixtureIds.income)
      ?.cash_bank_reconciliation_id,
  ).toBeUndefined();
  expect(
    state.financeTransactions.find((record) => record.id === cashBankReconciliationFixtureIds.expense)
      ?.cash_bank_reconciliation_id,
  ).toBeUndefined();
});
