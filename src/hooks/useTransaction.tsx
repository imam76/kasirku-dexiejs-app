import { useEffect, useMemo, useCallback, useLayoutEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App, Input } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore, type TransactionError } from '@/store/transactionStore';
import { Membership, MembershipSetting, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getCartItemPrice } from '@/utils/pricing';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { checkout, PosStockShortageConfirmationRequiredError, recordPosExpense } from '@/services/checkoutService';
import { useI18n } from '@/hooks/useI18n';
import { usePosPaymentMethods } from '@/hooks/usePosPaymentMethods';
import { allocatePosPayments } from '@/utils/posSplitPayment';
import { evaluatePromos, getActivePromos } from '@/services/promoService';
import {
  DEFAULT_MEMBERSHIP_SETTING,
  createRetailMemberFromPos,
  evaluateMembershipCheckoutSync,
  getMembershipSetting,
  type QuickCreateMemberInput,
} from '@/services/membershipService';
import {
  readPosMember,
  readPosMemberOptions,
  withSelectedMemberFirst,
} from '@/services/posMemberReadService';
import { normalizeProductSearchTerm } from '@/utils/productSearch';
import { findFirstPosProduct, findPosProductBySku, readPosCatalogPage } from '@/services/posCatalogReadService';
import { createPosPerformanceTrace } from '@/utils/posPerformance';

const TRANSACTION_PRODUCT_PAGE_SIZE = 12;
const EMPTY_TRANSACTION_PRODUCT_PAGE = {
  ids: [] as string[],
  total: 0,
  currentPage: 1,
};
const FALLBACK_MEMBERSHIP_SETTING: MembershipSetting = {
  ...DEFAULT_MEMBERSHIP_SETTING,
  created_at: '',
  updated_at: '',
};

