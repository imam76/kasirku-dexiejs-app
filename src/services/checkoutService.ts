import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { CartItem, PaymentMethod, Transaction, TransactionItem } from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { getCartItemOriginalPrice, getCartItemPrice, konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createSalesUnitSnapshot } from '@/utils/salesUnits';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { evaluatePromos, getActivePromos, type PromoEvaluationResult } from '@/services/promoService';
import { getCashOrBankAccountForPayment, postPosSaleJournal } from '@/services/generalLedgerService';

interface CheckoutInput {
  cart: CartItem[];
  payment: number;
  paymentMethod: PaymentMethod;
  voucherCode?: string;
}

export interface CheckoutResult {
  transaction: Transaction;
  items: TransactionItem[];
}

const createTransactionItems = (
  cart: CartItem[],
  transactionId: string,
  createdAt: string,
  promoEvaluation: PromoEvaluationResult,
): TransactionItem[] => {
  return cart.map((item, index) => {
    const originalPrice = getCartItemOriginalPrice(item);
    const promoLine = promoEvaluation.lines[index];
    const priceBeforeDiscount = promoLine?.price_before_discount ?? getCartItemPrice(item);
    const subtotalBeforeDiscount = promoLine?.subtotal_before_discount ?? priceBeforeDiscount * item.quantity;
    const discountAmount = promoLine?.discount_amount ?? 0;
    const sellingPrice = promoLine?.final_unit_price ?? priceBeforeDiscount;
    const finalSubtotal = promoLine?.final_subtotal ?? sellingPrice * item.quantity;
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
      price_before_discount: priceBeforeDiscount,
      subtotal_before_discount: subtotalBeforeDiscount,
      discount_amount: discountAmount,
      subtotal: finalSubtotal,
      profit: finalSubtotal - normalizedPurchasePrice * item.quantity,
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
  const cashAccount = await getCashOrBankAccountForPayment(transaction.payment_method);

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
    payment_method: transaction.payment_method,
    cash_account_id: cashAccount.id,
    cash_account_code: cashAccount.code,
    cash_account_name: cashAccount.name,
    ...await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES),
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
  payment,
  paymentMethod,
  voucherCode,
}: CheckoutInput): Promise<CheckoutResult> => {
  const currentUser = await getCurrentSessionUser();
  const hasEditedPrice = cart.some((item) => item.custom_price !== undefined);
  if (hasEditedPrice) {
    requireRolePermission(currentUser?.role, 'TRANSACTION_EDIT_PRICE');
  }

  const now = new Date();
  const transactionId = crypto.randomUUID();
  const transactionNumber = `TRX-${Date.now()}`;
  const createdAt = now.toISOString();
  const activePromos = await getActivePromos(now);
  const promoEvaluation = evaluatePromos({
    cart,
    promos: activePromos,
    voucherCode,
    now,
  });
  const finalTotal = promoEvaluation.total_amount;
  const finalPayment = paymentMethod === 'NON_TUNAI' ? finalTotal : payment;
  const change = paymentMethod === 'NON_TUNAI' ? 0 : finalPayment - finalTotal;

  if (!Number.isFinite(finalPayment) || finalPayment < finalTotal) {
    throw new Error('Jumlah pembayaran tidak valid atau kurang.');
  }

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
      db.chartOfAccounts,
      db.financeAccountMappings,
      db.enabledModules,
      db.journalEntries,
      db.journalEntryLines,
    ],
    async () => {
      const transaction: Transaction = {
        id: transactionId,
        transaction_number: transactionNumber,
        subtotal_amount: promoEvaluation.subtotal_before_discount,
        discount_amount: promoEvaluation.discount_amount,
        discount_breakdown: promoEvaluation.discount_breakdown,
        applied_promos_snapshot: promoEvaluation.applied_promos_snapshot,
        total_amount: finalTotal,
        payment_amount: finalPayment,
        change_amount: change,
        payment_method: paymentMethod,
        status: 'COMPLETED',
        receipt_status: 'pending',
        created_at: createdAt,
      };

      const items = createTransactionItems(cart, transactionId, createdAt, promoEvaluation);

      await db.transactions.add(transaction);
      await db.transactionItems.bulkAdd(items);
      await recordProfit(transaction, items, createdAt);
      await recordFinanceIncome(transaction, createdAt);
      await postPosSaleJournal(transaction, items);
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
