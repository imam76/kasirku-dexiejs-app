import type { Tax, TaxCalculationMode, TaxFlow } from '@/types';

export interface CalculateTaxInput {
  amount: number;
  rate: number;
  calculationMode: TaxCalculationMode;
}

export interface TaxSnapshot {
  tax_id: string;
  tax_name: string;
  tax_code?: string;
  tax_rate: number;
  tax_calculation_mode: TaxCalculationMode;
  tax_flow: TaxFlow;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateTaxAmount = ({ amount, rate, calculationMode }: CalculateTaxInput) => {
  const safeAmount = Number(amount);
  const safeRate = Number(rate);

  if (!Number.isFinite(safeAmount) || !Number.isFinite(safeRate) || safeAmount <= 0 || safeRate <= 0) {
    return 0;
  }

  const taxAmount = calculationMode === 'INCLUSIVE'
    ? safeAmount - (safeAmount / (1 + safeRate / 100))
    : safeAmount * (safeRate / 100);

  return roundMoney(Math.max(0, Number.isFinite(taxAmount) ? taxAmount : 0));
};

export const createTaxSnapshot = (tax: Tax): TaxSnapshot => ({
  tax_id: tax.id,
  tax_name: tax.name,
  tax_code: tax.code,
  tax_rate: tax.rate,
  tax_calculation_mode: tax.calculation_mode,
  tax_flow: tax.tax_flow ?? 'ADDITIVE',
});
