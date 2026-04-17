import Dexie, { Table } from 'dexie';
import { Product, Transaction, TransactionItem, StockPurchase, ProfitLog, ProfitBalance, ShoppingNote, FinanceTransaction, FinanceBalance, UnitConversion } from '@/types';
import { DEFAULT_CONVERSIONS } from '@/constants/units';

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

    this.on('populate', async () => {
      await this.unitConversions.bulkAdd(DEFAULT_CONVERSIONS);
    });
  }
}

export const db = new KasirkuDB();
