import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshStockMutationsFromPostgres } from '@/services/stockMutationReadService';

type StockStateRefreshResult = {
  products: Awaited<ReturnType<typeof refreshProductsFromPostgres>>;
  stockMutations: Awaited<ReturnType<typeof refreshStockMutationsFromPostgres>>;
};

let activeStockStateRefresh: Promise<StockStateRefreshResult> | null = null;

/**
 * A product snapshot contains all stock mutations committed before its version. Pull the ledger
 * first so a newly-seen mutation can update a stale replica, then let the authoritative product
 * snapshot reconcile the final balance. This order also prevents double application when both
 * realtime notifications arrive in the same batch.
 */
export const refreshStockStateFromPostgres = () => {
  if (activeStockStateRefresh) return activeStockStateRefresh;

  activeStockStateRefresh = (async () => {
    const stockMutations = await refreshStockMutationsFromPostgres();
    const products = await refreshProductsFromPostgres(stockMutations.productIds);
    return { products, stockMutations };
  })().finally(() => {
    activeStockStateRefresh = null;
  });

  return activeStockStateRefresh;
};
