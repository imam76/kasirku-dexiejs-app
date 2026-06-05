import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { Transaction, StockPurchase, FinanceTransaction, TransactionItem, Product } from '@/types';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { PRODUCT_CATEGORIES } from '@/constants/categories';
import {
  aggregateSoldItems,
  createEmptySoldItemSummary,
  resolveTransactionItemUnit,
} from '@/utils/salesUnits';
import { filterActiveTransactions } from '@/utils/transactions';
import type { SoldItemSummary } from '@/utils/salesUnits';

interface PosSalesReportData {
  transactions: Transaction[];
  totalRevenue: number;
  totalDiscount: number;
  totalProfit: number;
  soldItems: SoldItemSummary;
  averageTransaction: number;
  topProducts: TopProduct[];
}

interface TopProduct {
  product_id: string;
  product_name: string;
  category: string;
  totalQuantity: string; // Combined quantity with units, e.g., "2.5 kg"
  totalRevenue: number;
  totalProfit: number;
  margin: number;
  // Detail per unit for breakdown if needed
  units: Record<string, number>;
}

type TopProductAggregation = Omit<TopProduct, 'totalQuantity' | 'margin'>;

interface PurchaseReportData {
  purchases: StockPurchase[];
  totalCost: number;
  totalQuantity: number;
  uniqueProducts: number;
  averageCostPerUnit: number;
}

interface ExpenseReportData {
  transactions: FinanceTransaction[];
  totalExpense: number;
  breakdown: Record<string, number>;
}

export interface TransactionDetailReportRow {
  key: string;
  transaction_id: string;
  transaction_number: string;
  transaction_created_at: string;
  payment_method: Transaction['payment_method'];
  transaction_total: number;
  transaction_profit: number;
  transaction_margin: number;
  product_id: string;
  product_name: string;
  category: string;
  sku?: string;
  quantity: number;
  unit: string;
  selling_price: number;
  purchase_price: number;
  subtotal_before_discount: number;
  discount_amount: number;
  subtotal: number;
  cost_total: number;
  profit: number;
  margin: number;
}

interface TransactionDetailReportData {
  rows: TransactionDetailReportRow[];
  transactions: Transaction[];
  totalRevenue: number;
  totalDiscount: number;
  totalCost: number;
  totalProfit: number;
  totalItems: number;
  uniqueProducts: number;
  averageMargin: number;
}

