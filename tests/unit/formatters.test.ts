import { describe, expect, test } from 'bun:test';
import {
  formatCurrencyInput,
  parseCurrencyInput,
} from '@/utils/formatters';

describe('currency input formatters', () => {
  test('formats thousands and decimal values using the Indonesian convention', () => {
    expect(formatCurrencyInput(1250000)).toBe('1.250.000');
    expect(formatCurrencyInput(1250000.5)).toBe('1.250.000,5');
    expect(formatCurrencyInput(undefined)).toBe('');
  });

  test('parses formatted values back to their numeric value', () => {
    expect(parseCurrencyInput('1.250.000')).toBe(1250000);
    expect(parseCurrencyInput('1.250.000,50')).toBe(1250000.5);
    expect(parseCurrencyInput('')).toBe(0);
  });
});
