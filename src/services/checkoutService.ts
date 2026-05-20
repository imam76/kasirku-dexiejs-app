import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { CartItem, PaymentMethod, Transaction, TransactionItem } from '@/types';
import { getCartItemOriginalPrice, getCartItemPrice, konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createSalesUnitSnapshot } from '@/utils/salesUnits';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';

interface CheckoutInput {
  cart: CartItem[];
  total: number;
  payment: number;
  paymentMethod: PaymentMethod;
}

export interface CheckoutResult {
  transaction: Transaction;
  items: TransactionItem[];
}

const createTransactionItems = (
  cart: CartItem[],
  transactionId: string,
  createdAt: string,
): TransactionItem[] => {
  return cart.map((item) => {
    const originalPrice = getCartItemOriginalPrice(item);
    const sellingPrice = getCartItemPrice(item);
    const isPriceEdited = item.custom_price !== undefined;
    const normalizedPurchasePrice = normalisasiHargaProduk(
      item.product.purchase_price,
      item.product,
      item.product.purchase_unit,
      item.unit,
    );
    const unitSnapshot = createSalesUnitSnapshot(item.unit, item.product);

    return {
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      product_id: item.product.id,
      product_name: item.product.name,
      price: sellingPrice,
      selling_price: sellingPrice,
      original_price: isPriceEdited ? originalPrice : undefined,
      is_price_edited: isPriceEdited,
      price_edited_by: item.price_edited_by,
      price_edited_at: item.price_edited_at,
      purchase_price: normalizedPurchasePrice,
      unit: item.unit,
      ...unitSnapshot,
      quantity: item.quantity,
      subtotal: sellingPrice * item.quantity,
      profit: (sellingPrice - normalizedPurchasePrice) * item.quantity,
      created_at: createdAt,
    };
  });
};

const recordProfit = async (
  transaction: Transaction,
  items: TransactionItem[],
  createdAt: string,
) => {
  const totalProfit = items.reduce((sum, item) => sum + item.profit, 0);
  const currentBalance = await db.profitBalance.get('current');
  const newBalance = (currentBalance?.amount || 0) + totalProfit;

  await db.profitBalance.put({
    id: 'current',
    amount: newBalance,
    updated_at: createdAt,
  });

  await db.profitLogs.add({
    id: crypto.randomUUID(),
    transaction_id: transaction.id,
    amount: totalProfit,
    type: 'IN',
    category: 'SALES',
    description: `Keuntungan dari transaksi ${transaction.transaction_number}`,
    created_at: createdAt,
    balance_after: newBalance,
  });
};

const recordFinanceIncome = async (transaction: Transaction, createdAt: string) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const newFinanceBalance = (currentFinanceBalance?.amount || 0) + transaction.total_amount;

  await db.financeBalance.put({
    id: 'current',
    amount: newFinanceBalance,
    updated_at: createdAt,
  });

  await db.financeTransactions.add({
    id: crypto.randomUUID(),
    type: 'INCOME',
    category: FINANCE_CATEGORIES.SALES,
    amount: transaction.total_amount,
    description: `Penjualan dari transaksi ${transaction.transaction_number}`,
    created_at: createdAt,
    reference_id: transaction.id,
  });
};

const reduceProductStock = async (cart: CartItem[]) => {
  for (const item of cart) {
    const product = await db.products.get(item.product.id);
    if (!product) continue;

    const quantityInStockUnit = konversiSatuanProduk(
      item.quantity,
      product,
      item.unit,
      product.purchase_unit,
    );

    await db.products.update(item.product.id, {
      stock: product.stock - quantityInStockUnit,
    });
  }
};

export const checkout = async ({
  cart,
  total,
  payment,
  paymentMethod,
}: CheckoutInput): Promise<CheckoutResult> => {
  const currentUser = await getCurrentSessionUser();
  const hasEditedPrice = cart.some((item) => item.custom_price !== undefined);
  if (hasEditedPrice) {
    requireRolePermission(currentUser?.role, 'TRANSACTION_EDIT_PRICE');
  }

  const transactionId = crypto.randomUUID();
  const transactionNumber = `TRX-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const change = paymentMethod === 'NON_TUNAI' ? 0 : payment - total;

  return db.transaction(
    'rw',
    [
      db.transactions,
      db.transactionItems,
      db.products,
      db.profitLogs,
      db.profitBalance,
      db.financeTransactions,
      db.financeBalance,
      db.activityLogs,
    ],
    async () => {
      const transaction: Transaction = {
        id: transactionId,
        transaction_number: transactionNumber,
        total_amount: total,
        payment_amount: payment,
        change_amount: change,
        payment_method: paymentMethod,
        status: 'COMPLETED',
        receipt_status: 'pending',
        created_at: createdAt,
      };

      const items = createTransactionItems(cart, transactionId, createdAt);

      await db.transactions.add(transaction);
      await db.transactionItems.bulkAdd(items);
      await recordProfit(transaction, items, createdAt);
      await recordFinanceIncome(transaction, createdAt);
      await reduceProductStock(cart);

      for (const item of items.filter((item) => item.is_price_edited)) {
        await writeActivityLog({
          user: currentUser,
          action: 'TRANSACTION_EDIT_PRICE',
          entity: 'transactionItems',
          entity_id: item.id,
          description: `${currentUser?.name ?? 'User'} mengubah harga item ${item.product_name} dari Rp ${item.original_price ?? item.price} menjadi Rp ${item.price} di transaksi ${transaction.transaction_number}.`,
        });
      }

      return { transaction, items };
    },
  );
};
