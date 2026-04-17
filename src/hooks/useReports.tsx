import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { Transaction, StockPurchase, FinanceTransaction } from '@/types';

interface SalesReportData {
  transactions: Transaction[];
  totalRevenue: number;
  totalProfit: number;
  totalItems: number;
  averageTransaction: number;
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

export const useSalesReport = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['salesReport', startDate, endDate],
    queryFn: async (): Promise<SalesReportData> => {
      let collection = db.transactions.orderBy('created_at').reverse();

      if (startDate && endDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.transactions.where('created_at').between(startISO, endISO, true, true).reverse();
      } else if (startDate) {
        const startISO = dayjs.tz(startDate).startOf('day').toISOString();
        collection = db.transactions.where('created_at').aboveOrEqual(startISO).reverse();
      } else if (endDate) {
        const endISO = dayjs.tz(endDate).endOf('day').toISOString();
        collection = db.transactions.where('created_at').belowOrEqual(endISO).reverse();
      }

      const transactions = await collection.toArray();
      const totalRevenue = transactions.reduce((sum, t) => sum + t.total_amount, 0);

      const transactionIds = transactions.map((t) => t.id);

      // Calculate profit and items from transaction items
      let totalProfit = 0;
      let totalItems = 0;

      if (transactionIds.length > 0) {
        // We can fetch all items for these transactions
        // Since where('transaction_id').anyOf(transactionIds) might be slow or not supported efficiently
        // For small datasets, fetch all items for the period might be okay if we have created_at index on items
        // Or we loop.

        // Better: transactionItems also has created_at. We can filter by date range on items table too.
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
        // Filter items that belong to the fetched transactions (in case of edge cases or if we just want to be safe)
        const relevantItems = items.filter(item => transactionIds.includes(item.transaction_id));

        totalProfit = relevantItems.reduce((sum, item) => sum + (item.profit || 0), 0);
        totalItems = relevantItems.reduce((sum, item) => sum + item.quantity, 0);
      }

      return {
        transactions,
        totalRevenue,
        totalProfit,
        totalItems,
        averageTransaction:
          transactions.length > 0 ? totalRevenue / transactions.length : 0,
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
