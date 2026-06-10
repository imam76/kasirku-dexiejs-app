import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { CartItem, FinanceTransaction, PaymentMethod, StockMutation, Transaction, TransactionItem, AuthUser } from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { getCartItemPrice, konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createSalesUnitSnapshot } from '@/utils/salesUnits';
import { getCurrentSessionUser } from '@/auth/authService';
import { evaluatePromos, getActivePromos, type PromoEvaluationResult } from '@/services/promoService';
import { getCashOrBankAccountForPayment, postPosSaleJournal } from '@/services/generalLedgerService';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { consumeFifoLots } from '@/utils/inventory/consumeFifoLots';

interface CheckoutInput {
  cart: CartItem[];
  payment: number;
  paymentMethod: PaymentMethod;
  voucherCode?: string;
}

export interface CheckoutResult {
  transaction: Transaction;
  items: TransactionItem[];
  warnings?: string[];
}

interface CreateTransactionItemsResult {
  items: TransactionItem[];
  warnings: string[];
}

const createTransactionItems = async (
  cart: CartItem[],
  transactionId: string,
  createdAt: string,
  promoEvaluation: PromoEvaluationResult,
): Promise<CreateTransactionItemsResult> => {
  const items: TransactionItem[] = [];
  const warnings: string[] = [];

  for (const [index, item] of cart.entries()) {
    const transactionItemId = crypto.randomUUID();
    const promoLine = promoEvaluation.lines[index];

    const priceBeforeDiscount =
      promoLine?.price_before_discount ?? getCartItemPrice(item);

    const subtotalBeforeDiscount =
      promoLine?.subtotal_before_discount ?? priceBeforeDiscount * item.quantity;

    const discountAmount = promoLine?.discount_amount ?? 0;

    const sellingPrice =
      promoLine?.final_unit_price ?? priceBeforeDiscount;

    const finalSubtotal =
      promoLine?.final_subtotal ?? sellingPrice * item.quantity;

    const unitSnapshot = createSalesUnitSnapshot(item.unit, item.product);

    // Quantity dikonversi ke purchase_unit / stock unit
    const quantityInStockUnit = konversiSatuanProduk(
      item.quantity,
      item.product,
      item.unit,
      item.product.purchase_unit,
    );

    // Ambil HPP aktual berdasarkan FIFO lot
    const fifoResult = await consumeFifoLots(
      item.product.id,
      quantityInStockUnit,
      {
        sourceType: 'POS_TRANSACTION',
        sourceId: transactionId,
        sourceLineId: transactionItemId,
        createdAt,
      },
    );
    const hasEstimatedCost = fifoResult.consumedLots.some((lot) => lot.costStatus !== 'FINAL');
    const estimatedProfit = finalSubtotal - fifoResult.totalCost;

    if (finalSubtotal <= 0) {
      throw new Error(`Harga jual ${item.product.name} belum valid.`);
    }

    if (hasEstimatedCost) {
      warnings.push(`HPP ${item.product.name} masih memakai harga sementara.`);
    }

    if (hasEstimatedCost && estimatedProfit < 0) {
      throw new Error(`Margin estimasi ${item.product.name} negatif. Transaksi diblokir sampai harga beli final/aman.`);
    }

    // weightedAvgCostPerUnit berasal dari purchase_unit,
    // lalu dinormalisasi ke unit jual item
    const normalizedPurchasePrice = normalisasiHargaProduk(
      fifoResult.weightedAvgCostPerUnit,
      item.product,
      item.product.purchase_unit,
      item.unit,
    );

    items.push({
      id: transactionItemId,
      transaction_id: transactionId,
      product_id: item.product.id,
      product_name: item.product.name,

      price: sellingPrice,
      selling_price: sellingPrice,
      is_price_edited: false,

      purchase_price: normalizedPurchasePrice,

      unit: item.unit,
      ...unitSnapshot,

      quantity: item.quantity,

      price_before_discount: priceBeforeDiscount,
      subtotal_before_discount: subtotalBeforeDiscount,
      discount_amount: discountAmount,
      subtotal: finalSubtotal,

      // Lebih akurat karena pakai totalCost FIFO,
      // bukan purchase_price rata-rata dikali quantity
      profit: finalSubtotal - fifoResult.totalCost,
      hpp_status: hasEstimatedCost ? 'ESTIMATED' : 'FINAL',
      profit_status: hasEstimatedCost ? 'ESTIMATED' : 'FINAL',

      created_at: createdAt,
    });
  }

  return { items, warnings };
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

const recordFinanceIncome = async (
  transaction: Transaction,
  createdAt: string,
  actor?: AuthUser | null,
) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const newFinanceBalance = (currentFinanceBalance?.amount || 0) + transaction.total_amount;
  const cashAccount = await getCashOrBankAccountForPayment(transaction.payment_method);

  await db.financeBalance.put({
    id: 'current',
    amount: newFinanceBalance,
    updated_at: createdAt,
  });

  const financeTransaction = withPendingFinanceTransactionSync({
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
  }, actor, createdAt);
  await db.financeTransactions.add(financeTransaction);

  return financeTransaction;
};

const reduceProductStock = async (
  cart: CartItem[],
  transaction: Transaction,
  transactionItems: TransactionItem[],
  actor: AuthUser | null,
  occurredAt: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const [index, item] of cart.entries()) {
    const product = await db.products.get(item.product.id);
    const transactionItem = transactionItems[index];
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

    if (transactionItem && quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        sourceType: 'POS_TRANSACTION',
        sourceId: transaction.id,
        sourceNumber: transaction.transaction_number,
        sourceLineId: transactionItem.id,
        quantityDelta: -quantityInStockUnit,
        sourceQuantity: item.quantity,
        sourceUnit: item.unit,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

export const checkout = async ({
  cart,
  payment,
  paymentMethod,
  voucherCode,
}: CheckoutInput): Promise<CheckoutResult> => {
  const currentUser = await getCurrentSessionUser();

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
  let stockMutations: StockMutation[] = [];
  let financeTransaction: FinanceTransaction | undefined;

  if (!Number.isFinite(finalPayment) || finalPayment < finalTotal) {
    throw new Error('Jumlah pembayaran tidak valid atau kurang.');
  }

  const result = await db.transaction(
    'rw',
    [
      db.transactions,
      db.transactionItems,
      db.products,
      db.profitLogs,
      db.profitBalance,
      db.financeTransactions,
      db.financeBalance,
      db.chartOfAccounts,
      db.financeAccountMappings,
      db.enabledModules,
      db.generalLedgerSetting,
      db.journalEntries,
      db.journalEntryLines,
      db.inventoryLots,
      db.inventoryLotConsumptions,
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

      const { items, warnings } = await createTransactionItems(cart, transactionId, createdAt, promoEvaluation);

      await db.transactions.add(transaction);
      await db.transactionItems.bulkAdd(items);
      await recordProfit(transaction, items, createdAt);
      financeTransaction = await recordFinanceIncome(transaction, createdAt, currentUser);
      await postPosSaleJournal(transaction, items, currentUser);
      stockMutations = await reduceProductStock(cart, transaction, items, currentUser, createdAt);

      return { transaction, items, warnings };
    },
  );

  await enqueueStockMutations(stockMutations);
  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }

  return result;
};
