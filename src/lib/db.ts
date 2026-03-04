import Dexie, { Table } from 'dexie';
import { Product, Transaction, TransactionItem, StockPurchase, ProfitLog, ProfitBalance, ShoppingNote } from '@/types';

export class KasirkuDB extends Dexie {
  products!: Table<Product>;
  transactions!: Table<Transaction>;
  transactionItems!: Table<TransactionItem>;
  stockPurchases!: Table<StockPurchase>;
  profitLogs!: Table<ProfitLog>;
  profitBalance!: Table<ProfitBalance>;
  shoppingNotes!: Table<ShoppingNote>;

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
  }
}

export const db = new KasirkuDB();