export const usePosSalesReport = (
  startDate?: string,
  endDate?: string,
  paymentMethod?: string,
  categories?: string[]
) => {
  return useQuery({
    queryKey: ['posSalesReport', startDate, endDate, paymentMethod, categories],
    queryFn: async (): Promise<PosSalesReportData> => {
      let collection = db.transactions.orderBy('created_at').reverse();

      if (startDate && endDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.transactions
          .where('created_at')
          .between(startISO, endISO, true, true)
          .reverse();
      } else if (startDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        collection = db.transactions
          .where('created_at')
          .aboveOrEqual(startISO)
          .reverse();
      } else if (endDate) {
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.transactions
          .where('created_at')
          .belowOrEqual(endISO)
          .reverse();
      }

      let transactions = filterActiveTransactions(await collection.toArray());

      // Filter by payment method if provided
      if (paymentMethod && paymentMethod !== 'SEMUA') {
        transactions = transactions.filter((t) => (t.payment_method || 'TUNAI') === paymentMethod);
      }

      const totalRevenue = transactions.reduce((sum, t) => sum + t.total_amount, 0);
      const totalDiscount = transactions.reduce((sum, t) => sum + (t.discount_amount ?? 0), 0);
      const transactionIds = transactions.map((t) => t.id);

      // Calculate profit and items from transaction items
      let totalProfit = 0;
      let soldItems = createEmptySoldItemSummary();
      let topProducts: TopProduct[] = [];

      if (transactionIds.length > 0) {
        // Fetch items by date range first for efficiency
        let itemsCollection = db.transactionItems.orderBy('created_at');

        if (startDate && endDate) {
          const startISO = dayjs.tz(startDate).startOf('day').toISOString();
          const endISO = dayjs.tz(endDate).endOf('day').toISOString();
          itemsCollection = db.transactionItems.where('created_at').between(startISO, endISO, true, true);
        } else if (startDate) {
          const startISO = dayjs.tz(startDate).startOf('day').toISOString();
          itemsCollection = db.transactionItems.where('created_at').aboveOrEqual(startISO);
        } else if (endDate) {
          const endISO = dayjs.tz(endDate).endOf('day').toISOString();
          itemsCollection = db.transactionItems.where('created_at').belowOrEqual(endISO);
        }

        const items = await itemsCollection.toArray();
        // Filter items that belong to the filtered transactions
        const relevantItems = items.filter(item => transactionIds.includes(item.transaction_id));

        totalProfit = relevantItems.reduce((sum, item) => sum + (item.profit || 0), 0);

        // Aggregate Top Products
        const products = await db.products.toArray();
        const productMap = new Map(products.map(p => [p.id, p]));
        soldItems = aggregateSoldItems(relevantItems, productMap);

        const aggregation = relevantItems.reduce((acc, item) => {
          const product = productMap.get(item.product_id);
          const category = product?.category || 'non_consumable';
          const unit = resolveTransactionItemUnit(item, product);

          // Filter by category if provided
          if (categories && categories.length > 0 && !categories.includes(category)) {
            return acc;
          }

          if (!acc[item.product_id]) {
            acc[item.product_id] = {
              product_id: item.product_id,
              product_name: item.product_name,
              category: category,
              totalRevenue: 0,
              totalProfit: 0,
              units: {},
            };
          }

          acc[item.product_id].totalRevenue += item.subtotal;
          acc[item.product_id].totalProfit += (item.profit || 0);
          acc[item.product_id].units[unit] = (acc[item.product_id].units[unit] || 0) + item.quantity;

          return acc;
        }, {} as Record<string, TopProductAggregation>);

        topProducts = Object.values(aggregation).map((p) => {
          const totalQuantity = Object.entries(p.units)
            .map(([unit, qty]) => `${qty.toLocaleString('id-ID')} ${unit}`)
            .join(', ');

          return {
            ...p,
            totalQuantity,
            margin: p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0,
          } as TopProduct;
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);
      }

      return {
        transactions,
        totalRevenue,
        totalDiscount,
        totalProfit,
        soldItems,
        averageTransaction:
          transactions.length > 0 ? totalRevenue / transactions.length : 0,
        topProducts,
      };
    },
  });
};

export const useProductCategories = () => {
  return useQuery({
    queryKey: ['productCategories'],
    queryFn: async () => {
      // Return hardcoded categories from constants as the source of truth
      return PRODUCT_CATEGORIES.map(cat => cat.value);
    },
  });
};

export const useTransactionDetailReport = (
  startDate?: string,
  endDate?: string,
  paymentMethod?: string,
  categories?: string[],
  search?: string
) => {
  return useQuery({
    queryKey: ['transactionDetailReport', startDate, endDate, paymentMethod, categories, search],
    queryFn: async (): Promise<TransactionDetailReportData> => {
      let collection = db.transactions.orderBy('created_at').reverse();

      if (startDate && endDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.transactions
          .where('created_at')
          .between(startISO, endISO, true, true)
          .reverse();
      } else if (startDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        collection = db.transactions
          .where('created_at')
          .aboveOrEqual(startISO)
          .reverse();
      } else if (endDate) {
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.transactions
          .where('created_at')
          .belowOrEqual(endISO)
          .reverse();
      }

      let transactions = filterActiveTransactions(await collection.toArray());

      if (paymentMethod && paymentMethod !== 'SEMUA') {
        transactions = transactions.filter((transaction) => transaction.payment_method === paymentMethod);
      }

      const transactionIds = transactions.map((transaction) => transaction.id);
      if (transactionIds.length === 0) {
        return {
          rows: [],
          transactions: [],
          totalRevenue: 0,
          totalDiscount: 0,
          totalCost: 0,
          totalProfit: 0,
          totalItems: 0,
          uniqueProducts: 0,
          averageMargin: 0,
        };
      }

      const [items, products] = await Promise.all([
        db.transactionItems.where('transaction_id').anyOf(transactionIds).toArray(),
        db.products.toArray(),
      ]);

      const transactionMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));
      const productMap = new Map(products.map((product) => [product.id, product]));
      const transactionProfitMap = items.reduce((acc, item) => {
        acc[item.transaction_id] = (acc[item.transaction_id] || 0) + (item.profit || 0);
        return acc;
      }, {} as Record<string, number>);

      const normalizedSearch = search?.trim().toLowerCase();

      let rows = items
        .map((item: TransactionItem): TransactionDetailReportRow | null => {
          const transaction = transactionMap.get(item.transaction_id);
          if (!transaction) return null;

          const product = productMap.get(item.product_id) as Product | undefined;
          const unit = resolveTransactionItemUnit(item, product);
          const costTotal = (item.purchase_price || 0) * item.quantity;
          const profit = item.profit || 0;
          const transactionProfit = transactionProfitMap[item.transaction_id] || 0;

          return {
            key: item.id,
            transaction_id: transaction.id,
            transaction_number: transaction.transaction_number,
            transaction_created_at: transaction.created_at,
            payment_method: transaction.payment_method || 'TUNAI',
            transaction_total: transaction.total_amount,
            transaction_profit: transactionProfit,
            transaction_margin: transaction.total_amount > 0 ? (transactionProfit / transaction.total_amount) * 100 : 0,
            product_id: item.product_id,
            product_name: item.product_name,
            category: product?.category || 'non_consumable',
            sku: product?.sku,
            quantity: item.quantity,
            unit,
            selling_price: item.selling_price ?? item.price,
            purchase_price: item.purchase_price || 0,
            subtotal_before_discount: item.subtotal_before_discount ?? item.subtotal + (item.discount_amount ?? 0),
            discount_amount: item.discount_amount ?? 0,
            subtotal: item.subtotal,
            cost_total: costTotal,
            profit,
            margin: item.subtotal > 0 ? (profit / item.subtotal) * 100 : 0,
          };
        })
        .filter((row): row is TransactionDetailReportRow => Boolean(row));

      if (categories && categories.length > 0) {
        rows = rows.filter((row) => categories.includes(row.category));
      }

      if (normalizedSearch) {
        rows = rows.filter((row) => {
          return (
            row.transaction_number.toLowerCase().includes(normalizedSearch) ||
            row.product_name.toLowerCase().includes(normalizedSearch) ||
            row.sku?.toLowerCase().includes(normalizedSearch)
          );
        });
      }

      rows.sort((a, b) => {
        const dateDiff = dayjs(b.transaction_created_at).valueOf() - dayjs(a.transaction_created_at).valueOf();
        if (dateDiff !== 0) return dateDiff;
        return a.product_name.localeCompare(b.product_name);
      });

      const visibleTransactionIds = new Set(rows.map((row) => row.transaction_id));
      const visibleTransactions = transactions.filter((transaction) => visibleTransactionIds.has(transaction.id));
      const totalRevenue = rows.reduce((sum, row) => sum + row.subtotal, 0);
      const totalDiscount = rows.reduce((sum, row) => sum + row.discount_amount, 0);
      const totalCost = rows.reduce((sum, row) => sum + row.cost_total, 0);
      const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);

      return {
        rows,
        transactions: visibleTransactions,
        totalRevenue,
        totalDiscount,
        totalCost,
        totalProfit,
        totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
        uniqueProducts: new Set(rows.map((row) => row.product_id)).size,
        averageMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      };
    },
  });
};

