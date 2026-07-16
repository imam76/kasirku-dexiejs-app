import { useEffect, useMemo, useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore, type TransactionError } from '@/store/transactionStore';
import { Contact, MembershipSetting, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getCartItemPrice } from '@/utils/pricing';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { checkout } from '@/services/checkoutService';
import { useI18n } from '@/hooks/useI18n';
import { usePosPaymentMethods } from '@/hooks/usePosPaymentMethods';
import { evaluatePromos, getActivePromos } from '@/services/promoService';
import {
  DEFAULT_MEMBERSHIP_SETTING,
  createRetailMemberFromPos,
  evaluateMembershipCheckoutSync,
  getMembershipSetting,
  type QuickCreateMemberInput,
} from '@/services/membershipService';

const TRANSACTION_PRODUCT_PAGE_SIZE = 9;
const EMPTY_TRANSACTION_PRODUCT_PAGE = {
  products: [] as Product[],
  total: 0,
  currentPage: 1,
};
const FALLBACK_MEMBERSHIP_SETTING: MembershipSetting = {
  ...DEFAULT_MEMBERSHIP_SETTING,
  created_at: '',
  updated_at: '',
};

export const useTransaction = () => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const { t } = useI18n();
  const {
    products,
    cart,
    searchTerm,
    paymentAmount,
    paymentMethodId,
    paymentReference,
    voucherCode,
    memberContactId,
    redeemPoints,
    showPayment,
    setProducts,
    setSearchTerm: setStoreSearchTerm,
    setPaymentAmount,
    setPaymentMethodId,
    setPaymentReference,
    setVoucherCode,
    setMemberContactId,
    setRedeemPoints,
    setShowPayment,
    addToCart: storeAddToCart,
    updateQuantity: storeUpdateQuantity,
    removeFromCart,
    reset,
  } = useTransactionStore();
  const [productPage, setProductPage] = useState(1);
  const { options: paymentMethods, validMethods } = usePosPaymentMethods();
  const selectedPaymentMethod = validMethods.find((method) => method.id === paymentMethodId);
  const productSearchTerm = searchTerm.trim().toLowerCase();

  useEffect(() => {
    if (selectedPaymentMethod || validMethods.length === 0) return;
    const defaultMethod = validMethods.find((method) => method.code.toUpperCase() === 'TUNAI')
      ?? validMethods[0];
    setPaymentMethodId(defaultMethod?.id);
  }, [selectedPaymentMethod, setPaymentMethodId, validMethods]);

  const setSearchTerm = useCallback((value: string) => {
    setProductPage(1);
    setStoreSearchTerm(value);
  }, [setStoreSearchTerm]);

  const productPageResult = useLiveQuery(
    async () => {
      if (productSearchTerm) {
        const matchedProducts = await db.products
          .orderBy('name')
          .filter((product) => (
            product.name.toLowerCase().includes(productSearchTerm) ||
            (product.sku?.toLowerCase() || '').includes(productSearchTerm)
          ))
          .toArray();

        return {
          products: matchedProducts,
          total: matchedProducts.length,
          currentPage: 1,
        };
      }

      const total = await db.products.count();
      const lastPage = Math.max(1, Math.ceil(total / TRANSACTION_PRODUCT_PAGE_SIZE));
      const currentPage = Math.min(productPage, lastPage);
      const offset = (currentPage - 1) * TRANSACTION_PRODUCT_PAGE_SIZE;
      const pageProducts = await db.products
        .orderBy('name')
        .offset(offset)
        .limit(TRANSACTION_PRODUCT_PAGE_SIZE)
        .toArray();

      return {
        products: pageProducts,
        total,
        currentPage,
      };
    },
    [productPage, productSearchTerm],
    EMPTY_TRANSACTION_PRODUCT_PAGE,
  );
  const productTotal = productPageResult.total;

  useEffect(() => {
    setProducts(productPageResult.products);
  }, [productPageResult.products, setProducts]);

  const { data: activePromos = [] } = useQuery({
    queryKey: ['activePromos'],
    queryFn: () => getActivePromos(new Date()),
  });
  const { data: membershipSetting = FALLBACK_MEMBERSHIP_SETTING } = useQuery({
    queryKey: ['membershipSetting'],
    queryFn: getMembershipSetting,
  });
  const activeMembers = useLiveQuery(
    () => db.contacts
      .orderBy('name')
      .filter((contact) => Boolean(contact.is_member && contact.is_active && (contact.membership_status ?? 'ACTIVE') === 'ACTIVE'))
      .toArray(),
    [],
    [] as Contact[],
  );
  const selectedMember = useMemo(
    () => activeMembers.find((member) => member.id === memberContactId) ?? null,
    [activeMembers, memberContactId],
  );
  const createMemberMutation = useMutation({
    mutationFn: createRetailMemberFromPos,
    onSuccess: (member) => {
      setMemberContactId(member.id);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const filteredProducts = products;
  const productPagination = productSearchTerm
    ? undefined
    : {
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

  const getTransactionErrorContent = (error: TransactionError) => {
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

  const addToCart = (product: Product) => {
    const result = storeAddToCart(product);
    if (!result.success && result.error) {
      showTransactionError(result.error);
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    const result = storeUpdateQuantity(productId, newQuantity);
    if (!result.success && result.error) {
      showTransactionError(result.error);
    }
  };

  const updateUnit = (productId: string, newUnit: string) => {
    const storeUpdateUnit = useTransactionStore.getState().updateUnit;
    const result = storeUpdateUnit(productId, newUnit);
    if (!result.success && result.error) {
      showTransactionError(result.error);
    }
  };

  const findProductByScannedCode = useCallback(async (scanCode: string) => {
    const normalizedScanCode = scanCode.trim().toLowerCase();
    if (!normalizedScanCode) return undefined;

    return db.products
      .filter((product) => (product.sku || '').trim().toLowerCase() === normalizedScanCode)
      .first();
  }, []);

  const handleCheckout = async () => {
    const total = membershipPreview.total_after_redeem;
    if (!selectedPaymentMethod) {
      modal.error({
        title: t('payment.invalidTitle'),
        content: t('payment.noMethodAvailable'),
      });
      return;
    }
    if (selectedPaymentMethod.requires_reference && !paymentReference.trim()) {
      modal.error({
        title: t('payment.invalidTitle'),
        content: t('payment.referenceRequired'),
      });
      return;
    }
    const payment = selectedPaymentMethod.category === 'CASH' ? parseFloat(paymentAmount) : total;

    if (isNaN(payment) || payment < total) {
      modal.error({
        title: t('payment.invalidTitle'),
        content: t('payment.invalidContent'),
      });
      return;
    }

    try {
      const checkoutResult = await checkout({
        cart,
        payment,
        paymentMethodId: selectedPaymentMethod.id,
        paymentReference,
        voucherCode,
        memberContactId,
        redeemPoints: Number(redeemPoints || 0),
      });
      const { transaction, items, warnings } = checkoutResult;

      modal.success({
        title: t('checkout.successTitle'),
        content: (
          <div className="text-left space-y-2 mt-4" >
            <p className="text-gray-700">
              <span className="font-semibold"> {t('checkout.transactionNumber')}: </span> {transaction.transaction_number}
            </p>
            <p className="text-gray-700">
              <span className="font-semibold"> {t('checkout.method')}: </span> {transaction.payment_method_name ?? selectedPaymentMethod.name}
            </p>
            {transaction.payment_reference && (
              <p className="text-gray-700">
                <span className="font-semibold">{t('checkout.paymentReference')}:</span> {transaction.payment_reference}
              </p>
            )}
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

      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['membershipSetting'] });
      reset();

      void printReceiptAfterTransaction({ ...transaction, items })
        .then((result) => {
          queryClient.invalidateQueries({ queryKey: ['transactions-history'] });

          if (result.success) {
            message.success(t('checkout.receiptPrinted'));
            return;
          }

          message.warning(result.error || t('checkout.receiptPrintFailed'));
        })
        .catch((error) => {
          console.error('Receipt print process failed:', error);
          message.warning(t('checkout.receiptPrintProcessFailed'));
        });
      
      // Trigger feedback check
      window.dispatchEvent(new Event('check-feedback'));
    } catch (error) {
      console.error('Checkout failed:', error);
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
    }
  };

  return {
    products,
    cart,
    searchTerm,
    paymentAmount,
    paymentMethods,
    paymentMethodId,
    paymentReference,
    voucherCode,
    memberContactId,
    redeemPoints,
    showPayment,
    filteredProducts,
    productPagination,
    promoPreview,
    membershipPreview,
    activeMembers,
    selectedMember,
    membershipSetting,
    createMember: createMemberMutation.mutateAsync as (input: QuickCreateMemberInput) => Promise<Contact>,
    isCreatingMember: createMemberMutation.isPending,
    addToCart,
    updateQuantity,
    updateUnit,
    findProductByScannedCode,
    removeFromCart,
    calculateSubtotal,
    calculateTotal,
    handleCheckout,
    clearCart: reset,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethodId,
    setPaymentReference,
    setVoucherCode,
    setMemberContactId,
    setRedeemPoints,
    setShowPayment,
  };
};