export const useTransaction = (draftScope?: string) => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const { t } = useI18n();
  const {
    products,
    productPage,
    cart,
    searchTerm,
    paymentDrafts,
    voucherCode,
    memberId,
    redeemPoints,
    showPayment,
    activeDraftScope,
    heldDrafts,
    setProducts,
    setProductPage,
    setSearchTerm: setStoreSearchTerm,
    setPaymentDrafts,
    addPaymentDraft,
    updatePaymentDraft,
    removePaymentDraft,
    setVoucherCode,
    setMemberId,
    setRedeemPoints,
    setShowPayment,
    switchDraftScope,
    discardDraftScope,
    holdCurrentDraft,
    resumeHeldDraft,
    deleteHeldDraft,
    addToCart: storeAddToCart,
    updateQuantity: storeUpdateQuantity,
    confirmPhysicalStockForCart,
    updateCartProduct,
    removeFromCart,
    reset,
  } = useTransactionStore();
  const { options: paymentMethods, validMethods } = usePosPaymentMethods();
  const [selectedProductCategory, setSelectedProductCategoryState] = useState<string>();
  const productSearchTerm = normalizeProductSearchTerm(searchTerm);
  const isPosProcessReady = activeDraftScope === draftScope;

  useLayoutEffect(() => {
    switchDraftScope(draftScope);
  }, [draftScope, switchDraftScope]);

  useEffect(() => {
    if (!draftScope || !isPosProcessReady || paymentDrafts.length > 0 || validMethods.length === 0) return;
    const defaultMethod = validMethods.find((method) => method.code.toUpperCase() === 'TUNAI')
      ?? validMethods[0];
    setPaymentDrafts([{
      clientId: crypto.randomUUID(),
      paymentMethodId: defaultMethod?.id,
      amount: '',
      reference: '',
      isAmountAutoFilled: false,
    }]);
  }, [draftScope, isPosProcessReady, paymentDrafts.length, setPaymentDrafts, validMethods]);

  const setSearchTerm = useCallback((value: string) => {
    setProductPage(1);
    setStoreSearchTerm(value);
  }, [setProductPage, setStoreSearchTerm]);

  const setSelectedProductCategory = useCallback((category?: string) => {
    setProductPage(1);
    setSelectedProductCategoryState(category);
  }, [setProductPage]);

  const productPageResult = useLiveQuery(
    () => readPosCatalogPage(productPage, TRANSACTION_PRODUCT_PAGE_SIZE, productSearchTerm, selectedProductCategory),
    [productPage, productSearchTerm, selectedProductCategory],
    EMPTY_TRANSACTION_PRODUCT_PAGE,
  );
  const productTotal = productPageResult.total;
  // Reading current stock/prices is separate from searching/paging catalog metadata.
  const pageProducts = useLiveQuery(async () => (
    await db.products.bulkGet(productPageResult.ids)
  ).filter((product): product is Product => !!product), [productPageResult.ids], [] as Product[]);
  const availableProductCategories = useLiveQuery(async () => (
    await db.posCatalogCounts.toArray()
  ).filter((row) => row.count > 0).map((row) => row.category)
    .sort((left, right) => left.localeCompare(right, 'id')), [], [] as string[]);

  useEffect(() => {
    setProducts(pageProducts);
  }, [pageProducts, setProducts]);

  const { data: activePromos = [] } = useQuery({
    queryKey: ['activePromos'],
    queryFn: () => getActivePromos(new Date()),
  });
  const { data: membershipSetting = FALLBACK_MEMBERSHIP_SETTING } = useQuery({
    queryKey: ['membershipSetting'],
    queryFn: getMembershipSetting,
  });
  const [memberSearch, setMemberSearch] = useState('');
  // Bounded page instead of the whole member table: a member checkout writes the
  // point balance, and re-running a full scan on that write is what made the POS
  // screen slower as the customer list grew.
  const memberOptions = useLiveQuery(
    () => readPosMemberOptions(memberSearch),
    [memberSearch],
    [] as Membership[],
  );
  const selectedMember = useLiveQuery(
    () => readPosMember(memberId).then((member) => member ?? null),
    [memberId],
    null as Membership | null,
  );
  const activeMembers = useMemo(
    () => withSelectedMemberFirst(memberOptions, selectedMember),
    [memberOptions, selectedMember],
  );
  const createMemberMutation = useMutation({
    mutationFn: createRetailMemberFromPos,
    onSuccess: (member) => {
      setMemberId(member.id);
      queryClient.invalidateQueries({ queryKey: ['memberships'] });
    },
  });

  const filteredProducts = products;
  const productPagination = {
    currentPage: productPageResult.currentPage,
    pageSize: TRANSACTION_PRODUCT_PAGE_SIZE,
    total: productTotal,
    onChange: setProductPage,
  };

  const calculateSubtotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + getCartItemPrice(item) * item.quantity, 0);
  }, [cart]);

  const promoPreview = useMemo(() => {
    return evaluatePromos({
      cart,
      promos: activePromos,
      voucherCode,
    });
  }, [activePromos, cart, voucherCode]);
  const membershipPreview = useMemo(() => {
    return evaluateMembershipCheckoutSync({
      cart,
      promoEvaluation: promoPreview,
      member: selectedMember,
      redeemPoints: Number(redeemPoints || 0),
      setting: membershipSetting,
    });
  }, [cart, membershipSetting, promoPreview, redeemPoints, selectedMember]);

  const calculateTotal = useCallback(() => {
    return membershipPreview.total_after_redeem;
  }, [membershipPreview.total_after_redeem]);

  const paymentPreview = useMemo(() => allocatePosPayments(
    membershipPreview.total_after_redeem,
    paymentDrafts.map((draft) => ({
      key: draft.clientId,
      paymentMethodId: draft.paymentMethodId,
      category: validMethods.find((method) => method.id === draft.paymentMethodId)?.category,
      tenderedAmount: Number(draft.amount),
    })),
    { allowIncomplete: true },
  ), [membershipPreview.total_after_redeem, paymentDrafts, validMethods]);

  useEffect(() => {
    if (!isPosProcessReady) return;
    const last = paymentDrafts[paymentDrafts.length - 1];
    if (!last?.isAmountAutoFilled) return;
    const preceding = paymentDrafts.slice(0, -1);
    const precedingPreview = allocatePosPayments(
      membershipPreview.total_after_redeem,
      preceding.map((draft) => ({
        key: draft.clientId,
        paymentMethodId: draft.paymentMethodId,
        category: validMethods.find((method) => method.id === draft.paymentMethodId)?.category,
        tenderedAmount: Number(draft.amount),
      })),
      { allowIncomplete: true },
    );
    if (precedingPreview.errors.length > 0) return;
    const nextAmount = String(precedingPreview.remainingAmount);
    if (last.amount !== nextAmount) updatePaymentDraft(last.clientId, { amount: nextAmount });
  }, [isPosProcessReady, membershipPreview.total_after_redeem, paymentDrafts, updatePaymentDraft, validMethods]);

  const handleAddPayment = useCallback(() => {
    if (paymentPreview.errors.length > 0 || paymentPreview.remainingAmount <= 0) return;
    if (paymentDrafts.length >= validMethods.length) return;
    addPaymentDraft({
      clientId: crypto.randomUUID(),
      paymentMethodId: undefined,
      amount: String(paymentPreview.remainingAmount),
      reference: '',
      isAmountAutoFilled: true,
    });
  }, [addPaymentDraft, paymentDrafts.length, paymentPreview, validMethods.length]);

  const getTransactionErrorContent = (error: TransactionError) => {
    if (error.code === 'PRODUCT_HIDDEN_IN_POS') {
      return {
        title: 'Produk tidak tersedia di POS',
        content: 'Produk ini dinonaktifkan dari katalog POS di Master Produk.',
      };
    }
    if (error.code === 'OUT_OF_STOCK') {
      return {
        title: t('transactionError.outOfStockTitle'),
        content: t('transactionError.outOfStockMessage'),
      };
    }

    if (error.code === 'INSUFFICIENT_STOCK') {
      return {
        title: t('transactionError.insufficientStockTitle'),
        content: t('transactionError.insufficientStockMessage', {
          stock: error.stock,
          unit: error.unit,
        }),
      };
    }

    return {
      title: t('transactionError.invalidUnitTitle'),
      content: t('transactionError.invalidUnitMessage', { unit: error.unit }),
    };
  };

  const showTransactionError = (error: TransactionError) => {
    modal.error(getTransactionErrorContent(error));
  };

  const offerPhysicalStockConfirmation = (
    error: TransactionError,
    onConfirm: (cashierNote?: string) => void,
  ) => {
    if (error.code !== 'OUT_OF_STOCK' && error.code !== 'INSUFFICIENT_STOCK') {
      showTransactionError(error);
      return;
    }

    let cashierNote = '';
    modal.confirm({
      title: 'Stok sistem tidak cukup',
      content: (
        <div className="space-y-2">
          <p>{getTransactionErrorContent(error).content}</p>
          <p>
            Konfirmasikan hanya jika barang fisik memang ada di depan Anda.
            Selisih akan otomatis masuk antrean review supervisor.
          </p>
          <Input.TextArea
            rows={2}
            placeholder="Catatan observasi kasir (opsional)"
            onChange={(event) => { cashierNote = event.target.value; }}
          />
        </div>
      ),
      okText: 'Barang fisik ada di depan saya',
      cancelText: t('common.cancel'),
      onOk: () => onConfirm(cashierNote),
    });
  };

  const addToCart = (product: Product) => {
    const result = storeAddToCart(product);
    if (!result.success && result.error) {
      offerPhysicalStockConfirmation(result.error, (cashierNote) => {
        storeAddToCart(product, { confirmPhysicalStock: true, cashierNote });
      });
      return false;
    }
    return result.success;
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    const result = storeUpdateQuantity(productId, newQuantity);
    if (!result.success && result.error) {
      offerPhysicalStockConfirmation(result.error, (cashierNote) => {
        storeUpdateQuantity(productId, newQuantity, { confirmPhysicalStock: true, cashierNote });
      });
      return false;
    }
    return result.success;
  };

  const updateUnit = (productId: string, newUnit: string) => {
    const storeUpdateUnit = useTransactionStore.getState().updateUnit;
    const result = storeUpdateUnit(productId, newUnit);
    if (!result.success && result.error) {
      offerPhysicalStockConfirmation(result.error, (cashierNote) => {
        storeUpdateUnit(productId, newUnit, { confirmPhysicalStock: true, cashierNote });
      });
    }
    return result.success;
  };

  const findProductByScannedCode = findPosProductBySku;
  const findFirstProductBySearchTerm = findFirstPosProduct;

  const handleCheckout = async () => {
    const performanceTrace = createPosPerformanceTrace();
    if (paymentPreview.errors.length > 0 || !paymentPreview.isComplete) {
      modal.error({
        title: t('payment.invalidTitle'),
        content: paymentPreview.errors[0] ?? t('payment.invalidContent'),
      });
      return false;
    }

    try {
      const checkoutResult = await checkout({
        cart,
        payments: paymentDrafts.map((draft) => ({
          paymentMethodId: draft.paymentMethodId ?? '',
          tenderedAmount: Number(draft.amount),
          paymentReference: draft.reference,
        })),
        voucherCode,
        memberId,
        redeemPoints: Number(redeemPoints || 0),
        deferSyncProcessing: true,
        performanceTrace,
      });
      const { transaction, items, payments, warnings } = checkoutResult;

      void printReceiptAfterTransaction(
        { ...transaction, items, payments },
        {
          openCashDrawer: true,
          performanceTrace,
          onPrintDispatched: () => {
            [
              'transactions-history', 'posSalesReport', 'transactionDetailReport',
              'financeTransactions', 'incomeReport', 'cashFlowReport', 'journalEntries',
              'trialBalance', 'incomeStatement', 'balanceSheet', 'contacts',
              'memberships', 'membershipSetting',
            ].forEach((key) => { void queryClient.invalidateQueries({ queryKey: [key] }); });
            window.dispatchEvent(new Event('check-feedback'));
          },
        },
      )
        .then((result) => {
          void queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
          if (result.success) {
            message.success(t('checkout.receiptPrinted'));
          } else {
            message.warning(result.error || t('checkout.receiptPrintFailed'));
          }
        })
        .catch((error) => {
          console.error('Receipt print process failed:', error);
          message.warning(t('checkout.receiptPrintProcessFailed'));
        });

      modal.success({
        title: t('checkout.successTitle'),
        content: (
          <div className="text-left space-y-2 mt-4" >
            <p className="text-gray-700">
              <span className="font-semibold"> {t('checkout.transactionNumber')}: </span> {transaction.transaction_number}
            </p>
            {payments.map((payment) => (
              <p key={payment.id} className="text-gray-700">
                <span className="font-semibold">{payment.payment_method_name}:</span>{' '}
                Rp {formatCurrency(payment.tendered_amount)}
                {payment.payment_reference ? ` (${payment.payment_reference})` : ''}
              </p>
            ))}
            < p className="text-gray-700" >
              <span className="font-semibold"> {t('cart.total')}:</span> Rp {formatCurrency(transaction.total_amount)}
            </p>
            {(transaction.discount_amount ?? 0) > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold"> {t('cart.discount')}:</span> -Rp {formatCurrency(transaction.discount_amount ?? 0)}
              </p>
            )}
            {transaction.member_name && (
              <p className="text-gray-700">
                <span className="font-semibold">Member:</span> {transaction.member_number ? `${transaction.member_number} - ` : ''}{transaction.member_name}
              </p>
            )}
            {(transaction.membership_points_earned ?? 0) > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold">Poin didapat:</span> {transaction.membership_points_earned}
              </p>
            )}
            {(transaction.membership_points_redeemed ?? 0) > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold">Poin dipakai:</span> {transaction.membership_points_redeemed}
              </p>
            )}
            < p className="text-gray-700" >
              <span className="font-semibold" > {t('checkout.paid')}: </span> Rp {formatCurrency(transaction.payment_amount)}
            </p>
            < p className="text-green-600 font-semibold" >
              <span>{t('payment.change')}: </span> Rp {formatCurrency(transaction.change_amount)}
            </p>
          </div>
        ),
      });

      warnings?.forEach((warning) => {
        message.warning(warning);
      });

      reset();
      return true;
    } catch (error) {
      performanceTrace.checkpoint('checkout_failed');
      performanceTrace.report('checkout_failed');
      console.error('Checkout failed:', error);
      if (error instanceof PosStockShortageConfirmationRequiredError) {
        const affectedIds = new Set(error.details.map((detail) => detail.productId));
        modal.confirm({
          title: 'Stok berubah dan sekarang tidak cukup',
          content: (
            <div className="space-y-2">
              {error.details.map((detail) => (
                <p key={detail.productId}>
                  {detail.productName}: kurang {detail.shortageQuantity} {detail.stockUnit}.
                </p>
              ))}
              <p>Konfirmasi barang fisik, lalu tekan Bayar sekali lagi.</p>
            </div>
          ),
          okText: 'Barang fisik ada di depan saya',
          cancelText: t('common.cancel'),
          onOk: () => confirmPhysicalStockForCart(affectedIds),
        });
        return false;
      }
      if (error instanceof Error && error.name === 'NotFoundError') {
        void indexedDB.databases?.().then((databases) => {
          console.error('IndexedDB databases:', databases);
        });
        console.error('Dexie tables:', db.tables.map((table) => table.name));
      }
      modal.error({
        title: t('checkout.failedTitle'),
        content: error instanceof Error ? error.message : t('checkout.failedContent'),
      });
      return false;
    }
  };

  const handleRecordExpense = async () => new Promise<boolean>((resolve) => {
    modal.confirm({
      title: 'Catat sebagai Pengeluaran (Beban)?',
      content: 'Stok akan berkurang sebesar item di keranjang dan beban dicatat berdasarkan HPP/FIFO. Tidak ada penjualan atau penerimaan kas yang dibuat.',
      okText: 'Catat Pengeluaran',
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onCancel: () => resolve(false),
      onOk: async () => {
        try {
          const result = await recordPosExpense({ cart });
          result.warnings?.forEach((warning) => message.warning(warning));
          reset();
          [
            'transactions-history',
            'expenseReport',
            'expenseCategories',
            'journalEntries',
            'trialBalance',
            'incomeStatement',
            'balanceSheet',
          ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
          message.success(
            `Pengeluaran ${result.transaction.transaction_number} tercatat sebesar Rp ${formatCurrency(result.transaction.total_amount)}.`,
          );
          resolve(true);
        } catch (error) {
          modal.error({
            title: 'Gagal mencatat pengeluaran',
            content: error instanceof Error ? error.message : String(error),
          });
          resolve(false);
        }
      },
    });
  });

  return {
    products,
    cart,
    searchTerm,
    paymentDrafts,
    paymentPreview,
    paymentMethods,
    voucherCode,
    memberId,
    redeemPoints,
    showPayment,
    heldDrafts,
    isPosProcessReady,
    filteredProducts,
    productPagination,
    availableProductCategories,
    selectedProductCategory,
    promoPreview,
    membershipPreview,
    activePromos,
    activeMembers,
    onMemberSearch: setMemberSearch,
    selectedMember,
    membershipSetting,
    createMember: createMemberMutation.mutateAsync as (input: QuickCreateMemberInput) => Promise<Membership>,
    isCreatingMember: createMemberMutation.isPending,
    addToCart,
    updateQuantity,
    updateUnit,
    updateCartProduct,
    findProductByScannedCode,
    findFirstProductBySearchTerm,
    removeFromCart,
    calculateSubtotal,
    calculateTotal,
    handleCheckout,
    handleRecordExpense,
    handleAddPayment,
    clearCart: reset,
    setSearchTerm,
    setSelectedProductCategory,
    updatePaymentDraft,
    removePaymentDraft,
    setVoucherCode,
    setMemberId,
    setRedeemPoints,
    setShowPayment,
    discardDraftScope,
    holdCurrentDraft,
    resumeHeldDraft,
    deleteHeldDraft,
  };
};
