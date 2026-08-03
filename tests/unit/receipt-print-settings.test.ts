import { describe, expect, test } from 'bun:test';
import type { TransactionReceiptInput } from '@/types';
import { buildReceiptPayload } from '@/utils/printer/receiptService';
import {
  getReceiptPaperCharacterWidth,
  getStoredReceiptPaperSize,
  isReceiptPaperSize,
} from '@/utils/printer/receiptPaperSize';

const transaction: TransactionReceiptInput = {
  id: 'transaction-print-test',
  transaction_number: 'TRX-001',
  total_amount: 10_000,
  payment_amount: 10_000,
  change_amount: 0,
  payment_method: 'TUNAI',
  created_at: '2026-08-03T00:00:00.000Z',
  items: [{
    id: 'transaction-item-print-test',
    transaction_id: 'transaction-print-test',
    product_id: 'product-print-test',
    product_name: 'Produk Uji',
    price: 10_000,
    purchase_price: 8_000,
    quantity: 1,
    unit: 'pcs',
    subtotal: 10_000,
    profit: 2_000,
    created_at: '2026-08-03T00:00:00.000Z',
  }],
};

describe('receipt print settings', () => {
  test('uses 58 mm as the default and maps both supported widths', () => {
    expect(getStoredReceiptPaperSize()).toBe('58mm');
    expect(getReceiptPaperCharacterWidth('58mm')).toBe(32);
    expect(getReceiptPaperCharacterWidth('80mm')).toBe(48);
    expect(isReceiptPaperSize('76mm')).toBe(false);
  });

  test('builds the receipt with the configured company title and paper size', () => {
    const receipt = buildReceiptPayload(transaction, '  Toko Makmur  ', '80mm');

    expect(receipt.merchantName).toBe('Toko Makmur');
    expect(receipt.paperSize).toBe('80mm');
  });

  test('falls back to the application name when the company name is empty', () => {
    expect(buildReceiptPayload(transaction, '   ').merchantName).toBe('Frayukti');
  });
});
