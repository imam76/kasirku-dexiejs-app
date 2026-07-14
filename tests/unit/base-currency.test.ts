import { describe, expect, test } from 'bun:test';
import {
  buildBaseCurrencyForCode,
  buildCurrencyForCode,
} from '@/constants/currencies';
import { resolveBaseCurrencyFromState } from '@/services/baseCurrencyService';
import {
  buildDocumentCurrencySnapshot,
  isBaseCurrency,
} from '@/utils/documentCurrency';
import type { CurrencyRate } from '@/types';

const NOW = '2026-07-14T00:00:00.000Z';
const DOCUMENT_DATE = '2026-07-14';

describe('base currency helpers', () => {
  test('falls back to IDR and creates an IDR document currency snapshot', () => {
    const baseCurrency = resolveBaseCurrencyFromState([]);

    expect(baseCurrency.code).toBe('IDR');
    expect(baseCurrency.symbol).toBe('Rp');
    expect(baseCurrency.is_base).toBe(true);
    expect(baseCurrency.is_active).toBe(true);

    const snapshot = buildDocumentCurrencySnapshot(
      undefined,
      undefined,
      DOCUMENT_DATE,
      baseCurrency,
    );

    expect(snapshot.currency_code).toBe('IDR');
    expect(snapshot.currency_symbol).toBe('Rp');
    expect(snapshot.base_currency_code).toBe('IDR');
    expect(snapshot.exchange_rate).toBe(1);
    expect(snapshot.exchange_rate_source).toBe('SYSTEM');
    expect(isBaseCurrency(snapshot.currency_code, snapshot.base_currency_code)).toBe(true);
  });

  test('honors a non-IDR setup base currency for document snapshots', () => {
    const baseCurrency = resolveBaseCurrencyFromState([
      buildBaseCurrencyForCode('IDR', NOW),
      buildCurrencyForCode('USD', NOW),
      buildCurrencyForCode('SGD', NOW),
    ], { base_currency_code: 'usd' });

    expect(baseCurrency.code).toBe('USD');
    expect(baseCurrency.symbol).toBe('$');
    expect(baseCurrency.is_base).toBe(true);
    expect(baseCurrency.is_active).toBe(true);

    const baseSnapshot = buildDocumentCurrencySnapshot(
      baseCurrency,
      undefined,
      DOCUMENT_DATE,
      baseCurrency,
    );

    expect(baseSnapshot.currency_code).toBe('USD');
    expect(baseSnapshot.currency_symbol).toBe('$');
    expect(baseSnapshot.base_currency_code).toBe('USD');
    expect(baseSnapshot.exchange_rate).toBe(1);
    expect(baseSnapshot.exchange_rate_source).toBe('SYSTEM');
    expect(isBaseCurrency(baseSnapshot.currency_code, baseSnapshot.base_currency_code)).toBe(true);
    expect(isBaseCurrency('IDR', baseSnapshot.base_currency_code)).toBe(false);

    const sgdRate: CurrencyRate = {
      id: 'SGD-2026-07-14-MANUAL',
      currency_code: 'SGD',
      base_currency_code: 'USD',
      rate_date: DOCUMENT_DATE,
      source: 'MANUAL',
      unit_amount: 1,
      middle_rate: 0.75,
      created_at: NOW,
      updated_at: NOW,
    };
    const foreignSnapshot = buildDocumentCurrencySnapshot(
      buildCurrencyForCode('SGD', NOW),
      sgdRate,
      DOCUMENT_DATE,
      baseCurrency,
    );

    expect(foreignSnapshot.currency_code).toBe('SGD');
    expect(foreignSnapshot.currency_symbol).toBe('S$');
    expect(foreignSnapshot.base_currency_code).toBe('USD');
    expect(foreignSnapshot.exchange_rate).toBe(0.75);
    expect(foreignSnapshot.exchange_rate_source).toBe('MANUAL');
    expect(isBaseCurrency(foreignSnapshot.currency_code, foreignSnapshot.base_currency_code)).toBe(false);
  });
});
