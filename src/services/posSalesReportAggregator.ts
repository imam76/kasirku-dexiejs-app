import dayjs from '@/lib/dayjs';
import type { PosTransactionPayment, Product, Transaction, TransactionItem } from '@/types';
import {
  aggregateSoldItems,
  createEmptySoldItemSummary,
  resolveTransactionItemUnit,
  type SoldItemSummary,
} from '@/utils/salesUnits';
import { filterActiveTransactions } from '@/utils/transactions';
import {
  getTransactionPaymentsOrLegacyFallback,
  groupPosPaymentsByTransaction,
} from '@/utils/posSplitPayment';
import { matchesPosPaymentFilters, type PosPaymentModeFilter } from '@/utils/posPaymentMethodFilter';

export interface PosTransactionWithPayments extends Transaction {
  payments: PosTransactionPayment[];
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  category: string;
  totalQuantity: string;
  totalRevenue: number;
  totalProfit: number;
  margin: number;
  units: Record<string, number>;
}

export interface DailySalesBucket {
  date: string;
  label: string;
  totalRevenue: number;
  transactionCount: number;
}

export interface PosSalesReportData {
  transactions: PosTransactionWithPayments[];
  totalRevenue: number;
  totalDiscount: number;
  totalProfit: number;
  soldItems: SoldItemSummary;
  averageTransaction: number;
  topProducts: TopProduct[];
  dailySalesBuckets: DailySalesBucket[];
}

export interface BuildPosSalesReportInput {
  transactions: Transaction[];
  payments?: PosTransactionPayment[];
  items?: TransactionItem[];
  products?: Product[];
  startDate?: string;
  endDate?: string;
  paymentMethodCode?: string;
  paymentMode?: PosPaymentModeFilter;
  categories?: string[];
  topProductsLimit?: number;
}

type TopProductAggregation = Omit<TopProduct, 'totalQuantity' | 'margin'>;

const createDateRange = (startDate?: string, endDate?: string, transactions: Transaction[] = []) => {
  const firstTransactionDate = transactions
    .map((transaction) => dayjs(transaction.created_at).tz())
    .filter((date) => date.isValid())
    .sort((left, right) => left.valueOf() - right.valueOf())[0];
  const lastTransactionDate = transactions
    .map((transaction) => dayjs(transaction.created_at).tz())
    .filter((date) => date.isValid())
    .sort((left, right) => right.valueOf() - left.valueOf())[0];
  const start = startDate
    ? dayjs.tz(startDate).startOf('day')
    : (firstTransactionDate ?? dayjs.tz()).startOf('day');
  const end = endDate
    ? dayjs.tz(endDate).startOf('day')
    : (lastTransactionDate ?? start).startOf('day');

  return end.isBefore(start) ? [start, start] as const : [start, end] as const;
};

export const buildDailySalesBuckets = (
  transactions: Transaction[],
  startDate?: string,
  endDate?: string,
): DailySalesBucket[] => {
  const activeTransactions = filterActiveTransactions(transactions);
  const [start, end] = createDateRange(startDate, endDate, activeTransactions);
  const buckets = new Map<string, DailySalesBucket>();

  for (let cursor = start; !cursor.isAfter(end, 'day'); cursor = cursor.add(1, 'day')) {
    const date = cursor.format('YYYY-MM-DD');
    buckets.set(date, {
      date,
      label: cursor.format('D MMM'),
      totalRevenue: 0,
      transactionCount: 0,
    });
  }

  activeTransactions.forEach((transaction) => {
    const date = dayjs(transaction.created_at).tz().format('YYYY-MM-DD');
    const bucket = buckets.get(date);
    if (!bucket) return;

    bucket.totalRevenue += Number(transaction.total_amount || 0);
    bucket.transactionCount += 1;
  });

  return Array.from(buckets.values());
};

export const buildPosSalesReportData = ({
  transactions: rawTransactions,
  payments = [],
  items = [],
  products = [],
  startDate,
  endDate,
  paymentMethodCode,
  paymentMode = 'SEMUA',
  categories,
  topProductsLimit = 10,
}: BuildPosSalesReportInput): PosSalesReportData => {
  const activeTransactions = filterActiveTransactions(rawTransactions);
  const paymentsByTransaction = groupPosPaymentsByTransaction(payments);
  let transactions: PosTransactionWithPayments[] = activeTransactions.map((transaction) => ({
    ...transaction,
    payments: getTransactionPaymentsOrLegacyFallback(transaction, paymentsByTransaction.get(transaction.id)),
  }));
  transactions = transactions.filter((transaction) => (
    matchesPosPaymentFilters(transaction, paymentMethodCode, paymentMode)
  ));

  const totalRevenue = transactions.reduce((sum, transaction) => sum + Number(transaction.total_amount || 0), 0);
  const totalDiscount = transactions.reduce((sum, transaction) => sum + Number(transaction.discount_amount ?? 0), 0);
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const relevantItems = items.filter((item) => transactionIds.has(item.transaction_id));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const totalProfit = relevantItems.reduce((sum, item) => sum + Number(item.profit || 0), 0);
  const soldItems = transactionIds.size > 0
    ? aggregateSoldItems(relevantItems, productMap)
    : createEmptySoldItemSummary();
  const categorySet = categories && categories.length > 0 ? new Set(categories) : undefined;
  const aggregation = relevantItems.reduce((acc, item) => {
    const product = productMap.get(item.product_id);
    const category = product?.category || 'non_consumable';

    if (categorySet && !categorySet.has(category)) {
      return acc;
    }

    const unit = resolveTransactionItemUnit(item, product);
    const current = acc[item.product_id] ?? {
      product_id: item.product_id,
      product_name: item.product_name,
      category,
      totalRevenue: 0,
      totalProfit: 0,
      units: {},
    };

    current.totalRevenue += Number(item.subtotal || 0);
    current.totalProfit += Number(item.profit || 0);
    current.units[unit] = (current.units[unit] || 0) + Number(item.quantity || 0);
    acc[item.product_id] = current;

    return acc;
  }, {} as Record<string, TopProductAggregation>);
  const topProducts = Object.values(aggregation)
    .map((product) => {
      const totalQuantity = Object.entries(product.units)
        .map(([unit, quantity]) => `${quantity.toLocaleString('id-ID')} ${unit}`)
        .join(', ');

      return {
        ...product,
        totalQuantity,
        margin: product.totalRevenue > 0 ? (product.totalProfit / product.totalRevenue) * 100 : 0,
      };
    })
    .sort((left, right) => {
      const revenueDiff = right.totalRevenue - left.totalRevenue;
      if (revenueDiff !== 0) return revenueDiff;
      return left.product_name.localeCompare(right.product_name);
    })
    .slice(0, topProductsLimit);

  return {
    transactions,
    totalRevenue,
    totalDiscount,
    totalProfit,
    soldItems,
    averageTransaction: transactions.length > 0 ? totalRevenue / transactions.length : 0,
    topProducts,
    dailySalesBuckets: buildDailySalesBuckets(transactions, startDate, endDate),
  };
};
