import { db } from '@/lib/db';
import dayjs from 'dayjs';
import { exportJson } from '@/utils/export';
import { clearAuthSessionState, getCurrentSessionUser, writeActivityLog } from '@/auth/authService';
import type { AuthUser } from '@/types';

const hasActiveOwner = (users: AuthUser[]) => {
  return users.some((user) => user.role === 'OWNER' && user.is_active);
};

export const backupDatabase = async () => {
  try {
    const data = {
      products: await db.products.toArray(),
      transactions: await db.transactions.toArray(),
      transactionItems: await db.transactionItems.toArray(),
      stockPurchases: await db.stockPurchases.toArray(),
      profitLogs: await db.profitLogs.toArray(),
      profitBalance: await db.profitBalance.toArray(),
      promos: await db.promos.toArray(),
      contacts: await db.contacts.toArray(),
      departments: await db.departments.toArray(),
      projects: await db.projects.toArray(),
      taxes: await db.taxes.toArray(),
      authUsers: await db.authUsers.toArray(),
      activityLogs: await db.activityLogs.toArray(),
      version: 3,
      timestamp: new Date().toISOString(),
    };

    const fileName = `kasirku-backup-${dayjs().format('YYYY-MM-DD-HH-mm')}.json`;

    await exportJson({ filename: fileName, data });
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
        const expectedKeys = ['products', 'transactions', 'transactionItems', 'stockPurchases', 'profitLogs', 'profitBalance', 'promos', 'contacts', 'departments', 'projects', 'taxes', 'authUsers', 'activityLogs'];
        const hasValidKey = expectedKeys.some(key => Array.isArray(data[key]));

        if (!hasValidKey && !data.timestamp) {
          throw new Error('Format file backup tidak valid');
        }

        const hasAuthUsersPayload = Array.isArray(data.authUsers);
        const hasActivityLogsPayload = Array.isArray(data.activityLogs);
        const currentUser = await getCurrentSessionUser();

        if (hasAuthUsersPayload && !hasActiveOwner(data.authUsers)) {
          throw new Error('Restore dibatalkan: backup tidak memiliki Owner aktif.');
        }

        const shouldWriteRestoreLog = Boolean(
          currentUser && (
            !hasAuthUsersPayload ||
            data.authUsers.some((user: AuthUser) => user.id === currentUser.id && user.is_active)
          ),
        );

        const tables = [
          db.products,
          db.transactions,
          db.transactionItems,
          db.stockPurchases,
          db.profitLogs,
          db.profitBalance,
          db.promos,
          db.contacts,
          db.departments,
          db.projects,
          db.taxes,
          db.authUsers,
          db.authSessions,
          db.activityLogs,
        ];

        await db.transaction('rw', tables, async () => {
          // Clear existing data
          await db.products.clear();
          await db.transactions.clear();
          await db.transactionItems.clear();
          await db.stockPurchases.clear();
          await db.profitLogs.clear();
          await db.profitBalance.clear();
          await db.promos.clear();
          await db.contacts.clear();
          await db.departments.clear();
          await db.projects.clear();
          await db.taxes.clear();
          await db.authSessions.clear();

          if (hasAuthUsersPayload) {
            await db.authUsers.clear();
          }

          if (hasActivityLogsPayload) {
            await db.activityLogs.clear();
          }

          // Import new data
          if (data.products?.length) await db.products.bulkAdd(data.products);
          if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
          if (data.transactionItems?.length) await db.transactionItems.bulkAdd(data.transactionItems);
          if (data.stockPurchases?.length) await db.stockPurchases.bulkAdd(data.stockPurchases);
          if (data.profitLogs?.length) await db.profitLogs.bulkAdd(data.profitLogs);
          if (data.profitBalance?.length) await db.profitBalance.bulkAdd(data.profitBalance);
          if (data.promos?.length) await db.promos.bulkAdd(data.promos);
          if (data.contacts?.length) await db.contacts.bulkAdd(data.contacts);
          if (data.departments?.length) await db.departments.bulkAdd(data.departments);
          if (data.projects?.length) await db.projects.bulkAdd(data.projects);
          if (data.taxes?.length) await db.taxes.bulkAdd(data.taxes);
          if (hasAuthUsersPayload && data.authUsers.length) await db.authUsers.bulkAdd(data.authUsers);
          if (hasActivityLogsPayload && data.activityLogs.length) await db.activityLogs.bulkAdd(data.activityLogs);
        });

        await clearAuthSessionState();

        if (shouldWriteRestoreLog && currentUser) {
          await writeActivityLog({
            user: currentUser,
            action: 'BACKUP_RESTORE',
            entity: 'database',
            description: `${currentUser.name} melakukan restore database dari file backup.`,
          });
        }

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
