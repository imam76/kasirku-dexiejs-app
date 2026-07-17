import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { CartItem, Contact, FinanceTransaction, PosTransactionPayment, StockMutation, Transaction, TransactionItem, AuthUser } from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { getCartItemPrice, konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createSalesUnitSnapshot } from '@/utils/salesUnits';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { evaluatePromos, getActivePromos, type PromoEvaluationResult } from '@/services/promoService';
import { postPosSaleJournal } from '@/services/generalLedgerService';
import {
  buildPosPaymentSnapshot,
} from '@/services/posPaymentMethodService';
import {
  buildPosTransactionPaymentRecords,
  resolveCheckoutPayments,
  type CheckoutPaymentInput,
} from '@/services/posTransactionPaymentService';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { consumeFifoLots } from '@/utils/inventory/consumeFifoLots';
import { getOpenCashierSessionForCurrentUser } from '@/services/cashierSessionService';
import {
  ensureMembershipSetting,
  evaluateMembershipCheckout,
  isActiveRetailMember,
  recordMembershipPointTransaction,
} from '@/services/membershipService';
import { enqueueContactSync } from '@/services/syncQueueService';

interface CheckoutInput {
  cart: CartItem[];
  payments: CheckoutPaymentInput[];
  voucherCode?: string;
  memberContactId?: string;
  redeemPoints?: number;
}

export interface CheckoutResult {
  transaction: Transaction;
  items: TransactionItem[];
  payments: PosTransactionPayment[];
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
  lineRedeemDiscounts: number[] = [],
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

    const promoDiscountAmount = promoLine?.discount_amount ?? 0;
    const redeemDiscountAmount = lineRedeemDiscounts[index] ?? 0;
    const discountAmount = promoDiscountAmount + redeemDiscountAmount;

    const finalSubtotal = Math.max(
      0,
      (promoLine?.final_subtotal ?? priceBeforeDiscount * item.quantity) - redeemDiscountAmount,
    );

    const sellingPrice = item.quantity > 0
      ? Math.round((finalSubtotal / item.quantity + Number.EPSILON) * 100) / 100
      : 0;

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

    if (finalSubtotal < 0) {
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
  payments: PosTransactionPayment[],
  actor?: AuthUser | null,
) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const newFinanceBalance = (currentFinanceBalance?.amount || 0) + transaction.total_amount;

  await db.financeBalance.put({
    id: 'current',
    amount: newFinanceBalance,
    updated_at: createdAt,
  });

