import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import {
  buildPosSalesReportData,
  type PosSalesReportData,
} from '@/services/posSalesReportAggregator';
import type { PosPaymentModeFilter } from '@/utils/posPaymentMethodFilter';
import { filterActiveSaleTransactions } from '@/utils/transactions';

export interface PosSalesReportFilters {
  startDate?: string;
  endDate?: string;
  paymentMethodCode?: string;
  paymentMode?: PosPaymentModeFilter;
  categories?: string[];
  topProductsLimit?: number;
  /** Dashboard charts do not need line-item or product hydration. */
  includeLineItems?: boolean;
  /** Dashboard totals do not expose per-transaction payment details. */
  includePaymentDetails?: boolean;
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
  includeLineItems = true,
  includePaymentDetails = true,
}: PosSalesReportFilters = {}): Promise<PosSalesReportData> => {
  const transactions = await getTransactionsForDateRange(startDate, endDate);
  const activeTransactionIds = filterActiveSaleTransactions(transactions).map((transaction) => transaction.id);

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

  const shouldReadPayments = includePaymentDetails || Boolean(paymentMethodCode) || (
    Boolean(paymentMode) && paymentMode !== 'SEMUA'
  );
  const [payments, items] = await Promise.all([
    shouldReadPayments
      ? db.posTransactionPayments.where('transaction_id').anyOf(activeTransactionIds).toArray()
      : Promise.resolve([]),
    includeLineItems
      ? db.transactionItems.where('transaction_id').anyOf(activeTransactionIds).toArray()
      : Promise.resolve([]),
  ]);
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const products = productIds.length > 0
    ? (await db.products.bulkGet(productIds)).filter((product) => product !== undefined)
    : [];

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
