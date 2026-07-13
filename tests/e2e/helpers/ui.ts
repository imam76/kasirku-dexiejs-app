import { expect, type Page } from '@playwright/test';

export async function fillControlByTestId(page: Page, testId: string, value: string) {
  const control = page.getByTestId(testId);
  const input = control.locator('input');

  if (await input.count()) {
    await input.first().fill(value);
    return;
  }

  await control.fill(value);
}

export async function selectAntdOptionByTestId(page: Page, testId: string, optionName: string | RegExp) {
  await page.getByTestId(testId).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  const option = dropdown.locator('.ant-select-item-option').filter({ hasText: optionName }).first();
  await expect(option).toBeVisible();
  await option.click();
}

export async function setAntdDateByTestId(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId).locator('input').first();
  await input.click();
  await input.fill(value);
  await page.keyboard.press('Enter');
}

export async function closeTopDialog(page: Page) {
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Close', exact: true }).click({ force: true });
  }
  await expect(dialog).toBeHidden();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text)).toBeVisible();
}
