import type {
  AccountingInitialSetupSetting,
  AccountingProfileSetting,
  ActivityLog,
  AuthUser,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
  EnabledModule,
  FinanceAccountMapping,
  GeneralLedgerSetting,
  JournalEntry,
  JournalEntryLine,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  ProductionOrder,
  ProductionOrderCost,
  ProductionOrderItem,
  Role,
  RolePermission,
} from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV125(db: KasirkuDB) {
  db.version(125).stores({}).upgrade(async (migration) => {
    await migration.table<Employee>('employees').toCollection().modify((employee) => {
      employee.created_at = normalizeStoredTimestamp(employee.created_at) ?? employee.created_at;
      employee.updated_at = normalizeStoredTimestamp(employee.updated_at) ?? employee.updated_at;
      employee.last_synced_at = normalizeStoredTimestamp(employee.last_synced_at);
      employee.remote_updated_at = normalizeStoredTimestamp(employee.remote_updated_at);
    });

    await migration.table<EmployeeArea>('employeeAreas').toCollection().modify((area) => {
      area.created_at = normalizeStoredTimestamp(area.created_at) ?? area.created_at;
      area.updated_at = normalizeStoredTimestamp(area.updated_at) ?? area.updated_at;
      area.last_synced_at = normalizeStoredTimestamp(area.last_synced_at);
      area.remote_updated_at = normalizeStoredTimestamp(area.remote_updated_at);
    });

    await migration.table<EmployeeCollectionSchedule>('employeeCollectionSchedules').toCollection().modify((schedule) => {
      schedule.created_at = normalizeStoredTimestamp(schedule.created_at) ?? schedule.created_at;
      schedule.updated_at = normalizeStoredTimestamp(schedule.updated_at) ?? schedule.updated_at;
      schedule.last_synced_at = normalizeStoredTimestamp(schedule.last_synced_at);
      schedule.remote_updated_at = normalizeStoredTimestamp(schedule.remote_updated_at);
    });

    await migration.table<JournalEntry>('journalEntries').toCollection().modify((entry) => {
      entry.created_at = normalizeStoredTimestamp(entry.created_at) ?? entry.created_at;
      entry.updated_at = normalizeStoredTimestamp(entry.updated_at) ?? entry.updated_at;
      entry.posted_at = normalizeStoredTimestamp(entry.posted_at);
      entry.voided_at = normalizeStoredTimestamp(entry.voided_at);
      entry.deleted_at = normalizeStoredTimestamp(entry.deleted_at);
      entry.last_synced_at = normalizeStoredTimestamp(entry.last_synced_at);
      entry.remote_updated_at = normalizeStoredTimestamp(entry.remote_updated_at);
    });

    await migration.table<JournalEntryLine>('journalEntryLines').toCollection().modify((line) => {
      line.created_at = normalizeStoredTimestamp(line.created_at) ?? line.created_at;
    });

    await migration.table<ProductionOrder>('productionOrders').toCollection().modify((order) => {
      order.produced_at = normalizeStoredTimestamp(order.produced_at) ?? order.produced_at;
      order.posted_at = normalizeStoredTimestamp(order.posted_at);
      order.voided_at = normalizeStoredTimestamp(order.voided_at);
      order.created_at = normalizeStoredTimestamp(order.created_at) ?? order.created_at;
      order.updated_at = normalizeStoredTimestamp(order.updated_at) ?? order.updated_at;
      order.last_synced_at = normalizeStoredTimestamp(order.last_synced_at);
      order.remote_updated_at = normalizeStoredTimestamp(order.remote_updated_at);
    });

    await migration.table<ProductionOrderItem>('productionOrderItems').toCollection().modify((item) => {
      item.created_at = normalizeStoredTimestamp(item.created_at) ?? item.created_at;
      item.updated_at = normalizeStoredTimestamp(item.updated_at) ?? item.updated_at;
    });

    await migration.table<ProductionOrderCost>('productionOrderCosts').toCollection().modify((cost) => {
      cost.created_at = normalizeStoredTimestamp(cost.created_at) ?? cost.created_at;
      cost.updated_at = normalizeStoredTimestamp(cost.updated_at) ?? cost.updated_at;
    });

    await migration.table<FinanceAccountMapping>('financeAccountMappings').toCollection().modify((mapping) => {
      mapping.created_at = normalizeStoredTimestamp(mapping.created_at) ?? mapping.created_at;
      mapping.updated_at = normalizeStoredTimestamp(mapping.updated_at) ?? mapping.updated_at;
      mapping.last_synced_at = normalizeStoredTimestamp(mapping.last_synced_at);
      mapping.remote_updated_at = normalizeStoredTimestamp(mapping.remote_updated_at);
    });

    await migration.table<AccountingProfileSetting>('accountingProfileSetting').toCollection().modify((setting) => {
      setting.created_at = normalizeStoredTimestamp(setting.created_at) ?? setting.created_at;
      setting.updated_at = normalizeStoredTimestamp(setting.updated_at) ?? setting.updated_at;
      setting.last_synced_at = normalizeStoredTimestamp(setting.last_synced_at);
      setting.remote_updated_at = normalizeStoredTimestamp(setting.remote_updated_at);
    });

    await migration.table<AccountingInitialSetupSetting>('accountingInitialSetupSetting').toCollection().modify((setting) => {
      setting.setup_completed_at = normalizeStoredTimestamp(setting.setup_completed_at);
      setting.created_at = normalizeStoredTimestamp(setting.created_at) ?? setting.created_at;
      setting.updated_at = normalizeStoredTimestamp(setting.updated_at) ?? setting.updated_at;
      setting.last_synced_at = normalizeStoredTimestamp(setting.last_synced_at);
      setting.remote_updated_at = normalizeStoredTimestamp(setting.remote_updated_at);
    });

    await migration.table<EnabledModule>('enabledModules').toCollection().modify((module) => {
      module.created_at = normalizeStoredTimestamp(module.created_at) ?? module.created_at;
      module.updated_at = normalizeStoredTimestamp(module.updated_at) ?? module.updated_at;
      module.last_synced_at = normalizeStoredTimestamp(module.last_synced_at);
      module.remote_updated_at = normalizeStoredTimestamp(module.remote_updated_at);
    });

    await migration.table<GeneralLedgerSetting>('generalLedgerSetting').toCollection().modify((setting) => {
      setting.created_at = normalizeStoredTimestamp(setting.created_at) ?? setting.created_at;
      setting.updated_at = normalizeStoredTimestamp(setting.updated_at) ?? setting.updated_at;
      setting.last_synced_at = normalizeStoredTimestamp(setting.last_synced_at);
      setting.remote_updated_at = normalizeStoredTimestamp(setting.remote_updated_at);
    });

    await migration.table<OpeningBalanceBatch>('openingBalanceBatches').toCollection().modify((batch) => {
      batch.cutoff_date = normalizeStoredTimestamp(batch.cutoff_date) ?? batch.cutoff_date;
      batch.accounting_start_date = normalizeStoredTimestamp(batch.accounting_start_date);
      batch.posted_at = normalizeStoredTimestamp(batch.posted_at);
      batch.locked_at = normalizeStoredTimestamp(batch.locked_at);
      batch.reversed_at = normalizeStoredTimestamp(batch.reversed_at);
      batch.skipped_at = normalizeStoredTimestamp(batch.skipped_at);
      batch.validated_at = normalizeStoredTimestamp(batch.validated_at);
      batch.created_at = normalizeStoredTimestamp(batch.created_at) ?? batch.created_at;
      batch.updated_at = normalizeStoredTimestamp(batch.updated_at) ?? batch.updated_at;
      batch.deleted_at = normalizeStoredTimestamp(batch.deleted_at);
      batch.last_synced_at = normalizeStoredTimestamp(batch.last_synced_at);
      batch.remote_updated_at = normalizeStoredTimestamp(batch.remote_updated_at);
    });

    await migration.table<OpeningBalanceLine>('openingBalanceLines').toCollection().modify((line) => {
      line.document_date = normalizeStoredTimestamp(line.document_date);
      line.due_date = normalizeStoredTimestamp(line.due_date);
      line.last_paid_at = normalizeStoredTimestamp(line.last_paid_at);
      line.created_at = normalizeStoredTimestamp(line.created_at) ?? line.created_at;
      line.updated_at = normalizeStoredTimestamp(line.updated_at) ?? line.updated_at;
      line.last_synced_at = normalizeStoredTimestamp(line.last_synced_at);
      line.remote_updated_at = normalizeStoredTimestamp(line.remote_updated_at);
    });

    await migration.table<AuthUser>('authUsers').toCollection().modify((user) => {
      user.created_at = normalizeStoredTimestamp(user.created_at) ?? user.created_at;
      user.updated_at = normalizeStoredTimestamp(user.updated_at) ?? user.updated_at;
      user.last_synced_at = normalizeStoredTimestamp(user.last_synced_at);
      user.remote_updated_at = normalizeStoredTimestamp(user.remote_updated_at);
    });

    await migration.table<Role>('roles').toCollection().modify((role) => {
      role.created_at = normalizeStoredTimestamp(role.created_at) ?? role.created_at;
      role.updated_at = normalizeStoredTimestamp(role.updated_at) ?? role.updated_at;
      role.last_synced_at = normalizeStoredTimestamp(role.last_synced_at);
      role.remote_updated_at = normalizeStoredTimestamp(role.remote_updated_at);
    });

    await migration.table<RolePermission>('rolePermissions').toCollection().modify((permission) => {
      permission.created_at = normalizeStoredTimestamp(permission.created_at) ?? permission.created_at;
      permission.updated_at = normalizeStoredTimestamp(permission.updated_at) ?? permission.updated_at;
      permission.last_synced_at = normalizeStoredTimestamp(permission.last_synced_at);
      permission.remote_updated_at = normalizeStoredTimestamp(permission.remote_updated_at);
    });

    await migration.table<ActivityLog>('activityLogs').toCollection().modify((log) => {
      log.created_at = normalizeStoredTimestamp(log.created_at) ?? log.created_at;
    });
  });
}
