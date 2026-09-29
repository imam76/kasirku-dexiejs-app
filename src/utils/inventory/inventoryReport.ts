import type { InventoryLot, Product } from '@/types';
import { getStockStatus, type StockStatus } from '@/utils/stockStatus';

export type InventoryValuationStatus = 'FIFO' | 'ESTIMATED' | 'MASTER_PRICE' | 'UNVALUED' | 'EMPTY';

export interface InventoryReportRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  productType: Product['product_type'];
  unit: string;
  stock: number;
  stockStatus: StockStatus;
  lotQuantity: number;
  discrepancy: boolean;
  unitCost: number | null;
  value: number | null;
  valuationStatus: InventoryValuationStatus;
}

export interface InventoryReportFilters {
  search: string;
  category?: string;
  stock: 'ALL' | 'IN_STOCK' | 'LOW' | 'OUT';
  productType?: Product['product_type'];
}

export const DEFAULT_INVENTORY_REPORT_FILTERS: InventoryReportFilters = { search: '', stock: 'IN_STOCK' };
const TOLERANCE = 0.000001;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundQuantity = (value: number) => Math.round(value * 1e6) / 1e6;

export interface InventoryLotSummary {
  quantity: number;
  value: number;
  estimated: boolean;
  unpriced: boolean;
  invalidBalance: boolean;
}

// Use the same ledger-derived balance and effective cost as consumeFifoLots.
// quantity_remaining can lag behind consumptions merged from another device.
export const accumulateInventoryLot = (summaries: Map<string, InventoryLotSummary>, lot: InventoryLot) => {
  if (lot.fifo_excluded) return;
  const remaining = lot.fifo_remaining;
  if (remaining === 0) return;
  const summary = summaries.get(lot.product_id) ?? {
    quantity: 0, value: 0, estimated: false, unpriced: false, invalidBalance: false,
  };
  summaries.set(lot.product_id, summary);
  if (remaining === undefined || !Number.isFinite(remaining) || remaining < 0) {
    summary.invalidBalance = true;
    return;
  }
  summary.quantity += remaining;
  if (lot.cost_status === 'PENDING' || !Number.isFinite(lot.cost_per_unit) || lot.cost_per_unit < 0) {
    summary.unpriced = true;
  } else {
    summary.value += roundMoney(remaining * lot.cost_per_unit);
    summary.estimated ||= lot.cost_status === 'ESTIMATED';
  }
};

export const buildInventoryReportRows = (
  products: Product[],
  summaries: Map<string, InventoryLotSummary>,
): InventoryReportRow[] => products.map((product) => {
  const lots = summaries.get(product.id);
  const stock = product.stock;
  const lotQuantity = roundQuantity(lots?.quantity ?? 0);
  const discrepancy = Boolean(lots?.invalidBalance) || !Number.isFinite(stock)
    || Math.abs(stock - lotQuantity) > TOLERANCE;
  let value: number | null = null;
  let valuationStatus: InventoryValuationStatus = 'UNVALUED';

  if (stock === 0) {
    value = 0;
    valuationStatus = 'EMPTY';
  } else if (Number.isFinite(stock) && stock > 0 && !lots?.invalidBalance && !lots?.unpriced) {
    if (!discrepancy && lots) {
      value = roundMoney(lots.value);
      valuationStatus = lots.estimated ? 'ESTIMATED' : 'FIFO';
    } else if (Number.isFinite(product.purchase_price) && product.purchase_price > 0) {
      // Legacy/mismatched stock has no reliable FIFO valuation. Make the
      // whole product an explicit estimate instead of inventing missing lots.
      value = roundMoney(stock * product.purchase_price);
      valuationStatus = 'MASTER_PRICE';
    }
  }

  return {
    id: product.id, name: product.name, sku: product.sku ?? '',
    category: product.category || 'non_consumable', productType: product.product_type,
    unit: product.purchase_unit, stock, stockStatus: getStockStatus(product),
    lotQuantity, discrepancy, value, valuationStatus,
    unitCost: value !== null && stock > 0 ? value / stock : null,
  };
}).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

export const filterInventoryReportRows = (rows: InventoryReportRow[], filters: InventoryReportFilters) => {
  const search = filters.search.trim().toLocaleLowerCase();
  return rows.filter((row) => (
    (!search || `${row.name}\n${row.sku}`.toLocaleLowerCase().includes(search))
    && (!filters.category || row.category === filters.category)
    && (!filters.productType || row.productType === filters.productType)
    && (filters.stock !== 'IN_STOCK' || row.stock > 0)
    && (filters.stock !== 'LOW' || row.stockStatus === 'menipis')
    && (filters.stock !== 'OUT' || row.stock <= 0)
  ));
};

export const summarizeInventoryReport = (rows: InventoryReportRow[]) => {
  const quantities = new Map<string, number>();
  let value = 0;
  let estimatedCount = 0;
  let unvaluedCount = 0;
  let discrepancyCount = 0;
  for (const row of rows) {
    if (Number.isFinite(row.stock)) quantities.set(row.unit, (quantities.get(row.unit) ?? 0) + row.stock);
    value += row.value ?? 0;
    if (row.valuationStatus === 'ESTIMATED' || row.valuationStatus === 'MASTER_PRICE') estimatedCount++;
    if (row.value === null) unvaluedCount++;
    if (row.discrepancy) discrepancyCount++;
  }
  return {
    productCount: rows.length, value: roundMoney(value), estimatedCount, unvaluedCount, discrepancyCount,
    quantities: [...quantities].sort(([a], [b]) => a.localeCompare(b))
      .map(([unit, quantity]) => ({ unit, quantity: roundQuantity(quantity) })),
  };
};
