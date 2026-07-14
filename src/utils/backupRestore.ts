import { db } from '@/lib/db';
import dayjs from 'dayjs';
import { exportJson } from '@/utils/export';
import { clearAuthSessionState, getCurrentSessionUser, writeActivityLog } from '@/auth/authService';
import { ensureAccountingDefaults } from '@/services/chartOfAccountService';
import { ensureCompanyProfileSetting } from '@/services/companyProfileSettingService';
import { ensureBaseCurrency } from '@/services/currencyService';
import { ensureMembershipSetting } from '@/services/membershipService';
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
      cashierSessions: await db.cashierSessions.toArray(),
      cooperativeFieldCashSessions: await db.cooperativeFieldCashSessions.toArray(),
      stockPurchases: await db.stockPurchases.toArray(),
      stockOpnames: await db.stockOpnames.toArray(),
      stockOpnameItems: await db.stockOpnameItems.toArray(),
      financeTransactions: await db.financeTransactions.toArray(),
      cashBankReconciliations: await db.cashBankReconciliations.toArray(),
      financeBalance: await db.financeBalance.toArray(),
      payrollRuns: await db.payrollRuns.toArray(),
      payrollRunItems: await db.payrollRunItems.toArray(),
      employeeCashAdvances: await db.employeeCashAdvances.toArray(),
      employeeCashAdvanceRepayments: await db.employeeCashAdvanceRepayments.toArray(),
      profitLogs: await db.profitLogs.toArray(),
      profitBalance: await db.profitBalance.toArray(),
      promos: await db.promos.toArray(),
      contacts: await db.contacts.toArray(),
      departments: await db.departments.toArray(),
      projects: await db.projects.toArray(),
      taxes: await db.taxes.toArray(),
      warehouses: await db.warehouses.toArray(),
      currencies: await db.currencies.toArray(),
      currencyRates: await db.currencyRates.toArray(),
      salesDocuments: await db.salesDocuments.toArray(),
      salesDocumentItems: await db.salesDocumentItems.toArray(),
      salesInvoicePayments: await db.salesInvoicePayments.toArray(),
      salesReturns: await db.salesReturns.toArray(),
      salesReturnItems: await db.salesReturnItems.toArray(),
      purchaseDocuments: await db.purchaseDocuments.toArray(),
      purchaseDocumentItems: await db.purchaseDocumentItems.toArray(),
      purchaseInvoicePayments: await db.purchaseInvoicePayments.toArray(),
      inventoryLots: await db.inventoryLots.toArray(),
      inventoryLotConsumptions: await db.inventoryLotConsumptions.toArray(),
      purchaseCostReconciliations: await db.purchaseCostReconciliations.toArray(),
      purchaseCostReconciliationItems: await db.purchaseCostReconciliationItems.toArray(),
      chartOfAccounts: await db.chartOfAccounts.toArray(),
      financeAccountMappings: await db.financeAccountMappings.toArray(),
      accountingProfileSetting: await db.accountingProfileSetting.toArray(),
      accountingInitialSetupSetting: await db.accountingInitialSetupSetting.toArray(),
      enabledModules: await db.enabledModules.toArray(),
      generalLedgerSetting: await db.generalLedgerSetting.toArray(),
      openingBalanceBatches: await db.openingBalanceBatches.toArray(),
      openingBalanceLines: await db.openingBalanceLines.toArray(),
      journalEntries: await db.journalEntries.toArray(),
      journalEntryLines: await db.journalEntryLines.toArray(),
      cooperativeMembers: await db.cooperativeMembers.toArray(),
      cooperativeSavingTransactions: await db.cooperativeSavingTransactions.toArray(),
      cooperativeMemberSavingBalances: await db.cooperativeMemberSavingBalances.toArray(),
      cooperativeLoans: await db.cooperativeLoans.toArray(),
      cooperativeLoanInstallments: await db.cooperativeLoanInstallments.toArray(),
      cooperativeLoanPayments: await db.cooperativeLoanPayments.toArray(),
      cooperativeLoanCollectionEvents: await db.cooperativeLoanCollectionEvents.toArray(),
      cooperativeSettings: await db.cooperativeSettings.toArray(),
      companyProfileSetting: await db.companyProfileSetting.toArray(),
      membershipPointTransactions: await db.membershipPointTransactions.toArray(),
      membershipSettings: await db.membershipSettings.toArray(),
      authUsers: await db.authUsers.toArray(),
      activityLogs: await db.activityLogs.toArray(),
      version: 23,
      timestamp: new Date().toISOString(),
    };

    const fileName = `frayukti-backup-${dayjs().format('YYYY-MM-DD-HH-mm')}.json`;

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
        const expectedKeys = ['products', 'transactions', 'transactionItems', 'cashierSessions', 'cooperativeFieldCashSessions', 'stockPurchases', 'stockOpnames', 'stockOpnameItems', 'financeTransactions', 'cashBankReconciliations', 'financeBalance', 'payrollRuns', 'payrollRunItems', 'employeeCashAdvances', 'employeeCashAdvanceRepayments', 'profitLogs', 'profitBalance', 'promos', 'contacts', 'departments', 'projects', 'taxes', 'warehouses', 'currencies', 'currencyRates', 'salesDocuments', 'salesDocumentItems', 'salesInvoicePayments', 'salesReturns', 'salesReturnItems', 'purchaseDocuments', 'purchaseDocumentItems', 'purchaseInvoicePayments', 'inventoryLots', 'inventoryLotConsumptions', 'purchaseCostReconciliations', 'purchaseCostReconciliationItems', 'chartOfAccounts', 'financeAccountMappings', 'accountingProfileSetting', 'accountingInitialSetupSetting', 'enabledModules', 'generalLedgerSetting', 'openingBalanceBatches', 'openingBalanceLines', 'journalEntries', 'journalEntryLines', 'cooperativeMembers', 'cooperativeSavingTransactions', 'cooperativeMemberSavingBalances', 'cooperativeLoans', 'cooperativeLoanInstallments', 'cooperativeLoanPayments', 'cooperativeLoanCollectionEvents', 'cooperativeSettings', 'companyProfileSetting', 'membershipPointTransactions', 'membershipSettings', 'authUsers', 'activityLogs'];
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
          db.cashierSessions,
          db.cooperativeFieldCashSessions,
          db.stockPurchases,
          db.stockOpnames,
          db.stockOpnameItems,
          db.financeTransactions,
          db.cashBankReconciliations,
          db.financeBalance,
          db.payrollRuns,
          db.payrollRunItems,
          db.employeeCashAdvances,
          db.employeeCashAdvanceRepayments,
          db.profitLogs,
          db.profitBalance,
          db.promos,
          db.contacts,
          db.departments,
          db.projects,
          db.taxes,
          db.warehouses,
          db.currencies,
          db.currencyRates,
          db.salesDocuments,
          db.salesDocumentItems,
          db.salesInvoicePayments,
          db.salesReturns,
          db.salesReturnItems,
          db.purchaseDocuments,
          db.purchaseDocumentItems,
          db.purchaseInvoicePayments,
          db.inventoryLots,
          db.inventoryLotConsumptions,
          db.purchaseCostReconciliations,
          db.purchaseCostReconciliationItems,
          db.chartOfAccounts,
          db.financeAccountMappings,
          db.accountingProfileSetting,
          db.accountingInitialSetupSetting,
          db.enabledModules,
          db.generalLedgerSetting,
          db.openingBalanceBatches,
          db.openingBalanceLines,
          db.journalEntries,
          db.journalEntryLines,
          db.cooperativeMembers,
          db.cooperativeSavingTransactions,
          db.cooperativeMemberSavingBalances,
          db.cooperativeLoans,
          db.cooperativeLoanInstallments,
          db.cooperativeLoanPayments,
          db.cooperativeLoanCollectionEvents,
          db.cooperativeSettings,
          db.companyProfileSetting,
          db.membershipPointTransactions,
          db.membershipSettings,
          db.authUsers,
          db.authSessions,
          db.activityLogs,
        ];

        await db.transaction('rw', tables, async () => {
          // Clear existing data
          await db.products.clear();
          await db.transactions.clear();
          await db.transactionItems.clear();
          await db.cashierSessions.clear();
          await db.cooperativeFieldCashSessions.clear();
          await db.stockPurchases.clear();
          await db.stockOpnames.clear();
          await db.stockOpnameItems.clear();
          await db.financeTransactions.clear();
          await db.cashBankReconciliations.clear();
          await db.financeBalance.clear();
          await db.payrollRuns.clear();
          await db.payrollRunItems.clear();
          await db.employeeCashAdvances.clear();
          await db.employeeCashAdvanceRepayments.clear();
          await db.profitLogs.clear();
          await db.profitBalance.clear();
          await db.promos.clear();
          await db.contacts.clear();
          await db.departments.clear();
          await db.projects.clear();
          await db.taxes.clear();
          await db.warehouses.clear();
          await db.currencies.clear();
          await db.currencyRates.clear();
          await db.salesDocuments.clear();
          await db.salesDocumentItems.clear();
          await db.salesInvoicePayments.clear();
          await db.salesReturns.clear();
          await db.salesReturnItems.clear();
          await db.purchaseDocuments.clear();
          await db.purchaseDocumentItems.clear();
          await db.purchaseInvoicePayments.clear();
          await db.inventoryLots.clear();
          await db.inventoryLotConsumptions.clear();
          await db.purchaseCostReconciliations.clear();
          await db.purchaseCostReconciliationItems.clear();
          await db.chartOfAccounts.clear();
          await db.financeAccountMappings.clear();
          await db.accountingProfileSetting.clear();
          await db.accountingInitialSetupSetting.clear();
          await db.enabledModules.clear();
          await db.generalLedgerSetting.clear();
          await db.openingBalanceBatches.clear();
          await db.openingBalanceLines.clear();
          await db.journalEntries.clear();
          await db.journalEntryLines.clear();
          await db.cooperativeMembers.clear();
          await db.cooperativeSavingTransactions.clear();
          await db.cooperativeMemberSavingBalances.clear();
          await db.cooperativeLoans.clear();
          await db.cooperativeLoanInstallments.clear();
          await db.cooperativeLoanPayments.clear();
          await db.cooperativeLoanCollectionEvents.clear();
          await db.cooperativeSettings.clear();
          await db.companyProfileSetting.clear();
          await db.membershipPointTransactions.clear();
          await db.membershipSettings.clear();
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
          if (data.cashierSessions?.length) await db.cashierSessions.bulkAdd(data.cashierSessions);
          if (data.cooperativeFieldCashSessions?.length) await db.cooperativeFieldCashSessions.bulkAdd(data.cooperativeFieldCashSessions);
          if (data.stockPurchases?.length) await db.stockPurchases.bulkAdd(data.stockPurchases);
          if (data.stockOpnames?.length) await db.stockOpnames.bulkAdd(data.stockOpnames);
          if (data.stockOpnameItems?.length) await db.stockOpnameItems.bulkAdd(data.stockOpnameItems);
          if (data.financeTransactions?.length) await db.financeTransactions.bulkAdd(data.financeTransactions);
          if (data.cashBankReconciliations?.length) await db.cashBankReconciliations.bulkAdd(data.cashBankReconciliations);
          if (data.financeBalance?.length) await db.financeBalance.bulkAdd(data.financeBalance);
          if (data.payrollRuns?.length) await db.payrollRuns.bulkAdd(data.payrollRuns);
          if (data.payrollRunItems?.length) await db.payrollRunItems.bulkAdd(data.payrollRunItems);
          if (data.employeeCashAdvances?.length) await db.employeeCashAdvances.bulkAdd(data.employeeCashAdvances);
          if (data.employeeCashAdvanceRepayments?.length) await db.employeeCashAdvanceRepayments.bulkAdd(data.employeeCashAdvanceRepayments);
          if (data.profitLogs?.length) await db.profitLogs.bulkAdd(data.profitLogs);
          if (data.profitBalance?.length) await db.profitBalance.bulkAdd(data.profitBalance);
          if (data.promos?.length) await db.promos.bulkAdd(data.promos);
          if (data.contacts?.length) await db.contacts.bulkAdd(data.contacts);
          if (data.departments?.length) await db.departments.bulkAdd(data.departments);
          if (data.projects?.length) await db.projects.bulkAdd(data.projects);
          if (data.taxes?.length) await db.taxes.bulkAdd(data.taxes);
          if (data.warehouses?.length) await db.warehouses.bulkAdd(data.warehouses);
          if (data.currencies?.length) await db.currencies.bulkAdd(data.currencies);
          if (data.currencyRates?.length) await db.currencyRates.bulkAdd(data.currencyRates);
          if (data.salesDocuments?.length) await db.salesDocuments.bulkAdd(data.salesDocuments);
          if (data.salesDocumentItems?.length) await db.salesDocumentItems.bulkAdd(data.salesDocumentItems);
          if (data.salesInvoicePayments?.length) await db.salesInvoicePayments.bulkAdd(data.salesInvoicePayments);
          if (data.salesReturns?.length) await db.salesReturns.bulkAdd(data.salesReturns);
          if (data.salesReturnItems?.length) await db.salesReturnItems.bulkAdd(data.salesReturnItems);
          if (data.purchaseDocuments?.length) await db.purchaseDocuments.bulkAdd(data.purchaseDocuments);
          if (data.purchaseDocumentItems?.length) await db.purchaseDocumentItems.bulkAdd(data.purchaseDocumentItems);
          if (data.purchaseInvoicePayments?.length) await db.purchaseInvoicePayments.bulkAdd(data.purchaseInvoicePayments);
          if (data.inventoryLots?.length) await db.inventoryLots.bulkAdd(data.inventoryLots);
          if (data.inventoryLotConsumptions?.length) await db.inventoryLotConsumptions.bulkAdd(data.inventoryLotConsumptions);
          if (data.purchaseCostReconciliations?.length) await db.purchaseCostReconciliations.bulkAdd(data.purchaseCostReconciliations);
          if (data.purchaseCostReconciliationItems?.length) await db.purchaseCostReconciliationItems.bulkAdd(data.purchaseCostReconciliationItems);
          if (data.chartOfAccounts?.length) await db.chartOfAccounts.bulkAdd(data.chartOfAccounts);
          if (data.financeAccountMappings?.length) await db.financeAccountMappings.bulkAdd(data.financeAccountMappings);
          if (data.accountingProfileSetting?.length) await db.accountingProfileSetting.bulkAdd(data.accountingProfileSetting);
          if (data.accountingInitialSetupSetting?.length) await db.accountingInitialSetupSetting.bulkAdd(data.accountingInitialSetupSetting);
          if (data.enabledModules?.length) await db.enabledModules.bulkAdd(data.enabledModules);
          if (data.generalLedgerSetting?.length) await db.generalLedgerSetting.bulkAdd(data.generalLedgerSetting);
          if (data.openingBalanceBatches?.length) await db.openingBalanceBatches.bulkAdd(data.openingBalanceBatches);
          if (data.openingBalanceLines?.length) await db.openingBalanceLines.bulkAdd(data.openingBalanceLines);
          if (data.journalEntries?.length) await db.journalEntries.bulkAdd(data.journalEntries);
          if (data.journalEntryLines?.length) await db.journalEntryLines.bulkAdd(data.journalEntryLines);
          if (data.cooperativeMembers?.length) await db.cooperativeMembers.bulkAdd(data.cooperativeMembers);
          if (data.cooperativeSavingTransactions?.length) await db.cooperativeSavingTransactions.bulkAdd(data.cooperativeSavingTransactions);
          if (data.cooperativeMemberSavingBalances?.length) await db.cooperativeMemberSavingBalances.bulkAdd(data.cooperativeMemberSavingBalances);
          if (data.cooperativeLoans?.length) await db.cooperativeLoans.bulkAdd(data.cooperativeLoans);
          if (data.cooperativeLoanInstallments?.length) await db.cooperativeLoanInstallments.bulkAdd(data.cooperativeLoanInstallments);
          if (data.cooperativeLoanPayments?.length) await db.cooperativeLoanPayments.bulkAdd(data.cooperativeLoanPayments);
          if (data.cooperativeLoanCollectionEvents?.length) await db.cooperativeLoanCollectionEvents.bulkAdd(data.cooperativeLoanCollectionEvents);
          if (data.cooperativeSettings?.length) await db.cooperativeSettings.bulkAdd(data.cooperativeSettings);
          if (!data.cooperativeSettings?.length) {
            const now = new Date().toISOString();
            await db.cooperativeSettings.put({
              id: 'default',
              created_at: now,
              updated_at: now,
            });
          }
          if (data.companyProfileSetting?.length) await db.companyProfileSetting.bulkAdd(data.companyProfileSetting);
          if (data.membershipPointTransactions?.length) await db.membershipPointTransactions.bulkAdd(data.membershipPointTransactions);
          if (data.membershipSettings?.length) await db.membershipSettings.bulkAdd(data.membershipSettings);
          if (hasAuthUsersPayload && data.authUsers.length) await db.authUsers.bulkAdd(data.authUsers);
          if (hasActivityLogsPayload && data.activityLogs.length) await db.activityLogs.bulkAdd(data.activityLogs);
        });

        await ensureAccountingDefaults();
        await ensureBaseCurrency();
        await ensureCompanyProfileSetting();
        await ensureMembershipSetting();

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
