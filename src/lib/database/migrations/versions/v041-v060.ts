import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import dayjs from '@/lib/dayjs';
import * as ChartAccountConstants from '@/constants/chartOfAccounts';
import * as RoleSeed from '@/auth/roleSeed';

export function registerMigrationsV041ToV060(db: KasirkuDB) {
  db.version(41).stores({
    cooperativeMembers: 'id, member_number, name, area_id, status, sync_status, updated_at, created_at',
    cooperativeAreas: 'id, name, code, is_active, created_at',
    employees: 'id, name, user_id, is_active, created_at',
    employeeAreas: 'id, employee_id, area_id'
  });

  db.version(42).stores({
    authUsers: 'id, name, role, is_active, sync_status, created_at'
  });

  db.version(43).stores({
    authUsers: 'id, name, role, role_id, role_name, employee_id, is_active, sync_status, created_at',
    roles: 'id, name, code, is_system, is_owner, is_active, sync_status, updated_at, created_at',
    rolePermissions: 'id, [role_id+permission_code], role_id, permission_code, sync_status, updated_at, created_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const roleTable = tx.table<DatabaseTypes.Role, string>('roles');
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const authUserTable = tx.table<DatabaseTypes.AuthUser, string>('authUsers');

    const existingRoles = await roleTable.toArray();
    const existingRoleIds = new Set(existingRoles.map((role) => role.id));
    const missingSystemRoles = RoleSeed.buildSystemRoles(now)
      .filter((role) => !existingRoleIds.has(role.id));

    if (missingSystemRoles.length > 0) {
      await roleTable.bulkPut(missingSystemRoles);
    }

    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }

    const users = await authUserTable.toArray();
    const migratedUsers = users
      .filter((user) => !user.role_id && RoleSeed.resolveLegacyRoleId(user.role))
      .map((user) => ({
        ...user,
        role_id: RoleSeed.resolveLegacyRoleId(user.role),
        role_name: RoleSeed.resolveLegacyRoleName(user.role),
      }));

    if (migratedUsers.length > 0) {
      await authUserTable.bulkPut(migratedUsers);
    }
  });

  db.version(44).stores({
    authUsers: 'id, name, email, role, role_id, role_name, employee_id, is_active, sync_status, created_at',
    employees: 'id, name, email, user_id, is_active, created_at',
  }).upgrade(async (tx) => {
    // Set default email for existing auth users who don't have one
    const authUsers = await tx.table<DatabaseTypes.AuthUser, string>('authUsers').toArray();
    const authUsersWithoutEmail = authUsers
      .filter((user) => !user.email)
      .map((user) => ({
        ...user,
        email: `${user.name.toLowerCase().replace(/\s+/g, '')}@frayukti.com`,
        sync_status: 'pending' as const,
      }));

    if (authUsersWithoutEmail.length > 0) {
      await tx.table<DatabaseTypes.AuthUser, string>('authUsers').bulkPut(authUsersWithoutEmail);
    }
  });

  db.version(45).stores({
    cooperativeLoanInstallments: 'id, loan_id, loan_number, member_id, member_number, due_date, status, collection_status, follow_up_date, paid_at, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const installments = await tx.table<DatabaseTypes.CooperativeLoanInstallment, string>('cooperativeLoanInstallments').toArray();
    const migratedInstallments = installments
      .filter((installment) => !installment.collection_status)
      .map((installment) => ({
        ...installment,
        collection_status: 'NONE' as const,
      }));

    if (migratedInstallments.length > 0) {
      await tx.table<DatabaseTypes.CooperativeLoanInstallment, string>('cooperativeLoanInstallments').bulkPut(migratedInstallments);
    }
  });

  db.version(46).stores({
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, cost_status, sync_status, updated_at, created_at',
    purchaseDocumentItems: 'id, document_id, product_id, cost_status',
    inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at',
    inventoryLotConsumptions: 'id, lot_id, product_id, source_type, source_id, source_line_id, created_at',
    purchaseCostReconciliations: 'id, purchase_document_id, supplier_invoice_number, created_at',
    purchaseCostReconciliationItems: 'id, reconciliation_id, purchase_document_item_id, product_id',
    transactionItems: 'id, transaction_id, product_id, hpp_status, created_at',
  }).upgrade(async (tx) => {
    const lots = await tx.table<DatabaseTypes.InventoryLot, string>('inventoryLots').toArray();
    const migratedLots = lots
      .filter((lot) => !lot.cost_status)
      .map((lot) => ({
        ...lot,
        cost_status: 'FINAL' as const,
        final_cost_per_unit: lot.cost_per_unit,
      }));

    if (migratedLots.length > 0) {
      await tx.table<DatabaseTypes.InventoryLot, string>('inventoryLots').bulkPut(migratedLots);
    }

    const transactionItems = await tx.table<DatabaseTypes.TransactionItem, string>('transactionItems').toArray();
    const migratedTransactionItems = transactionItems
      .filter((item) => !item.hpp_status || !item.profit_status)
      .map((item) => ({
        ...item,
        hpp_status: item.hpp_status ?? 'FINAL' as const,
        profit_status: item.profit_status ?? 'FINAL' as const,
      }));

    if (migratedTransactionItems.length > 0) {
      await tx.table<DatabaseTypes.TransactionItem, string>('transactionItems').bulkPut(migratedTransactionItems);
    }
  });

  db.version(47).stores({
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, created_at, updated_at',
    transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, created_at',
  });

  db.version(48).stores({
    cooperativeLoans: 'id, loan_number, member_id, member_number, status, interest_calculation_type, billing_frequency, application_date, disbursed_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const loanTable = tx.table<DatabaseTypes.CooperativeLoan, string>('cooperativeLoans');
    const loans = await loanTable.toArray();
    const migratedLoans = loans
      .filter((loan) => !loan.interest_calculation_type || !loan.billing_frequency || !loan.installment_count)
      .map((loan) => ({
        ...loan,
        interest_calculation_type: loan.interest_calculation_type ?? 'MONTHLY_RATE' as const,
        billing_frequency: loan.billing_frequency ?? 'MONTHLY' as const,
        installment_count: loan.installment_count ?? loan.tenor_months,
        loan_service_rate: loan.loan_service_rate ?? loan.interest_rate_per_month,
        loan_service_amount: loan.loan_service_amount ?? loan.total_interest_amount,
        admin_fee_rate: loan.admin_fee_rate ?? 0,
        admin_fee_amount: loan.admin_fee_amount ?? 0,
        mandatory_saving_rate: loan.mandatory_saving_rate ?? 0,
        mandatory_saving_amount: loan.mandatory_saving_amount ?? 0,
        deduction_method: loan.deduction_method ?? 'NONE' as const,
        net_disbursement_amount: loan.net_disbursement_amount ?? loan.principal_amount,
      }));

    if (migratedLoans.length > 0) {
      await loanTable.bulkPut(migratedLoans);
    }

    let adminIncomeAccountForMapping: DatabaseTypes.ChartOfAccount | undefined;
    const adminIncomeAccountSeed = ChartAccountConstants.DEFAULT_CHART_OF_ACCOUNTS.find((account) => account.id === 'cooperative-loan-admin-income');
    if (adminIncomeAccountSeed) {
      const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
      const existingAccount = await chartOfAccounts.get(adminIncomeAccountSeed.id)
        ?? await chartOfAccounts.where('code').equals(adminIncomeAccountSeed.code).first();

      if (!existingAccount) {
        adminIncomeAccountForMapping = {
          ...adminIncomeAccountSeed,
          created_at: now,
          updated_at: now,
        };
        await chartOfAccounts.put(adminIncomeAccountForMapping);
      } else {
        adminIncomeAccountForMapping = existingAccount;
      }
    }

    const adminFeeMappingSeed = ChartAccountConstants.DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find((mapping) => mapping.key === 'KSP_ADMIN_PINJAMAN');
    if (adminFeeMappingSeed) {
      const mappings = tx.table<DatabaseTypes.FinanceAccountMapping, string>('financeAccountMappings');
      const existingMapping = await mappings.get(adminFeeMappingSeed.key);

      if (!existingMapping) {
        await mappings.put({
          ...adminFeeMappingSeed,
          id: adminFeeMappingSeed.key,
          account_id: adminIncomeAccountForMapping?.id ?? adminFeeMappingSeed.account_id,
          account_code: adminIncomeAccountForMapping?.code ?? adminFeeMappingSeed.account_code,
          account_name: adminIncomeAccountForMapping?.name ?? adminFeeMappingSeed.account_name,
          account_type: adminIncomeAccountForMapping?.type ?? adminFeeMappingSeed.account_type,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const syncQueue = tx.table<DatabaseTypes.SyncQueueItem, string>('syncQueue');
    const queueItems = await syncQueue.toArray();
    const migratedQueueItems = queueItems
      .filter((queueItem) => queueItem.entity === 'cooperativeLoans' && queueItem.payload && typeof queueItem.payload === 'object')
      .map((queueItem) => {
        const payload = queueItem.payload as Partial<DatabaseTypes.CooperativeLoan>;
        return {
          ...queueItem,
          payload: {
            ...payload,
            interest_calculation_type: payload.interest_calculation_type ?? 'MONTHLY_RATE',
            billing_frequency: payload.billing_frequency ?? 'MONTHLY',
            installment_count: payload.installment_count ?? payload.tenor_months,
            loan_service_rate: payload.loan_service_rate ?? payload.interest_rate_per_month,
            loan_service_amount: payload.loan_service_amount ?? payload.total_interest_amount,
            admin_fee_rate: payload.admin_fee_rate ?? 0,
            admin_fee_amount: payload.admin_fee_amount ?? 0,
            mandatory_saving_rate: payload.mandatory_saving_rate ?? 0,
            mandatory_saving_amount: payload.mandatory_saving_amount ?? 0,
            deduction_method: payload.deduction_method ?? 'NONE',
            net_disbursement_amount: payload.net_disbursement_amount ?? payload.principal_amount,
          },
          updated_at: now,
        };
      });

    if (migratedQueueItems.length > 0) {
      await syncQueue.bulkPut(migratedQueueItems);
    }
  });

  db.version(49).stores({
    cooperativeMembers: 'id, member_number, name, area_id, officer_id, status, sync_status, updated_at, created_at',
  });

  db.version(50).stores({
    cooperativeFieldCashSessions: 'id, session_number, status, employee_id, cash_account_id, opened_at, closed_at, balance_status, created_at, updated_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
    employees: 'id, name, email, phone, user_id, login_role_id, field_cash_account_id, is_active, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }

    const employees = await tx.table<DatabaseTypes.Employee, string>('employees').toArray();
    const employeesWithFieldCashSnapshot = employees
      .filter((employee) => employee.field_cash_account_id && (!employee.field_cash_account_code || !employee.field_cash_account_name))
      .map(async (employee): Promise<DatabaseTypes.Employee> => {
        const account = await tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts').get(employee.field_cash_account_id ?? '');
        return {
          ...employee,
          field_cash_account_code: employee.field_cash_account_code ?? account?.code,
          field_cash_account_name: employee.field_cash_account_name ?? account?.name,
          updated_at: employee.updated_at ?? now,
        };
      });

    if (employeesWithFieldCashSnapshot.length > 0) {
      await tx.table<DatabaseTypes.Employee, string>('employees').bulkPut(await Promise.all(employeesWithFieldCashSnapshot));
    }
  });

  db.version(51).stores({
    cooperativeLoanPayments: 'id, payment_number, payment_type, loan_id, loan_number, installment_id, member_id, member_number, collector_id, received_by, payment_date, posted_at, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const members = await tx.table<DatabaseTypes.CooperativeMember, string>('cooperativeMembers').toArray();
    const memberById = new Map(members.map((member) => [member.id, member]));
    const payments = await tx.table<DatabaseTypes.CooperativeLoanPayment, string>('cooperativeLoanPayments').toArray();
    const migratedPayments = payments
      .filter((payment) => !payment.posted_at || !payment.collector_id)
      .map((payment) => {
        const member = memberById.get(payment.member_id);
        const collectorId = payment.collector_id ?? member?.officer_id;
        return {
          ...payment,
          collector_id: collectorId,
          collector_name: payment.collector_name ?? (
            collectorId === member?.officer_id ? member?.officer_name : undefined
          ),
          collector_position: payment.collector_position ?? (
            collectorId === member?.officer_id ? member?.officer_position : undefined
          ),
          received_by: payment.received_by ?? payment.created_by,
          received_by_name: payment.received_by_name ?? payment.created_by_name,
          posted_at: payment.posted_at ?? payment.created_at,
        };
      });

    if (migratedPayments.length > 0) {
      await tx.table<DatabaseTypes.CooperativeLoanPayment, string>('cooperativeLoanPayments').bulkPut(migratedPayments);
    }

    const syncQueue = tx.table<DatabaseTypes.SyncQueueItem, string>('syncQueue');
    const queueItems = await syncQueue.toArray();
    const migratedQueueItems = queueItems
      .filter((queueItem) => queueItem.entity === 'cooperativeLoanPayments' && queueItem.payload && typeof queueItem.payload === 'object')
      .map((queueItem) => {
        const payload = queueItem.payload as Partial<DatabaseTypes.CooperativeLoanPayment>;
        const member = payload.member_id ? memberById.get(payload.member_id) : undefined;
        const collectorId = payload.collector_id ?? member?.officer_id;
        return {
          ...queueItem,
          payload: {
            ...payload,
            collector_id: collectorId,
            collector_name: payload.collector_name ?? (
              collectorId === member?.officer_id ? member?.officer_name : undefined
            ),
            collector_position: payload.collector_position ?? (
              collectorId === member?.officer_id ? member?.officer_position : undefined
            ),
            received_by: payload.received_by ?? payload.created_by,
            received_by_name: payload.received_by_name ?? payload.created_by_name,
            posted_at: payload.posted_at ?? payload.created_at ?? now,
          },
          updated_at: now,
        };
      });

    if (migratedQueueItems.length > 0) {
      await syncQueue.bulkPut(migratedQueueItems);
    }
  });

  db.version(52).stores({
    employees: 'id, name, email, phone, user_id, login_role_id, field_cash_account_id, is_active, updated_at, created_at',
  });

  db.version(53).stores({
    stockOpnames: 'id, opname_number, status, counted_at, posted_at, warehouse_id, sync_status, updated_at, created_at',
    stockOpnameItems: 'id, opname_id, product_id, quantity_delta, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }
  });

  db.version(54).stores({
    stockOpnames: 'id, opname_number, status, counted_at, reviewed_at, posted_at, warehouse_id, sync_status, updated_at, created_at',
    stockOpnameItems: 'id, opname_id, product_id, quantity_delta, created_at',
  });

  db.version(55).stores({
    contacts: 'id, name, contact_type, phone, email, is_active, is_member, membership_number, sync_status, created_at',
    transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, member_contact_id, member_number, created_at',
    membershipPointTransactions: 'id, contact_id, membership_number, transaction_id, transaction_number, type, created_at',
    membershipSettings: 'id, updated_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const membershipSettings = tx.table<DatabaseTypes.MembershipSetting, string>('membershipSettings');

    if (!await membershipSettings.get('default')) {
      await membershipSettings.put({
        id: 'default',
        earning_amount: 1000,
        earning_points: 1,
        point_value: 1,
        redeem_enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
  });

  db.version(56).stores({
    productRecipes: 'id, finished_product_id, finished_product_name, created_at, updated_at',
    productRecipeItems: 'id, recipe_id, material_product_id',
    productionOrders: 'id, production_number, status, finished_product_id, produced_at, sync_status, updated_at, created_at',
    productionOrderItems: 'id, production_order_id, material_product_id',
    productionOrderCosts: 'id, production_order_id',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }
  });

  db.version(57).stores({
    employeeCollectionSchedules: 'id, employee_id, area_id, weekday, [employee_id+area_id], [employee_id+area_id+weekday], is_active, effective_from, effective_until, updated_at, created_at',
    cooperativeLoans: 'id, loan_number, member_id, member_number, officer_id, area_id, collection_schedule_id, collection_weekday, status, interest_calculation_type, billing_frequency, application_date, disbursed_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const loanTable = tx.table<DatabaseTypes.CooperativeLoan, string>('cooperativeLoans');
    const [loans, members, installments] = await Promise.all([
      loanTable.toArray(),
      tx.table<DatabaseTypes.CooperativeMember, string>('cooperativeMembers').toArray(),
      tx.table<DatabaseTypes.CooperativeLoanInstallment, string>('cooperativeLoanInstallments').toArray(),
    ]);
    const memberById = new Map(members.map((member) => [member.id, member]));
    const firstInstallmentByLoanId = new Map<string, DatabaseTypes.CooperativeLoanInstallment>();

    installments.forEach((installment) => {
      const current = firstInstallmentByLoanId.get(installment.loan_id);
      if (
        !current ||
        installment.installment_number < current.installment_number ||
        (
          installment.installment_number === current.installment_number &&
          installment.due_date < current.due_date
        )
      ) {
        firstInstallmentByLoanId.set(installment.loan_id, installment);
      }
    });

    const migratedLoans = loans.flatMap((loan): DatabaseTypes.CooperativeLoan[] => {
      if (loan.status !== 'DISBURSED' && loan.status !== 'PAID_OFF') return [];

      const member = memberById.get(loan.member_id);
      const officerId = loan.officer_id ?? member?.officer_id;
      const areaId = loan.area_id ?? member?.area_id;
      const firstInstallment = firstInstallmentByLoanId.get(loan.id);
      const firstDueDate = firstInstallment
        ? dayjs(firstInstallment.due_date).tz()
        : undefined;
      const dueDateWeekday = firstDueDate?.isValid()
        ? ((firstDueDate.day() || 7) as DatabaseTypes.CooperativeLoan['collection_weekday'])
        : undefined;
      const migratedLoan: DatabaseTypes.CooperativeLoan = {
        ...loan,
        officer_id: officerId,
        officer_name: loan.officer_name ?? (
          member && officerId === member.officer_id ? member.officer_name : undefined
        ),
        officer_position: loan.officer_position ?? (
          member && officerId === member.officer_id ? member.officer_position : undefined
        ),
        area_id: areaId,
        area_name: loan.area_name ?? (
          member && areaId === member.area_id ? member.area_name : undefined
        ),
        area_code: loan.area_code ?? (
          member && areaId === member.area_id ? member.area_code : undefined
        ),
        collection_weekday: loan.collection_weekday ?? dueDateWeekday,
      };
      const changed =
        migratedLoan.officer_id !== loan.officer_id ||
        migratedLoan.officer_name !== loan.officer_name ||
        migratedLoan.officer_position !== loan.officer_position ||
        migratedLoan.area_id !== loan.area_id ||
        migratedLoan.area_name !== loan.area_name ||
        migratedLoan.area_code !== loan.area_code ||
        migratedLoan.collection_weekday !== loan.collection_weekday;

      if (!changed) return [];
      return [{
        ...migratedLoan,
        sync_status: 'pending',
        sync_error: undefined,
        updated_at: now,
      }];
    });

    if (migratedLoans.length > 0) {
      await loanTable.bulkPut(migratedLoans);
    }
  });

  db.version(58).stores({
    authSessions: 'id, user_id, last_active_at, server_session_expires_at',
    cooperativeLoanPayments: 'id, payment_number, payment_type, loan_id, loan_number, installment_id, member_id, member_number, collector_id, received_by, payment_date, posted_at, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, idempotency_key, sync_status, updated_at, created_at',
    cooperativeLoanCollectionEvents: 'id, installment_id, loan_id, member_id, collection_status, contacted_at, actor_user_id, actor_employee_id, created_at',
  }).upgrade(async (tx) => {
    const installments = await tx
      .table<DatabaseTypes.CooperativeLoanInstallment, string>('cooperativeLoanInstallments')
      .toArray();
    const events = installments.flatMap((installment): DatabaseTypes.CooperativeLoanCollectionEvent[] => {
      if (
        !installment.collection_status ||
        installment.collection_status === 'NONE' ||
        !installment.collection_notes?.trim()
      ) {
        return [];
      }

      const contactedAt = installment.last_contacted_at ?? installment.updated_at;
      return [{
        id: `legacy-${installment.id}-${contactedAt}`,
        installment_id: installment.id,
        loan_id: installment.loan_id,
        loan_number: installment.loan_number,
        member_id: installment.member_id,
        member_number: installment.member_number,
        member_name: installment.member_name,
        collection_status: installment.collection_status,
        follow_up_date: installment.follow_up_date,
        collection_notes: installment.collection_notes,
        contacted_at: contactedAt,
        created_at: contactedAt,
        sync_status: 'pending',
      }];
    });

    if (events.length > 0) {
      await tx
        .table<DatabaseTypes.CooperativeLoanCollectionEvent, string>('cooperativeLoanCollectionEvents')
        .bulkPut(events);
    }
  });

  db.version(59).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const legacyPermissionExpansions: Partial<Record<
      DatabaseTypes.RolePermission['permission_code'],
      DatabaseTypes.RolePermission['permission_code'][]
    >> = {
      STOCK_ACCESS: ['PRODUCT_MANAGE', 'UNIT_MANAGE'],
      SETTINGS_ACCESS: [
        'PROMO_MANAGE',
        'CONTACT_MANAGE',
        'WAREHOUSE_MANAGE',
        'CURRENCY_MANAGE',
        'AREA_MANAGE',
        'EMPLOYEE_MANAGE',
        'DEPARTMENT_MANAGE',
        'PROJECT_MANAGE',
        'TAX_MANAGE',
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

  db.version(60).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<DatabaseTypes.RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const documentPermissions: DatabaseTypes.RolePermission['permission_code'][] = [
      'SALES_QUOTATION_MANAGE',
      'SALES_ORDER_MANAGE',
      'SALES_DELIVERY_MANAGE',
      'SALES_INVOICE_MANAGE',
      'PURCHASE_REQUEST_MANAGE',
      'PURCHASE_RFQ_MANAGE',
      'PURCHASE_ORDER_MANAGE',
      'PURCHASE_RECEIPT_MANAGE',
      'PURCHASE_INVOICE_MANAGE',
      'PURCHASE_RETURN_MANAGE',
    ];
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'FINANCE_ACCESS')
      .flatMap((legacyPermission) => documentPermissions.flatMap((permissionCode) => {
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
      }));
    const systemPermissions = RoleSeed.buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });
}
