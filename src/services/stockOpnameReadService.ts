import { db } from '@/lib/db';
import type { Product, StockOpname, StockOpnameItem, StockOpnameStatus } from '@/types';
import { calculateStockOpnameSummary } from '@/utils/stockOpname/calculateStockOpnameVariance';

export interface StockOpnameListFilters {
  status?: StockOpnameStatus | 'ALL';
  searchText?: string;
  startDate?: string;
  endDate?: string;
}

export interface StockOpnameCandidateFilters {
  searchText?: string;
  category?: string;
  productIds?: string[];
}

export interface StockOpnameDetailReadResult {
  opname: StockOpname;
  items: StockOpnameItem[];
}

const matchesDateRange = (value: string, startDate?: string, endDate?: string) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  if (startDate && time < new Date(startDate).getTime()) return false;
  if (endDate && time > new Date(endDate).getTime()) return false;
  return true;
};

export const listStockOpnames = async (
  filters: StockOpnameListFilters = {},
): Promise<StockOpname[]> => {
  const query = filters.searchText?.trim().toLowerCase();
  const opnames = await db.stockOpnames.toArray();

  return opnames
    .filter((opname) => {
      const matchesStatus = !filters.status || filters.status === 'ALL' || opname.status === filters.status;
      const matchesSearch = !query || [
        opname.opname_number,
        opname.notes,
        opname.warehouse_code,
        opname.warehouse_name,
        opname.created_by_name,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesDate = matchesDateRange(opname.counted_at, filters.startDate, filters.endDate);

      return matchesStatus && matchesSearch && matchesDate;
    })
    .sort((left, right) => right.counted_at.localeCompare(left.counted_at));
};

export const getStockOpnameDetail = async (
  id: string,
): Promise<StockOpnameDetailReadResult | null> => {
  const opname = await db.stockOpnames.get(id);
  if (!opname) return null;

  const items = await db.stockOpnameItems
    .where('opname_id')
    .equals(id)
    .toArray();

  items.sort((left, right) => left.product_name.localeCompare(right.product_name));

  return {
    opname,
    items,
  };
};

export const getStockOpnameCandidates = async (
  filters: StockOpnameCandidateFilters = {},
): Promise<Product[]> => {
  const query = filters.searchText?.trim().toLowerCase();
  const category = filters.category?.trim();
  const selectedProductIds = filters.productIds?.length ? new Set(filters.productIds) : null;
  const products = await db.products.orderBy('name').toArray();

  return products.filter((product) => {
    const matchesProductIds = !selectedProductIds || selectedProductIds.has(product.id);
    const matchesCategory = !category || product.category === category;
    const matchesSearch = !query || [
      product.name,
      product.sku,
      product.category,
    ].some((value) => value?.toLowerCase().includes(query));

    return matchesProductIds && matchesCategory && matchesSearch;
  });
};

export const getStockOpnameSummary = async (id: string) => {
  const items = await db.stockOpnameItems.where('opname_id').equals(id).toArray();
  return calculateStockOpnameSummary(items);
};
