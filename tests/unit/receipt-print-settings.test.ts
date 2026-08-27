import { describe, expect, test } from 'bun:test';
import type { TransactionReceiptInput } from '@/types';
import { buildReceiptPayload } from '@/utils/printer/receiptService';
import { buildEscPosReceipt } from '@/utils/printer/usbSerialPrinter';
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

const containsByteSequence = (data: Uint8Array, sequence: number[]): boolean => {
  for (let index = 0; index <= data.length - sequence.length; index += 1) {
    if (sequence.every((value, offset) => data[index + offset] === value)) return true;
  }

  return false;
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

  test('prints 80 mm items as a four-column table', () => {
    const receipt = buildReceiptPayload(transaction, 'Toko Makmur', '80mm');
    const printedLines = new TextDecoder().decode(buildEscPosReceipt(receipt)).split('\n');
    const expectedHeader = [
      'Nama Produk'.padEnd(13),
      'Harga'.padStart(12),
      'Jumlah'.padStart(7),
      'Subtotal'.padStart(13),
    ].join(' ');
    const expectedItem = [
      'Produk Uji'.padEnd(13),
      'Rp 10.000'.padStart(12),
      '1 pcs'.padStart(7),
      'Rp 10.000'.padStart(13),
    ].join(' ');

    expect(printedLines).toContain(expectedHeader);
    expect(printedLines).toContain(expectedItem);
    expect(expectedHeader.length).toBe(48);
    expect(expectedItem.length).toBe(48);
  });

  test('keeps the existing multi-line item layout for 58 mm paper', () => {
    const receipt = buildReceiptPayload(transaction, 'Toko Makmur', '58mm');
    const printedLines = new TextDecoder().decode(buildEscPosReceipt(receipt)).split('\n');

    expect(printedLines.some((line) => line.startsWith('  1 pcs'))).toBe(true);
    expect(printedLines.some((line) => line.startsWith('  Subtotal'))).toBe(true);
    expect(printedLines.some((line) => line.startsWith('1 pcs x'))).toBe(false);
  });

  test('stores the transaction number in an ESC/POS QR code', () => {
    const receipt = buildReceiptPayload(transaction, 'Toko Makmur', '80mm');
    const printedData = buildEscPosReceipt(receipt);
    const transactionNumber = new TextEncoder().encode(transaction.transaction_number);
    const storeLength = transactionNumber.length + 3;
    const qrStoreCommand = [
      0x1d,
      0x28,
      0x6b,
      storeLength & 0xff,
      (storeLength >> 8) & 0xff,
      0x31,
      0x50,
      0x30,
      ...transactionNumber,
    ];

    expect(containsByteSequence(printedData, qrStoreCommand)).toBe(true);
    expect(new TextDecoder().decode(printedData)).toContain('Scan nomor transaksi');
  });

  test('kicks the cash drawer only for a new cash payment receipt', () => {
    const cashReceipt = buildReceiptPayload(
      transaction,
      'Toko Makmur',
      '58mm',
      { openCashDrawer: true },
    );
    const nonCashReceipt = buildReceiptPayload(
      { ...transaction, payment_method: 'NON_TUNAI' },
      'Toko Makmur',
      '58mm',
      { openCashDrawer: true },
    );
    const reprintedReceipt = buildReceiptPayload(transaction, 'Toko Makmur', '58mm');
    const drawerKickPin2 = [0x1b, 0x70, 0x00, 0x19, 0xfa];
    const drawerKickPin5 = [0x1b, 0x70, 0x01, 0x19, 0xfa];

    const cashReceiptBytes = buildEscPosReceipt(cashReceipt);
    expect(containsByteSequence(cashReceiptBytes, drawerKickPin2)).toBe(true);
    expect(containsByteSequence(cashReceiptBytes, drawerKickPin5)).toBe(true);

    const nonCashReceiptBytes = buildEscPosReceipt(nonCashReceipt);
    expect(containsByteSequence(nonCashReceiptBytes, drawerKickPin2)).toBe(false);
    expect(containsByteSequence(nonCashReceiptBytes, drawerKickPin5)).toBe(false);

    const reprintedReceiptBytes = buildEscPosReceipt(reprintedReceipt);
    expect(containsByteSequence(reprintedReceiptBytes, drawerKickPin2)).toBe(false);
    expect(containsByteSequence(reprintedReceiptBytes, drawerKickPin5)).toBe(false);
  });
});
