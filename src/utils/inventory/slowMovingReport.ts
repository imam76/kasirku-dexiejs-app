import dayjs from '@/lib/dayjs';
import { DEFAULT_CONVERSIONS } from '@/constants/units';
import type { Product, SalesDocument, SalesDocumentItem, SalesReturn, SalesReturnItem, Transaction, TransactionItem, UnitConversion } from '@/types';
import type { DashboardDateRange } from '@/utils/dashboardDateRanges';
import { resolveProductUnitRatio } from '@/utils/productUnits';
import { isTransactionActive, isTransactionSale } from '@/utils/transactions';

export type SlowMovingStatus = 'NO_SALES' | 'NO_NET_SALES' | 'SLOW' | 'MOVING' | 'OUT_OF_STOCK' | 'REVIEW';
export interface SlowMovingRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock: number;
  sold: number;
  returned: number;
  netSold: number;
  dailyAverage: number;
  saleCount: number;
  lastSale?: string;
  isNew: boolean;
  needsReview: boolean;
}
export interface SlowMovingInput {
  products: Product[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  invoices: SalesDocument[];
  invoiceItems: SalesDocumentItem[];
  returns: SalesReturn[];
  returnItems: SalesReturnItem[];
  conversions?: UnitConversion[];
  range: DashboardDateRange;
}

export const getSlowMovingBounds = ({ startDate, endDate }: DashboardDateRange) => {
  const parseDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid report date');
    const date = dayjs.tz(value);
    if (!date.isValid() || date.format('YYYY-MM-DD') !== value) throw new Error('Invalid report date');
    return date;
  };
  const start = parseDate(startDate).startOf('day');
  const end = parseDate(endDate).endOf('day');
  if (start.isAfter(end)) throw new Error('Invalid report date range');
  return { start: start.toISOString(), end: end.toISOString(), days: end.startOf('day').diff(start, 'day') + 1 };
};

const round = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1_000_000) / 1_000_000;
const isInvoice = (invoice: SalesDocument) => invoice.type === 'SALES_INVOICE' && invoice.status === 'ISSUED';

