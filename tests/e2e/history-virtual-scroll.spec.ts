import { expect, test, type Page } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

// History is virtualized inside the app shell's scrolling content pane. Rows below the
// first screen must render once that pane scrolls, otherwise older days look missing.
const NOW = new Date('2026-10-15T10:00:00+07:00');
const MINUTE = 60_000;

const at = (isoJakarta: string, minutesBefore = 0) => (
  new Date(new Date(isoJakarta).getTime() - minutesBefore * MINUTE).toISOString()
);

const seedTransactions = async (page: Page, rows: Array<{ id: string; createdAt: string }>) => {
  await page.evaluate(async (input) => {
    const { db } = await import('/src/lib/db.ts');
    await db.transactions.bulkPut(input.map((row) => ({
      id: row.id,
      transaction_number: row.id.toUpperCase(),
      business_type: 'SALE' as const,
      total_amount: 10_000,
      payment_amount: 10_000,
      change_amount: 0,
      payment_method: 'TUNAI' as const,
      payment_mode: 'SINGLE' as const,
      status: 'COMPLETED' as const,
      receipt_status: 'printed' as const,
      created_at: row.createdAt,
      updated_at: row.createdAt,
      sync_status: 'synced' as const,
    })));
    localStorage.setItem('feedback_wave1_submitted', 'true');
    localStorage.setItem('feedback_wave2_submitted', 'true');
  }, rows);
};

const range = (prefix: string, count: number, isoJakarta: string) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${String(index).padStart(3, '0')}`,
  createdAt: at(isoJakarta, index),
}));

const scrollContentToBottom = async (page: Page) => {
  await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.ant-layout-content');
    content?.scrollTo({ top: content.scrollHeight });
  });
};

const historyRow = (page: Page, id: string) => page.getByTestId(`history-transaction-${id}`);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

for (const viewport of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`renders earlier days after scrolling the content pane (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await registerFirstOwner(page);
    await seedTransactions(page, [
      ...range('e2e-history-today', 12, '2026-10-15T09:00:00+07:00'),
      ...range('e2e-history-yesterday', 10, '2026-10-14T12:00:00+07:00'),
      ...range('e2e-history-older', 10, '2026-10-12T12:00:00+07:00'),
    ]);

    await page.goto('/history');
    await expect(historyRow(page, 'e2e-history-today-000')).toBeVisible();
    await expect(page.getByText('20 transaksi')).toBeAttached();

    await scrollContentToBottom(page);
    await expect(historyRow(page, 'e2e-history-yesterday-007')).toBeVisible();

    await page.getByRole('button', { name: 'Muat transaksi lebih lama' }).click();
    await expect(page.getByText('32 transaksi')).toBeAttached();
    await scrollContentToBottom(page);
    await expect(historyRow(page, 'e2e-history-older-009')).toBeVisible();
  });
}

test('filters a single business day by Jakarta day boundaries', async ({ page }) => {
  await registerFirstOwner(page);
  await seedTransactions(page, [
    { id: 'e2e-history-before-start', createdAt: at('2026-10-13T23:59:59.999+07:00') },
    { id: 'e2e-history-day-start', createdAt: at('2026-10-14T00:00:00.000+07:00') },
    { id: 'e2e-history-day-end', createdAt: at('2026-10-14T23:59:59.999+07:00') },
    { id: 'e2e-history-after-end', createdAt: at('2026-10-15T00:00:00.000+07:00') },
  ]);

  await page.goto('/history');
  await expect(historyRow(page, 'e2e-history-after-end')).toBeVisible();

  await page.locator('.ant-picker-range').click();
  const dropdown = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
  await dropdown.locator('td[title="2026-10-14"]').first().click();
  await dropdown.locator('td[title="2026-10-14"]').first().click();

  await expect(historyRow(page, 'e2e-history-day-start')).toBeVisible();
  await expect(historyRow(page, 'e2e-history-day-end')).toBeVisible();
  await expect(historyRow(page, 'e2e-history-before-start')).toHaveCount(0);
  await expect(historyRow(page, 'e2e-history-after-end')).toHaveCount(0);
});
