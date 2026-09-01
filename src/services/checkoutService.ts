import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { CartItem, CashierSession, Membership, FinanceTransaction, PosStockDiscrepancy, PosTransactionPayment, Product, RestaurantSession, StockMutation, Transaction, TransactionItem, AuthUser, SyncQueueItem } from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { getCartItemPrice, konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createSalesUnitSnapshot } from '@/utils/salesUnits';
import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { evaluatePromos, getActivePromos, type PromoEvaluationResult } from '@/services/promoService';
import { evaluateLotteryForTransaction, getActiveLotteries } from '@/services/lotteryService';
import { postPosExpenseJournal, postPosSaleJournal } from '@/services/generalLedgerService';
import {
  buildPosPaymentSnapshot,
} from '@/services/posPaymentMethodService';
import {
  buildPosTransactionPaymentRecords,
  resolveCheckoutPayments,
  type CheckoutPaymentInput,
} from '@/services/posTransactionPaymentService';
import { buildStockMutationOutboxItem, createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { consumeFifoLots } from '@/utils/inventory/consumeFifoLots';
import { addInventoryLot } from '@/utils/inventory/addInventoryLot';
import { evaluateStockAvailability } from '@/utils/inventory/evaluateStockAvailability';
import { getOpenCashierSessionForCurrentUser } from '@/services/cashierSessionService';
import { getOpenRestaurantSessionForCurrentUser } from '@/services/restaurantSessionService';
import {
  ensureMembershipSetting,
  evaluateMembershipCheckout,
  isActiveRetailMember,
  recordMembershipPointTransaction,
} from '@/services/membershipService';
import { buildInventoryLotConsumptionOutboxItem, buildInventoryLotOutboxItem, buildTransactionBundleOutboxItem, enqueueMembershipSync, enqueueStockAffectedProductsForSync, enqueueTransactionBundleSync, processPendingSyncQueue } from '@/services/syncQueueService';
import { getStoredHostIdentity } from '@/services/hostIdentityService';
import { getProductSellableUnits } from '@/utils/productUnits';

export type PosCheckoutSessionContext =
  | { kind: 'CASHIER' }
  | { kind: 'RESTAURANT'; sessionId: string };

export interface CheckoutInput {
  cart: CartItem[];
  payments: CheckoutPaymentInput[];
  voucherCode?: string;
  memberId?: string;
  redeemPoints?: number;
  sessionContext?: PosCheckoutSessionContext;
  restaurantOrderId?: string;
}

export interface CheckoutResult {
  transaction: Transaction;
  items: TransactionItem[];
  payments: PosTransactionPayment[];
  warnings?: string[];
  stockDiscrepancies?: PosStockDiscrepancy[];
}

export interface PosStockShortageDetail {
  productId: string;
  productName: string;
  availableQuantity: number;
  requestedQuantity: number;
  shortageQuantity: number;
  stockUnit: string;
}

export class PosStockShortageConfirmationRequiredError extends Error {
  readonly details: PosStockShortageDetail[];

  constructor(details: PosStockShortageDetail[]) {
    super(`Konfirmasi barang fisik diperlukan untuk ${details.map((item) => item.productName).join(', ')}.`);
    this.name = 'PosStockShortageConfirmationRequiredError';
    this.details = details;
  }
}

export interface RecordPosExpenseInput {
  cart: CartItem[];
  sessionContext?: PosCheckoutSessionContext;
  restaurantOrderId?: string;
}

export const buildCheckoutSessionSnapshot = (
  cashierSession: CashierSession | null,
  restaurantSession: RestaurantSession | null,
) => {
  if (cashierSession && restaurantSession) {
    throw new Error('Transaksi hanya boleh terhubung ke satu jenis sesi.');
  }
  if (!cashierSession && !restaurantSession) {
    throw new Error('Sesi POS belum dibuka.');
  }
  return {
    cashier_session_id: cashierSession?.id,
    cashier_session_number: cashierSession?.session_number,
    restaurant_session_id: restaurantSession?.id,
    restaurant_session_number: restaurantSession?.session_number,
  };
};

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
  transactionItemIds: string[] = [],
  stockProducts: Product[] = [],
): Promise<CreateTransactionItemsResult> => {
  const items: TransactionItem[] = [];
  const warnings: string[] = [];

  for (const [index, item] of cart.entries()) {
    const transactionItemId = transactionItemIds[index] ?? crypto.randomUUID();
    const stockProduct = stockProducts[index] ?? item.product;
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

    const unitSnapshot = createSalesUnitSnapshot(item.unit, stockProduct);

    // Quantity dikonversi ke purchase_unit / stock unit
    const quantityInStockUnit = konversiSatuanProduk(
      item.quantity,
      stockProduct,
      item.unit,
      stockProduct.purchase_unit,
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
      stockProduct,
      stockProduct.purchase_unit,
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

const createExpenseTransactionItems = async (
  cart: CartItem[],
  transactionId: string,
  createdAt: string,
): Promise<CreateTransactionItemsResult> => {
  const items: TransactionItem[] = [];
  const warnings: string[] = [];

  for (const item of cart) {
    const transactionItemId = crypto.randomUUID();
    const quantityInStockUnit = konversiSatuanProduk(
      item.quantity,
      item.product,
      item.unit,
      item.product.purchase_unit,
    );
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
    if (hasEstimatedCost) {
      warnings.push(`HPP ${item.product.name} masih memakai harga sementara.`);
    }

    const totalCost = Math.round((fifoResult.totalCost + Number.EPSILON) * 100) / 100;
    const costPerSaleUnit = item.quantity > 0
      ? Math.round((totalCost / item.quantity + Number.EPSILON) * 100) / 100
      : 0;
    const normalizedPurchasePrice = normalisasiHargaProduk(
      fifoResult.weightedAvgCostPerUnit,
      item.product,
      item.product.purchase_unit,
      item.unit,
    );
    const unitSnapshot = createSalesUnitSnapshot(item.unit, item.product);

    items.push({
      id: transactionItemId,
      transaction_id: transactionId,
      product_id: item.product.id,
      product_name: item.product.name,
      price: costPerSaleUnit,
      selling_price: costPerSaleUnit,
      is_price_edited: false,
      purchase_price: normalizedPurchasePrice,
      unit: item.unit,
      ...unitSnapshot,
      quantity: item.quantity,
      price_before_discount: costPerSaleUnit,
      subtotal_before_discount: totalCost,
      discount_amount: 0,
      subtotal: totalCost,
      profit: -totalCost,
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
    amount: Math.abs(totalProfit),
    type: totalProfit >= 0 ? 'IN' : 'OUT',
    category: transaction.business_type === 'EXPENSE' ? 'OPERATIONAL' : 'SALES',
    description: transaction.business_type === 'EXPENSE'
      ? `Beban pemakaian internal ${transaction.transaction_number}`
      : `Keuntungan dari transaksi ${transaction.transaction_number}`,
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

const buildDiscrepancyOutboxItem = (
  discrepancy: PosStockDiscrepancy,
  createdAt: string,
): SyncQueueItem => ({
  id: crypto.randomUUID(),
  entity: 'posStockDiscrepancies',
  entity_id: discrepancy.id,
  operation: 'create',
  payload: discrepancy,
  status: 'pending',
  attempts: 0,
  created_at: createdAt,
  updated_at: createdAt,
});

const preparePhysicalStockDiscrepancies = async (
  cart: CartItem[],
  transaction: Transaction,
  transactionItemIds: string[],
  actor: AuthUser | null,
  occurredAt: string,
) => {
  const shortageDetails: PosStockShortageDetail[] = [];
  const plannedRows: Array<{
    cartItem: CartItem;
    product: Product;
    transactionItemId: string;
    availableQuantity: number;
    requestedQuantity: number;
    shortageQuantity: number;
  }> = [];

  for (const [index, cartItem] of cart.entries()) {
    const product = await db.products.get(cartItem.product.id);
    if (!product) throw new Error(`Produk ${cartItem.product.name} tidak ditemukan.`);
    if (!getProductSellableUnits(product).includes(cartItem.unit)) {
      throw new Error(`Satuan ${cartItem.unit} untuk ${product.name} sudah tidak tersedia.`);
    }

    const requestedQuantity = konversiSatuanProduk(
      cartItem.quantity,
      product,
      cartItem.unit,
      product.purchase_unit,
    );
    const availability = evaluateStockAvailability({
      availableQuantity: product.stock,
      requestedQuantity,
    });

    if (!availability.isSufficient && !cartItem.physical_stock_observation?.confirmed) {
      shortageDetails.push({
        productId: product.id,
        productName: product.name,
        availableQuantity: availability.availableQuantity,
        requestedQuantity: availability.requestedQuantity,
        shortageQuantity: availability.shortageQuantity,
        stockUnit: product.purchase_unit,
      });
    }

    plannedRows.push({
      cartItem,
      product,
      transactionItemId: transactionItemIds[index]!,
      availableQuantity: availability.availableQuantity,
      requestedQuantity: availability.requestedQuantity,
      shortageQuantity: availability.shortageQuantity,
    });
  }

  if (shortageDetails.length > 0) {
    throw new PosStockShortageConfirmationRequiredError(shortageDetails);
  }

  const discrepancies: PosStockDiscrepancy[] = [];
  const stockMutations: StockMutation[] = [];
  const touchedProductIds = new Set<string>();
  const deviceId = typeof localStorage === 'undefined' ? undefined : getStoredHostIdentity() ?? undefined;
  const deviceName = typeof navigator === 'undefined' ? undefined : navigator.userAgent;

  for (const row of plannedRows) {
    if (row.shortageQuantity <= 0) continue;

    const discrepancyId = crypto.randomUUID();
    const estimatedCost = Math.max(0, Number(row.product.purchase_price || 0));
    const estimateSource = estimatedCost > 0 ? 'PRODUCT_PURCHASE_PRICE' as const : 'UNKNOWN' as const;

    await addInventoryLot({
      productId: row.product.id,
      productName: row.product.name,
      sku: row.product.sku,
      sourceType: 'POS_PHYSICAL_STOCK_FOUND',
      sourceId: discrepancyId,
      sourceLineId: row.transactionItemId,
      quantityReceived: row.shortageQuantity,
      costPerUnit: estimatedCost,
      costStatus: 'ESTIMATED',
      estimateSource,
      receivedAt: occurredAt,
    });

    await db.products.update(row.product.id, {
      stock: row.availableQuantity + row.shortageQuantity,
      updated_at: occurredAt,
      sync_status: 'pending',
      sync_error: undefined,
    });
    touchedProductIds.add(row.product.id);

    const discrepancy: PosStockDiscrepancy = {
      id: discrepancyId,
      transaction_id: transaction.id,
      transaction_number: transaction.transaction_number,
      transaction_item_id: row.transactionItemId,
      cashier_session_id: transaction.cashier_session_id,
      restaurant_session_id: transaction.restaurant_session_id,
      product_id: row.product.id,
      product_name: row.product.name,
      sku: row.product.sku,
      system_quantity_snapshot: row.availableQuantity,
      requested_quantity: row.requestedQuantity,
      shortage_quantity: row.shortageQuantity,
      stock_unit: row.product.purchase_unit,
      observation: 'PHYSICAL_ITEM_PRESENT',
      cashier_note: row.cartItem.physical_stock_observation?.note,
      cashier_user_id: actor?.id,
      cashier_user_name: actor?.name,
      device_id: deviceId,
      device_name: deviceName,
      status: 'PENDING_REVIEW',
      created_at: occurredAt,
      updated_at: occurredAt,
      sync_status: 'pending',
    };
    discrepancies.push(discrepancy);
    stockMutations.push(createStockMutation({
      product: row.product,
      sourceType: 'POS_PHYSICAL_STOCK_FOUND',
      sourceId: discrepancy.id,
      sourceNumber: transaction.transaction_number,
      sourceLineId: row.transactionItemId,
      quantityDelta: row.shortageQuantity,
      sourceQuantity: row.shortageQuantity,
      sourceUnit: row.product.purchase_unit,
      reason: 'Barang fisik dikonfirmasi tersedia di depan kasir',
      actor,
      occurredAt,
    }));
  }

  return {
    discrepancies,
    stockMutations,
    touchedProductIds,
    currentProducts: plannedRows.map((row) => row.product),
  };
};

const reduceProductStock = async (
  cart: CartItem[],
  transaction: Transaction,
  transactionItems: TransactionItem[],
  actor: AuthUser | null,
  occurredAt: string,
) => {
  const stockMutations: StockMutation[] = [];
  const touchedProductIds = new Set<string>();

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
      updated_at: occurredAt,
      sync_status: 'pending',
      sync_error: undefined,
    });
    touchedProductIds.add(item.product.id);

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

  return { stockMutations, touchedProductIds };
};

export const checkout = async ({
  cart,
  payments: paymentInputs,
  voucherCode,
  memberId,
  redeemPoints,
  sessionContext = { kind: 'CASHIER' },
  restaurantOrderId,
}: CheckoutInput): Promise<CheckoutResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');
  const cashierSession = sessionContext.kind === 'CASHIER'
    ? await getOpenCashierSessionForCurrentUser()
    : null;
  const restaurantSession = sessionContext.kind === 'RESTAURANT'
    ? await getOpenRestaurantSessionForCurrentUser()
    : null;

  if (sessionContext.kind === 'CASHIER' && !cashierSession) {
    throw new Error('Sesi kasir belum dibuka.');
  }
  if (
    sessionContext.kind === 'RESTAURANT'
    && (!restaurantSession || restaurantSession.id !== sessionContext.sessionId)
  ) {
    throw new Error('Sesi Resto belum dibuka atau bukan milik user aktif.');
  }
  const sessionSnapshot = buildCheckoutSessionSnapshot(cashierSession, restaurantSession);
  if (restaurantOrderId && sessionContext.kind !== 'RESTAURANT') {
    throw new Error('Order Resto hanya dapat dipakai dengan sesi Resto.');
  }

  const now = new Date();
  const transactionId = crypto.randomUUID();
  const transactionNumber = `TRX-${Date.now()}`;
  const createdAt = now.toISOString();
  const activePromos = await getActivePromos(now);
  const activeLotteries = await getActiveLotteries(now);
  let stockMutations: StockMutation[] = [];
  let touchedProductIds = new Set<string>();
  let financeTransactions: FinanceTransaction[] = [];
  let updatedMemberForSync: Membership | undefined;
  let checkoutDiscrepancies: PosStockDiscrepancy[] = [];

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
      db.memberships,
      db.membershipPointTransactions,
      db.membershipSettings,
      db.posStockDiscrepancies,
      db.stockMutations,
      db.syncQueue,
    ],
    async () => {
      const member = memberId ? await db.memberships.get(memberId) : undefined;
      if (memberId && !isActiveRetailMember(member)) {
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
      const lotteryResult = evaluateLotteryForTransaction({
        totalAmount: finalTotal,
        lotteries: activeLotteries,
        now,
        cashierName: currentUser?.name,
      });
      const resolvedPayments = await resolveCheckoutPayments(paymentInputs, finalTotal);
      const paymentRecords = buildPosTransactionPaymentRecords(transactionId, createdAt, resolvedPayments);
      const finalPayment = paymentRecords.reduce((sum, payment) => sum + payment.tendered_amount, 0);
      const change = paymentRecords.reduce((sum, payment) => sum + payment.change_amount, 0);
      const memberStartingBalance = membershipEvaluation.member
        ? Math.max(0, Math.floor(Number(membershipEvaluation.member.points_balance || 0)))
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
        business_type: 'SALE',
        ...sessionSnapshot,
        restaurant_order_id: restaurantOrderId,
        cashier_user_id: currentUser?.id,
        cashier_user_name: currentUser?.name,
        member_id: membershipEvaluation.member?.id,
        member_number: membershipEvaluation.member?.member_number,
        member_name: membershipEvaluation.member?.name ?? membershipEvaluation.member?.phone,
        member_phone: membershipEvaluation.member?.phone,
        membership_points_earned: membershipEvaluation.earned_points,
        membership_points_redeemed: membershipEvaluation.redeem_points,
        membership_point_discount_amount: membershipEvaluation.redeem_amount,
        membership_points_balance_after: memberBalanceAfter,
        subtotal_amount: promoEvaluation.subtotal_before_discount,
        discount_amount: promoEvaluation.discount_amount + membershipEvaluation.redeem_amount,
        discount_breakdown: membershipEvaluation.discount_breakdown,
        applied_promos_snapshot: promoEvaluation.applied_promos_snapshot,
        lottery_number: lotteryResult.lottery_number,
        lottery_id: lotteryResult.lottery_id,
        lottery_name: lotteryResult.lottery_name,
        total_amount: finalTotal,
        payment_amount: finalPayment,
        change_amount: change,
        payment_mode: isSplit ? 'SPLIT' : 'SINGLE',
        ...headerPaymentSnapshot,
        status: 'COMPLETED',
        receipt_status: 'pending',
        created_at: createdAt,
        updated_at: createdAt,
        sync_status: 'pending',
      };

      const transactionItemIds = cart.map(() => crypto.randomUUID());
      const discrepancyStock = await preparePhysicalStockDiscrepancies(
        cart,
        transaction,
        transactionItemIds,
        currentUser,
        createdAt,
      );
      checkoutDiscrepancies = discrepancyStock.discrepancies;

      const { items, warnings } = await createTransactionItems(
        cart,
        transactionId,
        createdAt,
        promoEvaluation,
        membershipEvaluation.line_redeem_discounts,
        transactionItemIds,
        discrepancyStock.currentProducts,
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
          points_balance: memberBalanceAfter,
          updated_at: createdAt,
          sync_status: 'pending',
          sync_error: undefined,
        };

        await db.memberships.put(updatedMemberForSync);
      }

      await recordProfit(transaction, items, createdAt);
      financeTransactions = await recordFinanceIncome(transaction, createdAt, paymentRecords, currentUser);
      await db.posTransactionPayments.bulkAdd(paymentRecords);
      await postPosSaleJournal(transaction, items, currentUser, paymentRecords);
      const saleStock = await reduceProductStock(cart, transaction, items, currentUser, createdAt);
      stockMutations = [...discrepancyStock.stockMutations, ...saleStock.stockMutations];
      touchedProductIds = new Set([
        ...discrepancyStock.touchedProductIds,
        ...saleStock.touchedProductIds,
      ]);

      if (checkoutDiscrepancies.length > 0) {
        await db.posStockDiscrepancies.bulkAdd(checkoutDiscrepancies);
      }
      if (stockMutations.length > 0) {
        await db.stockMutations.bulkPut(stockMutations);
      }
      const discrepancyIds = checkoutDiscrepancies.map((row) => row.id);
      const discrepancyLots = discrepancyIds.length > 0
        ? await db.inventoryLots.where('source_id').anyOf(discrepancyIds).toArray()
        : [];
      const consumptions = await db.inventoryLotConsumptions
        .where('source_id')
        .equals(transaction.id)
        .toArray();
      await db.syncQueue.bulkAdd([
        buildTransactionBundleOutboxItem(transaction, items, 'create', createdAt),
        ...stockMutations.map((mutation) => buildStockMutationOutboxItem(mutation, createdAt)),
        ...checkoutDiscrepancies.map((discrepancy) => buildDiscrepancyOutboxItem(discrepancy, createdAt)),
        ...discrepancyLots.map((lot) => buildInventoryLotOutboxItem({
          ...lot,
          // The remote lot starts at its received balance; the immutable
          // consumption outbox below applies the sale exactly once.
          quantity_remaining: lot.quantity_received,
        }, 'create', createdAt)),
        ...consumptions.map((consumption) => buildInventoryLotConsumptionOutboxItem(consumption, createdAt)),
      ]);

      return {
        transaction,
        items,
        payments: paymentRecords,
        warnings,
        stockDiscrepancies: checkoutDiscrepancies,
      };
    },
  );

  if (touchedProductIds.size > 0) {
    await enqueueStockAffectedProductsForSync(touchedProductIds);
  }
  if (financeTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(financeTransactions, 'create');
  }
  if (updatedMemberForSync) {
    await enqueueMembershipSync(updatedMemberForSync, 'update');
  }
  void processPendingSyncQueue();

  return result;
};

export const recordPosExpense = async ({
  cart,
  sessionContext = { kind: 'CASHIER' },
  restaurantOrderId,
}: RecordPosExpenseInput): Promise<CheckoutResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');
  if (cart.length === 0) throw new Error('Keranjang masih kosong.');

  const cashierSession = sessionContext.kind === 'CASHIER'
    ? await getOpenCashierSessionForCurrentUser()
    : null;
  const restaurantSession = sessionContext.kind === 'RESTAURANT'
    ? await getOpenRestaurantSessionForCurrentUser()
    : null;

  if (sessionContext.kind === 'CASHIER' && !cashierSession) {
    throw new Error('Sesi kasir belum dibuka.');
  }
  if (
    sessionContext.kind === 'RESTAURANT'
    && (!restaurantSession || restaurantSession.id !== sessionContext.sessionId)
  ) {
    throw new Error('Sesi Resto belum dibuka atau bukan milik user aktif.');
  }
  if (restaurantOrderId && sessionContext.kind !== 'RESTAURANT') {
    throw new Error('Order Resto hanya dapat dipakai dengan sesi Resto.');
  }

  const sessionSnapshot = buildCheckoutSessionSnapshot(cashierSession, restaurantSession);
  const transactionId = crypto.randomUUID();
  const transactionNumber = `EXP-${Date.now()}`;
  const createdAt = new Date().toISOString();
  let stockMutations: StockMutation[] = [];
  let touchedProductIds = new Set<string>();

  const result = await db.transaction(
    'rw',
    [
      db.transactions,
      db.transactionItems,
      db.products,
      db.profitLogs,
      db.profitBalance,
      db.chartOfAccounts,
      db.enabledModules,
      db.generalLedgerSetting,
      db.accountingPeriods,
      db.journalEntries,
      db.journalEntryLines,
      db.inventoryLots,
      db.inventoryLotConsumptions,
      db.cashierSessions,
    ],
    async () => {
      const { items, warnings } = await createExpenseTransactionItems(cart, transactionId, createdAt);
      const totalExpense = Math.round((items.reduce((sum, item) => sum + item.subtotal, 0) + Number.EPSILON) * 100) / 100;
      const transaction: Transaction = {
        id: transactionId,
        transaction_number: transactionNumber,
        business_type: 'EXPENSE',
        ...sessionSnapshot,
        restaurant_order_id: restaurantOrderId,
        cashier_user_id: currentUser?.id,
        cashier_user_name: currentUser?.name,
        subtotal_amount: totalExpense,
        discount_amount: 0,
        total_amount: totalExpense,
        payment_amount: 0,
        change_amount: 0,
        payment_mode: 'SINGLE',
        payment_method: 'TUNAI',
        payment_method_code: 'EXPENSE',
        payment_method_name: 'Pengeluaran (Beban)',
        payment_method_category: 'OTHER',
        status: 'COMPLETED',
        created_at: createdAt,
        updated_at: createdAt,
        sync_status: 'pending',
      };

      await db.transactions.add(transaction);
      await db.transactionItems.bulkAdd(items);
      await recordProfit(transaction, items, createdAt);
      await postPosExpenseJournal(transaction, items, currentUser);
      ({ stockMutations, touchedProductIds } = await reduceProductStock(cart, transaction, items, currentUser, createdAt));

      return { transaction, items, payments: [], warnings };
    },
  );

  await enqueueStockMutations(stockMutations);
  if (touchedProductIds.size > 0) {
    await enqueueStockAffectedProductsForSync(touchedProductIds);
  }
  await enqueueTransactionBundleSync(result.transaction, result.items, 'create');
  await writeActivityLog({
    user: currentUser,
    action: 'POS_EXPENSE_RECORDED',
    entity: 'transactions',
    entity_id: result.transaction.id,
    description: `${currentUser?.name ?? 'User'} mencatat ${result.transaction.transaction_number} sebagai pengeluaran sebesar ${result.transaction.total_amount}.`,
  });
  return result;
};
