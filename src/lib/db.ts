import Dexie, { Table } from 'dexie';
import { Product, Transaction, TransactionItem, StockPurchase, ProfitLog, ProfitBalance, ShoppingNote, FinanceTransaction, FinanceBalance, UnitConversion, UnitDefinition, AuthUser, AuthSession, ActivityLog, Promo, Contact, Department } from '@/types';
import { createUnitDefinition, DEFAULT_CONVERSIONS, DEFAULT_UNITS } from '@/constants/units';

export class KasirkuDB extends Dexie {
  products!: Table<Product>;
  transactions!: Table<Transaction>;
  transactionItems!: Table<TransactionItem>;
  stockPurchases!: Table<StockPurchase>;
  profitLogs!: Table<ProfitLog>;
  profitBalance!: Table<ProfitBalance>;
  shoppingNotes!: Table<ShoppingNote>;
  financeTransactions!: Table<FinanceTransaction>;
  financeBalance!: Table<FinanceBalance>;
  unitConversions!: Table<UnitConversion>;
  units!: Table<UnitDefinition>;
  authUsers!: Table<AuthUser>;
  authSessions!: Table<AuthSession>;
  activityLogs!: Table<ActivityLog>;
  promos!: Table<Promo>;
  contacts!: Table<Contact>;
  departments!: Table<Department>;

  constructor() {
    super('KasirkuDB');
    this.version(1).stores({
      products: 'id, name, sku, created_at',
      transactions: 'id, transaction_number, created_at',
      transactionItems: 'id, transaction_id, product_id',
      stockPurchases: 'id, product_id, created_at'
    });
    this.version(2).stores({
      transactionItems: 'id, transaction_id, product_id, created_at'
    });
    this.version(3).stores({
      profitLogs: 'id, transaction_id, created_at',
      profitBalance: 'id'
    });
    this.version(4).stores({
      profitLogs: 'id, transaction_id, type, created_at'
    });
    this.version(5).stores({
      shoppingNotes: 'id, created_at'
    });
    this.version(6).stores({
      financeTransactions: 'id, type, category, created_at, reference_id',
      financeBalance: 'id'
    });
    this.version(7).stores({
      unitConversions: 'id, fromUnit, toUnit'
    });

    this.version(8).stores({
      transactions: 'id, transaction_number, payment_method, created_at'
    });

    this.version(9).stores({
      products: 'id, name, sku, created_at'
    });

    this.version(10).stores({
      units: 'id, name, type'
    }).upgrade(async (tx) => {
      const conversions = await tx.table<UnitConversion, string>('unitConversions').toArray();
      const units = new Map(DEFAULT_UNITS.map((unit) => [unit.id, unit]));

      conversions.forEach((conversion) => {
        if (!units.has(conversion.fromUnit)) {
          units.set(conversion.fromUnit, createUnitDefinition(conversion.fromUnit));
        }
        if (!units.has(conversion.toUnit)) {
          units.set(conversion.toUnit, createUnitDefinition(conversion.toUnit));
        }
      });

      await tx.table<UnitDefinition, string>('units').bulkPut(Array.from(units.values()));
    });

    this.version(11).stores({
      authUsers: 'id, role, is_active, created_at',
      authSessions: 'id, user_id, last_active_at',
      activityLogs: 'id, user_id, action, entity, created_at'
    });

    this.version(12).stores({
      promos: 'id, active, type, applies_to, voucher_code, priority, start_at, end_at, created_at'
    });

    this.version(13).stores({
      contacts: 'id, name, contact_type, phone, email, is_active, created_at'
    });

    this.version(14).stores({
      departments: 'id, name, code, is_active, created_at'
    });

    this.on('populate', async () => {
      await this.units.bulkAdd(DEFAULT_UNITS);
      await this.unitConversions.bulkAdd(DEFAULT_CONVERSIONS);
    });
  }
}

export const db = new KasirkuDB();
