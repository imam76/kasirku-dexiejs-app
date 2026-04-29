import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { Transaction, StockPurchase, FinanceTransaction } from '@/types';
import { PRODUCT_CATEGORIES } from '@/constants/categories';

interface SalesReportData {
  transactions: Transaction[];
  totalRevenue: number;
  totalProfit: number;
  totalItems: number;
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

export const useSalesReport = (
  startDate?: string,
  endDate?: string,
  paymentMethod?: string,
  categories?: string[]
) => {
  return useQuery({
    queryKey: ['salesReport', startDate, endDate, paymentMethod, categories],
    queryFn: async (): Promise<SalesReportData> => {
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

      let transactions = await collection.toArray();

      // Filter by payment method if provided
      if (paymentMethod && paymentMethod !== 'SEMUA') {
        transactions = transactions.filter((t) => (t.payment_method || 'TUNAI') === paymentMethod);
      }

      const totalRevenue = transactions.reduce((sum, t) => sum + t.total_amount, 0);
      const transactionIds = transactions.map((t) => t.id);

      // Calculate profit and items from transaction items
      let totalProfit = 0;
      let totalItems = 0;
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
        totalItems = relevantItems.reduce((sum, item) => sum + item.quantity, 0);

        // Aggregate Top Products
        const products = await db.products.toArray();
        const productMap = new Map(products.map(p => [p.id, p]));

        const aggregation = relevantItems.reduce((acc, item) => {
          const product = productMap.get(item.product_id);
          const category = product?.category || 'non_consumable';

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
          acc[item.product_id].units[item.unit] = (acc[item.product_id].units[item.unit] || 0) + item.quantity;

          return acc;
        }, {} as Record<string, any>);

        topProducts = Object.values(aggregation).map((p: any) => {
          const totalQuantity = Object.entries(p.units as Record<string, number>)
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
        totalProfit,
        totalItems,
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

      let transactions = await collection.toArray();

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
      const transactions = await db.financeTransactions.where('type').equals('EXPENSE').toArray();
      const categories = [...new Set(transactions.map((t) => t.category))];
      return categories.sort();
    },
  });
};
