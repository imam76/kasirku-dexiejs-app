import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test.describe('DIAGNOSTIC: quantity=1 quick create', () => {
  test('service call with quantity 1', async ({ page }) => {
    await registerFirstOwner(page);

    const result = await page.evaluate(async () => {
      const { createPosQuickItem } = await import('/src/services/posQuickItemService.ts');
      const { db } = await import('/src/lib/db.ts');

      const res = await createPosQuickItem({
        name: 'Jiko Qty1 Diag',
        sellingPrice: 4333,
        purchasePrice: undefined as any,
        quantity: 1,
        purchaseUnit: 'pcs',
        sellingUnit: 'pcs',
      });

      const allProducts = await db.products.toArray();
      const purchaseItems = await db.purchaseDocumentItems.toArray();
      const purchaseDocs = await db.purchaseDocuments.toArray();

      return {
        resultStock: res.product.stock,
        allProducts: allProducts.map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
        purchaseDocsCount: purchaseDocs.length,
        purchaseItems: purchaseItems.map((i) => ({ q: i.quantity, rq: i.received_quantity, product_id: i.product_id })),
      };
    });

    console.log('QTY=1 SERVICE RESULT:', JSON.stringify(result, null, 2));
    expect(true).toBe(true);
  });

  test('UI flow with quantity 1 (default, untouched)', async ({ page }) => {
    page.on('console', (msg) => { if (msg.type() === 'error') console.log('[browser:error]', msg.text()); });
    await registerFirstOwner(page);
    await page.goto('/transaction');

    const openCashierButton = page.getByRole('button', { name: 'Buka Kasir' });
    const found = await openCashierButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (found) await openCashierButton.click();

    const search = page.getByPlaceholder('Cari produk (nama atau SKU)...');
    await expect(search).toBeVisible();
    await search.fill('Jiko UI Qty1');
    await search.press('Enter');

    await expect(page.getByText('Produk Belum Terdaftar')).toBeVisible({ timeout: 5000 });

    const sellingPriceInput = page.getByTestId('stock-product-selling-price');
    await sellingPriceInput.waitFor({ state: 'visible', timeout: 10000 });
    await sellingPriceInput.click();
    await sellingPriceInput.fill('4333');

    // Deliberately DO NOT touch the quantity field - leave it at its default "1",
    // exactly like the user's real repro.
    const qtyField = page.getByTestId('stock-product-purchase-quantity');
    const qtyValueBeforeSave = await qtyField.inputValue();
    console.log('QTY FIELD VALUE BEFORE SAVE:', qtyValueBeforeSave);

    const saveButton = page.getByRole('button', { name: /Simpan & Masukkan ke Keranjang/ });
    await saveButton.click();
    await page.waitForTimeout(2000);

    const stock = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const allProducts = await db.products.toArray();
      const purchaseItems = await db.purchaseDocumentItems.toArray();
      const purchaseDocs = await db.purchaseDocuments.toArray();
      const stockMutationQueue = await db.syncQueue.where('entity').equals('stockMutations').toArray();
      return {
        allProducts: allProducts.map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
        purchaseDocsCount: purchaseDocs.length,
        purchaseItems: purchaseItems.map((i) => ({ q: i.quantity, rq: i.received_quantity, product_id: i.product_id })),
        stockMutationQueueCount: stockMutationQueue.length,
        stockMutationPayloads: stockMutationQueue.map((m: any) => m.payload),
      };
    });

    console.log('QTY=1 UI RESULT:', JSON.stringify(stock, null, 2));
    expect(true).toBe(true);
  });
});