/** Include unsold products; never infer the product universe from sale lines. */
export const buildSlowMovingRows = (input: SlowMovingInput): SlowMovingRow[] => {
  const { start, end, days } = getSlowMovingBounds(input.range);
  const inPeriod = (date: string) => {
    const timestamp = new Date(date).getTime();
    return timestamp >= Date.parse(start) && timestamp <= Date.parse(end);
  };
  const documentInPeriod = (date: string) => date >= input.range.startDate && date <= input.range.endDate;
  const products = new Map(input.products.filter((product) => product.product_type !== 'RAW_MATERIAL'
    && !(Date.parse(product.created_at) > Date.parse(end))).map((product) => [product.id, product]));
  const rows = new Map([...products.values()].map((product): [string, SlowMovingRow] => [product.id, {
    id: product.id, name: product.name, sku: product.sku ?? '', category: product.category ?? '',
    unit: product.purchase_unit, stock: product.stock, sold: 0, returned: 0, netSold: 0,
    dailyAverage: 0, saleCount: 0, isNew: inPeriod(product.created_at), needsReview: !Number.isFinite(product.stock),
  }]));
  const saleIds = new Map<string, Set<string>>();
  const transactions = new Map(input.transactions.filter((item) => isTransactionActive(item) && isTransactionSale(item)).map((item) => [item.id, item]));
  const invoices = new Map(input.invoices.filter(isInvoice).map((item) => [item.id, item]));
  const posItems = new Map(input.transactionItems.map((item) => [item.id, item]));
  const returns = new Map(input.returns.filter((item) => item.status === 'ISSUED' && documentInPeriod(item.document_date)
    && (item.source_type === 'POS_TRANSACTION' ? transactions.has(item.source_id)
      : item.source_type === 'SALES_INVOICE' && invoices.has(item.source_id))).map((item) => [item.id, item]));

  const quantityInStockUnit = (product: Product, quantity: number, unit: string, snapshot?: TransactionItem): number | null => {
    if (!Number.isFinite(quantity) || quantity < 0) return null;
    let fromUnit = unit;
    let amount = quantity;
    if (snapshot?.base_unit && snapshot.conversion_value !== undefined) {
      if (!Number.isFinite(snapshot.conversion_value) || snapshot.conversion_value <= 0) return null;
      fromUnit = snapshot.base_unit;
      amount *= snapshot.conversion_value;
    }
    const ratio = resolveProductUnitRatio(product, fromUnit, product.purchase_unit, {
      globalConversions: input.conversions ?? DEFAULT_CONVERSIONS,
    });
    if (ratio.status !== 'resolved' || !Number.isFinite(amount * ratio.ratio)) return null;
    return amount * ratio.ratio;
  };
  const add = (productId: string, quantity: number, unit: string, kind: 'sold' | 'returned', date: string, saleId: string, snapshot?: TransactionItem) => {
    const row = rows.get(productId);
    const product = products.get(productId);
    if (!row || !product) return;
    const amount = quantityInStockUnit(product, quantity, unit, snapshot);
    if (amount === null) { row.needsReview = true; return; }
    row[kind] += amount;
    if (kind === 'sold' && amount > 0) {
      const ids = saleIds.get(productId) ?? new Set<string>();
      ids.add(saleId);
      saleIds.set(productId, ids);
      if (!row.lastSale || Date.parse(date) > Date.parse(row.lastSale)) row.lastSale = date;
    }
  };
  for (const item of input.transactionItems) {
    const transaction = transactions.get(item.transaction_id);
    if (transaction && inPeriod(transaction.created_at)) {
      add(item.product_id, item.quantity, item.unit_id || item.unit, 'sold', transaction.created_at, `pos:${transaction.id}`, item);
    }
  }
  for (const item of input.invoiceItems) {
    const invoice = invoices.get(item.document_id);
    if (invoice && documentInPeriod(invoice.document_date)) {
      add(item.product_id, item.quantity, item.unit, 'sold', dayjs.tz(invoice.document_date).toISOString(), `invoice:${invoice.id}`);
    }
  }
  for (const item of input.returnItems) {
    const returned = returns.get(item.return_id);
    if (!returned) continue;
    // A POS return inherits the original conversion even if the product mapping has changed.
    const source = returned.source_type === 'POS_TRANSACTION' ? posItems.get(item.source_item_id) : undefined;
    const snapshot = source?.product_id === item.product_id && source.transaction_id === returned.source_id
      && (source.unit_id || source.unit) === item.unit ? source : undefined;
    add(item.product_id, item.quantity, item.unit, 'returned', returned.document_date, '', snapshot);
  }
  return [...rows.values()].map((row) => {
    const netSold = round(row.sold - row.returned);
    return { ...row, sold: round(row.sold), returned: round(row.returned), netSold,
      dailyAverage: round(netSold / days), saleCount: saleIds.get(row.id)?.size ?? 0 };
  });
};

export const classifySlowMovingProduct = (row: SlowMovingRow, threshold: number): SlowMovingStatus => {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Invalid slow-moving threshold');
  if (row.needsReview) return 'REVIEW';
  if (row.stock <= 0) return 'OUT_OF_STOCK';
  if (row.sold === 0 && row.returned === 0) return 'NO_SALES';
  if (row.netSold <= 0) return 'NO_NET_SALES';
  return row.netSold <= threshold ? 'SLOW' : 'MOVING';
};

export const SLOW_MOVING_ATTENTION_STATUSES: SlowMovingStatus[] = ['NO_SALES', 'NO_NET_SALES', 'SLOW', 'REVIEW'];
export interface SlowMovingFilters {
  search: string;
  category?: string;
  stock: 'IN_STOCK' | 'ALL';
  status: 'ATTENTION' | 'ALL' | SlowMovingStatus;
}
export const DEFAULT_SLOW_MOVING_FILTERS: SlowMovingFilters = { search: '', stock: 'IN_STOCK', status: 'ATTENTION' };
export const filterSlowMovingRows = (rows: SlowMovingRow[], filters: SlowMovingFilters, threshold: number) => {
  const search = filters.search.trim().toLocaleLowerCase();
  return rows.map((row) => ({ ...row, status: classifySlowMovingProduct(row, threshold) })).filter((row) =>
    (!search || `${row.name} ${row.sku}`.toLocaleLowerCase().includes(search))
    && (!filters.category || row.category === filters.category)
    && (filters.stock === 'ALL' || row.stock > 0 || !Number.isFinite(row.stock))
    && (filters.status === 'ALL' || (filters.status === 'ATTENTION'
      ? SLOW_MOVING_ATTENTION_STATUSES.includes(row.status) : row.status === filters.status)))
    .sort((a, b) => a.netSold - b.netSold || b.stock - a.stock || a.name.localeCompare(b.name));
};
