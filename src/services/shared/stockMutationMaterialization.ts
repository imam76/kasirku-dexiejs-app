import type { StockMutation } from '@/types';

type MaterializableStockMutation = Pick<
  StockMutation,
  'source_type' | 'source_quantity' | 'quantity_delta'
>;

/**
 * Mirrors the PostgreSQL stock materialization rule. Opening balances are snapshots; every
 * other stock event is an additive delta.
 */
export const getStockAfterMutation = (
  currentStock: number,
  mutation: MaterializableStockMutation,
) => (
  mutation.source_type === 'OPENING_BALANCE' && mutation.source_quantity != null
    ? mutation.source_quantity
    : currentStock + mutation.quantity_delta
);