  const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES);
  const financeTransactions = payments.map((payment) => {
    const financeTransaction = withPendingFinanceTransactionSync({
      id: crypto.randomUUID(),
      type: 'INCOME' as const,
      category: FINANCE_CATEGORIES.SALES,
      amount: payment.applied_amount,
      description: `Penjualan ${transaction.transaction_number} - ${payment.payment_method_name}`,
      created_at: createdAt,
      reference_id: transaction.id,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_method_code,
      cash_account_id: payment.payment_posting_account_id,
      cash_account_code: payment.payment_posting_account_code,
      cash_account_name: payment.payment_posting_account_name,
      ...accountSnapshot,
    }, actor, createdAt);
    payment.finance_transaction_id = financeTransaction.id;
    return financeTransaction;
  });
  await db.financeTransactions.bulkAdd(financeTransactions);
  return financeTransactions;
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
  payments: paymentInputs,
  voucherCode,
  memberContactId,
  redeemPoints,
}: CheckoutInput): Promise<CheckoutResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');
  const cashierSession = await getOpenCashierSessionForCurrentUser();

  if (!cashierSession) {
    throw new Error('Sesi kasir belum dibuka.');
  }

  const now = new Date();
  const transactionId = crypto.randomUUID();
  const transactionNumber = `TRX-${Date.now()}`;
  const createdAt = now.toISOString();
  const activePromos = await getActivePromos(now);
  let stockMutations: StockMutation[] = [];
  let financeTransactions: FinanceTransaction[] = [];
  let updatedMemberForSync: Contact | undefined;

  const result = await db.transaction(
    'rw',
    [
      db.transactions,
      db.transactionItems,
      db.posTransactionPayments,
      db.products,
      db.profitLogs,
      db.profitBalance,
      db.financeTransactions,
      db.financeBalance,
      db.chartOfAccounts,
      db.paymentMethods,
      db.financeAccountMappings,
      db.enabledModules,
      db.generalLedgerSetting,
      db.accountingPeriods,
      db.journalEntries,
      db.journalEntryLines,
      db.inventoryLots,
      db.inventoryLotConsumptions,
      db.cashierSessions,
      db.contacts,
      db.membershipPointTransactions,
      db.membershipSettings,
    ],
    async () => {
      const member = memberContactId ? await db.contacts.get(memberContactId) : undefined;
      if (memberContactId && !isActiveRetailMember(member)) {
        throw new Error('Member tidak ditemukan atau tidak aktif.');
      }

      const membershipSetting = await ensureMembershipSetting();
      const promoEvaluation = evaluatePromos({
        cart,
        promos: activePromos,
        voucherCode,
        now,
      });
      const membershipEvaluation = await evaluateMembershipCheckout({
        cart,
        promoEvaluation,
        member,
        redeemPoints,
        setting: membershipSetting,
      });
      const finalTotal = membershipEvaluation.total_after_redeem;
      const resolvedPayments = await resolveCheckoutPayments(paymentInputs, finalTotal);
      const paymentRecords = buildPosTransactionPaymentRecords(transactionId, createdAt, resolvedPayments);
      const finalPayment = paymentRecords.reduce((sum, payment) => sum + payment.tendered_amount, 0);
      const change = paymentRecords.reduce((sum, payment) => sum + payment.change_amount, 0);
      const memberStartingBalance = membershipEvaluation.member
        ? Math.max(0, Math.floor(Number(membershipEvaluation.member.membership_points_balance || 0)))
        : 0;
      const memberBalanceAfter = membershipEvaluation.member
        ? memberStartingBalance - membershipEvaluation.redeem_points + membershipEvaluation.earned_points
        : undefined;

      const isSplit = paymentRecords.length > 1;
      const allCash = paymentRecords.every((payment) => payment.payment_method_category === 'CASH');
      const headerPaymentSnapshot = isSplit
        ? {
            payment_method: allCash ? 'TUNAI' as const : 'NON_TUNAI' as const,
            payment_method_id: undefined,
            payment_method_code: 'SPLIT',
            payment_method_name: 'Split Payment',
            payment_method_category: 'OTHER' as const,
            payment_reference: undefined,
            payment_posting_account_id: undefined,
            payment_posting_account_code: undefined,
            payment_posting_account_name: undefined,
          }
        : buildPosPaymentSnapshot(resolvedPayments[0]!.resolved);

      const transaction: Transaction = {
        id: transactionId,
        transaction_number: transactionNumber,
        cashier_session_id: cashierSession.id,
        cashier_session_number: cashierSession.session_number,
        cashier_user_id: currentUser?.id,
        cashier_user_name: currentUser?.name,
        member_contact_id: membershipEvaluation.member?.id,
        member_number: membershipEvaluation.member?.membership_number,
        member_name: membershipEvaluation.member?.name,
        member_phone: membershipEvaluation.member?.phone,
        membership_points_earned: membershipEvaluation.earned_points,
        membership_points_redeemed: membershipEvaluation.redeem_points,
        membership_point_discount_amount: membershipEvaluation.redeem_amount,
        membership_points_balance_after: memberBalanceAfter,
        subtotal_amount: promoEvaluation.subtotal_before_discount,
        discount_amount: promoEvaluation.discount_amount + membershipEvaluation.redeem_amount,
        discount_breakdown: membershipEvaluation.discount_breakdown,
        applied_promos_snapshot: promoEvaluation.applied_promos_snapshot,
        total_amount: finalTotal,
        payment_amount: finalPayment,
        change_amount: change,
        payment_mode: isSplit ? 'SPLIT' : 'SINGLE',
        ...headerPaymentSnapshot,
        status: 'COMPLETED',
        receipt_status: 'pending',
        created_at: createdAt,
      };

      const { items, warnings } = await createTransactionItems(
        cart,
        transactionId,
        createdAt,
        promoEvaluation,
        membershipEvaluation.line_redeem_discounts,
      );

      await db.transactions.add(transaction);
      await db.transactionItems.bulkAdd(items);

      if (membershipEvaluation.member && memberBalanceAfter !== undefined) {
        let runningBalance = memberStartingBalance;

        if (membershipEvaluation.redeem_points > 0) {
          runningBalance -= membershipEvaluation.redeem_points;
          await recordMembershipPointTransaction({
            member: membershipEvaluation.member,
            transactionId,
            transactionNumber,
            type: 'REDEEM',
            pointsDelta: -membershipEvaluation.redeem_points,
            amountValue: membershipEvaluation.redeem_amount,
            balanceAfter: runningBalance,
            reason: `Redeem poin transaksi ${transactionNumber}`,
            actor: currentUser,
            createdAt,
          });
        }

        if (membershipEvaluation.earned_points > 0) {
          runningBalance += membershipEvaluation.earned_points;
          await recordMembershipPointTransaction({
            member: membershipEvaluation.member,
            transactionId,
            transactionNumber,
            type: 'EARN',
            pointsDelta: membershipEvaluation.earned_points,
            amountValue: 0,
            balanceAfter: runningBalance,
            reason: `Poin dari transaksi ${transactionNumber}`,
            actor: currentUser,
            createdAt,
          });
        }

        updatedMemberForSync = {
          ...membershipEvaluation.member,
          membership_points_balance: memberBalanceAfter,
          updated_at: createdAt,
          sync_status: 'pending',
          sync_error: undefined,
        };

        await db.contacts.put(updatedMemberForSync);
      }

      await recordProfit(transaction, items, createdAt);
      financeTransactions = await recordFinanceIncome(transaction, createdAt, paymentRecords, currentUser);
      await db.posTransactionPayments.bulkAdd(paymentRecords);
      await postPosSaleJournal(transaction, items, currentUser, paymentRecords);
      stockMutations = await reduceProductStock(cart, transaction, items, currentUser, createdAt);

      return { transaction, items, payments: paymentRecords, warnings };
    },
  );

  await enqueueStockMutations(stockMutations);
  if (financeTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(financeTransactions, 'create');
  }
  if (updatedMemberForSync) {
    await enqueueContactSync(updatedMemberForSync, 'update');
  }

  return result;
};