export const usePurchaseReport = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['purchaseReport', startDate, endDate],
    queryFn: async (): Promise<PurchaseReportData> => {
      let collection = db.stockPurchases.orderBy('created_at').reverse();

      if (startDate && endDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.stockPurchases.where('created_at').between(startISO, endISO, true, true).reverse();
      } else if (startDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        collection = db.stockPurchases.where('created_at').aboveOrEqual(startISO).reverse();
      } else if (endDate) {
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.stockPurchases.where('created_at').belowOrEqual(endISO).reverse();
      }

      const purchases = await collection.toArray();
      const totalCost = purchases.reduce((sum, p) => sum + p.total_cost, 0);
      const totalQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0);
      const uniqueProducts = new Set(purchases.map((p) => p.product_id)).size;
      const averageCostPerUnit = totalQuantity > 0 ? totalCost / totalQuantity : 0;

      return {
        purchases,
        totalCost,
        totalQuantity,
        uniqueProducts,
        averageCostPerUnit,
      };
    },
  });
};

export const useExpenseReport = (startDate?: string, endDate?: string, categories?: string[]) => {
  return useQuery({
    queryKey: ['expenseReport', startDate, endDate, categories],
    queryFn: async (): Promise<ExpenseReportData> => {
      let collection = db.financeTransactions.where('type').equals('EXPENSE').reverse();

      if (startDate && endDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.financeTransactions
          .where('created_at')
          .between(startISO, endISO, true, true)
          .filter((t) => t.type === 'EXPENSE')
          .reverse();
      } else if (startDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        collection = db.financeTransactions
          .where('created_at')
          .aboveOrEqual(startISO)
          .filter((t) => t.type === 'EXPENSE')
          .reverse();
      } else if (endDate) {
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.financeTransactions
          .where('created_at')
          .belowOrEqual(endISO)
          .filter((t) => t.type === 'EXPENSE')
          .reverse();
      }

      let transactions = (await collection.toArray())
        .filter((transaction) => transaction.category !== FINANCE_CATEGORIES.SALES_REFUND);

      // Filter by category if provided
      if (categories && categories.length > 0) {
        transactions = transactions.filter((t) => categories.includes(t.category));
      }

      const totalExpense = transactions.reduce((sum, t) => sum + t.amount, 0);

      const breakdown = transactions.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

      return {
        transactions,
        totalExpense,
        breakdown,
      };
    },
  });
};

export const useExpenseCategories = () => {
  return useQuery({
    queryKey: ['expenseCategories'],
    queryFn: async () => {
      const transactions = (await db.financeTransactions.where('type').equals('EXPENSE').toArray())
        .filter((transaction) => transaction.category !== FINANCE_CATEGORIES.SALES_REFUND);
      const categories = [...new Set(transactions.map((t) => t.category))];
      return categories.sort();
    },
  });
};
