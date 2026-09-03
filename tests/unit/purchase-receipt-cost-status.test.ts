import { describe, expect, test } from 'bun:test';
import { purchaseReceiptConfig } from '@/configs/purchase-document/purchaseReceipt.config';
import type { PurchaseDocument, PurchaseDocumentItem } from '@/types';
import { validatePurchaseDocument } from '@/utils/purchaseDocuments/validatePurchaseDocument';

const receipt: Partial<PurchaseDocument> = {
  type: 'PURCHASE_RECEIPT',
  document_date: '2026-09-03',
  supplier_name: 'PT Supplier Uji',
  cost_status: 'FINAL',
};

const createItem = (name: string, costStatus: PurchaseDocumentItem['cost_status']): PurchaseDocumentItem => ({
  id: `${name}-id`,
  document_id: 'receipt-id',
  product_id: `${name}-product-id`,
  product_name: name,
  quantity: 1,
  received_quantity: 1,
  unit: 'pcs',
  price: 10_000,
  cost_status: costStatus,
  created_at: '2026-09-03T00:00:00.000Z',
});

describe('purchase receipt cost status per produk', () => {
  test('menerbitkan receipt campuran ketika semua baris memiliki harga final atau sementara', () => {
    expect(() => validatePurchaseDocument({
      document: receipt,
      items: [
        createItem('Produk Final', 'FINAL'),
        createItem('Produk Estimasi', 'ESTIMATED'),
      ],
      config: purchaseReceiptConfig,
      mode: 'issue',
    })).not.toThrow();
  });

  test('menahan penerbitan saat hanya satu baris belum memiliki harga', () => {
    expect(() => validatePurchaseDocument({
      document: receipt,
      items: [
        createItem('Produk Final', 'FINAL'),
        createItem('Produk Belum Harga', 'PENDING'),
      ],
      config: purchaseReceiptConfig,
      mode: 'issue',
    })).toThrow('Harga Produk Belum Harga belum ada');
  });
});
