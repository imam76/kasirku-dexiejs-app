import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import {
  buildPosSalesReportData,
  type PosSalesReportData,
} from '@/services/posSalesReportAggregator';
import type { PosPaymentModeFilter } from '@/utils/posPaymentMethodFilter';
import { filterActiveTransactions } from '@/utils/transactions';

export interface PosSalesReportFilters {
  startDate?: string;
  endDate?: string;
  paymentMethodCode?: string;
  paymentMode?: PosPaymentModeFilter;
  categories?: string[];
  topProductsLimit?: number;
}

const getTransactionsForDateRange = async (startDate?: string, endDate?: string) => {
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

  return collection.toArray();
};

export const getPosSalesReportData = async ({
  startDate,
  endDate,
  paymentMethodCode,
  paymentMode,
  categories,
  topProductsLimit,
}: PosSalesReportFilters = {}): Promise<PosSalesReportData> => {
  const transactions = await getTransactionsForDateRange(startDate, endDate);
  const activeTransactionIds = filterActiveTransactions(transactions).map((transaction) => transaction.id);

  if (activeTransactionIds.length === 0) {
    return buildPosSalesReportData({
      transactions,
      startDate,
      endDate,
      paymentMethodCode,
      paymentMode,
      categories,
      topProductsLimit,
    });
  }

  const [payments, items, products] = await Promise.all([
    db.posTransactionPayments.where('transaction_id').anyOf(activeTransactionIds).toArray(),
    db.transactionItems.where('transaction_id').anyOf(activeTransactionIds).toArray(),
    db.products.toArray(),
  ]);

  return buildPosSalesReportData({
    transactions,
    payments,
    items,
    products,
    startDate,
    endDate,
    paymentMethodCode,
    paymentMode,
    categories,
    topProductsLimit,
  });
};
