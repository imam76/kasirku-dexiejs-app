import type { StockOpnameItem } from '@/types';

export interface StockOpnameVarianceInput {
  system_quantity: number;
  counted_quantity?: number;
  cost_per_unit: number;
}

export interface StockOpnameVarianceResult {
  quantity_delta: number;
  variance_value: number;
}

export interface StockOpnameSummary {
  total_items: number;
  total_adjustment_in: number;
  total_adjustment_out: number;
  total_variance_value: number;
}

const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const calculateStockOpnameVariance = ({
  system_quantity,
  counted_quantity,
  cost_per_unit,
}: StockOpnameVarianceInput): StockOpnameVarianceResult => {
  if (counted_quantity === undefined || counted_quantity === null) {
    return {
      quantity_delta: 0,
      variance_value: 0,
    };
  }

  const quantityDelta = roundQuantity(toFiniteNumber(counted_quantity) - toFiniteNumber(system_quantity));

  return {
    quantity_delta: quantityDelta,
    variance_value: roundCurrency(quantityDelta * toFiniteNumber(cost_per_unit)),
  };
};

export const calculateStockOpnameSummary = (
  items: Array<Pick<StockOpnameItem, 'counted_quantity' | 'quantity_delta' | 'variance_value'>>,
): StockOpnameSummary => {
  return items.reduce<StockOpnameSummary>((summary, item) => {
    const quantityDelta = toFiniteNumber(item.quantity_delta);

    return {
      total_items: summary.total_items + 1,
      total_adjustment_in: roundQuantity(summary.total_adjustment_in + Math.max(quantityDelta, 0)),
      total_adjustment_out: roundQuantity(summary.total_adjustment_out + Math.max(-quantityDelta, 0)),
      total_variance_value: roundCurrency(summary.total_variance_value + toFiniteNumber(item.variance_value)),
    };
  }, {
    total_items: 0,
    total_adjustment_in: 0,
    total_adjustment_out: 0,
    total_variance_value: 0,
  });
};
