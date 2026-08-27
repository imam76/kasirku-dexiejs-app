import { describe, expect, test } from 'bun:test';
import { formatLineItemQuantitySummary } from '../../src/utils/salesDocuments/lineItemSummaryFormat';

const baseSnapshot = {
  currency_code: 'IDR',
  currency_name: 'Rupiah',
  currency_symbol: 'Rp',
  base_currency_code: 'IDR',
  exchange_rate: 1,
  exchange_rate_source: 'SYSTEM' as const,
  exchange_rate_basis: 'DOCUMENT_DATE' as const,
  exchange_rate_date: '2026-08-18',
};

describe('formatLineItemQuantitySummary', () => {
  test('sales delivery menampilkan delivered/ordered, bukan subtotal', () => {
    const summary = formatLineItemQuantitySummary(
      { quantity: 5, unit: 'pcs', ordered_quantity: 5, delivered_quantity: 3, subtotal: 0 },
      { isSalesDelivery: true, hasPricing: false },
      baseSnapshot,
    );
    expect(summary).toBe('3/5 pcs');
  });

  test('dokumen berpricing menampilkan qty unit -> subtotal', () => {
    const summary = formatLineItemQuantitySummary(
      { quantity: 3, unit: 'pcs', subtotal: 45_000 },
      { isSalesDelivery: false, hasPricing: true },
      baseSnapshot,
    );
    expect(summary).toContain('3 pcs');
    expect(summary).toContain('→');
    expect(summary).toContain('45.000');
  });

  test('dokumen tanpa pricing hanya menampilkan qty unit', () => {
    const summary = formatLineItemQuantitySummary(
      { quantity: 2, unit: 'box', subtotal: 0 },
      { isSalesDelivery: false, hasPricing: false },
      baseSnapshot,
    );
    expect(summary).toBe('2 box');
  });
});
