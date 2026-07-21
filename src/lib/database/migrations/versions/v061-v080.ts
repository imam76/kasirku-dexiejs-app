import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import * as ChartAccountConstants from '@/constants/chartOfAccounts';
import * as FinanceConstants from '@/constants/finance';
import * as RoleSeed from '@/auth/roleSeed';

export function registerMigrationsV061ToV080(db: KasirkuDB) {
  db.version(61).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const legacyPermissionExpansions: Partial<Record<
      DatabaseTypes.RolePermission['permission_code'],
      DatabaseTypes.RolePermission['permission_code'][]
    >> = {
      CASHIER_ACCESS: [
        'REPORT_POS_SALES_VIEW',
        'REPORT_DEPOSIT_VIEW',
        'REPORT_TRANSACTION_DETAIL_VIEW',
      ],
      STOCK_PURCHASE_ACCESS: ['REPORT_PURCHASE_VIEW'],
      FINANCE_ACCESS: [
        'REPORT_EXPENSE_VIEW',
        'REPORT_PAYROLL_VIEW',
        'REPORT_PROFIT_LOSS_VIEW',
        'REPORT_AGING_VIEW',
      ],
      STOCK_ACCESS: ['REPORT_STOCK_CARD_VIEW'],
      COOPERATIVE_REPORT_VIEW: [
        'COOPERATIVE_OVERVIEW_REPORT_VIEW',
        'COOPERATIVE_CASH_REPORT_VIEW',
        'COOPERATIVE_DAILY_TARGET_REPORT_VIEW',
        'COOPERATIVE_DAILY_STORTING_REPORT_VIEW',
        'COOPERATIVE_DAILY_DROP_REPORT_VIEW',
        'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW',
        'COOPERATIVE_MEMBER_REGISTER_REPORT_VIEW',
        'COOPERATIVE_INSTALLMENT_BOOK_REPORT_VIEW',
        'COOPERATIVE_CASH_FLOW_REPORT_VIEW',
        'COOPERATIVE_LEDGER_REPORT_VIEW',
      ],
    };
    const migratedPermissions = existingPermissions.flatMap((legacyPermission) => (
      (legacyPermissionExpansions[legacyPermission.permission_code] ?? []).flatMap((permissionCode) => {
        const id = `${legacyPermission.role_id}:${permissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: permissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      })
    ));
    const systemPermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  db.version(62).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'COOPERATIVE_REPORT_VIEW')
      .flatMap((legacyPermission) => {
        const permissionCode: DatabaseTypes.RolePermission['permission_code'] = 'COOPERATIVE_IPTW_REPORT_VIEW';
        const id = `${legacyPermission.role_id}:${permissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: permissionCode,
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

  db.version(63).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const accountSeed = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS.find(
      (account) => account.id === 'cooperative-saving-interest-expense',
    );
    const mappingSeed = ChartAccountConstants.DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find(
      (mapping) => mapping.key === FinanceConstants.FINANCE_CATEGORIES.KSP_SAVING_INTEREST_PAYOUT,
    );
    if (!accountSeed || !mappingSeed) return;

    const accountTable = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const mappingTable = tx.table<DatabaseTypes.FinanceAccountMapping, string>('financeAccountMappings');

    if (!await accountTable.get(accountSeed.id)) {
      await accountTable.put({
        ...accountSeed,
        created_at: now,
        updated_at: now,
      });
    }
    if (!await mappingTable.get(mappingSeed.key)) {
      await mappingTable.put({
        ...mappingSeed,
        id: mappingSeed.key,
        created_at: now,
        updated_at: now,
      });
    }
  });

  db.version(64).stores({
    payrollRuns: 'id, payroll_number, period_start, period_end, status, paid_at, finance_transaction_id, created_at, updated_at',
    payrollRunItems: 'id, payroll_run_id, employee_id',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const financeAccountMappings = tx.table<DatabaseTypes.FinanceAccountMapping, string>('financeAccountMappings');

    const salaryAccountSeed = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS.find((account) => account.id === 'salary-expense');
    if (salaryAccountSeed) {
      const existingSalaryAccount = await chartOfAccounts.get(salaryAccountSeed.id)
        ?? await chartOfAccounts.where('code').equals(salaryAccountSeed.code).first();

      if (!existingSalaryAccount) {
        await chartOfAccounts.put({
          ...salaryAccountSeed,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const salaryMappingSeed = ChartAccountConstants.DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find((mapping) => (
      mapping.key === FinanceConstants.FINANCE_CATEGORIES.PAYROLL
    ));
    if (salaryMappingSeed && !await financeAccountMappings.get(salaryMappingSeed.key)) {
      const salaryAccount = await chartOfAccounts.get(salaryMappingSeed.account_id)
        ?? await chartOfAccounts.where('code').equals(salaryMappingSeed.account_code).first();

      if (salaryAccount) {
        await financeAccountMappings.put({
          ...salaryMappingSeed,
          id: salaryMappingSeed.key,
          account_id: salaryAccount.id,
          account_code: salaryAccount.code,
          account_name: salaryAccount.name,
          account_type: salaryAccount.type,
          created_at: now,
          updated_at: now,
        });
      }
    }
  });

  db.version(65).stores({
    employeeCashAdvances: 'id, advance_number, employee_id, status, disbursed_at, finance_transaction_id, created_at, updated_at',
    employeeCashAdvanceRepayments: 'id, cash_advance_id, payroll_run_id, payroll_run_item_id, employee_id, status, [cash_advance_id+status], [payroll_run_id+status], created_at, updated_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const financeAccountMappings = tx.table<DatabaseTypes.FinanceAccountMapping, string>('financeAccountMappings');
    const payrollRuns = tx.table<DatabaseTypes.PayrollRun, string>('payrollRuns');
    const payrollRunItems = tx.table<DatabaseTypes.PayrollRunItem, string>('payrollRunItems');

    const cashAdvanceAccountSeed = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS.find((account) => (
      account.id === 'employee-cash-advance-receivable'
    ));
    if (cashAdvanceAccountSeed) {
      const existingCashAdvanceAccount = await chartOfAccounts.get(cashAdvanceAccountSeed.id)
        ?? await chartOfAccounts.where('code').equals(cashAdvanceAccountSeed.code).first();

      if (!existingCashAdvanceAccount) {
        await chartOfAccounts.put({
          ...cashAdvanceAccountSeed,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const cashAdvanceMappingSeed = ChartAccountConstants.DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find((mapping) => (
      mapping.key === FinanceConstants.FINANCE_CATEGORIES.EMPLOYEE_CASH_ADVANCE
    ));
    if (cashAdvanceMappingSeed && !await financeAccountMappings.get(cashAdvanceMappingSeed.key)) {
      const cashAdvanceAccount = await chartOfAccounts.get(cashAdvanceMappingSeed.account_id)
        ?? await chartOfAccounts.where('code').equals(cashAdvanceMappingSeed.account_code).first();

      if (cashAdvanceAccount) {
        await financeAccountMappings.put({
          ...cashAdvanceMappingSeed,
          id: cashAdvanceMappingSeed.key,
          account_id: cashAdvanceAccount.id,
          account_code: cashAdvanceAccount.code,
          account_name: cashAdvanceAccount.name,
          account_type: cashAdvanceAccount.type,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const runUpdates = (await payrollRuns.toArray())
      .filter((run) => run.other_deduction_amount === undefined || run.cash_advance_deduction_amount === undefined)
      .map((run): DatabaseTypes.PayrollRun => ({
        ...run,
        other_deduction_amount: Number(run.other_deduction_amount ?? run.deduction_amount ?? 0),
        cash_advance_deduction_amount: Number(run.cash_advance_deduction_amount ?? 0),
        deduction_amount: Number(run.deduction_amount ?? 0),
        updated_at: run.updated_at ?? now,
      }));

    if (runUpdates.length > 0) {
      await payrollRuns.bulkPut(runUpdates);
    }

    const itemUpdates = (await payrollRunItems.toArray())
      .filter((item) => item.other_deduction_amount === undefined || item.cash_advance_deduction_amount === undefined)
      .map((item): DatabaseTypes.PayrollRunItem => ({
        ...item,
        other_deduction_amount: Number(item.other_deduction_amount ?? item.deduction_amount ?? 0),
        cash_advance_deduction_amount: Number(item.cash_advance_deduction_amount ?? 0),
        deduction_amount: Number(item.deduction_amount ?? 0),
        updated_at: item.updated_at ?? now,
      }));

    if (itemUpdates.length > 0) {
      await payrollRunItems.bulkPut(itemUpdates);
    }
  });

  db.version(66).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const payrollPermissionCode: DatabaseTypes.RolePermission['permission_code'] = 'REPORT_PAYROLL_VIEW';
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'FINANCE_ACCESS')
      .flatMap((legacyPermission) => {
        const id = `${legacyPermission.role_id}:${payrollPermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: payrollPermissionCode,
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

  db.version(67).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const incomePermissionCode: DatabaseTypes.RolePermission['permission_code'] = 'REPORT_INCOME_VIEW';
    const migratedPermissions = existingPermissions
      .filter((permission) => (
        permission.permission_code === 'FINANCE_ACCESS' ||
        permission.permission_code === 'REPORT_EXPENSE_VIEW'
      ))
      .flatMap((legacyPermission) => {
        const id = `${legacyPermission.role_id}:${incomePermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: incomePermissionCode,
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

  db.version(68).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const enabledModules = tx.table<DatabaseTypes.EnabledModule, string>('enabledModules');
    const generalLedgerSetting = tx.table<DatabaseTypes.GeneralLedgerSetting, string>('generalLedgerSetting');
    const journalEntries = tx.table<DatabaseTypes.JournalEntry, string>('journalEntries');
    const journalEntryLines = tx.table<DatabaseTypes.JournalEntryLine, string>('journalEntryLines');
    const module = await enabledModules.get('GENERAL_LEDGER');
    const setting = await generalLedgerSetting.get('default');

    if (!module?.is_enabled || !setting?.is_ready || !setting.cutoff_date) return;

    const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const amountOrZero = (value: number | undefined) => {
      const amount = Number(value || 0);
      return Number.isFinite(amount) ? roundCurrency(amount) : 0;
    };
    const isBeforeCutoff = (entryDate: string) => entryDate.slice(0, 10) < setting.cutoff_date!.slice(0, 10);

    const accounts = await tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts').toArray();
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const accountByCode = new Map(accounts.map((account) => [account.code, account]));
    const findPostableAccount = (ids: string[], codes: string[]) => {
      const account = ids
        .map((id) => accountById.get(id))
        .find(Boolean)
        ?? codes.map((code) => accountByCode.get(code)).find(Boolean);

      return account?.is_active && account.is_postable ? account : undefined;
    };
    const findCashAccount = (accountId?: string, paymentMethod?: string) => {
      const selectedAccount = accountId ? accountById.get(accountId) : undefined;
      if (selectedAccount?.is_active && selectedAccount.is_postable && selectedAccount.type === 'ASSET') {
        return selectedAccount;
      }

      return paymentMethod === 'NON_TUNAI'
        ? findPostableAccount(['bank'], ['1020'])
        : findPostableAccount(['cash'], ['1010']);
    };
    const salaryExpenseAccount = findPostableAccount(['salary-expense', 'template-salary-expense'], ['6110', '6010'])
      ?? findPostableAccount(['other-expense', 'template-other-expense'], ['6900']);
    const cashAdvanceAccount = findPostableAccount(['employee-cash-advance-receivable'], ['1130']);

    if (!salaryExpenseAccount || !cashAdvanceAccount) return;

    const existingSourceKeys = new Set(
      (await journalEntries
        .where('source_type')
        .anyOf(['PAYROLL_RUN', 'EMPLOYEE_CASH_ADVANCE'])
        .toArray())
        .filter((entry) => entry.status === 'POSTED')
        .map((entry) => `${entry.source_type}:${entry.source_id}:${entry.source_event}`),
    );
    const sequenceByDate = new Map<string, number>();
    const createJournalEntryNumber = async (entryDate: string) => {
      const dateKey = entryDate.slice(0, 10).replace(/-/g, '');
      const prefix = `JRN-${dateKey}-`;
      let sequence = sequenceByDate.get(dateKey);
      if (sequence === undefined) {
        sequence = await journalEntries.where('entry_number').startsWith(prefix).count();
      }
      sequence += 1;
      sequenceByDate.set(dateKey, sequence);
      return `${prefix}${String(sequence).padStart(4, '0')}`;
    };
    const entriesToAdd: DatabaseTypes.JournalEntry[] = [];
    const linesToAdd: DatabaseTypes.JournalEntryLine[] = [];
    const addJournalEntry = async ({
      sourceType,
      sourceId,
      sourceNumber,
      sourceEvent,
      entryDate,
      description,
      lines,
    }: {
      sourceType: DatabaseTypes.JournalEntry['source_type'];
      sourceId: string;
      sourceNumber?: string;
      sourceEvent: string;
      entryDate: string;
      description: string;
      lines: Array<{ account: DatabaseTypes.ChartOfAccount; debit?: number; credit?: number; description?: string }>;
    }) => {
      const sourceKey = `${sourceType}:${sourceId}:${sourceEvent}`;
      if (existingSourceKeys.has(sourceKey)) return;

      const normalizedLines = lines
        .map((line) => ({
          ...line,
          debit: amountOrZero(line.debit),
          credit: amountOrZero(line.credit),
        }))
        .filter((line) => line.debit > 0 || line.credit > 0);
      const totalDebit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.debit, 0));
      const totalCredit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.credit, 0));
      if (normalizedLines.length < 2 || Math.abs(totalDebit - totalCredit) > 0.01) return;

      const entryId = crypto.randomUUID();
      entriesToAdd.push({
        id: entryId,
        entry_number: await createJournalEntryNumber(entryDate),
        entry_date: entryDate,
        status: 'POSTED',
        source_type: sourceType,
        source_id: sourceId,
        source_number: sourceNumber,
        source_event: sourceEvent,
        description,
        total_debit: totalDebit,
        total_credit: totalCredit,
        posted_at: now,
        version: 1,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
      normalizedLines.forEach((line) => {
        linesToAdd.push({
          id: crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id: line.account.id,
          account_code: line.account.code,
          account_name: line.account.name,
          account_type: line.account.type,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          created_at: now,
        });
      });
      existingSourceKeys.add(sourceKey);
    };

    const cashAdvances = await tx.table<DatabaseTypes.EmployeeCashAdvance, string>('employeeCashAdvances').toArray();
    for (const advance of cashAdvances) {
      if (advance.status === 'VOIDED' || isBeforeCutoff(advance.disbursed_at)) continue;

      const amount = amountOrZero(advance.amount);
      const cashAccount = findCashAccount(advance.cash_account_id, advance.payment_method);
      if (amount <= 0 || !cashAccount) continue;

      await addJournalEntry({
        sourceType: 'EMPLOYEE_CASH_ADVANCE',
        sourceId: advance.id,
        sourceNumber: advance.advance_number,
        sourceEvent: 'EMPLOYEE_CASH_ADVANCE_DISBURSED',
        entryDate: advance.disbursed_at,
        description: `Pencairan kasbon ${advance.advance_number} ${advance.employee_name}`,
        lines: [
          { account: cashAdvanceAccount, debit: amount, description: 'Piutang kasbon karyawan bertambah' },
          { account: cashAccount, credit: amount, description: 'Kas/bank berkurang karena pencairan kasbon' },
        ],
      });
    }

    const payrollRuns = await tx.table<DatabaseTypes.PayrollRun, string>('payrollRuns')
      .where('status')
      .equals('PAID')
      .toArray();
    for (const run of payrollRuns) {
      if (!run.paid_at || isBeforeCutoff(run.paid_at)) continue;

      const cashAmount = amountOrZero(run.net_amount);
      const cashAdvanceDeductionAmount = amountOrZero(run.cash_advance_deduction_amount);
      const expenseAmount = roundCurrency(cashAmount + cashAdvanceDeductionAmount);
      const cashAccount = cashAmount > 0 ? findCashAccount(run.cash_account_id, run.payment_method) : undefined;
      if (expenseAmount <= 0 || (cashAmount > 0 && !cashAccount)) continue;

      await addJournalEntry({
        sourceType: 'PAYROLL_RUN',
        sourceId: run.id,
        sourceNumber: run.payroll_number,
        sourceEvent: 'PAYROLL_RUN_PAID',
        entryDate: run.paid_at,
        description: `Pembayaran gaji ${run.payroll_number} periode ${run.period_start} s/d ${run.period_end}`,
        lines: [
          { account: salaryExpenseAccount, debit: expenseAmount, description: 'Beban gaji karyawan' },
          ...(cashAccount ? [{
            account: cashAccount,
            credit: cashAmount,
            description: 'Kas/bank berkurang karena pembayaran gaji',
          }] : []),
          ...(cashAdvanceDeductionAmount > 0 ? [{
            account: cashAdvanceAccount,
            credit: cashAdvanceDeductionAmount,
            description: 'Piutang kasbon karyawan dilunasi dari payroll',
          }] : []),
        ],
      });
    }

    if (entriesToAdd.length > 0) {
      await journalEntries.bulkAdd(entriesToAdd);
      await journalEntryLines.bulkAdd(linesToAdd);
    }
  });

  db.version(69).stores({
    employees: 'id, name, email, phone, user_id, login_role_id, field_cash_account_id, is_active, sync_status, updated_at, created_at',
    employeeAreas: 'id, employee_id, area_id, sync_status, updated_at, created_at',
    employeeCollectionSchedules: 'id, employee_id, area_id, weekday, [employee_id+area_id], [employee_id+area_id+weekday], is_active, sync_status, effective_from, effective_until, updated_at, created_at',
  }).upgrade(async (tx) => {
    const markPendingEmployeeRecords = async <T extends { sync_status?: string; sync_error?: string }>(
      tableName: string,
    ) => {
      const table = tx.table<T, string>(tableName);
      const records = await table.toArray();
      const recordsWithoutSyncStatus = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsWithoutSyncStatus.length > 0) {
        await table.bulkPut(recordsWithoutSyncStatus);
      }
    };

    await markPendingEmployeeRecords<DatabaseTypes.Employee>('employees');
    await markPendingEmployeeRecords<DatabaseTypes.EmployeeArea>('employeeAreas');
    await markPendingEmployeeRecords<DatabaseTypes.EmployeeCollectionSchedule>('employeeCollectionSchedules');
  });

  db.version(70).stores({
    chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    // Chart of accounts (including kas petugas/field cash accounts) had no cross-device
    // sync before. Mark every existing account pending so the next Sync DB run uploads
    // any account that until now only lived in this device's Dexie.
    const table = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const accounts = await table.toArray();
    const accountsToMark = accounts
      .filter((account) => !account.sync_status)
      .map((account) => ({
        ...account,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (accountsToMark.length > 0) {
      await table.bulkPut(accountsToMark);
    }
  });

  db.version(71).stores({
    financeAccountMappings: 'id, key, category, account_id, is_system, sync_status, updated_at, created_at',
    accountingProfileSetting: 'id, accounting_profile, industry_extension, sync_status, updated_at',
    enabledModules: 'id, code, is_enabled, source, sync_status, updated_at',
    generalLedgerSetting: 'id, is_ready, cutoff_date, inventory_policy, opening_balance_journal_id, activated_at, sync_status, updated_at',
  }).upgrade(async (tx) => {
    // The foundational accounting seed (mappings, profile, modules, GL setting) was
    // local-only. Mark every existing row pending so the next Sync DB run uploads it.
    const markPendingSetting = async (tableName: string) => {
      const table = tx.table<{ id: string; sync_status?: string; sync_error?: string }, string>(tableName);
      const records = await table.toArray();
      const recordsToMark = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsToMark.length > 0) {
        await table.bulkPut(recordsToMark);
      }
    };

    await markPendingSetting('financeAccountMappings');
    await markPendingSetting('accountingProfileSetting');
    await markPendingSetting('enabledModules');
    await markPendingSetting('generalLedgerSetting');
  });

  db.version(72).stores({
    payrollRuns: 'id, payroll_number, period_start, period_end, status, paid_at, finance_transaction_id, sync_status, created_at, updated_at',
    employeeCashAdvances: 'id, advance_number, employee_id, status, disbursed_at, finance_transaction_id, sync_status, created_at, updated_at',
  }).upgrade(async (tx) => {
    const markPendingPayrollRecord = async (tableName: 'payrollRuns' | 'employeeCashAdvances') => {
      const table = tx.table<{ id: string; sync_status?: string; sync_error?: string }, string>(tableName);
      const records = await table.toArray();
      const recordsToMark = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsToMark.length > 0) {
        await table.bulkPut(recordsToMark);
      }
    };

    await markPendingPayrollRecord('payrollRuns');
    await markPendingPayrollRecord('employeeCashAdvances');
  });

  db.version(73).stores({
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, sync_status, created_at, updated_at',
  }).upgrade(async (tx) => {
    const table = tx.table<DatabaseTypes.CashierSession, string>('cashierSessions');
    const sessions = await table.toArray();
    const sessionsToMark = sessions
      .filter((session) => !session.sync_status)
      .map((session) => ({
        ...session,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (sessionsToMark.length > 0) {
      await table.bulkPut(sessionsToMark);
    }
  });

  db.version(74).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const disbursePermissionCode: DatabaseTypes.RolePermission['permission_code'] = 'COOPERATIVE_LOAN_DISBURSE';

    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'FINANCE_ACCESS')
      .flatMap((financePermission) => {
        const id = `${financePermission.role_id}:${disbursePermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: financePermission.role_id,
          permission_code: disbursePermissionCode,
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

  db.version(75).stores({
    cooperativeLoanPayments: 'id, payment_number, payment_type, payment_group_id, payment_group_number, loan_id, loan_number, installment_id, member_id, member_number, collector_id, received_by, payment_date, posted_at, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, idempotency_key, sync_status, updated_at, created_at',
  });

  db.version(76).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const resortDevelopmentPermission: DatabaseTypes.RolePermission['permission_code'] = 'COOPERATIVE_RESORT_DEVELOPMENT_REPORT_VIEW';

    const migratedPermissions = existingPermissions
      .filter((permission) => (
        permission.permission_code === 'COOPERATIVE_REPORT_VIEW' ||
        permission.permission_code === 'COOPERATIVE_DAILY_TARGET_REPORT_VIEW'
      ))
      .flatMap((legacyPermission) => {
        const id = `${legacyPermission.role_id}:${resortDevelopmentPermission}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: resortDevelopmentPermission,
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

  db.version(77).stores({
    cashBankReconciliations: 'id, reconciliation_number, cash_account_id, statement_date, status, sync_status, updated_at, created_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
  }).upgrade(async (tx) => {
    const reconciliations = await tx.table<DatabaseTypes.CashBankReconciliation, string>('cashBankReconciliations').toArray();
    const reconciliationsWithoutSyncStatus = reconciliations
      .filter((reconciliation) => !reconciliation.sync_status || !reconciliation.version || !reconciliation.updated_at)
      .map((reconciliation) => ({
        ...reconciliation,
        version: reconciliation.version ?? 1,
        updated_at: reconciliation.updated_at ?? reconciliation.created_at,
        sync_status: reconciliation.sync_status ?? 'pending' as const,
        sync_error: undefined,
      }));

    if (reconciliationsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.CashBankReconciliation, string>('cashBankReconciliations').bulkPut(
        reconciliationsWithoutSyncStatus,
      );
    }
  });

  db.version(78).stores({
    accountingPeriods: 'id, name, period_type, start_date, end_date, status, closing_journal_entry_id, sync_status, updated_at, created_at',
    closingRuns: 'id, period_id, status, closing_journal_entry_id, posted_at, sync_status, updated_at, created_at',
  });

  db.version(79).stores({
    cashBankReconciliations: 'id, reconciliation_number, cash_account_id, statement_date, status, sync_status, updated_at, created_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
    accountingPeriods: 'id, name, period_type, start_date, end_date, status, closing_journal_entry_id, sync_status, updated_at, created_at',
    closingRuns: 'id, period_id, status, closing_journal_entry_id, posted_at, sync_status, updated_at, created_at',
  });

  db.version(80).stores({
    taxes: 'id, name, code, rate_type, calculation_mode, tax_flow, sales_tax_account_id, purchase_tax_account_id, is_default, is_active, sync_status, effective_from, effective_to, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const accounts = await chartOfAccounts.toArray();
    const accountIds = new Set(accounts.map((account) => account.id));
    const accountCodes = new Set(accounts.map((account) => account.code));
    const taxAccountIds = [
      'input-tax',
      'output-tax',
      'luxury-sales-tax-payable',
      'pph23-payable',
      'final-income-tax-payable',
    ];
    const accountsToAdd = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS
      .filter((account) => taxAccountIds.includes(account.id))
      .filter((account) => !accountIds.has(account.id) && !accountCodes.has(account.code))
      .map((account) => ({
        ...account,
        created_at: now,
        updated_at: now,
        sync_status: 'pending' as const,
      }));

    if (accountsToAdd.length > 0) {
      await chartOfAccounts.bulkPut(accountsToAdd);
    }

    const outputTax = await chartOfAccounts.get('output-tax');
    if (outputTax?.name === 'Pajak Keluaran') {
      await chartOfAccounts.put({
        ...outputTax,
        name: 'PPN Keluaran',
        updated_at: now,
        sync_status: 'pending' as const,
        sync_error: undefined,
      });
    }

    const taxes = await tx.table<DatabaseTypes.Tax, string>('taxes').toArray();
    const migratedTaxes = taxes
      .filter((tax) => !tax.tax_flow)
      .map((tax) => ({
        ...tax,
        tax_flow: 'ADDITIVE' as const,
        sync_status: tax.sync_status ?? 'pending' as const,
        sync_error: undefined,
      }));

    if (migratedTaxes.length > 0) {
      await tx.table<DatabaseTypes.Tax, string>('taxes').bulkPut(migratedTaxes);
    }
  });
}
