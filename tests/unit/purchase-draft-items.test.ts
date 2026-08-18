import { describe, expect, it } from 'bun:test';
import { purchaseOrderConfig } from '@/configs/purchase-document/purchaseOrder.config';
import { purchaseReceiptConfig } from '@/configs/purchase-document/purchaseReceipt.config';
import { purchaseRequestConfig } from '@/configs/purchase-document/purchaseRequest.config';
import { requestForQuotationConfig } from '@/configs/purchase-document/requestForQuotation.config';
import type { Product } from '@/types';
import type { DocumentCurrencySnapshot } from '@/utils/documentCurrency';
import {
  buildPurchaseDraftItems,
  buildPurchaseDraftLines,
  resolveRestockQuantity,
} from '@/utils/purchaseDocuments/buildPurchaseDraftItems';

const createProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  name: 'Gula Pasir',
  purchase_unit: 'kg',
  selling_unit: 'kg',
  purchase_price: 14000,
  selling_price: 16000,
  stock: 2,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  created_at: '2026-08-18T00:00:00.000Z',
  updated_at: '2026-08-18T00:00:00.000Z',
  ...overrides,
});

const snapshot: DocumentCurrencySnapshot = {
  currency_code: 'IDR',
  currency_name: 'Rupiah',
  currency_symbol: 'Rp',
  base_currency_code: 'IDR',
  exchange_rate: 1,
  exchange_rate_source: 'SYSTEM',
  exchange_rate_basis: 'MID',
  exchange_rate_date: '2026-08-18',
};

describe('resolveRestockQuantity', () => {
  it('mengambil kekurangan sampai ambang stok menipis', () => {
    expect(resolveRestockQuantity(createProduct({ stock: 2, min_stock: 10 }))).toBe(8);
  });

  it('memakai ambang bawaan saat produk belum punya min_stock', () => {
    expect(resolveRestockQuantity(createProduct({ stock: 4 }))).toBe(6);
  });

  it('jatuh ke 1 untuk produk yang stoknya masih aman', () => {
    expect(resolveRestockQuantity(createProduct({ stock: 50, min_stock: 10 }))).toBe(1);
  });

  it('membulatkan ke atas untuk stok pecahan', () => {
    expect(resolveRestockQuantity(createProduct({ stock: 2.4, min_stock: 10 }))).toBe(8);
  });
});

describe('buildPurchaseDraftItems', () => {
  const product = createProduct({ stock: 2, min_stock: 10 });
  const productsById = new Map([[product.id, product]]);
  const lines = buildPurchaseDraftLines([product]);

  it('memakai qty restock dan harga beli produk', () => {
    const [item] = buildPurchaseDraftItems(lines, productsById, 'draft', purchaseOrderConfig, snapshot);

    expect(item.product_id).toBe('product-1');
    expect(item.quantity).toBe(8);
    expect(item.unit).toBe('kg');
    expect(item.price).toBe(14000);
    expect(item.currency_code).toBe('IDR');
  });

  it('tidak mengisi harga untuk dokumen tanpa pricing', () => {
    [purchaseRequestConfig, requestForQuotationConfig].forEach((config) => {
      const [item] = buildPurchaseDraftItems(lines, productsById, 'draft', config, snapshot);

      expect(item.quantity).toBe(8);
      expect(item.price).toBeUndefined();
    });
  });

  it('mengisi ordered dan received quantity untuk purchase receipt', () => {
    const [item] = buildPurchaseDraftItems(lines, productsById, 'draft', purchaseReceiptConfig, snapshot);

    expect(item.ordered_quantity).toBe(8);
    expect(item.received_quantity).toBe(8);
  });

  it('melewati produk yang sudah tidak ada', () => {
    const items = buildPurchaseDraftItems(
      [{ product_id: 'hilang', quantity: 3 }],
      productsById,
      'draft',
      purchaseOrderConfig,
      snapshot,
    );

    expect(items).toEqual([]);
  });
});
