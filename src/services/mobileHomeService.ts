import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import type { Transaction } from '@/types';
import { filterActiveSaleTransactions } from '@/utils/transactions';

export interface MobileHomeData {
  averageTransaction: number;
  totalRevenue: number;
  transactions: Transaction[];
}

export const buildMobileHomeData = (transactions: Transaction[]): MobileHomeData => {
  const activeTransactions = filterActiveSaleTransactions(transactions)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const totalRevenue = activeTransactions.reduce(
    (total, transaction) => total + Number(transaction.total_amount || 0),
    0,
  );

  return {
    transactions: activeTransactions,
    totalRevenue,
    averageTransaction: activeTransactions.length > 0
      ? totalRevenue / activeTransactions.length
      : 0,
  };
};

export const getMobileHomeData = async (date: string): Promise<MobileHomeData> => {
  const startISO = dayjs.tz(date).startOf('day').toISOString();
  const endISO = dayjs.tz(date).endOf('day').toISOString();
  const transactions = await db.transactions
    .where('created_at')
    .between(startISO, endISO, true, true)
    .reverse()
    .toArray();

  return buildMobileHomeData(transactions);
};
