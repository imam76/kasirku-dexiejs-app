import { db } from '@/lib/db';
import dayjs from 'dayjs';

export const backupDatabase = async () => {
  try {
    const data = {
      products: await db.products.toArray(),
      transactions: await db.transactions.toArray(),
      transactionItems: await db.transactionItems.toArray(),
      stockPurchases: await db.stockPurchases.toArray(),
      profitLogs: await db.profitLogs.toArray(),
      profitBalance: await db.profitBalance.toArray(),
      version: 1,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kasirku-backup-${dayjs().format('YYYY-MM-DD-HH-mm')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
};

export const restoreDatabase = async (file: File) => {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) throw new Error('File kosong');

        const data = JSON.parse(content);

        // Basic validation - check if at least one expected key exists or it's an empty backup
        const expectedKeys = ['products', 'transactions', 'transactionItems', 'stockPurchases', 'profitLogs', 'profitBalance'];
        const hasValidKey = expectedKeys.some(key => Array.isArray(data[key]));

        if (!hasValidKey && !data.timestamp) {
          throw new Error('Format file backup tidak valid');
        }

        const tables = [
          db.products,
          db.transactions,
          db.transactionItems,
          db.stockPurchases,
          db.profitLogs,
          db.profitBalance
        ];

        await db.transaction('rw', tables, async () => {
          // Clear existing data
          await db.products.clear();
          await db.transactions.clear();
          await db.transactionItems.clear();
          await db.stockPurchases.clear();
          await db.profitLogs.clear();
          await db.profitBalance.clear();

          // Import new data
          if (data.products?.length) await db.products.bulkAdd(data.products);
          if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
          if (data.transactionItems?.length) await db.transactionItems.bulkAdd(data.transactionItems);
          if (data.stockPurchases?.length) await db.stockPurchases.bulkAdd(data.stockPurchases);
          if (data.profitLogs?.length) await db.profitLogs.bulkAdd(data.profitLogs);
          if (data.profitBalance?.length) await db.profitBalance.bulkAdd(data.profitBalance);
        });
        resolve();
      } catch (error) {
        console.error('Restore failed:', error);
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};
