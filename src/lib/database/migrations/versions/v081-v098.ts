import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import * as ChartAccountConstants from '@/constants/chartOfAccounts';
import * as RoleSeed from '@/auth/roleSeed';
import * as AccountOpeningBalanceBridge from '@/utils/finance/accountOpeningBalanceBridge';
import * as MigrationSeeds from '../../seeds';
import * as PosPaymentMethod from '@/utils/posPaymentMethod';
import { backfillMissingCooperativeMemberNumbers, seedCooperativeMemberCodesFromMembers } from '../helpers/cooperativeMembers';

export function registerMigrationsV081ToV098(db: KasirkuDB) {
  db.version(81).stores({}).upgrade(async (tx) => {
    const loans = await tx.table<DatabaseTypes.CooperativeLoan, string>('cooperativeLoans').toArray();
    const migratedLoans = loans
      .filter((loan) => loan.disbursed_at && !loan.scheduled_disbursement_date)
      .map((loan) => ({
        ...loan,
        scheduled_disbursement_date: loan.disbursed_at,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (migratedLoans.length > 0) {
      await tx.table<DatabaseTypes.CooperativeLoan, string>('cooperativeLoans').bulkPut(migratedLoans);
    }
  });

  db.version(82).stores({
    salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at',
    purchaseInvoicePayments: 'id, purchase_document_id, paid_at, status, finance_transaction_id, created_at',
  });

  db.version(83).stores({
    // Repair migration for local IndexedDB instances that reached a newer app version
    // before all POS checkout stores existed. Re-declaring the stores lets Dexie create
    // any missing object stores during the next upgrade without clearing user data.
    transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, member_contact_id, member_number, created_at',
    transactionItems: 'id, transaction_id, product_id, hpp_status, created_at',
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, sync_status, created_at, updated_at',
    contacts: 'id, name, contact_type, phone, email, is_active, is_member, membership_number, sync_status, created_at',
    membershipPointTransactions: 'id, contact_id, membership_number, transaction_id, transaction_number, type, created_at',
    membershipSettings: 'id, updated_at',
    inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at',
    inventoryLotConsumptions: 'id, lot_id, product_id, source_type, source_id, source_line_id, created_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
    financeBalance: 'id',
    profitLogs: 'id, transaction_id, type, created_at',
    profitBalance: 'id',
    syncQueue: 'id, entity, entity_id, operation, status, created_at, updated_at',
  });

  db.version(84).stores({
    // Complete POS checkout repair: these are all object stores opened by
    // checkoutService.checkout() and its synchronous accounting side effects.
    transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, member_contact_id, member_number, created_at',
    transactionItems: 'id, transaction_id, product_id, hpp_status, created_at',
    products: 'id, name, sku, category, sync_status, created_at',
    profitLogs: 'id, transaction_id, type, created_at',
    profitBalance: 'id',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
    financeBalance: 'id',
    chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, sync_status, updated_at, created_at',
    financeAccountMappings: 'id, key, category, account_id, is_system, sync_status, updated_at, created_at',
    enabledModules: 'id, code, is_enabled, source, sync_status, updated_at',
    generalLedgerSetting: 'id, is_ready, cutoff_date, inventory_policy, opening_balance_journal_id, activated_at, sync_status, updated_at',
    journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, source_event, reversed_entry_id, sync_status, updated_at, created_at',
    journalEntryLines: 'id, journal_entry_id, account_id, account_code, account_type, created_at',
    inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at',
    inventoryLotConsumptions: 'id, lot_id, product_id, source_type, source_id, source_line_id, created_at',
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, sync_status, created_at, updated_at',
    contacts: 'id, name, contact_type, phone, email, is_active, is_member, membership_number, sync_status, created_at',
    membershipPointTransactions: 'id, contact_id, membership_number, transaction_id, transaction_number, type, created_at',
    membershipSettings: 'id, updated_at',
    syncQueue: 'id, entity, entity_id, operation, status, created_at, updated_at',
  });

  db.version(85).stores({}).upgrade(backfillMissingCooperativeMemberNumbers);

  db.version(86).stores({
    accountingInitialSetupSetting: 'id, business_template_code, accounting_profile, industry_extension, template_id, base_currency_code, current_period_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const setupTable = tx.table<DatabaseTypes.AccountingInitialSetupSetting, string>('accountingInitialSetupSetting');
    const existingSetup = await setupTable.get('default');
    if (existingSetup && !existingSetup.sync_status) {
      await setupTable.put({
        ...existingSetup,
        version: existingSetup.version ?? 1,
        sync_status: 'pending' as const,
        sync_error: undefined,
      });
    }
  });

  db.version(87).stores({
    openingBalanceBatches: 'id, module, cutoff_date, status, journal_entry_id, sync_status, updated_at, created_at',
    openingBalanceLines: 'id, batch_id, module, contact_id, document_number, document_date, due_date, account_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const setting = await tx.table<DatabaseTypes.GeneralLedgerSetting, string>('generalLedgerSetting').get('default');
    const openingEntry = setting?.opening_balance_journal_id
      ? await tx.table<DatabaseTypes.JournalEntry, string>('journalEntries').get(setting.opening_balance_journal_id)
      : undefined;

    if (!setting?.cutoff_date || openingEntry?.status !== 'POSTED') return;

    const batchTable = tx.table<DatabaseTypes.OpeningBalanceBatch, string>('openingBalanceBatches');
    const lineTable = tx.table<DatabaseTypes.OpeningBalanceLine, string>('openingBalanceLines');
    const batchId = `opening-balance-account-${setting.cutoff_date.slice(0, 10)}`;
    const existingBatch = await batchTable.get(batchId);
    if (existingBatch) return;

    const journalLines = await tx.table<DatabaseTypes.JournalEntryLine, string>('journalEntryLines')
      .where('journal_entry_id')
      .equals(openingEntry.id)
      .toArray();

    await batchTable.put({
      id: batchId,
      module: 'ACCOUNT',
      cutoff_date: setting.cutoff_date,
      status: 'POSTED',
      total_debit: openingEntry.total_debit,
      total_credit: openingEntry.total_credit,
      journal_entry_id: openingEntry.id,
      posted_at: openingEntry.posted_at ?? openingEntry.entry_date,
      notes: 'Migrasi dari opening balance General Ledger legacy.',
      created_at: openingEntry.created_at ?? now,
      updated_at: openingEntry.updated_at ?? now,
      sync_status: setting.sync_status ?? 'pending',
      sync_error: undefined,
    });

    if (journalLines.length > 0) {
      await lineTable.bulkPut(journalLines.map((line, index) => ({
        id: `opening-balance-account-line-${line.id}`,
        batch_id: batchId,
        module: 'ACCOUNT' as const,
        line_number: index + 1,
        base_amount: Number(line.debit || line.credit || 0),
        account_id: line.account_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
        notes: line.description,
        created_at: line.created_at ?? now,
        updated_at: openingEntry.updated_at ?? now,
        sync_status: setting.sync_status ?? 'pending' as const,
        sync_error: undefined,
      })));
    }
  });

  db.version(88).stores({}).upgrade(async (tx) => {
    const accountTable = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const accounts = await accountTable.toArray();
    const hasOpeningBalanceEquity = accounts.some((account) => (
      account.id === 'opening-balance-equity' || account.code === '3050'
    ));
    if (hasOpeningBalanceEquity) return;

    const now = new Date().toISOString();
    const openingBalanceEquity = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS.find((account) => account.id === 'opening-balance-equity');
    if (!openingBalanceEquity) return;

    await accountTable.put({
      ...openingBalanceEquity,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });
  });

  db.version(89).stores({}).upgrade(async (tx) => {
    const accountTable = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const accounts = await accountTable.toArray();
    const accountIds = new Set(accounts.map((account) => account.id));
    const accountCodes = new Set(accounts.map((account) => account.code));
    const now = new Date().toISOString();
    const advanceAccountIds = ['advance-paid', 'advance-received'];
    const accountsToAdd = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS
      .filter((account) => advanceAccountIds.includes(account.id))
      .filter((account) => !accountIds.has(account.id) && !accountCodes.has(account.code))
      .map((account) => ({
        ...account,
        created_at: now,
        updated_at: now,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (accountsToAdd.length > 0) {
      await accountTable.bulkPut(accountsToAdd);
    }
  });

  db.version(90).stores({
    accountingFiscalYears: 'id, name, start_date, end_date, status, closing_journal_entry_id, sync_status, updated_at, created_at',
    fiscalYearClosingRuns: 'id, fiscal_year_id, status, closing_journal_entry_id, posted_at, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const fiscalYearTable = tx.table<DatabaseTypes.AccountingFiscalYear, string>('accountingFiscalYears');
    const existingFiscalYears = await fiscalYearTable.toArray();
    if (existingFiscalYears.length > 0) return;

    const setup = await tx.table<DatabaseTypes.AccountingInitialSetupSetting, string>('accountingInitialSetupSetting').get('default');
    const yearlyPeriods = await tx.table<DatabaseTypes.AccountingPeriod, string>('accountingPeriods')
      .filter((period) => !period.deleted_at && period.period_type === 'YEARLY')
      .toArray();
    const fiscalStart = setup?.fiscal_period_start ?? yearlyPeriods[0]?.start_date;
    const fiscalEnd = setup?.fiscal_period_end ?? yearlyPeriods[0]?.end_date;
    if (!fiscalStart || !fiscalEnd) return;

    const start = fiscalStart.slice(0, 10);
    const end = fiscalEnd.slice(0, 10);
    const startYear = start.slice(0, 4);
    const endYear = end.slice(0, 4);
    const now = new Date().toISOString();
    const fiscalYear: DatabaseTypes.AccountingFiscalYear = {
      id: `fiscal-year-${start}-${end}`,
      name: startYear === endYear ? `Tahun Fiskal ${startYear}` : `Tahun Fiskal ${startYear}-${endYear}`,
      start_date: start,
      end_date: end,
      status: 'OPEN',
      notes: 'Tahun fiskal dibuat dari setup akuntansi awal.',
      version: 1,
      created_at: setup?.created_at ?? now,
      updated_at: setup?.updated_at ?? now,
      sync_status: setup?.sync_status ?? 'pending',
      sync_error: undefined,
    };

    await fiscalYearTable.put(fiscalYear);
  });

  db.version(91).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const balanceSheetPermissionCode: DatabaseTypes.RolePermission['permission_code'] = 'REPORT_BALANCE_SHEET_VIEW';
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'REPORT_PROFIT_LOSS_VIEW')
      .flatMap((profitLossPermission) => {
        const id = `${profitLossPermission.role_id}:${balanceSheetPermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: profitLossPermission.role_id,
          permission_code: balanceSheetPermissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });
    const systemPermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  db.version(92).stores({}).upgrade(async (tx) => {
    const batchTable = tx.table<DatabaseTypes.OpeningBalanceBatch, string>('openingBalanceBatches');
    const lineTable = tx.table<DatabaseTypes.OpeningBalanceLine, string>('openingBalanceLines');
    const accountTable = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const financeTransactionTable = tx.table<DatabaseTypes.FinanceTransaction, string>('financeTransactions');
    const financeBalanceTable = tx.table('financeBalance');
    const [batches, lines, accounts, existingTransactions] = await Promise.all([
      batchTable.toArray(),
      lineTable.toArray(),
      accountTable.toArray(),
      financeTransactionTable.toArray(),
    ]);
    const postedAccountBatchIds = new Set(
      batches
        .filter((batch) => batch.module === 'ACCOUNT' && batch.status === 'POSTED')
        .map((batch) => batch.id),
    );
    if (postedAccountBatchIds.size === 0) return;

    const now = new Date().toISOString();
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const createdTransactions: DatabaseTypes.FinanceTransaction[] = [];

    for (const line of lines) {
      if (!postedAccountBatchIds.has(line.batch_id)) continue;
      const batch = batchById.get(line.batch_id);
      const account = line.account_id ? accountById.get(line.account_id) : undefined;
      if (!batch || !AccountOpeningBalanceBridge.isAccountOpeningBalanceCashBankAccount(account)) continue;

      const financeTransaction = AccountOpeningBalanceBridge.buildAccountOpeningBalanceFinanceTransaction({
        batch,
        line,
        account,
        actor: {
          id: batch.updated_by ?? batch.created_by,
          name: batch.updated_by_name ?? batch.created_by_name,
        },
        now,
      });
      if (!financeTransaction) continue;
      if (
        AccountOpeningBalanceBridge.hasEquivalentAccountOpeningBalanceFinanceTransaction(
          [...existingTransactions, ...createdTransactions],
          financeTransaction,
        )
      ) {
        continue;
      }

      createdTransactions.push(financeTransaction);
    }

    if (createdTransactions.length === 0) return;

    await financeTransactionTable.bulkAdd(createdTransactions);
    await financeBalanceTable.put({
      id: 'current',
      amount: AccountOpeningBalanceBridge.calculateFinanceBalanceFromTransactions([
        ...existingTransactions,
        ...createdTransactions,
      ]),
      updated_at: now,
    });
  });

  db.version(93).stores({
    openingBalanceBatches: 'id, module, cutoff_date, status, batch_number, company_id, previous_batch_id, journal_entry_id, posting_idempotency_key, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const batchTable = tx.table<DatabaseTypes.OpeningBalanceBatch, string>('openingBalanceBatches');
    const setup = await tx.table<DatabaseTypes.AccountingInitialSetupSetting, string>('accountingInitialSetupSetting').get('default');
    const batches = await batchTable.toArray();

    if (batches.length === 0) return;

    const migratedBatches = batches.map((batch) => {
      const revisionNumber = batch.revision_number ?? 1;
      const cutoffKey = batch.cutoff_date.slice(0, 10).replace(/-/g, '');
      const batchNumber = batch.batch_number ?? `OB-${cutoffKey}-${batch.module}-R${revisionNumber}`;

      return {
        ...batch,
        batch_number: batchNumber,
        company_id: batch.company_id ?? 'default',
        accounting_start_date: batch.accounting_start_date ?? setup?.current_period_start,
        revision_number: revisionNumber,
        posted_by: batch.posted_by ?? batch.updated_by,
        posted_by_name: batch.posted_by_name ?? batch.updated_by_name,
        locked_at: batch.locked_at ?? (batch.status === 'POSTED' ? batch.posted_at : undefined),
        version: batch.version ?? 1,
        sync_status: batch.sync_status ?? 'pending',
        sync_error: batch.sync_error,
      } satisfies DatabaseTypes.OpeningBalanceBatch;
    });

    await batchTable.bulkPut(migratedBatches);
  });

  db.version(94).stores({}).upgrade(backfillMissingCooperativeMemberNumbers);

  db.version(95).stores({
    paymentMethods: 'id, &code, name, category, posting_account_id, is_system, is_active, sort_order, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const accountTable = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const paymentMethodTable = tx.table<DatabaseTypes.PaymentMethodMaster, string>('paymentMethods');
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const [accounts, existingMethods, existingPermissions] = await Promise.all([
      accountTable.toArray(),
      paymentMethodTable.toArray(),
      rolePermissionTable.toArray(),
    ]);
    const existingIds = new Set(existingMethods.map((method) => method.id));
    const existingCodes = new Set(existingMethods.map((method) => method.code.trim().toUpperCase()));
    const methodsToAdd = MigrationSeeds.buildDefaultPaymentMethods(accounts, now).filter((method) => (
      !existingIds.has(method.id) && !existingCodes.has(method.code)
    ));

    if (methodsToAdd.length > 0) {
      await paymentMethodTable.bulkPut(methodsToAdd);
    }

    const existingPermissionIds = new Set(existingPermissions.map((permission) => permission.id));
    const permissionsToAdd = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingPermissionIds.has(permission.id));
    if (permissionsToAdd.length > 0) {
      await rolePermissionTable.bulkPut(permissionsToAdd);
    }

    await backfillMissingCooperativeMemberNumbers(tx);
  });

  db.version(96).stores({
    transactions: 'id, transaction_number, payment_method, payment_method_id, payment_method_code, cashier_session_id, cashier_user_id, member_contact_id, member_number, created_at',
  }).upgrade(async (tx) => {
    const transactionTable = tx.table<DatabaseTypes.Transaction, string>('transactions');
    const paymentMethodTable = tx.table<DatabaseTypes.PaymentMethodMaster, string>('paymentMethods');
    const [transactions, methods] = await Promise.all([
      transactionTable.toArray(),
      paymentMethodTable.toArray(),
    ]);
    const missing = transactions.filter((transaction) => (
      !transaction.payment_method_id && !transaction.payment_method_code
    ));
    if (missing.length > 0) {
      await transactionTable.bulkPut(
        missing.map((transaction) => PosPaymentMethod.buildLegacyPosPaymentSnapshot(transaction, methods)),
      );
    }
  });

  db.version(97).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const legacyPermissionCode: DatabaseTypes.RolePermission['permission_code'] = 'COOPERATIVE_LEDGER_REPORT_VIEW';
    const ledgerPermissionCode: DatabaseTypes.RolePermission['permission_code'] = 'REPORT_LEDGER_VIEW';
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === legacyPermissionCode)
      .flatMap((permission) => {
        const id = `${permission.role_id}:${ledgerPermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: permission.role_id,
          permission_code: ledgerPermissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });
    const systemPermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  db.version(98).stores({
    cooperativeMemberCodes: 'id, &code, created_at, updated_at',
  }).upgrade(seedCooperativeMemberCodesFromMembers);
}
