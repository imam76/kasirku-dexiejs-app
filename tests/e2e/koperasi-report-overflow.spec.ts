import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

const expectNoDocumentOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => (
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
  ))).toBeLessThanOrEqual(1);
};

const expectContainedHorizontalScroll = async (page: Page, viewport: Locator) => {
  await expect(viewport).toBeVisible();

  const metrics = await viewport.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      overflowX: window.getComputedStyle(element).overflowX,
      right: bounds.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.overflowX).toBe('auto');
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  await expectNoDocumentOverflow(page);
};

test('tabel laporan koperasi menahan overflow di viewport masing-masing', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await loginAsBootstrappedOwner(page);

  const reportRoutes = [
    {
      path: '/koperasi/laporan-drop-harian',
      testId: 'koperasi-daily-drop-report-viewport',
    },
    {
      path: '/koperasi/laporan-drop-mingguan',
      testId: 'koperasi-weekly-drop-report-viewport',
    },
    {
      path: '/koperasi/laporan-perkembangan-resort',
      testId: 'koperasi-resort-development-report-viewport',
    },
  ];

  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 800 });

    await page.goto('/koperasi/laporan#installments');
    const installmentViewport = page.getByTestId('koperasi-report-installments-schedule-viewport');
    await expect(installmentViewport).toBeVisible();
    await expectContainedHorizontalScroll(
      page,
      installmentViewport.locator('.ant-table-content'),
    );

    for (const reportRoute of reportRoutes) {
      await page.goto(reportRoute.path);
      await expectContainedHorizontalScroll(
        page,
        page.getByTestId(reportRoute.testId),
      );
    }
  }
});
