import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test('posting purchase receipt/invoice memperbarui harga beli master produk', async ({ page }) => {
  await registerFirstOwner(page);
  await page.evaluate(() => {
    localStorage.setItem('feedback_wave1_submitted', 'true');
    localStorage.setItem('feedback_wave2_submitted', 'true');
  });

  const result = await page.evaluate(async () => {
    const [{ db }, {
      convertPurchaseDocument,
      createPurchaseDocument,
      issuePurchaseDocument,
      updatePurchaseDocument,
    }] = await Promise.all([
      import('/src/lib/db.ts'),
      import('/src/services/purchaseDocumentService.ts'),
    ]);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const putProduct = (id: string, purchasePrice: number, extra: Record<string, unknown> = {}) => db.products.put({
      id,
      name: `Produk ${id}`,
      category: 'consumable',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: purchasePrice,
      selling_price: 20_000,
      stock: 0,
      sku: id.toUpperCase(),
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
      sellable_units: ['pcs'],
      created_at: now,
      updated_at: now,
      sync_status: 'synced',
      ...extra,
    });

    const line = (productId: string, price: number, unit = 'pcs') => ({
      id: crypto.randomUUID(),
      document_id: '',
      product_id: productId,
      product_name: `Produk ${productId}`,
      quantity: 2,
      received_quantity: 2,
      unit,
      price,
      created_at: now,
    });

    await putProduct('e2e-pp-final-receipt', 10_000);
    await putProduct('e2e-pp-estimated-receipt', 10_000);
    await putProduct('e2e-pp-invoice-box', 1_000, {
      sellable_units: ['pcs', 'box'],
      unit_mappings: [{ from_quantity: 1, from_unit: 'box', to_quantity: 12, to_unit: 'pcs' }],
    });
    await putProduct('e2e-pp-receipt-invoice', 10_000);

    const finalReceipt = await createPurchaseDocument({
      document: { type: 'PURCHASE_RECEIPT', status: 'DRAFT', document_date: today, supplier_name: 'Supplier E2E', cost_status: 'FINAL' },
      items: [line('e2e-pp-final-receipt', 12_500)],
    });
    await issuePurchaseDocument(finalReceipt.document.id);

    const estimatedReceipt = await createPurchaseDocument({
      document: { type: 'PURCHASE_RECEIPT', status: 'DRAFT', document_date: today, supplier_name: 'Supplier E2E', cost_status: 'ESTIMATED' },
      items: [line('e2e-pp-estimated-receipt', 15_000)],
    });
    await issuePurchaseDocument(estimatedReceipt.document.id);

    const directInvoice = await createPurchaseDocument({
      document: { type: 'PURCHASE_INVOICE', status: 'DRAFT', document_date: today, supplier_name: 'Supplier E2E' },
      items: [line('e2e-pp-invoice-box', 18_000, 'box')],
    });
    await issuePurchaseDocument(directInvoice.document.id);

    const sourceReceipt = await createPurchaseDocument({
      document: { type: 'PURCHASE_RECEIPT', status: 'DRAFT', document_date: today, supplier_name: 'Supplier E2E', cost_status: 'FINAL' },
      items: [line('e2e-pp-receipt-invoice', 11_000)],
    });
    await issuePurchaseDocument(sourceReceipt.document.id);
    const priceAfterReceipt = (await db.products.get('e2e-pp-receipt-invoice'))?.purchase_price;
    const converted = await convertPurchaseDocument(sourceReceipt.document.id, 'PURCHASE_INVOICE');
    await updatePurchaseDocument(converted.document.id, {
      document: {},
      items: converted.items.map((item) => ({ ...item, price: 11_500, foreign_price: undefined })),
    });
    await issuePurchaseDocument(converted.document.id);

    const products = await db.products.bulkGet([
      'e2e-pp-final-receipt',
      'e2e-pp-estimated-receipt',
      'e2e-pp-invoice-box',
      'e2e-pp-receipt-invoice',
    ]);
    const receiptInvoiceQueueItems = await db.syncQueue
      .filter((item) => item.entity === 'products' && item.entity_id === 'e2e-pp-receipt-invoice')
      .toArray();

    return {
      finalReceipt: products[0]?.purchase_price,
      estimatedReceipt: products[1]?.purchase_price,
      invoiceBox: products[2]?.purchase_price,
      priceAfterReceipt,
      receiptInvoice: products[3]?.purchase_price,
      receiptInvoiceStock: products[3]?.stock,
      receiptInvoiceQueuedPrices: receiptInvoiceQueueItems.map((item) => (
        (item.payload as { purchase_price?: number }).purchase_price
      )),
    };
  });

  expect(result.finalReceipt).toBe(12_500);
  // Harga estimasi tidak boleh menimpa master.
  expect(result.estimatedReceipt).toBe(10_000);
  // 18.000 per box, 1 box = 12 pcs, master disimpan per purchase_unit (pcs).
  expect(result.invoiceBox).toBe(1_500);
  expect(result.priceAfterReceipt).toBe(11_000);
  expect(result.receiptInvoice).toBe(11_500);
  // Invoice dari receipt tidak menambah stok lagi, tapi harga tetap ikut dan tersinkron.
  expect(result.receiptInvoiceStock).toBe(2);
  expect(result.receiptInvoiceQueuedPrices).toContain(11_500);
});
