import Dexie from 'dexie';
import { db } from '@/lib/db';
import type { PosTransactionPayment, Product, Transaction, TransactionItem } from '@/types';
import {
  normalizeCursorPageSize,
  type DateIdCursor,
  type DateIdCursorPage,
} from '@/services/shared/dateIdCursor';
import {
  filterTransactionHistory,
  normalizeTransactionHistorySearch,
} from '@/utils/transactionHistorySearch';

export interface TransactionHistoryRow extends Transaction {
  items: TransactionItem[];
  payments: PosTransactionPayment[];
}

export interface TransactionHistoryPageOptions {
  startDate: string;
  endDate: string;
  search?: string;
  cursor?: DateIdCursor;
  limit?: number;
}

const TRANSACTION_PAGE_SIZE = 20;
const SEARCH_SCAN_BATCH_SIZE = 100;

const readHeaderBatch = async ({
  startDate,
  endDate,
  cursor,
  limit,
}: {
  startDate: string;
  endDate: string;
  cursor?: DateIdCursor;
  limit: number;
}) => db.transactions
  .where('[created_at+id]')
  .between(
    [startDate, Dexie.minKey],
    cursor ? [cursor.date, cursor.id] : [endDate, Dexie.maxKey],
    true,
    !cursor,
  )
  .reverse()
  .limit(limit)
  .toArray();

const readItems = async (transactionIds: string[]) => (
  transactionIds.length > 0
    ? db.transactionItems.where('transaction_id').anyOf(transactionIds).toArray()
    : []
);

const readMatchingHeaders = async (
  options: TransactionHistoryPageOptions,
  search: string,
  limit: number,
) => {
  const matches: Transaction[] = [];
  let scanCursor = options.cursor;

  while (matches.length <= limit) {
    const headers = await readHeaderBatch({
      startDate: options.startDate,
      endDate: options.endDate,
      cursor: scanCursor,
      limit: SEARCH_SCAN_BATCH_SIZE,
    });
    if (headers.length === 0) break;

    const headerIds = headers.map((transaction) => transaction.id);
    const items = await readItems(headerIds);
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const products = productIds.length > 0
      ? (await db.products.bulkGet(productIds)).filter((product): product is Product => Boolean(product))
      : [];
    const batchMatches = filterTransactionHistory(headers, items, products, search);
    matches.push(...batchMatches);

    const lastHeader = headers[headers.length - 1];
    scanCursor = { date: lastHeader.created_at, id: lastHeader.id };
    if (headers.length < SEARCH_SCAN_BATCH_SIZE) break;
  }

  return matches;
};

const attachDetails = async (transactions: Transaction[]): Promise<TransactionHistoryRow[]> => {
  const transactionIds = transactions.map((transaction) => transaction.id);
  const [items, payments] = transactionIds.length > 0
    ? await Promise.all([
      readItems(transactionIds),
      db.posTransactionPayments.where('transaction_id').anyOf(transactionIds).toArray(),
    ])
    : [[], []];
  const itemsByTransaction = new Map<string, TransactionItem[]>();
  const paymentsByTransaction = new Map<string, PosTransactionPayment[]>();

  items.forEach((item) => {
    itemsByTransaction.set(
      item.transaction_id,
      [...(itemsByTransaction.get(item.transaction_id) ?? []), item],
    );
  });
  payments.forEach((payment) => {
    paymentsByTransaction.set(
      payment.transaction_id,
      [...(paymentsByTransaction.get(payment.transaction_id) ?? []), payment],
    );
  });

  return transactions.map((transaction) => ({
    ...transaction,
    items: itemsByTransaction.get(transaction.id) ?? [],
    payments: paymentsByTransaction.get(transaction.id) ?? [],
  }));
};

export const listTransactionHistoryPage = async (
  options: TransactionHistoryPageOptions,
): Promise<DateIdCursorPage<TransactionHistoryRow>> => {
  const limit = normalizeCursorPageSize(options.limit, TRANSACTION_PAGE_SIZE);
  const search = normalizeTransactionHistorySearch(options.search ?? '');
  const matchedHeaders = search
    ? await readMatchingHeaders(options, search, limit)
    : await readHeaderBatch({
      startDate: options.startDate,
      endDate: options.endDate,
      cursor: options.cursor,
      limit: limit + 1,
    });
  const visibleHeaders = matchedHeaders.slice(0, limit);
  const rows = await attachDetails(visibleHeaders);
  const lastVisible = visibleHeaders[visibleHeaders.length - 1];

  return {
    rows,
    nextCursor: matchedHeaders.length > limit && lastVisible
      ? { date: lastVisible.created_at, id: lastVisible.id }
      : undefined,
  };
};
