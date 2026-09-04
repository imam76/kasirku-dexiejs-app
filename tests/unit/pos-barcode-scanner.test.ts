import { beforeEach, describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { useTransactionStore } from '@/store/transactionStore';
import {
  appendKeyboardBarcodeCharacter,
  finishKeyboardBarcodeScan,
  isKeyboardBarcodeBufferActive,
  type KeyboardBarcodeBuffer,
} from '@/utils/keyboardBarcodeScanner';

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'scanner-product',
  name: 'Produk Scanner',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 5_000,
  selling_price: 10_000,
  stock: 20,
  sku: '8991234567890',
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
  ...overrides,
});

const bufferCode = (code: string, intervalMs = 10) => {
  let buffer: KeyboardBarcodeBuffer | null = null;
  let keyAt = 1_000;

  for (const character of code) {
    buffer = appendKeyboardBarcodeCharacter(buffer, character, keyAt);
    keyAt += intervalMs;
  }

  return { buffer, terminatorAt: keyAt };
};

describe('POS barcode scanner', () => {
  beforeEach(() => {
    useTransactionStore.setState({
      cart: [],
      activeDraftScope: undefined,
    });
  });

  test('recognizes rapid keyboard-wedge input terminated by Enter', () => {
    const { buffer, terminatorAt } = bufferCode('8991234567890');

    expect(finishKeyboardBarcodeScan(buffer, terminatorAt)).toBe('8991234567890');
  });

  test('does not treat slow manual typing as a hardware scan', () => {
    const { buffer, terminatorAt } = bufferCode('8991234567890', 250);

    expect(finishKeyboardBarcodeScan(buffer, terminatorAt)).toBeUndefined();
  });

  test('expires a partial scan so it cannot block a later POS shortcut', () => {
    const buffer = appendKeyboardBarcodeCharacter(null, '8', 1_000);

    expect(isKeyboardBarcodeBufferActive(buffer, 1_050)).toBe(true);
    expect(isKeyboardBarcodeBufferActive(buffer, 1_250)).toBe(false);
  });

  test('repeated scans add quantity to one cart line', () => {
    const product = buildProduct();
    const store = useTransactionStore.getState();

    expect(store.addToCart(product)).toEqual({ success: true });
    expect(useTransactionStore.getState().addToCart(product)).toEqual({ success: true });

    expect(useTransactionStore.getState().cart).toHaveLength(1);
    expect(useTransactionStore.getState().cart[0]).toMatchObject({
      product: { id: product.id },
      quantity: 2,
      unit: 'pcs',
    });
  });
});
